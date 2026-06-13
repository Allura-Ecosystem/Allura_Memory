"use client"

import { useEffect, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type HandoffStatus = "pending" | "acknowledged" | "rejected"

interface HandoffData {
  id: string
  group_id: string
  work_item_id: string | null
  from_actor_id: string
  to_actor_id: string
  message: string | null
  status: HandoffStatus
  created_at: string
  acknowledged_at: string | null
}

interface HandoffViewProps {
  entityId: string
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<HandoffStatus, string> = {
  pending:      "var(--allura-gold)",
  acknowledged: "var(--allura-green)",
  rejected:     "var(--dashboard-error)",
}

function StatusBadge({ status }: { status: HandoffStatus }) {
  const color = STATUS_COLORS[status]
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "var(--allura-r-full)",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {status}
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ padding: "var(--allura-lg)" }} aria-busy="true" aria-label="Loading handoff details">
      {[70, 80, 100, 60].map((w, i) => (
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

// ── Main view ─────────────────────────────────────────────────────────────────

export function HandoffView({ entityId }: HandoffViewProps) {
  const [handoff, setHandoff] = useState<HandoffData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`/api/handoffs/${entityId}?group_id=allura-system`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<{ handoff: HandoffData }>
      })
      .then(({ handoff: data }) => {
        setHandoff(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load handoff")
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

  if (!handoff) return null

  return (
    <div style={{ padding: "var(--allura-lg)" }}>
      <div style={{ marginBottom: "var(--allura-md)" }}>
        <StatusBadge status={handoff.status} />
      </div>

      {/* Actor flow */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--allura-sm)",
          padding: "var(--allura-sm) 0",
          borderBottom: "1px solid var(--allura-gray-100)",
          marginBottom: "var(--allura-sm)",
          fontSize: "13px",
          color: "var(--dashboard-text-primary)",
        }}
      >
        <span style={{ fontWeight: 500 }}>{handoff.from_actor_id}</span>
        <span style={{ color: "var(--allura-gray-400)" }}>→</span>
        <span style={{ fontWeight: 500 }}>{handoff.to_actor_id}</span>
      </div>

      {handoff.message && (
        <div
          style={{
            padding: "var(--allura-sm)",
            borderRadius: "var(--allura-r-sm)",
            background: "var(--allura-gray-50)",
            border: "1px solid var(--allura-gray-100)",
            fontSize: "13px",
            color: "var(--dashboard-text-secondary)",
            lineHeight: 1.5,
            marginBottom: "var(--allura-md)",
          }}
        >
          {handoff.message}
        </div>
      )}

      {handoff.work_item_id && (
        <Row label="Work Item">
          <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{handoff.work_item_id}</code>
        </Row>
      )}
      <Row label="Created">{fmt(handoff.created_at)}</Row>
      {handoff.acknowledged_at && (
        <Row label="Resolved">{fmt(handoff.acknowledged_at)}</Row>
      )}
      <Row label="ID">
        <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{handoff.id}</code>
      </Row>
    </div>
  )
}
