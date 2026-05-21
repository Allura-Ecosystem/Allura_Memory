"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Search, Sparkles, ArrowRight, Inbox, CheckCircle2, XCircle, Clock, Layers, MemoryStick, Wand2, Send, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { approveProposal, rejectProposal } from "@/lib/dashboard/api"
import { loadCuratorQueue, loadInsights, loadMemories } from "@/lib/dashboard/queries"
import type { DashboardResult, Insight, Memory } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

/* ─── Dashboard — Search-first memory workspace (spec v2) ─── */

export default function DashboardPage() {
  const [query, setQuery] = useState("")
  const [memoriesState, setMemoriesState] = useState<DashboardResult<Memory[]> | null>(null)
  const [queueState, setQueueState] = useState<DashboardResult<Insight[]> | null>(null)
  const [insightsState, setInsightsState] = useState<DashboardResult<Insight[]> | null>(null)

  const refresh = useCallback(() => {
    setMemoriesState(null)
    setQueueState(null)
    setInsightsState(null)
    void loadMemories().then(setMemoriesState)
    void loadCuratorQueue("pending").then(setQueueState)
    void loadInsights("active").then(setInsightsState)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const memories = memoriesState?.data ?? []
  const queue = queueState?.data ?? []
  const approved = insightsState?.data ?? []
  const boardLanes = buildKanbanLanes({
    memories,
    queue,
    approved,
    hasMemoryError: Boolean(memoriesState?.error),
    hasQueueError: Boolean(queueState?.error),
  })

  const filteredMemories = query.trim()
    ? memories.filter((m) =>
        (m.title + " " + m.content + " " + m.tags.join(" ")).toLowerCase().includes(query.toLowerCase())
      )
    : memories

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* ── Hero: search-first ── */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-[family-name:var(--font-outfit)] text-3xl font-semibold tracking-tight text-[var(--dashboard-text-primary)] sm:text-4xl">
            Find memories. Follow provenance. Govern what sticks.
          </h1>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            Search across episodic and semantic memories, inspect approval queues, and trace provenance chains.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-[var(--dashboard-cta-primary)]/30">
          <Search className="size-5 shrink-0 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories, insights, agents..."
            className="h-auto border-0 bg-transparent px-0 text-base text-[var(--dashboard-text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus-visible:ring-0 focus-visible:ring-offset-0"
            aria-label="Search memories"
          />
          {query && (
            <Badge variant="outline" className="shrink-0 text-xs">
              {filteredMemories.length} result{filteredMemories.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      </section>

      {/* ── Main grid: memories (center) + approvals (right) ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]" aria-live="polite" aria-atomic="false">
        {/* ── Recent memories ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--dashboard-text-muted)]">
              Recent memories
            </h2>
            <Link
              href="/dashboard/memory-space"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--dashboard-accent-secondary)] hover:underline"
            >
              Memory space <ArrowRight className="size-3" />
            </Link>
          </div>

          {memoriesState === null ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : memoriesState.error ? (
            <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
              <CardContent className="py-6 text-sm text-red-600">
                {memoriesState.error}
              </CardContent>
            </Card>
          ) : filteredMemories.length === 0 ? (
            <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <MemoryStick className="size-8 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
                <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">
                  {query.trim() ? "No memories match." : "No memories indexed."}
                </p>
                <p className="text-xs text-[var(--dashboard-text-secondary)]">
                  {query.trim()
                    ? "Try broader terms or check your filters."
                    : "Start by adding your first memory."}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link href="/dashboard/builder">
                    <Wand2 className="size-4 mr-1" />
                    Compose memory
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredMemories.slice(0, 8).map((memory) => (
                <MemoryCard key={memory.id} memory={memory} />
              ))}
            </div>
          )}
        </section>

        {/* ── Approvals queue ── */}
        <aside className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--dashboard-text-muted)]">
              Approvals
            </h2>
            <Link
              href="/dashboard/insights"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--dashboard-accent-secondary)] hover:underline"
            >
              Queue <ArrowRight className="size-3" />
            </Link>
          </div>

          {queueState === null ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
              <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="size-7 text-[var(--dashboard-cta-approval)]" aria-hidden="true" />
                <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">No pending proposals.</p>
                <p className="text-xs text-[var(--dashboard-text-secondary)]">
                  Every memory here passed through a gate you can inspect.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {queue.slice(0, 5).map((insight) => (
                <QueueCard key={insight.id} insight={insight} onAction={refresh} />
              ))}
            </div>
          )}

          {/* ── Quick stats ── */}
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-[var(--dashboard-text-muted)]">Quick stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <StatRow label="Memories" value={memories.length} />
              <StatRow label="Pending" value={queue.length} tone="orange" />
              <StatRow label="Approved" value={approved.length} tone="green" />
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* ── Governance Kanban ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--dashboard-text-muted)]">
              Kanban board
            </h2>
            <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
              Governed work, grouped by what needs capture, review, evidence, or cleanup.
            </p>
          </div>
          <Link
            href="/dashboard/builder"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--dashboard-accent-secondary)] hover:underline"
          >
            Add proposal <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {boardLanes.map((lane) => (
            <div
              key={lane.id}
              className="flex min-h-[14rem] flex-col rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-block size-2 rounded-full", lane.dotClass)} />
                  <h3 className="text-xs font-semibold text-[var(--dashboard-text-primary)]">{lane.title}</h3>
                </div>
                <span
                  className="rounded-full border border-[var(--dashboard-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--dashboard-text-secondary)]"
                  aria-label={`${lane.items.length} ${lane.title} items`}
                >
                  {lane.items.length}
                </span>
              </div>
              <p className="mt-2 min-h-8 text-xs leading-4 text-[var(--dashboard-text-secondary)]">
                {lane.description}
              </p>
              <div className="mt-3 flex flex-1 flex-col gap-2">
                {lane.items.length === 0 ? (
                  <div className="flex flex-1 items-center rounded-lg border border-dashed border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3 text-xs text-[var(--dashboard-text-muted)]">
                    {lane.empty}
                  </div>
                ) : (
                  lane.items.slice(0, 3).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3 transition-colors hover:bg-[var(--dashboard-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30"
                    >
                      <div className="flex items-start gap-2">
                        {item.blocked ? (
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-600" aria-hidden="true" />
                        ) : (
                          <span className={cn("mt-1 inline-block size-1.5 shrink-0 rounded-full", item.dotClass)} />
                        )}
                        <div className="min-w-0 space-y-1">
                          <p className="line-clamp-2 text-xs font-medium leading-4 text-[var(--dashboard-text-primary)]">
                            {item.title}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-[var(--dashboard-text-muted)]">
                            {item.meta}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
              {lane.items.length > 3 && (
                <Link
                  href={lane.href}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--dashboard-accent-secondary)] hover:underline"
                >
                  View {lane.items.length - 3} more <ArrowRight className="size-3" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ─── Sub-components ─── */

type KanbanItem = {
  id: string
  title: string
  meta: string
  href: string
  dotClass: string
  blocked?: boolean
}

type KanbanLane = {
  id: string
  title: string
  description: string
  empty: string
  href: string
  dotClass: string
  items: KanbanItem[]
}

function buildKanbanLanes({
  memories,
  queue,
  approved,
  hasMemoryError,
  hasQueueError,
}: {
  memories: Memory[]
  queue: Insight[]
  approved: Insight[]
  hasMemoryError: boolean
  hasQueueError: boolean
}): KanbanLane[] {
  const recentMemories = memories
    .filter((memory) => memory.status === "pending" || memory.status === "unknown" || memory.type === "event")
    .slice(0, 4)
    .map((memory) => ({
      id: `intake-${memory.id}`,
      title: memory.title || "Untitled memory",
      meta: memory.agent || memory.type,
      href: "/dashboard/memory-space",
      dotClass: "bg-[var(--dashboard-accent-secondary)]",
    }))

  const reviewItems = queue.slice(0, 5).map((insight) => ({
    id: `review-${insight.id}`,
    title: insight.title || "Untitled proposal",
    meta: `${insight.confidence}% confidence`,
    href: "/dashboard/insights",
    dotClass: "bg-[var(--dashboard-cta-primary)]",
  }))

  const evidenceItems = memories
    .filter((memory) => memory.evidenceIds.length > 0 || memory.connectedMemoryCount > 0)
    .slice(0, 4)
    .map((memory) => ({
      id: `evidence-${memory.id}`,
      title: memory.title || "Untitled memory",
      meta: `${memory.evidenceIds.length + memory.connectedMemoryCount} receipt links`,
      href: "/dashboard/memory-space",
      dotClass: "bg-[var(--dashboard-accent-secondary)]",
    }))

  const approvedItems = approved.slice(0, 4).map((insight) => ({
    id: `approved-${insight.id}`,
    title: insight.title || "Approved insight",
    meta: insight.agent || "approved",
    href: "/dashboard/insights",
    dotClass: "bg-[var(--dashboard-cta-approval)]",
  }))

  const blockedItems: KanbanItem[] = [
    ...(hasMemoryError
      ? [{
          id: "blocked-memories",
          title: "Memory list failed to load",
          meta: "data source",
          href: "/dashboard/memory-space",
          dotClass: "bg-red-500",
          blocked: true,
        }]
      : []),
    ...(hasQueueError
      ? [{
          id: "blocked-queue",
          title: "Approval queue failed to load",
          meta: "curator queue",
          href: "/dashboard/insights",
          dotClass: "bg-red-500",
          blocked: true,
        }]
      : []),
    ...memories
      .filter((memory) => memory.status === "rejected" || memory.status === "superseded")
      .slice(0, 3)
      .map((memory) => ({
        id: `blocked-${memory.id}`,
        title: memory.title || "Memory needs cleanup",
        meta: memory.status,
        href: "/dashboard/memory-space",
        dotClass: "bg-red-500",
        blocked: true,
      })),
  ]

  return [
    {
      id: "intake",
      title: "Intake",
      description: "Fresh captures and raw events before curation.",
      empty: "No new raw memories need intake.",
      href: "/dashboard/memory-space",
      dotClass: "bg-[var(--dashboard-accent-secondary)]",
      items: recentMemories,
    },
    {
      id: "review",
      title: "Review",
      description: "Pending proposals waiting for human approval.",
      empty: "The approval queue is clear.",
      href: "/dashboard/insights",
      dotClass: "bg-[var(--dashboard-cta-primary)]",
      items: reviewItems,
    },
    {
      id: "evidence",
      title: "Evidence",
      description: "Memories with receipts or provenance links to inspect.",
      empty: "No linked evidence surfaced yet.",
      href: "/dashboard/memory-space",
      dotClass: "bg-[var(--dashboard-accent-secondary)]",
      items: evidenceItems,
    },
    {
      id: "approved",
      title: "Approved",
      description: "Accepted insights ready for reuse or promotion planning.",
      empty: "No approved insights loaded.",
      href: "/dashboard/insights",
      dotClass: "bg-[var(--dashboard-cta-approval)]",
      items: approvedItems,
    },
    {
      id: "blocked",
      title: "Blocked",
      description: "Errors, rejected items, or superseded memories needing cleanup.",
      empty: "No blockers detected.",
      href: "/dashboard/insights",
      dotClass: "bg-red-500",
      items: blockedItems,
    },
  ]
}

function MemoryCard({ memory }: { memory: Memory }) {
  return (
    <Card role="article" tabIndex={0} className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-semibold text-[var(--dashboard-text-primary)]">
            {memory.title || "Untitled memory"}
          </CardTitle>
          <Badge variant="outline" className="shrink-0 text-xs capitalize">
            {memory.type}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <p className="text-xs leading-5 text-[var(--dashboard-text-secondary)] line-clamp-3">
          {memory.content?.slice(0, 280) || "No content available."}
          {memory.content && memory.content.length > 280 ? "…" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {memory.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--dashboard-text-secondary)]"
            >
              {tag}
            </span>
          ))}
          <span className="ml-auto text-[10px] text-[var(--dashboard-text-muted)]">
            {memory.agent}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function QueueCard({ insight, onAction }: { insight: Insight; onAction: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const approve = async () => {
    setBusy(true)
    setError(null)
    try {
      await approveProposal(insight.id)
      onAction()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed")
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    setBusy(true)
    setError(null)
    try {
      await rejectProposal(insight.id, "Rejected from dashboard")
      onAction()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rejection failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-[var(--dashboard-text-primary)]">
          {insight.title || "Untitled proposal"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs leading-5 text-[var(--dashboard-text-secondary)] line-clamp-2">
          {insight.content?.slice(0, 180) || "No content"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-[var(--dashboard-cta-approval)] text-[var(--dashboard-cta-approval)] hover:bg-[var(--dashboard-cta-approval)]/10"
            onClick={approve}
            disabled={busy}
            aria-label={`Approve ${insight.title || "proposal"}`}
          >
            <CheckCircle2 className="size-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-red-300 text-red-600 hover:bg-red-50"
            onClick={reject}
            disabled={busy}
            aria-label={`Reject ${insight.title || "proposal"}`}
          >
            <XCircle className="size-3.5" />
            Reject
          </Button>
          <span className="ml-auto text-[10px] text-[var(--dashboard-text-muted)]">
            {insight.confidence}% confidence
          </span>
        </div>
        {error && (
          <p className="text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "orange" | "green"
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--dashboard-text-secondary)]">{label}</span>
      <span
        className={cn(
          "font-semibold",
          tone === "orange"
            ? "text-[var(--dashboard-cta-primary)]"
            : tone === "green"
              ? "text-[var(--dashboard-cta-approval)]"
              : "text-[var(--dashboard-text-primary)]"
        )}
      >
        {value}
      </span>
    </div>
  )
}
