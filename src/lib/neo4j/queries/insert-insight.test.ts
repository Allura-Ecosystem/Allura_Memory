import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createInsight,
  createInsightVersion,
  deprecateInsight,
  InsightConflictError,
  type InsightInsert,
  InsightValidationError,
  revertInsightVersion,
} from "./insert-insight";
import { closeDriver, getDriver } from "../connection";
import { type ManagedTransaction, readTransaction, writeTransaction } from "../connection";

/**
 * Test suite for Neo4j insight insertion and versioning
 */
describe("insert-insight", () => {
  const testGroupId = "test-insight-group";
  const otherGroupId = "other-insight-group";

  // Track created insights for cleanup
  const createdInsightIds: string[] = [];

  beforeAll(async () => {
    // Ensure environment is configured for tests
    process.env.NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687";
    process.env.NEO4J_USER = process.env.NEO4J_USER || "neo4j";
    process.env.NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "KaminaTHC*";
    process.env.NEO4J_DATABASE = process.env.NEO4J_DATABASE || "neo4j";

    // Clean up any previous test data
    const driver = getDriver();
    const session = driver.session();
    try {
      await session.run(
        "MATCH (i:Insight) WHERE i.group_id IN $groups DETACH DELETE i",
        { groups: [testGroupId, otherGroupId] }
      );
      await session.run(
        "MATCH (h:InsightHead) WHERE h.group_id IN $groups DETACH DELETE h",
        { groups: [testGroupId, otherGroupId] }
      );
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    // Clean up test data
    const driver = getDriver();
    const session = driver.session();
    try {
      await session.run(
        "MATCH (i:Insight) WHERE i.group_id IN $groups DETACH DELETE i",
        { groups: [testGroupId, otherGroupId] }
      );
      await session.run(
        "MATCH (h:InsightHead) WHERE h.group_id IN $groups DETACH DELETE h",
        { groups: [testGroupId, otherGroupId] }
      );
    } finally {
      await session.close();
    }

    await closeDriver();
  });

  beforeEach(() => {
    createdInsightIds.length = 0;
  });

  // =========================================================================
  // Validation Tests
  // =========================================================================

  describe("validation", () => {
    it("should require insight_id", async () => {
      const insight: InsightInsert = {
        insight_id: "",
        group_id: testGroupId,
        content: "Test insight",
        confidence: 0.9,
        topic_key: "test.insight",
      };

      await expect(createInsight(insight)).rejects.toThrow(InsightValidationError);
      await expect(createInsight(insight)).rejects.toThrow("insight_id is required");
    });

    it("should require group_id", async () => {
      const insight: InsightInsert = {
        insight_id: "test-insight-1",
        group_id: "",
        content: "Test insight",
        confidence: 0.9,
        topic_key: "test.insight",
      };

      await expect(createInsight(insight)).rejects.toThrow("group_id is required");
    });

    it("should require content", async () => {
      const insight: InsightInsert = {
        insight_id: "test-insight-2",
        group_id: testGroupId,
        content: "",
        confidence: 0.9,
        topic_key: "test.insight",
      };

      await expect(createInsight(insight)).rejects.toThrow("content is required");
    });

    it("should require confidence between 0 and 1", async () => {
      const insight1: InsightInsert = {
        insight_id: "test-insight-3",
        group_id: testGroupId,
        content: "Test",
        confidence: -0.1,
        topic_key: "test.insight",
      };

      await expect(createInsight(insight1)).rejects.toThrow(
        "confidence must be between 0 and 1"
      );

      const insight2: InsightInsert = {
        insight_id: "test-insight-4",
        group_id: testGroupId,
        content: "Test",
        confidence: 1.1,
        topic_key: "test.insight",
      };

      await expect(createInsight(insight2)).rejects.toThrow(
        "confidence must be between 0 and 1"
      );
    });

    it("should reject creating duplicate insight_id", async () => {
      const insight: InsightInsert = {
        insight_id: "duplicate-test",
        group_id: testGroupId,
        content: "First insight",
        confidence: 0.9,
        topic_key: "test.insight",
      };

      const result1 = await createInsight(insight);
      createdInsightIds.push(result1.id);

      // Second create with same insight_id should fail
      await expect(createInsight(insight)).rejects.toThrow(InsightConflictError);
    });
  });

  // =========================================================================
  // Create Insight Tests
  // =========================================================================

  describe("createInsight", () => {
    it("should create a new insight with version 1", async () => {
      const insight: InsightInsert = {
        insight_id: "new-insight-1",
        group_id: testGroupId,
        content: "This is a test insight",
        confidence: 0.85,
        topic_key: "test.insight",
        source_type: "manual",
        created_by: "test-agent",
      };

      const result = await createInsight(insight);
      createdInsightIds.push(result.id);

      expect(result.insight_id).toBe("new-insight-1");
      expect(result.version).toBe(1);
      expect(result.content).toBe("This is a test insight");
      expect(result.confidence).toBe(0.85);
      expect(result.group_id).toBe(testGroupId);
      expect(result.status).toBe("active");
      expect(result.created_by).toBe("test-agent");
    });

    it("should create InsightHead node with correct metadata", async () => {
      const insight: InsightInsert = {
        insight_id: "head-test-1",
        group_id: testGroupId,
        content: "Test for head node",
        confidence: 0.75,
        topic_key: "test.insight",
      };

      await createInsight(insight);

      // Verify InsightHead was created
      const driver = getDriver();
      const session = driver.session();
      try {
        const result = await session.run(
          "MATCH (h:InsightHead {insight_id: $insight_id}) RETURN h",
          { insight_id: "head-test-1" }
        );

        expect(result.records.length).toBe(1);
        const head = result.records[0].get("h").properties;
        expect(head.group_id).toBe(testGroupId);
        expect(head.current_version.toNumber()).toBe(1);
      } finally {
        await session.close();
      }
    });

    it("should store metadata as JSON", async () => {
      const insight: InsightInsert = {
        insight_id: "metadata-test-1",
        group_id: testGroupId,
        content: "Test with metadata",
        confidence: 0.8,
        topic_key: "test.insight",
        metadata: { key: "value", nested: { foo: "bar" } },
      };

      const result = await createInsight(insight);
      createdInsightIds.push(result.id);

      expect(result.metadata).toEqual({ key: "value", nested: { foo: "bar" } });
    });

    it("should store metadata on disk as a JSON string (Neo4j 5.x constraint)", async () => {
      // Lock-in test for the 2026-06-12 carry-forward: Neo4j 5.26 community
      // REJECTS nested Cypher maps as node property values via
      //   CREATE (n:Label { prop: $map })
      // It only accepts primitives and arrays of primitives. Verified
      // directly: Try 1 (empty map) → FAIL, Try 2 (filled map) → FAIL,
      // Try 3 (string) → OK.
      //
      // The deliberate adaptation: JSON.stringify on write, JSON.parse
      // on read. This is the right contract for 5.x. The previous "fix"
      // attempt to bind metadata as a real Cypher map was a regression
      // that broke `createInsight` on every call. The real bug was that
      // no test ever queried the on-disk shape — the existing
      // `should store metadata as JSON` test only checked the round-trip
      // through `convertMetadata`, which masked the constraint.
      //
      // This test makes the on-disk contract explicit so a future reader
      // can't accidentally "simplify" the JSON.stringify away and break
      // the world.
      const insight: InsightInsert = {
        insight_id: "metadata-disk-shape-1",
        group_id: testGroupId,
        content: "Test disk shape",
        confidence: 0.8,
        topic_key: "test.insight",
        metadata: {
          proposal_id: "abc-123",
          tier: "mainstream",
          trace_ref: "86559",
          nested: { foo: "bar" },
        },
      };

      const result = await createInsight(insight);
      createdInsightIds.push(result.id);

      // The returned value must deep-equal the input (round-trip works).
      expect(result.metadata).toEqual(insight.metadata);

      // The on-disk shape must be a STRING. If a future change makes this
      // an object, this assertion will catch it and force the developer
      // to either fix Neo4j or document why they are violating the 5.x
      // contract. (Neo4j 5.x removed the `typeof()` Cypher function, so
      // we check the value type at the JS layer using what the driver
      // hands back: a string for STRING values, an object for MAP values.)
      const driver = getDriver();
      const session = driver.session();
      try {
        const r = await session.run(
          "MATCH (i:Insight {insight_id: $id}) RETURN i.metadata AS m",
          { id: result.insight_id }
        );
        expect(r.records.length).toBe(1);
        const m = r.records[0].get("m");
        // STRING round-trip: the driver returns a JS string. MAP would
        // return a JS object — assert we got a string.
        expect(typeof m).toBe("string");
        // The string must be a valid JSON of the original metadata.
        expect(JSON.parse(m as string)).toEqual(insight.metadata);
      } finally {
        await session.close();
      }
    });

    it("should round-trip nested metadata through createInsightVersion", async () => {
      // createInsightVersion had the same JSON.stringify contract; this
      // test pins it for the version writer.
      const base: InsightInsert = {
        insight_id: "metadata-version-shape-1",
        group_id: testGroupId,
        content: "v1",
        confidence: 0.7,
        topic_key: "test.insight",
        metadata: { proposal_id: "v1-prop", tier: "mainstream" },
      };
      const v1 = await createInsight(base);
      createdInsightIds.push(v1.id);

      const v2 = await createInsightVersion(
        "metadata-version-shape-1",
        "v2",
        0.8,
        testGroupId,
        { proposal_id: "v2-prop", tier: "adoption", extra: "field" }
      );

      // Round-trip via the returned value.
      expect(v2.metadata).toEqual({
        proposal_id: "v2-prop",
        tier: "adoption",
        extra: "field",
      });

      // On-disk shape: string.
      const driver = getDriver();
      const session = driver.session();
      try {
        const r = await session.run(
          "MATCH (i:Insight {id: $id}) RETURN i.metadata AS m",
          { id: v2.id }
        );
        const m = r.records[0].get("m");
        expect(typeof m).toBe("string");
        expect(JSON.parse(m as string)).toEqual(v2.metadata);
      } finally {
        await session.close();
      }
    });
  });

  // =========================================================================
  // Version Tests
  // =========================================================================

  describe("createInsightVersion", () => {
    it("should create a new version with incremented version number", async () => {
      // Create initial insight
      const insight: InsightInsert = {
        insight_id: "version-test-1",
        group_id: testGroupId,
        content: "Version 1",
        confidence: 0.7,
        topic_key: "test.insight",
      };

      await createInsight(insight);

      // Create version 2
      const result = await createInsightVersion(
        "version-test-1",
        "Version 2",
        0.9,
        testGroupId
      );

      expect(result.version).toBe(2);
      expect(result.content).toBe("Version 2");
      expect(result.confidence).toBe(0.9);
    });

    it("should supersede previous version", async () => {
      const insight: InsightInsert = {
        insight_id: "supersede-test-1",
        group_id: testGroupId,
        content: "Version 1",
        confidence: 0.7,
        topic_key: "test.insight",
      };

      const v1 = await createInsight(insight);

      const v2 = await createInsightVersion(
        "supersede-test-1",
        "Version 2",
        0.9,
        testGroupId
      );

      // Verify v1 status changed to 'superseded'
      const driver = getDriver();
      const session = driver.session();
      let status: string | undefined;
      try {
        const result = await session.run(
          "MATCH (i:Insight {id: $id}) RETURN i.status as status",
          { id: v1.id }
        );
        status = result.records[0].get("status") as string;
      } finally {
        await session.close();
      }
      expect(status).toBe("superseded");

      // Verify v2 has SUPERSEDES relationship
      const session2 = driver.session();
      try {
        const result = await session2.run(
          "MATCH (v2:Insight {id: $v2id})-[s:SUPERSEDES]->(v1:Insight {id: $v1id}) RETURN s",
          { v2id: v2.id, v1id: v1.id }
        );
        expect(result.records.length).toBe(1);
      } finally {
        await session2.close();
      }
    });

    it("should throw for non-existent insight_id", async () => {
      await expect(
        createInsightVersion("non-existent", "content", 0.8, testGroupId)
      ).rejects.toThrow(InsightValidationError);
    });
  });

  // =========================================================================
  // Deprecation Tests
  // =========================================================================

  describe("deprecateInsight", () => {
    it("should mark insight as deprecated", async () => {
      const insight: InsightInsert = {
        insight_id: "deprecate-test-1",
        group_id: testGroupId,
        content: "To be deprecated",
        confidence: 0.8,
        topic_key: "test.insight",
      };

      await createInsight(insight);

      const result = await deprecateInsight(
        "deprecate-test-1",
        testGroupId,
        "No longer valid"
      );

      expect(result.status).toBe("deprecated");
    });

    it("should throw for non-existent insight", async () => {
      await expect(
        deprecateInsight("non-existent", testGroupId)
      ).rejects.toThrow(InsightValidationError);
    });
  });

  // =========================================================================
  // Revert Tests
  // =========================================================================

  describe("revertInsightVersion", () => {
    it("should create new version copying content from target version", async () => {
      const insight: InsightInsert = {
        insight_id: "revert-test-1",
        group_id: testGroupId,
        content: "Version 1",
        confidence: 0.7,
        topic_key: "test.insight",
      };

      await createInsight(insight);

      // Create version 2
      await createInsightVersion("revert-test-1", "Version 2", 0.8, testGroupId);

      // Create version 3
      await createInsightVersion("revert-test-1", "Version 3", 0.9, testGroupId);

      // Revert to version 1
      const result = await revertInsightVersion("revert-test-1", testGroupId, 1);

      expect(result.version).toBe(4);
      expect(result.content).toBe("Version 1");
      expect(result.confidence).toBe(0.7);
    });

    it("should throw for non-existent version", async () => {
      await expect(
        revertInsightVersion("non-existent", testGroupId, 1)
      ).rejects.toThrow(InsightValidationError);
    });
  });

  // =========================================================================
  // Tenant Isolation Tests
  // =========================================================================

  describe("tenant isolation", () => {
    it("should isolate insights by group_id", async () => {
      const insight1: InsightInsert = {
        insight_id: "isolation-test-1",
        group_id: testGroupId,
        content: "Group 1 insight",
        confidence: 0.9,
        topic_key: "test.insight",
      };

      const insight2: InsightInsert = {
        insight_id: "isolation-test-1",
        group_id: otherGroupId,
        content: "Group 2 insight",
        confidence: 0.8,
        topic_key: "test.insight",
      };

      // Same insight_id but different groups should both succeed
      const result1 = await createInsight(insight1);
      const result2 = await createInsight(insight2);

      expect(result1.group_id).toBe(testGroupId);
      expect(result2.group_id).toBe(otherGroupId);
    });

    it("should not allow cross-tenant version creation", async () => {
      const insight: InsightInsert = {
        insight_id: "cross-tenant-test",
        group_id: testGroupId,
        content: "Original",
        confidence: 0.9,
        topic_key: "test.insight",
      };

      await createInsight(insight);

      // Try to create version with different group_id
      await expect(
        createInsightVersion("cross-tenant-test", "New version", 0.9, otherGroupId)
      ).rejects.toThrow(InsightValidationError);
    });
  });
});