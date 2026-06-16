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
      // Table may not exist yet — return 0 as empty rather than error
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

// ── Components ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  kpi,
  accent,
  description,
}: {
  label: string
  kpi: KpiValue
  accent: string
  description: string
}) {
  const isDegraded = kpi.status === "degraded"
  const isEmpty = kpi.status === "empty"

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e8e3d8",
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af" }}>
        {label}
      </div>
      <div style={{ fontSize: 36, fontWeight: 700, color: isDegraded ? "#9ca3af" : accent, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
        {isDegraded ? "—" : (kpi.value ?? 0)}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{description}</div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: isDegraded ? "#ef4444" : isEmpty ? "#9ca3af" : "#16a34a",
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: 4,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isDegraded ? "#ef4444" : isEmpty ? "#9ca3af" : "#16a34a",
            flexShrink: 0,
          }}
        />
        {isDegraded ? "Degraded" : isEmpty ? "Empty" : "Live"}
        <span title={kpi.source} style={{ color: "#c4bfb5", fontSize: 9 }}>· {kpi.source}</span>
      </div>
    </div>
  )
}

function HealthBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: 999,
        background: ok ? "rgba(22,163,74,0.08)" : "rgba(239,68,68,0.08)",
        border: `1px solid ${ok ? "rgba(22,163,74,0.2)" : "rgba(239,68,68,0.2)"}`,
        fontSize: 12,
        fontWeight: 600,
        color: ok ? "#16a34a" : "#ef4444",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: ok ? "#16a34a" : "#ef4444",
        }}
      />
      {label}
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
    // fall back to allura-system
  }

  const data = await fetchOverview(groupId)

  const freshnessMs = Date.now() - new Date(data.fetchedAt).getTime()
  const freshnessText = freshnessMs < 2000 ? "just now" : `${Math.round(freshnessMs / 1000)}s ago`

  return (
    <div
      style={{
        padding: "32px",
        fontFamily: '"IBM Plex Sans", sans-serif',
        background: "#faf7f0",
        minHeight: "100%",
      }}
    >
      {/* Start-here onboarding card (Fix 3) */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e8e3d8",
          borderLeft: "4px solid #2563eb",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 24,
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "rgba(37,99,235,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>
            Welcome to Allura Memory
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px", lineHeight: 1.6 }}>
            Allura Memory stores, organises, and surfaces your AI agents&apos; memories — so they remember what matters across every session.
          </p>
          <a
            href="/dashboard/guard"
            style={{ fontSize: 13, fontWeight: 600, color: "#2563eb", textDecoration: "none" }}
          >
            Create a workspace and set up an agent key in Allura Guard →
          </a>
        </div>
      </div>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#2563eb",
            margin: "0 0 4px",
          }}
        >
          Mission Control
        </p>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#1a1a1a",
            margin: "0 0 6px",
            letterSpacing: "-0.02em",
          }}
        >
          Overview
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
          Live snapshot for <strong style={{ color: "#374151" }}>Organization: {groupId}</strong> · fetched {freshnessText}
        </p>
      </div>

      {/* System health row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
        <HealthBadge label="Memory store" ok={data.pgHealthy} />
        <HealthBadge label="Knowledge graph" ok={false} />
        <HealthBadge label="MCP Brain" ok={false} />
      </div>

      {/* KPI grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 36,
        }}
      >
        <KpiCard
          label="Memories"
          kpi={data.memories}
          accent="#2563eb"
          description="Total memories stored"
        />
        <KpiCard
          label="Review queue"
          kpi={data.curatorQueue}
          accent="#ea580c"
          description="Memories waiting for human approval"
        />
        <KpiCard
          label="Connected agents"
          kpi={data.connectedAgents}
          accent="#16a34a"
          description="Active agent keys"
        />
        <KpiCard
          label="Workspaces"
          kpi={data.workspaces}
          accent="#7c3aed"
          description="Registered workspaces"
        />
      </div>

      {/* Source note */}
      <p
        style={{
          fontSize: 11,
          color: "#9ca3af",
          margin: 0,
          fontFamily: '"IBM Plex Mono", monospace',
        }}
      >
        Organization: {groupId} · fetched: {data.fetchedAt}
      </p>
    </div>
  )
}
