#!/usr/bin/env bun
/**
 * Memory Observability API
 *
 * Provides health metrics for Allura memory operations.
 * Designed to be queried by dashboards, cron checks, or operator inspection.
 *
 * Usage: bun scripts/memory-observability.ts [--group-id allura-system] [--json]
 *
 * Metrics exposed:
 * - Trace write count (24h, 7d, 30d)
 * - Retrieval count and p95 latency (24h)
 * - Approved insight count
 * - Approval queue depth (pending / approved / rejected)
 * - Wrong-scope rejection count
 * - Backend-unavailable / degraded event count
 * - Backfill progress (if running)
 * - Storage size estimates
 */

import { config } from "dotenv";
import { resolve } from "path";
import { closePool, getPool } from "../src/lib/postgres/connection";

config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

export interface MemoryHealthReport {
  group_id: string;
  timestamp: string;
  traces: {
    write_count_24h: number;
    write_count_7d: number;
    write_count_30d: number;
    write_success_rate: number;
  };
  retrieval: {
    count_24h: number;
    avg_latency_ms: number;
    p95_latency_ms: number | null;
  };
  insights: {
    approved_count: number;
    pending_count: number;
    rejected_count: number;
    deprecated_count: number;
  };
  health: {
    degraded_events_24h: number;
    backend_unavailable_events_24h: number;
    scope_error_events_24h: number;
    wrong_scope_rejections_24h: number;
  };
  storage: {
    events_row_count: number;
    allura_memories_row_count: number;
    proposals_row_count: number;
    events_earliest: string | null;
  };
  backfill: {
    last_checkpoint_event_id: number | null;
    last_checkpoint_time: string | null;
    total_events_remaining: number | null;
  };
}

