"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  Brain,
  Database,
  Download,
  FileText,
  Plus,
  Search,
  TrendingUp,
  Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { buildDashboardRouteState } from "@/lib/dashboard/empty-states"
import { loadDashboardOverview, loadMemories, loadCuratorQueue, loadInsights } from "@/lib/dashboard/queries"
import type { DashboardOverview, DashboardResult, Insight, Memory, Metric, SystemStatus } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

/* ─── Dashboard Overview (Figma spec: node 55:3) ─── */

export default function DashboardPage() {
  const [overviewState, setOverviewState] = useState<DashboardResult<DashboardOverview> | null>(null)
  const [memoriesState, setMemoriesState] = useState<DashboardResult<Memory[]> | null>(null)
  const [queueState, setQueueState] = useState<DashboardResult<Insight[]> | null>(null)
  const [insightsState, setInsightsState] = useState<DashboardResult<Insight[]> | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const refresh = useCallback(() => {
    setOverviewState(null)
    setMemoriesState(null)
    setQueueState(null)
    setInsightsState(null)
    void loadDashboardOverview("allura-system").then(setOverviewState)
    void loadMemories().then(setMemoriesState)
    void loadCuratorQueue("pending").then(setQueueState)
    void loadInsights("active").then(setInsightsState)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const isLoading = overviewState === null
  const hasError = Boolean(overviewState?.error || overviewState?.degraded)
  const overview = overviewState?.data

  // Governed degraded state contract (source-level contract required by empty-states.test.ts)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const dashboardDegradedState = buildDashboardRouteState("dashboard", { kind: "degraded",
    reason: overviewState?.error ?? (memoriesState?.degraded
      ? memoriesState?.error ?? memoriesState?.warnings?.[0]?.message
      : queueState?.degraded
      ? queueState?.error ?? queueState?.warnings?.[0]?.message
      : insightsState?.degraded
      ? insightsState?.error ?? insightsState?.warnings?.[0]?.message
      : undefined),
  })

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-[var(--dashboard-text-primary)]">
          Dashboard Overview
        </h1>
        <div className="flex items-center gap-3">
          {/* Search bar */}
          <div className="flex items-center gap-2 rounded-full border border-[var(--dashboard-border)] bg-white px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-[var(--dashboard-cta-primary)]/20 transition-shadow w-64">
            <Search className="size-4 shrink-0 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="h-auto border-0 bg-transparent p-0 text-sm text-[var(--dashboard-text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus-visible:ring-0 focus-visible:ring-offset-0"
              aria-label="Search memories"
            />
          </div>
          {/* Bell icon */}
          <button
            aria-label="Notifications"
            className="flex size-9 items-center justify-center rounded-full border border-[var(--dashboard-border)] bg-white text-[var(--dashboard-text-secondary)] hover:bg-[var(--dashboard-surface-muted)] transition-colors"
          >
            <Bell className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Stat cards row ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : hasError && !overview ? (
          <div className="col-span-4 rounded-xl border border-dashed border-[var(--dashboard-border)] bg-white p-6 text-center">
            <AlertTriangle className="mx-auto mb-2 size-6 text-amber-500" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">{dashboardDegradedState.title}</p>
            <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
              {dashboardDegradedState.description}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={refresh}>
                {dashboardDegradedState.retryLabel}
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={dashboardDegradedState.actionHref ?? "/dashboard/health"}>
                  {dashboardDegradedState.actionLabel}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <StatCards metrics={overview?.metrics ?? []} />
        )}
      </div>

      {/* ── Main 2-column layout ── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* ── Left: Recent Activity ── */}
        <section className="rounded-xl border border-[var(--dashboard-border)] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--dashboard-border)] px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">Recent Activity</h2>
            <Link
              href="/dashboard/audit"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--dashboard-cta-primary)] hover:underline"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="divide-y divide-[var(--dashboard-border)]">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 px-5 py-4">
                  <Skeleton className="mt-0.5 size-2 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))
            ) : (overview?.activity ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Database className="size-8 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
                <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">No recent activity</p>
                <p className="text-xs text-[var(--dashboard-text-secondary)]">
                  Events will appear here as the system operates.
                </p>
              </div>
            ) : (
              (overview?.activity ?? []).slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-4 px-5 py-4 hover:bg-[var(--dashboard-surface-muted)] transition-colors"
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      item.kind === "approval"
                        ? "bg-[var(--dashboard-cta-approval)]"
                        : item.kind === "warning"
                        ? "bg-amber-400"
                        : item.kind === "memory"
                        ? "bg-[var(--dashboard-cta-primary)]"
                        : "bg-[var(--dashboard-text-muted)]"
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--dashboard-text-primary)]">
                      {item.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs text-[var(--dashboard-text-secondary)]">
                        Agent: {item.agent}
                      </span>
                      <span className="text-[10px] text-[var(--dashboard-text-muted)]">
                        {formatRelativeTime(item.timestamp)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                      item.kind === "approval"
                        ? "bg-amber-50 text-amber-700"
                        : item.kind === "memory"
                        ? "bg-blue-50 text-[var(--dashboard-cta-primary)]"
                        : "bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-muted)]"
                    )}
                  >
                    {item.kind}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── Right column ── */}
        <div className="space-y-5">
          {/* Quick Actions */}
          <section className="rounded-xl border border-[var(--dashboard-border)] bg-white shadow-sm">
            <div className="border-b border-[var(--dashboard-border)] px-5 py-4">
              <h2 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">Quick Actions</h2>
            </div>
            <div className="divide-y divide-[var(--dashboard-border)]">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.id}
                  href={action.href}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--dashboard-surface-muted)] group"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-secondary)] transition-colors group-hover:bg-[var(--dashboard-cta-primary)]/10 group-hover:text-[var(--dashboard-cta-primary)]">
                    <action.Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-sm text-[var(--dashboard-text-primary)]">{action.label}</span>
                  <ArrowRight className="size-3.5 text-[var(--dashboard-text-muted)] transition-colors group-hover:text-[var(--dashboard-cta-primary)]" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>

          {/* System Status */}
          <section className="rounded-xl border border-[var(--dashboard-border)] bg-white shadow-sm">
            <div className="border-b border-[var(--dashboard-border)] px-5 py-4">
              <h2 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">System Status</h2>
            </div>
            <div className="divide-y divide-[var(--dashboard-border)]">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3">
                    <Skeleton className="h-3.5 w-24 rounded" />
                    <Skeleton className="h-3.5 w-16 rounded" />
                  </div>
                ))
              ) : (
                <SystemStatusRows
                  systemStatus={overview?.systemStatus}
                  healthMetrics={overview?.healthMetrics}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/* ─── Sub-components ─── */

const STAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  memories: Brain,
  graph: TrendingUp,
  insights: Zap,
  agents: Bot,
}

