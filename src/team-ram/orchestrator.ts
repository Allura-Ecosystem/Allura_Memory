import { AGENT_MANIFEST } from "@/lib/agents/agent-manifest"
import { canonicalizeAgentId } from "@/lib/agents/canonical-identity"
import { validateGroupId } from "@/lib/validation/group-id"

export type TeamRamSkillName = "skill-neo4j-memory" | "skill-cypher-query" | "skill-database"

export interface TeamRamTask {
  goal: string
  groupId: string
  workspaceId: string
  query?: string
  cypher?: string
  sql?: string
  limit?: number
  offset?: number
  needs?: {
    memory?: boolean
    graph?: boolean
    traces?: boolean
  }
  maxRetriesPerSkill?: number
}

export interface SkillCall {
  skillName: TeamRamSkillName
  toolName: string
  assignedAgent: string
  input: Record<string, unknown>
}

export interface SkillResult {
  skillName: TeamRamSkillName
  toolName: string
  assignedAgent: string
  ok: boolean
  output?: unknown
  error?: string
  attempts: number
}

export interface OrchestrationContext {
  memories: unknown[]
  graph: unknown[]
  traces: unknown[]
  failures: Array<Pick<SkillResult, "skillName" | "toolName" | "error" | "assignedAgent">>
}

export interface OrchestrationResult {
  task: TeamRamTask
  plan: SkillCall[]
  results: SkillResult[]
  context: OrchestrationContext
}

export interface SkillExecutor {
  execute(call: SkillCall): Promise<unknown>
}

const SKILL_AGENT_MAP: Record<TeamRamSkillName, string> = {
  "skill-neo4j-memory": "scout",
  "skill-cypher-query": "knuth",
  "skill-database": "hightower",
}

function assertKnownAgent(agentId: string): string {
  const canonical = canonicalizeAgentId(agentId)
  if (!AGENT_MANIFEST.has(canonical)) {
    throw new Error(`Unknown Team RAM agent: ${agentId}`)
  }
  return canonical
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  const lowered = text.toLowerCase()
  return keywords.some((keyword) => lowered.includes(keyword))
}

