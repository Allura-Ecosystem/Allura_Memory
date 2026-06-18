import { randomUUID } from "node:crypto";
import type { GroupId, Scope } from "@allura/types";
import { getPool } from "@/lib/postgres/connection";
import { validateGroupId } from "@/lib/validation/group-id";
import { generateToken } from "./hash";

// MCP bearer token data access (DESIGN-BUMBLEBEE). The raw token is returned only
// from createToken (shown to the user once); every other path works with the hash.

export interface McpTokenRecord {
  id: string;
  group_id: GroupId;
  workspace_id: string;
  agent_name: string;
  token_prefix: string;
  token_hash: string;
  scopes: Scope[];
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreateTokenInput {
  group_id: string;
  workspace_id: string;
  agent_name: string;
  scopes: Scope[];
  created_by?: string;
  expires_at?: string | null;
}

export interface CreateTokenResult {
  /** Raw token — return to the user ONCE, never stored or logged. */
  raw: string;
  record: McpTokenRecord;
}

const TOKEN_COLUMNS = `id, group_id, workspace_id, agent_name, token_prefix, token_hash,
  scopes, expires_at, revoked_at, last_used_at, created_by, created_at`;

export async function createToken(input: CreateTokenInput): Promise<CreateTokenResult> {
  const group_id = validateGroupId(input.group_id) as GroupId;
  const id = `tok_${randomUUID()}`;
  const { raw, prefix, hash } = generateToken();
  const { rows } = await getPool().query<McpTokenRecord>(
    `INSERT INTO mcp_tokens
       (id, group_id, workspace_id, agent_name, token_prefix, token_hash, scopes, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${TOKEN_COLUMNS}`,
    [
      id,
      group_id,
      input.workspace_id,
      input.agent_name,
      prefix,
      hash,
      input.scopes,
      input.expires_at ?? null,
      input.created_by ?? null,
    ],
  );
  return { raw, record: rows[0] };
}

export async function findByPrefix(prefix: string): Promise<McpTokenRecord | null> {
  const { rows } = await getPool().query<McpTokenRecord>(
    `SELECT ${TOKEN_COLUMNS} FROM mcp_tokens WHERE token_prefix = $1`,
    [prefix],
  );
  return rows[0] ?? null;
}

export async function listTokensForWorkspace(
  groupId: string,
  workspaceId: string,
): Promise<McpTokenRecord[]> {
  const group_id = validateGroupId(groupId);
  const { rows } = await getPool().query<McpTokenRecord>(
    `SELECT ${TOKEN_COLUMNS} FROM mcp_tokens
     WHERE group_id = $1 AND workspace_id = $2 ORDER BY created_at DESC`,
    [group_id, workspaceId],
  );
  return rows;
}

export async function touchLastUsed(id: string): Promise<void> {
  await getPool().query(`UPDATE mcp_tokens SET last_used_at = NOW() WHERE id = $1`, [id]);
}

export async function revokeToken(id: string): Promise<void> {
  await getPool().query(
    `UPDATE mcp_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
    [id],
  );
}
