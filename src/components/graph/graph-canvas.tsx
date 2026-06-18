"use client"

/**
 * GraphCanvas — the React Flow canvas for the Allura Knowledge Hive.
 */

import type { ReactElement } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type { GraphNode, GraphEdge } from "@/lib/graph/types"
import { CATEGORY_STYLES, EDGE_STYLES } from "@/lib/graph/types"
import type { GraphNodeData } from "./graph-node-card"
import { GraphNodeCard } from "./graph-node-card"

// ── Node layout helpers ────────────────────────────────────────────────────

/** Simple category-column layout: arrange nodes in columns by type */
function layoutNodes(nodes: GraphNode[]): Array<{ id: string; x: number; y: number }> {
  const categoryOrder = [
    "platform",
    "security",
    "memory",
    "agent",
    "policy",
    "audit",
    "ops",
    "methodology",
    "risk",
    "doc",
  ]

  const byCategory = new Map<string, GraphNode[]>()
  for (const node of nodes) {
    const cat = node.type
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(node)
  }

  const positions: Array<{ id: string; x: number; y: number }> = []
  let colIndex = 0

  for (const cat of categoryOrder) {
    const group = byCategory.get(cat)
    if (!group || group.length === 0) continue

    group.forEach((node, rowIndex) => {
      positions.push({
        id: node.id,
        x: colIndex * 280 + 40,
        y: rowIndex * 165 + 40,
      })
    })
    colIndex++
  }

  // Any nodes whose type isn't in the category order
  const handled = new Set(positions.map((p) => p.id))
  let extraRow = 0
  for (const node of nodes) {
    if (!handled.has(node.id)) {
      positions.push({
        id: node.id,
        x: colIndex * 280 + 40,
        y: extraRow * 165 + 40,
      })
      extraRow++
    }
  }

  return positions
}

// ── ReactFlow conversion ───────────────────────────────────────────────────

function toFlowNodes(
  graphNodes: GraphNode[],
  selectedId: string | null
): Node[] {
  const layout = layoutNodes(graphNodes)
  const posMap = new Map(layout.map((p) => [p.id, { x: p.x, y: p.y }]))

  return graphNodes.map((node) => {
    const pos = posMap.get(node.id) ?? { x: 0, y: 0 }
    // Build data as Record<string, unknown> to satisfy React Flow
    const data: GraphNodeData = {
      ...node,
      selected: selectedId === node.id,
    }
    return {
      id: node.id,
      type: "graphNodeCard",
      position: pos,
      data: data as unknown as Record<string, unknown>,
      draggable: true,
    }
  })
}

function toFlowEdges(
  graphEdges: GraphEdge[],
  selectedNodeId: string | null
): Edge[] {
  return graphEdges.map((edge) => {
    const es = EDGE_STYLES[edge.relationship]
    const isActive =
      selectedNodeId !== null &&
      (edge.source === selectedNodeId || edge.target === selectedNodeId)

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      animated: isActive,
      label: isActive ? es.label : undefined,
      labelStyle: { fontSize: 9, fill: es.color, fontFamily: '"IBM Plex Sans", sans-serif' },
      labelBgStyle: { fill: "#fffdf8", stroke: "#d1c7b2", strokeWidth: 0.5 },
      style: {
        stroke: es.color,
        strokeWidth: isActive ? 2.5 : 1.5,
        strokeDasharray: es.dashed ? "5,3" : undefined,
        opacity: selectedNodeId !== null && !isActive ? 0.3 : 1,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: es.color,
        width: 10,
        height: 10,
      },
    }
  })
}

// ── Custom node types ──────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  graphNodeCard: GraphNodeCard as NodeTypes[string],
}

// ── Props ──────────────────────────────────────────────────────────────────

interface GraphCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeSelect: (node: GraphNode | null) => void
}

// ── Component ──────────────────────────────────────────────────────────────

export function GraphCanvas({ nodes, edges, onNodeSelect }: GraphCanvasProps): ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const flowNodes = useMemo(
    () => toFlowNodes(nodes, selectedId),
    [nodes, selectedId]
  )
  const flowEdges = useMemo(
    () => toFlowEdges(edges, selectedId),
    [edges, selectedId]
  )

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(flowNodes)
  const [rfEdges, , onEdgesChange] = useEdgesState(flowEdges)

  // Sync when source data or selection changes
  useEffect(() => {
    setRfNodes(toFlowNodes(nodes, selectedId))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, selectedId])

  const handleNodeClick = useCallback(
    (_evt: React.MouseEvent, flowNode: Node) => {
      const graphNode = nodes.find((n) => n.id === flowNode.id) ?? null
      setSelectedId(flowNode.id)
      onNodeSelect(graphNode)
    },
    [nodes, onNodeSelect]
  )

  const handlePaneClick = useCallback(() => {
    setSelectedId(null)
    onNodeSelect(null)
  }, [onNodeSelect])

  return (
    <div style={{ position: "absolute", inset: 0, background: "#f6f3ec", borderRadius: 12 }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#d1c7b2"
        />
        <Controls
          style={{
            background: "#fffdf8",
            border: "1px solid #d1c7b2",
            borderRadius: 8,
            boxShadow: "0 1px 4px rgba(27,29,33,0.06)",
          }}
        />
        <MiniMap
          style={{
            background: "#f6f3ec",
            border: "1px solid #d1c7b2",
            borderRadius: 8,
          }}
          nodeColor={(n) => {
            const graphNode = nodes.find((gn) => gn.id === n.id)
            if (!graphNode) return "#d1c7b2"
            return CATEGORY_STYLES[graphNode.type]?.accent ?? "#d1c7b2"
          }}
          maskColor="rgba(246,243,236,0.7)"
        />
      </ReactFlow>
    </div>
  )
}
