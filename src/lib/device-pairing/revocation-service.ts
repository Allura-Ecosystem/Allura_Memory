import type { Pool, PoolClient } from "pg"

import type { AuthUser } from "@/lib/auth/types"
import { emitDeviceAudit } from "./audit"

export type RevocationErrorCode =
  | "DEVICE_NOT_FOUND"
  | "MEMBERSHIP_INACTIVE"

export const REVOCATION_ERROR_STATUS: Record<RevocationErrorCode, number> = {
  DEVICE_NOT_FOUND: 404,
  MEMBERSHIP_INACTIVE: 403,
}

export class RevocationError extends Error {
  constructor(public readonly code: RevocationErrorCode, message: string) {
    super(message)
    this.name = "RevocationError"
  }
}

export interface DeviceLifecycleInput {
  device_id: string
  authUser: AuthUser
}

export interface DeviceLifecycleResult {
  status: "REVOKED" | "ALREADY_REVOKED"
  device_id: string
}

export interface ApprovedDevice {
  id: string
  display_label: string
  workspace_id: string
  created_at: string
  last_exchange_at: string | null
}

export interface RevocationDependencies {
  notify?: (client: PoolClient, payload: { event: "device_revoked" | "device_marked_lost"; device_id: string; group_id: string }) => Promise<void>
  emitAudit?: typeof emitDeviceAudit
}

async function notifyDeviceCache(
  client: PoolClient,
  payload: { event: "device_revoked" | "device_marked_lost"; device_id: string; group_id: string },
): Promise<void> {
  await client.query("SELECT pg_notify($1, $2)", ["device_cache_invalidation", JSON.stringify(payload)])
}

type LifecycleContext = {
  group_id: string
  workspace_id: string
  principal_id: string
}

type LockedDevice = LifecycleContext & {
  id: string
  lifecycle_state: "APPROVED" | "REVOKED" | "LOST"
}

type LifecycleTransition = {
  lifecycleState: "REVOKED" | "LOST"
  timestampColumn: "revoked_at" | "lost_at"
  eventType: "DEVICE_REVOKED" | "DEVICE_MARKED_LOST"
  notificationEvent: "device_revoked" | "device_marked_lost"
  action: "revoke" | "mark_lost"
}

