"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { DetailPanel, type SelectedNode } from "@/components/dashboard/graph/detail-panel"
import { FilterBar, type FilterType } from "@/components/dashboard/graph/filter-bar"
import { NodeCard, type EntityNode, type EntityNodeData, type EntityType } from "@/components/dashboard/graph/node-card"

// ─── API response shape (mirrors route.ts) ────────────────────────────────────

interface ApiNode {
  id: string
  label: string
  type: string
  metadata?: Record<string, unknown>
}

interface ApiEdge {
  id: string
  source: string
  target: string
  label: string
  metadata?: Record<string, unknown>
}

interface GraphApiResponse {
  nodes: ApiNode[]
  edges: ApiEdge[]
  total_edges: number
  degraded?: boolean
  source?: string
  warning?: string
  node_count?: number
}

// ─── Placeholder data (shown when API returns empty graph) ────────────────────
// Marked clearly as placeholder. Matches the wireframe layout.

const PLACEHOLDER_NODES: ApiNode[] = [
  { id: "p-sarah",    label: "Sarah Mitchell",   type: "person",  metadata: { description: "VP of Engineering",               email: "sarah.m@meridian.io",      org: "Meridian Systems" } },
  { id: "p-james",    label: "James Chen",       type: "person",  metadata: { description: "Solutions Architect",              email: "j.chen@meridian.io",       org: "Meridian Systems" } },
  { id: "p-aisha",    label: "Aisha Rahman",     type: "person",  metadata: { description: "Data Privacy Officer",             email: "a.rahman@vaultkeep.com",   org: "VaultKeep Security" } },
  { id: "o-meridian", label: "Meridian Systems", type: "org",     metadata: { description: "Cloud Infrastructure Vendor",      email: "contracts@meridian.io" } },
  { id: "o-vault",    label: "VaultKeep Security", type: "org",   metadata: { description: "Compliance & Audit Partner",       email: "partnerships@vaultkeep.com" } },
  { id: "m-contract", label: "Contract Renewal", type: "memory",  metadata: { description: "Annual renewal discussions noted" } },
  { id: "a-brooks",   label: "brooks",           type: "agent",   metadata: { description: "Architect + Orchestrator" } },
  { id: "proj-allura", label: "allura-memory",   type: "project", metadata: { description: "Dual-DB memory engine" } },
]

const PLACEHOLDER_EDGES: ApiEdge[] = [
  { id: "e1", source: "p-sarah",    target: "o-meridian",  label: "WORKS_AT" },
  { id: "e2", source: "p-james",    target: "o-meridian",  label: "WORKS_AT" },
  { id: "e3", source: "p-aisha",    target: "o-vault",     label: "WORKS_AT" },
  { id: "e4", source: "o-meridian", target: "m-contract",  label: "REFERENCED_IN" },
  { id: "e5", source: "p-sarah",    target: "m-contract",  label: "AUTHORED" },
  { id: "e6", source: "a-brooks",   target: "proj-allura", label: "OWNS" },
  { id: "e7", source: "o-vault",    target: "proj-allura", label: "AUDITS" },
]

// ─── Layout helpers ───────────────────────────────────────────────────────────

/** Drop any nodes/edges sharing an id so React Flow keys stay unique. */
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/** Arrange nodes in a simple grid so they're spaced out by default. */
function layoutNodes(apiNodes: ApiNode[]): Node<EntityNodeData>[] {
  const COLS = 4
  const COL_W = 300
  const ROW_H = 220

  return dedupeById(apiNodes).map((n, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    return {
      id: n.id,
      type: "entity",
      position: { x: col * COL_W + 40, y: row * ROW_H + 40 },
      data: {
        label: n.label,
        type: normalizeType(n.type),
        description: String(n.metadata?.description ?? ""),
        email: n.metadata?.email ? String(n.metadata.email) : undefined,
        org: n.metadata?.org ? String(n.metadata.org) : undefined,
        connectionCount: 0,
      },
    }
  })
}

function normalizeType(raw: string): EntityType {
  const t = raw.toLowerCase()
  if (t === "person") return "person"
  if (t === "org" || t === "organisation" || t === "organization") return "org"
  if (t === "insight") return "insight"
  if (t === "memory") return "memory"
  if (t === "agent") return "agent"
  if (t === "project") return "project"
  if (t === "event") return "event"
  if (t === "system") return "system"
  return "memory"
}

