import type { Metadata } from "next"

import { resolveOperationalSurface, type OperationalStatus } from "@/lib/operational-state"
import {
  isSettingsEmpty,
  readSettings,
} from "@/lib/operational-state/sources/settings-source"

export const metadata: Metadata = {
  title: "Settings",
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

const HEALTH_COLOR: Record<string, string> = {
  healthy: "var(--allura-green)",
  unhealthy: "var(--allura-red)",
  unknown: "var(--allura-gray-500)",
}

function freshnessText(fetchedAt: string | null, ageMs: number | null): string {
  if (fetchedAt === null || ageMs === null) return "freshness: unknown"
  const seconds = Math.round(ageMs / 1000)
  return `fetched ${seconds}s ago`
}

export default async function SettingsPage() {
  const outcome = await readSettings(GROUP_ID)
  const now = Date.now()
  const surface = resolveOperationalSurface({
    source: { id: "settings", systemOfRecord: "postgres:events+mcp:health" },
    outcome,
    isEmpty: isSettingsEmpty,
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
          Configuration
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
          Settings
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Runtime health, governance activity, and system configuration.
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
              ? "Settings source is unreachable"
              : surface.status === "error"
                ? "Settings source reported an error"
                : "No governance activity recorded yet"}
          </p>
          {surface.status === "empty" ? (
            <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0 0 4px" }}>
              Update a governance policy or run a gate check to see activity here.
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

      {/* Subsystem health + governance activity — only rendered with real data (ready or stale) */}
      {snapshot ? (
        <>
          {/* Subsystem health cards */}
          <div style={{ marginBottom: "24px", width: "min(100%, 800px)" }}>
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
              Subsystem Health
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
                  { label: "PostgreSQL", key: "postgres" as const },
                  { label: "Neo4j", key: "neo4j" as const },
                  { label: "Embedding", key: "embeddingBackfill" as const },
                  { label: "Curator", key: "curatorQueueDepth" as const },
                  { label: "MCP Tools", key: "mcpToolAvailability" as const },
                ] as const
              ).map((sub) => {
                const health = snapshot.subsystemHealth[sub.key]
                const color = HEALTH_COLOR[health]
                return (
                  <div
                    key={sub.label}
                    style={{
                      padding: "16px",
                      background: "var(--allura-paper)",
                      border: `1px solid ${health === "healthy" ? "var(--allura-cream)" : color}`,
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
                      {sub.label}
                    </span>
                    <span style={{ fontSize: "16px", fontWeight: 700, color, textTransform: "capitalize" }}>
                      {health}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Governance activity cards */}
          <div style={{ marginBottom: "24px", width: "min(100%, 800px)" }}>
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
              Governance Activity
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              {(
                [
                  { label: "Policy Changes", value: snapshot.policyChanges, accent: "var(--allura-blue)" },
                  { label: "Gate Checks (24h)", value: snapshot.gateChecks24h, accent: "var(--allura-green)" },
                  {
                    label: "Last Policy Change",
                    value: snapshot.lastPolicyChangeAt
                      ? new Date(snapshot.lastPolicyChangeAt).toLocaleDateString()
                      : "None",
                    accent: snapshot.lastPolicyChangeAt ? "var(--allura-gold)" : "var(--allura-gray-500)",
                  },
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
          </div>

          {/* Promotion mode indicator */}
          <div style={{ marginBottom: "24px", width: "min(100%, 800px)" }}>
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
              Promotion Mode
            </p>
            <div
              style={{
                padding: "12px 18px",
                background: "var(--allura-paper)",
                border: "1px solid var(--allura-cream)",
                borderRadius: "10px",
                display: "flex",
                alignItems: "baseline",
                gap: "12px",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--allura-charcoal)", fontWeight: 500 }}>
                Mode
              </span>
              <code
                style={{
                  fontSize: "12px",
                  fontFamily: '"IBM Plex Mono", monospace',
                  color: snapshot.promotionMode === "soc2" ? "var(--allura-gold)" : "var(--allura-green)",
                  background: "rgba(17, 24, 39, 0.05)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  textTransform: "uppercase",
                }}
              >
                {snapshot.promotionMode}
              </code>
              {snapshot.promotionMode === "soc2" ? (
                <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                  &mdash; all promotions require human approval
                </span>
              ) : snapshot.promotionMode === "auto" ? (
                <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                  &mdash; high-scoring memories auto-promote
                </span>
              ) : (
                <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                  &mdash; not configured via PROMOTION_MODE env
                </span>
              )}
            </div>
          </div>
        </>
      ) : null}

      {/* Static reference config — still valid but below the live operational truth */}
      <div style={{ marginBottom: "24px", width: "min(100%, 640px)" }}>
        <p
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--allura-gray-500)",
            margin: "0 0 12px",
          }}
        >
          Static Reference
        </p>
        <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0" }}>
          Editable settings and environment configuration are managed via environment variables
          and <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>.env</code>. No secrets are displayed here.
        </p>
      </div>
    </div>
  )
}