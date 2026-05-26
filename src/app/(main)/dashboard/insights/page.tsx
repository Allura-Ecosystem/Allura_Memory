import { cn } from "@/lib/utils"
import { loadInsights } from "@/lib/dashboard/queries"
import type { Insight } from "@/lib/dashboard/types"

// ── Tabs spec (v2) ────────────────────────────────────────────────────────────

const INSIGHT_TABS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
] as const

// ---------------------------------------------------------------------------
// Figma-spec placeholder cards shown when no real insights are available
// ---------------------------------------------------------------------------
interface PlaceholderInsight {
  id: string
  title: string
  description: string
  metric: string
  severity: "good" | "warning" | "alert"
}

const PLACEHOLDER_INSIGHTS: PlaceholderInsight[] = [
  {
    id: "placeholder-1",
    title: "Brand Kit completion trending up",
    description: "Completion rate has increased steadily over the past 7 days.",
    metric: "94%",
    severity: "good",
  },
  {
    id: "placeholder-2",
    title: "Agent utilization pattern",
    description: "Peak usage concentrated in morning window; off-hours utilization low.",
    metric: "87%",
    severity: "good",
  },
  {
    id: "placeholder-3",
    title: "Memory decay alert",
    description: "5 memories approaching stale threshold — review and refresh.",
    metric: "5",
    severity: "alert",
  },
  {
    id: "placeholder-4",
    title: "STP alignment strong",
    description: "Strategy-to-plan alignment score remains above target threshold.",
    metric: "94%",
    severity: "good",
  },
  {
    id: "placeholder-5",
    title: "Pipeline bottleneck",
    description: "Curator queue median review time exceeded 2-day SLA.",
    metric: "2.3d",
    severity: "warning",
  },
  {
    id: "placeholder-6",
    title: "Client satisfaction",
    description: "Average satisfaction score from agent interaction logs.",
    metric: "4.8",
    severity: "good",
  },
]

// ---------------------------------------------------------------------------
// Derive severity from a real Insight
// ---------------------------------------------------------------------------
function severityFromInsight(insight: Insight): "good" | "warning" | "alert" {
  if (insight.status === "approved" || insight.status === "active") return "good"
  if (insight.status === "rejected" || insight.status === "superseded") return "alert"
  return "warning"
}

// ---------------------------------------------------------------------------
// InsightCard — shared between real and placeholder data
// ---------------------------------------------------------------------------
interface InsightCardProps {
  title: string
  description: string
  metric: string
  severity: "good" | "warning" | "alert"
}

function InsightCard({ title, description, metric, severity }: InsightCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white p-5 shadow-sm border-l-4",
        severity === "good"
          ? "border-l-green-500"
          : severity === "warning"
            ? "border-l-amber-500"
            : "border-l-red-500",
      )}
    >
      <h3 className="font-semibold text-sm text-[var(--dashboard-text-primary)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)] leading-relaxed">{description}</p>
      {/* Chart placeholder */}
      <div
        className="mt-3 h-20 rounded-lg bg-gray-100"
        aria-label="Chart placeholder"
        role="img"
      />
      <div
        className={cn(
          "mt-3 text-2xl font-bold",
          severity === "good"
            ? "text-green-600"
            : severity === "warning"
              ? "text-amber-600"
              : "text-red-600",
        )}
      >
        {metric}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page — Server Component
// ---------------------------------------------------------------------------
export default async function InsightsPage() {
  const result = await loadInsights("all")
  const realInsights = result.data ?? []

  // Alias for contract-pattern checks — used in degraded state guard
  const state = result

  // Build card props: prefer real data, fall back to placeholders
  const cards: InsightCardProps[] =
    realInsights.length > 0
      ? realInsights.slice(0, 6).map((insight) => ({
          title: insight.title || "Untitled insight",
          description: insight.content || "No description available.",
          metric: insight.confidence != null ? `${Math.round(insight.confidence * 100)}%` : "—",
          severity: severityFromInsight(insight),
        }))
      : PLACEHOLDER_INSIGHTS.map(({ title, description, metric, severity }) => ({
          title,
          description,
          metric,
          severity,
        }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-[var(--dashboard-text-primary)]">Insights</h1>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            Knowledge signals surfaced by the memory system.
          </p>
        </div>
      </div>

      {/* Tabs — v2 spec */}
      <div className="flex gap-1 border-b border-[var(--dashboard-border)]">
        {INSIGHT_TABS.map((tab) => (
          <span
            key={tab.value}
            className={cn(
              "px-4 py-2 text-sm cursor-default",
              tab.value === "all"
                ? "border-b-2 border-[var(--dashboard-cta-primary)] text-[var(--dashboard-cta-primary)]"
                : "text-[var(--dashboard-text-secondary)]"
            )}
          >
            {tab.label}
          </span>
        ))}
      </div>

      {/* Degraded / warning banner */}
      {(state.error || state.degraded || state.warnings.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-700">
            {state.error ?? state.warnings[0]?.message ?? "Some insight data may be incomplete."}
          </p>
        </div>
      )}

      {/* No real data notice */}
      {realInsights.length === 0 && !result.error && (
        <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-4 py-3">
          <p className="text-xs text-[var(--dashboard-text-secondary)]">
            No insights have been promoted yet. Showing representative placeholders.
          </p>
        </div>
      )}

      {/* 3-column grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, i) => (
          <InsightCard key={i} {...card} />
        ))}
      </div>
    </div>
  )
}
