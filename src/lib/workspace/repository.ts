import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { revokeDeviceTokensForWorkspaceLockChange } from "@/lib/mcp-token/repository";
import { getPool } from "@/lib/postgres/connection";
import { validateGroupId } from "@/lib/validation/group-id";
import type { GroupId, LockMode } from "@allura/types";

// Workspace data access (ADR-001). A workspace is a sub-scope within a group_id
// (the org tenant boundary). group_id is validated at this boundary; it is never
// derived from client input downstream.

export interface Workspace {
  workspace_id: string;
  group_id: GroupId;
  name: string;
  lock_mode: LockMode;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceInput {
  group_id: string;
  name: string;
  created_by?: string;
  workspace_id?: string;
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  const group_id = validateGroupId(input.group_id) as GroupId;
  const workspace_id = input.workspace_id ?? `ws_${randomUUID()}`;
  const { rows } = await getPool().query<Workspace>(
    `INSERT INTO workspaces (workspace_id, group_id, name, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING workspace_id, group_id, name, lock_mode, created_by, created_at, updated_at`,
    [workspace_id, group_id, input.name, input.created_by ?? null],
  );
  return rows[0];
}

export async function getWorkspace(workspace_id: string): Promise<Workspace | null> {
  const { rows } = await getPool().query<Workspace>(
    `SELECT workspace_id, group_id, name, lock_mode, created_by, created_at, updated_at
     FROM workspaces WHERE workspace_id = $1`,
    [workspace_id],
  );
  return rows[0] ?? null;
}

export async function listWorkspacesForGroup(groupId: string): Promise<Workspace[]> {
  const group_id = validateGroupId(groupId);
  const { rows } = await getPool().query<Workspace>(
    `SELECT workspace_id, group_id, name, lock_mode, created_by, created_at, updated_at
     FROM workspaces WHERE group_id = $1 ORDER BY created_at DESC`,
    [group_id],
  );
  return rows;
}

/**
 * Authoritative workspace-lock mutation. The caller owns the transaction, so
 * the full_lockdown row change, linked-device revocation, and audit either all
 * commit or all roll back. Restricted modes intentionally do not revoke an
 * already-issued device token; they constrain the next token mint instead.
 */
export async function setLockModeInTransaction(
  client: PoolClient,
  groupId: string,
  workspaceId: string,
  lockMode: LockMode,
): Promise<Workspace | null> {
  const group_id = validateGroupId(groupId) as GroupId;
  const locked = await client.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM workspaces
      WHERE workspace_id = $1 AND group_id = $2
      FOR UPDATE`,
    [workspaceId, group_id],
  );
  if (!locked.rows[0]) return null;

  const { rows } = await client.query<Workspace>(
    `UPDATE workspaces SET lock_mode = $3, updated_at = NOW()
      WHERE workspace_id = $1 AND group_id = $2
      RETURNING workspace_id, group_id, name, lock_mode, created_by, created_at, updated_at`,
    [workspaceId, group_id, lockMode],
  );
  const workspace = rows[0];
  const revokedDeviceTokens = lockMode === "full_lockdown"
    ? await revokeDeviceTokensForWorkspaceLockChange(client, group_id, workspaceId)
    : 0;
  await client.query(
    `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata)
     VALUES ($1, $2, 'WORKSPACE_LOCK_CHANGED', 'workspace-admin', 'completed', $3)`,
    [group_id, workspaceId, JSON.stringify({ lock_mode: lockMode, revoked_device_tokens: revokedDeviceTokens })],
  );
  return workspace;
}

export async function setLockMode(
  groupId: string,
  workspaceId: string,
  lockMode: LockMode,
): Promise<Workspace | null> {
  const group_id = validateGroupId(groupId) as GroupId;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const workspace = await setLockModeInTransaction(client, group_id, workspaceId, lockMode);
    await client.query("COMMIT");
    return workspace;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
