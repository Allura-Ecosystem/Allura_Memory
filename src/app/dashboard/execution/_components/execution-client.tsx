"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { AgentStatus, ExecutionOverview, TimelineBucket } from "@/server/actions/execution-view"
import { TEAM_RAM_AGENTS } from "@/server/actions/execution-view"

// ── Constants ─────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 10_000

// Agent display names (title case)
const AGENT_LABELS: Record<string, string> = {
  brooks: "Brooks",
  woz: "Woz",
  scout: "Scout",
  knuth: "Knuth",
  bellard: "Bellard",
  carmack: "Carmack",
  fowler: "Fowler",
  pike: "Pike",
  hightower: "Hightower",
  jobs: "Jobs",
}

// Agent role descriptions
const AGENT_ROLES: Record<string, string> = {
  brooks: "Architect + Orchestrator",
  woz: "Builder",
  scout: "Recon + Discovery",
  knuth: "Data Architect",
  bellard: "Diagnostics + Perf",
  carmack: "Performance Specialist",
  fowler: "Refactor Gate",
  pike: "Interface Gate",
  hightower: "DevOps Specialist",
  jobs: "Intent Gate",
}

// Per-agent accent colors for timeline bars
const AGENT_COLORS: Record<string, string> = {
  brooks: "var(--allura-blue)",
  woz: "var(--allura-green)",
  scout: "var(--allura-gold)",
  knuth: "#8b5cf6",
  bellard: "#ef4444",
  carmack: "#f97316",
  fowler: "#06b6d4",
  pike: "#ec4899",
  hightower: "#84cc16",
  jobs: "#a855f7",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatRunId(id: string): string {
  return id.slice(0, 8)
}

// ── Agent Card ────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  onClick,
}: {
  agent: AgentStatus
  onClick: () => void
}) {
  const isActive = agent.state === "active"
  const isBlocked = agent.state === "blocked"
  const isIdle = agent.state === "idle"

  const dotColor = isBlocked
    ? "var(--allura-gold)"
    : isActive
      ? "var(--allura-green)"
      : "var(--allura-gray-500)"

  const borderColor = isBlocked
    ? "var(--allura-gold)"
    : isActive
      ? "var(--allura-green)"
      : "var(--allura-cream)"

  const stateLabel = isBlocked ? "blocked" : isActive ? "active" : "idle"

  return (
    <button
      onClick={onClick}
      disabled={!agent.activeRunId}
      aria-label={`${AGENT_LABELS[agent.agentId] ?? agent.agentId} — ${stateLabel}`}
      style={{
        background: "var(--allura-paper)",
        border: `1px solid ${borderColor}`,
        borderRadius: "10px",
        padding: "14px 16px",
        textAlign: "left",
        cursor: agent.activeRunId ? "pointer" : "default",
        transition: "box-shadow 120ms ease",
        width: "100%",
      }}
      onMouseEnter={(e) => {
        if (agent.activeRunId) {
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 4px 6px -1px rgba(15,17,21,.10)"
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = "none"
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        {/* Status dot */}
        <span
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "var(--allura-charcoal)",
            flex: 1,
          }}
        >
          {AGENT_LABELS[agent.agentId] ?? agent.agentId}
        </span>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            color: dotColor,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontFamily: '"IBM Plex Mono", monospace',
          }}
        >
          {stateLabel}
        </span>
      </div>

      {/* Role */}
      <p
        style={{
          fontSize: "11px",
          color: "var(--allura-gray-500)",
          margin: "0 0 8px",
          fontStyle: "italic",
        }}
      >
        {AGENT_ROLES[agent.agentId] ?? ""}
      </p>

      {/* Active run details */}
      {isIdle ? (
        <p
          style={{
            fontSize: "12px",
            color: "var(--allura-gray-500)",
            margin: "0",
            fontStyle: "italic",
          }}
        >
          No active run
        </p>
      ) : (
        <div style={{ display: "grid", gap: "4px" }}>
          {agent.activeRunId && (
            <span
              style={{
                fontSize: "11px",
                fontFamily: '"IBM Plex Mono", monospace',
                color: "var(--allura-blue)",
              }}
            >
              {formatRunId(agent.activeRunId)}
            </span>
          )}
          {agent.activeRunName && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--allura-charcoal)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {agent.activeRunName}
            </span>
          )}
          {agent.currentStep !== null && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--allura-gray-500)",
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              step {agent.currentStep + 1}
              {agent.totalSteps !== null ? `/${agent.totalSteps}` : ""}
            </span>
          )}
          {agent.elapsedMs !== null && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--allura-gray-500)",
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              {formatElapsed(agent.elapsedMs)} elapsed
            </span>
          )}
        </div>
      )}
    </button>
  )
}

