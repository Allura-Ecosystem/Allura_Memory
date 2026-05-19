/**
 * Memory Graph Types
 */

export interface MemoryNode {
  id: string
  title: string
  preview: string
  thumbnail?: string
  type: "raw" | "approved" | "promoted" | "deprecated"
  score: number
  source: "episodic" | "semantic" | "both"
  agent_id: string
  group_id: string
  user_id: string
  created_at: string
  x: number
  y: number
  z: number
}

export interface MemoryEdge {
  source: string // memory_id
  target: string // memory_id
  relation: "supersedes" | "related" | "promoted_from" | "authored_by"
}

export interface LayoutPosition {
  memory_id: string
  user_id: string
  group_id: string
  x: number
  y: number
  z: number
  pinned: boolean
  updated_at: string
}

export interface GraphData {
  nodes: MemoryNode[]
  edges: MemoryEdge[]
  layout: LayoutPosition[]
}

export type MemoryType = MemoryNode["type"]
export type MemorySource = MemoryNode["source"]
export type EdgeRelation = MemoryEdge["relation"]
