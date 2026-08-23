#!/usr/bin/env bun
/**
 * Curator Watchdog — Autonomous Scoring Loop
 *
 * Polls PostgreSQL for unpromoted events, scores them,
 * and creates proposals in canonical_proposals for human review.
 *
 * Brooks principle: The architecture is the curator queue;
 * the watchdog is merely the implementation that feeds it.
 *
 * Usage: bun src/curator/watchdog.ts [--interval 60] [--group-id allura-system]
 */

import { curatorScore } from "../lib/curator/score";
import { closePool } from "../lib/postgres/connection";
import { withWorkspaceTransaction } from "../lib/db/tenant-transaction";
import type { ResolvedWorkspaceScope } from "../lib/db/workspace-scope";
import { resolveScoreThresholdWithClient } from "../lib/config/tenant-config";

export interface WatchdogConfig {
  groupId: string;
  /** Server-derived scope from the validated credential boundary. */
  scope: ResolvedWorkspaceScope;
  scoreThreshold: number;
  /** Alert threshold for pending canonical_proposals. Default: 100. Override via WATCHDOG_QUEUE_DEPTH_THRESHOLD. */
  queueDepthThreshold?: number;
}

export interface WatchdogEventRow {
  id: number;
  event_type: string;
  agent_id: string;
  metadata: Record<string, unknown>;
  created_at: string | Date;
}

/**
 * Return only events whose durable tenant/workspace scope matches the resolved
 * watchdog credential. Legacy NULL-workspace events are intentionally excluded.
 */
export async function getWorkspaceWatchdogCandidates(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: WatchdogEventRow[] }> },
  scope: ResolvedWorkspaceScope,
): Promise<{ rows: WatchdogEventRow[] }> {
  return pool.query(`
    SELECT e.id, e.event_type, e.agent_id, e.metadata, e.created_at
    FROM events e
    WHERE e.group_id = $1
      -- Workspace watchdog ingestion intentionally excludes legacy unscoped
      -- events: no default workspace ownership is inferred for append-only rows.
      AND e.workspace_id = $2
      AND e.status != 'promoted'
      AND e.agent_id != 'system'
      AND e.agent_id NOT LIKE 'k6-%'
      AND e.event_type NOT IN ('proposal_created', 'proposal_decided', 'proposal_approved', 'proposal_rejected', 'session_start', 'session_end', 'WATCHDOG_HEARTBEAT', 'notion_sync_pending')
      AND NOT EXISTS (
        SELECT 1 FROM canonical_proposals cp
        WHERE cp.trace_ref = e.id
          AND cp.group_id = e.group_id
          AND cp.workspace_id = e.workspace_id
      )
      AND e.created_at > NOW() - INTERVAL '7 days'
    ORDER BY e.created_at DESC
    LIMIT 50
  `, [scope.tenantId, scope.workspaceId]);
}

/**
 * Scan for unpromoted events and create proposals for those that pass scoring.
 * Returns the number of proposals created in this cycle.
 *
 * Story 22.4: The score threshold is resolved from the tenant's config
 * (tenants.config JSONB) on each cycle. If the tenant has a custom
 * promotion_threshold, it overrides the WatchdogConfig.scoreThreshold.
 * This means config changes take effect on the next cycle — no restart required.
 *
 * @param config - Watchdog configuration (group_id and score threshold)
 * @returns Number of proposals created
 */
export async function scanAndPropose(config: WatchdogConfig): Promise<number> {
  if (!config.scope || config.scope.tenantId !== config.groupId) {
    throw new Error("watchdog requires a server-resolved workspace scope")
  }

  // Candidate evidence and tenant config are workspace-governed reads. Keep all
  // reads and the corresponding proposal writes on the same app-role client so
  // an owner connection can never bypass the RLS boundary.
  return withWorkspaceTransaction(config.scope, async (client) => {
    const effectiveThreshold = await resolveScoreThresholdWithClient(
      client,
      config.groupId,
      config.scoreThreshold,
    );
    const result = await getWorkspaceWatchdogCandidates(client, config.scope);
    let proposalsCreated = 0;

    for (const row of result.rows) {
      const content = JSON.stringify({
        type: row.event_type,
        agent: row.agent_id,
        ...row.metadata,
      });

      const score = await curatorScore({
        content,
        usageCount: 0,
        daysSinceCreated: Math.floor(
          (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)
        ),
        source: "conversation",
      });

      if (score.confidence >= effectiveThreshold) {
        await client.query(
          `INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, reasoning, tier, status, trace_ref, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending', $7, NOW())
           ON CONFLICT DO NOTHING`,
          [
            config.groupId,
            config.scope.workspaceId,
            content,
            score.confidence,
            score.reasoning,
            score.tier,
            row.id,
          ]
        );
        proposalsCreated++;
        console.log(`[Watchdog] Queued proposal for event ${row.id}: ${score.confidence.toFixed(2)} (${score.tier})`);
      }
    }

    return proposalsCreated;
  });
}

