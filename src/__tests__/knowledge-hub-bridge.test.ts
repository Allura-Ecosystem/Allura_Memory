/**
 * Knowledge Hub Bridge Tests (Flow 2)
 *
 * Tests the Knowledge Hub bridge that propagates approved proposals
 * to the Notion Knowledge Hub with full trace IDs (PG event ID + Neo4j insight ID).
 *
 * Run with: bun vitest run src/__tests__/knowledge-hub-bridge.test.ts
 */

import { describe, expect, it, vi } from "vitest";
import {
  KNOWLEDGE_HUB_DATA_SOURCE_ID,
  KNOWLEDGE_HUB_DB_ID,
  type KnowledgeHubPromotionParams,
  KnowledgeHubPromotionParamsSchema,
  type NotionMCPClient,
  promoteToKnowledgeHub,
  queryKnowledgeHubByPgTraceId,
  queryKnowledgeHubBySourceId,
  validateInsightForPromotion,
} from "../lib/memory/knowledge-promotion";

// ── Mock Notion MCP Client ──────────────────────────────────────────────────

function createMockMCPClient(): NotionMCPClient {
  return {
    createPages: vi.fn(),
    updatePage: vi.fn(),
    search: vi.fn(),
    fetch: vi.fn(),
  };
}

// ── Test Data ────────────────────────────────────────────────────────────────

const MOCK_KNOWLEDGE_HUB_PARAMS: KnowledgeHubPromotionParams = {
  content: "All agents must enforce group_id on every database operation for tenant isolation.",
  topic: "group_id enforcement invariant",
  category: "Architecture",
  confidence: 0.95,
  source: "memory-orchestrator",
  group_id: "allura-roninmemory",
  postgres_trace_id: "evt_12345",
  neo4j_id: "ins_abc123def456",
  tier: "mainstream",
  approved_by: "brooks-architect",
  tags: ["architecture", "database"],
};

// ── Zod Validation Tests ────────────────────────────────────────────────────

describe("KnowledgeHubPromotionParamsSchema", () => {
  it("should validate correct params", () => {
    const result = KnowledgeHubPromotionParamsSchema.safeParse(MOCK_KNOWLEDGE_HUB_PARAMS);
    expect(result.success).toBe(true);
  });

  it("should reject missing content", () => {
    const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, content: "" };
    const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
    expect(result.success).toBe(false);
  });

  it("should reject missing topic", () => {
    const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, topic: "" };
    const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
    expect(result.success).toBe(false);
  });

  it("should reject invalid category", () => {
    const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, category: "InvalidCategory" };
    const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
    expect(result.success).toBe(false);
  });

  it("should reject confidence out of range", () => {
    const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, confidence: 1.5 };
    const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
    expect(result.success).toBe(false);
  });

  it("should reject missing group_id", () => {
    const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, group_id: "" };
    const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
    expect(result.success).toBe(false);
  });

  it("should reject missing postgres_trace_id", () => {
    const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, postgres_trace_id: "" };
    const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
    expect(result.success).toBe(false);
  });

  it("should reject missing neo4j_id", () => {
    const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, neo4j_id: "" };
    const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
    expect(result.success).toBe(false);
  });

  it("should reject invalid tier", () => {
    const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, tier: "invalid" };
    const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
    expect(result.success).toBe(false);
  });

  it("should accept valid tiers", () => {
    for (const tier of ["emerging", "adoption", "mainstream"] as const) {
      const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, tier };
      const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
      expect(result.success).toBe(true);
    }
  });

  it("should accept valid categories", () => {
    for (const category of ["Architecture", "Pattern", "Decision", "Research", "Bugfix", "Performance"] as const) {
      const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, category };
      const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
      expect(result.success).toBe(true);
    }
  });

  it("should accept optional tags", () => {
    const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, tags: ["architecture", "database"] };
    const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
    expect(result.success).toBe(true);
  });

  it("should accept optional approved_by", () => {
    const params = { ...MOCK_KNOWLEDGE_HUB_PARAMS, approved_by: "brooks-architect" };
    const result = KnowledgeHubPromotionParamsSchema.safeParse(params);
    expect(result.success).toBe(true);
  });
});

// ── Constants Tests ──────────────────────────────────────────────────────────