// ── Timeline Bar ──────────────────────────────────────────────────────────────

function TimelineSection({ timeline }: { timeline: TimelineBucket[] }) {
  // Build per-agent bucket arrays
  const bucketsByAgent = new Map<string, number[]>()
  for (const agentId of TEAM_RAM_AGENTS) {
    bucketsByAgent.set(agentId, new Array<number>(30).fill(0))
  }
  for (const bucket of timeline) {
    const arr = bucketsByAgent.get(bucket.agentId)
    if (arr) arr[bucket.minuteOffset] = bucket.eventCount
  }

  // Max count for scaling
  let maxCount = 1
  for (const buckets of bucketsByAgent.values()) {
    for (const v of buckets) {
      if (v > maxCount) maxCount = v
    }
  }

  // Only render agents that had any activity
  const activeAgents = TEAM_RAM_AGENTS.filter((id) => {
    const arr = bucketsByAgent.get(id)!
    return arr.some((v) => v > 0)
  })

  if (activeAgents.length === 0) {
    return (
      <div
        style={{
          padding: "20px 24px",
          background: "var(--allura-paper)",
          border: "1px solid var(--allura-cream)",
          borderRadius: "10px",
        }}
      >
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
          Timeline (last 30 min)
        </p>
        <p style={{ fontSize: "13px", color: "var(--allura-gray-500)", margin: 0, fontStyle: "italic" }}>
          No agent activity in the last 30 minutes.
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: "20px 24px",
        background: "var(--allura-paper)",
        border: "1px solid var(--allura-cream)",
        borderRadius: "10px",
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
        Timeline (last 30 min)
      </p>

      {/* Time axis labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "8px",
          paddingLeft: "80px",
        }}
      >
        <span style={{ fontSize: "10px", color: "var(--allura-gray-500)", fontFamily: '"IBM Plex Mono", monospace' }}>
          -30m
        </span>
        <span style={{ fontSize: "10px", color: "var(--allura-gray-500)", fontFamily: '"IBM Plex Mono", monospace' }}>
          -15m
        </span>
        <span style={{ fontSize: "10px", color: "var(--allura-gray-500)", fontFamily: '"IBM Plex Mono", monospace' }}>
          now
        </span>
      </div>

      {/* Agent rows */}
      <div style={{ display: "grid", gap: "6px" }}>
        {activeAgents.map((agentId) => {
          const buckets = bucketsByAgent.get(agentId)!
          const color = AGENT_COLORS[agentId] ?? "var(--allura-blue)"

          return (
            <div key={agentId} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Agent label */}
              <span
                style={{
                  width: "72px",
                  flexShrink: 0,
                  fontSize: "11px",
                  color: "var(--allura-charcoal)",
                  fontWeight: 600,
                  textAlign: "right",
                }}
              >
                {AGENT_LABELS[agentId] ?? agentId}
              </span>

              {/* Buckets */}
              <div style={{ display: "flex", gap: "2px", flex: 1 }}>
                {buckets.map((count, i) => {
                  const intensity = count > 0 ? Math.max(0.2, count / maxCount) : 0
                  return (
                    <div
                      key={i}
                      title={count > 0 ? `${count} event${count !== 1 ? "s" : ""} at -${30 - i}m` : undefined}
                      style={{
                        flex: 1,
                        height: "16px",
                        borderRadius: "2px",
                        background:
                          count > 0
                            ? `color-mix(in srgb, ${color} ${Math.round(intensity * 100)}%, transparent)`
                            : "var(--allura-cream)",
                        transition: "background 200ms ease",
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Refresh indicator ─────────────────────────────────────────────────────────

function RefreshButton({
  loading,
  lastRefresh,
  onRefresh,
}: {
  loading: boolean
  lastRefresh: string
  onRefresh: () => void
}) {
  const elapsed = Math.round((Date.now() - new Date(lastRefresh).getTime()) / 1000)

  return (
    <button
      onClick={onRefresh}
      disabled={loading}
      aria-label="Refresh execution overview"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        background: "var(--allura-paper)",
        border: "1px solid var(--allura-cream)",
        borderRadius: "6px",
        cursor: loading ? "not-allowed" : "pointer",
        fontSize: "12px",
        color: "var(--allura-gray-500)",
        fontFamily: '"IBM Plex Mono", monospace',
        opacity: loading ? 0.6 : 1,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: loading ? "var(--allura-gold)" : "var(--allura-green)",
        }}
      />
      {loading ? "refreshing…" : `${elapsed}s ago`}
    </button>
  )
}

// ── Root client component ─────────────────────────────────────────────────────

interface ExecutionClientProps {
  initial: ExecutionOverview
  groupId: string
}

export function ExecutionClient({ initial, groupId }: ExecutionClientProps) {
  const [data, setData] = useState<ExecutionOverview>(initial)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/execution-overview?group_id=${encodeURIComponent(groupId)}`, {
        cache: "no-store",
      })
      if (res.ok) {
        const json = (await res.json()) as ExecutionOverview
        setData(json)
      }
    } catch {
      // Network failure — keep stale data
    } finally {
      setLoading(false)
    }
  }, [groupId])

  // Auto-refresh every 10 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void refresh()
    }, REFRESH_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [refresh])

  function handleAgentClick(agent: AgentStatus) {
    if (agent.activeRunId) {
      window.location.href = `/dashboard/runs/${agent.activeRunId}`
    }
  }

  // Partition agents into rows of 3
  const agentStatuses = data.agents
  const rows: AgentStatus[][] = []
  for (let i = 0; i < agentStatuses.length; i += 3) {
    rows.push(agentStatuses.slice(i, i + 3))
  }

  const activeCount = agentStatuses.filter((a) => a.state === "active").length
  const blockedCount = agentStatuses.filter((a) => a.state === "blocked").length

  return (
    <div>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
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
            Team RAM
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
            Active Execution Overview
          </h1>
          <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: 0 }}>
            Parallel swim lanes for all 10 Team RAM agents.
            {activeCount > 0 && (
              <span style={{ color: "var(--allura-green)", fontWeight: 600 }}>
                {" "}
                {activeCount} active
              </span>
            )}
            {blockedCount > 0 && (
              <span style={{ color: "var(--allura-gold)", fontWeight: 600 }}>
                {", "}
                {blockedCount} blocked
              </span>
            )}
          </p>
        </div>

        <RefreshButton loading={loading} lastRefresh={data.fetchedAt} onRefresh={() => void refresh()} />
      </div>

      {/* Offline warning */}
      {!data.online && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 14px",
            background: "var(--allura-paper)",
            border: "1px solid var(--allura-red)",
            borderRadius: "8px",
            marginBottom: "20px",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--allura-red)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: "13px", color: "var(--allura-red)" }}>
            Cannot reach PostgreSQL — showing last known state.
          </span>
        </div>
      )}

      {/* Swim lanes */}
      <div style={{ marginBottom: "24px" }}>
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
          Agent Status
        </p>

        <div style={{ display: "grid", gap: "16px" }}>
          {rows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              {row.map((agent) => (
                <AgentCard
                  key={agent.agentId}
                  agent={agent}
                  onClick={() => handleAgentClick(agent)}
                />
              ))}
              {/* Fill empty columns to maintain grid alignment */}
              {row.length < 3 &&
                Array.from({ length: 3 - row.length }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ marginBottom: "24px" }}>
        <TimelineSection timeline={data.timeline} />
      </div>

      {/* Active runs summary table */}
      {data.activeRuns.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
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
            Active Runs ({data.activeRuns.length})
          </p>
          <div
            style={{
              background: "var(--allura-paper)",
              border: "1px solid var(--allura-cream)",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 2fr 80px 1fr",
                padding: "10px 16px",
                borderBottom: "1px solid var(--allura-cream)",
              }}
            >
              {["Run ID", "Definition", "Status", "Started"].map((h) => (
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

            {/* Rows */}
            {data.activeRuns.map((run) => {
              const statusColor =
                run.status === "running"
                  ? "var(--allura-green)"
                  : run.status === "paused"
                    ? "var(--allura-gold)"
                    : run.status === "blocked"
                      ? "var(--allura-gold)"
                      : "var(--allura-gray-500)"

              const diffMs = Date.now() - new Date(run.startedAt).getTime()
              const startedLabel =
                diffMs < 60000
                  ? `${Math.floor(diffMs / 1000)}s ago`
                  : diffMs < 3600000
                    ? `${Math.floor(diffMs / 60000)}m ago`
                    : `${Math.floor(diffMs / 3600000)}h ago`

              return (
                <div
                  key={run.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 2fr 80px 1fr",
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
                    {formatRunId(run.id)}
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
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--allura-gray-500)",
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                  >
                    {startedLabel}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