// ── Exported cycle function (also used by CLI) ───────────────────────────────

/**
 * Run one watchdog cycle: scan + propose, emit heartbeat, check queue depth.
 * Exported for unit-testing without starting the interval loop.
 *
 * @param config - Watchdog configuration
 * @param cycleCount - Current cycle index (1-based)
 */
export async function runWatchdogCycle(
  config: WatchdogConfig,
  cycleCount: number
): Promise<void> {
  const threshold =
    config.queueDepthThreshold ??
    (process.env.WATCHDOG_QUEUE_DEPTH_THRESHOLD
      ? parseInt(process.env.WATCHDOG_QUEUE_DEPTH_THRESHOLD, 10)
      : 100);

  const newProposals = await scanAndPropose(config);

  // Cycle evidence and queue depth are workspace-owned writes/reads. Keep them
  // together in the strict app-role transaction rather than trusting a caller
  // pool that could be an owner connection.
  await withWorkspaceTransaction(config.scope, async (client) => {
    await client.query(
      `INSERT INTO events (event_type, agent_id, group_id, workspace_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        'WATCHDOG_HEARTBEAT',
        'watchdog',
        config.groupId,
        config.scope.workspaceId,
        JSON.stringify({ proposals_created: newProposals, scan_cycle: cycleCount }),
      ]
    );

    // Legacy NULL-workspace proposals are deliberately excluded from a scoped
    // queue-depth blocker; only this credential's group/workspace can contribute.
    const depthResult = await client.query(
      `SELECT COUNT(*)::int AS pending
       FROM canonical_proposals
       WHERE group_id = $1 AND workspace_id = $2 AND status = 'pending'`,
      [config.groupId, config.scope.workspaceId]
    );
    const pending = (depthResult.rows[0] as { pending: number }).pending;

    if (pending > threshold) {
      await client.query(
        `INSERT INTO events (event_type, agent_id, group_id, workspace_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          'BLOCKER',
          'watchdog',
          config.groupId,
          config.scope.workspaceId,
          JSON.stringify({ kind: 'curator_queue_depth', pending, threshold, hint: 'run curator batch triage' }),
        ]
      );
      console.warn(`[Watchdog] BLOCKER: curator queue depth ${pending} exceeds threshold ${threshold}`);
    }
  });

  if (newProposals > 0) {
    console.log(`[Watchdog] Scan complete: ${newProposals} new proposals`);
  }
}

// ── CLI Mode ────────────────────────────────────────────────────────────────

// Only run CLI when executed directly (not when imported)
const isMainModule = process.argv[1]?.includes("watchdog.ts");

if (isMainModule) {
  // Parse CLI args
  const args = process.argv.slice(2);
  function getArg(name: string, defaultValue: string): string {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultValue;
  }

  const INTERVAL_MS = parseInt(getArg("interval", "60"), 10) * 1000;
  const GROUP_ID = getArg("group-id", "allura-system");
  const SCORE_THRESHOLD = parseFloat(getArg("threshold", "0.7"));

  // Validate group_id format
  if (!/^allura-[a-z0-9-]+$/.test(GROUP_ID)) {
    console.error(`[Watchdog] Invalid group_id: ${GROUP_ID}. Must match ^allura-[a-z0-9-]+$`);
    process.exit(1);
  }

  const watchdogConfig: WatchdogConfig = {
    groupId: GROUP_ID,
    scope: (() => {
      throw new Error("Direct watchdog CLI has no validated workspace credential; use the authenticated server ingress");
    })(),
    scoreThreshold: SCORE_THRESHOLD,
  };

  async function main() {
    console.log(`[Watchdog] Starting autonomous curator loop`);
    console.log(`[Watchdog] group_id=${GROUP_ID}, interval=${INTERVAL_MS / 1000}s, threshold=${SCORE_THRESHOLD}`);

    let cycleCount = 0;

    async function runCycle(): Promise<void> {
      cycleCount++;
      await runWatchdogCycle(watchdogConfig, cycleCount);
    }

    // Run first scan immediately
    await runCycle();
    console.log(`[Watchdog] Initial scan complete (cycle 1)`);

    // Then loop
    setInterval(async () => {
      try {
        await runCycle();
      } catch (error) {
        console.error("[Watchdog] Scan failed:", error);
      }
    }, INTERVAL_MS);
  }

  main().catch(console.error);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n[Watchdog] Shutting down...");
    await closePool();
    process.exit(0);
  });
}