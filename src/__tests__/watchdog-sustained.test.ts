/**
 * Sustained Watchdog Validation — 3-Cycle Pass
 *
 * Proves watchdog runs 3+ cycles without throwing,
 * creates pending proposals in canonical_proposals,
 * and no alias table (proposals, proposal_queue) exists.
 *
 * Run with: RUN_E2E_TESTS=true bun vitest run src/__tests__/watchdog-sustained.test.ts
 */

import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { scanAndPropose, type WatchdogConfig } from "../curator/watchdog";
import { closePool, getPool } from "../lib/postgres/connection";

// Load environment variables from .env file
config();

// Skip E2E tests unless explicitly enabled
const shouldRunE2E = process.env.RUN_E2E_TESTS === "true";
const E2E_TIMEOUT = 30000;

// Per-run isolation
const RUN_ID = randomUUID().slice(0, 8);
const GROUP_ID = `allura-wd-sustained-${RUN_ID}` as const;
const WORKSPACE_ID = `workspace-wd-sustained-${RUN_ID}`;

describe.skipIf(!shouldRunE2E)("Watchdog Sustained Validation", () => {
  let pgPool: Pool;

  beforeAll(async () => {
    if (!process.env.POSTGRES_PASSWORD) {
      throw new Error("POSTGRES_PASSWORD environment variable is required");
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (databaseUrl) {
      pgPool = new Pool({ connectionString: databaseUrl });
    } else {
      pgPool = new Pool({
        host: process.env.POSTGRES_HOST || "localhost",
        port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
        database: process.env.POSTGRES_DB || "memory",
        user: process.env.POSTGRES_USER || "ronin4life",
        password: process.env.POSTGRES_PASSWORD,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 10,
      });
    }

    // Verify connection
    await pgPool.query("SELECT 1");
    await pgPool.query(
      "INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, 'Watchdog sustained fixture')",
      [WORKSPACE_ID, GROUP_ID]
    );

    // Seed events for watchdog to discover — 3 events with high-specificity content
    await pgPool.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata, created_at) VALUES
        ($1, $2, 'memory_add', 'test-watchdog', 'completed', $3, NOW() - INTERVAL '1 hour'),
        ($1, $2, 'decision', 'brooks', 'completed', $4, NOW() - INTERVAL '30 minutes'),
        ($1, $2, 'insight', 'curator', 'completed', $5, NOW() - INTERVAL '15 minutes')`,
      [
        GROUP_ID,
        WORKSPACE_ID,
        JSON.stringify({ content: "I always prefer TypeScript with strict mode and explicit return types for production code", source: "conversation" }),
        JSON.stringify({ content: "I never deploy on Fridays without a rollback plan and a monitoring dashboard", source: "conversation" }),
        JSON.stringify({ content: "We always use PostgreSQL for raw traces and Neo4j for promoted knowledge graph", source: "conversation" }),
      ]
    );
  }, E2E_TIMEOUT);

  afterAll(async () => {
    // Clean up test data
    await pgPool?.query("DELETE FROM canonical_proposals WHERE group_id = $1 AND workspace_id = $2", [GROUP_ID, WORKSPACE_ID]);
    await pgPool?.query("DELETE FROM events WHERE group_id = $1 AND workspace_id = $2", [GROUP_ID, WORKSPACE_ID]);
    await pgPool?.query("DELETE FROM workspaces WHERE workspace_id = $1", [WORKSPACE_ID]);
    await pgPool?.end();
    await closePool();
  }, E2E_TIMEOUT);

  // ── Test 1: No alias tables exist ─────────────────────────────────────────

  it(
    "should find canonical_proposals but NOT alias tables (proposals, proposal_queue)",
    async () => {
      const result = await pgPool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('proposals', 'proposal_queue', 'canonical_proposals')
         ORDER BY table_name`
      );

      const tableNames = result.rows.map((r: { table_name: string }) => r.table_name);
      expect(tableNames).toContain("canonical_proposals");
      expect(tableNames).not.toContain("proposals");
      expect(tableNames).not.toContain("proposal_queue");
    },
    E2E_TIMEOUT
  );

  // ── Test 2: 3-cycle sustained run ────────────────────────────────────────

  it(
    "should run 3 watchdog cycles without throwing and create pending proposals",
    async () => {
      const watchdogConfig: WatchdogConfig = {
        groupId: GROUP_ID,
        scope: {
          tenantId: GROUP_ID,
          workspaceId: WORKSPACE_ID,
          principalId: "watchdog-sustained-test",
        },
        scoreThreshold: 0.3, // Low threshold to ensure our test events qualify
      };

      const cycleResults: number[] = [];

      // Cycle 1
      const cycle1 = await scanAndPropose(watchdogConfig);
      cycleResults.push(cycle1);
      console.log(`[Test] Cycle 1: ${cycle1} proposals created`);

      // Verify after cycle 1
      const after1 = await pgPool.query(
        "SELECT id, status FROM canonical_proposals WHERE group_id = $1 AND workspace_id = $2",
        [GROUP_ID, WORKSPACE_ID]
      );
      expect(after1.rows.length).toBeGreaterThan(0);
      for (const row of after1.rows) {
        expect(row.status).toBe("pending");
      }

      // Cycle 2 — should find 0 new (idempotent, already tracked)
      const cycle2 = await scanAndPropose(watchdogConfig);
      cycleResults.push(cycle2);
      console.log(`[Test] Cycle 2: ${cycle2} proposals created (expect 0 — idempotent)`);

      // Verify count didn't change
      const after2 = await pgPool.query(
        "SELECT COUNT(*) as cnt FROM canonical_proposals WHERE group_id = $1 AND workspace_id = $2",
        [GROUP_ID, WORKSPACE_ID]
      );
      expect(Number(after2.rows[0].cnt)).toBe(after1.rows.length);

      // Seed a new event for cycle 3
      await pgPool.query(
        `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata, created_at)
         VALUES ($1, $2, 'insight', 'curator', 'completed', $3, NOW())`,
        [
          GROUP_ID,
          WORKSPACE_ID,
          JSON.stringify({ content: "I always validate with typecheck before committing changes to main", source: "conversation" }),
        ]
      );

      // Cycle 3 — should find the new event
      const cycle3 = await scanAndPropose(watchdogConfig);
      cycleResults.push(cycle3);
      console.log(`[Test] Cycle 3: ${cycle3} proposals created (expect 1 — new event)`);

      // Verify cycle 3 created at least 1 new proposal
      expect(cycle3).toBeGreaterThanOrEqual(1);

      // Final verification: all proposals are pending
      const finalResult = await pgPool.query(
        "SELECT id, status FROM canonical_proposals WHERE group_id = $1 AND workspace_id = $2",
        [GROUP_ID, WORKSPACE_ID]
      );
      expect(finalResult.rows.length).toBeGreaterThanOrEqual(2);
      for (const row of finalResult.rows) {
        expect(row.status).toBe("pending");
      }

      // Verify idempotency: cycle 1 + cycle 3 >= 2, cycle 2 = 0
      expect(cycleResults[0]).toBeGreaterThanOrEqual(1);
      expect(cycleResults[1]).toBe(0); // idempotent — already tracked
      expect(cycleResults[2]).toBeGreaterThanOrEqual(1); // new event found
    },
    E2E_TIMEOUT * 3 // longer timeout for 3 cycles
  );

  // ── Test 3: Verify querying non-existent alias table errors ───────────────

  it(
    "should error when querying 'proposals' table (alias must not exist)",
    async () => {
      await expect(
        pgPool.query("SELECT * FROM proposals LIMIT 1")
      ).rejects.toThrow();
    },
    E2E_TIMEOUT
  );
});