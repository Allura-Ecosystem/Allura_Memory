/**
 * Zod schemas for governed mitigation policy drafts.
 *
 * Story 26.5 constraints:
 * - Draft generation is read-only: no DB writes, no subprocesses, no policy
 *   activation, no package blocks, no CI changes, no containment, no connectors.
 * - Template parameters are strictly typed and bounded. Free-text advisory
 *   content can never become a parameter value or executable instruction.
 * - Authority is always `simulated_only`; activation requires explicit approval
 *   through the canonical Allura governance receipt path.
 */

import { z } from "zod"
import { Severity } from "../exposure/schemas"
import { TenantScope } from "../inventory/schemas"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

/**
 * Kinds of scope a mitigation template can describe as affected.
 */
export const AffectedScopeKind = z.enum(["systems", "packages", "workflows", "tokens", "workspaces"])

/**
 * Lifecycle authority state. Drafts are never active policy.
 */
export const AuthorityState = z.literal("simulated_only")

/**
 * Local simulated-draft lifecycle. This slice cannot approve or activate a
 * policy; those mutations require the canonical governance path.
 */
export const ApprovalState = z.enum(["draft", "reviewed", "rejected"])

/**
 * Actions that can appear on a local, non-durable draft record.
 */
export const MitigationDraftRecordAction = z.enum(["draft_created", "draft_reviewed", "draft_rejected"])

/**
 * Parameter shape shared by all mitigation templates. Each template may extend
 * this with additional typed, bounded fields. Free-text from advisories is
 * never accepted as a parameter value.
 */
export const BaseMitigationParameters = z
  .object({
    severity: Severity,
    inventory_ref: z.string().min(1),
    artifact_ref: z.string().min(1),
  })
  .strict()

/**
 * A versioned mitigation template. The `parameter_schema` is a strict Zod object
 * schema; callers derive typed parameters by mapping verified evidence fields to
 * the declared schema. The `dry_run_plan` and `rollback_plan` are human-readable
 * descriptions of what a draft would compute and how it would be reversed.
 */
export const MitigationTemplate = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  affected_scope_kinds: z.array(AffectedScopeKind).min(1),
  parameter_schema: z.custom<z.ZodTypeAny>((val) => val instanceof z.ZodType, {
    message: "parameter_schema must be a Zod schema object",
  }),
  dry_run_plan: z.string().min(1),
  rollback_plan: z.string().min(1),
  created_at: z.string().datetime(),
})

/**
 * A reviewable simulated policy draft. The `parameters` object is validated
 * against the template's `parameter_schema`. The draft never carries executable
 * instructions derived from advisory text.
 */
export const MitigationDraft = z.object({
  id: z.string().min(1),
  group_id: TenantScope.shape.group_id,
  workspace_id: z.string().min(1),
  alert_id: z.string().min(1),
  template_id: z.string().min(1),
  template_version: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()),
  scope_explanation: z.string().min(1),
  dry_run_result: z.string().min(1),
  rollback_evidence: z.string().min(1),
  authority_state: AuthorityState,
  approval_state: ApprovalState,
  evidence_ids: z.array(z.string().min(1)).min(1),
  created_at: z.string().datetime(),
})

/**
 * Local record for a simulated mitigation-draft action. It is not a canonical
 * GovernanceReceipt, approval, activation, or enforcement record. Its id and
 * timestamp are local simulation metadata; a mutation must use the canonical
 * governance transaction and approval path.
 */
export const MitigationDraftRecord = z.object({
  id: z.string().min(1),
  group_id: TenantScope.shape.group_id,
  workspace_id: z.string().min(1),
  draft_id: z.string().min(1),
  actor_id: z.string().min(1),
  actor_role: z.string().min(1),
  action: MitigationDraftRecordAction,
  rationale: z.string().min(1),
  policy_reference: z.string().min(1),
  policy_version: z.string().min(1),
  evidence_ids: z.array(z.string().min(1)).min(1),
  occurred_at: z.string().datetime(),
})
