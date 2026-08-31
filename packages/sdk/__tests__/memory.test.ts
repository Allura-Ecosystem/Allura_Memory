/**
 * @allura/sdk — Memory operations tests
 *
 * Tests for the 5 canonical memory operations:
 * add, search, get, list, delete
 *
 * Uses mocked fetch to verify request construction,
 * parameter validation, and response parsing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlluraClient } from "../src/client.js";
import { NotFoundError, ValidationError } from "../src/errors.js";
import { MemoryOperations } from "../src/memory.js";
import { validateGroupId } from "../src/utils.js";

// ── Test Fixtures ────────────────────────────────────────────────────────────

const MOCK_ADD_RESPONSE = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  stored: "episodic" as const,
  score: 0.72,
  created_at: "2026-04-12T10:00:00Z",
};

const MOCK_SEARCH_RESPONSE = {
  results: [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      content: "Test memory content",
      score: 0.95,
      source: "semantic" as const,
      provenance: "conversation" as const,
      created_at: "2026-04-12T10:00:00Z",
    },
  ],
  count: 1,
  latency_ms: 42,
};

const MOCK_GET_RESPONSE = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  content: "Test memory content",
  score: 0.95,
  source: "semantic" as const,
  provenance: "conversation" as const,
  user_id: "user-123",
  actor: null,
  creator: "author-123",
  approver: "curator-123",
  group_id: "allura-test",
  created_at: "2026-04-12T10:00:00Z",
  hash: "hash-1",
  previous_hash: "hash-0",
};

const MOCK_LIST_RESPONSE = {
  memories: [MOCK_GET_RESPONSE],
  total: 1,
  has_more: false,
};

const MOCK_DELETE_RESPONSE = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  deleted: true,
  deleted_at: "2026-04-12T10:00:00Z",
  recovery_days: 30,
};

function createMockFetch(
  response: unknown,
  status: number = 200
): typeof globalThis.fetch {
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    const request = init?.body ? JSON.parse(String(init.body)) as { method?: string } : {};
    if (request.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: "init", result: {} }), {
        status: 200,
        headers: { "content-type": "application/json", "mcp-session-id": "memory-test-session" },
      });
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
    };
  }) as unknown as typeof globalThis.fetch;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("MemoryOperations", () => {
  let client: AlluraClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = createMockFetch(MOCK_ADD_RESPONSE);
    client = new AlluraClient({
      baseUrl: "http://localhost:3201",
      authToken: "test-token",
      fetch: mockFetch,
      retries: 1,
    });
  });

  describe("memory.add", () => {
    it("should add a memory successfully", async () => {
      mockFetch = createMockFetch(MOCK_ADD_RESPONSE);
      client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        authToken: "test-token",
        fetch: mockFetch,
        retries: 1,
      });

      const result = await client.memory.add({
        group_id: "allura-test",
        user_id: "user-123",
        content: "Remember this important fact",
      });

      expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.stored).toBe("episodic");
      expect(result.score).toBe(0.72);
    });

    it("should validate group_id format", async () => {
      await expect(
        client.memory.add({
          group_id: "invalid-group-id",
          user_id: "user-123",
          content: "Test",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject empty content", async () => {
      await expect(
        client.memory.add({
          group_id: "allura-test",
          user_id: "user-123",
          content: "",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject whitespace-only content", async () => {
      await expect(
        client.memory.add({
          group_id: "allura-test",
          user_id: "user-123",
          content: "   ",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject invalid threshold values", async () => {
      await expect(
        client.memory.add({
          group_id: "allura-test",
          user_id: "user-123",
          content: "Test",
          threshold: 1.5,
        })
      ).rejects.toThrow(ValidationError);
    });

  it("should include metadata in the request", async () => {
    mockFetch = createMockFetch(MOCK_ADD_RESPONSE);
    client = new AlluraClient({
      baseUrl: "http://localhost:3201",
      authToken: "test-token",
      fetch: mockFetch,
      retries: 1,
    });

    await client.memory.add({
      group_id: "allura-test",
      user_id: "user-123",
      content: "Test memory",
      metadata: {
        source: "conversation",
        conversation_id: "conv-456",
        agent_id: "agent-789",
      },
    });

    // Verify the request body includes metadata in MCP tool-call arguments
    const callArgs = mockFetch.mock.calls[1];
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("memory_add");
    expect(body.params.arguments.metadata).toBeDefined();
    expect(body.params.arguments.metadata.source).toBe("conversation");
  });
  });

  describe("memory.search", () => {
    it("should search memories successfully", async () => {
      mockFetch = createMockFetch(MOCK_SEARCH_RESPONSE);
      client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        authToken: "test-token",
        fetch: mockFetch,
        retries: 1,
      });

      const result = await client.memory.search({
        query: "important fact",
        group_id: "allura-test",
      });

      expect(result.results).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.latency_ms).toBe(42);
    });

    it("should validate group_id format", async () => {
      await expect(
        client.memory.search({
          query: "test",
          group_id: "invalid",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject empty query", async () => {
      await expect(
        client.memory.search({
          query: "",
          group_id: "allura-test",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject invalid limit values", async () => {
      await expect(
        client.memory.search({
          query: "test",
          group_id: "allura-test",
          limit: 0,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        client.memory.search({
          query: "test",
          group_id: "allura-test",
          limit: 101,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("memory.get", () => {
    it("should get a memory by ID", async () => {
      mockFetch = createMockFetch(MOCK_GET_RESPONSE);
      client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        authToken: "test-token",
        fetch: mockFetch,
        retries: 1,
      });

      const result = await client.memory.get({
        id: "550e8400-e29b-41d4-a716-446655440000",
        group_id: "allura-test",
      });

      expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.content).toBe("Test memory content");
      expect(result.actor).toBeNull();
      expect(result.creator).toBe("author-123");
      expect(result.approver).toBe("curator-123");
      expect(result.hash).toBe("hash-1");
      expect(result.previous_hash).toBe("hash-0");
    });

    it("should validate group_id format", async () => {
      await expect(
        client.memory.get({
          id: "550e8400-e29b-41d4-a716-446655440000",
          group_id: "invalid",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject empty id", async () => {
      await expect(
        client.memory.get({
          id: "",
          group_id: "allura-test",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("memory.list", () => {
    it("should list memories successfully", async () => {
      mockFetch = createMockFetch(MOCK_LIST_RESPONSE);
      client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        authToken: "test-token",
        fetch: mockFetch,
        retries: 1,
      });

      const result = await client.memory.list({
        group_id: "allura-test",
        user_id: "user-123",
      });

      expect(result.memories).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.has_more).toBe(false);
    });

    it("should validate group_id format", async () => {
      await expect(
        client.memory.list({
          group_id: "invalid",
          user_id: "user-123",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject invalid limit values", async () => {
      await expect(
        client.memory.list({
          group_id: "allura-test",
          user_id: "user-123",
          limit: 0,
        })
      ).rejects.toThrow(ValidationError);

      await expect(
        client.memory.list({
          group_id: "allura-test",
          user_id: "user-123",
          limit: 1001,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject negative offset", async () => {
      await expect(
        client.memory.list({
          group_id: "allura-test",
          user_id: "user-123",
          offset: -1,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("memory.delete", () => {
    it("should delete a memory successfully", async () => {
      mockFetch = createMockFetch(MOCK_DELETE_RESPONSE);
      client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        authToken: "test-token",
        fetch: mockFetch,
        retries: 1,
      });

      const result = await client.memory.delete({
        id: "550e8400-e29b-41d4-a716-446655440000",
        group_id: "allura-test",
        user_id: "user-123",
      });

      expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.deleted).toBe(true);
      expect(result.recovery_days).toBe(30);
    });

    it("should validate group_id format", async () => {
      await expect(
        client.memory.delete({
          id: "550e8400-e29b-41d4-a716-446655440000",
          group_id: "invalid",
          user_id: "user-123",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject empty id", async () => {
      await expect(
        client.memory.delete({
          id: "",
          group_id: "allura-test",
          user_id: "user-123",
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});

// ── group_id Validation Tests ───────────────────────────────────────────────

describe("validateGroupId", () => {
  it("should accept valid group_ids", () => {
    expect(() => validateGroupId("allura-test")).not.toThrow();
    expect(() => validateGroupId("allura-my-tenant")).not.toThrow();
    expect(() => validateGroupId("allura-123")).not.toThrow();
    expect(() => validateGroupId("allura-a1b2c3")).not.toThrow();
  });

  it("should reject group_ids without allura- prefix", () => {
    expect(() => validateGroupId("test")).toThrow(ValidationError);
    expect(() => validateGroupId("roninclaw-test")).toThrow(ValidationError);
    expect(() => validateGroupId("my-tenant")).toThrow(ValidationError);
  });

  it("should reject group_ids with uppercase letters", () => {
    expect(() => validateGroupId("allura-Test")).toThrow(ValidationError);
    expect(() => validateGroupId("allura-MY-TENANT")).toThrow(ValidationError);
  });

  it("should reject group_ids that are too short", () => {
    expect(() => validateGroupId("allura-")).toThrow(ValidationError);
  });

  it("should reject group_ids that are too long", () => {
    // Max length is 64 characters. "allura-" is 7 chars, so max suffix is 57 chars.
    const validId = `allura-${"a".repeat(57)}`;
    expect(() => validateGroupId(validId)).not.toThrow();

    const tooLongId = `allura-${"a".repeat(58)}`;
    expect(() => validateGroupId(tooLongId)).toThrow(ValidationError);
  });

  it("should reject group_ids with special characters", () => {
    expect(() => validateGroupId("allura-test!")).toThrow(ValidationError);
    expect(() => validateGroupId("allura-test@")).toThrow(ValidationError);
    expect(() => validateGroupId("allura-test ")).toThrow(ValidationError);
  });
});