async function transitionDevice(
  pool: Pool,
  input: DeviceLifecycleInput,
  transition: LifecycleTransition,
  dependencies?: RevocationDependencies,
): Promise<DeviceLifecycleResult | { status: "LOST" | "ALREADY_REVOKED"; device_id: string }> {
  const client = await pool.connect()
  let committed = false
  try {
    await client.query("BEGIN")
    await client.query("SELECT set_config('app.current_group_id', $1, true)", [input.authUser.groupId])
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [input.authUser.groupId])
    await client.query("SELECT set_config('app.current_principal', $1, true)", [input.authUser.id])
    if (input.authUser.workspaceId) {
      await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [input.authUser.workspaceId])
    }

    // Establish active tenant authority before resolving a device. This ensures
    // an inactive former member receives the same response for every device id.
    const membership = await client.query<{ role: string }>(
      `SELECT role
         FROM memberships
        WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL
        FOR UPDATE`,
      [input.authUser.groupId, input.authUser.id],
    )
    const activeMembership = membership.rows[0]
    if (!activeMembership) {
      throw new RevocationError("MEMBERSHIP_INACTIVE", "Active tenant membership is required")
    }

    // The SECURITY DEFINER resolver is tenant-bound and returns no row for a
    // missing or other-tenant device. It exposes no lifecycle state.
    const route = await client.query<LifecycleContext>(
      "SELECT * FROM resolve_device_lifecycle_context($1, $2)",
      [input.device_id, input.authUser.groupId],
    )
    const context = route.rows[0]
    if (!context) {
      throw new RevocationError("DEVICE_NOT_FOUND", "Device not found")
    }

    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [context.workspace_id])
    const locked = await client.query<LockedDevice>(
      `SELECT id, group_id, workspace_id, principal_id, lifecycle_state
         FROM paired_devices
        WHERE id = $1 AND group_id = $2
        FOR UPDATE`,
      [input.device_id, context.group_id],
    )
    const device = locked.rows[0]
    if (!device) {
      throw new RevocationError("DEVICE_NOT_FOUND", "Device not found")
    }

    // The role supplied by the client is deliberately ignored. Only the locked
    // database membership grants admin authority; otherwise callers may mutate
    // only their own device.
    const ownsDevice = device.principal_id === input.authUser.id
    const isTenantAdmin = activeMembership.role === "admin"
    if (!ownsDevice && !isTenantAdmin) {
      throw new RevocationError("DEVICE_NOT_FOUND", "Device not found")
    }

    if (device.lifecycle_state === "REVOKED" || device.lifecycle_state === "LOST") {
      await client.query("COMMIT")
      committed = true
      return { status: "ALREADY_REVOKED", device_id: device.id }
    }

    await client.query(
      `UPDATE paired_devices
          SET lifecycle_state = $1, ${transition.timestampColumn} = NOW(), updated_at = NOW()
        WHERE id = $2 AND group_id = $3 AND lifecycle_state = 'APPROVED'`,
      [transition.lifecycleState, device.id, context.group_id],
    )
    await client.query(
      `UPDATE mcp_tokens
          SET revoked_at = NOW()
        WHERE paired_device_id = $1 AND group_id = $2 AND revoked_at IS NULL`,
      [device.id, context.group_id],
    )
    const notification = { event: transition.notificationEvent, device_id: device.id, group_id: context.group_id }
    await (dependencies?.notify ?? notifyDeviceCache)(client, notification)
    await (dependencies?.emitAudit ?? emitDeviceAudit)(client, {
      group_id: context.group_id,
      workspace_id: context.workspace_id,
      event_type: transition.eventType,
      agent_id: input.authUser.id,
      metadata: { device_id: device.id, action: transition.action },
    })
    await client.query("COMMIT")
    committed = true
    return { status: transition.lifecycleState, device_id: device.id }
  } catch (error) {
    if (!committed) await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function revokeDevice(
  pool: Pool,
  input: DeviceLifecycleInput,
  dependencies?: RevocationDependencies,
): Promise<DeviceLifecycleResult> {
  return transitionDevice(pool, input, {
    lifecycleState: "REVOKED",
    timestampColumn: "revoked_at",
    eventType: "DEVICE_REVOKED",
    notificationEvent: "device_revoked",
    action: "revoke",
  }, dependencies) as Promise<DeviceLifecycleResult>
}

export async function markLostDevice(
  pool: Pool,
  input: DeviceLifecycleInput,
  dependencies?: RevocationDependencies,
): Promise<{ status: "LOST" | "ALREADY_REVOKED"; device_id: string }> {
  return transitionDevice(pool, input, {
    lifecycleState: "LOST",
    timestampColumn: "lost_at",
    eventType: "DEVICE_MARKED_LOST",
    notificationEvent: "device_marked_lost",
    action: "mark_lost",
  }, dependencies) as Promise<{ status: "LOST" | "ALREADY_REVOKED"; device_id: string }>
}

export async function listApprovedDevices(pool: Pool, authUser: AuthUser): Promise<ApprovedDevice[]> {
  const client = await pool.connect()
  let committed = false
  try {
    await client.query("BEGIN")
    await client.query("SELECT set_config('app.current_group_id', $1, true)", [authUser.groupId])
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [authUser.groupId])
    await client.query("SELECT set_config('app.current_principal', $1, true)", [authUser.id])
    if (authUser.workspaceId) {
      await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [authUser.workspaceId])
    }
    const result = await client.query<ApprovedDevice>(
      `SELECT id, display_label, workspace_id, created_at, last_exchange_at
         FROM paired_devices
        WHERE group_id = $1 AND principal_id = $2 AND lifecycle_state = 'APPROVED'
        ORDER BY created_at DESC`,
      [authUser.groupId, authUser.id],
    )
    await client.query("COMMIT")
    committed = true
    return result.rows
  } catch (error) {
    if (!committed) await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
