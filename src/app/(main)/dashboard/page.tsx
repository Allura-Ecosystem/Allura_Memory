"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Search, ArrowRight, CheckCircle2, XCircle, Clock, MemoryStick, Wand2, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { approveProposal, rejectProposal } from "@/lib/dashboard/api"
import { DASHBOARD_PANEL_CONTRACTS, type DashboardShellPanelId } from "@/lib/dashboard/allura-route"
import { loadHonestDashboardPanels, type HonestDashboardPanel } from "@/lib/dashboard/honest-panels"
import { loadCuratorQueue, loadInsights, loadMemories } from "@/lib/dashboard/queries"
import type { DashboardResult, Insight, Memory } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

/* ─── Dashboard — Search-first memory workspace (spec v2) ─── */

export default function DashboardPage() {
  const [query, setQuery] = useState("")
  const [memoriesState, setMemoriesState] = useState<DashboardResult<Memory[]> | null>(null)
  const [queueState, setQueueState] = useState<DashboardResult<Insight[]> | null>(null)
  const [insightsState, setInsightsState] = useState<DashboardResult<Insight[]> | null>(null)
  const [truthPanelsState, setTruthPanelsState] = useState<DashboardResult<HonestDashboardPanel[]> | null>(null)

  const refresh = useCallback(() => {
    setMemoriesState(null)
    setQueueState(null)
    setInsightsState(null)
    setTruthPanelsState(null)
    void loadMemories().then(setMemoriesState)
    void loadCuratorQueue("pending").then(setQueueState)
    void loadInsights("active").then(setInsightsState)
    void loadHonestDashboardPanels().then(setTruthPanelsState)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const memories = memoriesState?.data ?? []
  const queue = queueState?.data ?? []
  const approved = insightsState?.data ?? []
  const isLoading = memoriesState === null || queueState === null || insightsState === null || truthPanelsState === null
  const hasLoadError = Boolean(memoriesState?.error || queueState?.error || insightsState?.error || truthPanelsState?.error)
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
        {!isLoading && !hasLoadError && memories.length === 0 && queue.length === 0 && approved.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4 text-sm text-[var(--dashboard-text-secondary)]">
            <p className="text-xs font-semibold tracking-wider text-[var(--dashboard-text-muted)] uppercase">
              Onboarding
            </p>
            <p className="mt-2 text-[var(--dashboard-text-primary)]">
              Your workspace is blank. Start by adding proposals, then review what needs approval.
            </p>
            <ul className="mt-3 space-y-2 text-xs leading-5">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--dashboard-cta-approval)]" />
                Add a memory from{" "}
                <Link
                  href="/dashboard/memory-space"
                  className="font-medium text-[var(--dashboard-accent-secondary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
                >
                  memory space
                </Link>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--dashboard-cta-approval)]" />
                Open the queue at{" "}
                <Link
                  href="/dashboard/insights"
                  className="font-medium text-[var(--dashboard-accent-secondary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
                >
                  insights
                </Link>{" "}
                when items arrive.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--dashboard-cta-approval)]" />
                Use search to find evidence and propose approvals quickly.
              </li>
            </ul>
            <div className="mt-3 border-t border-[var(--dashboard-border)] pt-3">
              <PanelContractNotice panelId="memory-search" />
            </div>
          </div>
        ) : null}
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
        <PanelContractNotice panelId="memory-search" />
      </section>

      <section className="space-y-3" aria-labelledby="dashboard-truth-panels">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="dashboard-truth-panels" className="text-sm font-semibold tracking-wider text-[var(--dashboard-text-muted)] uppercase">
              System truth · hygiene · approvals
            </h2>
            <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
              Honest panel states for what is known, missing, degraded, or failed.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh panels
          </Button>
        </div>
        {truthPanelsState === null ? (
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : truthPanelsState.error ? (
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
            <CardContent className="flex items-start gap-2 py-5 text-sm text-red-600">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{truthPanelsState.error}</span>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {(truthPanelsState.data ?? []).map((panel) => (
              <TruthPanelCard key={panel.id} panel={panel} />
            ))}
          </div>
        )}
      </section>

      {/* ── Main grid: memories (center) + approvals (right) ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]" aria-live="polite" aria-atomic="false">
        {/* ── Recent memories ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wider text-[var(--dashboard-text-muted)] uppercase">
              Recent memories
            </h2>
            <Link
              href="/dashboard/memory-space"
              className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-[var(--dashboard-accent-secondary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
            >
              Memory space <ArrowRight className="size-3" />
            </Link>
          </div>
          <PanelContractNotice panelId="recent-memories" />

          {memoriesState === null ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : memoriesState.error ? (
            <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
              <CardContent className="py-6 text-sm text-red-600">{memoriesState.error}</CardContent>
            </Card>
          ) : filteredMemories.length === 0 ? (
            <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <MemoryStick className="size-8 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
                <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">
                  {query.trim() ? "No memories match." : "No memories indexed."}
                </p>
                <p className="text-xs text-[var(--dashboard-text-secondary)]">
                  {query.trim() ? "Try broader terms or check your filters." : "Start by adding your first memory."}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link href="/dashboard/builder">
                    <Wand2 className="mr-1 size-4" />
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
            <h2 className="text-sm font-semibold tracking-wider text-[var(--dashboard-text-muted)] uppercase">
              Approvals
            </h2>
            <Link
              href="/dashboard/insights"
              className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-[var(--dashboard-accent-secondary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
            >
              Queue <ArrowRight className="size-3" />
            </Link>
          </div>
          <PanelContractNotice panelId="approvals-provenance" />

          {queueState === null ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : queueState.error ? (
            <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
              <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                <AlertTriangle className="size-7 text-red-600" aria-hidden="true" />
                <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">Approval queue unavailable.</p>
                <p className="text-xs text-[var(--dashboard-text-secondary)]">{queueState.error}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={refresh}>
                  Retry queue
                </Button>
              </CardContent>
            </Card>
          ) : queue.length === 0 ? (
            <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
              <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="size-7 text-[var(--dashboard-cta-approval)]" aria-hidden="true" />
                <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">No pending proposals.</p>
                <p className="text-xs text-[var(--dashboard-text-secondary)]">
                  Every memory here passed through a gate you can inspect.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link
                    href="/dashboard/insights"
                    className="focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
                  >
                    Open insights
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {queue.slice(0, 5).map((insight) => (
                <QueueCard key={insight.id} insight={insight} onAction={refresh} />
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* ── Governance Kanban ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wider text-[var(--dashboard-text-muted)] uppercase">
              Kanban board
            </h2>
            <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
              Governed work, grouped by what needs capture, review, evidence, or cleanup.
            </p>
          </div>
          <Link
            href="/dashboard/builder"
            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-[var(--dashboard-accent-secondary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
          >
            Add proposal <ArrowRight className="size-3" />
          </Link>
        </div>
        <PanelContractNotice panelId="mission-board" />
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
                      className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3 transition-colors hover:bg-[var(--dashboard-surface)] focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
                    >
                      <div className="flex items-start gap-2">
                        {item.blocked ? (
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-600" aria-hidden="true" />
                        ) : (
                          <span className={cn("mt-1 inline-block size-1.5 shrink-0 rounded-full", item.dotClass)} />
                        )}
                        <div className="min-w-0 space-y-1">
                          <p className="line-clamp-2 text-xs leading-4 font-medium text-[var(--dashboard-text-primary)]">
                            {item.title}
                          </p>
                          <p className="text-[10px] tracking-wider text-[var(--dashboard-text-muted)] uppercase">
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
                  className="mt-3 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-[var(--dashboard-accent-secondary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
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

function PanelContractNotice({ panelId }: { panelId: DashboardShellPanelId }) {
  const panel = DASHBOARD_PANEL_CONTRACTS.find((contract) => contract.id === panelId)

  if (!panel) return null

  return (
    <p className="text-[10px] leading-4 text-[var(--dashboard-text-muted)]">
      Source: {panel.backingSource}. Degraded: {panel.degradedBehavior}
    </p>
  )
}

function TruthPanelCard({ panel }: { panel: HonestDashboardPanel }) {
  const stateTone =
    panel.state === "failed"
      ? "border-red-200 bg-red-50 text-red-700"
      : panel.state === "degraded"
        ? "border-[var(--dashboard-cta-primary)]/25 bg-[var(--tone-orange-bg)] text-[var(--dashboard-text-primary)]"
        : panel.state === "empty" || panel.state === "unknown"
          ? "border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-secondary)]"
          : "border-[var(--dashboard-cta-approval)]/25 bg-[var(--tone-green-bg)] text-[var(--dashboard-text-primary)]"

  return (
    <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{panel.label}</CardTitle>
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", stateTone)}>
            {panel.state}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs leading-5 text-[var(--dashboard-text-secondary)]">{panel.summary}</p>
        <p className="text-xs leading-5 text-[var(--dashboard-text-primary)]">{panel.action}</p>
        <p className="border-t border-[var(--dashboard-border)] pt-2 text-[10px] leading-4 text-[var(--dashboard-text-muted)]">
          Source: {panel.source}. Samples: {panel.usesSampleData ? "yes" : "no"}. Count: {panel.count === null ? "unknown" : panel.count}.
        </p>
      </CardContent>
    </Card>
  )
}

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
    meta: `${formatConfidence(insight.confidence)} • ${insight.agent || "Unknown"} • ${insight.project || "General"}${insight.createdAt ? ` • ${formatRelativeTime(insight.createdAt)}` : ""}`,
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
      ? [
          {
            id: "blocked-memories",
            title: "Memory list failed to load",
            meta: "data source",
            href: "/dashboard/memory-space",
            dotClass: "bg-red-500",
            blocked: true,
          },
        ]
      : []),
    ...(hasQueueError
      ? [
          {
            id: "blocked-queue",
            title: "Approval queue failed to load",
            meta: "curator queue",
            href: "/dashboard/insights",
            dotClass: "bg-red-500",
            blocked: true,
          },
        ]
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
    <Card
      role="article"
      tabIndex={0}
      className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30"
    >
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
        <p className="line-clamp-3 text-xs leading-5 text-[var(--dashboard-text-secondary)]">
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
          <span className="ml-auto text-[10px] text-[var(--dashboard-text-muted)]">{memory.agent}</span>
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
        <p className="text-[10px] tracking-wider text-[var(--dashboard-text-muted)] uppercase">
          {insight.project || "General"} · {insight.event || "No event"}
        </p>
        <p className="line-clamp-2 text-xs leading-5 text-[var(--dashboard-text-secondary)]">
          {insight.content?.slice(0, 180) || "No content"}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-[var(--dashboard-text-muted)]">
          <Clock className="size-3.5" aria-hidden="true" />
          <span>{formatRelativeTime(insight.createdAt)}</span>
          <span>•</span>
          <span>{insight.agent || "Unknown agent"}</span>
          <span>•</span>
          <span>{formatConfidence(insight.confidence)} confidence</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

function formatRelativeTime(value: string): string {
  const now = new Date()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "time unavailable"
  }

  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes <= 1) {
    return "just now"
  }
  if (diffMinutes < 60) {
    return diffMinutes + "m ago"
  }
  if (diffHours < 24) {
    return diffHours + "h ago"
  }
  if (diffDays < 7) {
    return diffDays + "d ago"
  }

  return date.toLocaleDateString()
}

function formatConfidence(value: number): string {
  const normalized = value <= 1 ? value * 100 : value
  return `${Math.round(normalized)}%`
}
