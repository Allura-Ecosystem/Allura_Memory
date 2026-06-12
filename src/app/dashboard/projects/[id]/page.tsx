import type { Metadata } from "next"

import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"
import { getPool } from "@/lib/postgres/connection"

export const metadata: Metadata = {
  title: "Project Detail",
}

export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

const PROJECT_STATUS_COLOR: Record<string, string> = {
  active: "var(--allura-green)",
  paused: "var(--allura-gold)",
  archived: "var(--allura-gray-500)",
}

const WORK_STATUS_COLOR: Record<string, string> = {
  backlog: "var(--allura-gray-500)",
  ready: "var(--allura-blue)",
  in_progress: "var(--allura-green)",
  in_review: "var(--allura-gold)",
  blocked: "var(--allura-red)",
  done: "var(--allura-green)",
  cancelled: "var(--allura-gray-500)",
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: "var(--allura-red)",
  high: "var(--allura-orange)",
  medium: "var(--allura-gold)",
  low: "var(--allura-gray-500)",
}

interface ProjectRow {
  id: string
  name: string
  description: string | null
  status: string
  owner_id: string | null
  team_id: string | null
  created_at: string
  updated_at: string
}

interface WorkItemRow {
  id: string
  title: string
  status: string
  priority: string
  owner_id: string | null
  lane_id: string | null
  updated_at: string
}

