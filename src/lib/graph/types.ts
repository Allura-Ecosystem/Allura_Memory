/**
 * Allura Knowledge Hive — shared types.
 * All node types, edge relationships, and category color maps live here.
 */

export type NodeCategory =
  | "platform"
  | "security"
  | "memory"
  | "agent"
  | "methodology"
  | "audit"
  | "risk"
  | "doc"
  | "ops"
  | "policy"

export type NodeStatus =
  | "proposed"
  | "planned"
  | "in_progress"
  | "built"
  | "blocked"
  | "deprecated"

export type RiskLevel = "low" | "medium" | "high" | "critical"

export type EdgeRelationship =
  | "OWNS"
  | "GUARDS"
  | "CONNECTS"
  | "WRITES"
  | "READS"
  | "APPROVES"
  | "DENIES"
  | "DEPENDS_ON"
  | "GENERATES"
  | "STORES"
  | "GOVERNED_BY"

export interface GraphNode {
  id: string
  label: string
  type: NodeCategory
  status?: NodeStatus
  riskLevel?: RiskLevel
  qualityScore?: number
  owner?: string
  summary: string
  evidenceIds?: string[]
  docLinks?: string[]
  connected?: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relationship: EdgeRelationship
}

// ── Category color map (warm brand palette) ──────────────────────────────────

export interface CategoryStyle {
  /** Accent color for left border and badges */
  accent: string
  /** Very light tinted background for the card */
  bg: string
  /** Human-readable label */
  label: string
  /** Icon character */
  icon: string
}

export const CATEGORY_STYLES: Record<NodeCategory, CategoryStyle> = {
  platform:    { accent: "#f2752e", bg: "rgba(242,117,46,0.07)",  label: "Platform",    icon: "P" },
  security:    { accent: "#bf332e", bg: "rgba(191,51,46,0.07)",   label: "Security",    icon: "S" },
  memory:      { accent: "#298f57", bg: "rgba(41,143,87,0.07)",   label: "Memory",      icon: "M" },
  agent:       { accent: "#2961b8", bg: "rgba(41,97,184,0.07)",   label: "Agent",       icon: "A" },
  methodology: { accent: "#7347bf", bg: "rgba(115,71,191,0.07)",  label: "Method",      icon: "X" },
  audit:       { accent: "#caa53d", bg: "rgba(202,165,61,0.08)",  label: "Audit",       icon: "L" },
  risk:        { accent: "#bf332e", bg: "rgba(191,51,46,0.07)",   label: "Risk",        icon: "R" },
  doc:         { accent: "#6b6e73", bg: "rgba(107,110,115,0.06)", label: "Doc",         icon: "D" },
  ops:         { accent: "#6b6e73", bg: "rgba(107,110,115,0.06)", label: "Ops",         icon: "O" },
  policy:      { accent: "#7347bf", bg: "rgba(115,71,191,0.07)",  label: "Policy",      icon: "Y" },
}

// ── Edge color map ─────────────────────────────────────────────────────────

export interface EdgeStyle {
  color: string
  dashed?: boolean
  label: string
}

export const EDGE_STYLES: Record<EdgeRelationship, EdgeStyle> = {
  OWNS:        { color: "#b5a898", label: "owns" },
  GUARDS:      { color: "#caa53d", label: "guards" },
  CONNECTS:    { color: "#6b6e73", label: "connects" },
  WRITES:      { color: "#298f57", label: "writes" },
  READS:       { color: "#2961b8", label: "reads" },
  APPROVES:    { color: "#caa53d", label: "approves" },
  DENIES:      { color: "#bf332e", dashed: true, label: "denies" },
  DEPENDS_ON:  { color: "#9ca3af", dashed: true, label: "depends on" },
  GENERATES:   { color: "#7347bf", label: "generates" },
  STORES:      { color: "#1b1d21", label: "stores" },
  GOVERNED_BY: { color: "#7347bf", label: "governed by" },
}

// ── Status badge map ───────────────────────────────────────────────────────

export const STATUS_COLORS: Record<NodeStatus, { bg: string; text: string }> = {
  proposed:    { bg: "#f0ece0", text: "#6b6e73" },
  planned:     { bg: "#e8f0fd", text: "#2961b8" },
  in_progress: { bg: "#e6f4ed", text: "#298f57" },
  built:       { bg: "#298f57", text: "#ffffff" },
  blocked:     { bg: "#fde8e8", text: "#bf332e" },
  deprecated:  { bg: "#f0ece0", text: "#9ca3af" },
}

export const RISK_COLORS: Record<RiskLevel, { bg: string; text: string }> = {
  low:      { bg: "#e6f4ed", text: "#298f57" },
  medium:   { bg: "#fff3cd", text: "#8a6200" },
  high:     { bg: "#fde8e8", text: "#bf332e" },
  critical: { bg: "#bf332e", text: "#ffffff" },
}
