import type { SubgraphEdge, SubgraphNode } from "@/lib/subgraph/contract"

export function nodeKindKey(node: SubgraphNode): string {
  return `${node.kind.classification}:${node.kind.name}`
}

export function relationshipKindKey(edge: SubgraphEdge): string {
  return `${edge.kind.classification}:${edge.kind.name}`
}

export function relationshipKindLabel(edge: SubgraphEdge): string {
  return `${edge.kind.name} (${edge.kind.classification})`
}

export function filterGraph(
  nodes: readonly SubgraphNode[],
  edges: readonly SubgraphEdge[],
  hiddenNodeKinds: ReadonlySet<string>,
  hiddenRelationshipKinds: ReadonlySet<string>,
): { nodes: SubgraphNode[]; edges: SubgraphEdge[] } {
  const visibleNodes = nodes.filter((node) => !hiddenNodeKinds.has(nodeKindKey(node)))
  const visibleKeys = new Set(visibleNodes.map(({ key }) => key))
  const visibleEdges = edges.filter((edge) =>
    !hiddenRelationshipKinds.has(relationshipKindKey(edge)) &&
    visibleKeys.has(edge.sourceNodeKey) &&
    visibleKeys.has(edge.targetNodeKey),
  )
  return { nodes: visibleNodes, edges: visibleEdges }
}

export interface StableMergeResult<T> {
  items: T[]
  added: number
  conflictKey: string | null
}

function samePayload(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Merge continuation records without allowing a stable identity to change payload. */
export function mergeStableByKey<T extends { key: string }>(current: readonly T[], incoming: readonly T[]): StableMergeResult<T> {
  const merged = new Map(current.map((item) => [item.key, item]))
  const incomingByKey = new Map<string, T>()
  let added = 0

  for (const item of incoming) {
    const duplicate = incomingByKey.get(item.key)
    if (duplicate && !samePayload(duplicate, item)) return { items: [...current], added: 0, conflictKey: item.key }
    incomingByKey.set(item.key, item)

    const existing = merged.get(item.key)
    if (existing && !samePayload(existing, item)) return { items: [...current], added: 0, conflictKey: item.key }
    if (!existing) {
      merged.set(item.key, item)
      added += 1
    }
  }

  return { items: [...merged.values()], added, conflictKey: null }
}
