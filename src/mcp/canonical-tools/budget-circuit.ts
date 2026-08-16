/**
 * Budget Enforcer & Circuit Breaker Setup for Canonical MCP Tools
 *
 * Fail-open design: if budget enforcer or circuit breaker can't initialize,
 * requests pass through. Budget is only enforced on write operations.
 * Circuit breakers wrap database calls, not tool handlers.
 */

import { BudgetEnforcer } from "@/lib/budget/enforcer"
import { checkBudgetBeforeCall, createSessionId, updateBudgetAfterCall } from "@/lib/budget/middleware-integration"
import { DEFAULT_BUDGET_CONFIG, type SessionId } from "@/lib/budget/types"
import { BreakerManager } from "@/lib/circuit-breaker/manager"

const BUDGET_ENABLED = process.env.BUDGET_ENABLED !== "false"
const BUDGET_MAX_RPM = parseInt(process.env.BUDGET_MAX_RPM || "60", 10)
const BUDGET_MAX_TOKENS_PER_HOUR = parseInt(process.env.BUDGET_MAX_TOKENS_PER_HOUR || "100000", 10)
const BUDGET_MAX_TIME_MS = parseInt(process.env.BUDGET_MAX_TIME_MS || "86400000", 10) // 24h default
const BUDGET_MAX_COST_USD = parseFloat(process.env.BUDGET_MAX_COST_USD || "50.0")
const BUDGET_MAX_STEPS = parseInt(process.env.BUDGET_MAX_STEPS || "1000", 10)
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || "5", 10)
const CIRCUIT_BREAKER_RESET_TIMEOUT = parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || "30000", 10)

let budgetEnforcer: BudgetEnforcer | null = null
let breakerManager: BreakerManager | null = null

export function getBudgetEnforcer(): BudgetEnforcer | null {
  if (!BUDGET_ENABLED) return null
  try {
    if (!budgetEnforcer) {
      budgetEnforcer = new BudgetEnforcer({
        budgetConfig: {
          ...DEFAULT_BUDGET_CONFIG,
          defaults: {
            ...DEFAULT_BUDGET_CONFIG.defaults,
            maxTokens: BUDGET_MAX_TOKENS_PER_HOUR,
            maxToolCalls: BUDGET_MAX_RPM,
            maxTimeMs: BUDGET_MAX_TIME_MS,
            maxCostUsd: BUDGET_MAX_COST_USD,
            maxSteps: BUDGET_MAX_STEPS,
          },
        },
        enabled: true,
      })
    }
    return budgetEnforcer
  } catch (error) {
    console.error("[budget] Failed to initialize budget enforcer, failing open:", error)
    return null
  }
}

export function getBreakerManager(): BreakerManager | null {
  try {
    if (!breakerManager) {
      breakerManager = new BreakerManager({
        defaultConfig: {
          errorThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
          openTimeoutMs: CIRCUIT_BREAKER_RESET_TIMEOUT,
        },
        enableAutoRecovery: true,
        healthCheckIntervalMs: 30000,
        maxBreakersPerScope: 100,
      })
    }
    return breakerManager
  } catch (error) {
    console.error("[circuit-breaker] Failed to initialize breaker manager, failing open:", error)
    return null
  }
}

const activeSessions = new Map<string, SessionId>()

export function ensureSession(groupId: string, agentId: string): SessionId | null {
  const enforcer = getBudgetEnforcer()
  if (!enforcer) return null

  const sessionKey = `${groupId}:${agentId}`
  const existing = activeSessions.get(sessionKey)
  if (existing) {
    if (enforcer.getSessionState(existing)) {
      return existing
    }
    activeSessions.delete(sessionKey)
  }

  try {
    const sessionId = createSessionId(groupId, agentId, `mcp-${Date.now()}`)
    enforcer.startSession(sessionId)
    activeSessions.set(sessionKey, sessionId)
    return sessionId
  } catch (error) {
    console.warn("[budget] Failed to start session, failing open:", error)
    return null
  }
}

export async function checkBudget(
  groupId: string,
  agentId: string,
  toolName: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const enforcer = getBudgetEnforcer()
  const sessionId = ensureSession(groupId, agentId)

  if (!enforcer || !sessionId) {
    return { allowed: true }
  }

  try {
    const budgetCheck = checkBudgetBeforeCall(enforcer, sessionId)
    if (!budgetCheck.allowed) {
      const halt = budgetCheck.haltReason
      const retryAfter = halt?.type === "time_limit" ? Math.ceil((halt.limitMs - halt.elapsedMs) / 1000) : undefined
      console.warn(`[budget] Budget exceeded for ${groupId}/${agentId} on ${toolName}: ${budgetCheck.reason}`)
      return { allowed: false, reason: budgetCheck.reason, retryAfter }
    }
    return { allowed: true }
  } catch (error) {
    console.error("[budget] Budget check failed, failing open:", error)
    return { allowed: true }
  }
}

export function recordToolCall(
  groupId: string,
  agentId: string,
  toolName: string,
  durationMs: number,
  success: boolean
): void {
  const enforcer = getBudgetEnforcer()
  const sessionId = ensureSession(groupId, agentId)
  if (!enforcer || !sessionId) return

  try {
    updateBudgetAfterCall(enforcer, sessionId, { toolName, durationMs, success })
  } catch (error) {
    console.warn("[budget] Failed to record tool call:", error)
  }
}

export async function withCircuitBreaker<T>(
  breakerName: string,
  groupId: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const manager = getBreakerManager()
  if (!manager) {
    return fn()
  }

  try {
    const { result, breakerResult } = await manager.executeThrough(breakerName, groupId, operation, fn)

    if (!breakerResult.allowed) {
      throw new Error(`Circuit breaker open for ${breakerName}: ${breakerResult.rejectionReason}`)
    }

    if (!breakerResult.success && breakerResult.error) {
      throw breakerResult.error
    }

    return result as T
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Circuit breaker open")) {
      console.warn(`[circuit-breaker] ${error.message}`)
    }
    throw error
  }
}

/**
 * Reset budget and circuit breaker state. Called from resetConnections()
 * to ensure a clean slate in tests after environment variable changes.
 */
export function resetBudgetState(): void {
  budgetEnforcer = null
  breakerManager = null
  activeSessions.clear()
}

/**
 * Admin: Reset halted sessions for a specific group.
 * If groupId is provided, only sessions matching that group prefix are reset.
 * If omitted, ALL halted sessions are reset.
 * Returns count of sessions that were un-halted.
 */
export function resetHaltedGroup(groupId?: string): number {
  const enforcer = getBudgetEnforcer()
  if (!enforcer) return 0

  if (!groupId) {
    return enforcer.resetAllHaltedSessions()
  }

  // Halted session keys are formatted as "groupId:agentId:sessionId"
  const haltedKeys = enforcer.getHaltedSessionKeys()
  let count = 0
  for (const key of haltedKeys) {
    if (key.startsWith(`${groupId}:`)) {
      // Reconstruct a SessionId-like object to reset this specific session
      const parts = key.split(':')
      const fakeSessionId = { groupId: parts[0] ?? '', agentId: parts[1] ?? '', sessionId: parts.slice(2).join(':') }
      enforcer.resetHaltedSession(fakeSessionId)
      count++
    }
  }
  return count
}

/**
 * Admin: Get list of currently halted session keys.
 */
export function getHaltedSessions(groupId?: string): string[] {
  const enforcer = getBudgetEnforcer()
  if (!enforcer) return []
  const halted = enforcer.getHaltedSessionKeys()
  return groupId ? halted.filter((key) => key.startsWith(`${groupId}:`)) : halted
}
