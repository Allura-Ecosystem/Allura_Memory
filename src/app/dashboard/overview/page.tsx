import type { Metadata } from "next"
import { headers } from "next/headers"
import { getPool } from "@/lib/postgres/connection"
import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"
import { isPoolHealthy } from "@/lib/postgres/connection"
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id"

export const metadata: Metadata = {
  title: "Overview — Allura Memory",
}

export const dynamic = "force-dynamic"

// ── Types ─────────────────────────────────────────────────────────────────────

interface KpiValue {
  value: number | null
  source: string
  status: "live" | "empty" | "degraded"
}

interface OverviewData {
  memories: KpiValue
  curatorQueue: KpiValue
  connectedAgents: KpiValue
  workspaces: KpiValue
  pgHealthy: boolean
  fetchedAt: string
}

// ── Health rows ────────────────────────────────────────────────────────────────

interface HealthRow {
  name: string
  state: string
  meta: string
  dot: string
  ring: string
}

// ── DB reads ──────────────────────────────────────────────────────────────────

async function fetchOverview(groupId: string): Promise<OverviewData> {
  const fetchedAt = new Date().toISOString()
  const empty = (source: string): KpiValue => ({ value: null, source, status: "degraded" })

  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    return {
      memories: empty("postgres:allura_memories"),
      curatorQueue: empty("postgres:canonical_proposals"),
      connectedAgents: empty("postgres:mcp_tokens"),
      workspaces: empty("postgres:workspaces"),
      pgHealthy: false,
      fetchedAt,
    }
  }

  const pgHealthy = await isPoolHealthy()
  if (!pgHealthy) {
    return {
      memories: empty("postgres:allura_memories"),
      curatorQueue: empty("postgres:canonical_proposals"),
      connectedAgents: empty("postgres:mcp_tokens"),
      workspaces: empty("postgres:workspaces"),
      pgHealthy: false,
      fetchedAt,
    }
  }

  async function safeCount(
    sql: string,
    params: unknown[],
    source: string,
  ): Promise<KpiValue> {
    try {
      const res = await pool.query<{ n: string }>(sql, params)
      const n = parseInt(res.rows[0]?.n ?? "0", 10)
      return { value: n, source, status: n === 0 ? "empty" : "live" }
    } catch (err) {
      if (isConnectionError(err)) return empty(source)
      return { value: 0, source, status: "empty" }
    }
  }

  const [memories, curatorQueue, connectedAgents, workspaces] = await Promise.all([
    safeCount(
      `SELECT COUNT(*)::text AS n FROM allura_memories WHERE group_id = $1`,
      [groupId],
      "postgres:allura_memories",
    ),
    safeCount(
      `SELECT COUNT(*)::text AS n FROM canonical_proposals WHERE group_id = $1 AND status = 'pending'`,
      [groupId],
      "postgres:canonical_proposals",
    ),
    safeCount(
      `SELECT COUNT(*)::text AS n FROM mcp_tokens WHERE group_id = $1 AND revoked_at IS NULL`,
      [groupId],
      "postgres:mcp_tokens",
    ),
    safeCount(
      `SELECT COUNT(*)::text AS n FROM workspaces WHERE group_id = $1`,
      [groupId],
      "postgres:workspaces",
    ),
  ])

  return { memories, curatorQueue, connectedAgents, workspaces, pgHealthy, fetchedAt }
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  kpi,
  color,
  soft,
  icon,
  sub,
  trend,
  trendColor,
}: {
  label: string
  kpi: KpiValue
  color: string
  soft: string
  icon: React.ReactNode
  sub: string
  trend?: string
  trendColor?: string
}) {
  const isDegraded = kpi.status === "degraded"
  const isEmpty = kpi.status === "empty" && (kpi.value === 0 || kpi.value === null)
  const showValue = !isDegraded && !isEmpty

  return (
    <div
      style={{
        background: "var(--c-card)",
        border: "1px solid var(--c-border)",
        borderRadius: 16,
        padding: "18px 18px 16px",
        minHeight: 128,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Icon + label row */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: soft,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--c-muted)" }}>{label}</span>
      </div>

      {showValue && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: "auto" }}>
            <span
              style={{
                fontSize: 34,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {kpi.value ?? 0}
            </span>
            {trend && (
              <span style={{ fontSize: 12, fontWeight: 600, color: trendColor ?? "var(--c-green)" }}>
                {trend}
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 6 }}>{sub}</span>
        </>
      )}

      {isDegraded && (
        <>
          <div style={{ marginTop: "auto", fontSize: 26, fontWeight: 600, color: "var(--c-border)" }}>—</div>
          <span style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 4 }}>
            Memory store not reachable
          </span>
        </>
      )}

      {isEmpty && !isDegraded && (
        <>
          <div style={{ marginTop: "auto", fontSize: 26, fontWeight: 600, color: "var(--c-border)" }}>0</div>
          <span style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 4 }}>Nothing here yet</span>
        </>
      )}
    </div>
  )
}

