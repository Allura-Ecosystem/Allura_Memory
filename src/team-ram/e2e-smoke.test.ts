/**
 * End-to-end Smoke Tests — Team RAM → Live Skills → Real Databases
 *
 * These tests validate the full orchestration stack against actual
 * PostgreSQL and Neo4j instances. They are gated behind the
 * RUN_E2E_TESTS environment variable to avoid breaking CI.
 *
 * Run: RUN_E2E_TESTS=true bun vitest run src/team-ram/e2e-smoke.test.ts
 *
 * @module team-ram/e2e-smoke
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createMcpSkillExecutor, InProcessSkillExecutor } from "./mcp-skill-executor"
import {
  type OrchestrationTraceConfig,
  traceOrchestrationEnd,
  traceOrchestrationStart,
  traceSkillResult,
} from "./orchestration-tracing"
import { orchestrateTeamRamTask, selectSkills } from "./orchestrator"

const E2E = process.env.RUN_E2E_TESTS === "true"

/**
 * Canonical test tenant for Team RAM e2e tests.
 * Must match group_id pattern ^allura-[a-z0-9-]+$.
 * Replaces the retired roninmemory tenant (banned — use allura-* namespace).
 */
const GROUP_ID = "allura-test-teamram"

// Skip entire suite when not running e2e
const describeE2E = E2E ? describe : describe.skip

