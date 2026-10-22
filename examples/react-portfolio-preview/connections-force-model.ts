import type { buildConnectionsGraph, ConnectionKind } from './connections-graph-model'

export interface ForceNode { id: string; label: string; kind: ConnectionKind; x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number }
export interface ForceLink { id: string; source: string | ForceNode; target: string | ForceNode; label: string }
export interface ForceData { nodes: ForceNode[]; links: ForceLink[]; topology: string }
/** The engine may mutate only these renderer-owned copies, never provider/model records. */
export function reconcileForceData(graph: ReturnType<typeof buildConnectionsGraph>, previous?: ForceData): ForceData {
  const topology = JSON.stringify([graph.nodes.map(node => node.id), graph.edges.map(edge => [edge.id, edge.source, edge.target])])
  const existing = new Map(previous?.nodes.map(node => [node.id, node]) || [])
  const nodes = graph.nodes.map(record => {
    const node = existing.get(record.id) || { id: record.id, label: record.label, kind: record.kind }
    node.label = record.label; node.kind = record.kind
    return node
  })
  if (previous?.topology === topology) return previous
  return { nodes, links: graph.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label })), topology }
}
