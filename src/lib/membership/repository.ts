/**
 * Membership repository — human team members + roles per org (group_id).
 *
 * Current-state table (`memberships`); role changes UPDATE, removal is a
 * soft-delete (`removed_at`). Every mutation also appends an audit event to the
 * append-only `events` table so POL-002 (append-only) holds as the trail.
 *
 * group_id is validated on every call (tenant isolation, POL-001).
 */
import type { PoolClient } from "pg"
import { roleLosesDeviceAuthority } from "@/lib/auth/scope-derivation"
import type { AlluraRole } from "@/lib/auth/types"
import { revokeDeviceTokensForMembershipChange } from "@/lib/mcp-token/repository"
import { getPool } from "@/lib/postgres/connection"
import { validateGroupId } from "@/lib/validation/group-id"

export interface MembershipRecord {
  id: string
  group_id: string
  user_id: string
  email: string | null
  role: AlluraRole
  invited_by: string | null
  created_at: string
  updated_at: string
  removed_at: string | null
}

type AuditEvent = "membership_added" | "membership_role_changed" | "membership_removed"

type MutationResult<T> = {
  result: T
  revokedDeviceTokens: number
}

async function appendAudit(
  client: PoolClient,
  groupId: string,
  eventType: AuditEvent,
  actor: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO events (group_id, event_type, agent_id, status, metadata)
     VALUES ($1, $2, $3, 'completed', $4)`,
    [groupId, eventType, actor ?? "membership-admin", JSON.stringify(metadata)],
  )
}

async function runMembershipMutation<T>(mutation: (client: PoolClient) => Promise<MutationResult<T>>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const { result } = await mutation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function listMembers(groupId: string): Promise<MembershipRecord[]> {
  const gid = validateGroupId(groupId)
  const pool = getPool()
  const res = await pool.query<MembershipRecord>(
    `SELECT id, group_id, user_id, email, role, invited_by, created_at, updated_at, removed_at
     FROM memberships
     WHERE group_id = $1 AND removed_at IS NULL
     ORDER BY created_at ASC`,
    [gid],
  )
  return res.rows
}

export async function addMember(params: {
  group_id: string
  user_id: string
  email?: string | null
  role?: AlluraRole
  invited_by?: string | null
}): Promise<MembershipRecord> {
  const gid = validateGroupId(params.group_id)
  const role: AlluraRole = params.role ?? "viewer"
  return runMembershipMutation(async (client) => {
    const res = await client.query<MembershipRecord>(
      `INSERT INTO memberships (group_id, user_id, email, role, invited_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (group_id, user_id) DO UPDATE
         SET role = EXCLUDED.role,
             email = COALESCE(EXCLUDED.email, memberships.email),
             invited_by = COALESCE(EXCLUDED.invited_by, memberships.invited_by),
             removed_at = NULL,
             updated_at = NOW()
       RETURNING id, group_id, user_id, email, role, invited_by, created_at, updated_at, removed_at`,
      [gid, params.user_id, params.email ?? null, role, params.invited_by ?? null],
    )
    const member = res.rows[0]
    await appendAudit(client, gid, "membership_added", params.invited_by ?? null, {
      user_id: params.user_id,
      role,
    })
    return { result: member, revokedDeviceTokens: 0 }
  })
}

export async function setMemberRole(
  groupId: string,
  userId: string,
  role: AlluraRole,
  actor: string | null,
): Promise<MembershipRecord | null> {
  const gid = validateGroupId(groupId)
  return runMembershipMutation(async (client) => {
    const before = await client.query<{ role: AlluraRole }>(
      `SELECT role FROM memberships
       WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL
       FOR UPDATE`,
      [gid, userId],
    )
    const previousRole = before.rows[0]?.role
    if (!previousRole) return { result: null, revokedDeviceTokens: 0 }

    const res = await client.query<MembershipRecord>(
      `UPDATE memberships
       SET role = $3, updated_at = NOW()
       WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL
       RETURNING id, group_id, user_id, email, role, invited_by, created_at, updated_at, removed_at`,
      [gid, userId, role],
    )
    const member = res.rows[0]
    const revokedDeviceTokens = roleLosesDeviceAuthority(previousRole, role)
      ? await revokeDeviceTokensForMembershipChange(client, gid, userId)
      : 0
    await appendAudit(client, gid, "membership_role_changed", actor, {
      user_id: userId,
      previous_role: previousRole,
      role,
      revoked_device_tokens: revokedDeviceTokens,
    })
    return { result: member, revokedDeviceTokens }
  })
}

export async function removeMember(
  groupId: string,
  userId: string,
  actor: string | null,
): Promise<boolean> {
  const gid = validateGroupId(groupId)
  return runMembershipMutation(async (client) => {
    const res = await client.query(
      `UPDATE memberships
       SET removed_at = NOW(), updated_at = NOW()
       WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL`,
      [gid, userId],
    )
    const removed = (res.rowCount ?? 0) > 0
    const revokedDeviceTokens = removed
      ? await revokeDeviceTokensForMembershipChange(client, gid, userId)
      : 0
    if (removed) {
      await appendAudit(client, gid, "membership_removed", actor, {
        user_id: userId,
        revoked_device_tokens: revokedDeviceTokens,
      })
    }
    return { result: removed, revokedDeviceTokens }
  })
}
