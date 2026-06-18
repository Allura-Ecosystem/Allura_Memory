/**
 * Brain MCP Client — Contract Tests
 *
 * These tests verify the data shape contract between the Brain MCP service
 * and the dashboard pages that consume it. They call real Brain MCP at localhost:5888
 * when RUN_E2E_TESTS=true, otherwise they validate the client's type contracts
 * and error handling with mocked responses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const isE2E = process.env.RUN_E2E_TESTS === "true"

// ── Unit tests (always run) ────────────────────────────────────────────────

describe("brain-client", () => {
  describe("type contracts", () => {
    it("should export brainClient with expected methods", async () => {
      const { brainClient } = await import("./brain-client")
      expect(brainClient).toBeDefined()
      expect(typeof brainClient.healthReport).toBe("function")
      expect(typeof brainClient.searchMemories).toBe("function")
      expect(typeof brainClient.listMemories).toBe("function")
      expect(typeof brainClient.queryEvents).toBe("function")
      expect(typeof brainClient.listPolicies).toBe("function")
    })

    it("should reject invalid group_id", async () => {
      const { brainClient } = await import("./brain-client")
      await expect(brainClient.healthReport("bad-id")).rejects.toThrow()
      await expect(brainClient.searchMemories("test", "no-prefix")).rejects.toThrow()
      await expect(brainClient.listMemories("invalid", "user")).rejects.toThrow()
    })

    it("should accept valid allura-* group_id format without validation error", async () => {
      const { brainClient } = await import("./brain-client")
      // Valid group_id should not throw GroupIdValidationError.
      // If Brain is running, the call succeeds. If not, it throws a network error.
      // Either way, it must NOT be a validation error.
      try {
        await brainClient.healthReport("allura-system")
        // If we reach here, Brain is running — that's fine
      } catch (e) {
        // Must be a network/fetch error, not a validation error
        expect((e as Error).constructor.name).not.toBe("GroupIdValidationError")
      }
    })
  })

  // ── E2E contract tests (only when Brain MCP is running) ──────────────────

  describe.skipIf(!isE2E)("contract: healthReport", () => {
    it("should return valid health report shape", async () => {
      const { brainClient } = await import("./brain-client")
      const report = await brainClient.healthReport("allura-system")

      expect(report).toHaveProperty("subsystems")
      expect(report).toHaveProperty("overall_status")
      expect(report).toHaveProperty("checked_at")
      expect(report).toHaveProperty("meta")

      // Subsystem shape
      expect(report.subsystems).toHaveProperty("postgres")
      expect(report.subsystems).toHaveProperty("neo4j")
      expect(report.subsystems.postgres).toHaveProperty("status")
      expect(report.subsystems.postgres).toHaveProperty("latency_ms")
      expect(typeof report.subsystems.postgres.latency_ms).toBe("number")

      // Meta shape
      expect(report.meta).toHaveProperty("contract_version")
      expect(report.meta.contract_version).toBe("v1")
    })
  })

  describe.skipIf(!isE2E)("contract: searchMemories", () => {
    it("should return valid search result shape", async () => {
      const { brainClient } = await import("./brain-client")
      const result = await brainClient.searchMemories("architecture", "allura-system", {
        limit: 3,
      })

      expect(result).toHaveProperty("results")
      expect(result).toHaveProperty("count")
      expect(result).toHaveProperty("latency_ms")
      expect(result).toHaveProperty("meta")

      expect(Array.isArray(result.results)).toBe(true)
      expect(result.count).toBeGreaterThan(0)

      // Memory shape
      const memory = result.results[0]
      expect(memory).toHaveProperty("id")
      expect(memory).toHaveProperty("content")
      expect(memory).toHaveProperty("score")
      expect(memory).toHaveProperty("source")
      expect(memory).toHaveProperty("created_at")
      expect(typeof memory.id).toBe("string")
      expect(typeof memory.content).toBe("string")
      expect(typeof memory.score).toBe("number")
      expect(["episodic", "semantic"]).toContain(memory.source)
    })
  })

  describe.skipIf(!isE2E)("contract: listMemories", () => {
    it("should return valid list result shape", async () => {
      const { brainClient } = await import("./brain-client")
      const result = await brainClient.listMemories("allura-system", "ronin704", {
        limit: 5,
      })

      expect(result).toHaveProperty("memories")
      expect(result).toHaveProperty("total")
      expect(result).toHaveProperty("has_more")
      expect(result).toHaveProperty("meta")

      expect(Array.isArray(result.memories)).toBe(true)
      expect(typeof result.total).toBe("number")
      expect(typeof result.has_more).toBe("boolean")
    })
  })
})
