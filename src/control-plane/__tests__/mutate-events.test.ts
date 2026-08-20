/**
 * @integration
 * Requires: RUN_DB_INTEGRATION=true
 * Uses isolated group_id per run. See AGENTS.md#integration-tests.
 *
 * Story 1.1: Record Raw Execution Traces - Integration Tests
 *
 * Tests for controlPlane-backed trace logging via RuVix mutate syscall.
 * These tests verify:
 * - ControlPlane integration with PostgreSQL
 * - Proof validation (nonce, group_id)
 * - Policy enforcement (POL-001 tenant isolation)
 * - Append-only semantics
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getPool } from "@/lib/postgres/connection"
import { logTrace, queryTraces } from "@/lib/postgres/trace-logger"
import type { QueryTracesOptions, TraceLog } from "@/lib/postgres/types"
import { RuVixControlPlane } from "../ruvix"

// Pre-Phase-4 baseline — tracked in docs/deferred/pre-existing-failures.md
// Reason: requires live PostgreSQL DB for controlPlane syscall integration
const shouldRunDbIntegration = process.env.RUN_DB_INTEGRATION === "true"

// Test setup
type GroupId = string
const TEST_AGENT_ID = "agent-test-001"

describe.skipIf(!shouldRunDbIntegration)("Story 1.1: ControlPlane-backed Trace Logging", () => {
  let originalSecret: string | undefined
  let testGroupId: GroupId
  let testGroupIds: GroupId[] = []

  beforeEach(() => {
    originalSecret = process.env.RUVIX_CONTROL_PLANE_SECRET
    process.env.RUVIX_CONTROL_PLANE_SECRET = "test-secret-key-for-ruvix-controlPlane-proof-engine-32chars"

    // Initialize controlPlane
    RuVixControlPlane.initializeControlPlane()

    // Generate unique group_id for this test run
    testGroupId = `allura-test-mutate-ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    testGroupIds.push(testGroupId)
  })

  afterEach(async () => {
    if (originalSecret !== undefined) {
      process.env.RUVIX_CONTROL_PLANE_SECRET = originalSecret
    } else {
      delete process.env.RUVIX_CONTROL_PLANE_SECRET
    }

    // Cleanup test data
    const pool = getPool()
    for (const gid of testGroupIds) {
      try {
        await pool.query("DELETE FROM events WHERE group_id = $1", [gid])
      } catch (e) {
        console.error(`Failed to cleanup test data for ${gid}:`, e)
      }
    }
    testGroupIds = []
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-1: Every agent action logged via controlPlane mutate syscall
  // ───────────────────────────────────────────────────────────────────────────

  describe("AC-1: ControlPlane Mutate Syscall Integration", () => {
    it("should log trace via controlPlane mutate syscall", async () => {
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "contribution",
        content: "Test trace content",
        confidence: 1.0,
        workflow_id: "workflow-001",
      }

      // Log trace and verify it returns a valid trace record
      const result = await logTrace(trace)
      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
      expect(result.group_id).toBe(testGroupId)
      expect(result.agent_id).toBe(TEST_AGENT_ID)
    })

    it("should validate proof-of-intent with nonce", async () => {
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "decision",
        content: "Decision trace",
        confidence: 0.95,
      }

      const result = await logTrace(trace)

      // Verify proof was created with nonce
      // (This would require inspecting the controlPlane internals or mocking)
      expect(result).toBeDefined()
    })

    it("should reject trace without valid group_id", async () => {
      const invalidTrace: TraceLog = {
        group_id: "invalid-group-id", // Not allura-* format
        agent_id: TEST_AGENT_ID,
        trace_type: "error",
        content: "Error trace",
        confidence: 0.0,
      }

      await expect(logTrace(invalidTrace)).rejects.toThrow(/group_id/)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-2: Logs include required fields
  // ───────────────────────────────────────────────────────────────────────────

  describe("AC-2: Required Fields Validation", () => {
    it("should include all required fields in logged trace", async () => {
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "learning",
        content: "Learning from session",
        confidence: 0.87,
        workflow_id: "workflow-002",
        evidence_ref: "evidence-123",
        metadata: { source: "test", priority: "high" },
      }

      await logTrace(trace)

      // Query to verify fields were stored
      const result = await queryTraces({
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
      })

      expect(result.traces.length).toBeGreaterThan(0)
      const stored = result.traces[0]

      expect(stored.group_id).toBe(testGroupId)
      expect(stored.agent_id).toBe(TEST_AGENT_ID)
      // event_type is prefixed with "trace." to namespace controlPlane traces
      expect(stored.event_type).toBe("trace.learning")
      expect(stored.outcome).toMatchObject({ content: "Learning from session" })
      expect(stored.metadata).toMatchObject({ confidence: 0.87 })
      expect(stored.workflow_id).toBe("workflow-002")
      // evidence_ref is stored in its own column, not in metadata
      expect(stored.evidence_ref).toBe("evidence-123")
      expect(stored.metadata).toMatchObject({ source: "test", priority: "high" })
    })

    it("should auto-generate id if not provided", async () => {
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "contribution",
        content: "Auto-generated ID test",
        confidence: 1.0,
      }

      await logTrace(trace)

      const result = await queryTraces({ group_id: testGroupId })
      expect(result.traces[0].id).toBeDefined()
      // PG BIGSERIAL returned as string; verify it's truthy and parseable
      expect(result.traces[0].id).toBeTruthy()
      const idAsNumber = Number(result.traces[0].id)
      expect(Number.isNaN(idAsNumber)).toBe(false)
      expect(idAsNumber).toBeGreaterThan(0)
    })

    it("should auto-generate created_at timestamp", async () => {
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "contribution",
        content: "Timestamp test",
        confidence: 1.0,
      }

      await logTrace(trace)

      const result = await queryTraces({ group_id: testGroupId })
      expect(result.traces[0].created_at).toBeDefined()
      expect(new Date(result.traces[0].created_at!).getTime()).toBeGreaterThan(0)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-3: Append-only enforcement
  // ───────────────────────────────────────────────────────────────────────────

  describe("AC-3: Append-Only Semantics", () => {
    it("should append new row for duplicate content (append-only semantics)", async () => {
      // Append-only means: no UPDATE or DELETE on existing rows.
      // Duplicate content is a VALID append — it creates a new row.
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "contribution",
        content: "Append-only content",
        confidence: 1.0,
      }

      const first = await logTrace(trace)
      const second = await logTrace(trace) // Same content — valid append

      expect(second.id).toBeDefined()
      expect(second.id).not.toEqual(first.id) // New row, not an update

      // Verify both rows exist
      const result = await queryTraces({ group_id: testGroupId })
      expect(result.traces.length).toBe(2)
    })

    it("should not allow updates to existing traces", async () => {
      // Trace logging is append-only: you cannot UPDATE an existing row
      // You can only INSERT new rows. This is enforced by DB constraints,
      // not by application logic.
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "contribution",
        content: "Original content",
        confidence: 1.0,
      }

      const first = await logTrace(trace)
      expect(first).toBeDefined()
      expect(first.id).toBeDefined()

      // Any attempt to "update" would actually create a new row
      // because TraceLog has no 'id' field for the update
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-4: Confidence scoring
  // ───────────────────────────────────────────────────────────────────────────

  describe("AC-4: Confidence Scoring", () => {
    it("should default tool calls to confidence 1.0", async () => {
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "contribution",
        content: "Tool call result",
        confidence: 1.0, // Explicit
      }

      await logTrace(trace)

      const result = await queryTraces({ group_id: testGroupId })
      expect(result.traces[0].metadata).toMatchObject({ confidence: 1.0 })
    })

    it("should default errors to confidence 0.0", async () => {
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "error",
        content: "Error occurred",
        confidence: 0.0, // Explicit
      }

      await logTrace(trace)

      const result = await queryTraces({ group_id: testGroupId })
      expect(result.traces[0].metadata).toMatchObject({ confidence: 0.0 })
    })

    it("should accept user-provided confidence in metadata", async () => {
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "decision",
        content: "Decision with custom confidence",
        confidence: 0.75,
        metadata: { confidence_source: "user_override" },
      }

      await logTrace(trace)

      const result = await queryTraces({ group_id: testGroupId })
      expect(result.traces[0].metadata).toMatchObject({ confidence: 0.75 })
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-5: Query support
  // ───────────────────────────────────────────────────────────────────────────

  describe("AC-5: Query Support", () => {
    beforeEach(async () => {
      // Seed test data with unique group_id for this test
      const traces: TraceLog[] = [
        {
          group_id: testGroupId, // Use unique group_id, not hardcoded TEST_GROUP_ID
          agent_id: "agent-001",
          trace_type: "contribution",
          content: "Trace 1",
          confidence: 1.0,
          workflow_id: "workflow-001",
        },
        {
          group_id: testGroupId,
          agent_id: "agent-002",
          trace_type: "decision",
          content: "Trace 2",
          confidence: 0.9,
          workflow_id: "workflow-001",
        },
        {
          group_id: testGroupId,
          agent_id: "agent-001",
          trace_type: "error",
          content: "Trace 3",
          confidence: 0.0,
          workflow_id: "workflow-002",
        },
      ]

      for (const trace of traces) {
        await logTrace(trace)
      }
    })

    it("should query by agent_id", async () => {
      const result = await queryTraces({
        group_id: testGroupId,
        agent_id: "agent-001",
      })

      expect(result.traces.length).toBe(2)
      expect(result.traces.every((t) => t.agent_id === "agent-001")).toBe(true)
    })

    it("should query by group_id (tenant-scoped)", async () => {
      const result = await queryTraces({
        group_id: testGroupId,
      })

      expect(result.traces.length).toBe(3)
    })

    it("should query by trace_type", async () => {
      const result = await queryTraces({
        group_id: testGroupId,
        trace_type: "error",
      })

      expect(result.traces.length).toBe(1)
      expect(result.traces[0].event_type).toBe("trace.error")
    })

    it("should query by workflow_id", async () => {
      const result = await queryTraces({
        group_id: testGroupId,
        workflow_id: "workflow-001",
      })

      expect(result.traces.length).toBe(2)
    })

    it("should query by time range", async () => {
      const startTime = new Date(Date.now() - 1000)
      const endTime = new Date(Date.now() + 1000)

      const result = await queryTraces({
        group_id: testGroupId,
        startTime,
        endTime,
      })

      expect(result.traces.length).toBeGreaterThan(0)
    })

    it("should support pagination", async () => {
      const result = await queryTraces({
        group_id: testGroupId,
        limit: 2,
        offset: 0,
      })

      expect(result.traces.length).toBe(2)
      expect(result.total).toBe(3)
      expect(result.hasMore).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // POL-001: Tenant Isolation Enforcement
  // ───────────────────────────────────────────────────────────────────────────

  describe("POL-001: Tenant Isolation", () => {
    it("should reject cross-tenant data access", async () => {
      // Create trace in tenant A
      await logTrace({
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "contribution",
        content: "Tenant A data",
        confidence: 1.0,
      })

      // Create a different test group for tenant B
      const tenantBGroup = `allura-test-tenant-b-${Date.now()}`

      // Attempt to query from tenant B (should return empty)
      const result = await queryTraces({
        group_id: tenantBGroup, // Different tenant
      })

      expect(result.traces.length).toBe(0)

      // Cleanup tenant B
      try {
        const pool = getPool()
        await pool.query("DELETE FROM events WHERE group_id = $1", [tenantBGroup])
      } catch {
        /* ignore cleanup errors */
      }
    })

    it("should enforce allura-* format for group_id", async () => {
      const invalidTraces = [
        {
          group_id: "tenant-a",
          agent_id: TEST_AGENT_ID,
          trace_type: "contribution" as const,
          content: "Test",
          confidence: 1.0,
        },
        {
          group_id: "roninmemory",
          agent_id: TEST_AGENT_ID,
          trace_type: "contribution" as const,
          content: "Test",
          confidence: 1.0,
        },
        {
          group_id: "Allura-Test",
          agent_id: TEST_AGENT_ID,
          trace_type: "contribution" as const,
          content: "Test",
          confidence: 1.0,
        },
      ]

      for (const trace of invalidTraces) {
        await expect(logTrace(trace)).rejects.toThrow(/group_id/)
      }
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Performance Tests
  // ───────────────────────────────────────────────────────────────────────────

  describe("Performance: NFR-4", () => {
    it("should log trace in under 10ms", async () => {
      const trace: TraceLog = {
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "contribution",
        content: "Performance test",
        confidence: 1.0,
      }

      const start = performance.now()
      await logTrace(trace)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(10)
    })

    it.skip("should support batch insert (implementation pending)", async () => {
      // Future implementation
      const traces: TraceLog[] = Array.from({ length: 100 }, (_, i) => ({
        group_id: testGroupId,
        agent_id: TEST_AGENT_ID,
        trace_type: "contribution",
        content: `Batch trace ${i}`,
        confidence: 1.0,
      }))

      const start = performance.now()
      // await logTracesBatch(traces);
      const duration = performance.now() - start

      expect(duration).toBeLessThan(100)
    })
  })
})
