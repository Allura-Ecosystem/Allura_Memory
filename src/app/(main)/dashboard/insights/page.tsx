import { loadInsights } from "@/lib/dashboard/queries"
import type { Insight } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

// ── Figma accent colours ────────────────────────────────────────────────────

type AccentColor = "green" | "blue" | "red" | "amber"

const ACCENT: Record<AccentColor, { border: string; metric: string }> = {
  green: { border: "border-l-green-500",  metric: "text-green-600"  },
  blue:  { border: "border-l-blue-500",   metric: "text-blue-600"   },
  red:   { border: "border-l-red-500",    metric: "text-red-500"    },
  amber: { border: "border-l-amber-500",  metric: "text-amber-600"  },
}

const ACCENT_ORDER: AccentColor[] = ["green", "blue", "red", "amber", "red", "green"]

// ── Seed cards (shown when no live data) ────────────────────────────────────

interface SeedCard {
  id: string
  title: string
  description: string
  metric: string
  accent: AccentColor
}

const SEED: SeedCard[] = [
  { id: "s1", accent: "green", title: "Brand Kit completion trending up",      description: "Phase 4 deliverables show 94% consistency score",              metric: "94%"  },
  { id: "s2", accent: "blue",  title: "Agent utilization pattern",             description: "Glaser and Rand show highest task completion rates",           metric: "87%"  },
  { id: "s3", accent: "red",   title: "Memory decay alert",                    description: "5 memories older than 30 days need review",                   metric: "5"    },
  { id: "s4", accent: "amber", title: "STP alignment strong",                  description: "All creative outputs align with locked positioning",           metric: "98%"  },
  { id: "s5", accent: "red",   title: "Pipeline bottleneck",                   description: "QA phase averaging 2.3 days vs target 1 day",                 metric: "2.3d" },
  { id: "s6", accent: "green", title: "Client satisfaction",                   description: "Last 3 deliveries rated 4.8/5 by stakeholders",               metric: "4.8"  },
]

function accentFromSeverity(status?: string): AccentColor {
  if (status === "rejected" || status === "deprecated") return "red"
  if (status === "pending") return "amber"
  if (status === "superseded") return "blue"
  return "green"
}

// ── InsightCard ─────────────────────────────────────────────────────────────

function InsightCard({
  title,
  description,
  metric,
  accent,
}: {
  title: string
  description: string
  metric: string
  accent: AccentColor
}) {
  const { border, metric: metricColor } = ACCENT[accent]
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] overflow-hidden",
        "border-l-4",
        border,
      )}
    >
      <div className="p-5 pb-3">
        <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)] leading-snug">{title}</h3>
        <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)] leading-relaxed">{description}</p>
      </div>

      {/* Trend chart placeholder */}
      <div className="mx-5 mb-5 mt-2 flex-1 rounded-lg relative" style={{ background: "#E8E0D0", minHeight: "140px" }}>
        <span className="absolute inset-0 flex items-center justify-center text-xs text-[#B0A898]">
          [Trend Chart]
        </span>
        <span className={cn("absolute bottom-3 left-3 text-lg font-bold", metricColor)}>
          {metric}
        </span>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function InsightsPage() {
  const result = await loadInsights("all", "allura-system")
  const state = result

  // Use live data if available, otherwise fall back to seed
  const useSeed = state.error || state.degraded || !state.data || state.data.length === 0

  return (
    <div className="space-y-6">
      {useSeed ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {SEED.map((card) => (
            <InsightCard key={card.id} title={card.title} description={card.description} metric={card.metric} accent={card.accent} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {(state.data ?? []).slice(0, 6).map((insight: Insight, i: number) => {
            const accent = accentFromSeverity(insight.status)
            const metric = `${Math.round(insight.confidence * 100)}%`
            return (
              <InsightCard
                key={insight.id}
                title={insight.title}
                description={insight.content}
                metric={metric}
                accent={accent}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
