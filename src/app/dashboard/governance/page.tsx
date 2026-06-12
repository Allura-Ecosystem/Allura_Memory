import type { Metadata } from "next"

import { resolveOperationalSurface, type OperationalStatus } from "@/lib/operational-state"
import { readCuratorQueue } from "@/lib/operational-state/sources/curator-queue-source"

export const metadata: Metadata = {
  title: "Governance",
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

export default async function GovernancePage() {
  const outcome = await readCuratorQueue(GROUP_ID)
  const surface = resolveOperationalSurface({
    source: { id: "curator-queue", systemOfRecord: "postgres:canonical_proposals" },
    outcome,
    isEmpty: (d) => d.pending === 0 && d.approved7d === 0 && d.rejected7d === 0,
    freshnessMs: 30_000,
  })

  const accent = STATUS_COLOR[surface.status]
  const counts = surface.data

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
          Governance
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
          Governance
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Policy gates, approvals, provenance, and evidence trails.
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
              ? "Curator queue source is unreachable"
              : surface.status === "error"
                ? "Curator queue source reported an error"
                : "No proposals in the curator queue"}
          </p>
          {surface.error ? (
            <p style={{ fontSize: "12px", color: "var(--allura-red)", margin: "0 0 4px" }}>{surface.error}</p>
          ) : null}
          {surface.recovery ? (
            <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0" }}>{surface.recovery}</p>
          ) : null}
        </div>
      ) : null}

      {/* Counts — only rendered with real data (ready or stale) */}
      {counts ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "12px",
            marginBottom: "24px",
            width: "min(100%, 800px)",
          }}
        >
          {(
            [
              { label: "Pending", value: counts.pending, accent: "var(--allura-gold)" },
              { label: "Approved (7d)", value: counts.approved7d, accent: "var(--allura-green)" },
              { label: "Rejected (7d)", value: counts.rejected7d, accent: "var(--allura-red)" },
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
      ) : null}
    </div>
  )
}
