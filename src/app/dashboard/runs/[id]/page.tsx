import type { Metadata } from "next"

import { getPool } from "@/lib/postgres/connection"

export const metadata: Metadata = {
  title: "Run Detail",
}

// Always render live — never statically cache run detail.
export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

const RUN_STATUS_COLOR: Record<string, string> = {
  running: "var(--allura-green)",
  paused: "var(--allura-gold)",
  pending: "var(--allura-blue)",
  completed: "var(--allura-gray-500)",
  failed: "var(--allura-red)",
}

interface RunDetail {
  id: string
  definitionId: string
  definitionRevision: number
  definitionName: string
  status: string
  actorId: string | null
  startedAt: string
  updatedAt: string
  completedAt: string | null
}

async function getRunDetail(id: string): Promise<RunDetail | null | "error"> {
  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    return "error"
  }

  try {
    const result = await pool.query<{
      id: string
      definition_id: string
      definition_revision: number
      definition_name: string
      status: string
      actor_id: string | null
      started_at: Date | string
      updated_at: Date | string
      completed_at: Date | string | null
    }>(
      `SELECT
         r.id,
         r.definition_id,
         r.definition_revision,
         COALESCE(d.name, r.definition_id) AS definition_name,
         r.status,
         r.actor_id,
         r.started_at,
         r.updated_at,
         r.completed_at
       FROM process_runs r
       LEFT JOIN process_definitions d
         ON d.id = r.definition_id
        AND d.revision = r.definition_revision
        AND d.group_id = r.group_id
       WHERE r.id = $1
         AND r.group_id = $2`,
      [id, GROUP_ID],
    )

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    return {
      id: row.id,
      definitionId: row.definition_id,
      definitionRevision: row.definition_revision,
      definitionName: row.definition_name,
      status: row.status,
      actorId: row.actor_id,
      startedAt: toISOString(row.started_at),
      updatedAt: toISOString(row.updated_at),
      completedAt: row.completed_at !== null ? toISOString(row.completed_at) : null,
    }
  } catch {
    return "error"
  }
}

function toISOString(value: Date | string): string {
  if (value instanceof Date) return value.toISOString()
  return new Date(value).toISOString()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRunDetail(id)

  return (
    <div style={{ padding: "32px" }}>
      {/* Back link */}
      <div style={{ marginBottom: "20px" }}>
        <a
          href="/dashboard/runs"
          style={{
            fontSize: "13px",
            color: "var(--allura-blue)",
            textDecoration: "none",
          }}
        >
          &larr; All Runs
        </a>
      </div>

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
          Process Engine
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
          Run Detail
        </h1>
        <code
          style={{
            fontSize: "13px",
            fontFamily: '"IBM Plex Mono", monospace',
            color: "var(--allura-gray-500)",
          }}
        >
          {id}
        </code>
      </div>

      {/* Error state */}
      {run === "error" ? (
        <div
          style={{
            padding: "16px",
            background: "var(--allura-paper)",
            border: "1px solid var(--allura-cream)",
            borderRadius: "10px",
            marginBottom: "24px",
            width: "min(100%, 800px)",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "var(--allura-red)",
              margin: "0",
              fontWeight: 600,
            }}
          >
            Cannot load run. Check PostgreSQL connectivity.
          </p>
        </div>
      ) : run === null ? (
        <div
          style={{
            padding: "16px",
            background: "var(--allura-paper)",
            border: "1px solid var(--allura-cream)",
            borderRadius: "10px",
            marginBottom: "24px",
            width: "min(100%, 800px)",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "var(--allura-charcoal)",
              margin: "0",
              fontWeight: 600,
            }}
          >
            Run not found.
          </p>
          <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "4px 0 0" }}>
            No run with ID{" "}
            <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{id}</code> exists in scope{" "}
            <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{GROUP_ID}</code>.
          </p>
        </div>
      ) : (
        <>
          {/* Run metadata card */}
          <div
            style={{
              padding: "20px",
              background: "var(--allura-paper)",
              border: "1px solid var(--allura-cream)",
              borderRadius: "10px",
              marginBottom: "24px",
              width: "min(100%, 800px)",
            }}
          >
            <p
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--allura-blue)",
                margin: "0 0 16px",
              }}
            >
              Run Info
            </p>

            <div style={{ display: "grid", gap: "12px" }}>
              {/* Status */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--allura-gray-500)",
                    width: "120px",
                    flexShrink: 0,
                  }}
                >
                  Status
                </span>
                {(() => {
                  const color = RUN_STATUS_COLOR[run.status] ?? "var(--allura-gray-500)"
                  return (
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "11px",
                        fontWeight: 600,
                        color,
                        textTransform: "capitalize",
                        background: `color-mix(in srgb, ${color} 10%, transparent)`,
                        padding: "2px 10px",
                        borderRadius: "999px",
                        border: `1px solid ${color}`,
                      }}
                    >
                      {run.status}
                    </span>
                  )
                })()}
              </div>

              {/* Definition */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--allura-gray-500)",
                    width: "120px",
                    flexShrink: 0,
                  }}
                >
                  Definition
                </span>
                <span style={{ fontSize: "13px", color: "var(--allura-charcoal)" }}>
                  {run.definitionName}
                </span>
                <code
                  style={{
                    fontSize: "11px",
                    fontFamily: '"IBM Plex Mono", monospace',
                    color: "var(--allura-gray-500)",
                  }}
                >
                  rev {run.definitionRevision}
                </code>
              </div>

              {/* Actor */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--allura-gray-500)",
                    width: "120px",
                    flexShrink: 0,
                  }}
                >
                  Actor
                </span>
                <span style={{ fontSize: "13px", color: "var(--allura-charcoal)" }}>
                  {run.actorId ?? "—"}
                </span>
              </div>

              {/* Started at */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--allura-gray-500)",
                    width: "120px",
                    flexShrink: 0,
                  }}
                >
                  Started
                </span>
                <span style={{ fontSize: "13px", color: "var(--allura-charcoal)" }}>
                  {formatDate(run.startedAt)}
                </span>
              </div>

              {/* Last updated */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--allura-gray-500)",
                    width: "120px",
                    flexShrink: 0,
                  }}
                >
                  Last Updated
                </span>
                <span style={{ fontSize: "13px", color: "var(--allura-charcoal)" }}>
                  {formatDate(run.updatedAt)}
                </span>
              </div>

              {/* Completed at (conditional) */}
              {run.completedAt !== null ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--allura-gray-500)",
                      width: "120px",
                      flexShrink: 0,
                    }}
                  >
                    Completed
                  </span>
                  <span style={{ fontSize: "13px", color: "var(--allura-charcoal)" }}>
                    {formatDate(run.completedAt)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Step timeline placeholder */}
          <div
            style={{
              padding: "20px",
              background: "var(--allura-paper)",
              border: "1px dashed var(--allura-cream)",
              borderRadius: "10px",
              width: "min(100%, 800px)",
            }}
          >
            <p
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--allura-gray-500)",
                margin: "0 0 8px",
              }}
            >
              Step Timeline
            </p>
            <p style={{ fontSize: "13px", color: "var(--allura-gray-500)", margin: "0" }}>
              Step timeline coming in Phase 3.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
