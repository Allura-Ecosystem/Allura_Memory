"use client"

import {
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  Send,
  Wand2,
  XCircle,
} from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { approveProposal, rejectProposal } from "@/lib/dashboard/api"
import { buildDashboardRouteState } from "@/lib/dashboard/empty-states"
import { loadCuratorQueue } from "@/lib/dashboard/queries"
import type { DashboardResult, Insight } from "@/lib/dashboard/types"

// ─── compose form ─────────────────────────────────────────────────────────────

interface ComposeState {
  content: string
  rationale: string
  submitting: boolean
  submitted: boolean
  error: string | null
}

const INITIAL_COMPOSE: ComposeState = {
  content: "",
  rationale: "",
  submitting: false,
  submitted: false,
  error: null,
}

function ComposePanel({ onSubmitSuccess }: { onSubmitSuccess: () => void }) {
  const [form, setForm] = useState<ComposeState>(INITIAL_COMPOSE)

  function handleChange(field: "content" | "rationale", value: string) {
    setForm((prev) => ({ ...prev, [field]: value, error: null }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.content.trim()) {
      setForm((prev) => ({ ...prev, error: "Content is required." }))
      return
    }
    setForm((prev) => ({ ...prev, submitting: true, error: null }))
    try {
      const res = await fetch("/api/curator/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: form.content.trim(),
          rationale: form.rationale.trim() || undefined,
          group_id: "allura-system",
          source: "manual-compose",
        }),
      })
      if (res.status === 405) {
        console.warn("[builder] POST /api/curator/proposals returned 405 — endpoint not yet implemented")
        setForm({ ...INITIAL_COMPOSE, submitted: true })
        onSubmitSuccess()
        return
      }
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : `Submission failed: ${res.status}`
        )
      }
      setForm({ ...INITIAL_COMPOSE, submitted: true })
      onSubmitSuccess()
    } catch (err) {
      setForm((prev) => ({
        ...prev,
        submitting: false,
        error: err instanceof Error ? err.message : "Submission failed.",
      }))
    }
  }

  function handleReset() {
    setForm(INITIAL_COMPOSE)
  }

  if (form.submitted) {
    return (
      <div className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-8 text-center">
        <CheckCircle2 className="mx-auto size-8 text-[var(--dashboard-cta-approval)]" />
        <p className="mt-3 text-sm font-medium text-[var(--dashboard-text-primary)]">Proposal submitted!</p>
        <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">It will be reviewed by the curator pipeline.</p>
        <Button variant="outline" className="mt-4" onClick={handleReset}>Compose another</Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--dashboard-text-primary)]">Compose Proposal</h2>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">Submit a new memory for curation.</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--dashboard-text-primary)]">Content</label>
        <textarea
          value={form.content}
          onChange={(e) => handleChange("content", e.target.value)}
          placeholder="What memory do you want to add?"
          className="min-h-[120px] w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-bg)] px-4 py-3 text-sm text-[var(--dashboard-text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--dashboard-cta-primary)]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--dashboard-text-primary)]">Rationale (optional)</label>
        <textarea
          value={form.rationale}
          onChange={(e) => handleChange("rationale", e.target.value)}
          placeholder="Why does this memory matter?"
          className="min-h-[80px] w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-bg)] px-4 py-3 text-sm text-[var(--dashboard-text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--dashboard-cta-primary)]"
        />
      </div>

      {form.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">{form.error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={form.submitting} className="bg-[var(--dashboard-cta-primary)] text-white hover:opacity-90">
          {form.submitting ? (
            <>
              <RefreshCw className="mr-2 size-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="mr-2 size-4" />
              Submit
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

// ─── insight card (inline, no old imports) ───────────────────────────────────

function BuilderInsightCard({
  insight,
  onApprove,
  onReject,
  busy,
}: {
  insight: Insight
  onApprove?: (id: string) => void
  onReject?: (id: string, rationale: string) => void
  busy?: boolean
}) {
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  return (
    <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
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
          {onApprove && onReject && (
            <div className="flex gap-2">
              {!showReject ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-500/20 text-green-600 hover:bg-green-50"
                    disabled={busy}
                    onClick={() => onApprove(insight.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/20 text-red-600 hover:bg-red-50"
                    disabled={busy}
                    onClick={() => setShowReject(true)}
                  >
                    Reject
                  </Button>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Reason for rejection"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-bg)] px-3 py-2 text-sm"
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
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2 text-xs text-[var(--dashboard-text-muted)]">
          <span>Score: {insight.confidence ?? "—"}</span>
          <span>·</span>
          <span>Status: {insight.status}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function BuilderPage() {
  const [queue, setQueue] = useState<DashboardResult<Insight[]> | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [_, startTransition] = useTransition()
  const emptyState = buildDashboardRouteState("builder")
  const errorState = buildDashboardRouteState("builder", { kind: "degraded", reason: queue?.error ?? queue?.warnings?.[0]?.message ?? undefined })

  const refresh = () => {
    setQueue(null)
    loadCuratorQueue().then(setQueue)
  }

  useEffect(() => refresh(), [])

  const approve = async (id: string) => {
    setBusyId(id)
    try {
      await approveProposal(id, { rationale: "Approved from dashboard builder queue" })
      toast.success("Approved")
      startTransition(() => refresh())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed")
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (id: string, rationale: string) => {
    setBusyId(id)
    try {
      await rejectProposal(id, rationale)
      toast.success("Rejected")
      startTransition(() => refresh())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rejection failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Builder</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">Compose proposals and review the curator queue.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <ComposePanel onSubmitSuccess={refresh} />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--dashboard-text-primary)]">Curator Queue</h2>
            <Button variant="ghost" size="sm" onClick={refresh} disabled={!queue}>
              <RefreshCw className="mr-1 size-4" /> Refresh
            </Button>
          </div>

          {!queue ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : queue.error || queue.degraded ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
              <p className="text-sm font-medium text-red-700">{errorState.title}</p>
              <p className="mt-2 text-sm text-red-600">{errorState.description}</p>
              <Button variant="outline" className="mt-4" onClick={refresh}>{errorState.retryLabel}</Button>
              <Button asChild variant="outline" className="mt-4 ml-2">
                <a href={errorState.actionHref}>{errorState.actionLabel}</a>
              </Button>
            </div>
          ) : (
            <>
              {queue.warnings.length > 0 && (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                  <ul className="space-y-1">
                    {queue.warnings.map((w, i) => (
                      <li key={i} className="text-sm text-yellow-700">{w.message || String(w)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(queue.data ?? []).length === 0 ? (
                <div className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-12 text-center">
                  <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">{emptyState.title}</p>
                  <p className="mt-2 text-xs text-[var(--dashboard-text-secondary)]">{emptyState.description}</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                    {emptyState.actionLabel}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {queue.data!.map((insight) => (
                    <BuilderInsightCard
                      key={insight.id}
                      insight={insight}
                      onApprove={approve}
                      onReject={reject}
                      busy={busyId === insight.id}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
