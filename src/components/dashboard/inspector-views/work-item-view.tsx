"use client"

import { useEffect, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkItemStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled"

type WorkItemPriority = "critical" | "high" | "medium" | "low"

interface WorkItemData {
  id: string
  project_id: string
  lane_id: string | null
  group_id: string
  title: string
  description: string | null
  status: WorkItemStatus
  priority: WorkItemPriority
  owner_id: string | null
  team_id: string | null
  acceptance_criteria: unknown[]
  linked_run_id: string | null
  blocker: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

interface WorkItemViewProps {
  entityId: string
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<WorkItemStatus, string> = {
  backlog:     "var(--allura-gray-500)",
  ready:       "var(--allura-blue)",
  in_progress: "var(--allura-blue)",
  in_review:   "var(--allura-gold)",
  blocked:     "var(--dashboard-error, #c0392b)",
  done:        "var(--allura-green)",
  cancelled:   "var(--allura-gray-500)",
}

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  backlog:     "Backlog",
  ready:       "Ready",
  in_progress: "In Progress",
  in_review:   "In Review",
  blocked:     "Blocked",
  done:        "Done",
  cancelled:   "Cancelled",
}

const PRIORITY_COLORS: Record<WorkItemPriority, string> = {
  critical: "var(--dashboard-error, #c0392b)",
  high:     "var(--allura-orange)",
  medium:   "var(--allura-gold)",
  low:      "var(--allura-gray-500)",
}

function StatusBadge({ status }: { status: WorkItemStatus }) {
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
      {STATUS_LABELS[status]}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: WorkItemPriority }) {
  const color = PRIORITY_COLORS[priority]
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "var(--allura-r-full)",
        fontSize: "11px",
        fontWeight: 500,
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {priority}
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ padding: "var(--allura-lg)" }} aria-busy="true" aria-label="Loading work item details">
      {[90, 70, 100, 60, 80].map((w, i) => (
        <div
          key={i}
          style={{
            height: "14px",
            width: `${w}%`,
            borderRadius: "var(--allura-r-sm)",
            background: "var(--allura-gray-100, #f3f4f6)",
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
        borderBottom: "1px solid var(--allura-gray-100, #f3f4f6)",
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

export function WorkItemView({ entityId }: WorkItemViewProps) {
  const [item, setItem] = useState<WorkItemData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`/api/work-items/${entityId}?group_id=allura-system`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<{ work_item: WorkItemData }>
      })
      .then(({ work_item }) => {
        setItem(work_item)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load work item")
        setLoading(false)
      })
  }, [entityId])

  if (loading) return <Skeleton />

  if (error) {
    return (
      <div
        style={{ padding: "var(--allura-lg)", color: "var(--dashboard-error, #c0392b)", fontSize: "13px" }}
        role="alert"
      >
        {error}
      </div>
    )
  }

  if (!item) return null

  return (
    <div style={{ padding: "var(--allura-lg)" }}>
      <div style={{ marginBottom: "var(--allura-sm)" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--dashboard-text-primary)",
            lineHeight: 1.4,
            marginBottom: "var(--allura-sm)",
          }}
        >
          {item.title}
        </h3>
        <div style={{ display: "flex", gap: "var(--allura-sm)", flexWrap: "wrap" }}>
          <StatusBadge status={item.status} />
          <PriorityBadge priority={item.priority} />
        </div>
      </div>

      {item.description && (
        <p
          style={{
            fontSize: "13px",
            color: "var(--dashboard-text-secondary)",
            lineHeight: 1.5,
            margin: "var(--allura-md) 0",
          }}
        >
          {item.description}
        </p>
      )}

      <Row label="Project">
        <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{item.project_id}</code>
      </Row>
      {item.owner_id && <Row label="Owner">{item.owner_id}</Row>}
      {item.team_id && <Row label="Team">{item.team_id}</Row>}
      {item.linked_run_id && (
        <Row label="Run">
          <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{item.linked_run_id}</code>
        </Row>
      )}
      {item.blocker && (
        <Row label="Blocker">
          <span style={{ color: "var(--dashboard-error, #c0392b)" }}>{item.blocker}</span>
        </Row>
      )}
      {item.acceptance_criteria.length > 0 && (
        <Row label="Criteria">
          <span>{item.acceptance_criteria.length} items</span>
        </Row>
      )}
      <Row label="Created">{fmt(item.created_at)}</Row>
      {item.completed_at && <Row label="Completed">{fmt(item.completed_at)}</Row>}
      <Row label="ID">
        <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{item.id}</code>
      </Row>
    </div>
  )
}