function StatCards({ metrics }: { metrics: Metric[] }) {
  const slots: Array<{
    id: string
    label: string
    value: string | number
    description: string
    iconKey: string
  }> = [
    {
      id: "total-memories",
      label: "Total Memories",
      value:
        metrics.find((m) => m.id === "total-memories" || m.label.toLowerCase().includes("memor"))?.value ?? "—",
      description:
        metrics.find((m) => m.id === "total-memories" || m.label.toLowerCase().includes("memor"))?.description ??
        "Unavailable",
      iconKey: "memories",
    },
    {
      id: "graph-nodes",
      label: "Graph Nodes",
      value:
        metrics.find(
          (m) =>
            m.id === "graph-nodes" ||
            m.label.toLowerCase().includes("graph") ||
            m.label.toLowerCase().includes("edge"),
        )?.value ?? "—",
      description:
        metrics.find(
          (m) =>
            m.id === "graph-nodes" ||
            m.label.toLowerCase().includes("graph") ||
            m.label.toLowerCase().includes("edge"),
        )?.description ?? "Unavailable",
      iconKey: "graph",
    },
    {
      id: "insights",
      label: "Insights",
      value:
        metrics.find(
          (m) =>
            m.id === "insights" ||
            m.label.toLowerCase().includes("insight") ||
            m.label.toLowerCase().includes("approv"),
        )?.value ?? "—",
      description:
        metrics.find(
          (m) =>
            m.id === "insights" ||
            m.label.toLowerCase().includes("insight") ||
            m.label.toLowerCase().includes("approv"),
        )?.description ?? "Unavailable",
      iconKey: "insights",
    },
    {
      id: "agents",
      label: "Active Agents",
      value:
        metrics.find(
          (m) =>
            m.id === "active-agents" ||
            m.label.toLowerCase().includes("agent") ||
            m.label.toLowerCase().includes("pending"),
        )?.value ?? "—",
      description:
        metrics.find(
          (m) =>
            m.id === "active-agents" ||
            m.label.toLowerCase().includes("agent") ||
            m.label.toLowerCase().includes("pending"),
        )?.description ?? "Unavailable",
      iconKey: "agents",
    },
  ]

  return (
    <>
      {slots.map((slot) => {
        const Icon = STAT_ICONS[slot.iconKey] ?? Brain
        return (
          <div
            key={slot.id}
            className="rounded-xl border border-[var(--dashboard-border)] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--dashboard-text-secondary)]">
                  {slot.label}
                </p>
                <p className="mt-1.5 text-2xl font-bold leading-none text-[var(--dashboard-text-primary)]">
                  {typeof slot.value === "number" ? slot.value.toLocaleString() : slot.value}
                </p>
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[#22C55E]">
                  <TrendingUp className="size-3 shrink-0" aria-hidden="true" />
                  {slot.description}
                </p>
              </div>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--dashboard-surface-muted)]">
                <Icon className="size-4 text-[var(--dashboard-text-secondary)]" aria-hidden="true" />
              </span>
            </div>
          </div>
        )
      })}
    </>
  )
}

