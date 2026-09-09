import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { GroupId, Scope } from "@allura/types";
import { getPool } from "@/lib/postgres/connection";
import { validateGroupId } from "@/lib/validation/group-id";
import { deriveScopesForMembershipRole } from "@/lib/auth/scope-derivation";
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
  paired_device_id?: string | null;
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
  scopes, expires_at, revoked_at, last_used_at, created_by, created_at, paired_device_id`;

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

export interface CreateDeviceTokenInput {
  paired_device_id: string;
  membership_role: string;
  expires_at: string;
}

/**
 * Mint a first-party device credential inside a caller-owned transaction.
 * Device authority is read from the just-inserted paired_devices row; callers
 * cannot provide a principal, group, workspace, or scope.
 */
export async function createDeviceToken(
  client: PoolClient,
  input: CreateDeviceTokenInput,
): Promise<CreateTokenResult> {
  const device = await client.query<{
    principal_id: string;
    group_id: string;
    workspace_id: string;
  }>(
    `SELECT principal_id, group_id, workspace_id
       FROM paired_devices
      WHERE id = $1
      FOR UPDATE`,
    [input.paired_device_id],
  );
  const authority = device.rows[0];
  if (!authority) throw new Error("Paired device not found for token minting");

  const id = `tok_${randomUUID()}`;
  const { raw, prefix, hash } = generateToken();
  const scopes = deriveScopesForMembershipRole(input.membership_role);
  const { rows } = await client.query<McpTokenRecord>(
    `INSERT INTO mcp_tokens
       (id, group_id, workspace_id, agent_name, token_prefix, token_hash, scopes, expires_at, paired_device_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${TOKEN_COLUMNS}`,
    [
      id,
      validateGroupId(authority.group_id) as GroupId,
      authority.workspace_id,
      authority.principal_id,
      prefix,
      hash,
      scopes,
      input.expires_at,
      input.paired_device_id,
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

export async function revokeToken(id: string, groupId: string): Promise<boolean> {
  const group_id = validateGroupId(groupId);
  const result = await getPool().query(
    `UPDATE mcp_tokens
        SET revoked_at = NOW()
      WHERE id = $1 AND group_id = $2 AND revoked_at IS NULL`,
    [id, group_id],
  );
  return result.rowCount === 1;
}
