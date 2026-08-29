/**
 * Governed promotion adapter (server-only).
 *
 * Converts a selected branch diff into an Allura curator proposal. Promotion
 * here means creating a curator proposal — never writing semantic memory
 * directly. The adapter deliberately imports no memory-write module: the only
 * tables it can touch are the proposal, transition, receipt, and registry
 * rows that make promotion reviewable and rollback reproducible.
 *
 * The external deterministic gate (no LM-judge) lives in the curator flow;
 * this module is the mechanism that feeds it, and it fails closed on any
 * malformed or incomplete input.
 */

import { createHash } from "node:crypto"
import { evaluateGate, type GateContext } from "@/lib/branch-gate/epic-gate"
import { validateGroupId } from "@/lib/validation/group-id"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export interface BranchDiff {
  added: string[]
  overridden: string[]
  deleted: string[]
}

export interface PromotionProposalInput {
  group_id: string
  workspace_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
  evidence_refs: string[]
  actor_id: string
}

export interface PromotionProposalRecord {
  proposal_id: string
  group_id: string
  workspace_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
  evidence_refs: string[]
  actor_id: string
  status: "pending"
  trace_id: string
}

export interface PromotionReceiptInput {
  group_id: string
  workspace_id: string
  proposal_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
  evidence_refs: string[]
  actor_id: string
  trace_id: string
}

export interface PromotionReceipt {
  id: string
  group_id: string
  workspace_id: string
  proposal_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
  evidence_refs: string[]
  actor_id: string
  trace_id: string
  issued_at: string
}

export type BranchRegistryStatus =
  | "active"
  | "degraded"
  | "expired"
  | "rejected"
  | "quarantined"
  | "rolled_back"

export interface QuarantineInput {
  group_id: string
  workspace_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
  status: BranchRegistryStatus
  reason: string
  actor_id: string
  retention_expires_at?: string
}

export interface QuarantineRecord {
  branch_id: string
  status: BranchRegistryStatus
}

