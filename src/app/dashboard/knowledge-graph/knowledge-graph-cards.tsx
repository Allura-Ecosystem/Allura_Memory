"use client"

import { useEffect, useState } from "react"

// ── API response shape (mirrors /api/memory/graph) ────────────────────────────

interface ApiNode {
  id: string
  label: string
  type: string
  metadata?: Record<string, unknown>
}

interface ApiEdge {
  id: string
  source: string
  target: string
  label: string
  metadata?: Record<string, unknown>
}

interface GraphApiResponse {
  nodes: ApiNode[]
  edges: ApiEdge[]
  total_edges: number
  node_count?: number
  degraded?: boolean
  source?: string
  warning?: string
}

// ── Node type colors (warm wire-frame palette) ────────────────────────────────

function typeAccent(type: string): { bg: string; border: string; label: string } {
  switch (type.toLowerCase()) {
    case "agent":   return { bg: "rgba(37,99,235,0.07)", border: "#2563eb", label: "#2563eb" }
    case "project": return { bg: "rgba(124,58,237,0.07)", border: "#7c3aed", label: "#7c3aed" }
    case "insight": return { bg: "rgba(22,163,74,0.07)", border: "#16a34a", label: "#16a34a" }
    case "event":   return { bg: "rgba(234,88,12,0.07)", border: "#ea580c", label: "#ea580c" }
    case "system":  return { bg: "rgba(15,23,42,0.05)", border: "#374151", label: "#374151" }
    default:        return { bg: "rgba(124,58,237,0.05)", border: "#9ca3af", label: "#6b7280" }
  }
}

// ── Node card ─────────────────────────────────────────────────────────────────

