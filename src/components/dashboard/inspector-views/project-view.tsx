"use client"

import { useEffect, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type ProjectStatus = "active" | "archived" | "paused"

interface ProjectData {
  id: string
  group_id: string
  name: string
  description: string | null
  status: ProjectStatus
  owner_id: string | null
  team_id: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

interface ProjectViewProps {
  entityId: string
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ProjectStatus, string> = {
  active:   "var(--allura-green)",
  paused:   "var(--allura-gold)",
  archived: "var(--allura-gray-500)",
}

function StatusBadge({ status }: { status: ProjectStatus }) {
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
    <div style={{ padding: "var(--allura-lg)" }} aria-busy="true" aria-label="Loading project details">
      {[85, 60, 100, 75].map((w, i) => (
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

export function ProjectView({ entityId }: ProjectViewProps) {
  const [project, setProject] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`/api/projects/${entityId}?group_id=allura-system`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<{ project: ProjectData }>
      })
      .then(({ project: data }) => {
        setProject(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load project")
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

  if (!project) return null

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
          {project.name}
        </h3>
        <StatusBadge status={project.status} />
        {project.archived_at && (
          <span
            style={{
              marginLeft: "var(--allura-sm)",
              fontSize: "11px",
              color: "var(--allura-gray-500)",
            }}
          >
            Archived {fmt(project.archived_at)}
          </span>
        )}
      </div>

      {project.description && (
        <p
          style={{
            fontSize: "13px",
            color: "var(--dashboard-text-secondary)",
            lineHeight: 1.5,
            margin: "var(--allura-md) 0",
          }}
        >
          {project.description}
        </p>
      )}

      {project.owner_id && <Row label="Owner">{project.owner_id}</Row>}
      {project.team_id && <Row label="Team">{project.team_id}</Row>}
      <Row label="Created">{fmt(project.created_at)}</Row>
      <Row label="Updated">{fmt(project.updated_at)}</Row>
      <Row label="ID">
        <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{project.id}</code>
      </Row>
    </div>
  )
}
