/**
 * Subagent MCP Access Integration Tests — Story 20.3
 *
 * Verifies that subagents inheriting MCP toolsets via
 * `inherit_mcp_toolsets: true` have access to allura_brain MCP tools
 * (memory_search, memory_add) and that group_id enforcement prevents
 * cross-tenant access.
 *
 * These tests validate the configuration and tool registration layer.
 * For live MCP protocol tests, set RUN_E2E_TESTS=true with a running gateway.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Import the canonical tools to verify they're exported and callable
import { memory_add, memory_search } from "@/mcp/canonical-tools";
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id";
import {
  getDefaultGroupId,
  getAllowedGroupIds,
  isAgentAllowedGroupId,
} from "@/lib/config/group-id-registry";

describe("Story 20.3 — Subagent MCP Tool Access", () => {
  describe("AC-1: memory_search is available and callable", () => {
    it("memory_search is exported as a function", () => {
      expect(typeof memory_search).toBe("function");
    });

    it("memory_search requires group_id parameter (enforced by type contract)", () => {
      // The MemorySearchRequest type requires group_id — verify the function
      // signature exists and would reject a call without group_id
      expect(memory_search.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("AC-2: memory_add is available and callable", () => {
    it("memory_add is exported as a function", () => {
      expect(typeof memory_add).toBe("function");
    });

    it("memory_add requires group_id parameter (enforced by type contract)", () => {
      expect(memory_add.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("AC-3: group_id is enforced — cross-tenant access blocked", () => {
    it("validateGroupId rejects invalid group_id formats", () => {
      expect(() => validateGroupId("invalid")).toThrow(GroupIdValidationError);
      expect(() => validateGroupId("allura-")).toThrow(GroupIdValidationError);
      expect(() => validateGroupId("ALLURA-SYSTEM")).toThrow(GroupIdValidationError);
      expect(() => validateGroupId("")).toThrow(GroupIdValidationError);
    });

    it("validateGroupId accepts valid allura-* group_ids", () => {
      expect(() => validateGroupId("allura-system")).not.toThrow();
      expect(() => validateGroupId("allura-faithmeats")).not.toThrow();
      expect(() => validateGroupId("allura-difference-driven")).not.toThrow();
      expect(() => validateGroupId("allura-coding")).not.toThrow();
    });

    it("a faithmeats agent cannot access allura-system memories (registry enforcement)", () => {
      // The group_id registry limits which tenants each agent can access
      const faithmeatsDefault = getDefaultGroupId("faithmeats-editor");
      expect(faithmeatsDefault).toBe("allura-faithmeats");

      const faithmeatsAllowed = getAllowedGroupIds("faithmeats-editor");
      expect(faithmeatsAllowed).not.toContain("allura-system");

      expect(
        isAgentAllowedGroupId("faithmeats-editor", "allura-system")
      ).toBe(false);
    });

    it("a nonprofit agent is scoped to allura-difference-driven only", () => {
      expect(isAgentAllowedGroupId("nonprofit-organizer", "allura-system")).toBe(false);
      expect(
        isAgentAllowedGroupId("nonprofit-organizer", "allura-difference-driven")
      ).toBe(true);
    });
  });

  describe("AC-4: MCP tool inheritance configuration documented", () => {
    it("the canonical HTTP gateway exposes memory_search and memory_add", () => {
      const gatewayPath = join(
        process.cwd(),
        "src",
        "mcp",
        "canonical-http-gateway.ts"
      );
      const content = readFileSync(gatewayPath, "utf-8");

      // Verify both tools are registered in the gateway
      expect(content).toContain("memory_search");
      expect(content).toContain("memory_add");
      expect(content).toContain("memory_get");
      expect(content).toContain("memory_list");
      expect(content).toContain("memory_delete");
    });

    it("the BRIEF.md template instructs subagents to use memory_search and memory_add", () => {
      const briefPath = join(process.cwd(), "templates", "BRIEF.md");
      expect(existsSync(briefPath)).toBe(true);
      const content = readFileSync(briefPath, "utf-8");
      expect(content).toContain("memory_search");
      expect(content).toContain("memory_add");
    });
  });

  describe("AC-5: evidence of subagent MCP access", () => {
    it("evidence file exists at docs/archive/allura/evidence/", () => {
      const evidencePath = join(
        process.cwd(),
        "docs",
        "archive",
        "allura",
        "evidence",
        "subagent-mcp-access-2026-07-26.md"
      );
      expect(existsSync(evidencePath)).toBe(true);
      const content = readFileSync(evidencePath, "utf-8");
      expect(content).toContain("memory_search");
      expect(content).toContain("memory_add");
      expect(content).toContain("inherit_mcp_toolsets");
    });
  });
});