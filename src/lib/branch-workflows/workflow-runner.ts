/**
 * Team RAM / Durham branch workflow runner.
 *
 * Operates the lanes defined in lane-config: opens a lane branch, records
 * sole-writer ownership in the branch registry, runs the lane's work into
 * per-lane branch evidence, and routes ONLY an approved diff through the
 * promotion adapter into a curator proposal.
 *
 * No broad new agent framework: this module is a thin operator over the
 * existing branch registry and the promotion adapter. No duplicate
 * workflow-status ledger: lane status lives in branch_registry (the same
 * status vocabulary the adapter uses), and promotion writes go only to
 * promotion_proposals + approval_transitions. This module creates no
 * tables.
 */

import {
  assertDurhamManifestsComplete,
  type DurhamConceptConfig,
  type DurhamManifestSet,
  LANE_LIFECYCLE_STATUSES,
  type LaneConfig,
} from "./lane-config"
import {
  type BranchDiff,
  type BranchRegistryStatus,
  createPromotionProposal,
  quarantineBranch,
} from "../branch/promotion-adapter"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

/** Thrown when a lane's sole writer is violated. */
export class SoleWriterViolation extends Error {
  constructor(branchId: string, writerId: string, actorId: string) {
    super(`lane ${branchId} is owned by sole writer ${writerId}; ${actorId} is not the writer`)
    this.name = "SoleWriterViolation"
  }
}

export interface LaneEvidence {
  manifest?: DurhamManifestSet
  diff: BranchDiff
  evidence_refs: string[]
}

export interface LaneSession {
  lane_id: string
  branch_id: string
  writer_id: string
  group_id: string
  workspace_id: string
  base_revision: string
  manifests?: DurhamManifestSet
  evidence: LaneEvidence[]
}

export interface OpenLaneInput {
  group_id: string
  workspace_id: string
  base_revision: string
  actor_id: string
}

export interface LaneWorkInput {
  diff: BranchDiff
  evidence_refs: string[]
}

export interface ReviewDecision {
  verdict: "approved" | "rejected" | "quarantined"
  reviewer: string
  reason: string
}

export interface ReviewOutcome {
  approved: boolean
  proposal?: {
    proposal_id: string
    status: "pending"
    trace_id: string
  }
}

