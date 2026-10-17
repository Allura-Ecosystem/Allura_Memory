/**
 * EnforcedMcpClient Integration Tests
 * 
 * Tests for the groupId-enforced MCP client wrapper.
 * ARCH-001: Verify groupIdEnforcer is properly wired into MCP operations.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpToolCaller } from "@/integrations/mcp.client";
import { GroupIdValidationError } from "@/lib/validation/group-id";
import { createEnforcedClient, EnforcedMcpClient } from "./enforced-client";

// Mock the getMcpClient function
vi.mock("@/integrations/mcp.client", () => ({
  getMcpClient: vi.fn((): McpToolCaller => ({
    callTool: vi.fn().mockResolvedValue({ success: true, data: {} }),
  })),
}));

describe("EnforcedMcpClient", () => {
  let mockInner: McpToolCaller;

  beforeEach(() => {
    mockInner = {
      callTool: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Construction Tests - group_id Validation
  // =========================================================================

  describe("construction", () => {
    it("should accept valid allura-* group_id", () => {
      const mockClient = { callTool: vi.fn().mockResolvedValue({}) } as McpToolCaller;
      expect(() => new EnforcedMcpClient("allura-faith-meats", mockClient)).not.toThrow();
      expect(() => new EnforcedMcpClient("allura-creative", mockClient)).not.toThrow();
      expect(() => new EnforcedMcpClient("allura-default", mockClient)).not.toThrow();
    });

    it("should reject group_id without allura prefix (Issue #7)", () => {
      const mockClient = { callTool: vi.fn().mockResolvedValue({}) } as McpToolCaller;
      expect(() => new EnforcedMcpClient("my-project", mockClient)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("project123", mockClient)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("test_workspace", mockClient)).toThrow(GroupIdValidationError);
    });

    it("should reject null group_id", () => {
      const mockClient = { callTool: vi.fn().mockResolvedValue({}) } as McpToolCaller;
      expect(() => new EnforcedMcpClient(null as any, mockClient)).toThrow(GroupIdValidationError);
    });

    it("should reject undefined group_id", () => {
      const mockClient = { callTool: vi.fn().mockResolvedValue({}) } as McpToolCaller;
      expect(() => new EnforcedMcpClient(undefined as any, mockClient)).toThrow(GroupIdValidationError);
    });

    it("should reject empty string", () => {
      const mockClient = { callTool: vi.fn().mockResolvedValue({}) } as McpToolCaller;
      expect(() => new EnforcedMcpClient("", mockClient)).toThrow(GroupIdValidationError);
    });

    it("should reject whitespace-only string", () => {
      const mockClient = { callTool: vi.fn().mockResolvedValue({}) } as McpToolCaller;
      expect(() => new EnforcedMcpClient("   ", mockClient)).toThrow(GroupIdValidationError);
    });

    it("should reject uppercase characters (NFR11)", () => {
      const mockClient = { callTool: vi.fn().mockResolvedValue({}) } as McpToolCaller;
      expect(() => new EnforcedMcpClient("My-Project", mockClient)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("ALLURA-FAITH-MEATS", mockClient)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("allura-Faith-Meats", mockClient)).toThrow(GroupIdValidationError);
    });

    it("should reject too short group_id", () => {
      const mockClient = { callTool: vi.fn().mockResolvedValue({}) } as McpToolCaller;
      expect(() => new EnforcedMcpClient("a", mockClient)).toThrow(GroupIdValidationError);
    });

    it("should reject too long group_id", () => {
      const mockClient = { callTool: vi.fn().mockResolvedValue({}) } as McpToolCaller;
      const longId = "a".repeat(100);
      expect(() => new EnforcedMcpClient(longId, mockClient)).toThrow(GroupIdValidationError);
    });

    it("should reject invalid characters", () => {
      const mockClient = { callTool: vi.fn().mockResolvedValue({}) } as McpToolCaller;
      expect(() => new EnforcedMcpClient("my project", mockClient)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("my.project", mockClient)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("my@project", mockClient)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("-myproject", mockClient)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("myproject-", mockClient)).toThrow(GroupIdValidationError);
    });

    it("should trim whitespace from group_id", () => {
      mockInner.callTool = vi.fn().mockResolvedValue({});
      const client = new EnforcedMcpClient("  allura-default  ", mockInner);
      expect(client.getGroupId()).toBe("allura-default");
    });

    it("should reject group_id shorter than allura-X (Issue #7)", () => {
      mockInner.callTool = vi.fn().mockResolvedValue({});
      expect(() => new EnforcedMcpClient("ab", mockInner)).toThrow(GroupIdValidationError);
    });
  });

  // =========================================================================
  // callTool Tests - group_id Injection
  // =========================================================================

  describe("callTool", () => {
    it("should inject group_id into tool calls", async () => {
      const client = new EnforcedMcpClient("allura-faith-meats", mockInner);

      await client.callTool("notion-create-pages", {
        title: "Test Page",
        content: "Test content",
      });

      expect(mockInner.callTool).toHaveBeenCalledWith(
        "notion-create-pages",
        expect.objectContaining({
          group_id: "allura-faith-meats",
          title: "Test Page",
          content: "Test content",
        })
      );
    });

    it("should override group_id if already present in args", async () => {
      const client = new EnforcedMcpClient("allura-faith-meats", mockInner);

      await client.callTool("notion-update-page", {
        group_id: "allura-creative", // This should be overridden
        page_id: "page-123",
      });

      expect(mockInner.callTool).toHaveBeenCalledWith(
        "notion-update-page",
        expect.objectContaining({
          group_id: "allura-faith-meats", // Enforced value
          page_id: "page-123",
        })
      );
    });

    it("should preserve other arguments", async () => {
      const client = new EnforcedMcpClient("allura-default", mockInner);

      const complexArgs = {
        query: "search term",
        filters: { status: "active", type: "insight" },
        pagination: { offset: 0, limit: 100 },
        metadata: { source: "test", confidence: 0.95 },
      };

      await client.callTool("notion-search", complexArgs);

      expect(mockInner.callTool).toHaveBeenCalledWith(
        "notion-search",
        expect.objectContaining({
          group_id: "allura-default",
          ...complexArgs,
        })
      );
    });

    it("should return the result from inner client", async () => {
      const expectedResult = {
        results: [
          { id: "page-1", title: "Page 1" },
          { id: "page-2", title: "Page 2" },
        ],
      };

      mockInner.callTool = vi.fn().mockResolvedValue(expectedResult);
      const client = new EnforcedMcpClient("allura-default", mockInner);

      const result = await client.callTool("notion-fetch", { page_id: "test" });

      expect(result).toEqual(expectedResult);
    });

    it("should propagate errors from inner client", async () => {
      const expectedError = new Error("MCP tool failed: connection timeout");
      mockInner.callTool = vi.fn().mockRejectedValue(expectedError);
      const client = new EnforcedMcpClient("allura-default", mockInner);

      await expect(
        client.callTool("notion-create-pages", { title: "Test" })
      ).rejects.toThrow("MCP tool failed: connection timeout");
    });

    it("should handle multiple sequential calls with same group_id", async () => {
      const client = new EnforcedMcpClient("allura-audits", mockInner);

      await client.callTool("notion-create-pages", { title: "Page 1" });
      await client.callTool("notion-update-page", { page_id: "1", title: "Updated" });
      await client.callTool("notion-fetch", { page_id: "1" });

      expect(mockInner.callTool).toHaveBeenCalledTimes(3);
      expect(mockInner.callTool).toHaveBeenNthCalledWith(
        1,
        "notion-create-pages",
        expect.objectContaining({ group_id: "allura-audits" })
      );
      expect(mockInner.callTool).toHaveBeenNthCalledWith(
        2,
        "notion-update-page",
        expect.objectContaining({ group_id: "allura-audits" })
      );
      expect(mockInner.callTool).toHaveBeenNthCalledWith(
        3,
        "notion-fetch",
        expect.objectContaining({ group_id: "allura-audits" })
      );
    });
  });

  // =========================================================================
  // getGroupId Tests - Inspection API
  // =========================================================================

  describe("getGroupId", () => {
    it("should return the validated group_id", () => {
      const client = new EnforcedMcpClient("allura-faith-meats", mockInner);
      expect(client.getGroupId()).toBe("allura-faith-meats");
    });

    it("should return trimmed group_id", () => {
      const client = new EnforcedMcpClient("  allura-creative  ", mockInner);
      expect(client.getGroupId()).toBe("allura-creative");
    });
  });

  // =========================================================================
  // Integration Scenarios - Real MCP Patterns
  // =========================================================================

  describe("integration scenarios", () => {
    it("should enforce group_id for notion-create-pages", async () => {
      mockInner.callTool = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ pageId: "page-123" }) }],
      });

      const client = new EnforcedMcpClient("allura-nonprofit", mockInner);

      const result = await client.callTool("notion-create-pages", {
        parent: { page_id: "parent-123" },
        pages: [{ properties: { title: "New Grant" } }],
      });

      expect(mockInner.callTool).toHaveBeenCalledWith(
        "notion-create-pages",
        expect.objectContaining({
          group_id: "allura-nonprofit",
          parent: { page_id: "parent-123" },
        })
      );
    });

    it("should enforce group_id for notion-search", async () => {
      mockInner.callTool = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ results: [] }) }],
      });

      const client = new EnforcedMcpClient("allura-haccp", mockInner);

      await client.callTool("notion-search", {
        query: "HACCP compliance",
        filters: { created_date_range: { start: "2026-01-01" } },
      });

      expect(mockInner.callTool).toHaveBeenCalledWith(
        "notion-search",
        expect.objectContaining({
          group_id: "allura-haccp",
          query: "HACCP compliance",
        })
      );
    });

    it("should enforce group_id for graph-search_nodes", async () => {
      mockInner.callTool = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ nodes: [] }) }],
      });

      const client = new EnforcedMcpClient("allura-default", mockInner);

      await client.callTool("graph-search_nodes", {
        query: "architecture decisions",
      });

      expect(mockInner.callTool).toHaveBeenCalledWith(
        "graph-search_nodes",
        expect.objectContaining({
          group_id: "allura-default",
        })
      );
    });

    it("should enforce group_id for postgres-log-trace", async () => {
      mockInner.callTool = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ traceId: "trace-123" }) }],
      });

      const client = new EnforcedMcpClient("allura-faith-meats", mockInner);

      await client.callTool("postgres-log-trace", {
        agent_id: "memory-orchestrator",
        type: "contribution",
        content: { insight: "New pattern discovered" },
      });

      expect(mockInner.callTool).toHaveBeenCalledWith(
        "postgres-log-trace",
        expect.objectContaining({
          group_id: "allura-faith-meats",
          agent_id: "memory-orchestrator",
        })
      );
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe("edge cases", () => {
    it("should handle number group_id by throwing error", () => {
      expect(() => new EnforcedMcpClient(123 as any, mockInner)).toThrow(GroupIdValidationError);
    });

    it("should handle object group_id by throwing error", () => {
      expect(() => new EnforcedMcpClient({} as any, mockInner)).toThrow(GroupIdValidationError);
    });

    it("should handle array group_id by throwing error", () => {
      expect(() => new EnforcedMcpClient(["test"] as any, mockInner)).toThrow(GroupIdValidationError);
    });

    it("should handle inner client throwing on construction", async () => {
      mockInner.callTool = vi.fn().mockImplementation(() => {
        throw new Error("Inner client error during call");
      });

      const client = new EnforcedMcpClient("allura-default", mockInner);

      await expect(
        client.callTool("notion-fetch", { page_id: "test" })
      ).rejects.toThrow("Inner client error during call");
    });

    it("should reject reserved IDs without allura prefix (Issue #7)", () => {
      // After Issue #7, all group_ids must match ^allura-
      // Reserved IDs like "global", "system" are no longer accepted as bare strings
      expect(() => new EnforcedMcpClient("global", mockInner)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("system", mockInner)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("admin", mockInner)).toThrow(GroupIdValidationError);
      expect(() => new EnforcedMcpClient("public", mockInner)).toThrow(GroupIdValidationError);
    });
  });

  // =========================================================================
  // Reserved vs Tenant ID Validation
  // =========================================================================

  describe("reserved vs tenant ID handling", () => {
    it("should distinguish between reserved IDs and tenant IDs", () => {
      const tenantClient = new EnforcedMcpClient("allura-faith-meats", mockInner);
      // Reserved IDs must now use allura- prefix (Issue #7)
      expect(() => new EnforcedMcpClient("global", mockInner)).toThrow(GroupIdValidationError);
      // allura-prefixed reserved IDs are valid
      const reservedClient = new EnforcedMcpClient("allura-global", mockInner);

      expect(tenantClient.getGroupId()).toBe("allura-faith-meats");
      expect(reservedClient.getGroupId()).toBe("allura-global");
    });

    it("should reject tenant ID with 'global' substring but without allura prefix (Issue #7)", () => {
      // After Issue #7, all group_ids must match ^allura-
      expect(() => new EnforcedMcpClient("global-project", mockInner)).toThrow(GroupIdValidationError);
      // But allura-prefixed is fine
      expect(() => new EnforcedMcpClient("allura-global-project", mockInner)).not.toThrow();
    });

    it("should enforce allura-* prefix for production workspaces", () => {
      // This test documents the expected production pattern
      const productionWorkspaces = [
        "allura-faith-meats",
        "allura-creative",
        "allura-personal",
        "allura-nonprofit",
        "allura-audits",
        "allura-haccp",
      ];

      productionWorkspaces.forEach((workspace) => {
        expect(() => new EnforcedMcpClient(workspace, mockInner)).not.toThrow();
      });
    });
  });
});

// =========================================================================
// Export for integration testing
// =========================================================================

export { EnforcedMcpClient };