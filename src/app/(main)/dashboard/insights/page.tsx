"use client"

import { useCallback, useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { approveProposal, rejectProposal } from "@/lib/dashboard/api"
import { loadInsights } from "@/lib/dashboard/queries"
import type { DashboardResult, Insight } from "@/lib/dashboard/types"

type Tab = "active" | "pending" | "rejected"

// Data-vis exception: accent bar colors are index-mapped and not representable
// via CSS tokens alone. These are the only hardcoded hex values permitted on this page.
const ACCENT_COLORS = [
  "#16a34a", // green
  "#1d4ed8", // blue
  "#dc2626", // red/orange
  "#b45309", // gold
  "#dc2626", // red
  "#16a34a", // green
]

function accentColor(index: number): string {
  return ACCENT_COLORS[index % ACCENT_COLORS.length]!
}

function InsightCard({
  insight,
  index,
  isPending,
  busyId,
  onApprove,
  onReject,
}: {
  insight: Insight
  index: number
  isPending: boolean
  busyId: string | null
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const color = accentColor(index)
  const confidenceLabel =
    insight.confidence != null ? `${Math.round(insight.confidence)}%` : "—"
  const description = insight.content || insight.outcome || "No description"

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4">
      {/* Header row: accent bar + title */}
      <div className="flex items-start gap-3">
        {/* Accent bar — data-vis exception, see file header */}
        <div
          className="mt-0.5 shrink-0 rounded-full"
          style={{ width: 3, height: 32, backgroundColor: color }}
          aria-hidden="true"
        />
        <p className="text-sm font-semibold leading-snug text-[var(--dashboard-text-primary)]">
          {insight.title || "Untitled"}
        </p>
      </div>

      {/* Description — 2-line clamp */}
      <p className="line-clamp-2 text-xs text-[var(--dashboard-text-muted)]">
        {description}
      </p>

      {/* Trend chart placeholder */}
      <div className="flex h-28 w-full items-center justify-center rounded-lg bg-[var(--allura-cream)] text-xs text-[var(--dashboard-text-muted)]">
        [Trend Chart]
      </div>

      {/* Footer row: metric badge + actions */}
      <div className="flex items-center justify-between">
        {/* Metric badge — color matches accent bar */}
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{
            color,
            backgroundColor: `${color}18`,
          }}
        >
          {confidenceLabel}
        </span>

        {/* Approval actions — Pending tab only */}
        {isPending && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-green-500/20 text-green-600 hover:bg-green-50"
              disabled={busyId === insight.id}
              onClick={() => onApprove(insight.id)}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-500/20 text-red-600 hover:bg-red-50"
              disabled={busyId === insight.id}
              onClick={() => onReject(insight.id)}
            >
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>("active")
  const [state, setState] = useState<DashboardResult<Insight[]> | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setState(null)
    void loadInsights(tab).then(setState)
  }, [tab])

  useEffect(() => refresh(), [refresh])

  const approve = async (id: string) => {
    setBusyId(id)
    setActionError(null)
    try {
      await approveProposal(id)
      toast.success("Insight approved")
      refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Approval failed")
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (id: string) => {
    setBusyId(id)
    setActionError(null)
    try {
      await rejectProposal(id, "Rejected from dashboard")
      toast.success("Insight rejected")
      refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Rejection failed")
    } finally {
      setBusyId(null)
    }
  }

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "active", label: "Active" },
    { value: "pending", label: "Pending" },
    { value: "rejected", label: "Rejected" },
  ]

  const insights = state?.data ?? []

  return (
    <div className="space-y-6">
      {/* Page title */}
      <h1 className="text-3xl font-bold text-[var(--dashboard-text-primary)]">
        Insights
      </h1>

      {/* Tab row */}
      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.value
                ? "bg-[var(--allura-blue)] text-[var(--allura-white)]"
                : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Action error */}
      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{actionError}</p>
        </div>
      )}

      {/* Outer white card wrapping the grid */}
      <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6">
        {!state ? (
          /* Loading skeletons — 2×3 grid shape */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : state.error ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-sm text-red-600">{state.error}</p>
            <Button variant="outline" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : insights.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Sparkles className="h-8 w-8 text-[var(--dashboard-text-muted)]" />
            <p className="text-sm text-[var(--dashboard-text-muted)]">
              No insights yet.
            </p>
          </div>
        ) : (
          /* 2×3 insight card grid */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((insight, index) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                index={index}
                isPending={tab === "pending"}
                busyId={busyId}
                onApprove={approve}
                onReject={reject}
              />
            ))}
          </div>
        )}

        {/* Warnings */}
        {state && state.warnings.length > 0 && (
          <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <ul className="space-y-1">
              {state.warnings.map((w, i) => (
                <li key={i} className="text-sm text-yellow-700">
                  {w.message || String(w)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