export interface StatusUpdateInput {
  reason: string
  retention_expires_at?: string
  actor_id: string
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

function requireDiff(diff: unknown): BranchDiff {
  if (!diff || typeof diff !== "object") throw new Error("diff is required")
  const candidate = diff as Partial<BranchDiff>
  const added = Array.isArray(candidate.added) ? candidate.added.map(String) : []
  const overridden = Array.isArray(candidate.overridden) ? candidate.overridden.map(String) : []
  const deleted = Array.isArray(candidate.deleted) ? candidate.deleted.map(String) : []
  if (added.length === 0 && overridden.length === 0 && deleted.length === 0) {
    throw new Error("diff must contain at least one addition, override, or tombstone")
  }
  return { added, overridden, deleted }
}

function requireEvidenceRefs(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("evidence_refs must be an array")
  const refs = value.map(String).map((ref) => ref.trim()).filter(Boolean)
  if (refs.length === 0) throw new Error("evidence_refs must not be empty")
  return refs
}

interface RegistryRow {
  branch_id: string
  status: string
  agent_id: string | null
}

/**
 * Open a lane branch and record sole-writer ownership. Fails closed:
 * a lane already owned by a different writer rejects the opener, a
 * quarantined lane cannot be reopened, and a Durham concept lane opens
 * only when its manifests are complete.
 */
export async function openLane(
  lane: LaneConfig | DurhamConceptConfig,
  input: OpenLaneInput,
  db: Queryable,
): Promise<LaneSession> {
  const groupId = requireText(input.group_id, "group_id")
  const workspaceId = requireText(input.workspace_id, "workspace_id")
  const baseRevision = requireText(input.base_revision, "base revision")
  const actorId = requireText(input.actor_id, "actor_id")
  const branchId = requireText(lane.branchId, "branch_id")

  const manifests = "manifests" in lane ? lane.manifests : undefined
  if (manifests) {
    assertDurhamManifestsComplete(manifests)
  }

  const existing = await db.query(
    `SELECT branch_id, status, agent_id FROM branch_registry
     WHERE group_id = $1 AND workspace_id = $2 AND branch_id = $3`,
    [groupId, workspaceId, branchId],
  )
  const row = existing.rows[0] as unknown as RegistryRow | undefined
  if (row) {
    if (row.status === "quarantined") {
      throw new Error(`lane ${branchId} is quarantined and cannot be reopened`)
    }
    if (row.status !== "active") {
      throw new Error(`lane ${branchId} is ${row.status} and cannot be opened for work`)
    }
    if (row.agent_id !== actorId) {
      throw new SoleWriterViolation(branchId, row.agent_id ?? "unknown", actorId)
    }
  } else {
    await db.query(
      `INSERT INTO branch_registry (
         group_id, workspace_id, branch_id, task_id, agent_id,
         base_snapshot_id, branch_revision, status, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)`,
      [groupId, workspaceId, branchId, "taskId" in lane ? (lane.taskId ?? null) : null, actorId, baseRevision, baseRevision, actorId],
    )
  }

  return {
    lane_id: lane.id,
    branch_id: branchId,
    writer_id: actorId,
    group_id: groupId,
    workspace_id: workspaceId,
    base_revision: baseRevision,
    manifests,
    evidence: [],
  }
}

/**
 * Run the lane's work: only the sole writer may write, and the work lands
 * in the lane's branch evidence (per-lane manifest for Durham concepts).
 */
export async function runLaneWork(
  session: LaneSession,
  work: LaneWorkInput,
  actorId: string,
): Promise<LaneSession> {
  if (actorId !== session.writer_id) {
    throw new SoleWriterViolation(session.branch_id, session.writer_id, actorId)
  }
  const diff = requireDiff(work.diff)
  const evidenceRefs = requireEvidenceRefs(work.evidence_refs)
  session.evidence.push({ manifest: session.manifests, diff, evidence_refs: evidenceRefs })
  return session
}

/**
 * Munari/Rand review gate. Only an approved diff is routed through the
 * promotion adapter into a pending curator proposal; rejected or
 * quarantined evidence freezes the lane in the registry with the preserved
 * diff snapshot. Fails closed on a lane with no evidence.
 */
export async function reviewLaneEvidence(
  session: LaneSession,
  decision: ReviewDecision,
  db: Queryable,
): Promise<ReviewOutcome> {
  if (session.evidence.length === 0) {
    throw new Error("cannot review a lane with no branch evidence")
  }
  const reviewer = requireText(decision.reviewer, "reviewer")
  const reason = requireText(decision.reason, "reason")
  const latest = session.evidence[session.evidence.length - 1]

  if (decision.verdict === "approved") {
    const proposal = await createPromotionProposal(
      {
        group_id: session.group_id,
        workspace_id: session.workspace_id,
        branch_id: session.branch_id,
        base_revision: session.base_revision,
        diff: latest.diff,
        evidence_refs: latest.evidence_refs,
        actor_id: reviewer,
      },
      db,
    )
    return {
      approved: true,
      proposal: { proposal_id: proposal.proposal_id, status: proposal.status, trace_id: proposal.trace_id },
    }
  }

  const status: BranchRegistryStatus = decision.verdict === "quarantined" ? "quarantined" : "rejected"
  await quarantineBranch(
    {
      group_id: session.group_id,
      workspace_id: session.workspace_id,
      branch_id: session.branch_id,
      base_revision: session.base_revision,
      diff: latest.diff,
      status,
      reason,
      actor_id: reviewer,
    },
    db,
  )
  return { approved: false }
}

/**
 * Move a real lane into an explicit lifecycle state. Status lives in the
 * branch registry (no duplicate ledger); every non-active state requires a
 * reason and a preserved diff snapshot, enforced by the adapter.
 */
export async function updateLaneStatus(
  session: LaneSession,
  status: BranchRegistryStatus,
  input: StatusUpdateInput,
  db: Queryable,
): Promise<{ branch_id: string; status: BranchRegistryStatus }> {
  if (!LANE_LIFECYCLE_STATUSES.includes(status)) {
    throw new Error(`unknown lane status: ${status}`)
  }
  if (status === "active") {
    throw new Error("active is the open state; use openLane to (re)open a lane")
  }
  const reason = requireText(input.reason, "reason")
  const actorId = requireText(input.actor_id, "actor_id")
  const latest = session.evidence[session.evidence.length - 1]
  if (!latest) {
    throw new Error("cannot change lane status without branch evidence")
  }
  const record = await quarantineBranch(
    {
      group_id: session.group_id,
      workspace_id: session.workspace_id,
      branch_id: session.branch_id,
      base_revision: session.base_revision,
      diff: latest.diff,
      status,
      reason,
      actor_id: actorId,
      retention_expires_at: input.retention_expires_at,
    },
    db,
  )
  return { branch_id: record.branch_id, status: record.status }
}