const QUICK_ACTIONS = [
  { id: "new-memory", label: "New Memory", href: "/dashboard/memory-space", Icon: Plus },
  { id: "run-agent", label: "Run Agent", href: "/dashboard/agents", Icon: Bot },
  { id: "generate-report", label: "Generate Report", href: "/dashboard/skills", Icon: FileText },
  { id: "export-data", label: "Export Data", href: "/dashboard/memory-space?view=export", Icon: Download },
] as const

function SystemStatusRows({
  systemStatus,
  healthMetrics,
}: {
  systemStatus: SystemStatus | undefined
  healthMetrics: import("@/lib/dashboard/types").DashboardHealthMetrics | null | undefined
}) {
  const rows: Array<{
    id: string
    name: string
    status: "online" | "processing" | "degraded" | "offline" | "unknown"
  }> = []

  if (systemStatus?.components && systemStatus.components.length > 0) {
    for (const comp of systemStatus.components.slice(0, 4)) {
      rows.push({
        id: comp.name,
        name: comp.name,
        status:
          comp.status === "healthy"
            ? "online"
            : comp.status === "degraded"
            ? "degraded"
            : comp.status === "unhealthy"
            ? "offline"
            : "unknown",
      })
    }
  } else {
    const pgStatus = healthMetrics?.storage?.postgres?.status
    const neo4jStatus = healthMetrics?.storage?.neo4j?.status
    rows.push(
      {
        id: "postgres",
        name: "PostgreSQL",
        status:
          pgStatus === "healthy" || pgStatus === "ok"
            ? "online"
            : pgStatus === "degraded"
            ? "degraded"
            : pgStatus
            ? "offline"
            : "unknown",
      },
      {
        id: "neo4j",
        name: "Neo4j",
        status:
          neo4jStatus === "healthy" || neo4jStatus === "ok"
            ? "online"
            : neo4jStatus === "degraded"
            ? "degraded"
            : neo4jStatus
            ? "offline"
            : "unknown",
      },
      {
        id: "mcp-docker",
        name: "MCP Docker",
        status: "online" as const,
      },
      {
        id: "event-queue",
        name: "Event Queue",
        status: (typeof healthMetrics?.queue?.pending_count === "number" ? "processing" : "unknown") as
          | "processing"
          | "unknown",
      },
    )
  }

  return (
    <>
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between px-5 py-3">
          <span className="text-sm text-[var(--dashboard-text-primary)]">{row.name}</span>
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span
              className={cn(
                "size-2 rounded-full",
                row.status === "online"
                  ? "bg-[#22C55E]"
                  : row.status === "processing"
                  ? "bg-[#F59E0B]"
                  : row.status === "degraded"
                  ? "bg-[#F59E0B]"
                  : row.status === "offline"
                  ? "bg-red-500"
                  : "bg-[var(--dashboard-text-muted)]",
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                row.status === "online"
                  ? "text-[#22C55E]"
                  : row.status === "processing"
                  ? "text-[#F59E0B]"
                  : row.status === "degraded"
                  ? "text-[#F59E0B]"
                  : row.status === "offline"
                  ? "text-red-500"
                  : "text-[var(--dashboard-text-muted)]",
              )}
            >
              {row.status === "processing"
                ? "Processing"
                : row.status === "online"
                ? "Online"
                : row.status === "offline"
                ? "Offline"
                : row.status === "degraded"
                ? "Degraded"
                : "Unknown"}
            </span>
          </span>
        </div>
      ))}
    </>
  )
}

function formatRelativeTime(value: string): string {
  const now = new Date()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "time unavailable"

  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes <= 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
