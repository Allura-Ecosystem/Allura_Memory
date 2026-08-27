/**
 * Governed mitigation-draft approval — the canonical receipt path.
 *
 * Story 26.5, AC-6/AC-7: policy activation, enforcement changes, schedule
 * changes, and external response actions must use the canonical Allura
 * approval and receipt path. This module is that path for the one action
 * Story 26.5 authorizes — approving or rejecting a draft FOR a later,
 * separately authorized enforcement workflow (AD-57). It never activates,
 * enforces, blocks, or contains anything itself.
 *
 * This is deliberately separate from src/lib/mitigation/receipt.ts, which
 * remains a local, unauthenticated simulation record. Calling this function
 * always routes through the REQ-GOV-008 control-plane gate
 * (src/control-plane/syscalls.ts): a missing or malformed `approval_ref`
 * fails closed before any row is written.
 */

import { randomUUID } from "crypto"
import { syscall_mutate } from "@/control-plane/syscalls"
import { MitigationApprovalReceipt as MitigationApprovalReceiptSchema } from "./schemas"
import type { MitigationApprovalAction, MitigationApprovalReceipt, MitigationDraft } from "./types"
import { TenantScope as TenantScopeSchema } from "../inventory/schemas"
import type { TenantScope } from "../inventory/types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export interface GovernedActor {
  id: string
  role: string
}

/**
 * Record a governed approval or rejection of a mitigation draft.
 *
 * `approvalRef` must be a well-formed UUID identifying the human approval
 * decision. It is not validated against a canonical approval store here —
 * the control-plane gate enforces presence and UUID shape; resolving the
 * reference against an approval-lifecycle record is that layer's job, same
 * as every other REQ-GOV-008 syscall.
 *
 * @throws if approvalRef is missing/malformed (surfaced by the control-plane
 *         gate as a rejected syscall), or if the draft's tenant scope does
 *         not match the caller's scope.
 */
export async function recordGovernedMitigationApproval(
  scope: TenantScope,
  draft: MitigationDraft,
  actor: GovernedActor,
  action: MitigationApprovalAction,
  rationale: string,
  approvalRef: string
): Promise<MitigationApprovalReceipt> {
  const scopeParsed = TenantScopeSchema.safeParse(scope)
  if (!scopeParsed.success) {
    throw new Error(`invalid tenant scope: ${scopeParsed.error.message}`)
  }

  if (draft.group_id !== scope.group_id || draft.workspace_id !== scope.workspace_id) {
    throw new Error("draft tenant scope does not match receipt scope")
  }

  if (!rationale.trim()) {
    throw new Error("a governed mitigation receipt requires nonblank rationale")
  }

  const id = randomUUID()
  const occurredAt = new Date().toISOString()

  const result = await syscall_mutate(
    {
      type: "insert",
      target: "pg:mitigation_receipts",
      // approval_ref travels on the request so executeSyscall's gate sees it
      // regardless of whether the caller also set it on the context.
      approval_ref: approvalRef,
      data: {
        id,
        group_id: scope.group_id,
        workspace_id: scope.workspace_id,
        draft_id: draft.id,
        approval_ref: approvalRef,
        action,
        actor_id: actor.id,
        actor_role: actor.role,
        rationale: rationale.trim(),
        policy_reference: draft.template_id,
        policy_version: draft.template_version,
        evidence_ids: JSON.stringify(draft.evidence_ids),
        occurred_at: occurredAt,
      },
    },
    { actor: actor.id, group_id: scope.group_id, permission_tier: "plugin" }
  )

  if (!result.success) {
    throw new Error(result.error ?? "governed mitigation approval failed")
  }

  const receipt: MitigationApprovalReceipt = {
    id,
    group_id: scope.group_id,
    workspace_id: scope.workspace_id,
    draft_id: draft.id,
    approval_ref: approvalRef,
    action,
    actor_id: actor.id,
    actor_role: actor.role,
    rationale: rationale.trim(),
    policy_reference: draft.template_id,
    policy_version: draft.template_version,
    evidence_ids: [...draft.evidence_ids],
    occurred_at: occurredAt,
  }

  return MitigationApprovalReceiptSchema.parse(receipt)
}