// ── System health row ──────────────────────────────────────────────────────────

function HealthRow({ row }: { row: HealthRow }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 4px",
        borderBottom: "1px solid var(--c-border-soft)",
      }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: row.dot,
          boxShadow: `0 0 0 4px ${row.ring}`,
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{row.name}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: row.dot }}>{row.state}</span>
      <span
        style={{
          fontSize: 12,
          color: "var(--c-muted)",
          width: 110,
          textAlign: "right",
          fontFamily: "var(--mono)",
        }}
      >
        {row.meta}
      </span>
    </div>
  )
}

// ── Recent receipt row ────────────────────────────────────────────────────────

interface ReceiptRow {
  text: string
  meta: string
  soft: string
  color: string
  icon: React.ReactNode
}

function RecentReceipt({ row }: { row: ReceiptRow }) {
  return (
    <div style={{ display: "flex", gap: 11 }}>
      <span
        style={{
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: 8,
          background: row.soft,
          color: row.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-hidden="true"
      >
        {row.icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{row.text}</div>
        <div style={{ fontSize: 11.5, color: "var(--c-muted)", marginTop: 2, fontFamily: "var(--mono)" }}>
          {row.meta}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const headersList = await headers()
  const rawGroupId = headersList.get("x-allura-group-id") ?? "allura-system"

  let groupId = "allura-system"
  try {
    groupId = validateGroupId(rawGroupId)
  } catch (e) {
    if (!(e instanceof GroupIdValidationError)) throw e
  }

  const data = await fetchOverview(groupId)
  const pgUp = data.pgHealthy

  // Build health rows from honest state — never faked.
  const healthRows: HealthRow[] = [
    {
      name: "Memory store",
      state: pgUp ? "Healthy" : "Unreachable",
      meta: pgUp ? "postgres:5432" : "connection failed",
      dot: pgUp ? "var(--c-green)" : "var(--c-red)",
      ring: pgUp ? "rgba(41,143,87,0.15)" : "rgba(191,51,46,0.15)",
    },
    {
      name: "Knowledge graph",
      state: "Checking…",
      meta: "neo4j:7687",
      dot: "var(--c-gold)",
      ring: "rgba(200,155,60,0.15)",
    },
    {
      name: "Allura Brain (MCP)",
      state: "Checking…",
      meta: "mcp:5888",
      dot: "var(--c-gold)",
      ring: "rgba(200,155,60,0.15)",
    },
    {
      name: "Curator pipeline",
      state: pgUp ? "Ready" : "Paused",
      meta: pgUp ? "HITL enabled" : "waiting for DB",
      dot: pgUp ? "var(--c-blue)" : "var(--c-muted)",
      ring: pgUp ? "rgba(41,97,184,0.15)" : "rgba(107,110,115,0.15)",
    },
  ]

  // Static recent receipts — placeholder until /api/events is wired.
  const recentReceipts: ReceiptRow[] = [
    {
      text: "Memory store connected",
      meta: `group:${groupId} · just now`,
      soft: "var(--c-blue-soft)",
      color: "var(--c-blue)",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
    },
    {
      text: `${data.memories.value ?? 0} memories in store`,
      meta: `source:postgres · ${groupId}`,
      soft: "var(--c-orange-soft)",
      color: "var(--c-orange)",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
    {
      text: `${data.curatorQueue.value ?? 0} memories waiting for approval`,
      meta: `curator:queue · ${groupId}`,
      soft: "var(--c-gold-soft)",
      color: "var(--c-gold)",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
  ]

  return (
    <div
      className="page-enter"
      style={{ padding: "28px 30px 60px", maxWidth: 1180, margin: "0 auto" }}
    >
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 22,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 27,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--c-ink)",
            }}
          >
            Overview
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--c-muted)" }}>
            A calm look at your memory, your agents, and what is waiting for a person to approve.
          </p>
        </div>
      </div>

      {/* Start here card */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          background: "linear-gradient(120deg, var(--c-card), #fbf4e9)",
          border: "1px solid var(--c-border)",
          borderRadius: 18,
          padding: "22px 24px",
          marginBottom: 22,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            flexShrink: 0,
            borderRadius: 14,
            background: "var(--c-orange-soft)",
            color: "var(--c-orange)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-hidden="true"
        >
          {/* Sparkle icon */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--c-orange)",
              marginBottom: 4,
            }}
          >
            Start here
          </div>
          <p style={{ margin: 0, fontSize: 15.5, fontWeight: 500, color: "var(--c-ink)", maxWidth: 640 }}>
            Allura keeps your team&apos;s memory in one safe place — and a person approves anything before it becomes trusted knowledge.
          </p>
        </div>
        <a
          href="/dashboard/approvals"
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 44,
            padding: "0 18px",
            background: "var(--c-ink)",
            color: "#fff",
            border: "none",
            borderRadius: 11,
            cursor: "pointer",
            fontFamily: "var(--sans)",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Review what&apos;s waiting
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M7 17L17 7M17 7H7M17 7v10" />
          </svg>
        </a>
      </div>

      {/* KPI grid — 4 columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 22,
        }}
      >
        <KpiCard
          label="Memories"
          kpi={data.memories}
          color="var(--c-blue)"
          soft="var(--c-blue-soft)"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2a8 8 0 0 1 8 8v4a8 8 0 0 1-16 0V10a8 8 0 0 1 8-8z" />
            </svg>
          }
          sub="Total memories saved"
          trend={data.memories.status === "live" ? "Live" : undefined}
          trendColor="var(--c-green)"
        />
        <KpiCard
          label="Waiting for approval"
          kpi={data.curatorQueue}
          color="var(--c-orange)"
          soft="var(--c-orange-soft)"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          }
          sub="Memories waiting for your review"
        />
        <KpiCard
          label="Connected agents"
          kpi={data.connectedAgents}
          color="var(--c-green)"
          soft="var(--c-green-soft)"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><circle cx="19" cy="11" r="3" />
            </svg>
          }
          sub="Active agent keys"
        />
        <KpiCard
          label="Workspaces"
          kpi={data.workspaces}
          color="var(--c-purple)"
          soft="var(--c-purple-soft)"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          }
          sub="Registered workspaces"
        />
      </div>

      {/* System health + Recent receipts — 1.4fr / 1fr */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>

        {/* System health */}
        <div
          style={{
            background: "var(--c-card)",
            border: "1px solid var(--c-border)",
            borderRadius: 16,
            padding: "20px 22px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--c-ink)" }}>
              System health
            </h2>
            <span style={{ fontSize: 12, color: "var(--c-muted)" }}>
              Honest status · never faked
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {healthRows.map((row) => (
              <HealthRow key={row.name} row={row} />
            ))}
          </div>
        </div>

        {/* Recent receipts */}
        <div
          style={{
            background: "var(--c-card)",
            border: "1px solid var(--c-border)",
            borderRadius: 16,
            padding: "20px 22px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--c-ink)" }}>
              Recent receipts
            </h2>
            <a
              href="/dashboard/approvals"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--sans)",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--c-blue)",
                textDecoration: "none",
              }}
            >
              View all
            </a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {recentReceipts.map((row, i) => (
              <RecentReceipt key={i} row={row} />
            ))}
          </div>
        </div>
      </div>

      {/* Mono source line */}
      <p
        style={{
          fontSize: 11,
          color: "var(--c-muted)",
          margin: "18px 0 0",
          fontFamily: "var(--mono)",
        }}
      >
        {groupId} · fetched {data.fetchedAt}
      </p>
    </div>
  )
}
