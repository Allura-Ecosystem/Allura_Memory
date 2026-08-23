import type { McpTokenRecord } from "@/lib/mcp-token/repository";

/**
 * A scope that has crossed the server-side authentication boundary.  It is
 * intentionally constructed only from a validated token record; request/body
 * workspace values never participate in this resolution.
 */
export interface ResolvedWorkspaceScope {
  tenantId: string;
  workspaceId: string;
  principalId: string;
}

export function resolveWorkspaceScope(token: Pick<McpTokenRecord, "group_id" | "workspace_id" | "agent_name">): ResolvedWorkspaceScope {
  if (!token.group_id || !token.workspace_id || !token.agent_name) {
    throw new Error("validated token must contain group_id, workspace_id, and agent_name");
  }
  return {
    tenantId: token.group_id,
    workspaceId: token.workspace_id,
    principalId: token.agent_name,
  };
}
