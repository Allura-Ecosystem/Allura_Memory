/**
 * Governed containment authorization -- the canonical, only path to
 * executing a containment action (Story 26.6).
 *
 * Order of operations matters and is deliberate:
 *   1. AD-58 role check (actor.role must literally be 'admin').
 *   2. Feature-flag check (per-connector, default disabled).
 *   3. Tenant scope match.
 *   4. The REQ-GOV-008 gate + immutable receipt insert, via the SAME
 *      syscall_mutate path Story 26.5's governed-approval.ts uses --
 *      a missing/malformed approval_ref fails closed HERE, before step 5.
 *   5. Only after the gated receipt succeeds: the real state mutation
 *      (mcp_tokens.revoked_at / workspaces.lock_mode).
 *
 * Step 4 before step 5 is a deliberate fail-safe ordering: if anything
 * goes wrong, the failure mode is "a receipt exists for an action that
 * didn't happen" (visible, auditable, safe) rather than "an action
 * happened with no receipt" (the failure mode a security audit trail
 * must never produce).
 */

import { randomUUID } from "crypto"
import { syscall_mutate } from "@/control-plane/syscalls"
import { hasPermission } from "@/lib/auth/roles"
import type { AlluraRole } from "@/lib/auth/types"
import { connectorFlagEnvVar, isConnectorEnabled } from "./feature-flags"
import { ContainmentReceipt as ContainmentReceiptSchema } from "./schemas"
import type { ContainmentProposal, ContainmentReceipt } from "./types"
import { withWorkspaceTransaction } from "../db/tenant-transaction"
import type { ResolvedWorkspaceScope } from "../db/workspace-scope"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export interface ContainmentActor {
  id: string
  role: AlluraRole
}

async function performRealMutation(scope: ResolvedWorkspaceScope, proposal: ContainmentProposal): Promise<void> {
  await withWorkspaceTransaction(scope, async (client) => {
    if (proposal.connector === "mcp_token_revocation") {
      await client.query(
        `UPDATE mcp_tokens SET revoked_at = NOW() WHERE id = $1 AND group_id = $2 AND revoked_at IS NULL`,
        [proposal.target_ref, scope.tenantId],
      )
      return
    }

    if (proposal.connector === "workspace_lock") {
      const lockMode = proposal.action.replace(/^lock:/, "")
      await client.query(
        `UPDATE workspaces SET lock_mode = $1 WHERE workspace_id = $2 AND group_id = $3`,
        [lockMode, proposal.target_ref, scope.tenantId],
      )
      return
    }

    throw new Error(`no connector implementation for "${proposal.connector}"`)
  })
}

/**
 * Execute a containment action. Throws before any state change and before
 * any receipt is written if: the actor is not literally 'admin' (AD-58),
 * the connector's feature flag is disabled, the proposal's tenant scope
 * does not match the caller's scope, rationale is blank, or the connector
 * has no implementation (endpoint_isolation).
 *
 * approvalRef is not validated against a canonical approval store here --
 * the control-plane gate (src/control-plane/syscalls.ts) enforces presence
 * and UUID shape; resolving the reference against an approval-lifecycle
 * record is that layer's job, same as every other REQ-GOV-008 syscall.
 */
export async function executeContainmentAction(
  scope: ResolvedWorkspaceScope,
  proposal: ContainmentProposal,
  actor: ContainmentActor,
  rationale: string,
  approvalRef: string,
  policyReference: string,
): Promise<ContainmentReceipt> {
  if (actor.role !== "admin") {
    throw new Error(
      `containment actions require the admin role (AD-58: security owner authority resolves to admin); actor has role "${actor.role}"`,
    )
  }

  if (proposal.connector === "endpoint_isolation") {
    throw new Error(
      "endpoint_isolation has no connector implementation -- it is defined in the type system to match Story 26.6's own AC language, but there is no concrete endpoint-isolation target in this codebase yet",
    )
  }

  if (!isConnectorEnabled(proposal.connector)) {
    throw new Error(
      `connector "${proposal.connector}" is disabled (set ${connectorFlagEnvVar(proposal.connector)}=true to enable it)`,
    )
  }

  if (proposal.group_id !== scope.tenantId || proposal.workspace_id !== scope.workspaceId) {
    throw new Error("proposal tenant scope does not match caller scope")
  }

  if (!rationale.trim()) {
    throw new Error("a governed containment receipt requires nonblank rationale")
  }

  if (!hasPermission(actor.role, "admin")) {
    // Unreachable given the strict equality check above, but keeps this
    // function correct if AlluraRole ever gains a role above admin.
    throw new Error("actor lacks admin-equivalent permission")
  }

  const authorizationChain = [`role:${actor.role}`, `policy:${policyReference}`, `approval:${approvalRef}`]
  const id = randomUUID()
  const occurredAt = new Date().toISOString()

  const result = await syscall_mutate(
    {
      type: "insert",
      target: "pg:containment_receipts",
      approval_ref: approvalRef,
      data: {
        id,
        group_id: scope.tenantId,
        workspace_id: scope.workspaceId,
        connector: proposal.connector,
        action: proposal.action,
        target_ref: proposal.target_ref,
        approval_ref: approvalRef,
        actor_id: actor.id,
        actor_role: actor.role,
        rationale: rationale.trim(),
        policy_reference: policyReference,
        authorization_chain: JSON.stringify(authorizationChain),
        occurred_at: occurredAt,
      },
    },
    { actor: actor.id, group_id: scope.tenantId, permission_tier: "plugin" },
  )

  if (!result.success) {
    throw new Error(result.error ?? "governed containment authorization failed")
  }

  // The gated receipt exists and is durable. Only now perform the real
  // mutation -- if this throws, the receipt still correctly records that
  // authorization was granted; it does not claim the action succeeded.
  await performRealMutation(scope, proposal)

  const receipt: ContainmentReceipt = {
    id,
    group_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    connector: proposal.connector,
    action: proposal.action,
    target_ref: proposal.target_ref,
    approval_ref: approvalRef,
    actor_id: actor.id,
    actor_role: "admin",
    rationale: rationale.trim(),
    policy_reference: policyReference,
    authorization_chain: authorizationChain,
    occurred_at: occurredAt,
  }

  return ContainmentReceiptSchema.parse(receipt)
}
