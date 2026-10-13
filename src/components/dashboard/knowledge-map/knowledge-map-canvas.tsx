"use client"

import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useEffect, useMemo, useRef, useState } from "react"

import type { SubgraphEdge, SubgraphNode } from "@/lib/subgraph/contract"

import {
  type KnowledgeMapFlowNode,
  KnowledgeMapNode,
  nodeTone,
  relationshipColor,
} from "./knowledge-map-node"
import styles from "./knowledge-map.module.css"

// React Flow compares this mapping by reference; keep it module-stable so
// filtering, selection, and Fast Refresh do not recreate the node registry.
const NODE_TYPES = Object.freeze({ knowledgeMap: KnowledgeMapNode })

function layout(
  nodes: readonly SubgraphNode[],
  edges: readonly SubgraphEdge[],
  selectedKey: string | null,
): KnowledgeMapFlowNode[] {
  const degree = new Map(nodes.map((node) => [node.key, 0]))
  for (const edge of edges) {
    degree.set(edge.sourceNodeKey, (degree.get(edge.sourceNodeKey) ?? 0) + 1)
    degree.set(edge.targetNodeKey, (degree.get(edge.targetNodeKey) ?? 0) + 1)
  }
  const ordered = [...nodes].sort((left, right) =>
    (degree.get(right.key) ?? 0) - (degree.get(left.key) ?? 0)
      || left.key.localeCompare(right.key),
  )
  const center = { x: 420, y: 290 }
  const radialCount = Math.max(1, ordered.length - 1)
  const selectedNeighbors = new Set<string>()
  if (selectedKey) {
    selectedNeighbors.add(selectedKey)
    for (const edge of edges) {
      if (edge.sourceNodeKey === selectedKey) selectedNeighbors.add(edge.targetNodeKey)
      if (edge.targetNodeKey === selectedKey) selectedNeighbors.add(edge.sourceNodeKey)
    }
  }

  return ordered.map((node, index) => {
    const ringIndex = Math.max(0, index - 1)
    const ring = Math.floor(ringIndex / 8)
    const positionInRing = ringIndex % 8
    const nodesInRing = Math.min(8, radialCount - ring * 8)
    const angle = nodesInRing === 2
      ? (-Math.PI * 0.27) + (positionInRing * Math.PI * 0.54)
      : (-Math.PI / 2) + (positionInRing * Math.PI * 2 / Math.max(1, nodesInRing)) + (ring * 0.24)
    const radiusX = 172 + ring * 150
    const radiusY = 148 + ring * 118
    const position = index === 0
      ? center
      : {
          x: center.x + Math.cos(angle) * radiusX,
          y: center.y + Math.sin(angle) * radiusY,
        }

    return {
    id: node.key,
    type: "knowledgeMap",
    position,
    data: {
      node,
      connectionCount: edges.filter((edge) => edge.sourceNodeKey === node.key || edge.targetNodeKey === node.key).length,
    },
    draggable: false,
    selectable: true,
    selected: selectedKey === node.key,
    style: { opacity: selectedKey && !selectedNeighbors.has(node.key) ? 0.3 : 1 },
    focusable: true,
    ariaRole: "button",
    ariaLabel: `${node.label}. ${node.kind.name}, ${node.freshness.state}. Select to inspect.`,
    domAttributes: {
      "aria-controls": "knowledge-map-inspector",
      "aria-pressed": selectedKey === node.key,
    },
    }
  })
}

function flowEdges(edges: readonly SubgraphEdge[], selectedKey: string | null): Edge[] {
  return edges.map((edge) => {
    const active = selectedKey === edge.sourceNodeKey || selectedKey === edge.targetNodeKey
    const color = relationshipColor(edge.kind.name)
    return {
      id: edge.key,
      source: edge.sourceNodeKey,
      target: edge.targetNodeKey,
      label: edge.label,
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: {
        stroke: color,
        strokeWidth: active ? 2.5 : 1.5,
        opacity: selectedKey && !active ? 0.3 : 0.72,
      },
      labelStyle: { fill: color, fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "var(--c-card)" },
      labelBgPadding: [7, 4] as [number, number],
      labelBgBorderRadius: 5,
      animated: false,
    }
  })
}

export function KnowledgeMapCanvas({
  nodes,
  edges,
  selectedKey,
  onSelect,
}: {
  nodes: readonly SubgraphNode[]
  edges: readonly SubgraphEdge[]
  selectedKey: string | null
  onSelect: (key: string, opener?: HTMLElement | null) => void
}): React.ReactElement {
  const flowInstance = useRef<ReactFlowInstance<KnowledgeMapFlowNode, Edge> | null>(null)
  const [compactViewport, setCompactViewport] = useState(false)
  const canvasNodes = useMemo(() => layout(nodes, edges, selectedKey), [edges, nodes, selectedKey])
  const canvasEdges = useMemo(() => flowEdges(edges, selectedKey), [edges, selectedKey])
  const fitOptions = useMemo(() => ({
    padding: compactViewport ? 0.08 : 0.22,
    minZoom: compactViewport ? 0.82 : 0.08,
    maxZoom: 1.08,
  }), [compactViewport])

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const query = window.matchMedia("(max-width: 480px)")
    const update = () => {
      const compact = query.matches
      setCompactViewport(compact)
      requestAnimationFrame(() => { void flowInstance.current?.fitView({
        padding: compact ? 0.08 : 0.22,
        minZoom: compact ? 0.82 : 0.08,
        maxZoom: 1.08,
      }) })
    }
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  return (
    <div
      className={styles.canvasViewport}
      data-node-count={nodes.length}
      data-edge-count={edges.length}
      data-has-selection={selectedKey ? "true" : "false"}
    >
      <ReactFlow
        nodes={canvasNodes}
        edges={canvasEdges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(event, node) => onSelect(
          node.id,
          (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node")
            ?? document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`),
        )}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          const opener = (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node")
          const key = opener?.dataset.id
          if (!key) return
          event.preventDefault()
          onSelect(key, opener)
        }}
        fitView
        fitViewOptions={fitOptions}
        onInit={(instance) => { flowInstance.current = instance }}
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--c-border-soft)" />
        <Controls showInteractive={false} aria-label="Knowledge Map controls" />
        {nodes.length > 8 ? (
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => {
              const graphNode = (node as KnowledgeMapFlowNode).data.node
              return graphNode ? nodeTone(graphNode).color : "var(--c-blue)"
            }}
            maskColor="color-mix(in srgb, var(--c-bg) 78%, transparent)"
          />
        ) : null}
      </ReactFlow>
    </div>
  )
}
