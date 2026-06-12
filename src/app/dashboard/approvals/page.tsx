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
  border: "1px solid #e8e3d8",
  borderRadius: 10,
  marginBottom: 16,
  background: "#fff",
  overflow: "hidden",
}

const sectionHeadStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 20px",
  borderBottom: "1px solid #f0ece0",
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#1a1a1a",
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
  background: count > 0 ? "#2563eb" : "#f3f4f6",
  color: count > 0 ? "#fff" : "#6b7280",
  fontSize: 11,
  fontWeight: 700,
  padding: "0 6px",
})

const emptyStyle: React.CSSProperties = {
  padding: "16px 20px",
  fontSize: 13,
  color: "#9ca3af",
  fontStyle: "italic",
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 20px",
  borderBottom: "1px solid #f9f8f5",
  fontSize: 13,
  color: "#374151",
}

const monoStyle: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: 11,
  color: "#6b7280",
}

const scorePillStyle = (score: number): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  background: score >= 0.8 ? "#d1fae5" : score >= 0.6 ? "#fef3c7" : "#fee2e2",
  color: score >= 0.8 ? "#065f46" : score >= 0.6 ? "#92400e" : "#991b1b",
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
            border: "1px solid #fecaca",
            borderRadius: 10,
            background: "#fff",
            color: "#991b1b",
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
                      color: "#1a1a1a",
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
                <span style={{ ...monoStyle, color: "#f59e0b" }}>
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
                    color: "#374151",
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
                <span style={{ ...monoStyle, color: "#374151" }}>{proposal.tier}</span>
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
              background: "#ef4444",
              color: "#fff",
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
