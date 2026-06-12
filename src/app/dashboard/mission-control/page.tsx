import type { Metadata } from "next"
import { getPool } from "@/lib/postgres/connection"
import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"

export const metadata: Metadata = {
  title: "Command Center",
}

export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

interface Run {
  id: string
  plan_id: string | null
  status: string
  created_at: Date
}

interface WorkItem {
  id: string
  title: string
  status: string
  priority: number | null
  created_at: Date
}

interface PendingApproval {
  event_id: string
  metadata: Record<string, unknown>
  created_at: Date
}

interface RecentEvent {
  event_id: string
  event_type: string
  agent_id: string | null
  created_at: Date
}

interface CommandCenterData {
  activeRuns: Run[]
  blockedItems: WorkItem[]
  pendingApprovals: PendingApproval[]
  recentEvents: RecentEvent[]
  nextItems: WorkItem[]
}

async function loadCommandCenterData(): Promise<CommandCenterData | null> {
  let pool
  try {
    pool = getPool()
  } catch {
    return null
  }

  try {
    // 1. Active runs
    const runsResult = await pool.query<Run>(
      `SELECT id, plan_id, status, created_at
       FROM process_runs
       WHERE group_id = $1 AND status IN ('running', 'paused')
       ORDER BY created_at DESC
       LIMIT 20`,
      [GROUP_ID]
    )

    // 2. Blocked work items
    const blockedResult = await pool.query<WorkItem>(
      `SELECT id, title, status, priority, created_at
       FROM work_items
       WHERE group_id = $1 AND status = 'blocked'
       ORDER BY created_at DESC
       LIMIT 20`,
      [GROUP_ID]
    )

    // 3. Pending approvals — checkpoint_blocked events without a matching checkpoint_resumed
    const approvalsResult = await pool.query<PendingApproval>(
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
       ORDER BY e.created_at DESC
       LIMIT 20`,
      [GROUP_ID]
    )

    // 4. Recent events
    const eventsResult = await pool.query<RecentEvent>(
      `SELECT event_id, event_type, agent_id, created_at
       FROM events
       WHERE group_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [GROUP_ID]
    )

    // 5. Next ready work items
    const nextResult = await pool.query<WorkItem>(
      `SELECT id, title, status, priority, created_at
       FROM work_items
       WHERE group_id = $1 AND status = 'ready'
       ORDER BY COALESCE(priority, 999), created_at
       LIMIT 5`,
      [GROUP_ID]
    )

    return {
      activeRuns: runsResult.rows,
      blockedItems: blockedResult.rows,
      pendingApprovals: approvalsResult.rows,
      recentEvents: eventsResult.rows,
      nextItems: nextResult.rows,
    }
  } catch (err: unknown) {
    if (isConnectionError(err)) {
      return null
    }
    // Table not found or schema not yet migrated — return empty data
    return {
      activeRuns: [],
      blockedItems: [],
      pendingApprovals: [],
      recentEvents: [],
      nextItems: [],
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
  padding: "10px 20px",
  borderBottom: "1px solid #f9f8f5",
  fontSize: 13,
  color: "#374151",
}

const monoStyle: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: 11,
  color: "#6b7280",
}

const statusPillStyle = (status: string): React.CSSProperties => {
  const map: Record<string, { bg: string; color: string }> = {
    running: { bg: "#d1fae5", color: "#065f46" },
    paused: { bg: "#fef3c7", color: "#92400e" },
    blocked: { bg: "#fee2e2", color: "#991b1b" },
    ready: { bg: "#eff6ff", color: "#1d4ed8" },
  }
  const style = map[status] ?? { bg: "#f3f4f6", color: "#6b7280" }
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: style.bg,
    color: style.color,
    flexShrink: 0,
  }
}

