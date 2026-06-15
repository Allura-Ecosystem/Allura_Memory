import type { Metadata } from "next"
import { getPool } from "@/lib/postgres/connection"
import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"
import ApprovalActions from "./approval-actions"

export const metadata: Metadata = {
  title: "Approvals",
}

export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

interface CheckpointApproval {
  event_id: string
  metadata: Record<string, unknown>
  created_at: Date
}

interface CuratorProposal {
  id: string
  content: string
  score: number
  reasoning: string | null
  tier: string | null
  status: string
  agent_id: string | null
  created_at: Date
}

interface KpiData {
  pendingProposals: number
  pendingCheckpoints: number
  approvedToday: number
  rejectedToday: number
}

interface ApprovalsData {
  checkpointApprovals: CheckpointApproval[]
  curatorProposals: CuratorProposal[]
  kpi: KpiData
}

async function loadApprovalsData(): Promise<ApprovalsData | null> {
  let pool
  try {
    pool = getPool()
  } catch {
    return null
  }

  try {
    // 1. Pending checkpoint approvals — oldest first (longest waiting)
    const checkpointsResult = await pool.query<CheckpointApproval>(
      `SELECT e.event_id, e.metadata, e.created_at
       FROM events e
       WHERE e.group_id = $1
         AND e.event_type = 'checkpoint_blocked'
         AND NOT EXISTS (
           SELECT 1 FROM events r
           WHERE r.group_id = $1
             AND r.event_type = 'checkpoint_resumed'
             AND r.metadata->>'checkpoint_id' = e.metadata->>'checkpoint_id'
         )
       ORDER BY e.created_at ASC
       LIMIT 50`,
      [GROUP_ID],
    )

    // 2. Pending curator proposals with agent_id from originating event via trace_ref (BIGINT FK)
    const proposalsResult = await pool.query<CuratorProposal>(
      `SELECT
         cp.id,
         cp.content,
         cp.score,
         cp.reasoning,
         cp.tier,
         cp.status,
         cp.created_at,
         e.agent_id
       FROM canonical_proposals cp
       LEFT JOIN events e
         ON e.id = cp.trace_ref
         AND e.group_id = $1
       WHERE cp.group_id = $1 AND cp.status = 'pending'
       ORDER BY cp.score DESC, cp.created_at ASC
       LIMIT 50`,
      [GROUP_ID],
    )

    // 3. KPI counts
    const kpiResult = await pool.query<{
      pending_proposals: string
      approved_today: string
      rejected_today: string
    }>(
      `SELECT
         (SELECT COUNT(*) FROM canonical_proposals WHERE group_id = $1 AND status = 'pending') AS pending_proposals,
         (SELECT COUNT(*) FROM canonical_proposals WHERE group_id = $1 AND status = 'approved' AND decided_at >= CURRENT_DATE) AS approved_today,
         (SELECT COUNT(*) FROM canonical_proposals WHERE group_id = $1 AND status = 'rejected' AND decided_at >= CURRENT_DATE) AS rejected_today`,
      [GROUP_ID],
    )

    const kpiRow = kpiResult.rows[0]
    const kpi: KpiData = {
      pendingProposals: parseInt(kpiRow?.pending_proposals ?? "0", 10),
      pendingCheckpoints: checkpointsResult.rows.length,
      approvedToday: parseInt(kpiRow?.approved_today ?? "0", 10),
      rejectedToday: parseInt(kpiRow?.rejected_today ?? "0", 10),
    }

    return {
      checkpointApprovals: checkpointsResult.rows,
      curatorProposals: proposalsResult.rows,
      kpi,
    }
  } catch (err: unknown) {
    if (isConnectionError(err)) {
      return null
    }
    return {
      checkpointApprovals: [],
      curatorProposals: [],
      kpi: { pendingProposals: 0, pendingCheckpoints: 0, approvedToday: 0, rejectedToday: 0 },
    }
  }
}

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const diff = now - new Date(date).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Derive risk tier from score: high score = low risk */
function scoreToRisk(score: number): "low" | "medium" | "high" {
  if (score >= 0.8) return "low"
  if (score >= 0.6) return "medium"
  return "high"
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

const countBadgeStyle = (count: number): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 20,
  borderRadius: 999,
  background: count > 0 ? "var(--allura-badge-active-bg)" : "var(--allura-disabled-bg)",
  color: count > 0 ? "var(--allura-white)" : "var(--allura-text-muted)",
  fontSize: 11,
  fontWeight: 700,
  padding: "0 6px",
})

