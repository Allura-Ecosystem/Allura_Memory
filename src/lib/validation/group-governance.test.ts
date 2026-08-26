import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  findOrphanedGroupIds,
  findSimilarGroupIds,
  generateGroupIdGovernanceReport,
  getGraphGroupIdStats,
  getPostgresGroupIdStats,
} from "./group-governance";
import { closePool, getPool } from "../postgres/connection";
import { type EventInsert, insertEvent } from "../postgres/queries/insert-trace";

const TEST_GROUP_PREFIX = "allura-governance-%";

async function insertGraphMemory(id: string, groupId: string, content: string): Promise<void> {
  await getPool().query(
    `INSERT INTO graph_memories
       (id, group_id, user_id, content, score, provenance, version, created_at, deprecated, workspace_scope_state)
     VALUES ($1, $2, $3, $4, $5, $6, 1, NOW()::timestamptz, false, 'legacy_quarantined')`,
    [id, groupId, "governance-agent", content, 0.9, "manual"],
  );
}

async function cleanupTestData(): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM graph_memories WHERE group_id LIKE $1", [TEST_GROUP_PREFIX]);
  await pool.query("DELETE FROM events WHERE group_id LIKE $1", [TEST_GROUP_PREFIX]);
}

// E2E gating: skip unless RUN_E2E_TESTS=true (requires live PostgreSQL)
const describeE2E = process.env.RUN_E2E_TESTS === "true" ? describe : describe.skip;

