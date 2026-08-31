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

import { createHash, randomUUID } from "node:crypto"
import { evaluateGate, type GateContext } from "@/lib/branch-gate/epic-gate"
import { canonicalJson } from "@/lib/canonical-json"
import { validateGroupId } from "@/lib/validation/group-id"
import { requireDiff, requireEvidenceRefs, requireText } from "./validation"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export interface BranchMemoryValue {
  /** Stable identity of the canonical value created by this branch. */
  id: string
  /** Materialized value; branch snapshots never rely on a later lookup. */
  content: string
  score: number
  user_id?: string
  provenance: "conversation" | "manual"
  tags: string[]
}

export interface BranchOverrideValue extends BranchMemoryValue {
  /** Exact active canonical identity this value supersedes. */
  supersedes_id: string
}

export interface BranchDiff {
  added: BranchMemoryValue[]
  overridden: BranchOverrideValue[]
  deleted: string[]
}

export interface PromotionProposalInput {
  group_id: string
  workspace_id: string
  lane_id: string
  branch_id: string
  base_revision: string
  snapshot_id: string
  diff: BranchDiff
  evidence_refs: string[]
  actor_id: string
}

export interface PromotionProposalRecord {
  proposal_id: string
  canonical_proposal_id: string
  group_id: string
  workspace_id: string
  lane_id: string
  branch_id: string
  base_revision: string
  snapshot_id: string
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
  lane_id: string
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
  /** Pool clients expose release; they must be reused, never connected again. */
  release?(): void
  connect?(): Promise<Queryable & { release(): void }>
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function promotionIdentityInput(input: {
  group_id: string
  workspace_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
}): Record<string, unknown> {
  return {
    group_id: input.group_id,
    workspace_id: input.workspace_id,
    branch_id: input.branch_id,
    base_revision: input.base_revision,
    diff: input.diff,
  }
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
  return promotionTraceIdCandidates(input)[0]!
}

/** Current canonical identity plus the pre-canonical JSON.stringify identity. */
export function promotionTraceIdCandidates(input: {
  group_id: string
  workspace_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
}): string[] {
  const identity = promotionIdentityInput(input)
  return Array.from(new Set([
    `promo-${hash(canonicalJson(identity)).slice(0, 16)}`,
    `promo-${hash(JSON.stringify(identity)).slice(0, 16)}`,
  ]))
}

/** Full immutable identity of one materialized branch snapshot. */
export function branchSnapshotHash(input: {
  group_id: string
  workspace_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
  evidence_refs: string[]
  writer_id: string
}): string {
  return branchSnapshotHashCandidates(input)[0]!
}

/** Current canonical hash plus the historical insertion-order hash. */
export function branchSnapshotHashCandidates(input: {
  group_id: string
  workspace_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
  evidence_refs: string[]
  writer_id: string
}): string[] {
  return Array.from(new Set([hash(canonicalJson(input)), hash(JSON.stringify(input))]))
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
  const laneId = requireText(input.lane_id, "lane_id")
  const branchId = requireText(input.branch_id, "branch_id")
  const baseRevision = requireText(input.base_revision, "base revision")
  const snapshotId = requireText(input.snapshot_id, "snapshot_id")
  const diff = requireDiff(input.diff)
  const evidenceRefs = requireEvidenceRefs(input.evidence_refs)
  const actorId = requireText(input.actor_id, "actor_id")

  const traceId = promotionTraceId({ group_id: groupId, workspace_id: workspaceId, branch_id: branchId, base_revision: baseRevision, diff })

  // A PoolClient has a `.connect()` method too, but it is already connected.
  // Reuse its transaction so lane review → proposal creation stays atomic.
  const connected = db.connect && !db.release ? await db.connect() : undefined
  const transaction = connected ?? db
  if (connected) await transaction.query("BEGIN")
  else await transaction.begin?.()
  try {
    // Lock the durable policy-backed registry and exact snapshot before gate
    // evaluation. Lifecycle writers lock the same registry row, so a passing
    // verdict cannot race a quarantine/expiry transition into the queue.
    const registryResult = await transaction.query(
      `SELECT group_id,workspace_id,status,retention_expires_at,diff_snapshot,
              agent_id,reviewer_ids,snapshot_id,base_revision,snapshot_diff,
              snapshot_evidence_refs,writer_id,snapshot_hash
       FROM app.load_governed_lane_snapshot_for_review($1,$2,$3,$4,$5)`,
      [groupId, workspaceId, laneId, branchId, snapshotId],
    )
    const registryRow = registryResult.rows[0]
    if (!registryRow) throw new Error(`promotion blocked by gate: branch ${branchId} is not registered`)
    const writerId = requireText(registryRow.agent_id, "registered branch writer")
    const reviewerIds = Array.isArray(registryRow.reviewer_ids)
      ? registryRow.reviewer_ids.map(String).map((id) => id.trim()).filter(Boolean)
      : []
    if (actorId === writerId) throw new Error("promotion blocked by gate: branch writer cannot review their own snapshot")
    if (!reviewerIds.includes(actorId)) {
      throw new Error(`promotion blocked by gate: ${actorId} is not a configured reviewer for ${branchId}`)
    }
    const recordedSnapshot = registryRow.diff_snapshot
    const parsedSnapshot = recordedSnapshot != null && typeof recordedSnapshot === "object"
      ? (recordedSnapshot as GateContext["recorded"] & { snapshot_id?: unknown })
      : typeof recordedSnapshot === "string" && recordedSnapshot.trim().length > 0
        ? (JSON.parse(recordedSnapshot) as GateContext["recorded"] & { snapshot_id?: unknown })
        : undefined
    if (!parsedSnapshot || String(parsedSnapshot.snapshot_id ?? "") !== snapshotId ||
      String(registryRow.snapshot_id) !== snapshotId ||
      String(registryRow.base_revision) !== baseRevision ||
      String(registryRow.writer_id) !== writerId ||
      JSON.stringify(requireDiff(registryRow.snapshot_diff)) !== JSON.stringify(diff) ||
      JSON.stringify(requireEvidenceRefs(registryRow.snapshot_evidence_refs)) !== JSON.stringify(evidenceRefs)) {
      throw new Error("promotion blocked by gate: persisted branch snapshot identity does not match")
    }
    const expectedSnapshotHashes = branchSnapshotHashCandidates({
      group_id: groupId,workspace_id: workspaceId,branch_id: branchId,
      base_revision: baseRevision,diff,evidence_refs: evidenceRefs,writer_id: writerId,
    })
    if (!expectedSnapshotHashes.includes(String(registryRow.snapshot_hash))) {
      throw new Error("promotion blocked by gate: persisted branch snapshot hash does not match")
    }
    const gateContext: GateContext = {
      group_id: groupId,workspace_id: workspaceId,branch_id: branchId,
      base_revision: baseRevision,diff,evidence_refs: evidenceRefs,
      status: String(registryRow.status) as GateContext["status"],
      base_owner: { group_id: String(registryRow.group_id), workspace_id: String(registryRow.workspace_id) },
      retention_expires_at: registryRow.retention_expires_at != null ? String(registryRow.retention_expires_at) : undefined,
      recorded: parsedSnapshot,
    }
    const verdict = await evaluateGate(gateContext, transaction)
    if (!verdict.ok) {
      const failed = Object.entries(verdict.checks).filter(([, check]) => !check.ok).map(([name]) => name)
      throw new Error(`promotion blocked by gate: ${failed.join(", ")}`)
    }

    const metadata = {
      lane_id: laneId,branch_id: branchId,base_revision: baseRevision,diff,
      actor_id: actorId,trace_id: traceId,workspace_id: workspaceId,
      snapshot_id: snapshotId,writer_id: writerId,reviewer_id: actorId,
    }
    const promotionProposalId = randomUUID()
    const canonicalProposalId = randomUUID()
    const sourceEvent = await transaction.query(
      `INSERT INTO events (
         group_id, workspace_id, event_type, agent_id, status, metadata
       ) VALUES ($1,$2,'branch_promotion_submitted',$3,'completed',$4::jsonb)
       RETURNING id`,
      [groupId, workspaceId, actorId, JSON.stringify({
        branch_id: branchId,
        base_revision: baseRevision,
        snapshot_id: snapshotId,
        trace_id: traceId,
        evidence_refs: evidenceRefs,
      })],
    )
    if (!sourceEvent.rows[0]?.id) throw new Error("branch promotion source event was not persisted")

    const manifest = {
      kind: "governed_branch_diff",
      schema_version: "v1",
      promotion_proposal_id: promotionProposalId,
      lane_id: laneId,
      branch_id: branchId,
      base_revision: baseRevision,
      snapshot_id: snapshotId,
      trace_id: traceId,
      writer_id: writerId,
      reviewer_id: actorId,
      diff,
      evidence_refs: evidenceRefs,
    } as const
    const canonicalResult = await transaction.query(
      `INSERT INTO canonical_proposals (
         id, group_id, workspace_id, content, score, reasoning,
         tier, status, trace_ref
       ) VALUES ($1,$2,$3,$4,$5,$6,'emerging','pending',$7)
       RETURNING id, status`,
      [canonicalProposalId, groupId, workspaceId, JSON.stringify(manifest), 0.5,
        `Governed branch snapshot ${snapshotId} awaiting curator approval`, sourceEvent.rows[0].id],
    )
    const canonicalProposal = canonicalResult.rows[0]
    if (!canonicalProposal?.id) throw new Error("canonical curator proposal was not persisted")

    const proposalResult = await transaction.query(
      `INSERT INTO promotion_proposals (
        id, group_id, workspace_id, entity_type, entity_id, status,
        confidence_score, evidence_refs, metadata, proposed_by,
        branch_snapshot_id, canonical_proposal_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id, group_id, entity_id, status, proposed_by`,
      [promotionProposalId, groupId, workspaceId, "knowledge", branchId, "pending", 0.5,
        JSON.stringify(evidenceRefs), JSON.stringify(metadata), actorId, snapshotId, String(canonicalProposal.id)],
    )
    const proposal = proposalResult.rows[0]
    if (!proposal?.id) throw new Error("promotion proposal was not persisted")

    await transaction.query(
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
    if (connected) await transaction.query("COMMIT")
    else await transaction.commit?.()

    return {
      proposal_id: String(proposal.id),
      canonical_proposal_id: String(canonicalProposal.id),
      group_id: groupId,
      workspace_id: workspaceId,
      lane_id: laneId,
      branch_id: branchId,
      base_revision: baseRevision,
      snapshot_id: snapshotId,
      diff,
      evidence_refs: evidenceRefs,
      actor_id: actorId,
      status: "pending",
      trace_id: traceId,
    }
  } catch (error) {
    if (connected) await transaction.query("ROLLBACK").catch(() => undefined)
    else await transaction.rollback?.()
    throw error
  } finally {
    connected?.release()
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
  requireText(input.branch_id, "branch_id")
  requireText(input.base_revision, "base revision")
  requireDiff(input.diff)
  requireEvidenceRefs(input.evidence_refs)
  const actorId = requireText(input.actor_id, "actor_id")
  requireText(input.trace_id, "trace_id")

  const issued = await db.query(
    `SELECT app.issue_governed_promotion_receipt($1,$2,$3::uuid,$4) AS id`,
    [groupId, workspaceId, proposalId, actorId],
  )
  const id = issued.rows[0]?.id
  if (!id) throw new Error("promotion receipt was not persisted")
  const result = await db.query(
    `SELECT * FROM promotion_receipts WHERE id=$1 AND group_id=$2 AND workspace_id=$3`,
    [id, groupId, workspaceId],
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
  const laneId = requireText(input.lane_id, "lane_id")
  requireText(input.branch_id, "branch_id")
  const baseRevision = requireText(input.base_revision, "base revision")
  const diff = requireDiff(input.diff)
  const reason = requireText(input.reason, "reason")
  requireText(input.actor_id, "actor_id")
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
  if (input.retention_expires_at && new Date(input.retention_expires_at).getTime() <= Date.now()) {
    throw new Error("retention_expires_at must be in the future")
  }

  const snapshot = JSON.stringify({ base_revision: baseRevision, diff })
  const retentionExpiresAt = input.retention_expires_at ?? null

  const result = await db.query(
    `SELECT branch_id,status FROM app.transition_governed_lane(
       $1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz
     )`,
    [groupId, workspaceId, laneId, status, reason, snapshot, retentionExpiresAt],
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
    ...diff.added.map((value) => `replay add ${value.id}`),
    ...diff.overridden.map((value) => `replay override ${value.id} supersedes ${value.supersedes_id}`),
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
