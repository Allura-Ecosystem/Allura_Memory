import type { Metadata } from "next"

import { resolveOperationalSurface, type OperationalStatus } from "@/lib/operational-state"
import { isRunsEmpty, readRuns } from "@/lib/operational-state/sources/runs-source"

export const metadata: Metadata = {
  title: "Runs",
}

// Always render live — never statically cache operational run state.
export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

const STATUS_COLOR: Record<OperationalStatus, string> = {
  ready: "var(--allura-green)",
  empty: "var(--allura-gray-500)",
  stale: "var(--allura-gold)",
  error: "var(--allura-red)",
  degraded: "var(--allura-red)",
}

const STATUS_LABEL: Record<OperationalStatus, string> = {
  ready: "Live",
  empty: "Empty",
  stale: "Stale",
  error: "Error",
  degraded: "Degraded",
}

const RUN_STATUS_COLOR: Record<string, string> = {
  running: "var(--allura-green)",
  paused: "var(--allura-gold)",
  pending: "var(--allura-blue)",
  completed: "var(--allura-gray-500)",
  failed: "var(--allura-red)",
}

function freshnessText(fetchedAt: string | null, ageMs: number | null): string {
  if (fetchedAt === null || ageMs === null) return "freshness: unknown"
  const seconds = Math.round(ageMs / 1000)
  return `fetched ${seconds}s ago`
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

export default async function RunsPage() {
  const outcome = await readRuns(GROUP_ID)
  const now = Date.now()
  const surface = resolveOperationalSurface({
    source: { id: "runs", systemOfRecord: "postgres:process_runs" },
    outcome,
    isEmpty: isRunsEmpty,
    freshnessMs: 30_000,
    now,
  })

  const accent = STATUS_COLOR[surface.status]
  const snapshot = surface.data

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
          Runs
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Active process runs, status counts, and recent completions.
        </p>
      </div>

      {/* Honest operational state strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          background: "var(--allura-paper)",
          border: `1px solid ${accent}`,
          borderRadius: "8px",
          marginBottom: "16px",
          width: "min(100%, 900px)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: accent,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: "13px", color: accent, fontWeight: 600 }}>
          {STATUS_LABEL[surface.status]}
        </span>
        <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
          &mdash; source{" "}
          <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{surface.source.id}</code> (
          {surface.source.systemOfRecord}) &mdash; {freshnessText(surface.fetchedAt, surface.ageMs)} &mdash;
          scope <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{GROUP_ID}</code>
        </span>
      </div>

      {/* Recovery / error / empty messaging */}
      {surface.status !== "ready" && surface.status !== "stale" ? (
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
          <p
            style={{
              fontSize: "14px",
              color: "var(--allura-charcoal)",
              margin: "0 0 4px",
              fontWeight: 600,
            }}
          >
            {surface.status === "degraded"
              ? "Cannot load runs. Check PostgreSQL connectivity."
              : surface.status === "error"
                ? "Runs source reported an error."
                : "No runs yet. Start one from a process definition."}
          </p>
          {surface.error ? (
            <p style={{ fontSize: "12px", color: "var(--allura-red)", margin: "0 0 4px" }}>
              {surface.error}
            </p>
          ) : null}
          {surface.recovery ? (
            <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0" }}>
              {surface.recovery}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Live data — only rendered when ready or stale */}
      {snapshot ? (
        <>
          {/* Run count strip */}
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
              Status Counts
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
                  { label: "Total", value: snapshot.runCounts.total, color: "var(--allura-charcoal)" },
                  { label: "Running", value: snapshot.runCounts.running, color: "var(--allura-green)" },
                  { label: "Paused", value: snapshot.runCounts.paused, color: "var(--allura-gold)" },
                  { label: "Completed", value: snapshot.runCounts.completed, color: "var(--allura-gray-500)" },
                  { label: "Failed", value: snapshot.runCounts.failed, color: "var(--allura-red)" },
                ] as const
              ).map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: "16px",
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
                  <span
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      color: stat.color,
                    }}
                  >
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active runs table */}
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
              Active Runs
            </p>

            {snapshot.activeRuns.length === 0 ? (
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
                  No active runs.
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
                    gridTemplateColumns: "1fr 1.5fr 80px 1fr 1fr",
                    gap: "0",
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--allura-cream)",
                  }}
                >
                  {["Run ID", "Definition", "Status", "Actor", "Started"].map((h) => (
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
                {snapshot.activeRuns.map((run) => {
                  const statusColor = RUN_STATUS_COLOR[run.status] ?? "var(--allura-gray-500)"
                  return (
                    <div
                      key={run.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1.5fr 80px 1fr 1fr",
                        gap: "0",
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--allura-cream)",
                        alignItems: "center",
                      }}
                    >
                      <a
                        href={`/dashboard/runs/${run.id}`}
                        style={{
                          fontSize: "12px",
                          fontFamily: '"IBM Plex Mono", monospace',
                          color: "var(--allura-blue)",
                          textDecoration: "none",
                        }}
                      >
                        {run.id}
                      </a>
                      <span style={{ fontSize: "13px", color: "var(--allura-charcoal)" }}>
                        {run.definitionName}
                      </span>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: statusColor,
                          textTransform: "capitalize",
                          background: `color-mix(in srgb, ${statusColor} 10%, transparent)`,
                          padding: "2px 8px",
                          borderRadius: "999px",
                          border: `1px solid ${statusColor}`,
                          width: "fit-content",
                        }}
                      >
                        {run.status}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                        {run.actorId ?? "—"}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                        {relativeTime(run.startedAt)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent completions */}
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
              Recent Completions
            </p>

            {snapshot.recentCompletions.length === 0 ? (
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
                  No completed runs yet.
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
                    gridTemplateColumns: "1fr 1.5fr 80px 1fr",
                    gap: "0",
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--allura-cream)",
                  }}
                >
                  {["Run ID", "Definition", "Status", "Completed"].map((h) => (
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

                {/* Completion rows */}
                {snapshot.recentCompletions.map((c) => {
                  const statusColor = RUN_STATUS_COLOR[c.status] ?? "var(--allura-gray-500)"
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1.5fr 80px 1fr",
                        gap: "0",
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--allura-cream)",
                        alignItems: "center",
                      }}
                    >
                      <a
                        href={`/dashboard/runs/${c.id}`}
                        style={{
                          fontSize: "12px",
                          fontFamily: '"IBM Plex Mono", monospace',
                          color: "var(--allura-blue)",
                          textDecoration: "none",
                        }}
                      >
                        {c.id}
                      </a>
                      <span style={{ fontSize: "13px", color: "var(--allura-charcoal)" }}>
                        {c.definitionName}
                      </span>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: statusColor,
                          textTransform: "capitalize",
                          background: `color-mix(in srgb, ${statusColor} 10%, transparent)`,
                          padding: "2px 8px",
                          borderRadius: "999px",
                          border: `1px solid ${statusColor}`,
                          width: "fit-content",
                        }}
                      >
                        {c.status}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                        {relativeTime(c.completedAt)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
