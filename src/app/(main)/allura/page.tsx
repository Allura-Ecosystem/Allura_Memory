"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { loadCuratorQueue, loadEvidence, loadGraph, loadInsights, loadMemories, loadMemoryStats, loadRecentActivity } from "@/lib/dashboard/queries"
import type { ActivityItem, DashboardResult, Evidence, GraphEdge, GraphNode, Insight, Memory } from "@/lib/dashboard/types"
import type { MemoryStats } from "@/app/api/memory/stats/route"

type AlluraRouteData = {
  memories: DashboardResult<Memory[]>
  insights: DashboardResult<Insight[]>
  evidence: DashboardResult<Evidence[]>
  queue: DashboardResult<Insight[]>
  graph: DashboardResult<{ nodes: GraphNode[]; edges: GraphEdge[]; totalEdges?: number }>
  stats: DashboardResult<MemoryStats>
  recentActivity: DashboardResult<ActivityItem[]>
}

function emptyResult<T>(data: T): DashboardResult<T> {
  return { data, error: null, degraded: false, warnings: [] }
}

async function loadAlluraRouteData(): Promise<AlluraRouteData> {
  const [memories, insights, evidence, queue, graph, stats, recentActivity] = await Promise.all([
    loadMemories(),
    loadInsights("active"),
    loadEvidence(),
    loadCuratorQueue("pending"),
    loadGraph(),
    loadMemoryStats(),
    loadRecentActivity(),
  ])

  return { memories, insights, evidence, queue, graph, stats, recentActivity }
}

const ALLURA_SECTIONS = [
  { id: "memories", label: "Memories" },
  { id: "insights", label: "Insights" },
  { id: "evidence", label: "Evidence" },
  { id: "queue", label: "Queue" },
  { id: "graph", label: "Graph" },
]

export default function AlluraRoutePage() {
  const [state, setState] = useState<AlluraRouteData | null>(null)
  const [activeSection, setActiveSection] = useState<string>("memories")

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
            memories: { ...emptyResult<Memory[]>([]), error: message },
            insights: emptyResult<Insight[]>([]),
            evidence: emptyResult<Evidence[]>([]),
            queue: emptyResult<Insight[]>([]),
            graph: emptyResult<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] }),
            stats: { data: null, error: null, degraded: false, warnings: [] },
            recentActivity: emptyResult<ActivityItem[]>([]),
          })
        }
      })
    return () => { cancelled = true }
  }, [])

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
  const errors = [state?.memories.error, state?.insights.error, state?.evidence.error, state?.queue.error, state?.graph.error].filter(
    Boolean
  ) as string[]

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Allura Brain</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">Mission Control for memories, insights, and governance.</p>
      </div>

      {/* Stats */}
      {state && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-[var(--dashboard-text-muted)]">Episodic</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-2xl font-bold text-[var(--dashboard-text-primary)]">{state.stats.data?.episodic_count ?? "—"}</p>
            </CardContent>
          </Card>
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-[var(--dashboard-text-muted)]">Semantic</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-2xl font-bold text-[var(--dashboard-text-primary)]">{state.stats.data?.semantic_count ?? "—"}</p>
            </CardContent>
          </Card>
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-[var(--dashboard-text-muted)]">Searches</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-2xl font-bold text-[var(--dashboard-text-primary)]">{state.stats.data?.search_count ?? "—"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-yellow-700">{w.message || String(w)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Errors */}
      {errors.map((error) => (
        <div key={error} className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ))}

      {!state ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
            {ALLURA_SECTIONS.map((section) => (
              <TabsTrigger
                key={section.id}
                value={section.id}
                className="rounded-full border border-[var(--dashboard-border)] px-3 py-1.5 data-[state=active]:bg-[var(--dashboard-surface)] data-[state=active]:shadow-sm"
              >
                {section.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="memories" className="space-y-3">
            {memories.length === 0 ? (
              <p className="text-sm text-[var(--dashboard-text-secondary)]">No memories found.</p>
            ) : (
              memories.slice(0, 10).map((memory) => (
                <Card key={memory.id} className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-[var(--dashboard-text-primary)]">{memory.title || "Untitled"}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-[var(--dashboard-text-secondary)]">{memory.content?.slice(0, 200) || "No content"}...</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="insights" className="grid gap-3 md:grid-cols-2">
            {insights.length === 0 ? (
              <p className="text-sm text-[var(--dashboard-text-secondary)]">No insights found.</p>
            ) : (
              insights.slice(0, 10).map((insight) => (
                <Card key={insight.id} className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-[var(--dashboard-text-primary)]">{insight.title || "Untitled"}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-[var(--dashboard-text-secondary)]">{insight.content?.slice(0, 200) || "No content"}...</p>
                    <div className="mt-2 flex gap-2 text-xs text-[var(--dashboard-text-muted)]">
                      <Badge variant="outline">{insight.status}</Badge>
                      <span>Confidence: {insight.confidence}%</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="evidence" className="space-y-3">
            {evidence.length === 0 ? (
              <p className="text-sm text-[var(--dashboard-text-secondary)]">No evidence found.</p>
            ) : (
              evidence.slice(0, 10).map((item) => (
                <Card key={item.id} className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-[var(--dashboard-text-primary)]">{item.title || "Untitled"}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-[var(--dashboard-text-secondary)]">{item.rawLog?.slice(0, 200) || "No log"}...</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="queue" className="space-y-3">
            {queue.length === 0 ? (
              <p className="text-sm text-[var(--dashboard-text-secondary)]">No pending proposals.</p>
            ) : (
              queue.map((insight) => (
                <Card key={insight.id} className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-[var(--dashboard-text-primary)]">{insight.title || "Untitled"}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-[var(--dashboard-text-secondary)]">{insight.content?.slice(0, 200) || "No content"}...</p>
                    <div className="mt-2 flex gap-2">
                      <Badge variant="outline">{insight.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="graph" className="space-y-3">
            <div className="rounded-2xl border border-[var(--dashboard-border)] bg-slate-950 p-8 text-center">
              <p className="text-sm text-slate-300">
                Graph view: {graph.nodes.length} nodes, {graph.edges.length} edges
              </p>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