export default async function MissionControlPage() {
  const data = await loadCommandCenterData()

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
          Cannot load Command Center. Check PostgreSQL connectivity.
        </div>
      </div>
    )
  }

  const { activeRuns, blockedItems, pendingApprovals, recentEvents, nextItems } = data

  return (
    <div style={{ padding: "32px", maxWidth: 900 }}>
      <PageHeader />

      {/* 1. Active Runs */}
      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>Active Runs</h2>
          <span style={countBadgeStyle(activeRuns.length)}>{activeRuns.length}</span>
        </div>
        {activeRuns.length === 0 ? (
          <div style={emptyStyle}>No active runs</div>
        ) : (
          activeRuns.map((run) => (
            <div key={run.id} style={rowStyle}>
              <span style={monoStyle}>{run.id.slice(0, 8)}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {run.plan_id ?? "—"}
              </span>
              <span style={statusPillStyle(run.status)}>{run.status}</span>
              <span style={monoStyle}>{formatRelativeTime(run.created_at)}</span>
            </div>
          ))
        )}
      </div>

      {/* 2. Blocked */}
      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>Blocked</h2>
          <span style={countBadgeStyle(blockedItems.length)}>{blockedItems.length}</span>
        </div>
        {blockedItems.length === 0 ? (
          <div style={emptyStyle}>Nothing blocked</div>
        ) : (
          blockedItems.map((item) => (
            <div key={item.id} style={rowStyle}>
              <span style={monoStyle}>{item.id.slice(0, 8)}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
              <span style={statusPillStyle(item.status)}>{item.status}</span>
              <span style={monoStyle}>{formatRelativeTime(item.created_at)}</span>
            </div>
          ))
        )}
      </div>

      {/* 3. Pending Approvals */}
      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>Pending Approvals</h2>
          <span style={countBadgeStyle(pendingApprovals.length)}>{pendingApprovals.length}</span>
        </div>
        {pendingApprovals.length === 0 ? (
          <div style={emptyStyle}>No pending approvals</div>
        ) : (
          pendingApprovals.map((approval) => (
            <div key={approval.event_id} style={rowStyle}>
              <span style={monoStyle}>{approval.event_id.slice(0, 8)}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(approval.metadata?.checkpoint_id as string) ?? approval.event_id}
              </span>
              <span style={monoStyle}>{formatRelativeTime(approval.created_at)}</span>
            </div>
          ))
        )}
      </div>

      {/* 4. Recent Activity */}
      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>Recent Activity</h2>
          <span style={countBadgeStyle(recentEvents.length)}>{recentEvents.length}</span>
        </div>
        {recentEvents.length === 0 ? (
          <div style={emptyStyle}>No recent events</div>
        ) : (
          recentEvents.map((event) => (
            <div key={event.event_id} style={rowStyle}>
              <span style={monoStyle}>{event.event_id.slice(0, 8)}</span>
              <span style={{ flex: 1 }}>{event.event_type}</span>
              <span style={{ ...monoStyle, color: "#374151" }}>{event.agent_id ?? "—"}</span>
              <span style={monoStyle}>{formatRelativeTime(event.created_at)}</span>
            </div>
          ))
        )}
      </div>

      {/* 5. Up Next */}
      <div style={{ ...sectionStyle, marginBottom: 0 }}>
        <div style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>Up Next</h2>
          <span style={countBadgeStyle(nextItems.length)}>{nextItems.length}</span>
        </div>
        {nextItems.length === 0 ? (
          <div style={emptyStyle}>Nothing ready to start</div>
        ) : (
          nextItems.map((item) => (
            <div key={item.id} style={rowStyle}>
              <span style={monoStyle}>{item.id.slice(0, 8)}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
              {item.priority !== null && (
                <span style={monoStyle}>p{item.priority}</span>
              )}
              <span style={statusPillStyle("ready")}>ready</span>
              <span style={monoStyle}>{formatRelativeTime(item.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PageHeader() {
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
        Operations
      </p>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--allura-charcoal)",
          letterSpacing: "-0.01em",
          margin: "0 0 4px",
        }}
      >
        Command Center
      </h1>
      <p style={{ fontSize: 14, color: "var(--allura-gray-500)", margin: 0 }}>
        Live view of runs, blockers, approvals, activity, and what happens next.
      </p>
    </div>
  )
}
