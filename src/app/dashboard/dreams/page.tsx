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

/** Map proposal counts to a lifecycle stage badge */
function stageBadge(
  pending: number,
  approved7d: number,
  rejected7d: number,
): { label: string; bg: string; text: string; border: string } {
  if (approved7d > 0) {
    return {
      label: "crystallized",
      bg: "var(--allura-success-light)",
      text: "var(--allura-success-text)",
      border: "var(--allura-success-border)",
    }
  }
  if (pending > 0) {
    return {
      label: "maturing",
      bg: "var(--allura-info-bg)",
      text: "var(--allura-blue)",
      border: "var(--allura-info-border)",
    }
  }
  return {
    label: "emerging",
    bg: "var(--allura-warning-light)",
    text: "var(--allura-warning-text)",
    border: "rgba(217,154,23,0.25)",
  }
}

/** Promotion confidence percentage based on approved vs. total resolved */
function promotionConfidence(approved: number, rejected: number): number {
  const total = approved + rejected
  if (total === 0) return 0
  return Math.round((approved / total) * 100)
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--allura-border-default)",
  borderRadius: 10,
  marginBottom: 16,
  background: "var(--allura-surface-white)",
  overflow: "hidden",
}

const sectionHeadStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 20px",
  borderBottom: "1px solid var(--allura-border-section)",
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--allura-text-primary)",
  letterSpacing: "-0.01em",
  margin: 0,
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

  // Derive insight values only when data is present
  const stage = snapshot
    ? stageBadge(snapshot.proposalsPending, snapshot.proposalsApproved7d, snapshot.proposalsRejected7d)
    : null
  const confidence = snapshot
    ? promotionConfidence(snapshot.proposalsApproved7d, snapshot.proposalsRejected7d)
    : 0
  const totalProposals = snapshot
    ? snapshot.proposalsPending + snapshot.proposalsApproved7d + snapshot.proposalsRejected7d
    : 0

  return (
    <div style={{ padding: "32px", maxWidth: 900 }}>
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
          {/* ── Insights summary stats ─────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            {/* Total proposals */}
            <div
              style={{
                padding: "16px",
                background: "var(--allura-surface-white)",
                border: "1px solid var(--allura-border-default)",
                borderRadius: "10px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--allura-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: '"IBM Plex Mono", monospace',
                  marginBottom: "6px",
                }}
              >
                Total Proposals
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--allura-text-primary)" }}>
                {totalProposals}
              </div>
            </div>

            {/* Lifecycle stage badge */}
            <div
              style={{
                padding: "16px",
                background: "var(--allura-surface-white)",
                border: "1px solid var(--allura-border-default)",
                borderRadius: "10px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--allura-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: '"IBM Plex Mono", monospace',
                  marginBottom: "6px",
                }}
              >
                Lifecycle Stage
              </div>
              {stage ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: stage.bg,
                    color: stage.text,
                    border: `1px solid ${stage.border}`,
                    marginTop: "4px",
                  }}
                >
                  {stage.label}
                </span>
              ) : null}
            </div>

            {/* Backfill runs */}
            <div
              style={{
                padding: "16px",
                background: "var(--allura-surface-white)",
                border: "1px solid var(--allura-border-default)",
                borderRadius: "10px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--allura-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: '"IBM Plex Mono", monospace',
                  marginBottom: "6px",
                }}
              >
                Backfill (24h)
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--allura-green)" }}>
                {snapshot.backfillRuns24h}
              </div>
            </div>

            {/* Promotion confidence bar */}
            <div
              style={{
                padding: "16px",
                background: "var(--allura-surface-white)",
                border: "1px solid var(--allura-border-default)",
                borderRadius: "10px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--allura-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: '"IBM Plex Mono", monospace',
                  marginBottom: "6px",
                }}
              >
                Promo Rate (7d)
              </div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--allura-text-primary)", marginBottom: "8px" }}>
                {confidence}%
              </div>
              {/* Confidence bar */}
              <div
                style={{
                  height: "4px",
                  borderRadius: "2px",
                  background: "var(--allura-gray-200)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${confidence}%`,
                    borderRadius: "2px",
                    background: confidence >= 70
                      ? "var(--allura-green)"
                      : confidence >= 40
                        ? "var(--allura-gold)"
                        : "var(--allura-red)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          </div>

          {/* ── HITL promotion gate notice ─────────────────────────────────── */}
          {snapshot.proposalsPending > 0 ? (
            <div
              style={{
                padding: "12px 16px",
                background: "var(--allura-warning-light)",
                border: "1px solid var(--allura-gold)",
                borderRadius: "10px",
                marginBottom: "16px",
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

          {/* ── Curator Pipeline section ───────────────────────────────────── */}
          <div style={sectionStyle}>
            <div style={sectionHeadStyle}>
              <span style={sectionTitleStyle}>Curator Pipeline</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 20,
                  height: 20,
                  borderRadius: 999,
                  background: snapshot.proposalsPending > 0
                    ? "var(--allura-badge-active-bg)"
                    : "var(--allura-disabled-bg)",
                  color: snapshot.proposalsPending > 0
                    ? "var(--allura-white)"
                    : "var(--allura-text-muted)",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "0 6px",
                }}
              >
                {snapshot.proposalsPending}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              }}
            >
              {(
                [
                  {
                    label: "Pending",
                    value: snapshot.proposalsPending,
                    badge: {
                      label: "awaiting",
                      bg: "var(--allura-warning-light)",
                      text: "var(--allura-warning-text)",
                    },
                    accent: snapshot.proposalsPending > 0 ? "var(--allura-gold)" : "var(--allura-gray-500)",
                  },
                  {
                    label: "Approved (7d)",
                    value: snapshot.proposalsApproved7d,
                    badge: {
                      label: "crystallized",
                      bg: "var(--allura-success-light)",
                      text: "var(--allura-success-text)",
                    },
                    accent: "var(--allura-green)",
                  },
                  {
                    label: "Rejected (7d)",
                    value: snapshot.proposalsRejected7d,
                    badge: {
                      label: "rejected",
                      bg: "var(--allura-error-light)",
                      text: "var(--allura-error-text)",
                    },
                    accent: snapshot.proposalsRejected7d > 0 ? "var(--allura-red)" : "var(--allura-gray-500)",
                  },
                ] as const
              ).map((stat, idx) => (
                <div
                  key={stat.label}
                  style={{
                    padding: "16px 20px",
                    borderRight: idx < 2 ? "1px solid var(--allura-border-row)" : undefined,
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--allura-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                  >
                    {stat.label}
                  </span>
                  <span style={{ fontSize: "22px", fontWeight: 700, color: stat.accent }}>{stat.value}</span>
                  {/* Status badge */}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      alignSelf: "flex-start",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: stat.badge.bg,
                      color: stat.badge.text,
                    }}
                  >
                    {stat.badge.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Background Activity section ────────────────────────────────── */}
          <div style={sectionStyle}>
            <div style={sectionHeadStyle}>
              <span style={sectionTitleStyle}>Background Activity</span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              }}
            >
              {(
                [
                  {
                    label: "Proposals (24h)",
                    value: snapshot.proposalsCreated24h,
                    accent: "var(--allura-blue)",
                  },
                  {
                    label: "Backfill Runs (24h)",
                    value: snapshot.backfillRuns24h,
                    accent: "var(--allura-green)",
                  },
                  {
                    label: "Last Proposal",
                    value: snapshot.lastProposalAt
                      ? new Date(snapshot.lastProposalAt).toLocaleDateString()
                      : "None",
                    accent: snapshot.lastProposalAt ? "var(--allura-gold)" : "var(--allura-gray-500)",
                  },
                ] as const
              ).map((stat, idx) => (
                <div
                  key={stat.label}
                  style={{
                    padding: "16px 20px",
                    borderRight: idx < 2 ? "1px solid var(--allura-border-row)" : undefined,
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--allura-text-muted)",
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

          {/* ── Promotion mode ─────────────────────────────────────────────── */}
          <div style={{ ...sectionStyle, marginBottom: 0 }}>
            <div style={sectionHeadStyle}>
              <span style={sectionTitleStyle}>Promotion Configuration</span>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "13px", color: "var(--allura-text-secondary)", fontWeight: 500 }}>
                Mode
              </span>
              <code
                style={{
                  fontSize: "12px",
                  fontFamily: '"IBM Plex Mono", monospace',
                  color: snapshot.promotionMode === "soc2"
                    ? "var(--allura-gold)"
                    : snapshot.promotionMode === "auto"
                      ? "var(--allura-green)"
                      : "var(--allura-gray-500)",
                  background: "var(--allura-gray-100)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  textTransform: "uppercase",
                }}
              >
                {snapshot.promotionMode}
              </code>
              <span style={{ fontSize: "12px", color: "var(--allura-text-muted)" }}>
                &mdash;{" "}
                {snapshot.promotionMode === "soc2"
                  ? "all promotions require human approval"
                  : snapshot.promotionMode === "auto"
                    ? "high-scoring proposals auto-promote"
                    : "not configured"}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
