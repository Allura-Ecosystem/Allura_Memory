"use client"

// Memory Graph — warm v2 surface
// tokens.color.surface.subtle — page wrapper uses bg-[var(--dashboard-surface)];
// the dark canvas inset uses an RGB canvas color for force-directed graph rendering.

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"

import { Skeleton } from "@/components/ui/skeleton"
import { getGraphNodeColor } from "@/lib/brand/allura"
import { buildDashboardRouteState } from "@/lib/dashboard/empty-states"
import type { GraphEdge, GraphNode } from "@/lib/dashboard/types"
import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"
import { tokens } from "@/lib/tokens"
import { cn } from "@/lib/utils"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface ForceGraphNode extends GraphNode {
  x?: number
  y?: number
  vx?: number
  vy?: number
}

interface GraphData {
  nodes: ForceGraphNode[]
  links: GraphEdge[]
}

interface MemoryDetail {
  id: string
  content?: string
  score?: number | { low?: number; high?: number }
  source?: "episodic" | "semantic" | "both"
  provenance?: "conversation" | "manual"
  user_id?: string
  created_at?: string
}

// ── Placeholder node spec (matches Figma node colors) ────────────────────────

const PLACEHOLDER_NODES = [
  { label: "Allura\nBrain", color: "bg-blue-600", shadow: "shadow-blue-500/50", size: "size-20", offset: { x: 0, y: 0 }, center: true },
  { label: "Agents", color: "bg-green-500", shadow: "shadow-green-500/30", size: "size-12", offset: { x: -140, y: -60 }, center: false },
  { label: "Insights", color: "bg-teal-500", shadow: "shadow-teal-500/30", size: "size-12", offset: { x: 140, y: -80 }, center: false },
  { label: "Events", color: "bg-orange-500", shadow: "shadow-orange-500/30", size: "size-12", offset: { x: -160, y: 80 }, center: false },
  { label: "Archive", color: "bg-red-500", shadow: "shadow-red-500/30", size: "size-12", offset: { x: 120, y: 100 }, center: false },
  { label: "Data", color: "bg-gray-500", shadow: "shadow-gray-500/30", size: "size-12", offset: { x: 0, y: -160 }, center: false },
  { label: "Revisions", color: "bg-purple-500", shadow: "shadow-purple-500/30", size: "size-11", offset: { x: 60, y: 160 }, center: false },
]

const GRAPH_CONTROLS = ["Zoom In", "Zoom Out", "Reset View", "Filter Nodes"]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatScore(score: MemoryDetail["score"]) {
  if (typeof score === "number") return score.toFixed(2)
  if (score && typeof score.low === "number") return String(score.low)
  return "—"
}

