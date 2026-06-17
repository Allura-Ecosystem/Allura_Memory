/**
 * Maps the /api/memory/graph response into GraphNode + GraphEdge arrays
 * for the Knowledge Hive canvas.
 *
 * The API can return different node types (agent, project, insight, event, system, memory).
 * We normalize these into our NodeCategory union.
 */

import type { GraphEdge, GraphNode, NodeCategory, EdgeRelationship } from "./types"

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

export interface ApiGraphResponse {
  nodes: ApiNode[]
  edges?: ApiEdge[]
  total_edges?: number
  node_count?: number
  degraded?: boolean
  source?: string
  warning?: string
}

function mapNodeType(apiType: string): NodeCategory {
  switch (apiType.toLowerCase()) {
    case "agent":   return "agent"
    case "project": return "platform"
    case "insight": return "memory"
    case "outcome": return "memory"
    case "event":   return "audit"
    case "system":  return "ops"
    case "memory":  return "memory"
    default:        return "memory"
  }
}

function mapEdgeRelationship(label: string): EdgeRelationship {
  switch (label.toLowerCase()) {
    case "performed":   return "WRITES"
    case "resulted_in": return "GENERATES"
    case "generated":   return "GENERATES"
    case "applies_to":  return "CONNECTS"
    case "connected_to":return "CONNECTS"
    case "caused_by":   return "DEPENDS_ON"
    case "owns":        return "OWNS"
    case "guards":      return "GUARDS"
    case "writes":      return "WRITES"
    case "reads":       return "READS"
    case "approves":    return "APPROVES"
    case "denies":      return "DENIES"
    case "depends_on":  return "DEPENDS_ON"
    case "stores":      return "STORES"
    case "governed_by": return "GOVERNED_BY"
    default:            return "CONNECTS"
  }
}

export function mapApiResponse(
  response: ApiGraphResponse
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = response.nodes.map((n, idx) => {
    const edgeList = response.edges ?? []
    const connectionCount = edgeList.filter(
      (e) => e.source === n.id || e.target === n.id
    ).length

    return {
      id: n.id,
      label: n.label,
      type: mapNodeType(n.type),
      summary:
        typeof n.metadata?.summary === "string"
          ? n.metadata.summary
          : typeof n.metadata?.content === "string"
          ? (n.metadata.content as string).slice(0, 120)
          : `${n.type} node`,
      status:
        typeof n.metadata?.status === "string"
          ? (n.metadata.status as GraphNode["status"])
          : undefined,
      owner:
        typeof n.metadata?.agent_id === "string"
          ? n.metadata.agent_id
          : undefined,
      connected: connectionCount,
      // spread any positional hint so React Flow can lay out nodes
      ...((idx % 4 === 0) ? {} : {}),
    }
  })

  const edges: GraphEdge[] = (response.edges ?? []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    relationship: mapEdgeRelationship(e.label),
  }))

  return { nodes, edges }
}
