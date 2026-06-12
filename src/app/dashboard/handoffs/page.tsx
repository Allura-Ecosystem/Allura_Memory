import type { Metadata } from "next"
import { getPool } from "@/lib/postgres/connection"
import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"
import HandoffActions from "./handoff-actions"

export const metadata: Metadata = {
  title: "Handoffs",
}

export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

interface HandoffRow {
  id: string
  from_actor_id: string
  to_actor_id: string
  work_item_id: string | null
  message: string | null
  status: string
  created_at: Date
  acknowledged_at: Date | null
}

type FilterStatus = "pending" | "acknowledged" | "rejected" | "all"

interface HandoffsData {
  handoffs: HandoffRow[]
  filterStatus: FilterStatus
}

async function loadHandoffs(filterStatus: FilterStatus): Promise<HandoffsData | null> {
  let pool
  try {
    pool = getPool()
  } catch {
    return null
  }

  try {
    let rows: HandoffRow[]

    if (filterStatus === "all") {
      const result = await pool.query<HandoffRow>(
        `SELECT id, from_actor_id, to_actor_id, work_item_id, message, status, created_at, acknowledged_at
         FROM handoffs
         WHERE group_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [GROUP_ID],
      )
      rows = result.rows
    } else {
      const result = await pool.query<HandoffRow>(
        `SELECT id, from_actor_id, to_actor_id, work_item_id, message, status, created_at, acknowledged_at
         FROM handoffs
         WHERE group_id = $1 AND status = $2
         ORDER BY created_at ASC
         LIMIT 100`,
        [GROUP_ID, filterStatus],
      )
      rows = result.rows
    }

    return { handoffs: rows, filterStatus }
  } catch (err: unknown) {
    if (isConnectionError(err)) {
      return null
    }
    return { handoffs: [], filterStatus }
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

const statusPillStyle = (status: string): React.CSSProperties => {
  const map: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#fef3c7", color: "#92400e" },
    acknowledged: { bg: "#d1fae5", color: "#065f46" },
    rejected: { bg: "#fee2e2", color: "#991b1b" },
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

interface PageSearchParams {
  filter?: string
}

export default async function HandoffsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>
}) {
  const resolvedParams = await searchParams
  const rawFilter = resolvedParams.filter ?? "pending"
  const filterStatus: FilterStatus =
    rawFilter === "acknowledged" || rawFilter === "rejected" || rawFilter === "all"
      ? rawFilter
      : "pending"

  const data = await loadHandoffs(filterStatus)

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
          Cannot load Handoffs. Check PostgreSQL connectivity.
        </div>
      </div>
    )
  }

  const { handoffs } = data

  return (
    <div style={{ padding: "32px", maxWidth: 900 }}>
      <PageHeader />

      {/* Filter tabs */}
      <FilterTabs active={filterStatus} />

      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>
            {filterStatus === "all" ? "All Handoffs" : `${capitalize(filterStatus)} Handoffs`}
          </h2>
          <span style={countBadgeStyle(handoffs.length)}>{handoffs.length}</span>
        </div>
        {handoffs.length === 0 ? (
          <div style={emptyStyle}>No {filterStatus === "all" ? "" : filterStatus + " "}handoffs</div>
        ) : (
          handoffs.map((handoff) => (
            <div key={handoff.id} style={rowStyle}>
              <span style={monoStyle}>{handoff.id.slice(0, 8)}</span>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div
                  style={{
                    fontWeight: 500,
                    color: "#374151",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ color: "var(--allura-blue)" }}>{handoff.from_actor_id}</span>
                  {" → "}
                  <span style={{ color: "#0f766e" }}>{handoff.to_actor_id}</span>
                </div>
                {handoff.work_item_id && (
                  <div style={{ ...monoStyle, marginTop: 2 }}>
                    work item: {handoff.work_item_id.slice(0, 12)}
                  </div>
                )}
                {handoff.message && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {handoff.message}
                  </div>
                )}
              </div>
              <span style={statusPillStyle(handoff.status)}>{handoff.status}</span>
              <span style={monoStyle}>{formatRelativeTime(handoff.created_at)}</span>
              {handoff.status === "pending" && (
                <HandoffActions id={handoff.id} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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
        Work Plane
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
        Handoffs
      </h1>
      <p style={{ fontSize: 14, color: "var(--allura-gray-500)", margin: 0 }}>
        Actor-to-actor handoffs. Pending items need acknowledgement or rejection.
      </p>
    </div>
  )
}

function FilterTabs({ active }: { active: FilterStatus }) {
  const tabs: { label: string; value: FilterStatus }[] = [
    { label: "Pending", value: "pending" },
    { label: "Acknowledged", value: "acknowledged" },
    { label: "Rejected", value: "rejected" },
    { label: "All", value: "all" },
  ]

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginBottom: 16,
        background: "#f9f8f5",
        borderRadius: 8,
        padding: 4,
        width: "fit-content",
        border: "1px solid #e8e3d8",
      }}
    >
      {tabs.map((tab) => (
        <a
          key={tab.value}
          href={`/dashboard/handoffs?filter=${tab.value}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: active === tab.value ? 600 : 400,
            color: active === tab.value ? "#2563eb" : "#6b7280",
            background: active === tab.value ? "#fff" : "transparent",
            textDecoration: "none",
            boxShadow: active === tab.value ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            transition: "background 0.15s, color 0.15s",
          }}
          aria-current={active === tab.value ? "page" : undefined}
        >
          {tab.label}
        </a>
      ))}
    </div>
  )
}
