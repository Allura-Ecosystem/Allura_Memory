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
  created_at: Date
}

interface ApprovalsData {
  checkpointApprovals: CheckpointApproval[]
  curatorProposals: CuratorProposal[]
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

    // 2. Pending curator proposals
    const proposalsResult = await pool.query<CuratorProposal>(
      `SELECT id, content, score, reasoning, tier, status, created_at
       FROM canonical_proposals
       WHERE group_id = $1 AND status = 'pending'
       ORDER BY score DESC, created_at ASC
       LIMIT 50`,
      [GROUP_ID],
    )

    return {
      checkpointApprovals: checkpointsResult.rows,
      curatorProposals: proposalsResult.rows,
    }
  } catch (err: unknown) {
    if (isConnectionError(err)) {
      return null
    }
    return {
      checkpointApprovals: [],
      curatorProposals: [],
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

  const { checkpointApprovals, curatorProposals } = data
  const totalPending = checkpointApprovals.length + curatorProposals.length

  return (
    <div style={{ padding: "32px", maxWidth: 900 }}>
      <PageHeader totalPending={totalPending} />

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
          curatorProposals.map((proposal) => (
            <div key={proposal.id} style={rowStyle}>
              <span style={monoStyle}>{proposal.id.slice(0, 8)}</span>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div
                  style={{
                    fontWeight: 500,
                    color: "var(--allura-text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 13,
                  }}
                >
                  {typeof proposal.content === "string"
                    ? proposal.content.slice(0, 120)
                    : JSON.stringify(proposal.content).slice(0, 120)}
                </div>
                {proposal.reasoning && (
                  <div
                    style={{
                      ...monoStyle,
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {proposal.reasoning.slice(0, 80)}
                  </div>
                )}
              </div>
              {proposal.tier && (
                <span style={{ ...monoStyle, color: "var(--allura-text-secondary)" }}>{proposal.tier}</span>
              )}
              <span style={scorePillStyle(proposal.score)}>
                {(proposal.score * 100).toFixed(0)}%
              </span>
              <span style={monoStyle}>{formatRelativeTime(proposal.created_at)}</span>
              <ApprovalActions
                type="proposal"
                id={proposal.id}
              />
            </div>
          ))
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
