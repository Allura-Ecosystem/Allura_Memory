"use client"

import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Database,
  GitBranch,
  type LucideIcon,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from "react"

import {
  EmptyState,
  ErrorState,
  EvidenceCard,
  InsightCard,
  MemoryCard,
  SearchResultsSkeleton,
  WarningList,
} from "@/components/dashboard"
import { Badge } from "@/components/ui/badge"
import { ALLURA_ROUTE_SECTIONS, type AlluraRouteSectionId, getAlluraRoutePolicy } from "@/lib/dashboard/allura-route"
import { loadCuratorQueue, loadEvidence, loadGraph, loadInsights, loadMemories } from "@/lib/dashboard/queries"
import type { DashboardResult, Evidence, GraphEdge, GraphNode, Insight, Memory } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

type AlluraRouteData = {
  memories: DashboardResult<Memory[]>
  insights: DashboardResult<Insight[]>
  evidence: DashboardResult<Evidence[]>
  queue: DashboardResult<Insight[]>
  graph: DashboardResult<{ nodes: GraphNode[]; edges: GraphEdge[]; totalEdges?: number }>
}

type StatTone = "blue" | "green" | "gold" | "orange"

function emptyResult<T>(data: T): DashboardResult<T> {
  return { data, error: null, degraded: false, warnings: [] }
}

async function loadAlluraRouteData(): Promise<AlluraRouteData> {
  const [memories, insights, evidence, queue, graph] = await Promise.all([
    loadMemories(),
    loadInsights("active"),
    loadEvidence(),
    loadCuratorQueue("pending"),
    loadGraph(),
  ])

  return { memories, insights, evidence, queue, graph }
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value !== "unknown"))))
}

function toneClasses(tone: StatTone): string {
  const tones: Record<StatTone, string> = {
    blue: "border-[var(--allura-blue)]/25 bg-[var(--tone-blue-bg)] text-[var(--tone-blue-text)]",
    green: "border-[var(--allura-green)]/25 bg-[var(--tone-green-bg)] text-[var(--tone-green-text)]",
    gold: "border-[var(--allura-gold)]/25 bg-[var(--tone-gold-bg)] text-[var(--tone-gold-text)]",
    orange: "border-[var(--allura-orange)]/25 bg-[var(--tone-orange-bg)] text-[var(--tone-orange-text)]",
  }
  return tones[tone]
}

