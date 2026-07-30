"use client"

import { useEffect, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type EvidencePacketType =
  | "general"
  | "gate_result"
  | "review"
  | "approval"
  | "test_result"
  | "audit"

interface EvidenceData {
  id: string
  group_id: string
  work_item_id: string | null
  run_id: string | null
  step_id: string | null
  actor_id: string
  packet_type: EvidencePacketType
  content: Record<string, unknown>
  artifact_refs: string[]
  created_at: string
}

interface EvidenceViewProps {
  entityId: string
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<EvidencePacketType, string> = {
  general:     "var(--allura-gray-500)",
  gate_result: "var(--allura-blue)",
  review:      "var(--c-gold)",
  approval:    "var(--allura-green)",
  test_result: "var(--allura-blue)",
  audit:       "var(--allura-orange)",
}

const TYPE_LABELS: Record<EvidencePacketType, string> = {
  general:     "General",
  gate_result: "Gate Result",
  review:      "Review",
  approval:    "Approval",
  test_result: "Test Result",
  audit:       "Audit",
}

function TypeBadge({ type }: { type: EvidencePacketType }) {
  const color = TYPE_COLORS[type]
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
      {TYPE_LABELS[type]}
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ padding: "var(--allura-lg)" }} aria-busy="true" aria-label="Loading evidence details">
      {[70, 90, 100, 60, 80].map((w, i) => (
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

/** Truncate and stringify content for preview */
function contentPreview(content: Record<string, unknown>): string {
  const str = JSON.stringify(content, null, 2)
  if (str.length <= 300) return str
  return str.slice(0, 300) + "…"
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function EvidenceView({ entityId }: EvidenceViewProps) {
  const [evidence, setEvidence] = useState<EvidenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`/api/evidence/${entityId}?group_id=allura-system`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<{ evidence: EvidenceData }>
      })
      .then(({ evidence: data }) => {
        setEvidence(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load evidence")
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

  if (!evidence) return null

  return (
    <div style={{ padding: "var(--allura-lg)" }}>
      <div style={{ marginBottom: "var(--allura-md)" }}>
        <TypeBadge type={evidence.packet_type} />
      </div>

      <Row label="Actor">{evidence.actor_id}</Row>
      {evidence.work_item_id && (
        <Row label="Work Item">
          <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{evidence.work_item_id}</code>
        </Row>
      )}
      {evidence.run_id && (
        <Row label="Run">
          <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{evidence.run_id}</code>
        </Row>
      )}
      {evidence.step_id && (
        <Row label="Step">
          <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{evidence.step_id}</code>
        </Row>
      )}
      {evidence.artifact_refs.length > 0 && (
        <Row label="Artifacts">{evidence.artifact_refs.length} refs</Row>
      )}
      <Row label="Created">{fmt(evidence.created_at)}</Row>

      <div style={{ marginTop: "var(--allura-md)" }}>
        <p
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "var(--dashboard-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "var(--allura-sm)",
          }}
        >
          Content
        </p>
        <pre
          style={{
            margin: 0,
            padding: "var(--allura-sm)",
            borderRadius: "var(--allura-r-sm)",
            background: "var(--allura-gray-50)",
            border: "1px solid var(--allura-gray-100)",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--dashboard-text-primary)",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {contentPreview(evidence.content)}
        </pre>
      </div>

      <div style={{ marginTop: "var(--allura-md)" }}>
        <Row label="ID">
          <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{evidence.id}</code>
        </Row>
      </div>
    </div>
  )
}
