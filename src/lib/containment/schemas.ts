/**
 * Zod schemas for Story 26.6 — Containment Connectors and Response Receipts.
 *
 * Two layers, deliberately kept separate:
 * - ContainmentProposal: in-memory, propose-only, never executes anything
 *   (mirrors Story 26.5's MitigationDraft philosophy).
 * - ContainmentReceipt: durable, immutable, produced ONLY after the
 *   REQ-GOV-008 approval gate and the AD-58 admin-role check both pass,
 *   persisted alongside the real state change (governed-authorization.ts).
 */

import { z } from "zod"
import { TenantScope } from "../inventory/schemas"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

/**
 * The three connectors Story 26.6 names. `endpoint_isolation` has no
 * concrete target in this codebase yet -- it stays defined here (matching
 * the story's own AC language) but has no executor in
 * governed-authorization.ts. Attempting to authorize it throws explicitly
 * rather than silently no-op'ing.
 */
export const ContainmentConnector = z.enum(["mcp_token_revocation", "workspace_lock", "endpoint_isolation"])

/**
 * A read-only description of what a containment action WOULD do. Producing
 * one never touches the database and never requires authorization --
 * authorization is only required to actually execute it
 * (governed-authorization.ts).
 */
export const ContainmentProposal = z.object({
  connector: ContainmentConnector,
  action: z.string().min(1),
  target_ref: z.string().min(1),
  group_id: TenantScope.shape.group_id,
  workspace_id: z.string().min(1),
  description: z.string().min(1),
  reversible: z.boolean(),
  rollback_description: z.string().min(1),
})

/**
 * A durable, governed containment receipt (containment_receipts table,
 * migration 45). Only ever produced by executeContainmentAction() after
 * the REQ-GOV-008 gate and the AD-58 admin-role check both pass.
 */
export const ContainmentReceipt = z.object({
  id: z.string().uuid(),
  group_id: TenantScope.shape.group_id,
  workspace_id: z.string().min(1),
  connector: ContainmentConnector,
  action: z.string().min(1),
  target_ref: z.string().min(1),
  approval_ref: z.string().uuid(),
  actor_id: z.string().min(1),
  actor_role: z.literal("admin"),
  rationale: z.string().min(1),
  policy_reference: z.string().min(1),
  authorization_chain: z.array(z.string().min(1)).min(1),
  occurred_at: z.string(),
})