function hexToRgba(hexColor: string, alpha: number) {
  const hex = hexColor.replace("#", "")
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ── Placeholder canvas (shown when no live graph data) ───────────────────────

function GraphPlaceholderCanvas() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative flex items-center justify-center">
        {PLACEHOLDER_NODES.map((node) =>
          node.center ? (
            <div
              key={node.label}
              className={cn(
                "relative flex items-center justify-center rounded-full text-center text-white text-xs font-semibold shadow-lg",
                node.color,
                node.shadow,
                node.size
              )}
              style={{ lineHeight: 1.3 }}
            >
              {node.label.split("\n").map((line, i) => (
                <span key={i} className="block">{line}</span>
              ))}
            </div>
          ) : (
            <div
              key={node.label}
              className={cn(
                "absolute flex items-center justify-center rounded-full text-center text-white text-[10px] font-medium shadow-md",
                node.color,
                node.shadow,
                node.size
              )}
              style={{ transform: `translate(${node.offset.x}px, ${node.offset.y}px)`, lineHeight: 1.2 }}
            >
              {node.label}
            </div>
          )
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MemorySpacePage() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [selectedMemory, setSelectedMemory] = useState<MemoryDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [graphReloadKey, setGraphReloadKey] = useState(0)

  const clearSelection = useCallback(() => {
    setSelectedNode(null)
    setSelectedMemory(null)
    setDetailError(null)
  }, [])

  // Load graph data
  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setGraphError(null)

      try {
        const response = await fetch(`/api/memory/graph?group_id=${encodeURIComponent(DEFAULT_GROUP_ID)}`)
        const data = await response.json()

        if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`)

        if (!cancelled) {
          setGraphData({ nodes: data.nodes ?? [], links: data.edges ?? [] })
          if (data.degraded) {
            setGraphError(data.warning ?? "Memory graph degraded")
            toast.warning("Memory graph is running in degraded mode.")
          }
        }
      } catch (error) {
        if (!cancelled) {
          setGraphError(error instanceof Error ? error.message : "Failed to load memory graph")
          setGraphData({ nodes: [], links: [] })
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [graphReloadKey])

  // Load node detail on selection
  useEffect(() => {
    let cancelled = false

    async function loadDetail(node: GraphNode | null) {
      if (!node) { setSelectedMemory(null); setDetailError(null); return }
      setIsDetailLoading(true)
      setDetailError(null)

      try {
        const response = await fetch(`/api/memory/${encodeURIComponent(node.id)}?group_id=${encodeURIComponent(DEFAULT_GROUP_ID)}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`)
        if (!cancelled) setSelectedMemory(data)
      } catch (error) {
        if (!cancelled) { setDetailError("Could not load memory detail."); setSelectedMemory(null) }
      } finally {
        if (!cancelled) setIsDetailLoading(false)
      }
    }

    void loadDetail(selectedNode)
    return () => { cancelled = true }
  }, [selectedNode])

  const filteredData = useMemo(() => {
    let nodes = graphData.nodes
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      nodes = nodes.filter(
        (n) => n.label.toLowerCase().includes(q) || String(n.metadata?.description ?? "").toLowerCase().includes(q)
      )
    }
    if (activeTypeFilter) nodes = nodes.filter((n) => n.type === activeTypeFilter)
    const nodeIds = new Set(nodes.map((n) => n.id))
    const links = graphData.links.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    return { nodes, links }
  }, [graphData, searchQuery, activeTypeFilter])

  const nodeTypes = useMemo(() => Array.from(new Set(graphData.nodes.map((n) => n.type))), [graphData.nodes])

  const graphFailureState = buildDashboardRouteState("memory-space", { kind: "degraded", reason: graphError ?? undefined })
  const graphEmptyState = buildDashboardRouteState("memory-space", { kind: "empty" })

  const hasLiveData = filteredData.nodes.length > 0

  const nodeCanvasObject = useCallback(
    (node: ForceGraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const fontSize = 12 / globalScale
      const color = getGraphNodeColor(node.type)
      const isSelected = selectedNode?.id === node.id
      const isHovered = hoveredNode?.id === node.id
      const isDimmed = searchQuery.length > 0 && !node.label.toLowerCase().includes(searchQuery.toLowerCase())
      const radius = isSelected ? 8 : isHovered ? 7 : 5
      const alpha = isDimmed ? 0.25 : 1

      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI)
      ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0")
      ctx.fill()

      if (isSelected || isHovered) {
        ctx.beginPath()
        ctx.arc(node.x ?? 0, node.y ?? 0, radius + 3, 0, 2 * Math.PI)
        ctx.strokeStyle = isSelected ? "rgb(245, 166, 35)" : "rgb(255, 255, 255)"
        ctx.lineWidth = 2 / globalScale
        ctx.stroke()
      }

      if (globalScale > 0.8 || isSelected || isHovered) {
        ctx.font = `${fontSize}px sans-serif`
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.9})`
        ctx.textAlign = "center"
        ctx.fillText(node.label, node.x ?? 0, (node.y ?? 0) + radius + fontSize + 2)
      }
    },
    [hoveredNode, searchQuery, selectedNode]
  )

  return (
    // Page wrapper uses warm v2 surface — tokens.color.surface.subtle → bg-[var(--dashboard-surface)]
    <div className="space-y-4 bg-[var(--dashboard-surface)]">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--dashboard-text-muted)]">
            Memory Graph
          </p>
          <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Memory Graph</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--dashboard-text-muted)]">
            Explore Allura&apos;s scoped knowledge graph — nodes, edges, and semantic relationships.
          </p>
        </div>
        <div className="rounded-full border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-3 py-1 text-xs font-semibold text-[var(--dashboard-text-secondary)]">
          Scope: {DEFAULT_GROUP_ID}
        </div>
      </div>

      {/* Dark graph canvas — inset panel uses RGB rendering color */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{ height: 680, background: "rgb(15, 17, 23)" }}
      >
        {/* Graph Controls panel */}
        <div className="absolute left-4 top-4 z-20 w-32 rounded-lg bg-white p-3 shadow-lg">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Graph Controls</p>
          {GRAPH_CONTROLS.map((ctrl) => (
            <button
              key={ctrl}
              type="button"
              className="block w-full py-0.5 text-left text-xs text-gray-600 transition-colors hover:text-gray-900"
            >
              {ctrl}
            </button>
          ))}

          {/* Type filters — shown once live data loads */}
          {nodeTypes.length > 0 && (
            <>
              <div className="my-2 border-t border-gray-100" />
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Filter</p>
              <button
                type="button"
                onClick={() => setActiveTypeFilter(null)}
                className={cn(
                  "mb-0.5 block w-full rounded px-1.5 py-0.5 text-left text-xs transition-colors",
                  activeTypeFilter === null
                    ? "bg-[var(--dashboard-cta-primary)] text-white"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                All
              </button>
              {nodeTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActiveTypeFilter(type === activeTypeFilter ? null : type)}
                  className={cn(
                    "mb-0.5 block w-full rounded px-1.5 py-0.5 text-left text-xs capitalize transition-colors",
                    activeTypeFilter === type
                      ? "bg-[var(--dashboard-cta-primary)] text-white"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  {type}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Search — top-right inside canvas */}
        <div className="absolute right-4 top-4 z-20">
          <input
            type="text"
            placeholder="Search nodes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-48 rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none backdrop-blur"
          />
        </div>

        {/* Canvas content */}
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Skeleton className="h-8 w-48 rounded-lg opacity-20" />
            <Skeleton className="h-4 w-96 rounded-lg opacity-20" />
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-32 rounded-xl opacity-20" />
              ))}
            </div>
          </div>
        ) : graphError ? (
          /* Error / degraded state */
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            {/* Placeholder still shown behind the message */}
            <GraphPlaceholderCanvas />
            <div className="relative z-10 rounded-xl bg-black/60 px-6 py-5 backdrop-blur-sm">
              <p className="text-base font-semibold text-white">{graphFailureState.title}</p>
              <p className="mt-1 max-w-sm text-sm text-white/70">{graphFailureState.description}</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setGraphReloadKey((v) => v + 1)}
                  className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
                >
                  {graphFailureState.retryLabel}
                </button>
                <a
                  href={graphFailureState.actionHref}
                  className="rounded-md bg-[var(--dashboard-cta-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--allura-orange-hover)]"
                >
                  {graphFailureState.actionLabel}
                </a>
              </div>
            </div>
          </div>
        ) : !hasLiveData ? (
          /* Empty state — show placeholder node layout */
          <div className="relative h-full">
            <GraphPlaceholderCanvas />
            <div className="absolute inset-x-0 bottom-12 flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium text-white/80">{graphEmptyState.title}</p>
              <p className="max-w-sm text-xs text-white/50">{graphEmptyState.description}</p>
              <a
                href={graphEmptyState.actionHref}
                className="mt-1 rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
              >
                {graphEmptyState.actionLabel}
              </a>
            </div>
          </div>
        ) : (
          /* Live force graph */
          <ForceGraph2D
            graphData={filteredData}
            nodeId="id"
            nodeLabel="label"
            linkSource="source"
            linkTarget="target"
            nodeCanvasObject={nodeCanvasObject as unknown as (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => void}
            onNodeClick={setSelectedNode as unknown as (node: object) => void}
            onBackgroundClick={clearSelection}
            onNodeHover={setHoveredNode as unknown as (node: object | null) => void}
            backgroundColor="rgb(15, 17, 23)"
            linkColor={() => "rgba(255, 255, 255, 0.18)"}
            linkWidth={1}
            nodeRelSize={6}
            warmupTicks={100}
            cooldownTicks={50}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
          />
        )}

        {/* Node detail panel */}
        {selectedNode && (
          <aside className="absolute right-4 top-16 z-20 w-72 rounded-lg border border-white/20 bg-black/70 p-4 shadow-xl backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">{selectedNode.label}</h2>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
                aria-label="Close detail panel"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-white/50">Type:</span>
                <span
                  className="rounded px-1.5 py-0.5 font-medium capitalize text-white"
                  style={{ backgroundColor: getGraphNodeColor(selectedNode.type) }}
                >
                  {selectedNode.type}
                </span>
              </div>
              {selectedNode.metadata &&
                Object.entries(selectedNode.metadata).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className="shrink-0 text-white/50">{key}:</span>
                    <span className="break-all text-white/80">
                      {typeof value === "string" ? value : JSON.stringify(value)}
                    </span>
                  </div>
                ))}
            </div>

            <div className="mt-4 flex gap-2">
              <a
                href={`/memory/${selectedNode.id}?group_id=${encodeURIComponent(DEFAULT_GROUP_ID)}`}
                className="flex-1 rounded-md bg-[var(--dashboard-cta-primary)] px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-[var(--allura-orange-hover)]"
              >
                Open Detail
              </a>
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText(selectedNode.id); toast.success("Copied memory ID") }}
                className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
              >
                Copy ID
              </button>
            </div>

            {isDetailLoading && <p className="mt-3 text-xs text-white/40">Loading details…</p>}
            {detailError && <p className="mt-3 text-xs text-red-400">{detailError}</p>}

            {selectedMemory && !isDetailLoading && !detailError && (
              <div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-xs text-white/70">
                <div>
                  <p className="font-medium text-white">Content</p>
                  <p className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded border border-white/10 bg-white/5 p-2 text-[11px]">
                    {selectedMemory.content ?? "No content returned."}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <span className="text-white/40">Score:</span><span>{formatScore(selectedMemory.score)}</span>
                  <span className="text-white/40">Source:</span><span className="capitalize">{selectedMemory.source ?? "—"}</span>
                  <span className="text-white/40">Provenance:</span><span className="capitalize">{selectedMemory.provenance ?? "—"}</span>
                  <span className="text-white/40">Owner:</span><span>{selectedMemory.user_id ?? "—"}</span>
                  <span className="text-white/40">Created:</span><span>{selectedMemory.created_at ?? "—"}</span>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Stats bar */}
        <div className="absolute bottom-4 left-36 z-20 rounded-md border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white/40 backdrop-blur">
          {hasLiveData
            ? `${filteredData.nodes.length} nodes · ${filteredData.links.length} edges${searchQuery ? ` · filtered by "${searchQuery}"` : ""}`
            : "Placeholder view · connect Allura Brain to load live graph"}
        </div>

        {/* Coming soon chip */}
        {!hasLiveData && !graphError && !isLoading && (
          <div className="absolute bottom-4 right-4 z-20 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/50 backdrop-blur">
            Interactive graph coming soon
          </div>
        )}
      </div>
    </div>
  )
}
