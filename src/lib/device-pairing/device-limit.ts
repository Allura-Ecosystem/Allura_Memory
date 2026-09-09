/**
 * Story 29.5 — Device-count enforcement helpers (§4.2c, HIGH-F4).
 *
 * The five-device default limit is enforced with `pg_advisory_xact_lock` on a
 * stable SHA-256-derived 64-bit key for `(group_id, workspace_id,
 * principal_id)`, followed by a count of APPROVED `paired_devices` rows inside
 * the same transaction.
 *
 * These helpers run on a caller-supplied `pg.PoolClient` that is already inside
 * a BEGIN/COMMIT transaction. The lock is transaction-scoped and is released on
 * COMMIT/ROLLBACK.
 *
 * Pure functions (`getDeviceLimit`, `deviceLimitLockKey`) are unit-testable
 * without a DB. `acquireDeviceCountLock` and `countApprovedDevices` issue
 * parameterized SQL on the supplied client.
 */
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

/** Default device limit per (group_id, workspace_id, principal_id). §4.2c. */
export const DEFAULT_DEVICE_LIMIT = 5;

/**
 * Get the configured device limit (default 5).
 *
 * Reads `ALLURA_DEVICE_PAIRING_DEVICE_LIMIT`; falls back to 5 for unset,
 * non-numeric, zero, or negative values.
 */
export function getDeviceLimit(): number {
  const raw = process.env.ALLURA_DEVICE_PAIRING_DEVICE_LIMIT;
  if (!raw) return DEFAULT_DEVICE_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_DEVICE_LIMIT;
}

/**
 * Compute the stable 64-bit advisory-lock key for a
 * `(group_id, workspace_id, principal_id)` tuple.
 *
 * §4.2c: `SHA-256(group_id:workspace_id:principal_id)` → first 16 hex chars →
 * interpreted as a 64-bit unsigned integer. The truncation collision risk is
 * negligible at expected scale (see architecture §4.2c collision analysis).
 *
 * Returns a `bigint` to preserve the full 64-bit range.
 */
export function deviceLimitLockKey(
  groupId: string,
  workspaceId: string,
  principalId: string,
): bigint {
  const digest = createHash("sha256")
    .update(`${groupId}:${workspaceId}:${principalId}`, "utf8")
    .digest("hex");
  // PostgreSQL pg_advisory_xact_lock accepts a signed bigint. Preserve every
  // bit of the SHA-256 prefix while mapping the unsigned digest to int64.
  return BigInt.asIntN(64, BigInt("0x" + digest.slice(0, 16)));
}

/**
 * Acquire a transaction-scoped advisory lock on the derived 64-bit key.
 *
 * Must be called inside a BEGIN/COMMIT transaction. The lock is automatically
 * released on COMMIT or ROLLBACK.
 */
export async function acquireDeviceCountLock(
  client: PoolClient,
  groupId: string,
  workspaceId: string,
  principalId: string,
): Promise<void> {
  const key = deviceLimitLockKey(groupId, workspaceId, principalId);
  // pg expects a numeric string for bigint parameters.
  await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [key.toString()]);
}

/**
 * Count APPROVED paired devices for a (group_id, workspace_id, principal_id)
 * tuple. Must be called after `acquireDeviceCountLock` to be meaningful.
 *
 * §4.2c: `SELECT COUNT(*) FROM paired_devices WHERE group_id = $1 AND
 * workspace_id = $2 AND principal_id = $3 AND lifecycle_state = 'APPROVED'`.
 */
export async function countApprovedDevices(
  client: PoolClient,
  groupId: string,
  workspaceId: string,
  principalId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM paired_devices
     WHERE group_id = $1 AND workspace_id = $2 AND principal_id = $3
       AND lifecycle_state = 'APPROVED'`,
    [groupId, workspaceId, principalId],
  );
  const count = result.rows[0]?.count;
  return typeof count === "number" ? count : Number.parseInt(String(count ?? "0"), 10);
}