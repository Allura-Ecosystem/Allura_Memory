"use client"

import { useEffect, useState } from "react"

import { APP_CONFIG } from "@/config/app-config"
import type { Agent } from "@/app/api/agents/route"
import type { HealthResponse } from "@/app/api/health/route"

interface ResourceState {
  health: HealthResponse | null
  agents: Agent[]
  loading: boolean
  error: string | null
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "12px",
  padding: "12px 18px",
}

const labelStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--allura-charcoal)",
  fontWeight: 500,
}

const valueStyle: React.CSSProperties = {
  fontSize: "12px",
  fontFamily: '"IBM Plex Mono", monospace',
  color: "var(--allura-gray-500)",
  background: "rgba(17, 24, 39, 0.05)",
  padding: "2px 8px",
  borderRadius: "4px",
}

const sectionContainerStyle: React.CSSProperties = {
  background: "var(--allura-paper)",
  border: "1px solid var(--allura-cream)",
  borderRadius: "10px",
  overflow: "hidden",
}

const sectionHeaderStyle: React.CSSProperties = {
  padding: "12px 18px",
  borderBottom: "1px solid var(--allura-cream)",
  background: "rgba(17, 24, 39, 0.02)",
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--allura-gray-500)",
  fontFamily: '"IBM Plex Mono", monospace',
}

const dividerStyle = (show: boolean): React.CSSProperties => ({
  borderBottom: show ? "1px solid rgba(17, 24, 39, 0.06)" : "none",
})

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "healthy" || status === "active"
      ? "var(--allura-green)"
      : status === "degraded" || status === "idle"
        ? "var(--c-gold)"
        : "var(--allura-red)"
  return (
    <code
      style={{
        ...valueStyle,
        color,
        background: "transparent",
        padding: 0,
        fontWeight: 600,
      }}
    >
      {status}
    </code>
  )
}

export function SettingsResources() {
  const [state, setState] = useState<ResourceState>({
    health: null,
    agents: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [healthRes, agentsRes] = await Promise.allSettled([fetch("/api/health"), fetch("/api/agents")])

        if (cancelled) return

        let health: HealthResponse | null = null
        let agents: Agent[] = []

        if (healthRes.status === "fulfilled" && healthRes.value.ok) {
          health = (await healthRes.value.json()) as HealthResponse
        }

        if (agentsRes.status === "fulfilled" && agentsRes.value.ok) {
          agents = (await agentsRes.value.json()) as Agent[]
        }

        setState({ health, agents, loading: false, error: null })
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, error: String(err) }))
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.loading) {
    return (
      <p style={{ fontSize: "13px", color: "var(--allura-gray-500)", margin: "0 0 8px" }}>Loading resources...</p>
    )
  }

  return (
    <>
      {/* System section */}
      <div style={sectionContainerStyle}>
        <div style={sectionHeaderStyle}>
          <span style={sectionLabelStyle}>System</span>
        </div>
        <div>
          {[
            { key: "App Version", value: APP_CONFIG.version },
            { key: "Default Group ID", value: APP_CONFIG.defaultGroupId },
          ].map((row, i, arr) => (
            <div key={row.key} style={{ ...rowStyle, ...dividerStyle(i < arr.length - 1) }}>
              <span style={labelStyle}>{row.key}</span>
              <code style={valueStyle}>{row.value}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Health / Dependencies section */}
      {state.health ? (
        <div style={sectionContainerStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionLabelStyle}>Service Health</span>
          </div>
          <div>
            <div style={{ ...rowStyle, ...dividerStyle(true) }}>
              <span style={labelStyle}>Overall Status</span>
              <StatusBadge status={state.health.status} />
            </div>
            {state.health.dependencies && (
              <>
                <div style={{ ...rowStyle, ...dividerStyle(true) }}>
                  <span style={labelStyle}>PostgreSQL</span>
                  <StatusBadge status={state.health.dependencies.postgres.status} />
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={sectionContainerStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionLabelStyle}>Service Health</span>
          </div>
          <div style={{ padding: "12px 18px" }}>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--allura-gray-500)" }}>
              Health endpoint unavailable. Backend may be starting up.
            </p>
          </div>
        </div>
      )}

      {/* Agent Roster section */}
      <div style={sectionContainerStyle}>
        <div style={sectionHeaderStyle}>
          <span style={sectionLabelStyle}>Agent Roster ({state.agents.length})</span>
        </div>
        {state.agents.length === 0 ? (
          <div style={{ padding: "12px 18px" }}>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--allura-gray-500)" }}>
              No agent definitions found. Check <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>.opencode/agent/</code>.
            </p>
          </div>
        ) : (
          <div>
            {state.agents.map((agent, i) => (
              <div key={agent.id} style={{ ...rowStyle, ...dividerStyle(i < state.agents.length - 1) }}>
                <span style={labelStyle}>
                  {agent.name}
                  {agent.model ? (
                    <span style={{ fontWeight: 400, color: "var(--allura-gray-500)", marginLeft: 6, fontSize: "12px" }}>
                      {agent.model}
                    </span>
                  ) : null}
                </span>
                <StatusBadge status={agent.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export function SettingsTelemetry() {
  return (
    <div style={sectionContainerStyle}>
      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>Telemetry</span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--allura-gray-500)", lineHeight: 1.6 }}>
          Telemetry data is not yet available. No metrics are collected from this dashboard at this time.
        </p>
        <p style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 600, color: "var(--allura-charcoal)" }}>
          Planned telemetry (not yet instrumented):
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: "18px",
            fontSize: "12px",
            color: "var(--allura-gray-500)",
            lineHeight: 1.8,
            fontFamily: '"IBM Plex Mono", monospace',
          }}
        >
          <li>Model usage per agent (token counts)</li>
          <li>Prompt invocation counts by route</li>
          <li>Tool call stats (MCP tool name, frequency, latency)</li>
          <li>Curator pipeline throughput (proposals, approvals, rejections)</li>
          <li>Embedding job counts and batch durations</li>
        </ul>
      </div>
    </div>
  )
}
