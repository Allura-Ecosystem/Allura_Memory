if (typeof window !== "undefined") throw new Error("server-side only")

import { z } from "zod/v4"
import type { PrincipalContext } from "@/lib/auth/principal-context"
import type { BranchDiff } from "@/lib/branch/promotion-adapter"
import { requireDiff, requireEvidenceRefs, requireText } from "@/lib/branch/validation"
import { resolveAuthoritativeLane } from "@/lib/branch-workflows/lane-config"
import {
  type LaneSession,
  openLane,
  reviewLaneEvidence,
  runLaneWork,
} from "@/lib/branch-workflows/workflow-runner"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"
import { validateGroupId } from "@/lib/validation/group-id"

interface ToolArgs {
  group_id?: unknown
  lane_id?: unknown
  base_revision?: unknown
  snapshot_id?: unknown
  diff?: unknown
  evidence_refs?: unknown
  verdict?: unknown
  reason?: unknown
  retention_expires_at?: unknown
}

const text = z.string().trim().min(1)
const memoryValue = z.object({
  id: text,
  content: z.string(),
  score: z.number().min(0).max(1),
  provenance: z.enum(["conversation", "manual"]),
  tags: z.array(z.string()),
}).strict()
const diffSchema = z.object({
  added: z.array(memoryValue),
  overridden: z.array(memoryValue.extend({ supersedes_id: text }).strict()),
  deleted: z.array(text),
}).strict().refine((value) => value.added.length + value.overridden.length + value.deleted.length > 0,
  "diff must contain at least one addition, override, or tombstone")
const openArgs = z.object({ group_id: text, lane_id: text, base_revision: text }).strict()
const snapshotArgs = z.object({
  group_id: text,
  lane_id: text,
  base_revision: text,
  diff: diffSchema,
  evidence_refs: z.array(text).min(1),
}).strict()
const reviewArgs = z.object({
  group_id: text,
  lane_id: text,
  snapshot_id: text,
  verdict: z.enum(["approved", "rejected", "quarantined"]),
  reason: text,
  retention_expires_at: z.string().datetime().optional(),
}).strict()

function callerArgs(args: ToolArgs): ToolArgs {
  const { workspace_id: _workspaceId, scope: _scope, curator_id: _curatorId, ...caller } = args as ToolArgs & {
    workspace_id?: unknown
    scope?: unknown
    curator_id?: unknown
  }
  return caller
}

function scope(principal: PrincipalContext, groupId: string) {
  const workspaceId = requireText(principal.workspaceId, "verified principal workspace")
  return {
    tenantId: groupId,
    workspaceId,
    principalId: principal.principalId,
  }
}

function parseVerdict(value: unknown): "approved" | "rejected" | "quarantined" {
  if (value === "approved" || value === "rejected" || value === "quarantined") return value
  throw new Error("verdict must be approved, rejected, or quarantined")
}

/** Authenticated MCP production boundary for opening a durable governed lane. */
export async function governedLaneOpen(args: ToolArgs, principal: PrincipalContext) {
  args = openArgs.parse(callerArgs(args))
  const groupId = validateGroupId(requireText(args.group_id, "group_id"))
  const laneId = requireText(args.lane_id, "lane_id")
  const baseRevision = requireText(args.base_revision, "base_revision")
  const lane = resolveAuthoritativeLane(laneId)
  return withWorkspaceTransaction(scope(principal, groupId), async (client) => {
    const session = await openLane(lane, {
      group_id: groupId,
      workspace_id: principal.workspaceId!,
      base_revision: baseRevision,
      actor_id: principal.principalId,
    }, client)
    return {
      lane_id: session.lane_id,
      branch_id: session.branch_id,
      writer_id: session.writer_id,
      reviewer_ids: session.reviewer_ids,
      base_revision: session.base_revision,
      status: "active" as const,
    }
  })
}

