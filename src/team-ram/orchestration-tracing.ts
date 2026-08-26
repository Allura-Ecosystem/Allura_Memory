/**
 * Orchestration Tracing — Logs Team RAM orchestration events to PostgreSQL.
 *
 * Provides structured trace logging for every orchestration run:
 * - session start/end
 * - skill selection (plan)
 * - skill dispatch (parallel)
 * - success/failure per skill
 * - assembled context summary
 *
 * Uses the existing trace-logger infrastructure for consistency.
 *
 * @module team-ram/orchestration-tracing
 */

import { logTrace, type TraceType } from "@/lib/postgres/trace-logger"
import { validateGroupId } from "@/lib/validation/group-id"
import type { OrchestrationResult, SkillResult } from "./orchestrator"

// ── Types ────────────────────────────────────────────────────────────────

export interface OrchestrationTraceConfig {
  /** Agent ID for trace attribution (default: "team-ram-orchestrator") */
  agentId?: string
  /** Group ID — validated at construction */
  groupId: string
  /** Verified workspace carried by every Team RAM trace. */
  workspaceId: string
  /** Optional workflow ID to link traces */
  workflowId?: string
  /** Whether tracing is enabled (default: true) */
  enabled?: boolean
}

// ── Trace Helper ─────────────────────────────────────────────────────────

async function emit(
  config: OrchestrationTraceConfig,
  traceType: TraceType,
  content: string,
  confidence: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (config.enabled === false) return

  try {
    await logTrace({
      agent_id: config.agentId ?? "team-ram-orchestrator",
      group_id: validateGroupId(config.groupId),
      workspace_id: config.workspaceId,
      trace_type: traceType,
      content,
      confidence,
      workflow_id: config.workflowId,
      metadata,
    })
  } catch (error) {
    // Tracing should never break orchestration.
    // Log and continue — this is operational telemetry, not a gate.
    console.error(
      "[OrchestrationTracing] Failed to emit trace:",
      error instanceof Error ? error.message : error,
    )
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Trace the start of an orchestration run.
 */
export async function traceOrchestrationStart(
  config: OrchestrationTraceConfig,
  goal: string,
  planSkillNames: string[],
): Promise<void> {
  await emit(config, "decision", "orchestration_start", 1.0, {
    event: "orchestration_start",
    goal_preview: goal.slice(0, 200),
    skills_selected: planSkillNames,
  })
}

/**
 * Trace a single skill dispatch result.
 */
export async function traceSkillResult(
  config: OrchestrationTraceConfig,
  result: SkillResult,
): Promise<void> {
  const traceType: TraceType = result.ok ? "contribution" : "error"
  const confidence = result.ok ? 0.9 : 0.0

  await emit(config, traceType, `skill_dispatch: ${result.skillName}/${result.toolName}`, confidence, {
    event: "skill_dispatch",
    skill_name: result.skillName,
    tool_name: result.toolName,
    assigned_agent: result.assignedAgent,
    ok: result.ok,
    attempts: result.attempts,
    error: result.error ?? undefined,
  })
}

/**
 * Trace the completion of an orchestration run with summary.
 */
export async function traceOrchestrationEnd(
  config: OrchestrationTraceConfig,
  result: OrchestrationResult,
): Promise<void> {
  const successCount = result.results.filter((r) => r.ok).length
  const failureCount = result.context.failures.length
  const overallConfidence = result.results.length > 0 ? successCount / result.results.length : 0

  await emit(config, "decision", "orchestration_end", overallConfidence, {
    event: "orchestration_end",
    goal_preview: result.task.goal.slice(0, 200),
    total_skills: result.results.length,
    success_count: successCount,
    failure_count: failureCount,
    context_keys: Object.keys(result.context).filter(
      (k) => {
        const val = result.context[k as keyof typeof result.context]
        return Array.isArray(val) ? val.length > 0 : false
      },
    ),
    failures: failureCount > 0
      ? result.context.failures.map((f) => ({ skill: f.skillName, tool: f.toolName, error: f.error }))
      : undefined,
  })
}

/**
 * Create a traced orchestration wrapper.
 *
 * Wraps `orchestrateTeamRamTask` to emit traces for start, each dispatch,
 * and end. Returns the original result unchanged — tracing is a side effect.
 *
 * Usage:
 * ```typescript
 * const tracedOrchestrate = createTracedOrchestrator({ groupId: "allura-system" })
 * const result = await tracedOrchestrate(task, executor)
 * ```
 */
export function createTracedOrchestrator(config: OrchestrationTraceConfig) {
  return async (
    task: import("./orchestrator").TeamRamTask,
    executor: import("./orchestrator").SkillExecutor,
  ): Promise<OrchestrationResult> => {
    const { orchestrateTeamRamTask, selectSkills } = await import("./orchestrator")

    if (config.groupId !== task.groupId || config.workspaceId !== task.workspaceId) {
      throw new Error("Team RAM trace scope must match task workspace authority")
    }
    const plan = selectSkills(task)
    await traceOrchestrationStart(config, task.goal, plan.map((c) => c.skillName))

    const result = await orchestrateTeamRamTask(task, executor)

    // Trace individual results
    for (const skillResult of result.results) {
      await traceSkillResult(config, skillResult)
    }

    await traceOrchestrationEnd(config, result)

    return result
  }
}