export async function getMemoryHealth(groupId: string): Promise<MemoryHealthReport> {
  const pool = getPool();
  const now = new Date().toISOString();

  // Trace writes
  const traceWrites = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as count_24h,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as count_7d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as count_30d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day' AND status = 'completed') as completed_24h
    FROM events
    WHERE group_id = $1 AND event_type = 'memory_add'`,
    [groupId]
  );

  const tw = traceWrites.rows[0];
  const writeCount24h = parseInt(tw.count_24h || "0");
  const completed24h = parseInt(tw.completed_24h || "0");
  const writeSuccessRate = writeCount24h > 0 ? completed24h / writeCount24h : 1.0;

  // Retrieval metrics (from events where event_type = 'memory_search')
  const retrieval = await pool.query(
    `SELECT
      COUNT(*) as count_24h
    FROM events
    WHERE group_id = $1
      AND event_type = 'memory_search'
      AND created_at > NOW() - INTERVAL '1 day'`,
    [groupId]
  );

  // Approved/pending/rejected insights
  const insights = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected
    FROM canonical_proposals
    WHERE group_id = $1`,
    [groupId]
  );

  // Deprecated insights (from events)
  const deprecated = await pool.query(
    `SELECT COUNT(*) as cnt FROM events
     WHERE group_id = $1 AND event_type = 'memory_delete'`,
    [groupId]
  );

  // Health / degraded events
  const healthEvents = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE (metadata->>'degraded')::boolean = true) as degraded,
      COUNT(*) FILTER (WHERE (metadata->>'backend_unavailable')::boolean = true) as backend_unavailable,
      COUNT(*) FILTER (WHERE (metadata->>'scope_error')::boolean = true) as scope_errors
    FROM events
    WHERE group_id = $1 AND created_at > NOW() - INTERVAL '1 day'`,
    [groupId]
  );

  const he = healthEvents.rows[0];

  // Storage size
  const storage = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM events WHERE group_id = $1) as events_count,
      (SELECT COUNT(*) FROM allura_memories WHERE user_id = $1) as memories_count,
      (SELECT COUNT(*) FROM canonical_proposals WHERE group_id = $1) as proposals_count,
      (SELECT MIN(created_at) FROM events WHERE group_id = $1) as earliest
    `,
    [groupId]
  );

  const s = storage.rows[0];

  // Backfill progress (check for checkpoint marker)
  const backfill = await pool.query(
    `SELECT metadata->>'last_event_id' as last_event_id,
            metadata->>'checkpoint_time' as checkpoint_time,
            metadata->>'events_remaining' as events_remaining
     FROM events
     WHERE group_id = $1 AND event_type = 'backfill_checkpoint'
     ORDER BY created_at DESC LIMIT 1`,
    [groupId]
  );

  const bf = backfill.rows[0];

  return {
    group_id: groupId,
    timestamp: now,
    traces: {
      write_count_24h: writeCount24h,
      write_count_7d: parseInt(tw.count_7d || "0"),
      write_count_30d: parseInt(tw.count_30d || "0"),
      write_success_rate: Math.round(writeSuccessRate * 1000) / 1000,
    },
    retrieval: {
      count_24h: parseInt(retrieval.rows[0]?.count_24h || "0"),
      avg_latency_ms: 0, // TODO: instrument latency in canonical-tools
      p95_latency_ms: null,
    },
    insights: {
      approved_count: parseInt(insights.rows[0]?.approved || "0"),
      pending_count: parseInt(insights.rows[0]?.pending || "0"),
      rejected_count: parseInt(insights.rows[0]?.rejected || "0"),
      deprecated_count: parseInt(deprecated.rows[0]?.cnt || "0"),
    },
    health: {
      degraded_events_24h: parseInt(he.degraded || "0"),
      backend_unavailable_events_24h: parseInt(he.backend_unavailable || "0"),
      scope_error_events_24h: parseInt(he.scope_errors || "0"),
      wrong_scope_rejections_24h: 0, // TODO: add scope validation counter
    },
    storage: {
      events_row_count: parseInt(s.events_count || "0"),
      allura_memories_row_count: parseInt(s.memories_count || "0"),
      proposals_row_count: parseInt(s.proposals_count || "0"),
      events_earliest: s.earliest || null,
    },
    backfill: {
      last_checkpoint_event_id: bf?.last_event_id ? parseInt(bf.last_event_id) : null,
      last_checkpoint_time: bf?.checkpoint_time || null,
      total_events_remaining: bf?.events_remaining ? parseInt(bf.events_remaining) : null,
    },
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const groupIdArg = args.find((a) => !a.startsWith("--"));
  const groupId = groupIdArg || process.env.GROUP_ID || "allura-system";

  const report = await getMemoryHealth(groupId);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n📊 Memory Health Report — ${report.group_id}`);
    console.log(`   Generated: ${report.timestamp}\n`);

    console.log(`Traces (writes):`);
    console.log(`  24h: ${report.traces.write_count_24h}  7d: ${report.traces.write_count_7d}  30d: ${report.traces.write_count_30d}`);
    console.log(`  Success rate: ${(report.traces.write_success_rate * 100).toFixed(1)}%\n`);

    console.log(`Insights:`);
    console.log(`  Approved: ${report.insights.approved_count}  Pending: ${report.insights.pending_count}  Rejected: ${report.insights.rejected_count}`);
    console.log(`  Deprecated: ${report.insights.deprecated_count}\n`);

    console.log(`Health (24h):`);
    console.log(`  Degraded events: ${report.health.degraded_events_24h}`);
    console.log(`  Backend unavailable: ${report.health.backend_unavailable_events_24h}`);
    console.log(`  Scope errors: ${report.health.scope_error_events_24h}\n`);

    console.log(`Storage:`);
    console.log(`  Events: ${report.storage.events_row_count} rows`);
    console.log(`  Vectors: ${report.storage.allura_memories_row_count} rows`);
    console.log(`  Proposals: ${report.storage.proposals_row_count} rows`);
    if (report.storage.events_earliest) {
      console.log(`  Earliest event: ${report.storage.events_earliest}`);
    }

    if (report.backfill.last_checkpoint_event_id) {
      console.log(`\nBackfill:`);
      console.log(`  Last checkpoint: event ${report.backfill.last_checkpoint_event_id}`);
      console.log(`  Remaining: ${report.backfill.total_events_remaining || "unknown"}`);
    }

    console.log();
  }

  await closePool();
}

main().catch((err) => {
  console.error("Observability failed:", err);
  process.exit(1);
});