function dedupePlan(calls: SkillCall[]): SkillCall[] {
  const seen = new Set<string>()
  const result: SkillCall[] = []
  for (const call of calls) {
    const key = `${call.skillName}:${call.toolName}:${JSON.stringify(call.input)}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(call)
    }
  }
  return result
}

/**
 * Select skills for Team RAM task execution with staged memory-first routing:
 * 1. Always prefer skill-neo4j-memory first
 * 2. Add skill-database only when evidence/traces/audit details are needed
 * 3. Add skill-cypher-query only when targeted graph traversal/schema/explicit Cypher is needed
 */
export function selectSkills(task: TeamRamTask): SkillCall[] {
  const groupId = validateGroupId(task.groupId)
  const workspaceId = String(task.workspaceId ?? "").trim()
  if (!workspaceId) throw new Error("workspaceId is required for Team RAM orchestration")
  const text = [task.goal, task.query, task.cypher, task.sql].filter(Boolean).join(" ")
  const calls: SkillCall[] = []

  // STAGE 1: Memory-first routing — always add memory skill for context retrieval
  const wantsMemory =
    task.needs?.memory === true ||
    Boolean(task.query) ||
    hasAnyKeyword(text, ["memory", "insight", "adr", "context", "decision", "recall"])

  if (wantsMemory) {
    calls.push({
      skillName: "skill-neo4j-memory",
      toolName: "recall_insight",
      assignedAgent: assertKnownAgent(SKILL_AGENT_MAP["skill-neo4j-memory"]),
      input: {
        query: task.query ?? task.goal,
        groupId,
        workspaceId,
        limit: task.limit ?? 10,
      },
    })
  }

  // STAGE 2: Database routing — only when evidence/traces/audit details are explicitly needed
  const wantsTraces =
    task.needs?.traces === true ||
    Boolean(task.sql) ||
    hasAnyKeyword(text, ["trace", "traces", "events", "postgres", "sql", "audit", "evidence", "log"])

  if (wantsTraces) {
    calls.push({
      skillName: "skill-database",
      toolName: task.sql ? "execute_sql" : "query_traces",
      assignedAgent: assertKnownAgent(SKILL_AGENT_MAP["skill-database"]),
      input: task.sql
        ? {
            query: task.sql,
            parameters: [groupId, workspaceId],
            groupId,
            workspaceId,
          }
        : {
            group_id: groupId,
            workspace_id: workspaceId,
            workspaceId,
            limit: task.limit ?? 100,
            offset: task.offset ?? 0,
            order_by: "created_at DESC",
          },
    })
  }

  // STAGE 3: Cypher routing — only when targeted graph traversal/schema/explicit Cypher is needed
  const wantsGraph =
    task.needs?.graph === true ||
    Boolean(task.cypher) ||
    hasAnyKeyword(text, ["cypher", "neo4j", "graph", "relationship", "node", "traverse"])

  if (wantsGraph) {
    calls.push({
      skillName: "skill-cypher-query",
      toolName: task.cypher ? "execute_cypher" : "get_schema_info",
      assignedAgent: assertKnownAgent(SKILL_AGENT_MAP["skill-cypher-query"]),
      input: task.cypher
        ? {
            cypher: task.cypher,
            parameters: { groupId, workspaceId },
            groupId,
            workspaceId,
          }
        : {
            groupId,
            workspaceId,
          },
    })
  }

  // STAGE 4: Fallback — if no skills selected, default to memory retrieval
  if (calls.length === 0) {
    calls.push({
      skillName: "skill-neo4j-memory",
      toolName: "recall_insight",
      assignedAgent: assertKnownAgent(SKILL_AGENT_MAP["skill-neo4j-memory"]),
      input: {
        query: task.goal,
        groupId,
        workspaceId,
        limit: task.limit ?? 10,
      },
    })
  }

  // STAGE 5: Ensure memory is always first when selected (staged memory-first routing)
  // Move skill-neo4j-memory to front if it exists
  const memoryIndex = calls.findIndex((call) => call.skillName === "skill-neo4j-memory")
  if (memoryIndex > 0) {
    const [memoryCall] = calls.splice(memoryIndex, 1)
    calls.unshift(memoryCall)
  }

  return dedupePlan(calls)
}

async function executeWithRetry(executor: SkillExecutor, call: SkillCall, maxRetries: number): Promise<SkillResult> {
  let attempt = 0
  let lastError: unknown = null

  while (attempt <= maxRetries) {
    attempt += 1
    try {
      const output = await executor.execute(call)
      return {
        skillName: call.skillName,
        toolName: call.toolName,
        assignedAgent: call.assignedAgent,
        ok: true,
        output,
        attempts: attempt,
      }
    } catch (error) {
      lastError = error
    }
  }

  return {
    skillName: call.skillName,
    toolName: call.toolName,
    assignedAgent: call.assignedAgent,
    ok: false,
    error: lastError instanceof Error ? lastError.message : "Unknown orchestration error",
    attempts: maxRetries + 1,
  }
}

export function assembleContext(results: SkillResult[]): OrchestrationContext {
  const context: OrchestrationContext = {
    memories: [],
    graph: [],
    traces: [],
    failures: [],
  }

  for (const result of results) {
    if (!result.ok) {
      context.failures.push({
        skillName: result.skillName,
        toolName: result.toolName,
        error: result.error,
        assignedAgent: result.assignedAgent,
      })
      continue
    }

    if (result.skillName === "skill-neo4j-memory") {
      context.memories.push(result.output)
    } else if (result.skillName === "skill-cypher-query") {
      context.graph.push(result.output)
    } else if (result.skillName === "skill-database") {
      context.traces.push(result.output)
    }
  }

  return context
}

/**
 * True staged execution for Team RAM orchestrator.
 * Skills execute in priority order with retries preserved per call:
 * 1. skill-neo4j-memory (if selected) — always first for context
 * 2. skill-database (if selected) — for evidence/traces
 * 3. skill-cypher-query (if selected) — for graph traversal
 *
 * This replaces the old parallel Promise.all approach with sequential execution
 * ensuring proper dependency ordering (memory before graph before traces).
 */
export async function orchestrateTeamRamTask(task: TeamRamTask, executor: SkillExecutor): Promise<OrchestrationResult> {
  const normalizedTask: TeamRamTask = {
    ...task,
    groupId: validateGroupId(task.groupId),
    maxRetriesPerSkill: task.maxRetriesPerSkill ?? 1,
  }

  const plan = selectSkills(normalizedTask)

  // STAGED EXECUTION: Sequential with per-call retry logic
  const results: SkillResult[] = []
  for (const call of plan) {
    const result = await executeWithRetry(executor, call, normalizedTask.maxRetriesPerSkill ?? 1)
    results.push(result)
  }

  return {
    task: normalizedTask,
    plan,
    results,
    context: assembleContext(results),
  }
}
