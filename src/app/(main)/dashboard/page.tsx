import Link from "next/link"
import { Bell, Search, TrendingUp, Plus, Play, FileText, Download, ChevronRight } from "lucide-react"

import { loadDashboardOverview } from "@/lib/dashboard/queries"
import type { DashboardOverview, ActivityItem, DashboardHealthMetrics } from "@/lib/dashboard/types"

/* ─── Dashboard Overview — Figma spec v3 (Server Component) ─── */

export default async function DashboardPage() {
  const result = await loadDashboardOverview()
  const overview: DashboardOverview | null = result.data

  const healthMetrics: DashboardHealthMetrics | null = overview?.healthMetrics ?? null
  const activity: ActivityItem[] = overview?.activity ?? []

  /* ── Stat card values ── */
  const totalMemories = healthMetrics?.storage.postgres.total_memories ?? overview?.metrics.find((m) => m.id === "memories")?.value ?? 0
  const graphNodes = healthMetrics?.storage.neo4j.total_nodes ?? 0
  const insightsGenerated = activity.filter((a) => a.kind === "insight").length || overview?.pendingInsights.length || 0
  const activeAgentsSet = new Set(activity.map((a) => a.agent).filter(Boolean))
  const activeAgents = activeAgentsSet.size

  /* ── System status components ── */
  const systemComponents = overview?.systemStatus.components ?? []

  return (
    <div className="min-h-screen bg-[var(--dashboard-surface-muted,#f5f4f0)] px-6 py-8 lg:px-10">
      {/* ── Top bar ── */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-[var(--dashboard-text-primary)]">
          Dashboard Overview
        </h1>

        <div className="flex shrink-0 items-center gap-3">
          {/* Search bar */}
          <div className="flex items-center gap-2 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-3 py-2 shadow-sm">
            <Search className="size-4 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search memories, agents..."
              className="w-48 bg-transparent text-sm text-[var(--dashboard-text-primary)] outline-none placeholder:text-[var(--dashboard-text-muted)]"
              aria-label="Search dashboard"
            />
          </div>
          {/* Notification bell */}
          <button
            type="button"
            aria-label="Notifications"
            className="flex size-9 items-center justify-center rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] shadow-sm transition-colors hover:bg-[var(--dashboard-surface-muted)]"
          >
            <Bell className="size-4 text-[var(--dashboard-text-muted)]" />
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Memories" value={totalMemories} />
        <StatCard label="Graph Nodes" value={graphNodes} />
        <StatCard label="Insights Generated" value={insightsGenerated} />
        <StatCard label="Active Agents" value={activeAgents} />
      </div>

      {/* ── Main two-column area ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* ── Left: Recent Activity ── */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--dashboard-text-muted)]">
            Recent Activity
          </p>
          <div className="space-y-3">
            {activity.length === 0 ? (
              <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-5 py-10 text-center text-sm text-[var(--dashboard-text-muted)]">
                No recent activity to show.
              </div>
            ) : (
              activity.slice(0, 10).map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))
            )}
          </div>
        </section>

        {/* ── Right column ── */}
        <aside className="space-y-4">
          {/* Quick Actions */}
          <QuickActions />
          {/* System Status */}
          <SystemStatusCard components={systemComponents} />
        </aside>
      </div>
    </div>
  )
}

/* ─── Stat Card ─── */

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-5 py-5 shadow-sm">
      <p className="mb-1 text-xs font-medium text-[var(--dashboard-text-muted)]">{label}</p>
      <p className="mb-2 text-3xl font-bold text-[var(--dashboard-text-primary)]">
        {value ?? 0}
      </p>
      <div className="flex items-center gap-1 text-xs font-medium text-[var(--allura-green,#157a44)]">
        <TrendingUp className="size-3.5" aria-hidden="true" />
        <span>+12% this week</span>
      </div>
    </div>
  )
}

/* ─── Activity Row ─── */

const KIND_LABEL: Record<ActivityItem["kind"], string> = {
  insight: "INSIGHT",
  memory: "MEMORY",
  approval: "APPROVAL",
  sync: "SYNC",
  warning: "WARNING",
  system: "SYSTEM",
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const label = KIND_LABEL[item.kind] ?? item.kind.toUpperCase()
  const relativeTime = formatRelativeTime(item.timestamp)

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-4 py-3 shadow-sm">
      {/* Blue dot */}
      <span
        className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--allura-blue,#1d4ed8)]"
        aria-hidden="true"
      />

      {/* Text block */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--dashboard-text-primary)] leading-snug">
          {item.title || "System event"}
        </p>
        <p className="mt-0.5 text-xs text-[var(--dashboard-text-muted)]">
          Agent: {item.agent || "system"}&nbsp;&bull;&nbsp;{relativeTime}
        </p>
      </div>

      {/* Kind badge */}
      <span className="shrink-0 rounded-full border border-[var(--dashboard-border)] bg-[var(--allura-cream,#f5f1e6)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--allura-charcoal,#111827)]">
        {label}
      </span>
    </div>
  )
}

/* ─── Quick Actions ─── */

const QUICK_ACTIONS = [
  { label: "New Memory", icon: Plus, href: "/dashboard/feed" },
  { label: "Run Agent", icon: Play, href: "/dashboard/agents" },
  { label: "Generate Report", icon: FileText, href: "/dashboard/insights" },
  { label: "Export Data", icon: Download, href: "/dashboard/settings" },
] as const

function QuickActions() {
  return (
    <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] shadow-sm">
      <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-widest text-[var(--dashboard-text-muted)]">
        Quick Actions
      </p>
      <div className="divide-y divide-[var(--dashboard-border)]">
        {QUICK_ACTIONS.map(({ label, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--dashboard-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--allura-blue,#1d4ed8)]/30"
          >
            <Icon className="size-4 shrink-0 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
            <span className="flex-1 text-sm font-medium text-[var(--dashboard-text-primary)]">{label}</span>
            <ChevronRight className="size-4 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ─── System Status ─── */

type ComponentStatus = "healthy" | "degraded" | "unhealthy" | "unknown"

function statusDot(status: ComponentStatus) {
  if (status === "healthy") return "bg-[var(--allura-green,#157a44)]"
  if (status === "degraded") return "bg-[var(--allura-gold,#c89b3c)]"
  if (status === "unhealthy") return "bg-[var(--tone-red-text,#dc2626)]"
  return "bg-[var(--dashboard-text-muted)]"
}

function statusLabel(status: ComponentStatus) {
  if (status === "healthy") return "Online"
  if (status === "degraded") return "Processing"
  if (status === "unhealthy") return "Offline"
  return "Unknown"
}

function SystemStatusCard({
  components,
}: {
  components: Array<{ name: string; status: ComponentStatus; message?: string }>
}) {
  return (
    <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] shadow-sm">
      <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-widest text-[var(--dashboard-text-muted)]">
        System Status
      </p>

      {components.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-[var(--dashboard-text-muted)]">
          Status unavailable.
        </p>
      ) : (
        <div className="divide-y divide-[var(--dashboard-border)]">
          {components.map((comp) => (
            <div key={comp.name} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--dashboard-text-primary)]">{comp.name}</span>
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 shrink-0 rounded-full ${statusDot(comp.status as ComponentStatus)}`}
                  aria-hidden="true"
                />
                <span className="text-xs font-medium text-[var(--dashboard-text-muted)]">
                  {statusLabel(comp.status as ComponentStatus)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Utility ─── */

function formatRelativeTime(timestamp: string): string {
  if (!timestamp) return ""
  try {
    const diff = Date.now() - new Date(timestamp).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  } catch {
    return ""
  }
}
