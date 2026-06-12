import type { Metadata } from "next"

import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"
import { getPool } from "@/lib/postgres/connection"

export const metadata: Metadata = {
  title: "Work Board",
}

export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

const COLUMNS = [
  { key: "backlog", label: "Backlog", color: "var(--allura-gray-500)" },
  { key: "ready", label: "Ready", color: "var(--allura-blue)" },
  { key: "in_progress", label: "In Progress", color: "var(--allura-green)" },
  { key: "in_review", label: "In Review", color: "var(--allura-gold)" },
  { key: "blocked", label: "Blocked", color: "var(--allura-red)" },
  { key: "done", label: "Done", color: "var(--allura-green)" },
] as const

type ColumnKey = (typeof COLUMNS)[number]["key"]

const PRIORITY_COLOR: Record<string, string> = {
  critical: "var(--allura-red)",
  high: "var(--allura-orange)",
  medium: "var(--allura-gold)",
  low: "var(--allura-gray-500)",
}

interface WorkItemRow {
  id: string
  title: string
  status: string
  priority: string
  owner_id: string | null
  project_id: string
  project_name: string | null
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLOR[priority] ?? "var(--allura-gray-500)"
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "10px",
        fontWeight: 600,
        color,
        textTransform: "capitalize",
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        padding: "1px 6px",
        borderRadius: "999px",
        border: `1px solid ${color}`,
        width: "fit-content",
      }}
    >
      {priority}
    </span>
  )
}

export default async function WorkBoardPage() {
  let allItems: WorkItemRow[] = []
  let errorMessage: string | null = null
  let isDegraded = false

  try {
    const pool = getPool()
    const result = await pool.query<WorkItemRow>(
      `SELECT
         wi.id,
         wi.title,
         wi.status,
         wi.priority,
         wi.owner_id,
         wi.project_id,
         p.name AS project_name
       FROM work_items wi
       LEFT JOIN projects p ON p.id = wi.project_id AND p.group_id = $1
       WHERE wi.group_id = $1
         AND wi.status NOT IN ('cancelled')
       ORDER BY wi.updated_at DESC`,
      [GROUP_ID]
    )
    allItems = result.rows
  } catch (err) {
    if (isConnectionError(err)) {
      isDegraded = true
    } else {
      errorMessage = err instanceof Error ? err.message : "Unknown query error"
    }
  }

  const isEmpty = !isDegraded && errorMessage === null && allItems.length === 0

  // Group by status
  const grouped = new Map<ColumnKey, WorkItemRow[]>()
  for (const col of COLUMNS) {
    grouped.set(col.key, [])
  }
  for (const item of allItems) {
    const key = item.status as ColumnKey
    if (grouped.has(key)) {
      grouped.get(key)!.push(item)
    }
  }

  return (
    <div style={{ padding: "32px" }}>
      {/* Page header */}
      <div style={{ marginBottom: "24px" }}>
        <p
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--allura-blue)",
            margin: "0 0 8px",
          }}
        >
          Work Plane
        </p>
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--allura-charcoal)",
            letterSpacing: "-0.01em",
            margin: "0 0 4px",
          }}
        >
          Work Board
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          All active work items across projects, grouped by status.
        </p>
      </div>

      {/* State messaging */}
      {(isDegraded || errorMessage !== null || isEmpty) && (
        <div
          style={{
            padding: "16px",
            background: "var(--allura-paper)",
            border: `1px solid ${isDegraded || errorMessage ? "var(--allura-red)" : "var(--allura-cream)"}`,
            borderRadius: "10px",
            marginBottom: "24px",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "var(--allura-charcoal)",
              margin: "0 0 4px",
              fontWeight: 600,
            }}
          >
            {isDegraded
              ? "Cannot load work items. Check PostgreSQL connectivity."
              : errorMessage !== null
                ? "Work board query failed."
                : "No work items across any project. Create a project first."}
          </p>
          {errorMessage !== null && (
            <p style={{ fontSize: "12px", color: "var(--allura-red)", margin: "0" }}>
              {errorMessage}
            </p>
          )}
        </div>
      )}

      {/* Status strip */}
      {allItems.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "24px",
            flexWrap: "wrap",
          }}
        >
          {COLUMNS.map((col) => {
            const count = grouped.get(col.key)?.length ?? 0
            return (
              <div
                key={col.key}
                style={{
                  padding: "10px 14px",
                  background: "var(--allura-paper)",
                  border: "1px solid var(--allura-cream)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: col.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "12px", color: "var(--allura-charcoal)", fontWeight: 500 }}>
                  {col.label}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--allura-gray-500)",
                    fontFamily: '"IBM Plex Mono", monospace',
                    background: "rgba(17, 24, 39, 0.06)",
                    borderRadius: "99px",
                    padding: "1px 6px",
                  }}
                >
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Columnar board */}
      {allItems.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(200px, 1fr))",
            gap: "14px",
            overflowX: "auto",
            paddingBottom: "8px",
          }}
        >
          {COLUMNS.map((col) => {
            const items = grouped.get(col.key) ?? []
            return (
              <div
                key={col.key}
                style={{
                  background: "var(--allura-paper)",
                  border: "1px solid var(--allura-cream)",
                  borderRadius: "10px",
                  padding: "14px",
                  minHeight: "240px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {/* Column header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: col.color,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {col.label}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--allura-gray-500)",
                      background: "rgba(17, 24, 39, 0.06)",
                      borderRadius: "99px",
                      padding: "1px 7px",
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                  >
                    {items.length}
                  </span>
                </div>

                {/* Cards */}
                {items.length === 0 ? (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--allura-gray-500)" }}>Empty</span>
                  </div>
                ) : (
                  items.map((item) => (
                    <a
                      key={item.id}
                      href={`/dashboard/work-board/${item.id}`}
                      style={{
                        display: "block",
                        textDecoration: "none",
                        padding: "10px 12px",
                        background: "var(--allura-cream)",
                        border: "1px solid rgba(17, 24, 39, 0.08)",
                        borderRadius: "8px",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "13px",
                          fontWeight: 500,
                          color: "var(--allura-charcoal)",
                          margin: "0 0 6px",
                          lineHeight: "1.3",
                        }}
                      >
                        {item.title}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        {item.project_name && (
                          <span
                            style={{
                              fontSize: "10px",
                              color: "var(--allura-blue)",
                              fontWeight: 500,
                            }}
                          >
                            {item.project_name}
                          </span>
                        )}
                        <PriorityBadge priority={item.priority} />
                        {item.owner_id && (
                          <span style={{ fontSize: "10px", color: "var(--allura-gray-500)" }}>
                            {item.owner_id}
                          </span>
                        )}
                      </div>
                    </a>
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
