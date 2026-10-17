/**
 * Curator Approve/Reject E2E Validation
 *
 * Tests the full approve/reject flow through the canonical_proposals
 * table and verifies that approvePromotions() throws in operational context.
 *
 * Run with: RUN_E2E_TESTS=true bun vitest run src/__tests__/curator-approve.test.ts
 */

import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

// Load environment variables
config();

// Skip E2E tests unless explicitly enabled
const shouldRunE2E = process.env.RUN_E2E_TESTS === "true";
const E2E_TIMEOUT = 30000;

// Per-run isolation
const RUN_ID = randomUUID().slice(0, 8);
const GROUP_ID = `allura-curator-approve-${RUN_ID}` as const;

/**
 * Core approve/reject logic extracted from route.ts for direct testing.
 * This mirrors the POST /api/curator/approve handler logic but uses
 * the provided pool rather than creating its own.
 */
async function processCuratorDecision(params: {
  proposal_id: string;
  group_id: string;
  decision: "approve" | "reject";
  curator_id: string;
  rationale?: string;
  pool: Pool;
}): Promise<{ success: boolean; status: number; message: string; decided_at: string }> {
  const { proposal_id, group_id, decision, curator_id, rationale, pool } = params;

  // Validate required fields
  if (!proposal_id) return { success: false, status: 400, message: "proposal_id is required", decided_at: "" };
  if (!group_id) return { success: false, status: 400, message: "group_id is required", decided_at: "" };
  if (!["approve", "reject"].includes(decision)) return { success: false, status: 400, message: "decision must be 'approve' or 'reject'", decided_at: "" };
  if (!curator_id) return { success: false, status: 400, message: "curator_id is required", decided_at: "" };

  // Validate group_id format
  if (!group_id.startsWith("allura-")) {
    return { success: false, status: 400, message: "Invalid group_id. Must match pattern: allura-*", decided_at: "" };
  }

  // Fetch proposal
  const proposalResult = await pool.query(
    `SELECT id, group_id, content, score, reasoning, tier, status, trace_ref
     FROM canonical_proposals
     WHERE id = $1 AND group_id = $2`,
    [proposal_id, group_id]
  );

  if (proposalResult.rows.length === 0) {
    return { success: false, status: 404, message: "Proposal not found", decided_at: "" };
  }

  const proposal = proposalResult.rows[0];

  if (proposal.status !== "pending") {
    return { success: false, status: 400, message: `Proposal already ${proposal.status}`, decided_at: "" };
  }

  const decidedAt = new Date().toISOString();

  // For approve: update status (the semantic store promotion handled by route.ts in production)
  if (decision === "approve") {
    await pool.query(
      `UPDATE canonical_proposals
       SET status = 'approved',
           decided_at = $1,
           decided_by = $2,
           rationale = $3
       WHERE id = $4`,
      [decidedAt, curator_id, rationale || null, proposal_id]
    );

    // Log approval event
    await pool.query(
      `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        group_id,
        "proposal_approved",
        curator_id,
        "completed",
        JSON.stringify({ proposal_id, score: proposal.score, tier: proposal.tier, rationale }),
        decidedAt,
      ]
    );

    return { success: true, status: 200, message: "approved", decided_at: decidedAt };
  } else {
    // Reject
    await pool.query(
      `UPDATE canonical_proposals
       SET status = 'rejected',
           decided_at = $1,
           decided_by = $2,
           rationale = $3
       WHERE id = $4`,
      [decidedAt, curator_id, rationale || null, proposal_id]
    );

    // Log rejection event
    await pool.query(
      `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        group_id,
        "proposal_rejected",
        curator_id,
        "completed",
        JSON.stringify({ proposal_id, score: proposal.score, tier: proposal.tier, rationale }),
        decidedAt,
      ]
    );

    return { success: true, status: 200, message: "rejected", decided_at: decidedAt };
  }
}

