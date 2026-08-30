/**
 * Epic gate — enforcement checks (server-only).
 *
 * The gate is the epic exit gate: it verifies that a branch is safe to
 * promote before any diff is routed into a curator proposal. Promotion here
 * means creating a curator proposal — the gate never writes canonical
 * memory. It deliberately imports no memory-write module: the only tables
 * it can read are the branch registry, the promotion receipts, and the
 * workspace scope that make promotion reviewable and rollback reproducible.
 *
 * Every check returns { ok, reason? } and fails closed: an unknown base
 * owner, a missing recorded snapshot, or an unverifiable state is a block,
 * never a pass. The aggregate passes only when every check passes.
 */

import { createHash } from "node:crypto"
import type { BranchDiff, BranchRegistryStatus } from "../branch/promotion-adapter"
import { requireDiff, requireEvidenceRefs, requireText } from "../branch/validation"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

// Unified status enum — single source of truth is BranchRegistryStatus in
// promotion-adapter.ts (epic-27 retro item 11: unify status enums).
export type BranchStatus = BranchRegistryStatus

export interface CheckResult {
  ok: boolean
  reason?: string
}

export interface ScopeOwner {
  group_id: string
  workspace_id: string
}

/** The recorded, immutable snapshot a branch was created from. */
export interface RecordedSnapshot {
  base_revision: string
  diff: BranchDiff
  evidence_refs: string[]
}

export interface GateContext {
  group_id: string
  workspace_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
  evidence_refs: string[]
  status: BranchStatus
  /** Owner of the base snapshot the branch inherits from. */
  base_owner?: ScopeOwner
  /** The immutable snapshot recorded when the branch was created. */
  recorded?: RecordedSnapshot
  retention_expires_at?: string
}

export interface GateOptions {
  branchLimitPerWorkspace?: number
  now?: () => Date
}

export interface GateChecks {
  isolation: CheckResult
  poisoning: CheckResult
  replay: CheckResult
  tamper: CheckResult
  quota: CheckResult
  expiry: CheckResult
  rollback: CheckResult
}

