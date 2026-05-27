/**
 * Story 1.2: Agent Memory Wrapper Integration Test
 *
 * Verifies that:
 * 1. Agents can import agentMemory
 * 2. agentMemory routes to canonical MCP tools
 * 3. All operations validate group_id and content
 * 4. Responses match SDK schemas
 *
 * Runs: bun test src/agents/memory-wrapper.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentMemory } from "./memory-wrapper";
import { ValidationError } from "@/lib/sdk";
import * as canonicalTools from "@/mcp/canonical-tools";

const TEST_MEMORY_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_MEMORY_ID = "550e8400-e29b-41d4-a716-446655440001";

// Mock canonical tools
vi.mock("@/mcp/canonical-tools", () => ({
  canonicalMemoryTools: {
    memory_add: vi.fn(),
    memory_search: vi.fn(),
    memory_get: vi.fn(),
    memory_list: vi.fn(),
    memory_delete: vi.fn(),
  },
}));

describe("Agent Memory Wrapper (Story 1.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("add()", () => {
    it("should add a memory with valid parameters", async () => {
      const mockResponse = {
        id: TEST_MEMORY_ID,
        stored: "episodic" as const,
        score: 0.8,
        created_at: "2026-05-07T10:00:00Z",
      };

      vi.spyOn(canonicalTools.canonicalMemoryTools, "memory_add").mockResolvedValue(
        mockResponse as any
      );

      const result = await agentMemory.add({
        group_id: "allura-system",
        user_id: "brooks-architect",
        content: "ADR: Implemented agent memory wrapper",
        metadata: { source: "conversation", confidence: 0.9 },
      });

      expect(result).toEqual(mockResponse);
      expect(canonicalTools.canonicalMemoryTools.memory_add).toHaveBeenCalledWith(
        expect.objectContaining({
          group_id: "allura-system",
          user_id: "brooks-architect",
          content: "ADR: Implemented agent memory wrapper",
        })
      );
    });

    it("should reject empty content", async () => {
      await expect(
        agentMemory.add({
          group_id: "allura-system",
          user_id: "brooks-architect",
          content: "",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject invalid group_id", async () => {
      await expect(
        agentMemory.add({
          group_id: "invalid-group",
          user_id: "brooks-architect",
          content: "Test content",
        })
      ).rejects.toThrow(); // GroupIdValidationError from validateGroupId
    });

    it("should reject missing user_id", async () => {
      await expect(
        agentMemory.add({
          group_id: "allura-system",
          user_id: "",
          content: "Test content",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject invalid threshold", async () => {
      await expect(
        agentMemory.add({
          group_id: "allura-system",
          user_id: "brooks-architect",
          content: "Test content",
          threshold: 1.5,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("search()", () => {
    it("should search memories with valid parameters", async () => {
      const mockResponse = {
        results: [
          {
            id: TEST_MEMORY_ID,
            content: "ADR: Memory wrapper",
            score: 0.95,
            source: "semantic" as const,
            provenance: "conversation" as const,
            created_at: "2026-05-07T10:00:00Z",
          },
        ],
        count: 1,
        latency_ms: 42,
        meta: {
          contract_version: "v1" as const,
          degraded: false,
          stores_used: ["graph", "ruvector"],
          stores_attempted: ["graph", "ruvector", "postgres"],
          warnings: [],
        },
      };

      vi.spyOn(canonicalTools.canonicalMemoryTools, "memory_search").mockResolvedValue(
        mockResponse as any
      );

      const result = await agentMemory.search({
        group_id: "allura-system",
        query: "architecture decisions",
      });

      expect(result).toEqual(mockResponse);
      expect(canonicalTools.canonicalMemoryTools.memory_search).toHaveBeenCalledWith(
        expect.objectContaining({
          group_id: "allura-system",
          query: "architecture decisions",
        })
      );
    });

    it("should reject missing group_id before calling canonical search", async () => {
      await expect(
        agentMemory.search({
          group_id: undefined as any,
          query: "architecture decisions",
        })
      ).rejects.toThrow("group_id is required");

      expect(canonicalTools.canonicalMemoryTools.memory_search).not.toHaveBeenCalled();
    });

    it("should reject invalid group_id before calling canonical search", async () => {
      await expect(
        agentMemory.search({
          group_id: "invalid-group",
          query: "architecture decisions",
        })
      ).rejects.toThrow("Invalid group_id");

      expect(canonicalTools.canonicalMemoryTools.memory_search).not.toHaveBeenCalled();
    });

    it("should reject empty query", async () => {
      await expect(
        agentMemory.search({
          group_id: "allura-system",
          query: "",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject invalid limit", async () => {
      await expect(
        agentMemory.search({
          group_id: "allura-system",
          query: "test",
          limit: 200,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should preserve optional user_id through canonical search routing", async () => {
      const searchMock = vi
        .spyOn(canonicalTools.canonicalMemoryTools, "memory_search")
        .mockResolvedValue({
          results: [],
          count: 0,
          latency_ms: 10,
        } as any);

      await agentMemory.search({
        group_id: "allura-system",
        user_id: "brooks-architect",
        query: "architecture decisions",
      });

      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          group_id: "allura-system",
          user_id: "brooks-architect",
          query: "architecture decisions",
        })
      );
    });
  });

  describe("get()", () => {
    it("should get a memory by ID", async () => {
      const mockResponse = {
        id: TEST_MEMORY_ID,
        content: "ADR: Memory wrapper implementation",
        score: 0.9,
        source: "semantic" as const,
        provenance: "conversation" as const,
        user_id: "brooks-architect",
        created_at: "2026-05-07T10:00:00Z",
      };

      vi.spyOn(canonicalTools.canonicalMemoryTools, "memory_get").mockResolvedValue(
        mockResponse as any
      );

      const result = await agentMemory.get({
        group_id: "allura-system",
        id: TEST_MEMORY_ID,
      });

      expect(result).toEqual(mockResponse);
      expect(canonicalTools.canonicalMemoryTools.memory_get).toHaveBeenCalledWith({
        group_id: "allura-system",
        id: TEST_MEMORY_ID,
      });
    });

    it("should reject invalid ID", async () => {
      await expect(
        agentMemory.get({
          group_id: "allura-system",
          id: "",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject non-UUID memory IDs before calling canonical tools", async () => {
      await expect(
        agentMemory.get({
          group_id: "allura-system",
          id: "not-a-uuid",
        })
      ).rejects.toThrow("id must be a valid UUID v4");

      expect(canonicalTools.canonicalMemoryTools.memory_get).not.toHaveBeenCalled();
    });
  });

  describe("list()", () => {
    it("should list memories with valid parameters", async () => {
      const mockResponse = {
        memories: [
          {
            id: TEST_MEMORY_ID,
            content: "ADR 1",
            score: 0.85,
            source: "episodic" as const,
            provenance: "conversation" as const,
            user_id: "brooks-architect",
            created_at: "2026-05-07T10:00:00Z",
          },
        ],
        total: 1,
        has_more: false,
        meta: {
          contract_version: "v1" as const,
          degraded: false,
          stores_used: ["postgres", "graph"],
          stores_attempted: ["postgres", "graph"],
          warnings: [],
        },
      };

      vi.spyOn(canonicalTools.canonicalMemoryTools, "memory_list").mockResolvedValue(
        mockResponse as any
      );

      const result = await agentMemory.list({
        group_id: "allura-system",
        user_id: "test-user",
        limit: 50,
      });

      expect(result).toEqual(mockResponse);
      expect(canonicalTools.canonicalMemoryTools.memory_list).toHaveBeenCalledWith(
        expect.objectContaining({
          group_id: "allura-system",
          user_id: "test-user",
          limit: 50,
        })
      );
    });

    it("should reject missing group_id before calling canonical list", async () => {
      await expect(
        agentMemory.list({
          group_id: undefined as any,
          user_id: "test-user",
        })
      ).rejects.toThrow("group_id is required");

      expect(canonicalTools.canonicalMemoryTools.memory_list).not.toHaveBeenCalled();
    });

    it("should reject invalid group_id before calling canonical list", async () => {
      await expect(
        agentMemory.list({
          group_id: "invalid-group",
          user_id: "test-user",
        })
      ).rejects.toThrow("Invalid group_id");

      expect(canonicalTools.canonicalMemoryTools.memory_list).not.toHaveBeenCalled();
    });

    it("should reject invalid limit", async () => {
      await expect(
        agentMemory.list({
          group_id: "allura-system",
          user_id: "test-user",
          limit: 2000,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject negative offset", async () => {
      await expect(
        agentMemory.list({
          group_id: "allura-system",
          user_id: "test-user",
          offset: -1,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("delete()", () => {
    it("should delete a memory", async () => {
      const mockResponse = {
        id: TEST_MEMORY_ID,
        deleted: true,
        deleted_at: "2026-05-07T10:00:00Z",
        recovery_days: 30,
      };

      vi.spyOn(canonicalTools.canonicalMemoryTools, "memory_delete").mockResolvedValue(
        mockResponse as any
      );

      const result = await agentMemory.delete({
        group_id: "allura-system",
        id: TEST_MEMORY_ID,
        user_id: "brooks-architect",
      });

      expect(result).toEqual(mockResponse);
    });

    it("should require user_id for deletion", async () => {
      await expect(
        agentMemory.delete({
          group_id: "allura-system",
          id: TEST_MEMORY_ID,
          user_id: "",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject non-UUID memory IDs before deletion", async () => {
      await expect(
        agentMemory.delete({
          group_id: "allura-system",
          id: "not-a-uuid",
          user_id: "brooks-architect",
        })
      ).rejects.toThrow("id must be a valid UUID v4");

      expect(canonicalTools.canonicalMemoryTools.memory_delete).not.toHaveBeenCalled();
    });
  });

  describe("Integration: Agent → MCP Tool Routing", () => {
    it("should route through canonical tools without modification", async () => {
      const addMock = vi
        .spyOn(canonicalTools.canonicalMemoryTools, "memory_add")
        .mockResolvedValue({ id: OTHER_MEMORY_ID, stored: "episodic" as const, score: 0.7, created_at: "2026-05-07T10:00:00Z" } as any);

      await agentMemory.add({
        group_id: "allura-system",
        user_id: "woz-builder",
        content: "Implemented feature X",
      });

      expect(addMock).toHaveBeenCalledOnce();
      const call = addMock.mock.calls[0][0];
      expect(call).toMatchObject({
        group_id: "allura-system",
        user_id: "woz-builder",
        content: "Implemented feature X",
      });
    });

    it("should preserve metadata through MCP layer", async () => {
      const searchMock = vi
        .spyOn(canonicalTools.canonicalMemoryTools, "memory_search")
        .mockResolvedValue({
          results: [],
          count: 0,
          latency_ms: 10,
        } as any);

      await agentMemory.search({
        group_id: "allura-system",
        query: "test query",
        limit: 25,
      });

      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "test query",
          limit: 25,
        })
      );
    });
  });
});
