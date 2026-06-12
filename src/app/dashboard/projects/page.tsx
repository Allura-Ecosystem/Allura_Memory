import type { Metadata } from "next"

import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"
import { getPool } from "@/lib/postgres/connection"

export const metadata: Metadata = {
  title: "Projects",
}

export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

const STATUS_COLOR: Record<string, string> = {
  active: "var(--allura-green)",
  paused: "var(--allura-gold)",
  archived: "var(--allura-gray-500)",
}

interface ProjectRow {
  id: string
  name: string
  description: string | null
  status: string
  owner_id: string | null
  team_id: string | null
  updated_at: string
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

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "var(--allura-gray-500)"
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
      }}
    >
      {status}
    </span>
  )
}

export default async function ProjectsPage() {
  let projects: ProjectRow[] = []
  let errorMessage: string | null = null
  let isDegraded = false

  try {
    const pool = getPool()
    const result = await pool.query<ProjectRow>(
      `SELECT id, name, description, status, owner_id, team_id, updated_at
       FROM projects
       WHERE group_id = $1 AND status != 'archived'
       ORDER BY updated_at DESC
       LIMIT 50`,
      [GROUP_ID]
    )
    projects = result.rows
  } catch (err) {
    if (isConnectionError(err)) {
      isDegraded = true
    } else {
      errorMessage = err instanceof Error ? err.message : "Unknown query error"
    }
  }

  const isEmpty = !isDegraded && errorMessage === null && projects.length === 0

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
          Projects
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Active projects for this tenant. Archived projects are excluded.
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
              ? "Cannot load projects. Check PostgreSQL connectivity."
              : errorMessage !== null
                ? "Projects query failed."
                : "No projects yet. Create one to start organizing work."}
          </p>
          {errorMessage !== null && (
            <p style={{ fontSize: "12px", color: "var(--allura-red)", margin: "0" }}>
              {errorMessage}
            </p>
          )}
        </div>
      )}

      {/* Projects table */}
      {projects.length > 0 && (
        <div
          style={{
            background: "var(--allura-paper)",
            border: "1px solid var(--allura-cream)",
            borderRadius: "10px",
            overflow: "hidden",
            width: "min(100%, 900px)",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 80px 1fr 1fr 1fr",
              padding: "10px 16px",
              borderBottom: "1px solid var(--allura-cream)",
            }}
          >
            {["Name", "Status", "Owner", "Team", "Updated"].map((h) => (
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
          {projects.map((project) => (
            <div
              key={project.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 80px 1fr 1fr 1fr",
                padding: "12px 16px",
                borderBottom: "1px solid var(--allura-cream)",
                alignItems: "center",
              }}
            >
              <a
                href={`/dashboard/projects/${project.id}`}
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--allura-blue)",
                  textDecoration: "none",
                }}
              >
                {project.name}
              </a>
              <StatusBadge status={project.status} />
              <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                {project.owner_id ?? "—"}
              </span>
              <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                {project.team_id ?? "—"}
              </span>
              <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                {relativeTime(project.updated_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
