/**
 * Simulated mitigation draft-record factory.
 *
 * Story 26.5 is read-only. This produces a local, in-memory record for draft
 * creation/review/rejection only. It cannot approve, activate, or enforce a
 * policy and is not a canonical GovernanceReceipt.
 */

import { randomUUID } from "crypto"
import { MitigationDraftRecord as MitigationDraftRecordSchema } from "./schemas"
import type { MitigationDraft, MitigationDraftRecord, MitigationDraftRecordAction } from "./types"
import { TenantScope as TenantScopeSchema } from "../inventory/schemas"
import type { TenantScope } from "../inventory/types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export interface Actor {
  id: string
  role: string
}

/**
 * Create a local simulated record for a mitigation draft action.
 *
 * The caller supplies attribution and rationale. The id/timestamp are local
 * simulation metadata, not authenticated or database-issued values.
 */
export function createDraftRecord(
  scope: TenantScope,
  draft: MitigationDraft,
  actor: Actor,
  action: MitigationDraftRecordAction,
  rationale: string
): MitigationDraftRecord {
  const scopeParsed = TenantScopeSchema.safeParse(scope)
  if (!scopeParsed.success) {
    throw new Error(`invalid tenant scope: ${scopeParsed.error.message}`)
  }

  if (draft.group_id !== scope.group_id || draft.workspace_id !== scope.workspace_id) {
    throw new Error("draft tenant scope does not match receipt scope")
  }

  const occurredAt = new Date().toISOString()

  const record: MitigationDraftRecord = {
    id: `draft-record-${randomUUID()}`,
    group_id: scope.group_id,
    workspace_id: scope.workspace_id,
    draft_id: draft.id,
    actor_id: actor.id,
    actor_role: actor.role,
    action,
    rationale,
    policy_reference: draft.template_id,
    policy_version: draft.template_version,
    evidence_ids: [...draft.evidence_ids],
    occurred_at: occurredAt,
  }

  return MitigationDraftRecordSchema.parse(record)
}