describe.skipIf(!shouldRunE2E)("Curator Approve/Reject E2E", () => {
  let pgPool: Pool;

  // Proposal IDs for tests
  let approveProposalId: string;
  let rejectProposalId: string;

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

    await pgPool.query("SELECT 1");

    // Seed pending proposals
    approveProposalId = randomUUID();
    rejectProposalId = randomUUID();

    await pgPool.query(
      `INSERT INTO canonical_proposals (id, group_id, content, score, reasoning, tier, status, created_at) VALUES
        ($1, $2, 'Proposal for approval test — I always use strict TypeScript', 0.85, 'High specificity', 'mainstream', 'pending', NOW()),
        ($3, $2, 'Proposal for rejection test — Maybe consider this approach', 0.60, 'Vague language', 'emerging', 'pending', NOW())`,
      [approveProposalId, GROUP_ID, rejectProposalId]
    );
  }, E2E_TIMEOUT);

  afterAll(async () => {
    await pgPool?.query("DELETE FROM canonical_proposals WHERE group_id = $1", [GROUP_ID]);
    await pgPool?.query("DELETE FROM events WHERE group_id = $1", [GROUP_ID]);
    await pgPool?.end();
  }, E2E_TIMEOUT);

  // ── Test 1: Approve flow ────────────────────────────────────────────────

  it(
    "should approve a pending proposal and set status to 'approved'",
    async () => {
      const result = await processCuratorDecision({
        proposal_id: approveProposalId,
        group_id: GROUP_ID,
        decision: "approve",
        curator_id: "test-curator",
        rationale: "Approved for promotion to knowledge graph",
        pool: pgPool,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.message).toBe("approved");
      expect(result.decided_at).toBeDefined();

      // Verify in DB
      const dbResult = await pgPool.query(
        "SELECT status, decided_by, decided_at FROM canonical_proposals WHERE id = $1",
        [approveProposalId]
      );
      expect(dbResult.rows[0].status).toBe("approved");
      expect(dbResult.rows[0].decided_by).toBe("test-curator");
      expect(dbResult.rows[0].decided_at).toBeDefined();

      // Verify approval event was logged
      const eventResult = await pgPool.query(
        "SELECT event_type, agent_id FROM events WHERE group_id = $1 AND event_type = 'proposal_approved' ORDER BY created_at DESC LIMIT 1",
        [GROUP_ID]
      );
      expect(eventResult.rows.length).toBeGreaterThan(0);
      expect(eventResult.rows[0].event_type).toBe("proposal_approved");
    },
    E2E_TIMEOUT
  );

  // ── Test 2: Reject flow ──────────────────────────────────────────────────

  it(
    "should reject a pending proposal and set status to 'rejected'",
    async () => {
      const result = await processCuratorDecision({
        proposal_id: rejectProposalId,
        group_id: GROUP_ID,
        decision: "reject",
        curator_id: "test-curator",
        rationale: "Not specific enough for knowledge graph",
        pool: pgPool,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.message).toBe("rejected");

      // Verify in DB
      const dbResult = await pgPool.query(
        "SELECT status, decided_by FROM canonical_proposals WHERE id = $1",
        [rejectProposalId]
      );
      expect(dbResult.rows[0].status).toBe("rejected");
      expect(dbResult.rows[0].decided_by).toBe("test-curator");

      // Verify rejection event was logged
      const eventResult = await pgPool.query(
        "SELECT event_type FROM events WHERE group_id = $1 AND event_type = 'proposal_rejected' ORDER BY created_at DESC LIMIT 1",
        [GROUP_ID]
      );
      expect(eventResult.rows.length).toBeGreaterThan(0);
    },
    E2E_TIMEOUT
  );

  // ── Test 3: Double-approve prevention ────────────────────────────────────

  it(
    "should reject approving an already-approved proposal",
    async () => {
      const result = await processCuratorDecision({
        proposal_id: approveProposalId,
        group_id: GROUP_ID,
        decision: "approve",
        curator_id: "test-curator",
        pool: pgPool,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.message).toContain("already approved");
    },
    E2E_TIMEOUT
  );

  // ── Test 4: Invalid group_id ─────────────────────────────────────────────

  it("should reject invalid group_id format", async () => {
    const result = await processCuratorDecision({
      proposal_id: "any-id",
      group_id: "invalid-group",
      decision: "approve",
      curator_id: "test-curator",
      pool: pgPool,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.message).toContain("Invalid group_id");
  });
});

// approvePromotions() and DeprecatedApprovalPathError removed in ADR-003 (2026-04-13).
// The sole approval path is POST /api/curator/approve.
// See docs/adr/ADR-003-approve-promotions-deprecation.md