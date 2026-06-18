import type { Metadata } from "next"

import { resolveOperationalSurface, type OperationalStatus } from "@/lib/operational-state"
import {
  isTeamsEmpty,
  readTeams,
} from "@/lib/operational-state/sources/teams-source"

export const metadata: Metadata = {
  title: "Teams",
}

// Always render live — never statically cache fabricated operational state.
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

function freshnessText(fetchedAt: string | null, ageMs: number | null): string {
  if (fetchedAt === null || ageMs === null) return "freshness: unknown"
  const seconds = Math.round(ageMs / 1000)
  return `fetched ${seconds}s ago`
}

export default async function TeamsPage() {
  const outcome = await readTeams(GROUP_ID)
  const now = Date.now()
  const surface = resolveOperationalSurface({
    source: { id: "teams", systemOfRecord: "postgres:workspaces+mcp_tokens+events" },
    outcome,
    isEmpty: isTeamsEmpty,
    freshnessMs: 30_000,
    now,
  })

  const accent = STATUS_COLOR[surface.status]
  const snapshot = surface.data

  return (
    <div style={{ padding: "32px" }}>
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
          Operations
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
          Teams
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Workspaces in this org and the MCP agents registered in each. Live from the workspaces + tokens tables, activity from event history.
        </p>
      </div>

      {/* Honest operational state strip — source + freshness, never fabricated */}
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
          width: "min(100%, 800px)",
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

      {/* Recovery / error / empty messaging when not authoritative */}
      {surface.status !== "ready" && surface.status !== "stale" ? (
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
          <p style={{ fontSize: "14px", color: "var(--allura-charcoal)", margin: "0 0 4px", fontWeight: 600 }}>
            {surface.status === "degraded"
              ? "Teams source is unreachable"
              : surface.status === "error"
                ? "Teams source reported an error"
                : "No workspaces yet"}
          </p>
          {surface.status === "empty" ? (
            <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0 0 4px" }}>
              This org has no workspaces. Create one in Allura Guard to register agents and mint MCP tokens.
            </p>
          ) : null}
          {surface.error ? (
            <p style={{ fontSize: "12px", color: "var(--allura-red)", margin: "0 0 4px" }}>{surface.error}</p>
          ) : null}
          {surface.recovery ? (
            <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0" }}>{surface.recovery}</p>
          ) : null}
        </div>
      ) : null}

      {/* Fleet stats + team cards — only rendered with real data (ready or stale) */}
      {snapshot ? (
        <>
          {/* Fleet stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "12px",
              marginBottom: "24px",
              width: "min(100%, 800px)",
            }}
          >
            {(
              [
                { label: "Active Teams", value: snapshot.teams.filter((t) => t.status === "active").length, accent: "var(--allura-green)" },
                { label: "Total Agents", value: snapshot.totalAgents, accent: "var(--allura-blue)" },
                { label: "Events (24h)", value: snapshot.totalEvents24h, accent: snapshot.totalEvents24h > 0 ? "var(--allura-gold)" : "var(--allura-gray-500)" },
                { label: "Scope", value: snapshot.groupId, accent: "var(--allura-gray-500)" },
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
                <span style={{ fontSize: "22px", fontWeight: 700, color: stat.accent }}>{stat.value}</span>
              </div>
            ))}
          </div>

          {/* Team cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
            {snapshot.teams.map((team) => (
              <div
                key={team.id}
                style={{
                  background: "var(--allura-paper)",
                  border: "1px solid var(--allura-cream)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: "1px solid var(--allura-cream)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: "var(--allura-blue)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {team.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--allura-charcoal)" }}>{team.name}</div>
                      <div style={{ fontSize: 12, color: "var(--allura-gray-500)", marginTop: 1 }}>{team.description}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <code
                      style={{
                        fontSize: 10,
                        color: "var(--allura-gray-500)",
                        fontFamily: '"IBM Plex Mono", monospace',
                        padding: "2px 6px",
                        background: "rgba(17, 24, 39, 0.05)",
                        borderRadius: 4,
                      }}
                    >
                      {team.groupId}
                    </code>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        background: team.status === "active" ? "rgba(17, 148, 90, 0.1)" : "rgba(37, 99, 235, 0.1)",
                        color: team.status === "active" ? "var(--allura-green)" : "var(--allura-blue)",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: team.status === "active" ? "var(--allura-green)" : "var(--allura-blue)",
                        }}
                      />
                      {team.status === "active" ? "Active" : team.status === "provisioned" ? "Provisioned" : "Spec Ready"}
                    </span>
                  </div>
                </div>

                {/* Agent roster */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 0,
                  }}
                >
                  {team.agents.map((agent) => (
                    <div
                      key={agent.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 20px",
                        borderBottom: "1px solid var(--allura-cream)",
                        borderRight: "1px solid var(--allura-cream)",
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: agent.events24h > 0 ? "var(--allura-green)" : "var(--allura-gray-500)",
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                        title={agent.events24h > 0 ? `${agent.events24h} events (24h)` : "No events (24h)"}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--allura-charcoal)", lineHeight: 1.3 }}>
                          {agent.persona}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--allura-gray-500)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {agent.role}
                          {agent.events24h > 0 ? (
                            <span style={{ color: "var(--allura-green)", marginLeft: 4 }}>
                              ({agent.events24h})
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}