function NodeCard({
  node,
  edges,
}: {
  node: ApiNode
  edges: ApiEdge[]
}) {
  const accent = typeAccent(node.type)
  const connections = edges.filter((e) => e.source === node.id || e.target === node.id)
  const createdAt = node.metadata?.created_at
    ? String(node.metadata.created_at).slice(0, 10)
    : null
  const confidence =
    typeof node.metadata?.confidence === "number"
      ? (node.metadata.confidence as number).toFixed(2)
      : null

  return (
    <div
      style={{
        background: "#ffffff",
        border: `1px solid ${accent.border}`,
        borderRadius: 12,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        borderLeft: `4px solid ${accent.border}`,
        position: "relative",
      }}
    >
      {/* Type badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: accent.label,
            background: accent.bg,
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          {node.type}
        </span>
        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: '"IBM Plex Mono", monospace' }}>
          {String(node.id).slice(0, 12)}
        </span>
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#1a1a1a",
          lineHeight: 1.3,
          wordBreak: "break-word",
        }}
      >
        {node.label}
      </div>

      {/* Metadata row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 2 }}>
        {confidence !== null && (
          <MetaChip label="confidence" value={confidence} color="#16a34a" />
        )}
        {createdAt && (
          <MetaChip label="date" value={createdAt} color="#6b7280" />
        )}
        <MetaChip label="connections" value={String(connections.length)} color="#6b7280" />
      </div>

      {/* Edge list */}
      {connections.length > 0 && (
        <div style={{ marginTop: 4, borderTop: "1px solid #f0ece0", paddingTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
            Relationships
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {connections.slice(0, 4).map((e) => {
              const isSource = e.source === node.id
              const otherId = isSource ? e.target : e.source
              return (
                <div key={e.id} style={{ fontSize: 11, color: "#6b7280", display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: accent.label, fontWeight: 600, fontSize: 10 }}>
                    {isSource ? "→" : "←"}
                  </span>
                  <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: "#9ca3af" }}>
                    {e.label}
                  </span>
                  <span style={{ color: "#374151", fontSize: 11 }}>
                    {String(otherId).slice(0, 20)}
                  </span>
                </div>
              )
            })}
            {connections.length > 4 && (
              <div style={{ fontSize: 10, color: "#9ca3af" }}>
                +{connections.length - 4} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetaChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
      <span style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color, fontFamily: '"IBM Plex Mono", monospace' }}>{value}</span>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ degraded, groupId }: { degraded: boolean; groupId: string }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e8e3d8",
        borderRadius: 12,
        padding: "48px 32px",
        textAlign: "center",
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "rgba(124,58,237,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" />
          <circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" />
          <path d="M9.5 10.5 5.5 7.5M14.5 10.5l4-3M9.5 13.5 5.5 16.5M14.5 13.5l4 3" />
        </svg>
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
        {degraded ? "Graph unavailable" : "No nodes yet"}
      </h3>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px", lineHeight: 1.6 }}>
        {degraded
          ? "Neo4j could not be reached. The graph is shown when the Allura Brain stack is running."
          : `No Knowledge Graph nodes exist for ${groupId} yet. Promote episodic memories to canonical to populate the graph.`}
      </p>
      <div
        style={{
          fontSize: 11,
          color: "#9ca3af",
          fontFamily: '"IBM Plex Mono", monospace',
          padding: "6px 12px",
          background: "#faf7f0",
          borderRadius: 6,
          display: "inline-block",
        }}
      >
        group_id: {groupId}
      </div>
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export default function KnowledgeGraphCards({ groupId }: { groupId: string }) {
  const [nodes, setNodes] = useState<ApiNode[]>([])
  const [edges, setEdges] = useState<ApiEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [source, setSource] = useState<string>("neo4j")
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      try {
        const res = await fetch(`/api/memory/graph?group_id=${encodeURIComponent(groupId)}`, {
          headers: { "x-allura-group-id": groupId },
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        const data = (await res.json()) as GraphApiResponse
        if (cancelled) return
        if (data.degraded) setDegraded(true)
        if (data.source) setSource(data.source)
        setNodes(data.nodes ?? [])
        setEdges(data.edges ?? [])
        setNodeCount(data.node_count ?? (data.nodes ?? []).length)
        setEdgeCount(data.total_edges ?? (data.edges ?? []).length)
      } catch (err) {
        if (!cancelled) {
          const isTimeout = err instanceof Error && err.name === "AbortError"
          setError(isTimeout ? "Couldn't reach the graph — retry" : (err instanceof Error ? err.message : "Failed to load graph"))
          setDegraded(true)
        }
      } finally {
        clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [groupId, retryKey])

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 32px",
          color: "#6b7280",
          fontSize: 14,
          gap: 10,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.6 }}>
          <circle cx="12" cy="12" r="3" />
          <circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" />
          <circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" />
          <path d="M9.5 10.5 5.5 7.5M14.5 10.5l4-3M9.5 13.5 5.5 16.5M14.5 13.5l4 3" />
        </svg>
        Loading knowledge graph…
      </div>
    )
  }

  // Error state with retry — never leave the user on a permanent loading screen
  if (error && nodes.length === 0) {
    return (
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #fca5a5",
          borderRadius: 12,
          padding: "40px 32px",
          textAlign: "center",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "#b91c1c", marginBottom: 8 }}>
          Couldn&apos;t reach the graph
        </div>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
          {error}
        </p>
        <button
          onClick={() => { setError(null); setDegraded(false); setRetryKey((k) => k + 1); }}
          style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          Retry
        </button>
      </div>
    )
  }

  const isEmpty = nodes.length === 0

  return (
    <div>
      {/* Stats bar */}
      {!isEmpty && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
          <StatPill label="nodes" value={nodeCount} />
          <StatPill label="edges" value={edgeCount} />
          {degraded && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#ea580c",
                background: "rgba(234,88,12,0.08)",
                padding: "4px 10px",
                borderRadius: 999,
              }}
            >
              Degraded ({source})
            </span>
          )}
          {error && (
            <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>
          )}
        </div>
      )}

      {isEmpty ? (
        <EmptyState degraded={degraded || !!error} groupId={groupId} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} edges={edges} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e8e3d8",
        borderRadius: 8,
        padding: "5px 12px",
        display: "flex",
        gap: 6,
        alignItems: "baseline",
      }}
    >
      <strong style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </strong>
      <span style={{ fontSize: 11, color: "#9ca3af" }}>{label}</span>
    </div>
  )
}