const emptyStyle: React.CSSProperties = {
  padding: "16px 20px",
  fontSize: 13,
  color: "var(--allura-text-faint)",
  fontStyle: "italic",
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 20px",
  borderBottom: "1px solid var(--allura-border-row)",
  fontSize: 13,
  color: "var(--allura-text-secondary)",
}

const monoStyle: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: 11,
  color: "var(--allura-text-muted)",
}

const scorePillStyle = (score: number): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  background: score >= 0.8 ? "var(--allura-success-light)" : score >= 0.6 ? "var(--allura-warning-light)" : "var(--allura-error-light)",
  color: score >= 0.8 ? "var(--allura-success-text)" : score >= 0.6 ? "var(--allura-warning-text)" : "var(--allura-error-text)",
  flexShrink: 0,
})

const riskBadgeStyle = (risk: "low" | "medium" | "high"): React.CSSProperties => {
  const palette = {
    low: { bg: "var(--allura-success-light)", color: "var(--allura-success-text)", border: "var(--allura-success-border)" },
    medium: { bg: "var(--allura-warning-light)", color: "var(--allura-warning-text)", border: "var(--allura-warning-light)" },
    high: { bg: "var(--allura-error-light)", color: "var(--allura-error-text)", border: "var(--allura-error-border)" },
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 7px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    border: `1px solid ${palette[risk].border}`,
    background: palette[risk].bg,
    color: palette[risk].color,
    flexShrink: 0,
  }
}

// ── KPI row ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: number | string
  accent?: "blue" | "green" | "red" | "default"
}

