/** Serializable dashboard contracts. Safe for client-side type-only imports. */
export interface LibraryMemory {
  id: string
  content: string
  memoryType: string
  createdAt: string
  source: "graph_memories" | "allura_memories"
  version: number | null
  provenance: string | null
}

export interface MemoryPageOptions {
  query?: string
  page?: number
  kind?: "approved" | "retained"
}

export interface MemoryPage {
  items: LibraryMemory[]
  query: string
  page: number
  pageSize: 50
  hasMore: boolean
  pageLimitReached: boolean
  kind: "approved" | "retained"
}

export interface KnowledgeNode {
  /** Store-qualified identity, distinct from the source record identifier. */
  id: string
  recordId: string
  kind: "memory" | "structural"
  label: string
  content: string
  createdAt: string
  version: number | null
  provenance: string | null
  lifecycle: "active" | "superseded" | null
}

export interface KnowledgeEdge {
  id: string
  source: string
  target: string
  relationship: string
  createdAt: string
  sourceTable: "graph_supersedes" | "graph_structural_edges"
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  nodesTruncated: boolean
  edgesTruncated: boolean
  nodeLimit: 50
  edgeLimit: 100
  focusNodeId: string | null
}
