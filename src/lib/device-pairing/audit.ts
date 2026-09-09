/**
 * Story 29.4 — Transactional device-pairing audit emission (fail-closed).
 *
 * Architecture §11.1 (HIGH-F1 / MED-F3):
 *  - Device-lifecycle events are written via transactional `insertEvent` inside
 *    the same DB transaction as the state change. If the audit insert fails, the
 *    entire transaction rolls back (fail-closed).
 *  - This is different from the fire-and-forget `emitAuthAudit` path used for
 *    MCP auth-decision events.
 *  - Pre-human enrollment events (`DEVICE_ENROLL_REQUESTED`,
 *    `DEVICE_ENROLL_EXPIRED`) use `agent_id = "device-enrollment"` and
 *    `group_id = "allura-system"` (MED-F3 — no human resolved yet).
 *
 * This module provides a raw-SQL audit insert that runs on a caller-supplied
 * `pg.Client` (already inside a BEGIN/COMMIT transaction). It does NOT manage
 * its own pool — the caller owns the transaction boundary.
 */
import type { PoolClient } from "pg";

/** Audit insert parameters for a device-pairing lifecycle event. */
export interface DeviceAuditInsert {
  group_id: string;
  event_type: string;
  agent_id: string;
  metadata: Record<string, unknown>;
  status?: "completed" | "failed" | "pending";
}

/**
 * Emit a device-pairing lifecycle audit event inside the caller's transaction.
 *
 * Fail-closed: if the INSERT fails, the error propagates so the caller's
 * ROLLBACK triggers. Never swallows audit failures.
 *
 * Uses the `events` table (migration 00-traces.sql). Mirrors the column order
 * used by `insertEvent` in `src/lib/postgres/queries/insert-trace.ts` but runs
 * on the supplied client so it is part of the same transaction.
 */
export async function emitDeviceAudit(
  client: PoolClient,
  insert: DeviceAuditInsert,
): Promise<void> {
  const sql = `
    INSERT INTO events (
      group_id,
      event_type,
      agent_id,
      metadata,
      status
    ) VALUES ($1, $2, $3, $4, $5)
  `;
  await client.query(sql, [
    insert.group_id,
    insert.event_type,
    insert.agent_id,
    JSON.stringify(insert.metadata ?? {}),
    insert.status ?? "completed",
  ]);
}