#!/usr/bin/env bun
/**
 * Memory Retention Worker (FR-4)
 *
 * Enforces storage lifecycle policies with soft-delete + hard-delete phases:
 *
 * Phase 1 — Soft-delete (TTL expiry):
 *   Episodic PG rows past RETENTION_TTL_DAYS (default 90) get deleted_at set.
 *   They remain recoverable via memory_restore for 30 days.
 *   Raw traces past RETENTION_RAW_TRACES_DAYS (default 90) are hard-deleted.
 *
 * Phase 2 — Hard-delete (recovery window expiry):
 *   Rows where deleted_at < NOW() - INTERVAL '30 days' are hard-deleted.
 *   This is the final purge after the 30-day recovery window.
 *
 * SAFETY: Canonical (graph_memories) memories are NEVER touched by this worker.
 *         Only episodic PG rows in allura_memories are affected.
 *         Semantic/procedural memory_type rows are excluded.
 *
 * Usage: bun scripts/retention-worker.ts [--dry-run] [--group-id allura-system]
 */

import { config } from "dotenv";
import { resolve } from "path";
import { closePool, getPool } from "../src/lib/postgres/connection";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

// ── Retention Policies ────────────────────────────────────────────────────

const EPISODIC_TTL_DAYS = parseInt(process.env.RETENTION_TTL_DAYS || "90");
const RECOVERY_WINDOW_DAYS = 30; // Fixed: 30-day recovery window after soft-delete

interface RetentionPolicy {
  store: string;
  ttlDays: number;
  description: string;
}

const DEFAULT_POLICIES: RetentionPolicy[] = [
  {
    store: "episodic_soft_delete",
    ttlDays: EPISODIC_TTL_DAYS,
    description: `Soft-delete episodic rows older than ${EPISODIC_TTL_DAYS} days (sets deleted_at)`,
  },
  {
    store: "episodic_hard_delete",
    ttlDays: RECOVERY_WINDOW_DAYS,
    description: `Hard-delete soft-deleted rows past ${RECOVERY_WINDOW_DAYS}-day recovery window`,
  },
  {
    store: "raw_traces",
    ttlDays: parseInt(process.env.RETENTION_RAW_TRACES_DAYS || "90"),
    description: "Hard-delete old episodic traces in events table",
  },
  {
    store: "rejected_proposals",
    ttlDays: parseInt(process.env.RETENTION_REJECTED_DAYS || "30"),
    description: "Archive and prune rejected proposals past appeal window",
  },
];

// ── Worker ─────────────────────────────────────────────────────────────────

interface RetentionResult {
  store: string;
  examined: number;
  expired: number;
  action: string;
  details: string;
}

