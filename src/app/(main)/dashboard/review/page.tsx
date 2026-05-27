"use client"

import { useEffect, useState, useTransition } from "react"
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { approveProposal, rejectProposal } from "@/lib/dashboard/api"
import { loadCuratorQueue } from "@/lib/dashboard/queries"
import type { DashboardResult, Insight } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

const TABS = ["Pending", "Approved"] as const
type Tab = (typeof TABS)[number]

function ProposalCard({
  insight,
  onApprove,
  onReject,
  busy,
}: {
  insight: Insight
  onApprove: (id: string) => void
  onReject: (id: string, rationale: string) => void
  busy: boolean
}) {
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  return (
    <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base text-[var(--dashboard-text-primary)]">
              {insight.title || "Untitled Proposal"}
            </CardTitle>
            <p className="mt-1 line-clamp-2 text-xs text-[var(--dashboard-text-secondary)]">
              {insight.content || "No description"}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
              insight.status === "pending"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : insight.status === "approved" || insight.status === "active"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : insight.status === "rejected"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-gray-200 bg-gray-50 text-gray-600"
            )}
          >
            {insight.status}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2 text-xs text-[var(--dashboard-text-muted)]">
          <span>Confidence: {insight.confidence !== undefined ? `${Math.round(insight.confidence * 100)}%` : "—"}</span>
          <span>&bull;</span>
          <span>Agent: {insight.agent || "—"}</span>
          {insight.project && (
            <>
              <span>&bull;</span>
              <span>Project: {insight.project}</span>
            </>
          )}
        </div>

        {/* Actions for pending items */}
        {insight.status === "pending" && (
          <div className="mt-4">
            {!showReject ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-[var(--dashboard-cta-approval)] text-white hover:opacity-90"
                  disabled={busy}
                  onClick={() => onApprove(insight.id)}
                >
                  {busy ? <RefreshCw className="mr-1 size-4 animate-spin" /> : <CheckCircle2 className="mr-1 size-4" />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/20 text-red-600 hover:bg-red-50"
                  disabled={busy}
                  onClick={() => setShowReject(true)}
                >
                  <XCircle className="mr-1 size-4" /> Reject
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Reason for rejection"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dashboard-cta-primary)]"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setShowReject(false); setRejectReason("") }}>Cancel</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/20 text-red-600"
                    disabled={!rejectReason.trim() || busy}
                    onClick={() => { onReject(insight.id, rejectReason); setShowReject(false); setRejectReason("") }}
                  >
                    Confirm Reject
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ReviewPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Pending")
  const [pendingQueue, setPendingQueue] = useState<DashboardResult<Insight[]> | null>(null)
  const [approvedQueue, setApprovedQueue] = useState<DashboardResult<Insight[]> | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [_, startTransition] = useTransition()

  const refresh = () => {
    setPendingQueue(null)
    setApprovedQueue(null)
    loadCuratorQueue("pending").then(setPendingQueue)
    loadCuratorQueue("approved").then(setApprovedQueue)
  }

  useEffect(() => refresh(), [])

  const approve = async (id: string) => {
    setBusyId(id)
    try {
      await approveProposal(id, { rationale: "Approved from review queue" })
      toast.success("Proposal approved")
      startTransition(() => refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed")
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (id: string, rationale: string) => {
    setBusyId(id)
    try {
      await rejectProposal(id, rationale)
      toast.success("Proposal rejected")
      startTransition(() => refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rejection failed")
    } finally {
      setBusyId(null)
    }
  }

  const currentQueue = activeTab === "Pending" ? pendingQueue : approvedQueue
  const isLoading = currentQueue === null
  const items = currentQueue?.data ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--dashboard-text-primary)]">Review Queue</h1>
          <p className="mt-1 text-sm text-[var(--dashboard-text-secondary)]">
            Approve or reject memory promotions from the curator pipeline.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
          <RefreshCw className={cn("mr-1 size-4", isLoading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--dashboard-text-muted)]">
            <Clock className="size-4" /> Pending
          </div>
          <p className="mt-1 text-2xl font-bold text-[var(--dashboard-text-primary)]">
            {pendingQueue ? (pendingQueue.data?.length ?? 0) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--dashboard-text-muted)]">
            <CheckCircle2 className="size-4" /> Approved
          </div>
          <p className="mt-1 text-2xl font-bold text-[var(--dashboard-text-primary)]">
            {approvedQueue ? (approvedQueue.data?.length ?? 0) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4 sm:col-span-1 col-span-2">
          <div className="flex items-center gap-2 text-xs text-[var(--dashboard-text-muted)]">
            <ShieldCheck className="size-4" /> Pipeline
          </div>
          <p className="mt-1 text-sm font-medium text-[var(--dashboard-text-primary)]">
            {currentQueue?.degraded ? "Degraded" : currentQueue?.error ? "Error" : "Healthy"}
          </p>
        </div>
      </div>

      {/* Tab row */}
      <div className="flex gap-1 border-b border-[var(--dashboard-border)]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              tab === activeTab
                ? "border-b-2 border-[var(--dashboard-cta-primary)] text-[var(--dashboard-cta-primary)]"
                : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"
            )}
          >
            {tab}
            {tab === "Pending" && pendingQueue?.data && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                {pendingQueue.data.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Queue content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : currentQueue?.error && items.length === 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-medium text-red-700">Failed to load queue</p>
          <p className="mt-1 text-xs text-red-600">{currentQueue.error}</p>
          <Button variant="outline" className="mt-4" onClick={refresh}>Retry</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] py-16 text-center">
          <ShieldCheck className="mb-3 size-8 text-[var(--dashboard-text-secondary)]" />
          <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">
            {activeTab === "Pending" ? "No pending proposals" : "No approved proposals"}
          </p>
          <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
            {activeTab === "Pending"
              ? "The curator queue is clear. New proposals will appear here."
              : "Approved proposals will appear here after review."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((insight) => (
            <ProposalCard
              key={insight.id}
              insight={insight}
              onApprove={approve}
              onReject={reject}
              busy={busyId === insight.id}
            />
          ))}
        </div>
      )}

      {/* Warnings */}
      {currentQueue?.warnings && currentQueue.warnings.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-xs font-medium text-yellow-700">Warnings</p>
          <ul className="mt-1 space-y-0.5">
            {currentQueue.warnings.map((w, i) => (
              <li key={i} className="text-xs text-yellow-600">{w.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
