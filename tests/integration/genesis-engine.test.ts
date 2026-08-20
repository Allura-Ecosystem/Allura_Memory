/**
 * Genesis Engine — Integration Test (Story 2.2)
 *
 * End-to-end: insert repeated trajectories into `agent_trajectories` → run
 * the pattern detector → verify a `pattern_proposals` row is generated.
 *
 * Requires a live PostgreSQL stack with migrations 30 (agent_trajectories),
 * 30 (skill_usage_events), and 31 (pattern_proposals) applied.
 *
 * Run:
 *   bun run test:integration
 *   bun vitest run tests/integration/genesis-engine.test.ts
 *
 * Gating: tests skip gracefully when the DB is unavailable.
 *
 * Reference: docs/allura/BLUEPRINT.md (Genesis Engine)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type DetectionWindow,
  detectPatterns,
  runDetection,
  type TrajectoryPoint,
} from "@/lib/genesis/pattern-detector";
import { generateProposals } from "@/lib/genesis/proposal-generator";
import { getPool } from "@/lib/postgres/connection";
import { recordTrajectory } from "@/lib/sona/trajectory-engine";

// ── DB availability probe ────────────────────────────────────────────────────

async function isDbAvailable(): Promise<boolean> {
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

let dbAvailable = false;

const TEST_GROUP_ID = "allura-genesis-test";
const TEST_AGENT_ID = "genesis-test-agent";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Insert a trajectory row directly via the pool (test setup — not the controlPlane path). */
async function insertTrajectory(
  action: string,
  task_type: string,
  success: boolean
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO agent_trajectories (group_id, agent_id, action, task_type, success, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [TEST_GROUP_ID, TEST_AGENT_ID, action, task_type, success, 10]
  );
}

/** Count pattern_proposals rows for the test group. */
async function countProposals(): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total FROM pattern_proposals WHERE group_id = $1`,
    [TEST_GROUP_ID]
  );
  return result.rows[0]?.total ?? 0;
}

/** Clean up test rows so the suite is idempotent. */
async function cleanup(): Promise<void> {
  const pool = getPool();
  // pattern_proposals is append-only via trigger — but the test cleanup
  // bypasses the trigger by using a session_replication_role override OR
  // we simply truncate via a DO block that drops/recreates triggers.
  // Simpler: use a raw DELETE with the trigger temporarily disabled.
  await pool.query("SET session_replication_role = 'replica'");
  try {
    await pool.query(
      `DELETE FROM pattern_proposals WHERE group_id = $1`,
      [TEST_GROUP_ID]
    );
    await pool.query(
      `DELETE FROM agent_trajectories WHERE group_id = $1`,
      [TEST_GROUP_ID]
    );
  } finally {
    await pool.query("SET session_replication_role = 'origin'")
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Genesis Engine — Integration (Story 2.2)", () => {
  beforeAll(async () => {
    dbAvailable = await isDbAvailable();
    if (!dbAvailable) {
      console.warn(
        "[genesis-engine integration] DB unavailable — tests will be skipped. " +
          "Start the Brain stack with: bun run brain:up"
      );
      return;
    }
    await cleanup();
  }, 30_000);

  afterAll(async () => {
    if (dbAvailable) {
      await cleanup();
    }
  }, 30_000);

  it("inserts repeated trajectories, detects patterns, and verifies a proposal is generated", async () => {
    if (!dbAvailable) return;

    // ── 1. Insert 12 trajectories of the same task_type (high-frequency: 12 ≥ 10) ──
    for (let i = 0; i < 12; i++) {
      await insertTrajectory("memory_add", "ingest", true);
    }
    // Also insert a repeated action sequence: [memory_search → memory_add → memory_search]
    // repeated 4 times by the same agent.
    const sequence = ["memory_search", "memory_add", "memory_search"];
    for (let rep = 0; rep < 4; rep++) {
      for (const action of sequence) {
        await insertTrajectory(action, "retrieve", true);
      }
    }

    // ── 2. Run detection over a 7-day window ──
    const detected = await runDetection(TEST_GROUP_ID, { window_days: 7 });
    expect(detected.length).toBeGreaterThanOrEqual(1);

    // At least one high_frequency_task pattern for task_type=ingest
    const hfPatterns = detected.filter((p) => p.pattern_type === "high_frequency_task");
    expect(hfPatterns.length).toBeGreaterThanOrEqual(1);
    const ingestPattern = hfPatterns.find((p) =>
      (p.evidence as { task_type?: string })?.task_type === "ingest"
    );
    expect(ingestPattern).toBeDefined();
    expect(ingestPattern!.frequency).toBeGreaterThanOrEqual(10);

    // At least one repeated_action_sequence pattern
    const seqPatterns = detected.filter(
      (p) => p.pattern_type === "repeated_action_sequence"
    );
    expect(seqPatterns.length).toBeGreaterThanOrEqual(1);

    // ── 3. Generate proposals through the controlPlane syscall_mutate path ──
    const result = await generateProposals(TEST_GROUP_ID, detected);
    expect(result.recorded).toBeGreaterThan(0);

    // ── 4. Verify pattern_proposals rows were persisted ──
    const proposalCount = await countProposals();
    expect(proposalCount).toBeGreaterThanOrEqual(result.recorded);

    // ── 5. Verify the row shape ──
    const pool = getPool();
    const proposalRows = await pool.query(
      `SELECT id, group_id, pattern_description, pattern_type, frequency, suggested_skill, confidence, status
       FROM pattern_proposals WHERE group_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [TEST_GROUP_ID]
    );
    expect(proposalRows.rows.length).toBeGreaterThan(0);
    const row = proposalRows.rows[0];
    expect(row.group_id).toBe(TEST_GROUP_ID);
    expect(row.status).toBe("proposed");
    expect(row.confidence).toBeGreaterThanOrEqual(0.0);
    expect(row.confidence).toBeLessThanOrEqual(1.0);
  }, 60_000);

  it("detectPatterns works on a synthetic window without touching the DB", async () => {
    if (!dbAvailable) return;

    const points: TrajectoryPoint[] = [];
    for (let i = 0; i < 15; i++) {
      points.push({
        id: i,
        agent_id: TEST_AGENT_ID,
        action: "memory_add",
        task_type: "ingest",
        success: true,
        created_at: new Date(Date.now() + i),
      });
    }
    const window: DetectionWindow = {
      group_id: TEST_GROUP_ID,
      trajectories: points,
      skillUsage: [],
    };
    const detected = detectPatterns(window);
    expect(detected.length).toBeGreaterThanOrEqual(1);
    expect(
      detected.some((p) => p.pattern_type === "high_frequency_task")
    ).toBe(true);
  }, 30_000);
});