describe("Knowledge Hub Constants", () => {
  it("should have correct Knowledge Hub DB ID", () => {
    expect(KNOWLEDGE_HUB_DB_ID).toBe("083f40a9210445eaae513557bb1ae1ca");
  });

  it("should have correct Knowledge Hub data source ID", () => {
    expect(KNOWLEDGE_HUB_DATA_SOURCE_ID).toBe("9efeb76c-809b-440e-a76d-6a6e17bc8e7f");
  });

  it("should have correct Curator Proposals data source ID", () => {
    expect("42894678-aedb-4c90-9371-6494a9fe5270").toBe("42894678-aedb-4c90-9371-6494a9fe5270");
  });
});

// ── queryKnowledgeHubBySourceId Tests ───────────────────────────────────────

describe("queryKnowledgeHubBySourceId", () => {
  it("should return null when no results found", async () => {
    const mcpClient = createMockMCPClient();
    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await queryKnowledgeHubBySourceId("ins_nonexistent", mcpClient);

    expect(result).toBeNull();
    expect(mcpClient.search).toHaveBeenCalledWith({
      query: "ins_nonexistent",
      data_source_url: `collection://${KNOWLEDGE_HUB_DATA_SOURCE_ID}`,
      page_size: 5,
    });
  });

  it("should return entry when Neo4j ID matches", async () => {
    const mcpClient = createMockMCPClient();
    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        pageId: "page-existing-123",
        title: "group_id enforcement invariant",
        url: "https://notion.so/page-existing-123",
        properties: {
          "Neo4j ID": "ins_abc123def456",
          "PostgreSQL Trace ID": "evt_12345",
          Status: "Approved",
          group_id: "allura-roninmemory",
        },
      },
    ]);

    const result = await queryKnowledgeHubBySourceId("ins_abc123def456", mcpClient);

    expect(result).not.toBeNull();
    expect(result!.neo4j_id).toBe("ins_abc123def456");
    expect(result!.postgres_trace_id).toBe("evt_12345");
    expect(result!.notion_page_id).toBe("page-existing-123");
  });

  it("should return null when Neo4j ID does not match any result", async () => {
    const mcpClient = createMockMCPClient();
    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        pageId: "page-other-456",
        title: "Some other insight",
        url: "https://notion.so/page-other-456",
        properties: {
          "Neo4j ID": "ins_different_id",
          "PostgreSQL Trace ID": "evt_other",
          Status: "Approved",
          group_id: "allura-roninmemory",
        },
      },
    ]);

    const result = await queryKnowledgeHubBySourceId("ins_abc123def456", mcpClient);

    expect(result).toBeNull();
  });

  it("should return null on MCP search error (non-blocking)", async () => {
    const mcpClient = createMockMCPClient();
    (mcpClient.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Notion API error"));

    const result = await queryKnowledgeHubBySourceId("ins_abc123def456", mcpClient);

    expect(result).toBeNull();
  });
});

// ── queryKnowledgeHubByPgTraceId Tests ──────────────────────────────────────

describe("queryKnowledgeHubByPgTraceId", () => {
  it("should return entry when PG trace ID matches", async () => {
    const mcpClient = createMockMCPClient();
    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        pageId: "page-existing-123",
        title: "group_id enforcement invariant",
        url: "https://notion.so/page-existing-123",
        properties: {
          "Neo4j ID": "ins_abc123def456",
          "PostgreSQL Trace ID": "evt_12345",
          Status: "Approved",
          group_id: "allura-roninmemory",
        },
      },
    ]);

    const result = await queryKnowledgeHubByPgTraceId("evt_12345", mcpClient);

    expect(result).not.toBeNull();
    expect(result!.postgres_trace_id).toBe("evt_12345");
    expect(result!.neo4j_id).toBe("ins_abc123def456");
  });

  it("should return null when no results found", async () => {
    const mcpClient = createMockMCPClient();
    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await queryKnowledgeHubByPgTraceId("evt_nonexistent", mcpClient);

    expect(result).toBeNull();
  });

  it("should return null on MCP error (non-blocking)", async () => {
    const mcpClient = createMockMCPClient();
    (mcpClient.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    const result = await queryKnowledgeHubByPgTraceId("evt_12345", mcpClient);

    expect(result).toBeNull();
  });
});

// ── promoteToKnowledgeHub Tests ─────────────────────────────────────────────