function StatusBadge({ status, colorMap }: { status: string; colorMap: Record<string, string> }) {
  const color = colorMap[status] ?? "var(--allura-gray-500)"
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "11px",
        fontWeight: 600,
        color,
        textTransform: "capitalize",
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        padding: "2px 8px",
        borderRadius: "999px",
        border: `1px solid ${color}`,
        width: "fit-content",
        whiteSpace: "nowrap",
      }}
    >
      {status.replace(/_/g, " ")}
    </span>
  )
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString()
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let project: ProjectRow | null = null
  let workItems: WorkItemRow[] = []
  let errorMessage: string | null = null
  let isDegraded = false

  try {
    const pool = getPool()

    const [projectResult, workResult] = await Promise.all([
      pool.query<ProjectRow>(
        `SELECT id, name, description, status, owner_id, team_id, created_at, updated_at
         FROM projects
         WHERE id = $1 AND group_id = $2`,
        [id, GROUP_ID]
      ),
      pool.query<WorkItemRow>(
        `SELECT id, title, status, priority, owner_id, lane_id, updated_at
         FROM work_items
         WHERE project_id = $1 AND group_id = $2
         ORDER BY updated_at DESC`,
        [id, GROUP_ID]
      ),
    ])

    project = projectResult.rows[0] ?? null
    workItems = workResult.rows
  } catch (err) {
    if (isConnectionError(err)) {
      isDegraded = true
    } else {
      errorMessage = err instanceof Error ? err.message : "Unknown query error"
    }
  }

  // Count strip
  const counts = {
    total: workItems.length,
    backlog: workItems.filter((w) => w.status === "backlog").length,
    in_progress: workItems.filter((w) => w.status === "in_progress").length,
    in_review: workItems.filter((w) => w.status === "in_review").length,
    done: workItems.filter((w) => w.status === "done").length,
  }

  return (
    <div style={{ padding: "32px" }}>
      {/* Back link */}
      <a
        href="/dashboard/projects"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          color: "var(--allura-blue)",
          textDecoration: "none",
          marginBottom: "20px",
        }}
      >
        &larr; Projects
      </a>

      {/* Error / degraded state */}
      {(isDegraded || errorMessage !== null) && (
        <div
          style={{
            padding: "16px",
            background: "var(--allura-paper)",
            border: "1px solid var(--allura-red)",
            borderRadius: "10px",
            marginBottom: "24px",
            width: "min(100%, 900px)",
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
              ? "Cannot load project. Check PostgreSQL connectivity."
              : "Project query failed."}
          </p>
          {errorMessage !== null && (
            <p style={{ fontSize: "12px", color: "var(--allura-red)", margin: "0" }}>
              {errorMessage}
            </p>
          )}
        </div>
      )}

      {/* Not found state */}
      {!isDegraded && errorMessage === null && project === null && (
        <div
          style={{
            padding: "16px",
            background: "var(--allura-paper)",
            border: "1px solid var(--allura-cream)",
            borderRadius: "10px",
            marginBottom: "24px",
            width: "min(100%, 900px)",
          }}
        >
          <p style={{ fontSize: "14px", color: "var(--allura-charcoal)", margin: "0", fontWeight: 600 }}>
            Project not found.
          </p>
        </div>
      )}

      {/* Project header */}
      {project !== null && (
        <>
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
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
              <h1
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--allura-charcoal)",
                  letterSpacing: "-0.01em",
                  margin: "0",
                }}
              >
                {project.name}
              </h1>
              <StatusBadge status={project.status} colorMap={PROJECT_STATUS_COLOR} />
            </div>
            {project.description && (
              <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0 0 8px" }}>
                {project.description}
              </p>
            )}
            <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--allura-gray-500)" }}>
              {project.owner_id && (
                <span>
                  Owner:{" "}
                  <span style={{ color: "var(--allura-charcoal)" }}>{project.owner_id}</span>
                </span>
              )}
              {project.team_id && (
                <span>
                  Team:{" "}
                  <span style={{ color: "var(--allura-charcoal)" }}>{project.team_id}</span>
                </span>
              )}
              <span>Updated {relativeTime(project.updated_at)}</span>
            </div>
          </div>

          {/* Count strip */}
          <div style={{ marginBottom: "24px", width: "min(100%, 900px)" }}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--allura-blue)",
                margin: "0 0 12px",
              }}
            >
              Work Item Counts
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              {(
                [
                  { label: "Total", value: counts.total, color: "var(--allura-charcoal)" },
                  { label: "Backlog", value: counts.backlog, color: "var(--allura-gray-500)" },
                  { label: "In Progress", value: counts.in_progress, color: "var(--allura-green)" },
                  { label: "In Review", value: counts.in_review, color: "var(--allura-gold)" },
                  { label: "Done", value: counts.done, color: "var(--allura-green)" },
                ] as const
              ).map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: "14px",
                    background: "var(--allura-paper)",
                    border: "1px solid var(--allura-cream)",
                    borderRadius: "10px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--allura-gray-500)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                  >
                    {stat.label}
                  </span>
                  <span style={{ fontSize: "22px", fontWeight: 700, color: stat.color }}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Work items section */}
          <div style={{ width: "min(100%, 900px)" }}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--allura-blue)",
                margin: "0 0 12px",
              }}
            >
              Work Items
            </p>

            {workItems.length === 0 ? (
              <div
                style={{
                  padding: "24px",
                  background: "var(--allura-paper)",
                  border: "1px solid var(--allura-cream)",
                  borderRadius: "10px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: "13px", color: "var(--allura-gray-500)", margin: "0" }}>
                  No work items in this project yet.
                </p>
              </div>
            ) : (
              <div
                style={{
                  background: "var(--allura-paper)",
                  border: "1px solid var(--allura-cream)",
                  borderRadius: "10px",
                  overflow: "hidden",
                }}
              >
                {/* Table header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 90px 80px 1fr 1fr 1fr",
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--allura-cream)",
                  }}
                >
                  {["Title", "Status", "Priority", "Owner", "Lane", "Updated"].map((h) => (
                    <span
                      key={h}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--allura-gray-500)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontFamily: '"IBM Plex Mono", monospace',
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Table rows */}
                {workItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 90px 80px 1fr 1fr 1fr",
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--allura-cream)",
                      alignItems: "center",
                    }}
                  >
                    <a
                      href={`/dashboard/work-board/${item.id}`}
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--allura-blue)",
                        textDecoration: "none",
                      }}
                    >
                      {item.title}
                    </a>
                    <StatusBadge status={item.status} colorMap={WORK_STATUS_COLOR} />
                    <StatusBadge status={item.priority} colorMap={PRIORITY_COLOR} />
                    <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                      {item.owner_id ?? "—"}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                      {item.lane_id ?? "—"}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                      {relativeTime(item.updated_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