export async function runRetention(
  groupId: string,
  policies: RetentionPolicy[] = DEFAULT_POLICIES,
  dryRun: boolean = false
): Promise<RetentionResult[]> {
  const pool = getPool();
  const results: RetentionResult[] = [];

  for (const policy of policies) {
    const cutoff = `NOW() - INTERVAL '${policy.ttlDays} days'`;

    switch (policy.store) {
      // ── Phase 1: Soft-delete episodic rows past TTL ───────────────────
      case "episodic_soft_delete": {
        // Soft-delete: set deleted_at on episodic rows past TTL that are still active
        // CRITICAL: Only touches memory_type='episodic', never semantic/procedural
        const countResult = await pool.query(
          `SELECT COUNT(*) as cnt FROM allura_memories
           WHERE group_id = $1
             AND created_at < ${cutoff}
             AND memory_type = 'episodic'
             AND deleted_at IS NULL`,
          [groupId]
        );
        const examined = parseInt(countResult.rows[0]?.cnt || "0");

        if (!dryRun && examined > 0) {
          // Soft-delete: set deleted_at = NOW() (recoverable for 30 days)
          await pool.query(
            `UPDATE allura_memories
             SET deleted_at = NOW()
             WHERE group_id = $1
               AND created_at < ${cutoff}
               AND memory_type = 'episodic'
               AND deleted_at IS NULL`,
            [groupId]
          );

          // Audit trail: log what was soft-deleted
          await pool.query(
            `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
             VALUES ($1, 'retention_soft_delete', 'retention-worker', 'completed',
                     jsonb_build_object('policy', 'episodic_ttl', 'ttl_days', ${policy.ttlDays}, 'rows_affected', ${examined}),
                     NOW())`,
            [groupId]
          );
        }

        results.push({
          store: policy.store,
          examined,
          expired: examined,
          action: dryRun ? "would_soft_delete" : "soft_deleted",
          details: `Episodic rows older than ${policy.ttlDays} days (deleted_at set, recoverable for ${RECOVERY_WINDOW_DAYS} days)`,
        });
        break;
      }

      // ── Phase 2: Hard-delete rows past recovery window ─────────────────
      case "episodic_hard_delete": {
        // Hard-delete: remove rows where deleted_at is past the recovery window
        const countResult = await pool.query(
          `SELECT COUNT(*) as cnt FROM allura_memories
           WHERE group_id = $1
             AND deleted_at IS NOT NULL
             AND deleted_at < ${cutoff}`,
          [groupId]
        );
        const examined = parseInt(countResult.rows[0]?.cnt || "0");

        if (!dryRun && examined > 0) {
          // Audit trail: log before purging
          await pool.query(
            `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
             VALUES ($1, 'retention_hard_delete', 'retention-worker', 'completed',
                     jsonb_build_object('policy', 'recovery_window_expired', 'window_days', ${policy.ttlDays}, 'rows_purged', ${examined}),
                     NOW())`,
            [groupId]
          );

          await pool.query(
            `DELETE FROM allura_memories
             WHERE group_id = $1
               AND deleted_at IS NOT NULL
               AND deleted_at < ${cutoff}`,
            [groupId]
          );
        }

        results.push({
          store: policy.store,
          examined,
          expired: examined,
          action: dryRun ? "would_hard_delete" : "hard_deleted",
          details: `Soft-deleted rows past ${policy.ttlDays}-day recovery window (permanently removed)`,
        });
        break;
      }

      // ── Raw traces: hard-delete past TTL ───────────────────────────────
      case "raw_traces": {
        const countResult = await pool.query(
          `SELECT COUNT(*) as cnt FROM events
           WHERE group_id = $1
             AND created_at < ${cutoff}
             AND event_type = 'memory_add'`,
          [groupId]
        );
        const examined = parseInt(countResult.rows[0]?.cnt || "0");

        if (!dryRun && examined > 0) {
          await pool.query(
            `DELETE FROM events
             WHERE group_id = $1
               AND created_at < ${cutoff}
               AND event_type = 'memory_add'`,
            [groupId]
          );
        }

        results.push({
          store: policy.store,
          examined,
          expired: examined,
          action: dryRun ? "would_delete" : "deleted",
          details: `Raw traces older than ${policy.ttlDays} days`,
        });
        break;
      }

      // ── Rejected proposals: archive and prune ─────────────────────────
      case "rejected_proposals": {
        const countResult = await pool.query(
          `SELECT COUNT(*) as cnt FROM canonical_proposals
           WHERE group_id = $1
             AND status = 'rejected'
             AND decided_at < ${cutoff}`,
          [groupId]
        );
        const examined = parseInt(countResult.rows[0]?.cnt || "0");

        if (!dryRun && examined > 0) {
          // Archive to events before deletion (audit trail)
          await pool.query(
            `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
             SELECT group_id, 'retention_archive', 'retention-worker', 'completed',
                    jsonb_build_object('action', 'rejected_proposal_pruned', 'proposal_id', id, 'content_preview', substring(content, 1, 100)),
                    NOW()
             FROM canonical_proposals
             WHERE group_id = $1
               AND status = 'rejected'
               AND decided_at < ${cutoff}`,
            [groupId]
          );

          await pool.query(
            `DELETE FROM canonical_proposals
             WHERE group_id = $1
               AND status = 'rejected'
               AND decided_at < ${cutoff}`,
            [groupId]
          );
        }

        results.push({
          store: policy.store,
          examined,
          expired: examined,
          action: dryRun ? "would_archive_and_delete" : "archived_and_deleted",
          details: `Rejected proposals older than ${policy.ttlDays} days`,
        });
        break;
      }
    }
  }

  return results;
}

// ── CLI Entry Point ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const groupIdArg = args.find((a) => !a.startsWith("--"));
  const groupId = groupIdArg || process.env.GROUP_ID || "allura-system";

  console.log(`\n🧹 Memory Retention Worker (FR-4)`);
  console.log(`   Group: ${groupId}`);
  console.log(`   Mode:  ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`   Episodic TTL: ${EPISODIC_TTL_DAYS} days`);
  console.log(`   Recovery Window: ${RECOVERY_WINDOW_DAYS} days\n`);

  const results = await runRetention(groupId, DEFAULT_POLICIES, dryRun);

  console.log("Results:");
  for (const r of results) {
    console.log(`  ${r.store}: ${r.examined} examined, ${r.expired} ${r.action} — ${r.details}`);
  }

  console.log(`\n✅ Retention ${dryRun ? "preview" : "complete"}\n`);
  await closePool();
}

main().catch((err) => {
  console.error("Retention worker failed:", err);
  process.exit(1);
});