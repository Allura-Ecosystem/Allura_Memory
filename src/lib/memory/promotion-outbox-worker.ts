/**
 * Promotion Outbox Worker — Story 24.4 AC-9
 *
 * Drains pending promotion_outbox rows and delivers projection events.
 * Retryable: failed rows increment attempts and remain available.
 * Cannot change the committed approval decision — it only reads and projects.
 */
import type { Pool } from "pg";

export interface OutboxDrainResult {
  delivered: number;
  failed: number;
  pending: number;
}

export async function drainPromotionOutbox(pool: Pool, opts?: { maxBatch?: number; maxAttempts?: number }): Promise<OutboxDrainResult> {
  const maxBatch = opts?.maxBatch ?? 50;
  const maxAttempts = opts?.maxAttempts ?? 5;

  const pending = await pool.query(
    `SELECT id, group_id, proposal_id, memory_id, payload, attempts
     FROM promotion_outbox
     WHERE status IN ('pending', 'failed')
       AND attempts < $1
     ORDER BY available_at, created_at
     LIMIT $2
     FOR UPDATE SKIP LOCKED`,
    [maxAttempts, maxBatch],
  );

  let delivered = 0;
  let failed = 0;

  for (const row of pending.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Emit the projection event — append-only, never mutates the approval.
      await client.query(
        `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
         VALUES ($1, 'canonical_memory_promoted', 'promotion-outbox-worker', 'completed', $2, NOW())`,
        [row.group_id, JSON.stringify({ ...row.payload, outbox_id: row.id, delivered: true })],
      );

      await client.query(
        `UPDATE promotion_outbox SET status = 'delivered', delivered_at = NOW() WHERE id = $1`,
        [row.id],
      );

      await client.query("COMMIT");
      delivered++;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      await pool.query(
        `UPDATE promotion_outbox
         SET status = CASE WHEN attempts + 1 >= $2 THEN 'failed' ELSE 'pending' END,
             attempts = attempts + 1,
             last_error = $3,
             available_at = NOW() + (INTERVAL '1 minute' * LEAST(attempts + 1, 10))
         WHERE id = $1`,
        [row.id, maxAttempts, error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)],
      );
      failed++;
    } finally {
      client.release();
    }
  }

  const remaining = await pool.query("SELECT count(*)::int FROM promotion_outbox WHERE status IN ('pending', 'failed')");
  return { delivered, failed, pending: remaining.rows[0].count };
}