describe("promoteToKnowledgeHub", () => {
  it("should create a new Knowledge Hub page with correct properties", async () => {
    const mcpClient = createMockMCPClient();

    // No existing entry found
    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mcpClient.createPages as ReturnType<typeof vi.fn>).mockResolvedValue([
      { pageId: "page-new-789", pageUrl: "https://notion.so/page-new-789" },
    ]);

    const result = await promoteToKnowledgeHub(MOCK_KNOWLEDGE_HUB_PARAMS, mcpClient);

    expect(result.success).toBe(true);
    expect(result.pageId).toBe("page-new-789");
    expect(result.pageUrl).toBe("https://notion.so/page-new-789");

    // Verify createPages was called with correct data source
    expect(mcpClient.createPages).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: { data_source_id: KNOWLEDGE_HUB_DATA_SOURCE_ID },
      })
    );

    // Verify properties include trace IDs
    const createCall = (mcpClient.createPages as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const properties = createCall.pages[0].properties;
    expect(properties["Neo4j ID"]).toBe("ins_abc123def456");
    expect(properties["PostgreSQL Trace ID"]).toBe("evt_12345");
    expect(properties["group_id"]).toBe("allura-roninmemory");
    expect(properties["Status"]).toBe("Approved");
    expect(properties["Category"]).toBe("Architecture");
    expect(properties["Confidence"]).toBe(0.95);
  });

  it("should update existing entry when Neo4j ID already exists (idempotency)", async () => {
    const mcpClient = createMockMCPClient();

    // Existing entry found
    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        pageId: "page-existing-123",
        title: "group_id enforcement invariant",
        url: "https://notion.so/page-existing-123",
        properties: {
          "Neo4j ID": "ins_abc123def456",
          "PostgreSQL Trace ID": "evt_12345",
          Status: "Approved",
          group_id: "allura-roninmemory",
        },
      },
    ]);
    (mcpClient.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const result = await promoteToKnowledgeHub(MOCK_KNOWLEDGE_HUB_PARAMS, mcpClient);

    expect(result.success).toBe(true);
    expect(result.pageId).toBe("page-existing-123");

    // Verify updatePage was called (not createPages)
    expect(mcpClient.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({
        page_id: "page-existing-123",
        command: "update_properties",
      })
    );
    expect(mcpClient.createPages).not.toHaveBeenCalled();
  });

  it("should return validation error for invalid params", async () => {
    const mcpClient = createMockMCPClient();

    const invalidParams = { ...MOCK_KNOWLEDGE_HUB_PARAMS, content: "" };
    const result = await promoteToKnowledgeHub(invalidParams as KnowledgeHubPromotionParams, mcpClient);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Content is required");
  });

  it("should return error when MCP createPages fails (non-blocking)", async () => {
    const mcpClient = createMockMCPClient();

    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mcpClient.createPages as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Notion API rate limit"));

    const result = await promoteToKnowledgeHub(MOCK_KNOWLEDGE_HUB_PARAMS, mcpClient);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Notion API rate limit");
  });

  it("should return error when MCP createPages returns empty results", async () => {
    const mcpClient = createMockMCPClient();

    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mcpClient.createPages as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await promoteToKnowledgeHub(MOCK_KNOWLEDGE_HUB_PARAMS, mcpClient);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No page created");
  });

  it("should map tier to correct Source value", async () => {
    const mcpClient = createMockMCPClient();

    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mcpClient.createPages as ReturnType<typeof vi.fn>).mockResolvedValue([
      { pageId: "page-new-tier", pageUrl: "https://notion.so/page-new-tier" },
    ]);

    // Test emerging tier
    const emergingParams = { ...MOCK_KNOWLEDGE_HUB_PARAMS, tier: "emerging" as const };
    await promoteToKnowledgeHub(emergingParams, mcpClient);

    const createCall = (mcpClient.createPages as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.pages[0].properties["Source"]).toBe("memory-scout");

    // Reset and test adoption tier
    vi.clearAllMocks();
    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mcpClient.createPages as ReturnType<typeof vi.fn>).mockResolvedValue([
      { pageId: "page-new-2", pageUrl: "https://notion.so/page-new-2" },
    ]);

    const adoptionParams = { ...MOCK_KNOWLEDGE_HUB_PARAMS, tier: "adoption" as const };
    await promoteToKnowledgeHub(adoptionParams, mcpClient);

    const createCall2 = (mcpClient.createPages as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall2.pages[0].properties["Source"]).toBe("memory-architect");
  });

  it("should include tags in properties when provided", async () => {
    const mcpClient = createMockMCPClient();

    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mcpClient.createPages as ReturnType<typeof vi.fn>).mockResolvedValue([
      { pageId: "page-tags", pageUrl: "https://notion.so/page-tags" },
    ]);

    const paramsWithTags = { ...MOCK_KNOWLEDGE_HUB_PARAMS, tags: ["architecture", "database"] };
    await promoteToKnowledgeHub(paramsWithTags, mcpClient);

    const createCall = (mcpClient.createPages as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.pages[0].properties["Tags"]).toBe(JSON.stringify(["architecture", "database"]));
  });

  it("should include content in page body", async () => {
    const mcpClient = createMockMCPClient();

    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mcpClient.createPages as ReturnType<typeof vi.fn>).mockResolvedValue([
      { pageId: "page-content", pageUrl: "https://notion.so/page-content" },
    ]);

    await promoteToKnowledgeHub(MOCK_KNOWLEDGE_HUB_PARAMS, mcpClient);

    const createCall = (mcpClient.createPages as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const content = createCall.pages[0].content;
    expect(content).toContain("ins_abc123def456");
    expect(content).toContain("evt_12345");
    expect(content).toContain("allura-roninmemory");
    expect(content).toContain("mainstream");
  });
});

