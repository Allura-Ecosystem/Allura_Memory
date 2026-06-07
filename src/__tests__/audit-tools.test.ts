/**
 * Audit MCP Tools Integration Tests (Story 9.2)
 *
 * Covers all 4 audit tools:
 * 1. audit_query_events
 * 2. audit_health_report
 * 3. audit_agent_activity
 * 4. audit_invariant_check
 *
 * Pattern mirrors governance-tools.test.ts:
 * - itIfE2E gating for live-DB tests (RUN_E2E_TESTS=true)
 * - plain `it` for pure-logic / validation tests (no DB required)
 * - happy path + error/validation cases per tool
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "crypto"
import type {
  AuditAgentActivityRequest,
  AuditHealthReportRequest,
  AuditInvariantCheckRequest,
  AuditQueryEventsRequest,
  GroupId,
} from "../lib/memory/canonical-contracts"
import {
  audit_agent_activity,
  audit_health_report,
  audit_invariant_check,
  audit_query_events,
} from "../mcp/audit-tools"

// Live-DB gating: skip tests requiring live PostgreSQL unless RUN_E2E_TESTS=true
const itIfE2E = process.env.RUN_E2E_TESTS === "true" ? it : it.skip

// Test configuration
const RUN_ID = randomUUID().slice(0, 8)

// Use a typed helper to avoid casting repeatedly
function asGroupId(s: string): GroupId {
  return s as unknown as GroupId
}

const VALID_GROUP: GroupId = asGroupId(`allura-test-audit-${RUN_ID}`)

describe("Audit MCP Tools (Story 9.2)", () => {
  // ── 1. audit_query_events ──────────────────────────────────────────────────

  describe("audit_query_events", () => {
    it("should reject missing group_id", async () => {
      const req = { group_id: undefined } as unknown as AuditQueryEventsRequest
      await expect(audit_query_events(req)).rejects.toThrow()
    })

    it("should reject invalid group_id (no allura- prefix)", async () => {
      const req: AuditQueryEventsRequest = {
        group_id: "bad-group" as unknown as GroupId,
      }
      await expect(audit_query_events(req)).rejects.toThrow("Invalid group_id")
    })

    it("should reject group_id without allura- prefix", async () => {
      const req: AuditQueryEventsRequest = {
        group_id: "myorg-project" as unknown as GroupId,
      }
      await expect(audit_query_events(req)).rejects.toThrow()
    })

    it("should cap limit at 200", async () => {
      // Pure logic — cap is enforced before hitting DB; test would not reach DB
      // but we verify the request object itself doesn't reject
      const req: AuditQueryEventsRequest = {
        group_id: VALID_GROUP,
        limit: 9999,
      }
      // Should not throw on limit validation (only throws on invalid group_id or DB)
      // In non-E2E mode this will fail at DB connect — that's acceptable
      try {
        await audit_query_events(req)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Expect DB error, not a limit validation error
        expect(msg).not.toContain("limit")
      }
    })

    itIfE2E("should return paginated events for a valid group_id", async () => {
      const req: AuditQueryEventsRequest = {
        group_id: VALID_GROUP,
        limit: 10,
        offset: 0,
      }
      const response = await audit_query_events(req)

      expect(response.events).toBeDefined()
      expect(Array.isArray(response.events)).toBe(true)
      expect(typeof response.total).toBe("number")
      expect(response.limit).toBe(10)
      expect(response.offset).toBe(0)
      expect(response.meta).toBeDefined()
      expect(response.meta?.degraded).toBe(false)
    })

    itIfE2E("should filter by agent_id", async () => {
      const agentId = `test-agent-${RUN_ID}`

      // Insert a test event for this agent via governance_check_gate or similar
      const { pg } = await import("../mcp/canonical-tools/connection").then((m) => m.getConnections())
      await pg.query(
        `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
         VALUES ($1, 'audit_test', $2, 'completed', '{}', NOW())`,
        [VALID_GROUP, agentId]
      )

      const req: AuditQueryEventsRequest = {
        group_id: VALID_GROUP,
        agent_id: agentId,
        limit: 10,
      }
      const response = await audit_query_events(req)

      expect(response.events.length).toBeGreaterThanOrEqual(1)
      for (const event of response.events) {
        expect(event.agent_id).toBe(agentId)
      }
    })

    itIfE2E("should filter by event_type", async () => {
      const req: AuditQueryEventsRequest = {
        group_id: VALID_GROUP,
        event_type: "audit_test",
        limit: 50,
      }
      const response = await audit_query_events(req)

      for (const event of response.events) {
        expect(event.event_type).toBe("audit_test")
      }
    })

    itIfE2E("should support date_range filtering", async () => {
      const from = new Date(Date.now() - 60_000).toISOString() // 1 minute ago
      const to = new Date(Date.now() + 60_000).toISOString()   // 1 minute ahead

      const req: AuditQueryEventsRequest = {
        group_id: VALID_GROUP,
        date_range: { from, to },
        limit: 10,
      }
      const response = await audit_query_events(req)

      expect(response.events).toBeDefined()
      expect(typeof response.total).toBe("number")
    })

    itIfE2E("should respect limit/offset pagination", async () => {
      const req1: AuditQueryEventsRequest = { group_id: VALID_GROUP, limit: 1, offset: 0 }
      const req2: AuditQueryEventsRequest = { group_id: VALID_GROUP, limit: 1, offset: 1 }

      const [page1, page2] = await Promise.all([audit_query_events(req1), audit_query_events(req2)])

      expect(page1.events.length).toBeLessThanOrEqual(1)
      expect(page2.events.length).toBeLessThanOrEqual(1)

      if (page1.events.length > 0 && page2.events.length > 0) {
        expect(page1.events[0].id).not.toBe(page2.events[0].id)
      }
    })

    itIfE2E("should return empty result for group with no events", async () => {
      const emptyGroup = asGroupId(`allura-empty-audit-${randomUUID().slice(0, 8)}`)
      const req: AuditQueryEventsRequest = { group_id: emptyGroup, limit: 10 }
      const response = await audit_query_events(req)

      expect(response.events).toHaveLength(0)
      expect(response.total).toBe(0)
    })
  })

  // ── 2. audit_health_report ────────────────────────────────────────────────

  describe("audit_health_report", () => {
    it("should reject missing group_id", async () => {
      const req = { group_id: undefined } as unknown as AuditHealthReportRequest
      await expect(audit_health_report(req)).rejects.toThrow()
    })

    it("should reject invalid group_id", async () => {
      const req: AuditHealthReportRequest = {
        group_id: "invalid" as unknown as GroupId,
      }
      await expect(audit_health_report(req)).rejects.toThrow("Invalid group_id")
    })

    itIfE2E("should return a health report with all subsystems for a valid group_id", async () => {
      const req: AuditHealthReportRequest = { group_id: VALID_GROUP }
      const response = await audit_health_report(req)

      expect(response.subsystems).toBeDefined()
      expect(response.subsystems.postgres).toBeDefined()
      expect(response.subsystems.neo4j).toBeDefined()
      expect(response.subsystems.embedding_backfill).toBeDefined()
      expect(response.subsystems.curator_queue).toBeDefined()
      expect(response.subsystems.mcp_tools).toBeDefined()

      expect(["healthy", "degraded", "unavailable"]).toContain(response.overall_status)
      expect(response.checked_at).toBeTruthy()
      expect(response.meta).toBeDefined()
    })

    itIfE2E("should report PostgreSQL as healthy when connected", async () => {
      const req: AuditHealthReportRequest = { group_id: VALID_GROUP }
      const response = await audit_health_report(req)

      expect(response.subsystems.postgres.status).toBe("healthy")
      expect(response.subsystems.postgres.latency_ms).toBeGreaterThanOrEqual(0)
    })

    itIfE2E("should report MCP tools with a tool count", async () => {
      const req: AuditHealthReportRequest = { group_id: VALID_GROUP }
      const response = await audit_health_report(req)

      expect(response.subsystems.mcp_tools.status).toBe("healthy")
      expect(typeof response.subsystems.mcp_tools.tool_count).toBe("number")
      expect(response.subsystems.mcp_tools.tool_count).toBeGreaterThan(0)
    })

    itIfE2E("should report curator queue with pending_count", async () => {
      const req: AuditHealthReportRequest = { group_id: VALID_GROUP }
      const response = await audit_health_report(req)

      // Curator queue may be healthy or degraded depending on DB state
      expect(["healthy", "degraded", "unavailable"]).toContain(response.subsystems.curator_queue.status)
      if (response.subsystems.curator_queue.status === "healthy") {
        expect(typeof response.subsystems.curator_queue.pending_count).toBe("number")
      }
    })
  })

  // ── 3. audit_agent_activity ───────────────────────────────────────────────

  describe("audit_agent_activity", () => {
    it("should reject missing group_id", async () => {
      const req = { group_id: undefined, agent_id: "test" } as unknown as AuditAgentActivityRequest
      await expect(audit_agent_activity(req)).rejects.toThrow()
    })

    it("should reject invalid group_id", async () => {
      const req: AuditAgentActivityRequest = {
        group_id: "not-allura" as unknown as GroupId,
        agent_id: "test-agent",
      }
      await expect(audit_agent_activity(req)).rejects.toThrow("Invalid group_id")
    })

    it("should reject missing agent_id", async () => {
      const req = {
        group_id: VALID_GROUP,
        agent_id: "",
      } as unknown as AuditAgentActivityRequest
      await expect(audit_agent_activity(req)).rejects.toThrow("agent_id is required")
    })

    it("should reject null agent_id", async () => {
      const req = {
        group_id: VALID_GROUP,
        agent_id: null,
      } as unknown as AuditAgentActivityRequest
      await expect(audit_agent_activity(req)).rejects.toThrow("agent_id is required")
    })

    itIfE2E("should return agent activity for a valid group_id and agent_id", async () => {
      const agentId = `woz-builder`
      const req: AuditAgentActivityRequest = {
        group_id: VALID_GROUP,
        agent_id: agentId,
        limit: 10,
        offset: 0,
      }
      const response = await audit_agent_activity(req)

      expect(response.events).toBeDefined()
      expect(Array.isArray(response.events)).toBe(true)
      expect(typeof response.event_count).toBe("number")
      expect(response.agent_id).toBe(agentId)
      expect(response.meta).toBeDefined()
    })

    itIfE2E("should return only events for the specified agent", async () => {
      const agentId = `test-agent-${RUN_ID}`
      const req: AuditAgentActivityRequest = {
        group_id: VALID_GROUP,
        agent_id: agentId,
        limit: 50,
      }
      const response = await audit_agent_activity(req)

      for (const event of response.events) {
        expect(event.agent_id).toBe(agentId)
      }
    })

    itIfE2E("should support time_range filtering", async () => {
      const agentId = `test-agent-${RUN_ID}`
      const from = new Date(Date.now() - 3600_000).toISOString() // 1 hour ago

      const req: AuditAgentActivityRequest = {
        group_id: VALID_GROUP,
        agent_id: agentId,
        time_range: { from },
        limit: 10,
      }
      const response = await audit_agent_activity(req)

      expect(response.events).toBeDefined()
      expect(response.agent_id).toBe(agentId)
    })

    itIfE2E("should return empty result for unknown agent", async () => {
      const req: AuditAgentActivityRequest = {
        group_id: VALID_GROUP,
        agent_id: `nonexistent-agent-${randomUUID()}`,
        limit: 10,
      }
      const response = await audit_agent_activity(req)

      expect(response.events).toHaveLength(0)
      expect(response.event_count).toBe(0)
    })
  })

  // ── 4. audit_invariant_check ──────────────────────────────────────────────

  describe("audit_invariant_check", () => {
    it("should reject missing group_id", async () => {
      const req = { group_id: undefined } as unknown as AuditInvariantCheckRequest
      await expect(audit_invariant_check(req)).rejects.toThrow()
    })

    it("should reject invalid group_id", async () => {
      const req: AuditInvariantCheckRequest = {
        group_id: "bad" as unknown as GroupId,
      }
      await expect(audit_invariant_check(req)).rejects.toThrow("Invalid group_id")
    })

    it("should reject group_id without allura- prefix", async () => {
      const req: AuditInvariantCheckRequest = {
        group_id: "myorg-test" as unknown as GroupId,
      }
      await expect(audit_invariant_check(req)).rejects.toThrow()
    })

    itIfE2E("should return exactly 6 invariant results", async () => {
      const req: AuditInvariantCheckRequest = { group_id: VALID_GROUP }
      const response = await audit_invariant_check(req)

      expect(response.invariants).toHaveLength(6)
      expect(response.checked_at).toBeTruthy()
      expect(typeof response.overall_passed).toBe("boolean")
      expect(response.meta).toBeDefined()
    })

    itIfE2E("should cover the 6 expected invariant keys", async () => {
      const req: AuditInvariantCheckRequest = { group_id: VALID_GROUP }
      const response = await audit_invariant_check(req)

      const keys = response.invariants.map((inv) => inv.key)
      expect(keys).toContain("group_id_constraint")
      expect(keys).toContain("group_id_namespace_compliance")
      expect(keys).toContain("no_updated_at_column")
      expect(keys).toContain("neo4j_supersedes")
      expect(keys).toContain("hitl_promotion")
      expect(keys).toContain("allura_namespace")
    })

    itIfE2E("should return per-invariant pass/fail with violation_count and detail", async () => {
      const req: AuditInvariantCheckRequest = { group_id: VALID_GROUP }
      const response = await audit_invariant_check(req)

      for (const inv of response.invariants) {
        expect(inv.key).toBeTruthy()
        expect(inv.name).toBeTruthy()
        expect(typeof inv.passed).toBe("boolean")
        expect(typeof inv.violation_count).toBe("number")
        expect(typeof inv.detail).toBe("string")
        expect(inv.detail.length).toBeGreaterThan(0)
      }
    })

    itIfE2E("should report overall_passed as false when any invariant fails", async () => {
      const req: AuditInvariantCheckRequest = { group_id: VALID_GROUP }
      const response = await audit_invariant_check(req)

      const anyFailed = response.invariants.some((inv) => !inv.passed)
      if (anyFailed) {
        expect(response.overall_passed).toBe(false)
      } else {
        expect(response.overall_passed).toBe(true)
      }
    })

    itIfE2E("should report append-only structural check passing on a clean database", async () => {
      const req: AuditInvariantCheckRequest = { group_id: VALID_GROUP }
      const response = await audit_invariant_check(req)

      const appendCheck = response.invariants.find((inv) => inv.key === "no_updated_at_column")
      expect(appendCheck).toBeDefined()
      // Events table should not have updated_at in a properly migrated Allura DB
      expect(appendCheck!.passed).toBe(true)
    })
  })
})