describeE2E("Team RAM e2e smoke", () => {
  let executor: InProcessSkillExecutor

  beforeAll(() => {
    executor = createMcpSkillExecutor({
      cwd: process.cwd(),
      poolConnections: true,
    })
  })

  afterAll(async () => {
    if (executor) {
      await executor.destroy()
    }

    // Clean up mutable canonical_proposals rows written during tests.
    // Events rows are NOT deleted — the events table is append-only.
    try {
      const { getPool } = await import("@/lib/postgres/connection")
      const pool = getPool()
      await pool.query("DELETE FROM canonical_proposals WHERE group_id = $1", [GROUP_ID])
    } catch {
      // Best effort — do not fail the afterAll if PG is unreachable.
    }
  })

  // ── Skill Selection ──────────────────────────────────────────────────

  describe("skill selection", () => {
    it("selects memory skill for recall queries", () => {
      const plan = selectSkills({
        goal: "What do I know about authentication?",
        groupId: GROUP_ID,
      })
      expect(plan).toHaveLength(1)
      expect(plan[0]?.skillName).toBe("skill-neo4j-memory")
    })

    it("selects graph skill for cypher queries", () => {
      const plan = selectSkills({
        goal: "Run graph query",
        groupId: GROUP_ID,
        cypher: "MATCH (n:Insight) RETURN n LIMIT 3",
      })
      const names = plan.map((c) => c.skillName)
      expect(names).toContain("skill-cypher-query")
    })

    it("selects trace skill for SQL queries", () => {
      const plan = selectSkills({
        goal: "Check trace logs",
        groupId: GROUP_ID,
        sql: "SELECT * FROM events LIMIT 5",
      })
      const names = plan.map((c) => c.skillName)
      expect(names).toContain("skill-database")
    })

    it("selects all three skills for mixed queries", () => {
      const plan = selectSkills({
        goal: "Full context retrieval",
        groupId: GROUP_ID,
        cypher: "MATCH (n) RETURN n LIMIT 1",
        needs: { memory: true, traces: true },
      })
      // Documented stage order: memory (1) → traces/database (2) → graph/cypher (3)
      expect(plan.map((c) => c.skillName)).toEqual([
        "skill-neo4j-memory",
        "skill-database",
        "skill-cypher-query",
      ])
    })
  })

  // ── Live Skill Dispatch ──────────────────────────────────────────────

  describe("skill-neo4j-memory (live)", () => {
    it("recall_insight returns structured results or empty array", async () => {
      const result = await orchestrateTeamRamTask(
        {
          goal: "Search for architecture decisions",
          groupId: GROUP_ID,
          query: "architecture",
          limit: 5,
        },
        executor,
      )

      expect(result.results).toHaveLength(1)
      expect(result.results[0]?.skillName).toBe("skill-neo4j-memory")
      expect(result.results[0]?.ok).toBe(true)
      expect(result.results[0]?.attempts).toBeGreaterThanOrEqual(1)

      // Result should be an array (may be empty if no data)
      const output = result.results[0]?.output
      expect(Array.isArray(output)).toBe(true)
    }, 30_000)
  })

  describe("skill-cypher-query (live)", () => {
    it("get_schema_info returns node labels and relationship types", async () => {
      const result = await orchestrateTeamRamTask(
        {
          goal: "Get graph schema",
          groupId: GROUP_ID,
          needs: { graph: true },
        },
        executor,
      )

      const graphResult = result.results.find((r) => r.skillName === "skill-cypher-query")
      expect(graphResult).toBeDefined()
      expect(graphResult?.ok).toBe(true)

      const output = graphResult?.output as Record<string, unknown> | undefined
      expect(output).toBeDefined()
      // Schema should have nodeLabels array
      expect(Array.isArray(output?.nodeLabels) || typeof output?.schema === "object").toBe(true)
    }, 30_000)

    it("rejects the retired raw query path", async () => {
      const result = await orchestrateTeamRamTask(
        {
          goal: "Count insights",
          groupId: GROUP_ID,
          cypher: "MATCH (n:Insight) WHERE n.group_id = $groupId RETURN count(n) AS cnt",
        },
        executor,
      )

      const graphResult = result.results.find((r) => r.skillName === "skill-cypher-query")
      expect(graphResult?.ok).toBe(false)
      expect(graphResult?.error).toContain("execute_cypher has been removed")
    }, 30_000)
  })

  describe("skill-database (live)", () => {
    it("query_traces returns rows from events table", async () => {
      const result = await orchestrateTeamRamTask(
        {
          goal: "Check recent traces",
          groupId: GROUP_ID,
          needs: { traces: true },
        },
        executor,
      )

      const traceResult = result.results.find((r) => r.skillName === "skill-database")
      expect(traceResult).toBeDefined()
      expect(traceResult?.ok).toBe(true)

      const output = traceResult?.output as Record<string, unknown> | undefined
      expect(output).toBeDefined()
      // Should have rows array and total count
      expect(typeof output?.total).toBe("number")
    }, 30_000)

    it("execute_sql runs a parameterized tenant-scoped query", async () => {
      const result = await orchestrateTeamRamTask(
        {
          goal: "Count tenant records",
          groupId: GROUP_ID,
          sql: "SELECT COUNT(*)::int AS total FROM events WHERE group_id = $1",
        },
        executor,
      )

      const databaseResult = result.results.find((r) => r.skillName === "skill-database")
      expect(databaseResult?.ok).toBe(true)
      const output = databaseResult?.output as Record<string, unknown> | undefined
      expect(Array.isArray(output?.rows)).toBe(true)
    }, 30_000)
  })

  // ── Full Orchestration ───────────────────────────────────────────────

  describe("full orchestration", () => {
    it("dispatches successful memory and trace skills and assembles context", async () => {
      const result = await orchestrateTeamRamTask(
        {
          goal: "Full context: memory and traces",
          groupId: GROUP_ID,
          needs: { memory: true, traces: true },
        },
        executor,
      )

      expect(result.plan).toHaveLength(2)
      expect(result.results).toHaveLength(2)

      expect(Array.isArray(result.context.memories)).toBe(true)
      expect(Array.isArray(result.context.graph)).toBe(true)
      expect(Array.isArray(result.context.traces)).toBe(true)
      expect(Array.isArray(result.context.failures)).toBe(true)
      expect(result.results.every((result) => result.ok)).toBe(true)
      expect(result.context.failures).toHaveLength(0)
    }, 60_000)

    it("retries and records failures for unreachable skills", async () => {
      // Use a custom executor that fails for one skill
      const failingExecutor = {
        execute: async (call: import("./orchestrator").SkillCall) => {
          if (call.skillName === "skill-database") {
            throw new Error("simulated DB failure")
          }
          return executor.execute(call)
        },
      }

      const result = await orchestrateTeamRamTask(
        {
          goal: "Test with one failing skill",
          groupId: GROUP_ID,
          needs: { memory: true, traces: true },
          maxRetriesPerSkill: 1,
        },
        failingExecutor,
      )

      // Database skill should have failed
      const dbResult = result.results.find((r) => r.skillName === "skill-database")
      expect(dbResult?.ok).toBe(false)
      expect(dbResult?.error).toContain("simulated DB failure")

      // Context should record the failure
      expect(result.context.failures.length).toBeGreaterThanOrEqual(1)
    }, 30_000)
  })

  // ── Tracing Integration ─────────────────────────────────────────────

  describe("orchestration tracing (live)", () => {
    const traceConfig: OrchestrationTraceConfig = {
      groupId: GROUP_ID,
      agentId: "e2e-smoke-test",
      workflowId: "e2e-smoke-workflow",
    }

    it("emits traces without throwing", async () => {
      // Start trace
      await traceOrchestrationStart(traceConfig, "e2e test goal", ["skill-neo4j-memory"])

      // Run orchestration
      const result = await orchestrateTeamRamTask(
        {
          goal: "Traced memory recall",
          groupId: GROUP_ID,
        },
        executor,
      )

      // Trace each result
      for (const skillResult of result.results) {
        await traceSkillResult(traceConfig, skillResult)
      }

      // End trace
      await traceOrchestrationEnd(traceConfig, result)

      // If we got here without throwing, tracing is working
      expect(true).toBe(true)
    }, 30_000)
  })
})