/** Authenticated MCP production boundary for materializing one immutable snapshot. */
export async function governedLaneSnapshot(args: ToolArgs, principal: PrincipalContext) {
  args = snapshotArgs.parse(callerArgs(args))
  const groupId = validateGroupId(requireText(args.group_id, "group_id"))
  const laneId = requireText(args.lane_id, "lane_id")
  const baseRevision = requireText(args.base_revision, "base_revision")
  const diff: BranchDiff = requireDiff(args.diff)
  const evidenceRefs = requireEvidenceRefs(args.evidence_refs)
  const lane = resolveAuthoritativeLane(laneId)
  return withWorkspaceTransaction(scope(principal, groupId), async (client) => {
    const opened = await openLane(lane, {
      group_id: groupId,
      workspace_id: principal.workspaceId!,
      base_revision: baseRevision,
      actor_id: principal.principalId,
    }, client)
    const worked = await runLaneWork(opened, { diff, evidence_refs: evidenceRefs }, principal.principalId, client)
    const snapshot = worked.evidence.at(-1)
    if (!snapshot) throw new Error("governed lane snapshot was not persisted")
    return {
      lane_id: worked.lane_id,
      branch_id: worked.branch_id,
      snapshot_id: snapshot.snapshot_id,
      snapshot_hash: snapshot.snapshot_hash,
      status: "active" as const,
    }
  })
}

/** Authenticated MCP review boundary that queues approved evidence for curator HITL. */
export async function governedLaneReview(args: ToolArgs, principal: PrincipalContext) {
  args = reviewArgs.parse(callerArgs(args))
  const groupId = validateGroupId(requireText(args.group_id, "group_id"))
  const laneId = requireText(args.lane_id, "lane_id")
  const snapshotId = requireText(args.snapshot_id, "snapshot_id")
  const verdict = parseVerdict(args.verdict)
  const reason = requireText(args.reason, "reason")
  const lane = resolveAuthoritativeLane(laneId)
  return withWorkspaceTransaction(scope(principal, groupId), async (client) => {
    const loaded = await client.query(
      `SELECT snapshot.id,snapshot.snapshot_hash,snapshot.base_revision,
              snapshot.diff,snapshot.evidence_refs,snapshot.writer_id,
              authority.branch_id,authority.writer_id AS authority_writer_id,
              authority.reviewer_ids,registry.status
       FROM governed_lane_authority authority
       JOIN branch_registry registry
         ON registry.lane_id=authority.lane_id
        AND registry.branch_id=authority.branch_id
        AND registry.agent_id=authority.writer_id
        AND registry.reviewer_ids=authority.reviewer_ids
       JOIN branch_snapshots snapshot
         ON snapshot.group_id=registry.group_id
        AND snapshot.workspace_id=registry.workspace_id
        AND snapshot.branch_id=registry.branch_id
       WHERE authority.lane_id=$1 AND registry.group_id=$2
         AND registry.workspace_id=$3 AND snapshot.id=$4`,
      [laneId, groupId, principal.workspaceId, snapshotId],
    )
    const row = loaded.rows[0]
    if (!row || row.status !== "active" || row.branch_id !== lane.branchId ||
      row.writer_id !== row.authority_writer_id) {
      throw new Error("governed lane snapshot is missing or no longer reviewable")
    }
    const session: LaneSession = {
      lane_id: laneId,
      branch_id: row.branch_id,
      writer_id: row.authority_writer_id,
      reviewer_ids: row.reviewer_ids,
      group_id: groupId,
      workspace_id: principal.workspaceId!,
      base_revision: row.base_revision,
      manifests: "manifests" in lane ? lane.manifests : undefined,
      evidence: [{
        snapshot_id: row.id,
        snapshot_hash: row.snapshot_hash,
        base_revision: row.base_revision,
        diff: requireDiff(row.diff),
        evidence_refs: requireEvidenceRefs(row.evidence_refs),
      }],
    }
    return reviewLaneEvidence(session, {
      verdict,
      reviewer: principal.principalId,
      reason,
      retention_expires_at: typeof args.retention_expires_at === "string"
        ? args.retention_expires_at
        : undefined,
    }, client)
  })
}
