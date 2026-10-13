import {
  Handle,
  type Node,
  type NodeProps,
  Position,
} from "@xyflow/react"
import {
  Bot,
  Box,
  Brain,
  CircleHelp,
  FolderKanban,
  Users,
} from "lucide-react"
import type { CSSProperties } from "react"

import type { SubgraphNode } from "@/lib/subgraph/contract"

import styles from "./knowledge-map.module.css"

export interface KnowledgeMapTone {
  color: string
  soft: string
}

const NODE_TONES: Readonly<Record<string, KnowledgeMapTone>> = {
  Agent: { color: "var(--c-blue)", soft: "var(--c-blue-soft)" },
  Memory: { color: "var(--c-green)", soft: "var(--c-green-soft)" },
  Project: { color: "var(--c-gold)", soft: "var(--c-gold-soft)" },
  Team: { color: "var(--c-orange)", soft: "var(--c-orange-soft)" },
}

const RELATIONSHIP_COLORS: Readonly<Record<string, string>> = {
  AUTHORED_BY: "var(--c-blue)",
  CONTRIBUTES_TO: "var(--c-gold)",
  MEMBER_OF: "var(--c-purple)",
  RELATES_TO: "var(--c-green)",
  SUPERSEDES: "var(--c-orange)",
}

export function nodeTone(node: SubgraphNode): KnowledgeMapTone {
  if (node.kind.classification === "unknown") {
    return {
      color: "var(--c-slate)",
      soft: "color-mix(in srgb, var(--c-slate) 12%, var(--c-card))",
    }
  }
  return NODE_TONES[node.kind.name]
    ?? { color: "var(--c-purple)", soft: "var(--c-purple-soft)" }
}

export function relationshipColor(name: string): string {
  return RELATIONSHIP_COLORS[name] ?? "var(--c-slate)"
}

function kindIcon(node: SubgraphNode) {
  if (node.kind.name === "Memory") return Brain
  if (node.kind.name === "Agent") return Bot
  if (node.kind.name === "Team") return Users
  if (node.kind.name === "Project") return FolderKanban
  if (node.kind.classification === "unknown") return CircleHelp
  return Box
}

export type KnowledgeMapNodeData = {
  node: SubgraphNode
  connectionCount: number
}

export type KnowledgeMapFlowNode = Node<KnowledgeMapNodeData, "knowledgeMap">

export function KnowledgeMapNode({ data, selected }: NodeProps<KnowledgeMapFlowNode>): React.ReactElement {
  const tone = nodeTone(data.node)
  const Icon = kindIcon(data.node)
  const style = {
    "--node-accent": tone.color,
    "--node-soft": tone.soft,
  } as CSSProperties

  return (
    <div
      className={styles.brainNode}
      data-selected={selected ? "true" : "false"}
      data-visual="brain-node"
      style={style}
    >
      <Handle className={styles.flowHandle} type="target" position={Position.Left} isConnectable={false} />
      <div className={styles.brainNodeOrb} aria-hidden="true">
        <span className={styles.brainNodePulse} />
        <span className={styles.brainNodeIcon}><Icon size={20} strokeWidth={1.8} /></span>
      </div>
      <div className={styles.brainNodeLabel}>
        <strong>{data.node.label}</strong>
      </div>
      <Handle className={styles.flowHandle} type="source" position={Position.Right} isConnectable={false} />
    </div>
  )
}