export interface GateVerdict {
  ok: boolean
  checks: GateChecks
  promotion: "proposal-only"
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

function fail(reason: string): CheckResult {
  return { ok: false, reason }
}

function pass(): CheckResult {
  return { ok: true }
}

/**
 * Tenant axis of the isolation predicate. Mirrors the branch_registry RLS
 * model (migration 53): the tenant is the only RLS axis, keyed on the
 * transaction-local `app.current_group_id` setting exactly like migrations
 * 36/39/41. The workspace dimension stays a column predicate, never a
 * tenant of its own (ADR-001).
 */
export function tenantIsolationPredicate(activeGroupId: string, baseOwnerGroupId: string): boolean {
  return activeGroupId === baseOwnerGroupId
}

/** Workspace axis of the isolation predicate: an explicit column predicate. */
export function workspacePredicate(activeWorkspaceId: string, baseOwnerWorkspaceId: string): boolean {
  return activeWorkspaceId === baseOwnerWorkspaceId
}

/**
 * (a) Tenant/workspace isolation — fails closed. A branch in tenant A
 * cannot inherit a base from tenant B, and a branch in workspace A cannot
 * inherit a base from workspace B. An unknown base owner is a block, not
 * a pass: the gate cannot verify what it cannot see.
 */
export function checkIsolation(context: GateContext): CheckResult {
  const groupId = requireText(context.group_id, "group_id")
  const workspaceId = requireText(context.workspace_id, "workspace_id")
  const owner = context.base_owner
  if (!owner) {
    return fail("base owner is unknown; cross-scope inheritance cannot be verified")
  }
  if (!tenantIsolationPredicate(groupId, owner.group_id)) {
    return fail(`cross-tenant inheritance blocked: branch tenant ${groupId} cannot inherit a base owned by tenant ${owner.group_id}`)
  }
  if (!workspacePredicate(workspaceId, owner.workspace_id)) {
    return fail(`cross-workspace inheritance blocked: branch workspace ${workspaceId} cannot inherit a base owned by workspace ${owner.workspace_id}`)
  }
  return pass()
}

/**
 * (b) Poisoning — a poisoned branch cannot promote. The frozen statuses are
 * quarantined, rejected, and rolled_back: a quarantined branch is blocked
 * until a curator clears it, and a rejected branch is frozen by the review
 * verdict. Rollback is handled separately by checkRollback.
 */
export function checkPoisoning(context: GateContext): CheckResult {
  const status = context.status
  if (status === "quarantined") {
    return fail(`branch ${context.branch_id} is quarantined (poisoned) and cannot promote`)
  }
  if (status === "rejected") {
    return fail(`branch ${context.branch_id} is rejected and cannot promote`)
  }
  return pass()
}

/**
 * Deterministic identity of a diff: same base_revision + same diff always
 * produce the same hash, so a replayed diff is recognizable across retries.
 */
export function diffHash(baseRevision: string, diff: BranchDiff): string {
  const canonical = JSON.stringify({ base_revision: baseRevision, diff })
  return `diff-${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`
}

/**
 * (c) Replay — a replayed diff (same base_revision + same diff hash) cannot
 * create a duplicate proposal. The promotion receipts are append-only and
 * carry the deterministic trace id, so an existing receipt for the same
 * branch + diff identity proves the promotion already happened.
 */
export async function checkReplay(context: GateContext, db: Queryable): Promise<CheckResult> {
  const groupId = requireText(context.group_id, "group_id")
  const workspaceId = requireText(context.workspace_id, "workspace_id")
  const branchId = requireText(context.branch_id, "branch_id")
  const baseRevision = requireText(context.base_revision, "base revision")
  const diff = requireDiff(context.diff)
  const hash = diffHash(baseRevision, diff)

  const result = await db.query(
    `SELECT 1 AS found FROM promotion_receipts
     WHERE group_id = $1 AND workspace_id = $2 AND branch_id = $3
       AND base_revision = $4 AND diff = $5::jsonb
     LIMIT 1`,
    [groupId, workspaceId, branchId, baseRevision, JSON.stringify(diff)],
  )
  if (result.rows.length > 0) {
    return fail(`replay blocked: diff ${hash} for branch ${branchId} was already promoted`)
  }
  return pass()
}

/**
 * (d) Tamper — a diff whose evidence_refs or base_revision were altered
 * after creation is rejected. The recorded snapshot is the immutable
 * creation-time state; any drift from it is a block. An unverifiable
 * branch (no recorded snapshot) fails closed.
 */
export function checkTamper(context: GateContext): CheckResult {
  const baseRevision = requireText(context.base_revision, "base revision")
  const diff = requireDiff(context.diff)
  const evidenceRefs = requireEvidenceRefs(context.evidence_refs)
  const recorded = context.recorded
  if (!recorded) {
    return fail("no recorded snapshot exists to verify the diff against; tamper cannot be ruled out")
  }
  if (recorded.base_revision !== baseRevision) {
    return fail(`tamper rejected: base_revision was altered after creation (recorded ${recorded.base_revision}, now ${baseRevision})`)
  }
  if (JSON.stringify(recorded.diff) !== JSON.stringify(diff)) {
    return fail("tamper rejected: diff was altered after creation")
  }
  if (JSON.stringify(recorded.evidence_refs) !== JSON.stringify(evidenceRefs)) {
    return fail("tamper rejected: evidence_refs were altered after creation")
  }
  return pass()
}

/**
 * (e) Quota — branch count per workspace is bounded. The limit is
 * configurable and defaults to 100; a workspace at the limit cannot open
 * another branch.
 */
export async function checkQuota(
  context: GateContext,
  db: Queryable,
  options: GateOptions = {},
): Promise<CheckResult> {
  const groupId = requireText(context.group_id, "group_id")
  const workspaceId = requireText(context.workspace_id, "workspace_id")
  const limit = options.branchLimitPerWorkspace ?? 100

  const result = await db.query(
    `SELECT count(*) AS count FROM branch_registry
     WHERE group_id = $1 AND workspace_id = $2`,
    [groupId, workspaceId],
  )
  const count = Number(result.rows[0]?.count ?? 0)
  if (count >= limit) {
    return fail(`quota blocked: workspace ${workspaceId} is at the branch limit of ${limit}`)
  }
  return pass()
}

/**
 * (f) Expiry — an expired branch (retention_expires_at passed, or status
 * expired) cannot promote. Unbounded retention is out of scope, so the
 * registry requires a retention deadline for every non-active branch.
 */
export function checkExpiry(context: GateContext, options: GateOptions = {}): CheckResult {
  if (context.status === "expired") {
    return fail(`branch ${context.branch_id} has status expired and cannot promote`)
  }
  const expiresAt = context.retention_expires_at
  if (expiresAt) {
    const parsed = new Date(expiresAt).getTime()
    // Fail closed on a malformed deadline: an unparseable date must never
    // silently pass the expiry gate.
    if (Number.isNaN(parsed)) {
      return fail(`branch ${context.branch_id} has an unparseable retention_expires_at (${expiresAt}) and cannot promote`)
    }
    const now = (options.now ?? (() => new Date()))()
    if (parsed <= now.getTime()) {
      return fail(`branch ${context.branch_id} expired at ${expiresAt} and cannot promote`)
    }
  }
  return pass()
}

/**
 * (g) Rollback — a rolled_back branch's diff is preserved for replay and
 * cannot re-promote. The preserved snapshot is the replay source; a
 * rolled_back branch without a preserved diff is a broken state and fails
 * closed.
 */
export function checkRollback(context: GateContext): CheckResult {
  if (context.status !== "rolled_back") {
    return pass()
  }
  const recorded = context.recorded
  if (!recorded) {
    return fail("rolled_back branch has no preserved diff; replay is impossible and re-promotion is blocked")
  }
  return fail(
    `branch ${context.branch_id} is rolled_back; its diff is preserved for replay (base ${recorded.base_revision}) and cannot re-promote`,
  )
}

/**
 * Aggregate the gate. Promotion is proposal-only: the gate verifies the
 * branch and reports a verdict; it never writes canonical memory and never
 * approves anything itself.
 */
export async function evaluateGate(
  context: GateContext,
  db: Queryable,
  options: GateOptions = {},
): Promise<GateVerdict> {
  const checks: GateChecks = {
    isolation: checkIsolation(context),
    poisoning: checkPoisoning(context),
    replay: await checkReplay(context, db),
    tamper: checkTamper(context),
    quota: await checkQuota(context, db, options),
    expiry: checkExpiry(context, options),
    rollback: checkRollback(context),
  }
  const ok = Object.values(checks).every((check) => check.ok)
  return { ok, checks, promotion: "proposal-only" }
}
