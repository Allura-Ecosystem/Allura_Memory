"use client"

import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  ReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useMemo } from "react"

import type { SubgraphEdge, SubgraphNode } from "@/lib/subgraph/contract"

import styles from "./knowledge-map.module.css"

function layout(nodes: readonly SubgraphNode[], selectedKey: string | null): Node[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  return nodes.map((node, index) => ({
    id: node.key,
    position: { x: (index % columns) * 230, y: Math.floor(index / columns) * 130 },
    data: { label: `${node.label}\n${node.kind.classification}: ${node.kind.name}` },
    draggable: false,
    selectable: true,
    className: selectedKey === node.key ? styles.flowNodeSelected : styles.flowNode,
    style: {
      borderColor: selectedKey === node.key ? "var(--c-orange)" : "var(--c-border)",
      background: "var(--c-card)",
      color: "var(--c-ink)",
      borderRadius: "var(--allura-r-sm)",
      fontFamily: "var(--sans)",
      whiteSpace: "pre-line",
      width: 180,
    },
  }))
}

function flowEdges(edges: readonly SubgraphEdge[], selectedKey: string | null): Edge[] {
  return edges.map((edge) => {
    const active = selectedKey === edge.sourceNodeKey || selectedKey === edge.targetNodeKey
    return {
      id: edge.key,
      source: edge.sourceNodeKey,
      target: edge.targetNodeKey,
      label: edge.label,
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--c-green)" },
      style: {
        stroke: active ? "var(--c-orange)" : "var(--c-green)",
        strokeWidth: active ? 2.5 : 1.5,
        opacity: selectedKey && !active ? 0.35 : 1,
      },
      labelStyle: { fill: "var(--c-ink)", fontFamily: "var(--sans)", fontSize: 11 },
      labelBgStyle: { fill: "var(--c-card)" },
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
  const canvasNodes = useMemo(() => layout(nodes, selectedKey), [nodes, selectedKey])
  const canvasEdges = useMemo(() => flowEdges(edges, selectedKey), [edges, selectedKey])

  return (
    <div className={styles.canvasViewport} data-node-count={nodes.length} data-edge-count={edges.length}>
      <ReactFlow
        nodes={canvasNodes}
        edges={canvasEdges}
        onNodeClick={(event, node) => onSelect(
          node.id,
          (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node")
            ?? document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`),
        )}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.25}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--c-border)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor="var(--c-blue)"
          maskColor="color-mix(in srgb, var(--c-bg) 78%, transparent)"
        />
      </ReactFlow>
    </div>
  )
}
