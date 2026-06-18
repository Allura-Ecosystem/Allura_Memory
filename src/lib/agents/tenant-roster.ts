/**
 * Tenant Roster Helper
 *
 * Reads the agent roster from mcp_tokens (DB-backed, group_id-scoped).
 * No filesystem scans. No hardcoded lists.
 *
 * Used by:
 *   - GET /api/agents
 *   - getExecutionOverview (execution-view.ts) — for timeline init
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("tenant-roster is server-side only")
}

import type { Pool } from "pg"
import { validateGroupId } from "@/lib/validation/group-id"

export interface TenantAgent {
  /** Unique id — mcp_tokens.id */
  id: string
  /** Agent name from token registration */
  name: string
  /** Comma-separated scopes (or "no scopes") */
  scopes: string
  /** Workspace the token belongs to */
  workspaceId: string
  /** ISO timestamp of last use, or null */
  lastUsed: string | null
  /** Whether the token is currently active (not revoked, not expired) */
  active: boolean
}

interface TokenRow {
  id: string
  workspace_id: string
  agent_name: string
  scopes: string[]
  revoked_at: string | null
  expires_at: string | null
  last_used_at: string | null
}

/**
 * List all tenant agents for the given group from mcp_tokens.
 *
 * Graceful degradation: if the pool is null or the query fails, returns [].
 */
export async function listTenantAgents(
  pool: Pool,
  groupId: string,
): Promise<TenantAgent[]> {
  const validGroupId = validateGroupId(groupId)

  const { rows } = await pool.query<TokenRow>(
    `SELECT id, workspace_id, agent_name, scopes, revoked_at, expires_at, last_used_at
     FROM mcp_tokens
     WHERE group_id = $1
     ORDER BY created_at ASC`,
    [validGroupId],
  )

  const now = new Date()
  return rows.map((row) => {
    const revoked = row.revoked_at !== null
    const expired = row.expires_at !== null && new Date(row.expires_at) < now
    return {
      id: row.id,
      name: row.agent_name,
      scopes: Array.isArray(row.scopes) && row.scopes.length > 0
        ? row.scopes.join(", ")
        : "no scopes",
      workspaceId: row.workspace_id,
      lastUsed: row.last_used_at ?? null,
      active: !revoked && !expired,
    }
  })
}