// ── validateInsightForPromotion Tests ────────────────────────────────────────

describe("validateInsightForPromotion", () => {
  const validInsight = {
    id: "ins_test",
    proposal_id: "prop_test",
    topic: "Test topic",
    category: "Architecture" as const,
    content: "Test content",
    source: "test-agent",
    confidence: 0.9,
    group_id: "allura-test",
    workspace_id: "workspace-test",
    notion_page_id: "page_test",
    postgres_trace_id: "evt_test",
  };

  it("should validate a correct insight", () => {
    expect(validateInsightForPromotion(validInsight)).toBe(true);
  });

  it("should reject missing id", () => {
    const insight = { ...validInsight, id: "" };
    expect(() => validateInsightForPromotion(insight)).toThrow("Insight ID is required");
  });

  it("should reject missing proposal_id", () => {
    const insight = { ...validInsight, proposal_id: "" };
    expect(() => validateInsightForPromotion(insight)).toThrow("Proposal ID is required");
  });

  it("should reject missing group_id", () => {
    const insight = { ...validInsight, group_id: "" };
    expect(() => validateInsightForPromotion(insight)).toThrow("group_id is required");
  });

  it("should reject missing workspace_id", () => {
    const insight = { ...validInsight, workspace_id: "" };
    expect(() => validateInsightForPromotion(insight)).toThrow("Workspace ID is required");
  });

  it("should reject missing content", () => {
    const insight = { ...validInsight, content: "" };
    expect(() => validateInsightForPromotion(insight)).toThrow("Content is required");
  });

  it("should reject confidence out of range (negative)", () => {
    const insight = { ...validInsight, confidence: -0.1 };
    expect(() => validateInsightForPromotion(insight)).toThrow("Confidence must be between 0 and 1");
  });

  it("should reject confidence out of range (> 1)", () => {
    const insight = { ...validInsight, confidence: 1.5 };
    expect(() => validateInsightForPromotion(insight)).toThrow("Confidence must be between 0 and 1");
  });

  it("should reject missing notion_page_id", () => {
    const insight = { ...validInsight, notion_page_id: "" };
    expect(() => validateInsightForPromotion(insight)).toThrow("Notion page ID is required");
  });

  it("should reject missing postgres_trace_id", () => {
    const insight = { ...validInsight, postgres_trace_id: "" };
    expect(() => validateInsightForPromotion(insight)).toThrow("PostgreSQL trace ID is required");
  });
});

// ── Trace ID Propagation Tests ──────────────────────────────────────────────

