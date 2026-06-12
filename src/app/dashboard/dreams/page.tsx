import type { Metadata } from "next"

import { resolveOperationalSurface, type OperationalStatus } from "@/lib/operational-state"
import {
  isDreamsEmpty,
  readDreams,
} from "@/lib/operational-state/sources/dreams-source"

export const metadata: Metadata = {
  title: "Dreams",
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

export default async function DreamsPage() {
  const outcome = await readDreams(GROUP_ID)
  const now = Date.now()
  const surface = resolveOperationalSurface({
    source: { id: "dreams", systemOfRecord: "postgres:canonical_proposals+events" },
    outcome,
    isEmpty: isDreamsEmpty,
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
          Background Intelligence
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
          Dreams
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Pattern discovery, curator proposals, embedding backfill, and scheduled recommendations.
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
              ? "Dreams source is unreachable"
              : surface.status === "error"
                ? "Dreams source reported an error"
                : "No background intelligence activity yet"}
          </p>
          {surface.status === "empty" ? (
            <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0 0 4px" }}>
              Dreams surfaces Allura&apos;s autonomous background work: curator proposals, embedding backfill,
              and pattern discovery. Start the curator pipeline to see activity here.
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

      {/* Pipeline data — only rendered with real data (ready or stale) */}
      {snapshot ? (
        <>
          {/* HITL promotion gate notice */}
          {snapshot.proposalsPending > 0 ? (
            <div
              style={{
                padding: "12px 16px",
                background: "var(--allura-paper)",
                border: "1px solid var(--allura-gold)",
                borderRadius: "10px",
                marginBottom: "16px",
                width: "min(100%, 800px)",
              }}
            >
              <p style={{ fontSize: "13px", color: "var(--allura-charcoal)", margin: "0", fontWeight: 600 }}>
                {snapshot.proposalsPending} proposal{snapshot.proposalsPending === 1 ? "" : "s"} pending human review
              </p>
              <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "4px 0 0" }}>
                {snapshot.promotionMode === "soc2"
                  ? "All promotions require explicit human approval (SOC2 mode)."
                  : snapshot.promotionMode === "auto"
                    ? "High-scoring proposals auto-promote; others need approval."
                    : "Review pending proposals on the Governance surface."}
              </p>
            </div>
          ) : null}

          {/* Proposal pipeline cards */}
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
              Curator Pipeline
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
                  { label: "Pending", value: snapshot.proposalsPending, accent: snapshot.proposalsPending > 0 ? "var(--allura-gold)" : "var(--allura-gray-500)" },
                  { label: "Approved (7d)", value: snapshot.proposalsApproved7d, accent: "var(--allura-green)" },
                  { label: "Rejected (7d)", value: snapshot.proposalsRejected7d, accent: snapshot.proposalsRejected7d > 0 ? "var(--allura-red)" : "var(--allura-gray-500)" },
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

          {/* Background activity cards */}
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
              Background Activity
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
                  { label: "Proposals (24h)", value: snapshot.proposalsCreated24h, accent: "var(--allura-blue)" },
                  { label: "Backfill Runs (24h)", value: snapshot.backfillRuns24h, accent: "var(--allura-green)" },
                  {
                    label: "Last Proposal",
                    value: snapshot.lastProposalAt
                      ? new Date(snapshot.lastProposalAt).toLocaleDateString()
                      : "None",
                    accent: snapshot.lastProposalAt ? "var(--allura-gold)" : "var(--allura-gray-500)",
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

          {/* Promotion mode */}
          <div style={{ marginBottom: "24px", width: "min(100%, 800px)" }}>
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
                Promotion Mode
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
              <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
                &mdash; {snapshot.promotionMode === "soc2" ? "all promotions require human approval" : snapshot.promotionMode === "auto" ? "high-scoring proposals auto-promote" : "not configured"}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}