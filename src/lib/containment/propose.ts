/**
 * Propose-only containment descriptions (Story 26.6 AC-2: connectors "cannot
 * execute actions without explicit authorization").
 *
 * Producing a proposal never touches the database, never requires a role
 * check, and never requires an approval_ref -- it is a pure, read-only
 * description of what executeContainmentAction() (governed-authorization.ts)
 * WOULD do if separately authorized. Mirrors Story 26.5's DraftGenerator
 * philosophy exactly.
 *
 * Only the two connectors with a real target in this codebase have a
 * propose function: mcp_token_revocation (mcp_tokens.revoked_at) and
 * workspace_lock (workspaces.lock_mode). endpoint_isolation has no
 * concrete target yet and deliberately has no propose function here --
 * see governed-authorization.ts for where it throws.
 */

import type { LockMode } from "@allura/types"
import type { ContainmentProposal } from "./types"
import type { TenantScope } from "../inventory/types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export function proposeMcpTokenRevocation(
  scope: TenantScope,
  tokenId: string,
  tokenPrefix: string,
  rationale: string,
): ContainmentProposal {
  return {
    connector: "mcp_token_revocation",
    action: "revoke",
    target_ref: tokenId,
    group_id: scope.group_id,
    workspace_id: scope.workspace_id,
    description: `Would set mcp_tokens.revoked_at for token prefix "${tokenPrefix}" (id ${tokenId}). Rationale: ${rationale}`,
    reversible: false,
    rollback_description: "Not reversible -- a revoked token cannot be un-revoked. A new token must be issued.",
  }
}

export function proposeWorkspaceLock(
  scope: TenantScope,
  targetWorkspaceId: string,
  lockMode: LockMode,
  rationale: string,
): ContainmentProposal {
  return {
    connector: "workspace_lock",
    action: `lock:${lockMode}`,
    target_ref: targetWorkspaceId,
    group_id: scope.group_id,
    workspace_id: scope.workspace_id,
    description: `Would set workspaces.lock_mode='${lockMode}' for workspace "${targetWorkspaceId}". Rationale: ${rationale}`,
    reversible: true,
    rollback_description: `Reversible: set workspaces.lock_mode back to 'normal' for workspace "${targetWorkspaceId}" through the same governed authorization path.`,
  }
}
