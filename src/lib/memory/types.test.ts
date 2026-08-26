import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTopicKey,
  CreateMemoryRequest,
  GetMemoryRequest,
  InsightStatus,
  MemoryNodeType,
  MemorySearchRequest,
  parseTopicKey,
  PROJECT_GROUP_IDS,
  RESERVED_GROUP_IDS,
  TOPIC_KEY_PREFIXES,
} from "./types";

describe("Memory Types", () => {
  describe("MemoryNodeType", () => {
    it("should include all expected node types", () => {
      const expectedTypes = [
        "Insight",
        "Agent",
        "Entity",
        "Decision",
        "Research",
        "ADR",
        "Pattern",
        "Workflow",
        "Project",
        "Epic",
        "Story",
        "Task",
      ];

      expectedTypes.forEach((type) => {
        expect(MemoryNodeType.safeParse(type).success).toBe(true);
      });
    });

    it("should reject invalid node types", () => {
      const result = MemoryNodeType.safeParse("InvalidType");
      expect(result.success).toBe(false);
    });
  });

  describe("InsightStatus", () => {
    it("should include all lifecycle states", () => {
      const expectedStatuses = [
        "draft",
        "testing",
        "active",
        "deprecated",
        "archived",
      ];

      expectedStatuses.forEach((status) => {
        expect(InsightStatus.safeParse(status).success).toBe(true);
      });
    });

    it("should reject invalid statuses", () => {
      const result = InsightStatus.safeParse("invalid");
      expect(result.success).toBe(false);
    });
  });

  describe("MemorySearchRequest", () => {
    it("should validate required fields", () => {
      const validRequest = {
        query: "test query",
        group_id: "test-group",
        workspace_id: "workspace-test",
        agent_id: "agent-test",
      };

      const result = MemorySearchRequest.safeParse(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe("test query");
        expect(result.data.group_id).toBe("test-group");
        expect(result.data.limit).toBe(10); // default
        expect(result.data.offset).toBe(0); // default
        expect(result.data.include_global).toBe(true); // default
      }
    });

    it("should apply default values", () => {
      const minimalRequest = {
        query: "test",
        group_id: "test",
        workspace_id: "workspace-test",
        agent_id: "agent-test",
      };

      const result = MemorySearchRequest.safeParse(minimalRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(0);
        expect(result.data.include_global).toBe(true);
      }
    });

    it("should validate confidence range", () => {
      const validRequest = {
        query: "test",
        group_id: "test",
        workspace_id: "workspace-test",
        agent_id: "agent-test",
        confidence_min: 0.7,
      };

      const result = MemorySearchRequest.safeParse(validRequest);
      expect(result.success).toBe(true);

      const invalidRequest = {
        query: "test",
        group_id: "test",
        workspace_id: "workspace-test",
        agent_id: "agent-test",
        confidence_min: 1.5, // Invalid: > 1
      };

      const invalidResult = MemorySearchRequest.safeParse(invalidRequest);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe("CreateMemoryRequest", () => {
    it("should validate required fields", () => {
      const validRequest = {
        type: "Insight" as const,
        topic_key: "test.insight.example",
        content: "This is the content",
        group_id: "test-group",
      };

      const result = CreateMemoryRequest.safeParse(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("Insight");
        expect(result.data.topic_key).toBe("test.insight.example");
        expect(result.data.content).toBe("This is the content");
        expect(result.data.group_id).toBe("test-group");
        expect(result.data.confidence).toBe(0.5); // default
        expect(result.data.status).toBe("draft"); // default
      }
    });

    it("should reject empty content", () => {
      const invalidRequest = {
        type: "Insight",
        topic_key: "test.insight.example",
        content: "", // Empty content
        group_id: "test-group",
      };

      const result = CreateMemoryRequest.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("should reject empty topic_key", () => {
      const invalidRequest = {
        type: "Insight",
        topic_key: "", // Empty topic_key
        content: "Some content",
        group_id: "test-group",
      };

      const result = CreateMemoryRequest.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe("GetMemoryRequest", () => {
    it("should validate required fields", () => {
      const validRequest = {
        topic_key: "test.insight.example",
        group_id: "test-group",
        workspace_id: "workspace-test",
        agent_id: "agent-test",
      };

      const result = GetMemoryRequest.safeParse(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topic_key).toBe("test.insight.example");
        expect(result.data.group_id).toBe("test-group");
        expect(result.data.include_history).toBe(false); // default
        expect(result.data.include_evidence).toBe(false); // default
      }
    });

    it("should allow optional version", () => {
      const requestWithVersion = {
        topic_key: "test.insight.example",
        group_id: "test-group",
        workspace_id: "workspace-test",
        agent_id: "agent-test",
        version: 2,
      };

      const result = GetMemoryRequest.safeParse(requestWithVersion);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(2);
      }
    });
  });
});

describe("Topic Key Utilities", () => {
  describe("buildTopicKey", () => {
    it("should build correct topic_key format", () => {
      const key = buildTopicKey("INSIGHT", "deepseek-cost-efficiency", "roninos");
      expect(key).toBe("roninos.INSIGHT.deepseek-cost-efficiency");
    });

    it("should work with all prefixes", () => {
      Object.keys(TOPIC_KEY_PREFIXES).forEach((prefix) => {
        const key = buildTopicKey(
          prefix as keyof typeof TOPIC_KEY_PREFIXES,
          "test-id",
          "test-group"
        );
        expect(key).toContain("test-group.");
        expect(key).toContain(".test-id");
      });
    });
  });

  describe("parseTopicKey", () => {
    it("should parse valid topic_key", () => {
      const result = parseTopicKey("roninos.insight.deepseek-cost-efficiency");
      expect(result).not.toBeNull();
      if (result) {
        expect(result.group_id).toBe("roninos");
        expect(result.prefix).toBe("insight");
        expect(result.identifier).toBe("deepseek-cost-efficiency");
      }
    });

    it("should handle multi-part identifiers", () => {
      const result = parseTopicKey("roninos.insight.deepseek.cost.efficiency");
      expect(result).not.toBeNull();
      if (result) {
        expect(result.group_id).toBe("roninos");
        expect(result.prefix).toBe("insight");
        expect(result.identifier).toBe("deepseek.cost.efficiency");
      }
    });

    it("should return null for invalid topic_key", () => {
      expect(parseTopicKey("invalid")).toBeNull();
      expect(parseTopicKey("two.parts")).toBeNull();
    });
  });
});

describe("Constants", () => {
  it("should have reserved group IDs", () => {
    expect(RESERVED_GROUP_IDS.GLOBAL).toBe("global");
    expect(RESERVED_GROUP_IDS.SYSTEM).toBe("system");
    expect(RESERVED_GROUP_IDS.TEST).toBe("test");
  });

  it("should have project group IDs", () => {
    expect(PROJECT_GROUP_IDS.RONINOS).toBe("roninos");
    expect(PROJECT_GROUP_IDS.FAITH_MEATS).toBe("faith-meats");
    expect(PROJECT_GROUP_IDS.MEMORY).toBe("memory");
  });

  it("should have topic key prefixes", () => {
    expect(TOPIC_KEY_PREFIXES.AGENT).toBe("agent");
    expect(TOPIC_KEY_PREFIXES.INSIGHT).toBe("insight");
    expect(TOPIC_KEY_PREFIXES.RESEARCH).toBe("research");
    expect(TOPIC_KEY_PREFIXES.ADR).toBe("adr");
    expect(TOPIC_KEY_PREFIXES.PATTERN).toBe("pattern");
    expect(TOPIC_KEY_PREFIXES.PROJECT).toBe("project");
    expect(TOPIC_KEY_PREFIXES.EPIC).toBe("epic");
    expect(TOPIC_KEY_PREFIXES.STORY).toBe("story");
    expect(TOPIC_KEY_PREFIXES.DECISION).toBe("decision");
  });
});