export interface RollbackPlan {
  reproducible: true
  branch_id: string
  base_revision: string
  diff: BranchDiff
  replay_steps: string[]
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  begin?(): Promise<void>
  commit?(): Promise<void>
  rollback?(): Promise<void>
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

/**
 * Deterministic trace identity for a promotion: same branch, base, and diff
 * always produce the same trace id, so receipts and proposals are replayable
 * and idempotent across retries.
 */
export function promotionTraceId(input: {
  group_id: string
  workspace_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
}): string {
  const canonical = JSON.stringify({
    group_id: input.group_id,
    workspace_id: input.workspace_id,
    branch_id: input.branch_id,
    base_revision: input.base_revision,
    diff: input.diff,
  })
  return `promo-${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`
}

/**
 * Convert a branch diff into a pending curator proposal. The epic gate runs
 * first: all seven checks (isolation, poisoning, replay, tamper, quota,
 * expiry, rollback) must pass before any write, and a failing gate blocks
 * the proposal. The proposal and its initial transition are written inside
 * one transaction so a failure on the second insert cannot orphan the
 * first. The proposal starts pending and only the curator flow can move it
 * forward; this function has no approval authority of its own.
 */
export async function createPromotionProposal(
  input: PromotionProposalInput,
  db: Queryable,
): Promise<PromotionProposalRecord> {
  const groupId = validateGroupId(input.group_id)
  const workspaceId = requireText(input.workspace_id, "workspace_id")
  const branchId = requireText(input.branch_id, "branch_id")
  const baseRevision = requireText(input.base_revision, "base revision")
  const diff = requireDiff(input.diff)
  const evidenceRefs = requireEvidenceRefs(input.evidence_refs)
  const actorId = requireText(input.actor_id, "actor_id")

  const traceId = promotionTraceId({ group_id: groupId, workspace_id: workspaceId, branch_id: branchId, base_revision: baseRevision, diff })

  // Epic gate (AC-4): the branch must pass every check before any write.
  // The registry row supplies the status, retention deadline, the recorded
  // creation-time snapshot, and the base owner: the branch's base snapshot
  // (base_snapshot_id / diff_snapshot) is recorded in the branch's own
  // scope, so the row's group_id/workspace_id are the base owner. A row
  // whose scope differs from the promotion scope is a cross-scope
  // inheritance attempt and is blocked by the isolation check.
  const registryResult = await db.query(
    `SELECT group_id, workspace_id, status, retention_expires_at, diff_snapshot
     FROM branch_registry
     WHERE group_id = $1 AND workspace_id = $2 AND branch_id = $3`,
    [groupId, workspaceId, branchId],
  )
  const registryRow = registryResult.rows[0]
  if (!registryRow) {
    throw new Error(`promotion blocked by gate: branch ${branchId} is not registered`)
  }
  const recordedSnapshot = registryRow.diff_snapshot
  const gateContext: GateContext = {
    group_id: groupId,
    workspace_id: workspaceId,
    branch_id: branchId,
    base_revision: baseRevision,
    diff,
    evidence_refs: evidenceRefs,
    status: String(registryRow.status) as GateContext["status"],
    base_owner: {
      group_id: String(registryRow.group_id),
      workspace_id: String(registryRow.workspace_id),
    },
    retention_expires_at: registryRow.retention_expires_at != null ? String(registryRow.retention_expires_at) : undefined,
    recorded:
      recordedSnapshot != null && typeof recordedSnapshot === "object"
        ? (recordedSnapshot as GateContext["recorded"])
        : typeof recordedSnapshot === "string" && recordedSnapshot.trim().length > 0
          ? (JSON.parse(recordedSnapshot) as GateContext["recorded"])
          : undefined,
  }
  const verdict = await evaluateGate(gateContext, db)
  if (!verdict.ok) {
    const failed = Object.entries(verdict.checks)
      .filter(([, check]) => !check.ok)
      .map(([name]) => name)
    throw new Error(`promotion blocked by gate: ${failed.join(", ")}`)
  }

  const metadata = {
    branch_id: branchId,
    base_revision: baseRevision,
    diff,
    actor_id: actorId,
    trace_id: traceId,
    workspace_id: workspaceId,
  }

  await db.begin?.()
  try {
    const proposalResult = await db.query(
      `INSERT INTO promotion_proposals (
        group_id, entity_type, entity_id, status, confidence_score,
        evidence_refs, metadata, proposed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, group_id, entity_id, status, proposed_by`,
      [groupId, "knowledge", branchId, "pending", 0.5, JSON.stringify(evidenceRefs), JSON.stringify(metadata), actorId],
    )
    const proposal = proposalResult.rows[0]
    if (!proposal?.id) throw new Error("promotion proposal was not persisted")

    await db.query(
      `INSERT INTO approval_transitions (
        group_id, entity_type, entity_id, from_state, to_state,
        actor_id, actor_type, reason, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        groupId,
        "proposal",
        String(proposal.id),
        "draft",
        "pending",
        actorId,
        "agent",
        "Branch diff submitted for curator review",
        JSON.stringify({ branch_id: branchId, trace_id: traceId, workspace_id: workspaceId }),
      ],
    )
    await db.commit?.()

    return {
      proposal_id: String(proposal.id),
      group_id: groupId,
      workspace_id: workspaceId,
      branch_id: branchId,
      base_revision: baseRevision,
      diff,
      evidence_refs: evidenceRefs,
      actor_id: actorId,
      status: "pending",
      trace_id: traceId,
    }
  } catch (error) {
    await db.rollback?.()
    throw error
  }
}

/**
 * Issue the immutable server-issued receipt for an accepted promotion. The
 * receipt row is append-only (enforced by trigger) and carries the full diff
 * so the accepted state can be replayed or audited later.
 */
export async function issuePromotionReceipt(
  input: PromotionReceiptInput,
  db: Queryable,
): Promise<PromotionReceipt> {
  const groupId = validateGroupId(input.group_id)
  const workspaceId = requireText(input.workspace_id, "workspace_id")
  const proposalId = requireText(input.proposal_id, "proposal_id")
  const branchId = requireText(input.branch_id, "branch_id")
  const baseRevision = requireText(input.base_revision, "base revision")
  const diff = requireDiff(input.diff)
  const evidenceRefs = requireEvidenceRefs(input.evidence_refs)
  const actorId = requireText(input.actor_id, "actor_id")
  const traceId = requireText(input.trace_id, "trace_id")

  const result = await db.query(
    `INSERT INTO promotion_receipts (
       group_id, workspace_id, proposal_id, branch_id, base_revision,
       diff, evidence_refs, actor_id, trace_id, issued_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     RETURNING *`,
    [groupId, workspaceId, proposalId, branchId, baseRevision, JSON.stringify(diff), JSON.stringify(evidenceRefs), actorId, traceId],
  )
  const receipt = result.rows[0]
  if (!receipt?.id) throw new Error("promotion receipt was not persisted")
  return receipt as unknown as PromotionReceipt
}

/**
 * Quarantine a rejected or poisoned branch. The registry row keeps the
 * branch's status and the preserved diff snapshot, so a later rollback can
 * replay exactly what the branch contained when it was frozen.
 */
export async function quarantineBranch(
  input: QuarantineInput,
  db: Queryable,
): Promise<QuarantineRecord> {
  const groupId = validateGroupId(input.group_id)
  const workspaceId = requireText(input.workspace_id, "workspace_id")
  const branchId = requireText(input.branch_id, "branch_id")
  const baseRevision = requireText(input.base_revision, "base revision")
  const diff = requireDiff(input.diff)
  const reason = requireText(input.reason, "reason")
  const actorId = requireText(input.actor_id, "actor_id")
  const status = input.status

  // Migration 53 requires a retention deadline for every non-active row
  // (chk_branch_registry_retention). Fail closed here so the common path
  // cannot write a row the database would reject.
  if (status !== "active" && !input.retention_expires_at) {
    throw new Error(`retention_expires_at is required for status ${status}`)
  }
  if (input.retention_expires_at && Number.isNaN(new Date(input.retention_expires_at).getTime())) {
    throw new Error(`retention_expires_at is not a valid date: ${input.retention_expires_at}`)
  }

  const snapshot = JSON.stringify({ base_revision: baseRevision, diff })
  const retentionExpiresAt = input.retention_expires_at ?? null

  const result = await db.query(
    `INSERT INTO branch_registry (
       group_id, workspace_id, branch_id, status, quarantine_reason,
       diff_snapshot, quarantined_at, retention_expires_at, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)
     ON CONFLICT (group_id, workspace_id, branch_id) DO UPDATE SET
       status = EXCLUDED.status,
       quarantine_reason = EXCLUDED.quarantine_reason,
       diff_snapshot = EXCLUDED.diff_snapshot,
       quarantined_at = EXCLUDED.quarantined_at,
       retention_expires_at = EXCLUDED.retention_expires_at,
       updated_at = NOW()
     RETURNING branch_id, status`,
    [groupId, workspaceId, branchId, status, reason, snapshot, retentionExpiresAt, actorId],
  )
  const record = result.rows[0]
  if (!record?.branch_id) throw new Error("branch quarantine was not persisted")
  return { branch_id: String(record.branch_id), status: record.status as BranchRegistryStatus }
}

/**
 * Reproducible rollback plan derived from the preserved diff. Every step is
 * deterministic and ordered, so replaying the plan against the base revision
 * reconstructs the branch's exact state.
 */
export function buildRollbackPlan(input: PromotionProposalInput): RollbackPlan {
  // Validation is the point: a rollback plan for an unvalidated scope or
  // empty diff would be a plan for something that never existed.
  const _groupId = validateGroupId(input.group_id)
  const _workspaceId = requireText(input.workspace_id, "workspace_id")
  const branchId = requireText(input.branch_id, "branch_id")
  const baseRevision = requireText(input.base_revision, "base revision")
  const diff = requireDiff(input.diff)

  const replaySteps = [
    ...diff.added.map((id) => `replay add ${id}`),
    ...diff.overridden.map((id) => `replay override ${id}`),
    ...diff.deleted.map((id) => `replay tombstone ${id}`),
  ]

  return {
    reproducible: true,
    branch_id: branchId,
    base_revision: baseRevision,
    diff,
    replay_steps: replaySteps,
  }
}
