/**
 * Drain the curator promotion outbox.
 *
 * /api/curator/approve enqueues `promotion_sync_pending` events (durable
 * outbox) but no worker consumed them — approved proposals never
 * materialized as semantic memories. This script drains the outbox:
 * for each unresolved pending event it writes the canonical memory via
 * the governed memory() writer, then appends a `promotion_sync_completed`
 * event referencing the pending one.
 *
 * Append-only: INSERTs only, no UPDATE/DELETE on events table.
 *
 * Run: bun scripts/drain-promotion-outbox.ts [group_id]
 */
import { memory } from "../src/lib/memory/writer";
import { closePool, getPool } from "../src/lib/postgres/connection";

const GROUP_FILTER = process.argv[2];

interface PromotionPayload {
  proposal_id: string;
  memory_id: string;
  content: string;
  score: number;
  tier: string;
  trace_ref: string | null;
  curator_id: string;
  requested_by: string | null;
  rationale: string;
  decided_at: string;
}

async function main(): Promise<void> {
  const pool = getPool();

  const params: unknown[] = [];
  let groupClause = "";
  if (GROUP_FILTER) {
    params.push(GROUP_FILTER);
    groupClause = "AND e.group_id = $1";
  }

  const { rows } = await pool.query<{
    id: string;
    group_id: string;
    metadata: PromotionPayload;
  }>(
    `SELECT e.id, e.group_id, e.metadata
     FROM events e
     WHERE e.event_type = 'promotion_sync_pending'
       AND e.status = 'pending'
       ${groupClause}
       AND NOT EXISTS (
         SELECT 1 FROM events c
         WHERE c.event_type = 'promotion_sync_completed'
           AND c.group_id = e.group_id
           AND c.metadata->>'supersedes_id' = e.id::text
       )
     ORDER BY e.created_at ASC`,
    params
  );

  console.log(`[PromotionSync] Found ${rows.length} unresolved pending promotions.`);

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    const p = typeof row.metadata === "string" ? (JSON.parse(row.metadata) as PromotionPayload) : row.metadata;
    try {
      const { node_id } = await memory().createEntity({
        label: "Memory",
        group_id: row.group_id,
        props: {
          node_id: p.memory_id,
          content: p.content,
          score: p.score,
          provenance: "conversation",
          user_id: p.requested_by ?? null,
          proposal_id: p.proposal_id,
          curator_id: p.curator_id,
          tier: p.tier,
          trace_ref: p.trace_ref,
          created_at: p.decided_at,
        },
      });

      await pool.query(
        `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
         VALUES ($1, 'promotion_sync_completed', 'promotion-sync-worker', 'completed', $2::jsonb, NOW())`,
        [
          row.group_id,
          JSON.stringify({
            supersedes_id: row.id,
            proposal_id: p.proposal_id,
            memory_id: node_id,
            curator_id: p.curator_id,
          }),
        ]
      );
      ok++;
      console.log(`[PromotionSync] Promoted ${p.proposal_id.slice(0, 8)} -> ${node_id}`);
    } catch (err) {
      failed++;
      console.error(
        `[PromotionSync] FAILED ${p.proposal_id.slice(0, 8)}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  console.log(`[PromotionSync] Done: ${ok} promoted, ${failed} failed, ${rows.length} scanned.`);
  await closePool();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[PromotionSync] Fatal:", err);
  process.exit(1);
});