function buildEdges(apiEdges: ApiEdge[]): Edge[] {
  return dedupeById(apiEdges).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    style: { stroke: "var(--dashboard-border)", strokeWidth: 1.5 },
    labelStyle: {
      fontSize: "10px",
      fill: "var(--allura-gray-500)",
      fontFamily: '"IBM Plex Mono", monospace',
    },
    labelBgStyle: { fill: "var(--allura-paper)", fillOpacity: 0.9 },
  }))
}

/** Count how many edges touch each node. */
function countConnections(nodes: Node<EntityNodeData>[], edges: Edge[]): Node<EntityNodeData>[] {
  const counts = new Map<string, number>()
  edges.forEach((e) => {
    counts.set(e.source, (counts.get(e.source) ?? 0) + 1)
    counts.set(e.target, (counts.get(e.target) ?? 0) + 1)
  })
  return nodes.map((n) => ({
    ...n,
    data: { ...n.data, connectionCount: counts.get(n.id) ?? 0 },
  }))
}

// ─── Node types registry ──────────────────────────────────────────────────────

const NODE_TYPES = { entity: NodeCard }

// ─── Main graph component (inner, needs ReactFlowProvider) ────────────────────

function GraphCanvas({
  loading,
  error,
  degraded,
  isPlaceholder,
}: {
  loading: boolean
  error: string | null
  degraded: boolean
  isPlaceholder: boolean
}) {
  if (loading) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "12px",
        color: "var(--allura-gray-500)",
        fontFamily: '"IBM Plex Sans", sans-serif',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--allura-blue)" strokeWidth="2" strokeLinecap="round" style={{ opacity: .5 }}>
          <circle cx="12" cy="12" r="3" />
          <circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" />
          <circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" />
          <path d="M9.5 10.5 5.5 7.5M14.5 10.5l4-3M9.5 13.5 5.5 16.5M14.5 13.5l4 3" />
        </svg>
        <span style={{ fontSize: "14px" }}>Loading graph from Neo4j...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "12px",
        color: "var(--allura-gray-500)",
        fontFamily: '"IBM Plex Sans", sans-serif',
        padding: "32px",
        textAlign: "center",
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--allura-red)" strokeWidth="2" strokeLinecap="round" style={{ opacity: .6 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <div>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--allura-charcoal)", margin: "0 0 4px" }}>
            Graph unavailable
          </p>
          <p style={{ fontSize: "13px", margin: "0", maxWidth: "360px" }}>{error}</p>
        </div>
      </div>
    )
  }

  return null
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function KnowledgeGraphPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<EntityNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)
  const [isPlaceholder, setIsPlaceholder] = useState(false)
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)

  const [activeFilter, setActiveFilter] = useState<FilterType>("all")
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)

  // Fetch graph data
  useEffect(() => {
    let cancelled = false

    async function fetchGraph() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/memory/graph?group_id=allura-system", {
          headers: { "x-allura-group-id": "allura-system" },
        })

        if (!res.ok) {
          throw new Error(`API returned ${res.status}`)
        }

        const data = (await res.json()) as GraphApiResponse

        if (cancelled) return

        if (data.degraded) setDegraded(true)

        const rawNodes: ApiNode[] = data.nodes ?? []
        const rawEdges: ApiEdge[] = data.edges ?? []

        // Use placeholder when graph is truly empty (Neo4j not seeded yet)
        const usePlaceholder = rawNodes.length === 0
        const sourceNodes = usePlaceholder ? PLACEHOLDER_NODES : rawNodes
        const sourceEdges = usePlaceholder ? PLACEHOLDER_EDGES : rawEdges

        if (usePlaceholder) setIsPlaceholder(true)

        const flowNodes = layoutNodes(sourceNodes)
        const flowEdges = buildEdges(sourceEdges)
        const nodesWithCounts = countConnections(flowNodes, flowEdges)

        setNodes(nodesWithCounts)
        setEdges(flowEdges)
        setNodeCount(data.node_count ?? sourceNodes.length)
        setEdgeCount(data.total_edges ?? sourceEdges.length)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load graph")
          // Still show placeholder on error so the page isn't blank
          const flowNodes = layoutNodes(PLACEHOLDER_NODES)
          const flowEdges = buildEdges(PLACEHOLDER_EDGES)
          setNodes(countConnections(flowNodes, flowEdges))
          setEdges(flowEdges)
          setIsPlaceholder(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchGraph()
    return () => { cancelled = true }
  }, [setNodes, setEdges])

  // Filter: hide nodes that don't match the active filter
  const visibleNodes = useMemo(() => {
    if (activeFilter === "all") return nodes
    // Memories and insights map to same filter pill
    if (activeFilter === "memory") {
      return nodes.map((n) => ({
        ...n,
        hidden: n.data.type !== "memory" && n.data.type !== "insight",
      }))
    }
    return nodes.map((n) => ({
      ...n,
      hidden: n.data.type !== activeFilter,
    }))
  }, [nodes, activeFilter])

  // Build connections for the selected node from live edge data
  const selectedNodeWithConnections: SelectedNode | null = useMemo(() => {
    if (!selectedNode) return null
    const connectedEdges = edges.filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id
    )
    const connections = connectedEdges.map((e) => {
      const otherId = e.source === selectedNode.id ? e.target : e.source
      const otherNode = nodes.find((n) => n.id === otherId)
      return {
        id: otherId,
        label: otherNode?.data.label ?? otherId,
        type: (otherNode?.data.type ?? "event") as EntityType,
        relationship: String(e.label ?? "connected_to"),
      }
    })
    return { ...selectedNode, connections }
  }, [selectedNode, edges, nodes])

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node<EntityNodeData>) => {
    setSelectedNode({
      id: node.id,
      data: node.data,
    })
  }, [])

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const showLoading = loading
  const showError = !loading && !!error && nodes.length === 0

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 88px)", minHeight: "480px", fontFamily: '"IBM Plex Sans", sans-serif' }}>

      {/* Page header */}
      <div style={{
        padding: "24px 32px 0",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            background: "rgba(124,58,237,.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" />
              <circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" />
              <path d="M9.5 10.5 5.5 7.5M14.5 10.5l4-3M9.5 13.5 5.5 16.5M14.5 13.5l4 3" />
            </svg>
          </div>
          <div>
            <p style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--allura-blue)",
              margin: "0 0 2px",
            }}>
              Knowledge Graph
            </p>
            <h1 style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--allura-charcoal)",
              letterSpacing: "-0.01em",
              margin: "0",
              lineHeight: 1.1,
            }}>
              Knowledge Graph
            </h1>
            <p style={{ fontSize: "13px", color: "var(--allura-gray-500)", margin: "2px 0 0" }}>
              Explore entities, connections, and memory relationships.
            </p>
          </div>
        </div>

        {/* Stats */}
        {!loading && (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <StatChip label="Nodes" value={nodeCount} />
            <StatChip label="Edges" value={edgeCount} />
            {isPlaceholder && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--allura-gold)",
                background: "rgba(217,154,23,.1)",
                padding: "4px 10px",
                borderRadius: "999px",
              }}>
                Placeholder data
              </span>
            )}
            {degraded && !isPlaceholder && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--allura-orange)",
                background: "rgba(255,90,46,.08)",
                padding: "4px 10px",
                borderRadius: "999px",
              }}>
                Degraded (PG fallback)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ padding: "16px 32px 12px", flexShrink: 0 }}>
        <FilterBar active={activeFilter} onChange={setActiveFilter} />
      </div>

      {/* Graph canvas + detail panel */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* React Flow canvas */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, height: "100%", position: "relative" }}>
          {(showLoading || showError) ? (
            <GraphCanvas
              loading={showLoading}
              error={showError ? error : null}
              degraded={degraded}
              isPlaceholder={isPlaceholder}
            />
          ) : (
            <ReactFlow
              nodes={visibleNodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              style={{ background: "var(--allura-paper)" }}
            >
              <Background color="var(--dashboard-border)" gap={24} size={1} />
              <Controls
                style={{
                  background: "var(--allura-paper)",
                  border: "1px solid var(--dashboard-border)",
                  borderRadius: "8px",
                }}
              />
              <MiniMap
                style={{
                  background: "var(--allura-paper)",
                  border: "1px solid var(--dashboard-border)",
                  borderRadius: "8px",
                }}
                maskColor="rgba(17,24,39,.04)"
              />
            </ReactFlow>
          )}
        </div>

        {/* Detail panel */}
        <DetailPanel
          node={selectedNodeWithConnections}
          onClose={() => setSelectedNode(null)}
        />
      </div>

    </div>
  )
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: "var(--allura-paper)",
      border: "1px solid var(--dashboard-border)",
      borderRadius: "8px",
      padding: "6px 12px",
    }}>
      <strong style={{ fontSize: "15px", fontWeight: 700, color: "var(--allura-charcoal)", display: "block", lineHeight: 1.1 }}>
        {value}
      </strong>
      <span style={{ fontSize: "11px", color: "var(--allura-gray-500)" }}>{label}</span>
    </div>
  )
}

export default function GraphPage() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphPage />
    </ReactFlowProvider>
  )
}
