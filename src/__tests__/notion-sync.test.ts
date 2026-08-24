/**
 * Notion Sync Tests
 *
 * Validates that notion-sync correctly queries canonical_proposals,
 * handles both configured and unconfigured Notion environments,
 * and validates group_id format.
 *
 * Run with: RUN_E2E_TESTS=true bun vitest run src/__tests__/notion-sync.test.ts
 */

import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { getPendingProposals, markSynced, type NotionSyncConfig, syncToNotion } from "../curator/notion-sync";
import { closePool } from "../lib/postgres/connection";

// Load environment variables
config();

// Skip E2E tests unless explicitly enabled
const shouldRunE2E = process.env.RUN_E2E_TESTS === "true";
const E2E_TIMEOUT = 30000;

// Per-run isolation
const RUN_ID = randomUUID().slice(0, 8);
const GROUP_ID = `allura-notion-sync-${RUN_ID}` as const;

describe.skipIf(!shouldRunE2E)("Notion Sync", () => {
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

    await pgPool.query("SELECT 1");

    // Seed test proposals
    await pgPool.query(
      `INSERT INTO canonical_proposals (id, group_id, content, score, reasoning, tier, status, created_at) VALUES
        ($1, $2, 'Test proposal 1 — I always prefer TypeScript strict mode', 0.85, 'High specificity', 'mainstream', 'pending', NOW()),
        ($3, $2, 'Test proposal 2 — We never deploy without tests', 0.80, 'Shows preference', 'adoption', 'pending', NOW()),
        ($4, $2, 'Test proposal 3 — Maybe use a different approach', 0.50, 'Vague language', 'emerging', 'pending', NOW())`,
      [
        randomUUID(),
        GROUP_ID,
        randomUUID(),
        randomUUID(),
      ]
    );
  }, E2E_TIMEOUT);

  afterAll(async () => {
    await pgPool?.query("DELETE FROM canonical_proposals WHERE group_id = $1", [GROUP_ID]);
    await pgPool?.end();
    await closePool();
  }, E2E_TIMEOUT);

  // ── Test 1: getPendingProposals queries canonical_proposals ──────────────

  it(
    "should fetch pending proposals from canonical_proposals",
    async () => {
      const proposals = await getPendingProposals(GROUP_ID);

      expect(proposals.length).toBeGreaterThanOrEqual(3);
      expect(proposals[0].id).toBeDefined();
      expect(proposals[0].content).toBeDefined();
      expect(proposals[0].score).toBeDefined();
      expect(proposals[0].tier).toBeDefined();
    },
    E2E_TIMEOUT
  );

  // ── Test 2: Proposals are ordered by score DESC ──────────────────────────

  it(
    "should return proposals ordered by score DESC",
    async () => {
      const proposals = await getPendingProposals(GROUP_ID);

      for (let i = 1; i < proposals.length; i++) {
        expect(parseFloat(proposals[i - 1].score)).toBeGreaterThanOrEqual(
          parseFloat(proposals[i].score)
        );
      }
    },
    E2E_TIMEOUT
  );

  // ── Test 3: Invalid group_id throws ──────────────────────────────────────

  it("should reject invalid group_id format", async () => {
    await expect(getPendingProposals("invalid-group")).rejects.toThrow("Invalid group_id");
  });

  // ── Test 4: syncToNotion without Notion config returns errors ─────────────

  it(
    "should report unconfigured state when Notion API key is missing",
    async () => {
      const result = await syncToNotion({
        groupId: GROUP_ID,
        // No notionApiKey or notionDbId
      });

      expect(result.proposalsFound).toBeGreaterThanOrEqual(3);
      expect(result.proposalsSynced).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Notion not configured");
    },
    E2E_TIMEOUT
  );

  // ── Test 5: markSynced appends Notion page ID to rationale ───────────────

  it(
    "should mark proposal as synced by appending Notion page ID to rationale",
    async () => {
      const proposals = await getPendingProposals(GROUP_ID);
      const target = proposals[0];

      await markSynced(target.id, "notion-page-123", GROUP_ID);

      // Verify the rationale was updated
      const result = await pgPool.query(
        "SELECT rationale FROM canonical_proposals WHERE id = $1",
        [target.id]
      );

      expect(result.rows[0].rationale).toContain("[notion:notion-page-123]");
    },
    E2E_TIMEOUT
  );
});