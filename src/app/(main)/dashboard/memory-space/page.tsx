"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import ForceGraph2D from "react-force-graph-2d"
import { toast } from "sonner"

import { GraphSkeleton } from "@/components/dashboard"
import { getGraphNodeColor, getResolvedColor } from "@/lib/brand/allura"
import type { GraphEdge, GraphNode } from "@/lib/dashboard/types"
import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"
import { tokens } from "@/lib/tokens"

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

  const clearSelection = useCallback(() => {
    setSelectedNode(null)
    setSelectedMemory(null)
    setDetailError(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setGraphError(null)

      try {
        const response = await fetch(`/api/memory/graph?group_id=${encodeURIComponent(DEFAULT_GROUP_ID)}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data?.error ?? `HTTP ${response.status}`)
        }

        if (!cancelled) {
          setGraphData({ nodes: data.nodes ?? [], links: data.edges ?? [] })
          if (data.degraded) toast.warning("Memory graph is running in degraded mode.")
        }
      } catch (error) {
        console.error("[MemorySpace] Failed to load graph:", error)
        if (!cancelled) {
          setGraphError(error instanceof Error ? error.message : "Failed to load memory graph")
          setGraphData({ nodes: [], links: [] })
          toast.error("Failed to load memory graph. Showing empty state.")
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadDetail(node: GraphNode | null) {
      if (!node) {
        setSelectedMemory(null)
        setDetailError(null)
        return
      }

      setIsDetailLoading(true)
      setDetailError(null)

      try {
        const response = await fetch(`/api/memory/${encodeURIComponent(node.id)}?group_id=${encodeURIComponent(DEFAULT_GROUP_ID)}`)
        const data = await response.json()

        if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`)
        if (!cancelled) setSelectedMemory(data)
      } catch (error) {
        console.error("[MemorySpace] Failed to load memory detail:", error)
        if (!cancelled) {
          setDetailError("Could not load memory detail.")
          setSelectedMemory(null)
        }
      } finally {
        if (!cancelled) setIsDetailLoading(false)
      }
    }

    void loadDetail(selectedNode)
    return () => {
      cancelled = true
    }
  }, [selectedNode])

  const filteredData = useMemo(() => {
    let nodes = graphData.nodes

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      nodes = nodes.filter(
        (node) => node.label.toLowerCase().includes(query) || String(node.metadata?.description ?? "").toLowerCase().includes(query)
      )
    }

    if (activeTypeFilter) nodes = nodes.filter((node) => node.type === activeTypeFilter)

    const nodeIds = new Set(nodes.map((node) => node.id))
    const links = graphData.links.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))

    return { nodes, links }
  }, [graphData, searchQuery, activeTypeFilter])

  const nodeTypes = useMemo(() => Array.from(new Set(graphData.nodes.map((node) => node.type))), [graphData.nodes])

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
        ctx.strokeStyle = isSelected ? getResolvedColor("gold") : getResolvedColor("white")
        ctx.lineWidth = 2 / globalScale
        ctx.stroke()
      }

      if (globalScale > 0.8 || isSelected || isHovered) {
        ctx.font = `${fontSize}px sans-serif`
        ctx.fillStyle = hexToRgba(tokens.color.text.inverse, alpha)
        ctx.textAlign = "center"
        ctx.fillText(node.label, node.x ?? 0, (node.y ?? 0) + radius + fontSize + 2)
      }
    },
    [hoveredNode, searchQuery, selectedNode]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--dashboard-text-muted)]">Memory Space</p>
          <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Governed memory graph</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--dashboard-text-muted)]">
            Explore Allura&apos;s scoped memory graph, inspect node details, and preserve tenant context on every action.
          </p>
        </div>
        <div className="rounded-full border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-3 py-1 text-xs font-semibold text-[var(--dashboard-text-secondary)]">
          Scope: {DEFAULT_GROUP_ID}
        </div>
      </div>

      <div className="relative min-h-[640px] overflow-hidden rounded-2xl border border-[var(--dashboard-border)] bg-slate-950 shadow-[var(--allura-sh-md)]">
        {isLoading ? (
          <GraphSkeleton />
        ) : graphError ? (
          <div className="flex h-[640px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-300">
            <p className="text-base font-semibold text-white">Memory graph unavailable</p>
            <p className="max-w-lg text-slate-400">{graphError}</p>
          </div>
        ) : filteredData.nodes.length === 0 ? (
          <div className="flex h-[640px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-300">
            <p className="text-base font-semibold text-white">No memories match this view</p>
            <p className="max-w-lg text-slate-400">Clear search or filters, or verify Neo4j has scoped graph data.</p>
          </div>
        ) : (
          <ForceGraph2D
            graphData={filteredData}
            nodeCanvasObject={nodeCanvasObject as unknown as (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => void}
            onNodeClick={setSelectedNode as unknown as (node: object) => void}
            onBackgroundClick={clearSelection}
            onNodeHover={setHoveredNode as unknown as (node: object | null) => void}
            backgroundColor={tokens.color.text.primary}
            linkColor={() => hexToRgba(tokens.color.graph.edge, 0.3)}
            linkWidth={1}
            nodeRelSize={6}
            warmupTicks={100}
            cooldownTicks={50}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
          />
        )}

        <div className="absolute left-4 top-4 z-20 flex max-w-md flex-col gap-2">
          <div className="rounded-lg border border-slate-700 bg-slate-900/90 p-3 shadow-lg backdrop-blur">
            <input
              type="text"
              placeholder="Search graph nodes…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-transparent px-3 py-1.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-300"
            />
          </div>

          {nodeTypes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setActiveTypeFilter(null)} className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${activeTypeFilter === null ? "bg-amber-300 text-slate-950" : "bg-slate-900/80 text-slate-300 hover:bg-slate-800"}`}>
                All
              </button>
              {nodeTypes.map((type) => (
                <button type="button" key={type} onClick={() => setActiveTypeFilter(type === activeTypeFilter ? null : type)} className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors ${activeTypeFilter === type ? "bg-amber-300 text-slate-950" : "bg-slate-900/80 text-slate-300 hover:bg-slate-800"}`}>
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedNode && (
          <aside className="absolute right-4 top-4 z-20 w-80 rounded-lg border border-slate-700 bg-slate-900/95 p-4 shadow-xl backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">{selectedNode.label}</h2>
              <button type="button" onClick={clearSelection} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close detail panel">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Type:</span>
                <span className="rounded px-1.5 py-0.5 font-medium capitalize text-white" style={{ backgroundColor: getGraphNodeColor(selectedNode.type) }}>{selectedNode.type}</span>
              </div>
              {selectedNode.metadata && Object.entries(selectedNode.metadata).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="shrink-0 text-slate-400">{key}:</span>
                  <span className="break-all text-slate-300">{typeof value === "string" ? value : JSON.stringify(value)}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <a href={`/memory/${selectedNode.id}?group_id=${encodeURIComponent(DEFAULT_GROUP_ID)}`} className="flex-1 rounded-md bg-amber-300 px-3 py-1.5 text-center text-xs font-medium text-slate-950 hover:bg-amber-200">Open Detail</a>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(selectedNode.id); toast.success("Copied memory ID") }} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Copy ID</button>
            </div>

            {isDetailLoading && <p className="mt-3 text-xs text-slate-400">Loading details…</p>}
            {detailError && <p className="mt-3 text-xs text-red-300">{detailError}</p>}

            {selectedMemory && !isDetailLoading && !detailError && (
              <div className="mt-4 space-y-2 border-t border-slate-700 pt-3 text-xs text-slate-300">
                <div>
                  <p className="font-medium text-white">Content</p>
                  <p className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-700 bg-slate-950/70 p-2 text-[11px]">{selectedMemory.content ?? "No content returned."}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <span className="text-slate-400">Score:</span><span>{formatScore(selectedMemory.score)}</span>
                  <span className="text-slate-400">Source:</span><span className="capitalize">{selectedMemory.source ?? "—"}</span>
                  <span className="text-slate-400">Provenance:</span><span className="capitalize">{selectedMemory.provenance ?? "—"}</span>
                  <span className="text-slate-400">Owner:</span><span>{selectedMemory.user_id ?? "—"}</span>
                  <span className="text-slate-400">Created:</span><span>{selectedMemory.created_at ?? "—"}</span>
                </div>
              </div>
            )}
          </aside>
        )}

        <div className="absolute bottom-4 left-4 z-20 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-400 backdrop-blur">
          {filteredData.nodes.length} nodes · {filteredData.links.length} edges{searchQuery && ` · filtered by "${searchQuery}"`}
        </div>
      </div>
    </div>
  )
}
