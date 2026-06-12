/**
 * Work Plane — Core Type Definitions
 * Phase 2: Projects, Work Items, Lanes, Dependencies, Evidence, Handoffs
 *
 * PG-backed operational state. Board moves are audited mutations.
 * Every entity carries group_id for tenant isolation.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("work-plane/types is server-side only")
}

// ── Project ──────────────────────────────────────────────────────────────────

export type ProjectStatus = "active" | "archived" | "paused"

export interface StoredProject {
  id: string
  group_id: string
  name: string
  description: string | null
  status: ProjectStatus
  owner_id: string | null
  team_id: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

// ── Lane ─────────────────────────────────────────────────────────────────────

export interface StoredLane {
  id: string
  project_id: string
  group_id: string
  name: string
  position: number
  created_at: string
}

// ── Work Item ────────────────────────────────────────────────────────────────

export type WorkItemStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled"

export type WorkItemPriority = "critical" | "high" | "medium" | "low"

export interface StoredWorkItem {
  id: string
  project_id: string
  lane_id: string | null
  group_id: string
  title: string
  description: string | null
  status: WorkItemStatus
  priority: WorkItemPriority
  owner_id: string | null
  team_id: string | null
  acceptance_criteria: unknown[]
  linked_run_id: string | null
  latest_receipt_id: string | null
  blocker: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

// ── Work Item Dependency ─────────────────────────────────────────────────────

export interface StoredDependency {
  id: string
  work_item_id: string
  depends_on_id: string
  group_id: string
  created_at: string
}

// ── Evidence Packet ──────────────────────────────────────────────────────────

export type EvidencePacketType =
  | "general"
  | "gate_result"
  | "review"
  | "approval"
  | "test_result"
  | "audit"

export interface StoredEvidencePacket {
  id: string
  group_id: string
  work_item_id: string | null
  run_id: string | null
  step_id: string | null
  actor_id: string
  packet_type: EvidencePacketType
  content: Record<string, unknown>
  artifact_refs: string[]
  created_at: string
}

// ── Handoff ──────────────────────────────────────────────────────────────────

export type HandoffStatus = "pending" | "acknowledged" | "rejected"

export interface StoredHandoff {
  id: string
  group_id: string
  work_item_id: string | null
  from_actor_id: string
  to_actor_id: string
  message: string | null
  status: HandoffStatus
  created_at: string
  acknowledged_at: string | null
}

// ── Transition Event ─────────────────────────────────────────────────────────

/**
 * A work item status transition — audited mutation, not visual-only.
 * Stored as an append-only event in the events table.
 */
export interface WorkItemTransition {
  work_item_id: string
  from_status: WorkItemStatus
  to_status: WorkItemStatus
  actor_id: string
  reason: string | null
  evidence_id: string | null
}
