"use client"

import { useEffect, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemoryProvenance {
  agent_id?: string
  tags?: string[]
  [key: string]: unknown
}

interface MemoryData {
  id: string
  content: string
  score?: number
  source?: string
  provenance?: MemoryProvenance
  user_id?: string
  created_at?: string
  updated_at?: string
  version?: number
  // Fallback metadata bag (older shape)
  metadata?: {
    source?: string
    score?: number
    agent_id?: string
    layer?: string
    status?: string
    [key: string]: unknown
  }
}

interface MemoryViewProps {
  entityId: string
}

// ── Source badge ──────────────────────────────────────────────────────────────

type MemoryLayer = "episodic" | "semantic" | "unknown"

function layerFromData(data: MemoryData): MemoryLayer {
  const src = data.source ?? data.metadata?.source ?? data.metadata?.layer ?? ""
  if (typeof src === "string") {
    if (src.includes("neo4j") || src.includes("semantic")) return "semantic"
    if (src.includes("postgres") || src.includes("episodic")) return "episodic"
  }
  return "unknown"
}

const LAYER_COLORS: Record<MemoryLayer, string> = {
  episodic: "var(--allura-blue)",
  semantic: "var(--c-gold)",
  unknown:  "var(--allura-gray-500)",
}

const LAYER_LABELS: Record<MemoryLayer, string> = {
  episodic: "Episodic",
  semantic: "Semantic",
  unknown:  "Unknown",
}

function LayerBadge({ layer }: { layer: MemoryLayer }) {
  const color = LAYER_COLORS[layer]
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "var(--allura-r-full)",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {LAYER_LABELS[layer]}
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ padding: "var(--allura-lg)" }} aria-busy="true" aria-label="Loading memory details">
      {[80, 100, 65, 90].map((w, i) => (
        <div
          key={i}
          style={{
            height: "14px",
            width: `${w}%`,
            borderRadius: "var(--allura-r-sm)",
            background: "var(--allura-gray-100)",
            marginBottom: "var(--allura-md)",
          }}
        />
      ))}
    </div>
  )
}

// ── Row helper ────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr",
        gap: "var(--allura-sm)",
        padding: "var(--allura-sm) 0",
        borderBottom: "1px solid var(--allura-gray-100)",
        alignItems: "start",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "var(--dashboard-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          paddingTop: "2px",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "13px",
          color: "var(--dashboard-text-primary)",
          wordBreak: "break-word",
        }}
      >
        {children}
      </span>
    </div>
  )
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString()
}

/** Truncate content for preview */
function contentPreview(text: string): string {
  if (text.length <= 400) return text
  return text.slice(0, 400) + "…"
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MemoryView({ entityId }: MemoryViewProps) {
  const [memory, setMemory] = useState<MemoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`/api/memory/${entityId}?group_id=allura-system`)
      .then(async (res) => {
        if (!res.ok && res.status !== 206) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        // 200/206 — the response IS the MemoryGetResponse directly
        return res.json() as Promise<MemoryData>
      })
      .then((data) => {
        setMemory(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load memory")
        setLoading(false)
      })
  }, [entityId])

  if (loading) return <Skeleton />

  if (error) {
    return (
      <div
        style={{ padding: "var(--allura-lg)", color: "var(--dashboard-error)", fontSize: "13px" }}
        role="alert"
      >
        {error}
      </div>
    )
  }

  if (!memory) return null

  const layer = layerFromData(memory)
  const agentId = memory.provenance?.agent_id ?? memory.metadata?.agent_id ?? memory.user_id
  const score = memory.score ?? memory.metadata?.score
  const createdAt = memory.created_at
  const status = memory.metadata?.status
  const version = memory.version

  return (
    <div style={{ padding: "var(--allura-lg)" }}>
      <div style={{ display: "flex", gap: "var(--allura-sm)", marginBottom: "var(--allura-md)", flexWrap: "wrap" }}>
        <LayerBadge layer={layer} />
        {status && (
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: "var(--allura-r-full)",
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--allura-gray-500)",
              background: "var(--allura-gray-50)",
              border: "1px solid var(--allura-gray-200)",
            }}
          >
            {String(status)}
          </span>
        )}
      </div>

      {/* Content preview */}
      <div
        style={{
          padding: "var(--allura-sm)",
          borderRadius: "var(--allura-r-sm)",
          background: "var(--allura-gray-50)",
          border: "1px solid var(--allura-gray-100)",
          fontSize: "13px",
          color: "var(--dashboard-text-primary)",
          lineHeight: 1.6,
          marginBottom: "var(--allura-md)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {contentPreview(memory.content)}
      </div>

      {score !== undefined && (
        <Row label="Score">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
            {typeof score === "number" ? score.toFixed(4) : String(score)}
          </span>
        </Row>
      )}
      {agentId && <Row label="Agent">{agentId}</Row>}
      {version !== undefined && <Row label="Version">v{version}</Row>}
      {createdAt && <Row label="Created">{fmt(createdAt)}</Row>}
      <Row label="ID">
        <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{memory.id}</code>
      </Row>
    </div>
  )
}
