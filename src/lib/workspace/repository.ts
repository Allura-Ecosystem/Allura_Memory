import { randomUUID } from "node:crypto";
import type { GroupId, LockMode } from "@allura/types";
import { getPool } from "@/lib/postgres/connection";
import { validateGroupId } from "@/lib/validation/group-id";

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

export async function setLockMode(
  workspace_id: string,
  lock_mode: LockMode,
): Promise<Workspace | null> {
  const { rows } = await getPool().query<Workspace>(
    `UPDATE workspaces SET lock_mode = $2, updated_at = NOW()
     WHERE workspace_id = $1
     RETURNING workspace_id, group_id, name, lock_mode, created_by, created_at, updated_at`,
    [workspace_id, lock_mode],
  );
  return rows[0] ?? null;
}
