/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest"
import {
  classifyRiskLevel,
  requiresAlwaysAsk,
  type ToolCandidate,
  type ToolProfile,
  validateToolCandidate,
  validateToolId,
  validateToolProfile,
} from "@/lib/mcp-catalog/types"

describe("MCP Catalog Types", () => {
  describe("classifyRiskLevel", () => {
    it("classifies destructive tools", () => {
      expect(classifyRiskLevel("memory_delete", "Delete a memory")).toBe("destructive")
      expect(classifyRiskLevel("purge_cache", "Purge all cache")).toBe("destructive")
    })

    it("classifies admin tools", () => {
      expect(classifyRiskLevel("admin_config", "Configure admin settings")).toBe("admin")
      expect(classifyRiskLevel("approve_proposal", "Approve a canonical proposal")).toBe("admin")
    })

    it("classifies write tools", () => {
      expect(classifyRiskLevel("memory_add", "Add a new memory")).toBe("write")
      expect(classifyRiskLevel("create_entity", "Create an entity in the graph")).toBe("write")
    })

    it("classifies read tools", () => {
      expect(classifyRiskLevel("memory_search", "Search memories")).toBe("read")
      expect(classifyRiskLevel("memory_get", "Get a memory by ID")).toBe("read")
    })
  })

  describe("requiresAlwaysAsk", () => {
    it("requires confirmation for write/admin/destructive", () => {
      expect(requiresAlwaysAsk("write")).toBe(true)
      expect(requiresAlwaysAsk("admin")).toBe(true)
      expect(requiresAlwaysAsk("destructive")).toBe(true)
    })

    it("does not require confirmation for read", () => {
      expect(requiresAlwaysAsk("read")).toBe(false)
    })
  })

  describe("validateToolId", () => {
    it("accepts valid tool IDs", () => {
      expect(validateToolId("allura-brain::memory_search")).toBe(true)
      expect(validateToolId("allura-brain::memory_add")).toBe(true)
      expect(validateToolId("database-server::execute_sql")).toBe(true)
    })

    it("rejects invalid tool IDs", () => {
      expect(validateToolId("invalid")).toBe(false)
      expect(validateToolId("")).toBe(false)
      expect(validateToolId("UPPERCASE::Tool")).toBe(false)
      expect(validateToolId("spaces in::tool")).toBe(false)
    })
  })

  describe("validateToolCandidate", () => {
    it("accepts valid candidates", () => {
      const result = validateToolCandidate({
        id: "allura-brain::memory_search",
        server: "allura-brain",
        tool: "memory_search",
        description: "Search memories",
        inputSchema: {},
        discoveryMethod: "catalog_scan",
      })
      expect(result).toEqual([])
    })

    it("rejects candidates with missing fields", () => {
      const result = validateToolCandidate({})
      expect(result.length).toBeGreaterThan(0)
      expect(result).toContain("id must be in server::tool format (lowercase, underscores, hyphens)")
      expect(result).toContain("server is required")
      expect(result).toContain("tool is required")
    })
  })

  describe("validateToolProfile", () => {
    it("accepts valid profiles", () => {
      const result = validateToolProfile({
        name: "allura-core",
        description: "Core tools for Allura agents",
        tools: ["allura-brain::memory_search"],
      })
      expect(result).toEqual([])
    })

    it("rejects profiles with missing name", () => {
      const result = validateToolProfile({
        description: "test",
        tools: [],
      })
      expect(result).toContain("name is required")
    })

    it("rejects profiles with empty tools", () => {
      const result = validateToolProfile({
        name: "test",
        description: "test",
        tools: [],
      })
      expect(result).toContain("tools must be a non-empty array of approved tool IDs")
    })
  })
})