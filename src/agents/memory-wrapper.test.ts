/**
 * Story 1.2: Agent Memory Wrapper Integration Test
 *
 * Verifies that:
 * 1. Agents can import agentMemory
 * 2. agentMemory routes through controlPlane syscalls
 * 3. All operations validate group_id and content
 * 4. Responses match SDK schemas
 *
 * Runs: bun test src/agents/memory-wrapper.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentMemory } from "./memory-wrapper";
import { ValidationError } from "@/lib/sdk";

const TEST_MEMORY_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_MEMORY_ID = "550e8400-e29b-41d4-a716-446655440001";

// Mock controlPlane syscalls
vi.mock("@/control-plane/syscalls", () => ({
  syscall_mutate: vi.fn().mockResolvedValue({
    success: true,
    data: { affected_rows: 1, auditId: "audit-allura-system-mutate-123" },
    auditId: "audit-allura-system-mutate-123",
  }),
  syscall_query: vi.fn().mockResolvedValue({
    success: true,
    data: [],
  }),
}));

vi.stubEnv("RUVIX_CONTROL_PLANE_SECRET", "test-secret-key-for-ruvix-controlPlane-proof-engine-32chars");

import { syscall_mutate, syscall_query } from "@/control-plane/syscalls";

describe("Agent Memory Wrapper (Story 1.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("add()", () => {
    it("should add a memory with valid parameters", async () => {
      vi.mocked(syscall_mutate).mockResolvedValueOnce({
        success: true,
        data: { affected_rows: 1, auditId: "audit-allura-system-mutate-123" },
        auditId: "audit-allura-system-mutate-123",
      });

      const result = await agentMemory.add({
        group_id: "allura-system",
        user_id: "brooks-architect",
        content: "ADR: Implemented agent memory wrapper",
        metadata: { source: "conversation", confidence: 0.9 },
      });

      expect(result.id).toBeDefined();
      expect(result.stored).toBe("episodic");
      expect(syscall_mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "insert",
          target: "pg:memories",
        }),
        expect.objectContaining({
          actor: "brooks-architect",
          group_id: "allura-system",
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
      vi.mocked(syscall_query).mockResolvedValueOnce({
        success: true,
        data: [{ id: TEST_MEMORY_ID, content: "ADR: Memory wrapper", score: 0.95, provenance: "conversation", created_at: "2026-05-07T10:00:00Z" }],
      });

      const result = await agentMemory.search({
        group_id: "allura-system",
        query: "architecture decisions",
      });

      expect(result.results.length).toBe(1);
      expect(syscall_query).toHaveBeenCalledWith(
        expect.objectContaining({ target: "pg:memories" }),
        expect.objectContaining({ group_id: "allura-system" })
      );
    });

    it("should reject missing group_id before calling controlPlane query", async () => {
      await expect(
        agentMemory.search({
          group_id: undefined as any,
          query: "architecture decisions",
        })
      ).rejects.toThrow("group_id is required");

      expect(syscall_query).not.toHaveBeenCalled();
    });

    it("should reject invalid group_id before calling controlPlane query", async () => {
      await expect(
        agentMemory.search({
          group_id: "invalid-group",
          query: "architecture decisions",
        })
      ).rejects.toThrow("Invalid group_id");

      expect(syscall_query).not.toHaveBeenCalled();
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

    it("should preserve optional user_id through controlPlane query routing", async () => {
      vi.mocked(syscall_query).mockResolvedValueOnce({
        success: true,
        data: [],
      });

      await agentMemory.search({
        group_id: "allura-system",
        user_id: "brooks-architect",
        query: "architecture decisions",
      });

      expect(syscall_query).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "pg:memories",
          query: expect.objectContaining({
            group_id: "allura-system",
            user_id: "brooks-architect",
          }),
        }),
        expect.objectContaining({ group_id: "allura-system" })
      );
    });
  });

  describe("get()", () => {
    it("should get a memory by ID", async () => {
      vi.mocked(syscall_query).mockResolvedValueOnce({
        success: true,
        data: [{ id: TEST_MEMORY_ID, content: "test", user_id: "brooks", score: 0.9, source: "episodic", provenance: "conversation", metadata: {}, created_at: "2026-05-07T10:00:00Z" }],
      });

      const result = await agentMemory.get({
        group_id: "allura-system",
        id: TEST_MEMORY_ID,
      });

      expect(result.id).toBe(TEST_MEMORY_ID);
    });

    it("should reject invalid ID", async () => {
      await expect(
        agentMemory.get({
          group_id: "allura-system",
          id: "",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject non-UUID memory IDs before calling controlPlane", async () => {
      await expect(
        agentMemory.get({
          group_id: "allura-system",
          id: "not-a-uuid",
        })
      ).rejects.toThrow();

      expect(syscall_query).not.toHaveBeenCalled();
    });
  });

  describe("list()", () => {
    it("should list memories", async () => {
      vi.mocked(syscall_query).mockResolvedValueOnce({
        success: true,
        data: [{ id: TEST_MEMORY_ID, content: "test", user_id: "brooks", score: 0.9, source: "episodic", provenance: "conversation", metadata: {}, created_at: "2026-05-07T10:00:00Z" }],
      });

      const result = await agentMemory.list({
        group_id: "allura-system",
      });

      expect(result.memories.length).toBe(1);
    });

    it("should reject missing group_id before calling controlPlane list", async () => {
      await expect(
        agentMemory.list({
          group_id: undefined as any,
          user_id: "test-user",
        })
      ).rejects.toThrow("group_id is required");

      expect(syscall_query).not.toHaveBeenCalled();
    });

    it("should reject invalid group_id before calling controlPlane list", async () => {
      await expect(
        agentMemory.list({
          group_id: "invalid-group",
          user_id: "test-user",
        })
      ).rejects.toThrow("Invalid group_id");

      expect(syscall_query).not.toHaveBeenCalled();
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
      vi.mocked(syscall_mutate).mockResolvedValueOnce({
        success: true,
        data: { affected_rows: 1, auditId: "audit-allura-system-mutate-456" },
        auditId: "audit-allura-system-mutate-456",
      });

      const result = await agentMemory.delete({
        group_id: "allura-system",
        id: TEST_MEMORY_ID,
        user_id: "brooks-architect",
      });

      expect(result.deleted).toBe(true);
      expect(syscall_mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "insert",
          target: "pg:events",
        }),
        expect.objectContaining({ actor: "brooks-architect" })
      );
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
      ).rejects.toThrow();

      expect(syscall_mutate).not.toHaveBeenCalled();
    });
  });

  describe("Integration: Agent → ControlPlane Syscall Routing", () => {
    it("should route add through syscall_mutate", async () => {
      vi.mocked(syscall_mutate).mockResolvedValueOnce({
        success: true,
        data: { affected_rows: 1, auditId: "audit-allura-system-mutate-999" },
        auditId: "audit-allura-system-mutate-999",
      });

      await agentMemory.add({
        group_id: "allura-system",
        user_id: "woz-builder",
        content: "Implemented feature X",
      });

      expect(syscall_mutate).toHaveBeenCalledOnce();
      const [mutReq, ctx] = vi.mocked(syscall_mutate).mock.calls[0];
      expect(mutReq).toMatchObject({
        type: "insert",
        target: "pg:memories",
        data: expect.objectContaining({
          group_id: "allura-system",
          user_id: "woz-builder",
          content: "Implemented feature X",
        }),
      });
      expect(ctx).toMatchObject({
        actor: "woz-builder",
        group_id: "allura-system",
      });
    });

    it("should route search through syscall_query with limit", async () => {
      vi.mocked(syscall_query).mockResolvedValueOnce({
        success: true,
        data: [],
      });

      await agentMemory.search({
        group_id: "allura-system",
        query: "test query",
        limit: 25,
      });

      expect(syscall_query).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "pg:memories",
          limit: 25,
        }),
        expect.objectContaining({ group_id: "allura-system" })
      );
    });
  });
});