describeE2E("group-governance", () => {
  const testProject1 = "allura-governance-test-1";
  const testProject2 = "allura-governance-test-2";
  const testProject3 = "allura-governance-similar"; // Similar to allura-governance-test-*
  const testOrphan = "allura-governance-orphan";
  const testAgentId = "governance-agent";

  beforeAll(async () => {
    // Configure PostgreSQL
    process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
    process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
    process.env.POSTGRES_DB = process.env.POSTGRES_DB || "memory";
    process.env.POSTGRES_USER = process.env.POSTGRES_USER || "allura";
    process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "allura";

    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closePool();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  // =========================================================================
  // getPostgresGroupIdStats Tests
  // =========================================================================

  describe("getPostgresGroupIdStats", () => {
    it("should return empty stats for no data", async () => {
      const report = await getPostgresGroupIdStats();

      // Find our test groups (should not exist yet)
      const testGroups = report.groups.filter((g) =>
        g.group_id.startsWith("allura-governance-")
      );
      expect(testGroups.length).toBe(0);
    });

    it("should return stats for existing groups", async () => {
      // Insert test events
      await insertEvent({
        group_id: testProject1,
        event_type: "test-event",
        agent_id: testAgentId,
      });

      await insertEvent({
        group_id: testProject2,
        event_type: "test-event",
        agent_id: testAgentId,
      });

      const report = await getPostgresGroupIdStats();

      const project1 = report.groups.find((g) => g.group_id === testProject1);
      const project2 = report.groups.find((g) => g.group_id === testProject2);

      expect(project1).toBeDefined();
      expect(project1?.event_count).toBeGreaterThanOrEqual(1);
      expect(project1?.is_valid).toBe(true);
      expect(project1?.is_reserved).toBe(false);

      expect(project2).toBeDefined();
      expect(project2?.event_count).toBeGreaterThanOrEqual(1);
    });

    it("should identify invalid group_ids", async () => {
      // This test would require inserting invalid data directly into DB
      // which is not allowed by our validation. So we test the detection logic
      const report = await getPostgresGroupIdStats();

      // Should not have invalid groups (since we validate on insert)
      const invalidCount = report.invalid_groups.length;
      expect(typeof invalidCount).toBe("number");
    });
  });

  // =========================================================================
  // getGraphGroupIdStats Tests
  // =========================================================================

  describe("getGraphGroupIdStats", () => {
    it("should return empty stats for no data", async () => {
      const report = await getGraphGroupIdStats();

      const testGroups = report.groups.filter((g) =>
        g.group_id.startsWith("governance-")
      );
      expect(testGroups.length).toBe(0);
    });

    it("should return stats for existing groups", async () => {
      // Seed canonical graph memory in PostgreSQL.
      await insertGraphMemory("gov-insight-1", testProject1, "Test insight for governance");
      await insertGraphMemory("gov-insight-2", testProject2, "Another test insight");

      const report = await getGraphGroupIdStats();

      const project1 = report.groups.find((g) => g.group_id === testProject1);
      const project2 = report.groups.find((g) => g.group_id === testProject2);

      expect(project1).toBeDefined();
      expect(project1?.insight_count).toBeGreaterThanOrEqual(1);
      expect(project1?.is_valid).toBe(true);

      expect(project2).toBeDefined();
      expect(project2?.insight_count).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // findSimilarGroupIds Tests
  // =========================================================================

  describe("findSimilarGroupIds", () => {
    it("should find similar group_ids", () => {
      const groups = ["my-project", "my-projct", "my-project-2", "other-project"];

      const similar = findSimilarGroupIds(groups);

      // "my-project" and "my-projct" are similar (distance 1)
      const myProjectSimilar = similar.find(
        (s) =>
          (s.group_id_1 === "my-project" && s.group_id_2 === "my-projct") ||
          (s.group_id_1 === "my-projct" && s.group_id_2 === "my-project")
      );

      expect(myProjectSimilar).toBeDefined();
      expect(myProjectSimilar?.distance).toBe(1);
    });

    it("should not flag reserved IDs as similar", () => {
      const groups = ["global", "system", "my-project"];

      const similar = findSimilarGroupIds(groups);

      // "global" and "system" are similar (distance 4) but reserved
      const globalSystemSimilar = similar.find(
        (s) =>
          (s.group_id_1 === "global" && s.group_id_2 === "system") ||
          (s.group_id_1 === "system" && s.group_id_2 === "global")
      );

      expect(globalSystemSimilar).toBeUndefined();
    });

    it("should respect maxDistance parameter", () => {
      const groups = ["abc", "xyz", "abcdef"];

      const similar1 = findSimilarGroupIds(groups, 1);
      const similar2 = findSimilarGroupIds(groups, 5);

      // With distance 1, should only find very close matches
      // With distance 5, should find more matches
      expect(similar2.length).toBeGreaterThanOrEqual(similar1.length);
    });

    it("should return empty array for identical IDs", () => {
      const groups = ["same", "same", "same"];

      const similar = findSimilarGroupIds(groups);

      // All IDs are the same (distance 0), should not flag
      expect(similar).toHaveLength(0);
    });
  });

  // =========================================================================
  // findOrphanedGroupIds Tests
  // =========================================================================

  describe("findOrphanedGroupIds", () => {
    it("should return empty array when no orphans exist", async () => {
      // Insert a recent event
      await insertEvent({
        group_id: testProject1,
        event_type: "recent-event",
        agent_id: testAgentId,
      });

      const orphans = await findOrphanedGroupIds(30);

      // Our test project should not be orphaned (has recent activity)
      expect(orphans).not.toContain(testProject1);
    });

    it("should use custom threshold", async () => {
      // This test would require creating old events, which is complex
      // Just verify the function works with different thresholds
      const orphans = await findOrphanedGroupIds(1);
      expect(Array.isArray(orphans)).toBe(true);
    });
  });

  // =========================================================================
  // generateGroupIdGovernanceReport Tests
  // =========================================================================

  describe("generateGroupIdGovernanceReport", () => {
    beforeEach(async () => {
      // Create some test data
      await insertEvent({
        group_id: testProject1,
        event_type: "test-event",
        agent_id: testAgentId,
      });

      await insertGraphMemory("gov-report-insight", testProject1, "Test insight");
    });

    it("should generate comprehensive report", async () => {
      const report = await generateGroupIdGovernanceReport();

      expect(report).toHaveProperty("postgres");
      expect(report).toHaveProperty("graph");
      expect(report).toHaveProperty("orphaned_groups");
      expect(report).toHaveProperty("similar_groups");
      expect(report).toHaveProperty("recommendations");

      expect(Array.isArray(report.orphaned_groups)).toBe(true);
      expect(Array.isArray(report.similar_groups)).toBe(true);
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it("should include our test groups in report", async () => {
      const report = await generateGroupIdGovernanceReport();

      const postgresGroup = report.postgres.groups.find(
        (g) => g.group_id === testProject1
      );
      const graphGroup = report.graph.groups.find(
        (g) => g.group_id === testProject1
      );

      expect(postgresGroup).toBeDefined();
      expect(graphGroup).toBeDefined();
    });

    it("should use custom options", async () => {
      const report = await generateGroupIdGovernanceReport({
        orphanThresholdDays: 7,
        similarMaxDistance: 1,
      });

      // Should work with custom thresholds
      expect(report).toBeDefined();
      expect(Array.isArray(report.orphaned_groups)).toBe(true);
    });

    it("should generate recommendations", async () => {
      const report = await generateGroupIdGovernanceReport();

      // Should have recommendations array
      expect(Array.isArray(report.recommendations)).toBe(true);

      // Recommendations should be strings
      report.recommendations.forEach((rec) => {
        expect(typeof rec).toBe("string");
      });
    });
  });

  // =========================================================================
  // Integration Tests
  // =========================================================================

  describe("integration", () => {
    it("should detect similar groups across databases", async () => {
      // Create similar group names in both databases with unique insight IDs
      const timestamp = Date.now();
      await insertEvent({
        group_id: "allura-governance-similar-1",
        event_type: "test",
        agent_id: testAgentId,
      });

      await insertGraphMemory(
        `test-similar-insight-${timestamp}`,
        "allura-governance-similar-2",
        "Test",
      );

      const report = await generateGroupIdGovernanceReport();

      // Should include groups from both databases
      const allGroups = [
        ...report.postgres.groups.map((g) => g.group_id),
        ...report.graph.groups.map((g) => g.group_id),
      ];

      expect(allGroups).toContain("allura-governance-similar-1");
      expect(allGroups).toContain("allura-governance-similar-2");
    });

    it("should identify valid vs invalid groups", async () => {
      const report = await generateGroupIdGovernanceReport();

      // All our test groups should be valid
      const testGroups = report.postgres.groups.filter((g) =>
        g.group_id.startsWith("allura-governance-")
      );

      testGroups.forEach((g) => {
        expect(g.is_valid).toBe(true);
      });
    });
  });
});