function KpiCard({ label, value, accent = "default" }: KpiCardProps) {
  const accentColor = {
    blue: "var(--allura-blue)",
    green: "var(--allura-green)",
    red: "var(--allura-red)",
    default: "var(--allura-text-primary)",
  }[accent]

  return (
    <div
      style={{
        flex: 1,
        minWidth: 120,
        padding: "16px 20px",
        border: "1px solid var(--allura-border-default)",
        borderRadius: 10,
        background: "var(--allura-surface-white)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--allura-text-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: accentColor,
          lineHeight: 1.1,
          fontFamily: '"IBM Plex Mono", monospace',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function KpiRow({ kpi }: { kpi: KpiData }) {
  const totalPending = kpi.pendingProposals + kpi.pendingCheckpoints
  const totalDecidedToday = kpi.approvedToday + kpi.rejectedToday
  const promotionRate =
    totalDecidedToday > 0
      ? `${Math.round((kpi.approvedToday / totalDecidedToday) * 100)}%`
      : "—"

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        marginBottom: 24,
        flexWrap: "wrap",
      }}
    >
      <KpiCard label="Pending" value={totalPending} accent={totalPending > 0 ? "blue" : "default"} />
      <KpiCard label="Approved Today" value={kpi.approvedToday} accent={kpi.approvedToday > 0 ? "green" : "default"} />
      <KpiCard label="Rejected Today" value={kpi.rejectedToday} accent={kpi.rejectedToday > 0 ? "red" : "default"} />
      <KpiCard label="Promotion Rate" value={promotionRate} />
    </div>
  )
}

export default async function ApprovalsPage() {
  const data = await loadApprovalsData()

  if (!data) {
    return (
      <div style={{ padding: "32px" }}>
        <PageHeader />
        <div
          style={{
            padding: "24px 20px",
            border: "1px solid var(--allura-error-border)",
            borderRadius: 10,
            background: "var(--allura-surface-white)",
            color: "var(--allura-error-text)",
            fontSize: 14,
          }}
        >
          Cannot load Approvals. Check PostgreSQL connectivity.
        </div>
      </div>
    )
  }

  const { checkpointApprovals, curatorProposals, kpi } = data
  const totalPending = checkpointApprovals.length + curatorProposals.length

  return (
    <div style={{ padding: "32px", maxWidth: 960 }}>
      <PageHeader totalPending={totalPending} />

      {/* KPI row */}
      <KpiRow kpi={kpi} />

      {/* 1. Checkpoint Approvals */}
      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>Checkpoint Approvals</h2>
          <span style={countBadgeStyle(checkpointApprovals.length)}>
            {checkpointApprovals.length}
          </span>
          <span style={{ ...monoStyle, marginLeft: "auto", fontSize: 12 }}>
            sorted by oldest first
          </span>
        </div>
        {checkpointApprovals.length === 0 ? (
          <div style={emptyStyle}>No pending checkpoint approvals</div>
        ) : (
          checkpointApprovals.map((approval) => {
            const checkpointId = (approval.metadata?.checkpoint_id as string) ?? approval.event_id
            const runId = approval.metadata?.run_id as string | undefined
            const label = approval.metadata?.label as string | undefined
            return (
              <div key={approval.event_id} style={rowStyle}>
                <span style={monoStyle}>{checkpointId.slice(0, 8)}</span>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--allura-text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label ?? checkpointId}
                  </div>
                  {runId && (
                    <div style={{ ...monoStyle, marginTop: 2 }}>
                      run: {runId.slice(0, 12)}
                    </div>
                  )}
                </div>
                <span style={{ ...monoStyle, color: "var(--allura-text-amber)" }}>
                  {formatRelativeTime(approval.created_at)}
                </span>
                <ApprovalActions
                  type="checkpoint"
                  id={approval.event_id}
                  checkpointId={checkpointId}
                />
              </div>
            )
          })
        )}
      </div>

      {/* 2. Curator Proposals */}
      <div style={{ ...sectionStyle, marginBottom: 0 }}>
        <div style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>Curator Proposals</h2>
          <span style={countBadgeStyle(curatorProposals.length)}>
            {curatorProposals.length}
          </span>
          <span style={{ ...monoStyle, marginLeft: "auto", fontSize: 12 }}>
            sorted by score desc
          </span>
        </div>
        {curatorProposals.length === 0 ? (
          <div style={emptyStyle}>No pending curator proposals</div>
        ) : (
          curatorProposals.map((proposal) => {
            const risk = scoreToRisk(proposal.score)
            return (
              <div key={proposal.id} style={{ ...rowStyle, alignItems: "flex-start", gap: 0, flexDirection: "column", padding: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px 8px", width: "100%" }}>
                  {/* ID */}
                  <span style={monoStyle}>{proposal.id.slice(0, 8)}</span>

                  {/* Risk badge */}
                  <span style={riskBadgeStyle(risk)}>{risk} risk</span>

                  {/* Tier */}
                  {proposal.tier && (
                    <span style={{ ...monoStyle, color: "var(--allura-text-secondary)" }}>{proposal.tier}</span>
                  )}

                  {/* Score pill */}
                  <span style={scorePillStyle(proposal.score)}>
                    {(proposal.score * 100).toFixed(0)}%
                  </span>

                  {/* Agent */}
                  {proposal.agent_id && (
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: '"IBM Plex Mono", monospace',
                        color: "var(--allura-blue)",
                        background: "var(--allura-info-bg)",
                        border: "1px solid var(--allura-info-border)",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      {proposal.agent_id}
                    </span>
                  )}

                  {/* Timestamp pushed right */}
                  <span style={{ ...monoStyle, color: "var(--allura-text-amber)", marginLeft: "auto" }}>
                    {formatRelativeTime(proposal.created_at)}
                  </span>
                </div>

                {/* Content preview */}
                <div style={{ padding: "0 20px 8px", width: "100%" }}>
                  <div
                    style={{
                      fontWeight: 500,
                      color: "var(--allura-text-secondary)",
                      fontSize: 13,
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {typeof proposal.content === "string"
                      ? proposal.content.slice(0, 240)
                      : JSON.stringify(proposal.content).slice(0, 240)}
                  </div>
                  {proposal.reasoning && (
                    <div
                      style={{
                        ...monoStyle,
                        marginTop: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {proposal.reasoning.slice(0, 100)}
                    </div>
                  )}
                </div>

                {/* Actions row */}
                <div style={{ padding: "0 20px 12px", display: "flex", justifyContent: "flex-end", width: "100%" }}>
                  <ApprovalActions
                    type="proposal"
                    id={proposal.id}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function PageHeader({ totalPending }: { totalPending?: number }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--allura-blue)",
          margin: "0 0 8px",
        }}
      >
        Governance
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--allura-charcoal)",
            letterSpacing: "-0.01em",
            margin: "0 0 4px",
          }}
        >
          Approvals
        </h1>
        {totalPending !== undefined && totalPending > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 24,
              height: 24,
              borderRadius: 999,
              background: "var(--allura-notify-red)",
              color: "var(--allura-white)",
              fontSize: 12,
              fontWeight: 700,
              padding: "0 8px",
              marginBottom: 4,
            }}
          >
            {totalPending}
          </span>
        )}
      </div>
      <p style={{ fontSize: 14, color: "var(--allura-gray-500)", margin: 0 }}>
        Pending checkpoint approvals and curator proposals. Oldest items first.
      </p>
    </div>
  )
}
