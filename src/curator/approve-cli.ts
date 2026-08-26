#!/usr/bin/env bun
/** Workspace-authoritative curator approval CLI. */
import { closePool, getAppPool } from "../lib/postgres/connection"
import { withWorkspaceTransaction } from "../lib/db/tenant-transaction"
import type { ResolvedWorkspaceScope } from "../lib/db/workspace-scope"
import { resolveWorkspaceScope } from "../lib/db/workspace-scope"
import { validateToken } from "../lib/guard/validate-token"
import { validateGroupId } from "../lib/validation/group-id"
import { createPrincipalContext, type PrincipalContext } from "../lib/auth/principal-context"
import { approveProposal, type GovernanceReceipt } from "../lib/memory/approve-proposal"

export interface PendingProposal {
  id: string; group_id: string; workspace_id: string; content: string; score: string;
  reasoning: string | null; tier: string; created_at: string; trace_ref: number | null;
}
interface SkippedApprovalResult { proposal_id: string; status: "skipped"; reason: string }
export interface CLIArgs { autoApprove: boolean; groupId: string; workspaceId: string }

export function parseArgs(argv = process.argv.slice(2)): CLIArgs {
  const autoApprove = argv.includes("--auto-approve")
  const groupId = argv.find((arg) => arg.startsWith("--group-id="))?.slice("--group-id=".length) ?? ""
  const workspaceId = argv.find((arg) => arg.startsWith("--workspace-id="))?.slice("--workspace-id=".length) ?? ""
  if (!groupId) throw new Error("--group-id is required")
  validateGroupId(groupId)
  if (!workspaceId.trim()) throw new Error("--workspace-id is required")
  return { autoApprove, groupId, workspaceId: workspaceId.trim() }
}

export async function getPendingProposals(scope: ResolvedWorkspaceScope): Promise<PendingProposal[]> {
  return withWorkspaceTransaction(scope, async (db) => {
    const result = await db.query<PendingProposal>(
      `SELECT id,group_id,workspace_id,content,score,reasoning,tier,created_at,trace_ref
       FROM canonical_proposals
       WHERE group_id = $1 AND workspace_id = $2 AND status='pending'
       ORDER BY score DESC,created_at ASC`,
      [scope.tenantId, scope.workspaceId],
    )
    return result.rows
  })
}

function assertAuthority(scope: ResolvedWorkspaceScope, principal: PrincipalContext): void {
  if (principal.principalId !== scope.principalId || principal.workspaceId !== scope.workspaceId || !principal.tenantIds.includes(scope.tenantId)) {
    throw new Error("CLI verified actor authority does not match workspace scope")
  }
  if (!principal.roles.some((role) => role === "curator" || role === "admin") || !principal.scopes.includes("review:approve")) {
    throw new Error("CLI verified actor lacks approval authority")
  }
}

export async function processProposal(
  proposal: PendingProposal,
  scope: ResolvedWorkspaceScope,
  principal: PrincipalContext,
  autoApprove: boolean,
): Promise<GovernanceReceipt | SkippedApprovalResult> {
  assertAuthority(scope, principal)
  if (proposal.group_id !== scope.tenantId || proposal.workspace_id !== scope.workspaceId) {
    throw new Error("Proposal is outside verified CLI workspace scope")
  }
  if (!autoApprove) {
    return { proposal_id: proposal.id, status: "skipped", reason: "noninteractive approval requires explicit --auto-approve" }
  }
  return approveProposal({
    principal,
    groupId: scope.tenantId,
    workspaceId: scope.workspaceId,
    proposalId: proposal.id,
    rationale: proposal.reasoning?.trim() || "Approved by curator CLI",
    idempotencyKey: `curator-cli:${proposal.id}:${scope.principalId}`,
    pool: getAppPool(),
  })
}

async function runApproveCLI(): Promise<void> {
  const args = parseArgs()
  if (!args.autoApprove) throw new Error("noninteractive CLI refuses approval without explicit --auto-approve")
  const validation = await validateToken(process.env.ALLURA_CURATOR_TOKEN ?? null)
  if (!validation.ok) throw new Error(`valid ALLURA_CURATOR_TOKEN is required (${validation.reason})`)
  const scope = resolveWorkspaceScope(validation.token)
  if (scope.tenantId !== args.groupId || scope.workspaceId !== args.workspaceId) {
    throw new Error("explicit CLI tenant/workspace must match verified credential authority")
  }
  if (!validation.token.scopes.includes("review:approve")) throw new Error("verified credential lacks review:approve")
  const principal = createPrincipalContext({
    principalId: scope.principalId, workspaceId: scope.workspaceId, tenantIds: [scope.tenantId],
    roles: ["curator"], scopes: validation.token.scopes, authMethod: "mcp_token",
    sessionId: `curator-cli:${Date.now()}`, credentialId: validation.token.id,
  })
  const proposals = await getPendingProposals(scope)
  for (const proposal of proposals) await processProposal(proposal, scope, principal, true)
  console.log(`[Curator Approve] ${proposals.length} proposal(s) approved in ${scope.workspaceId}`)
}

if (process.argv[1]?.includes("approve-cli.ts")) {
  runApproveCLI().catch(async (error) => {
    console.error(`[Curator Approve] Fatal error: ${error instanceof Error ? error.message : String(error)}`)
    await closePool()
    process.exit(1)
  })
}
