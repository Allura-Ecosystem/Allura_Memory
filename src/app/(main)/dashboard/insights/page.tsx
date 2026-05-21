"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { approveProposal, rejectProposal } from "@/lib/dashboard/api"
import { loadInsights } from "@/lib/dashboard/queries"
import type { DashboardResult, Insight } from "@/lib/dashboard/types"

type Tab = "pending" | "active" | "rejected" | "superseded"

export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>("pending")
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

  const reject = async (id: string, rationale: string) => {
    setBusyId(id)
    setActionError(null)
    try {
      await rejectProposal(id, rationale)
      toast.success("Insight rejected")
      refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Rejection failed")
    } finally {
      setBusyId(null)
    }
  }

  const tabItems: Array<{ value: Tab; label: string }> = [
    { value: "pending", label: "Queue" },
    { value: "active", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "superseded", label: "Superseded" },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Insights</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">Review, approve, reject, or revise candidate insights.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-bg)] p-1">
        {tabItems.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? "bg-[var(--dashboard-surface)] text-[var(--dashboard-text-primary)] shadow-sm"
                : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{actionError}</p>
        </div>
      )}

      {!state ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : state.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm text-red-600">{state.error}</p>
          <Button variant="outline" className="mt-4" onClick={refresh}>Retry</Button>
        </div>
      ) : (
        <>
          {state.warnings.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <ul className="space-y-1">
                {state.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-yellow-700">{w.message || String(w)}</li>
                ))}
              </ul>
            </div>
          )}

          {(state.data ?? []).length === 0 ? (
            <div className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-12 text-center">
              <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">No insights found</p>
              <p className="mt-2 text-xs text-[var(--dashboard-text-secondary)]">No insights match this status. Try a different tab or wait for the curator pipeline.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {state.data!.map((insight) => (
                <Card key={insight.id} className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base text-[var(--dashboard-text-primary)]">
                          {insight.title || "Untitled"}
                        </CardTitle>
                        <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
                          {insight.content || "No description"}
                        </p>
                      </div>
                      {tab === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-500/20 text-green-600 hover:bg-green-50"
                            disabled={busyId === insight.id}
                            onClick={() => approve(insight.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/20 text-red-600 hover:bg-red-50"
                            disabled={busyId === insight.id}
                            onClick={() => reject(insight.id, "Rejected from dashboard")}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--dashboard-text-muted)]">
                      <span>Confidence: {insight.confidence ?? "—"}</span>
                      <span>·</span>
                      <span>Status: {insight.status}</span>
                      <span>·</span>
                      <span>{insight.createdAt ? new Date(insight.createdAt).toLocaleDateString() : "—"}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