describe("Trace ID Propagation", () => {
  it("should include both PG trace ID and Neo4j ID in Knowledge Hub properties", async () => {
    const mcpClient = createMockMCPClient();

    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mcpClient.createPages as ReturnType<typeof vi.fn>).mockResolvedValue([
      { pageId: "page-trace-test", pageUrl: "https://notion.so/page-trace-test" },
    ]);

    const params: KnowledgeHubPromotionParams = {
      content: "Test content for trace ID propagation",
      topic: "Trace ID Propagation Test",
      category: "Decision",
      confidence: 0.85,
      source: "memory-orchestrator",
      group_id: "allura-roninmemory",
      postgres_trace_id: "evt_trace_pg_001",
      neo4j_id: "ins_trace_neo4j_001",
      tier: "adoption",
      approved_by: "woz-builder",
    };

    const result = await promoteToKnowledgeHub(params, mcpClient);

    expect(result.success).toBe(true);

    const createCall = (mcpClient.createPages as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const properties = createCall.pages[0].properties;

    // Verify both trace IDs are present
    expect(properties["PostgreSQL Trace ID"]).toBe("evt_trace_pg_001");
    expect(properties["Neo4j ID"]).toBe("ins_trace_neo4j_001");
    expect(properties["group_id"]).toBe("allura-roninmemory");

    // Verify content includes both trace IDs
    const content = createCall.pages[0].content;
    expect(content).toContain("ins_trace_neo4j_001");
    expect(content).toContain("evt_trace_pg_001");
  });

  it("should update existing Knowledge Hub entry with new trace IDs on re-sync", async () => {
    const mcpClient = createMockMCPClient();

    // Existing entry found with the SAME Neo4j ID (idempotency check matches)
    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        pageId: "page-existing-trace",
        title: "Trace ID Update Test",
        url: "https://notion.so/page-existing-trace",
        properties: {
          "Neo4j ID": "ins_new_neo4j_id",
          "PostgreSQL Trace ID": "evt_old_pg_id",
          Status: "Draft",
          group_id: "allura-roninmemory",
        },
      },
    ]);
    (mcpClient.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const params: KnowledgeHubPromotionParams = {
      content: "Updated content with new trace IDs",
      topic: "Trace ID Update Test",
      category: "Pattern",
      confidence: 0.92,
      source: "memory-architect",
      group_id: "allura-roninmemory",
      postgres_trace_id: "evt_new_pg_id",
      neo4j_id: "ins_new_neo4j_id",
      tier: "adoption",
    };

    const result = await promoteToKnowledgeHub(params, mcpClient);

    expect(result.success).toBe(true);
    expect(result.pageId).toBe("page-existing-trace");

    // Verify updatePage was called with new trace IDs
    expect(mcpClient.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({
        page_id: "page-existing-trace",
        command: "update_properties",
        properties: expect.objectContaining({
          "Neo4j ID": "ins_new_neo4j_id",
          "PostgreSQL Trace ID": "evt_new_pg_id",
          Status: "Approved",
        }),
      })
    );
  });
});

// ── Error Handling Tests ─────────────────────────────────────────────────────

describe("Error Handling", () => {
  it("should handle search errors gracefully in queryKnowledgeHubBySourceId", async () => {
    const mcpClient = createMockMCPClient();
    (mcpClient.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network timeout"));

    const result = await queryKnowledgeHubBySourceId("ins_test", mcpClient);

    // Should return null, not throw
    expect(result).toBeNull();
  });

  it("should handle search errors gracefully in queryKnowledgeHubByPgTraceId", async () => {
    const mcpClient = createMockMCPClient();
    (mcpClient.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Rate limited"));

    const result = await queryKnowledgeHubByPgTraceId("evt_test", mcpClient);

    // Should return null, not throw
    expect(result).toBeNull();
  });

  it("should handle update errors gracefully in promoteToKnowledgeHub (idempotency path)", async () => {
    const mcpClient = createMockMCPClient();

    // Existing entry found
    (mcpClient.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        pageId: "page-existing-123",
        title: "Test",
        url: "https://notion.so/page-existing-123",
        properties: {
          "Neo4j ID": "ins_abc123def456",
          "PostgreSQL Trace ID": "evt_12345",
          Status: "Approved",
          group_id: "allura-roninmemory",
        },
      },
    ]);
    (mcpClient.updatePage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Update failed"));

    const result = await promoteToKnowledgeHub(MOCK_KNOWLEDGE_HUB_PARAMS, mcpClient);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Update failed");
  });
});
