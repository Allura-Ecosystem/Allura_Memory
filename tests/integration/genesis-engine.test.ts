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
 * Live case requires the trusted disposable runner; pure detection remains independent.
 *
 * Reference: docs/allura/BLUEPRINT.md (Genesis Engine)
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { genesisMutationDigest, issueGenesisPolicyEvidence } from "@/control-plane/genesis-policy-evidence";
import {
  type DetectionWindow,
  detectPatterns,
  runDetection,
  type TrajectoryPoint,
} from "@/lib/genesis/pattern-detector";
import { generateProposals } from "@/lib/genesis/proposal-generator";
import { closePool, getPool } from "@/lib/postgres/connection";
import { freshFixtureScope, requireDisposableFixture } from "../fixtures/disposable-postgres";

const scope = freshFixtureScope();
const TEST_GROUP_ID = scope.groupId;
const TEST_AGENT_ID = scope.principalId;
let restoreSecret: (() => void) | undefined;

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

// The hook only closes acquired resources; rows survive for the owned service lifetime.
describe("Genesis Engine — Integration (Story 2.2)", () => {
  afterAll(async () => {
    try { await closePool(); } finally { restoreSecret?.(); }
  });

  it("inserts repeated trajectories, detects patterns, and verifies a proposal is generated", async () => {

    const assertEnvironment = await requireDisposableFixture("tests/integration/genesis-engine.test.ts");
    assertEnvironment();
    const previousSecret = process.env.RUVIX_CONTROL_PLANE_SECRET;
    process.env.RUVIX_CONTROL_PLANE_SECRET = randomBytes(32).toString("hex");
    restoreSecret = () => {
      if (previousSecret === undefined) delete process.env.RUVIX_CONTROL_PLANE_SECRET;
      else process.env.RUVIX_CONTROL_PLANE_SECRET = previousSecret;
    };
    await getPool().query(`INSERT INTO tenants(group_id,name,owner_agent_id) VALUES($1,$2,$3)`,
      [TEST_GROUP_ID, "Isolated Genesis fixture", TEST_AGENT_ID]);

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
    const before = await countProposals();
    const missingEvidence = await generateProposals(TEST_GROUP_ID, [detected[0]!]);
    expect(missingEvidence.recorded).toBe(0);
    expect(await countProposals()).toBe(before);
    const batchResults = [];
    for (const pattern of detected) {
      const mutation = { group_id: TEST_GROUP_ID, pattern_description: pattern.pattern_description,
        pattern_type: pattern.pattern_type, frequency: pattern.frequency, suggested_skill: pattern.suggested_skill,
        confidence: Math.max(0, Math.min(1, pattern.confidence)), status: "proposed" };
      const policyEvidence = issueGenesisPolicyEvidence({
        actor: TEST_AGENT_ID, groupId: TEST_GROUP_ID, approvalRef: randomUUID(), target: "pg:pattern_proposals",
        mutationDigest: genesisMutationDigest("pg:pattern_proposals", mutation),
        projectManifest: { name: "Isolated Genesis evidence", sourcesOfTruth: [
          { type: "local", id: scope.sessionId, name: "Synthetic fixture source", required: true },
        ], infrastructureTargets: [] },
        sourceOfTruthReads: [{ type: "local", id: scope.sessionId, timestamp: Date.now(), summary: "Synthetic fixture source verified" }],
      });
      const beforeAltered = await countProposals();
      const altered = await generateProposals(TEST_GROUP_ID, [{ ...pattern, frequency: pattern.frequency + 1 }], { policyEvidence });
      expect(altered.recorded).toBe(0);
      expect(await countProposals()).toBe(beforeAltered);
      // Each signed claim binds one exact mutation and can be consumed only once.
      batchResults.push(await generateProposals(TEST_GROUP_ID, [pattern], { policyEvidence }));
    }
    const result = { recorded: batchResults.reduce((sum, batch) => sum + batch.recorded, 0) };
    expect(batchResults.every(batch => batch.failed === 0)).toBe(true);
    expect(result.recorded).toBe(detected.length);
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