export default function AlluraRoutePage() {
  const [state, setState] = useState<AlluraRouteData | null>(null)
  const [activeSection, setActiveSection] = useState<AlluraRouteSectionId>("memories")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    let cancelled = false
    void loadAlluraRouteData()
      .then((data) => {
        if (!cancelled) setState(data)
      })
      .catch((error) => {
        if (!cancelled) {
	          const message = error instanceof Error ? error.message : "Unable to load Allura Brain data"
	          setState({
	            memories: { ...emptyResult<Memory[]>([]), error: message, degraded: true },
	            insights: emptyResult<Insight[]>([]),
	            evidence: emptyResult<Evidence[]>([]),
	            queue: emptyResult<Insight[]>([]),
	            graph: emptyResult<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] }),
	          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const policy = useMemo(() => getAlluraRoutePolicy(), [])
  const memories = state?.memories.data ?? []
  const insights = state?.insights.data ?? []
  const evidence = state?.evidence.data ?? []
  const queue = state?.queue.data ?? []
  const graph = state?.graph.data ?? { nodes: [], edges: [] }
  const warnings = [
    ...(state?.memories.warnings ?? []),
    ...(state?.insights.warnings ?? []),
    ...(state?.evidence.warnings ?? []),
    ...(state?.queue.warnings ?? []),
    ...(state?.graph.warnings ?? []),
  ]
  const errors = [
    state?.memories.error,
    state?.insights.error,
    state?.evidence.error,
    state?.queue.error,
    state?.graph.error,
  ].filter(Boolean) as string[]
  const isDegraded = Boolean(
    state?.memories.degraded ||
    state?.insights.degraded ||
    state?.evidence.degraded ||
    state?.queue.degraded ||
    state?.graph.degraded
  )
  const isLoading = !state

  const moveSectionFocus = (nextSection: AlluraRouteSectionId) => {
    setActiveSection(nextSection)
    document.getElementById(`allura-section-tab-${nextSection}`)?.focus()
  }

  const handleSectionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, sectionId: AlluraRouteSectionId) => {
    const currentIndex = ALLURA_ROUTE_SECTIONS.findIndex((section) => section.id === sectionId)
    if (currentIndex < 0) return

    if (event.key === "Home") {
      event.preventDefault()
      moveSectionFocus(ALLURA_ROUTE_SECTIONS[0].id)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      moveSectionFocus(ALLURA_ROUTE_SECTIONS[ALLURA_ROUTE_SECTIONS.length - 1].id)
      return
    }

    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return

    event.preventDefault()
    const direction = event.key === "ArrowRight" ? 1 : -1
    const nextIndex = (currentIndex + direction + ALLURA_ROUTE_SECTIONS.length) % ALLURA_ROUTE_SECTIONS.length
    moveSectionFocus(ALLURA_ROUTE_SECTIONS[nextIndex].id)
  }

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const matchesSearch = (...values: Array<unknown>) => {
    if (!normalizedSearch) return true
    return values.some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch))
  }
  const filteredMemories = memories.filter((memory) =>
    matchesSearch(memory.title, memory.content, memory.agent, memory.project, memory.type, memory.status, memory.tags.join(" "))
  )
  const filteredInsights = insights.filter((insight) =>
    matchesSearch(insight.title, insight.content, insight.event, insight.outcome, insight.evidence, insight.agent, insight.project, insight.status)
  )
  const filteredEvidence = evidence.filter((item) =>
    matchesSearch(item.title, item.rawLog, item.source, item.agent, item.project, item.status, item.tags.join(" "))
  )
  const filteredQueue = queue.filter((insight) =>
    matchesSearch(insight.title, insight.content, insight.event, insight.outcome, insight.evidence, insight.agent, insight.project, insight.status)
  )
  const filteredGraphNodes = graph.nodes.filter((node) => matchesSearch(node.label, node.type, JSON.stringify(node.metadata ?? {})))
  const filteredGraphNodeIds = new Set(filteredGraphNodes.map((node) => node.id))
  const filteredGraphEdges = graph.edges.filter((edge) =>
    matchesSearch(edge.label, edge.source, edge.target) || filteredGraphNodeIds.has(edge.source) || filteredGraphNodeIds.has(edge.target)
  )

  const provenanceAgents = uniqueStrings([
    ...filteredMemories.map((memory) => memory.agent),
    ...filteredInsights.map((insight) => insight.agent),
    ...filteredEvidence.map((item) => item.agent),
  ])
  const extractedFacts = filteredEvidence.filter((item) => item.rawLog.trim().length > 0).slice(0, 8)
  const latestEvidence = evidence[0]

  const stats = [
    {
	      label: "Memories",
	      value: filteredMemories.length,
	      detail: "Governed memory rows",
      tone: "blue" as const,
      icon: BrainCircuit,
    },
    {
	      label: "Active insights",
	      value: filteredInsights.length,
      detail: "Approved semantic knowledge",
      tone: "green" as const,
      icon: Sparkles,
    },
    {
	      label: "Approval queue",
	      value: filteredQueue.length,
      detail: "Needs curator review",
      tone: "orange" as const,
      icon: AlertTriangle,
    },
    {
	      label: "Evidence rows",
	      value: filteredEvidence.length,
      detail: "Append-only trace surface",
      tone: "gold" as const,
      icon: Database,
    },
    {
	      label: "Graph nodes",
	      value: filteredGraphNodes.length,
      detail: "Visible relationship nodes",
      tone: "blue" as const,
      icon: GitBranch,
    },
    {
	      label: "Graph edges",
	      value: filteredGraphEdges.length,
      detail: "Visible evidence links",
      tone: "green" as const,
      icon: Activity,
    },
  ]

  return (
    <div className="allura-command-center space-y-6">
      <section className="overflow-hidden rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] shadow-[var(--allura-sh-sm)]">
        <div className="grid gap-6 p-5 lg:grid-cols-[1.15fr_0.85fr] xl:p-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[var(--tone-blue-bg)] text-[var(--tone-blue-text)]">Allura Brain</Badge>
              <Badge
                variant="outline"
                className="border-[var(--dashboard-border)] text-[var(--dashboard-text-secondary)]"
              >
                Source: {policy.system_of_record}
              </Badge>
              <Badge
                className={cn(
                  isDegraded
                    ? "bg-[var(--tone-orange-bg)] text-[var(--tone-orange-text)]"
                    : "bg-[var(--tone-green-bg)] text-[var(--tone-green-text)]"
                )}
              >
                {isDegraded ? "Degraded" : "Operational"}
              </Badge>
            </div>

            <div>
              <h1 className="text-3xl leading-tight font-semibold text-[var(--dashboard-text-primary)]">
                Governed memory command center
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--dashboard-text-secondary)]">
                Inspect memories, active insights, trace evidence, provenance, extracted facts, graph links, and
                approval work from one governed surface.
              </p>
            </div>

            <div className="relative max-w-2xl">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--dashboard-text-muted)]" />
              <input
	                type="search"
	                aria-label="Search Allura Brain"
	                placeholder="Search memories, insights, evidence, and people"
	                value={searchQuery}
	                onChange={(event) => setSearchQuery(event.target.value)}
	                className="h-11 w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] pr-3 pl-10 text-sm text-[var(--dashboard-text-primary)] transition-colors placeholder:text-[var(--dashboard-text-muted)] focus:border-transparent focus:ring-2 focus:ring-[var(--allura-blue)] focus:outline-none"
	              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <PolicyTile
              label="Read / write"
              value={`${policy.read_policy.min_role} read · ${policy.write_policy.min_role} write`}
            />
            <PolicyTile label="Degraded behavior" value={policy.degradation_behavior} />
            <PolicyTile label="Evidence policy" value={policy.evidence_policy} />
            <PolicyTile
              label="Latest evidence"
              value={latestEvidence ? latestEvidence.title : "Awaiting trace evidence"}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {stats.map((stat) => (
          <StatTile key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel title="Route Contract" description="6420 capability set preserved under Mission Control.">
          <div className="grid gap-2 md:grid-cols-2">
            {ALLURA_ROUTE_SECTIONS.map((section) => (
              <div
                key={section.id}
                className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{section.label}</p>
                  <Badge
                    variant="outline"
                    className="border-[var(--dashboard-border)] text-[var(--dashboard-text-secondary)]"
                  >
                    {section.readMode}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--dashboard-text-secondary)]">
                  {section.description}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Governance Posture" description="No fabricated data, no direct substrate writes.">
          <div className="space-y-3">
            <PostureRow icon={ShieldCheck} label="Source of truth" value={policy.system_of_record} tone="green" />
            <PostureRow icon={Database} label="Write policy" value="Governed Allura actions only" tone="blue" />
            <PostureRow
              icon={AlertTriangle}
	              label="Queue pressure"
	              value={`${filteredQueue.length} pending approvals`}
              tone="orange"
            />
            <PostureRow
              icon={GitBranch}
	              label="Graph evidence"
	              value={`${filteredGraphNodes.length} nodes · ${filteredGraphEdges.length} edges`}
              tone="gold"
            />
          </div>
        </Panel>
      </section>

      <WarningList warnings={warnings} />
      {errors.map((error) => (
        <ErrorState key={error} message={error} />
      ))}

      <section className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4 shadow-[var(--allura-sh-sm)]">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Allura command center sections">
          {ALLURA_ROUTE_SECTIONS.map((section) => {
            const isActive = activeSection === section.id
            return (
              <button
                key={section.id}
                id={`allura-section-tab-${section.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
	                aria-controls={`allura-section-panel-${section.id}`}
	                tabIndex={isActive ? 0 : -1}
	                onClick={() => setActiveSection(section.id)}
                onKeyDown={(event) => handleSectionKeyDown(event, section.id)}
                className={cn(
                  "h-9 rounded-full border px-3 text-sm font-medium transition-colors focus:ring-2 focus:ring-[var(--allura-blue)] focus:outline-none",
                  isActive
                    ? "border-[var(--allura-blue)] bg-[var(--tone-blue-bg)] text-[var(--tone-blue-text)]"
                    : "border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"
                )}
              >
                {section.label}
              </button>
            )
          })}
        </div>

	        {ALLURA_ROUTE_SECTIONS.map((section) => {
	          const isActive = activeSection === section.id
	          return (
	            <div
	              key={section.id}
	              id={`allura-section-panel-${section.id}`}
	              role="tabpanel"
	              aria-labelledby={`allura-section-tab-${section.id}`}
	              hidden={!isActive}
	              className="mt-4"
	            >
	              {isLoading ? (
	                isActive ? <SearchResultsSkeleton /> : null
	              ) : (
	                <>
	              {section.id === "memories" && (
	                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
	                  {filteredMemories.length === 0 ? (
	                    <EmptyState
	                      title={normalizedSearch ? "No memories match this search" : "No memories returned"}
	                      description={normalizedSearch ? "The current Allura Brain rows did not match the search query." : "Allura Brain returned no memory rows for this group."}
	                    />
	                  ) : (
	                    filteredMemories.slice(0, 12).map((memory) => <MemoryCard key={memory.id} memory={memory} />)
	                  )}
	                </div>
	              )}

	              {section.id === "insights" && (
	                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
	                  {filteredInsights.length === 0 ? (
	                    <EmptyState
	                      title={normalizedSearch ? "No insights match this search" : "No active insights"}
	                      description={normalizedSearch ? "The active insight records did not match the search query." : "Curated semantic knowledge will appear after HITL approval."}
	                    />
	                  ) : (
	                    filteredInsights.slice(0, 9).map((insight) => <InsightCard key={insight.id} insight={insight} />)
	                  )}
	                </div>
	              )}

	              {section.id === "trace-logs" && (
	                <div className="grid gap-3 xl:grid-cols-2">
	                  {filteredEvidence.length === 0 ? (
	                    <EmptyState
	                      title={normalizedSearch ? "No trace logs match this search" : "No trace logs"}
	                      description={normalizedSearch ? "The append-only evidence rows did not match the search query." : "Append-only evidence was not returned by the trace endpoint."}
	                    />
	                  ) : (
	                    filteredEvidence.slice(0, 10).map((item) => <EvidenceCard key={item.id} evidence={item} />)
	                  )}
	                </div>
	              )}

	              {section.id === "provenance" && (
	                <div className="grid gap-3 md:grid-cols-3">
	                  <SummaryCard
	                    label="People and agents"
                    value={provenanceAgents.length}
                    detail={provenanceAgents.slice(0, 5).join(", ") || "No provenance returned"}
                  />
	                  <SummaryCard
	                    label="Graph nodes"
	                    value={filteredGraphNodes.length}
	                    detail="Derived from Allura Brain graph endpoint"
	                  />
	                  <SummaryCard
	                    label="Graph edges"
	                    value={filteredGraphEdges.length}
	                    detail={`Total tenant relationships: ${graph.totalEdges ?? "Unavailable"}`}
	                  />
	                </div>
	              )}

	              {section.id === "extracted-facts" && (
	                <div className="grid gap-3 xl:grid-cols-2">
	                  {extractedFacts.length === 0 ? (
	                    <EmptyState
	                      title={normalizedSearch ? "No extracted facts match this search" : "No extracted facts"}
	                      description={normalizedSearch ? "The extracted fact evidence did not match the search query." : "No fact-like evidence was returned from traces."}
	                    />
	                  ) : (
	                    extractedFacts.map((item) => <EvidenceCard key={item.id} evidence={item} />)
	                  )}
	                </div>
	              )}

	              {section.id === "approval-queue" && (
	                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
	                  {filteredQueue.length === 0 ? (
	                    <EmptyState
	                      title={normalizedSearch ? "No approvals match this search" : "Approval queue is empty"}
	                      description={normalizedSearch ? "The pending approval proposals did not match the search query." : "No pending canonical proposals require HITL review."}
	                    />
	                  ) : (
	                    filteredQueue.slice(0, 12).map((insight) => <InsightCard key={insight.id} insight={insight} />)
	                  )}
	                </div>
	              )}
	                </>
	              )}
	            </div>
	          )
	        })}
	      </section>
    </div>
  )
}

function PolicyTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
      <p className="text-[11px] font-semibold tracking-[1.2px] text-[var(--dashboard-text-muted)] uppercase">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-5 font-semibold text-[var(--dashboard-text-primary)]">{value}</p>
    </div>
  )
}

function StatTile({
  label,
  value,
  detail,
  tone,
  icon: Icon,
}: {
  label: string
  value: number
  detail: string
  tone: StatTone
  icon: LucideIcon
}) {
  return (
    <article className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4 shadow-[var(--allura-sh-sm)]">
      <div className={cn("flex size-9 items-center justify-center rounded-lg border", toneClasses(tone))}>
        <Icon className="size-4" aria-hidden />
      </div>
      <p className="mt-3 text-[11px] font-semibold tracking-[1.2px] text-[var(--dashboard-text-muted)] uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[var(--dashboard-text-primary)]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--dashboard-text-secondary)]">{detail}</p>
    </article>
  )
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4 shadow-[var(--allura-sh-sm)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--dashboard-text-secondary)]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function PostureRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: string
  tone: StatTone
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", toneClasses(tone))}>
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[1.2px] text-[var(--dashboard-text-muted)] uppercase">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-[var(--dashboard-text-primary)]">{value}</p>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4 shadow-[var(--allura-sh-sm)]">
      <p className="text-xs font-semibold tracking-[1.2px] text-[var(--dashboard-text-muted)] uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--dashboard-text-primary)]">{value}</p>
      <p className="mt-2 line-clamp-2 text-sm text-[var(--dashboard-text-secondary)]">{detail}</p>
    </article>
  )
}
