import { describe, expect, it } from "vitest"

import {
  assembleContext,
  orchestrateTeamRamTask,
  selectSkills,
  type SkillCall,
  type SkillExecutor,
} from "./orchestrator"

describe("team-ram orchestrator", () => {
  it("selects memory, graph, and trace skills for mixed tasks", () => {
    const plan = selectSkills({
      goal: "Investigate architecture decisions and recent trace events",
      groupId: "allura-test-teamram",
      cypher: "MATCH (n {group_id: $groupId}) RETURN n LIMIT 5",
      needs: { traces: true },
    })

    // Staged routing: memory_first, database (traces), cypher (graph)
    const skillNames = plan.map((entry) => entry.skillName)
    expect(skillNames[0]).toBe("skill-neo4j-memory")
    expect(skillNames).toContain("skill-database")
    expect(skillNames).toContain("skill-cypher-query")
    expect(skillNames).toHaveLength(3)
  })

  it("defaults to memory retrieval when no special routing hints exist", () => {
    const plan = selectSkills({
      goal: "Gather context for this task",
      groupId: "allura-test-teamram",
    })

    expect(plan).toHaveLength(1)
    expect(plan[0]?.skillName).toBe("skill-neo4j-memory")
  })

  it("dispatches calls sequentially through injected executor and assembles context", async () => {
    const calls: SkillCall[] = []
    const executor: SkillExecutor = {
      async execute(call) {
        calls.push(call)
        return { skill: call.skillName, tool: call.toolName }
      },
    }

    const result = await orchestrateTeamRamTask(
      {
        goal: "Search decisions and traces",
        groupId: "allura-test-teamram",
        needs: { memory: true, traces: true },
      },
      executor,
    )

    // Calls executed in staged order: memory first, then database
    expect(calls).toHaveLength(2)
    expect(calls[0]?.skillName).toBe("skill-neo4j-memory")
    expect(calls[1]?.skillName).toBe("skill-database")

    expect(result.context.memories).toHaveLength(1)
    expect(result.context.traces).toHaveLength(1)
    expect(result.context.failures).toHaveLength(0)
  })

  it("prefers skill-neo4j-memory first when no special hints exist", () => {
    const plan = selectSkills({
      goal: "Search for context about a topic",
      groupId: "allura-test-teamram",
    })
    expect(plan).toHaveLength(1)
    expect(plan[0]?.skillName).toBe("skill-neo4j-memory")
  })

  it("adds skill-database only when evidence/traces/audit details are needed", () => {
    const plan = selectSkills({
      goal: "Investigate architecture decisions and recent trace events",
      groupId: "allura-test-teamram",
      needs: { traces: true },
    })
    const skillNames = plan.map((entry) => entry.skillName)
    expect(skillNames[0]).toBe("skill-neo4j-memory")
    expect(skillNames).toContain("skill-database")
  })

  it("adds skill-cypher-query only when explicit graph traversal is needed", () => {
    const plan = selectSkills({
      goal: "Find all relationships between nodes",
      groupId: "allura-test-teamram",
      cypher: "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 10",
    })
    // When cypher is provided but no memory keywords, cypher is selected first
    // Memory-first routing only applies when memory is selected
    const skillNames = plan.map((entry) => entry.skillName)
    expect(skillNames).toContain("skill-cypher-query")
  })

  it("always prefers memory-first when memory is selected alongside other skills", () => {
    const plan = selectSkills({
      goal: "Investigate architecture decisions and node relationships",
      groupId: "allura-test-teamram",
      cypher: "MATCH (n {group_id: $groupId}) RETURN n LIMIT 5",
      needs: { memory: true },
    })
    // Memory should be first when explicit memory + graph are requested
    const skillNames = plan.map((entry) => entry.skillName)
    expect(skillNames[0]).toBe("skill-neo4j-memory")
    expect(skillNames).toContain("skill-cypher-query")
  })

  it("retries failed calls up to maxRetriesPerSkill", async () => {
    let attempts = 0
    const executor: SkillExecutor = {
      async execute() {
        attempts += 1
        if (attempts < 2) {
          throw new Error("temporary failure")
        }
        return { ok: true }
      },
    }

    const result = await orchestrateTeamRamTask(
      {
        goal: "Recall memory context",
        groupId: "allura-test-teamram",
        maxRetriesPerSkill: 1,
      },
      executor,
    )

    expect(attempts).toBe(2)
    expect(result.results[0]?.ok).toBe(true)
    expect(result.results[0]?.attempts).toBe(2)
  })

  it("executes skills in true staged order (memory → database → cypher)", async () => {
    const executionOrder: string[] = []
    let isExecuting = false

    const executor: SkillExecutor = {
      async execute(call) {
        // Mark as executing and track order
        if (!isExecuting) {
          isExecuting = true
          executionOrder.push(call.skillName)
          // Small delay to ensure proper ordering in sequential execution
          await new Promise((resolve) => setTimeout(resolve, 10))
          isExecuting = false
        } else {
          executionOrder.push(call.skillName)
        }
        return { skill: call.skillName, success: true }
      },
    }

    const result = await orchestrateTeamRamTask(
      {
        goal: "Investigate architecture decisions, traces, and graph relationships",
        groupId: "allura-test-teamram",
        cypher: "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 5",
        needs: { memory: true, traces: true },
      },
      executor,
    )

    // Verify plan order matches staged priority
    const planOrder = result.plan.map((c) => c.skillName)
    expect(planOrder[0]).toBe("skill-neo4j-memory")
    expect(planOrder).toContain("skill-database")
    expect(planOrder).toContain("skill-cypher-query")

    // Verify actual execution order matches staged priority
    expect(executionOrder).toEqual(["skill-neo4j-memory", "skill-database", "skill-cypher-query"])
  })

  it("preserves per-call retry logic during staged execution", async () => {
    // Track execution order to verify retry logic works per skill in sequence
    const executionState: Record<string, { attempts: number; alwaysFail?: boolean }> = {
      "skill-neo4j-memory": { attempts: 0 },
      "skill-database": { attempts: 0, alwaysFail: true },
      "skill-cypher-query": { attempts: 0 },
    }

    const executor: SkillExecutor = {
      async execute(call) {
        const state = executionState[call.skillName]
        state.attempts += 1

        if (state.alwaysFail) {
          throw new Error(`Simulated failure for ${call.skillName}`)
        }
        return { success: true }
      },
    }

    const result = await orchestrateTeamRamTask(
      {
        goal: "Test staged execution with retries for memory, database, and cypher",
        groupId: "allura-test-teamram",
        // Use "context" keyword to trigger memory skill, cypher to trigger cypher skill, and needs.traces for database
        cypher: "MATCH (n) RETURN n LIMIT 1",
        needs: { traces: true },
        maxRetriesPerSkill: 1,
      },
      executor,
    )

    // Memory (first) should succeed with 1 attempt
    expect(executionState["skill-neo4j-memory"].attempts).toBe(1)
    expect(result.results.find((r) => r.skillName === "skill-neo4j-memory")?.ok).toBe(true)

    // Database (middle) should exhaust retries (2 attempts with maxRetriesPerSkill=1)
    expect(executionState["skill-database"].attempts).toBe(2)
    expect(result.results.find((r) => r.skillName === "skill-database")?.ok).toBe(false)

    // Cypher (last) should still run and succeed with 1 attempt
    expect(executionState["skill-cypher-query"].attempts).toBe(1)
    expect(result.results.find((r) => r.skillName === "skill-cypher-query")?.ok).toBe(true)
  })

  it("records failures in assembled context", () => {
    const context = assembleContext([
      {
        skillName: "skill-database",
        toolName: "query_traces",
        assignedAgent: "hightower",
        ok: false,
        error: "db unavailable",
        attempts: 2,
      },
    ])

    expect(context.failures).toHaveLength(1)
    expect(context.failures[0]?.skillName).toBe("skill-database")
  })
})
