import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BudgetEnforcer } from "./enforcer"
import { BudgetMonitor } from "./monitor"
import { checkBudgetBeforeCall } from "./middleware-integration"
import { DEFAULT_BUDGET_CONFIG, type BudgetLimits } from "./types"

const id = { groupId: "allura-budget", agentId: "agent:with:colons", sessionId: "session:one" }
const limits: BudgetLimits = { maxTokens: 10000, maxToolCalls: 10, maxTimeMs: 1000, maxCostUsd: 10, maxSteps: 10 }
const instances: BudgetEnforcer[] = []
function enforcer() {
  const instance = new BudgetEnforcer({ budgetConfig: { ...DEFAULT_BUDGET_CONFIG, defaults: limits }, timeAccounting: "recorded-duration", haltTtlMs: 100 })
  instances.push(instance)
  instance.startSession(id)
  return instance
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { for (const instance of instances.splice(0)) instance.endSession(id); vi.clearAllTimers(); vi.useRealTimers() })

describe("preserved budget accounting", () => {
  it("keeps default wall-clock behavior", () => {
    const monitor = new BudgetMonitor()
    monitor.startSession(id, limits)
    vi.advanceTimersByTime(2000)
    expect(monitor.getConsumption(id)?.timeMs).toBe(2000)
    expect(monitor.endSession(id)?.budgetStatus.consumption.timeMs).toBe(2000)
  })
  it("does not accrue idle wall time or overwrite recorded duration on end", () => {
    const instance = enforcer()
    instance.updateBudget(id, { timeMs: 25 })
    vi.advanceTimersByTime(2000)
    expect(instance.getStatus(id)?.consumption.timeMs).toBe(25)
    expect(instance.endSession(id)?.budgetStatus.consumption.timeMs).toBe(25)
  })
  it("restarts the wall-clock origin on an authorized time-only reset", () => {
    const instance = new BudgetEnforcer({ budgetConfig: { ...DEFAULT_BUDGET_CONFIG, defaults: limits } })
    instances.push(instance)
    instance.startSession(id)
    vi.advanceTimersByTime(1000)
    expect(instance.isHalted(id)).toBe(true)
    expect(instance.resetHaltedSession(id)).toBe(true)
    expect(instance.getStatus(id)?.consumption.timeMs).toBe(0)
    vi.advanceTimersByTime(500)
    expect(checkBudgetBeforeCall(instance, id).allowed).toBe(true)
  })
  it("resets only time and preserves identity, counters, histories and other warnings", async () => {
    const instance = enforcer()
    const state = instance.getSessionState(id)!
    instance.getMonitor().addReasoningStep(id, "preserved reasoning")
    instance.getMonitor().trackToolCall(id, { toolName: "read", timestamp: new Date(), durationMs: 15, success: true, step: 0, input: {} })
    instance.updateBudget(id, { timeMs: 1000, tokens: 100, costUsd: 1, steps: 1 })
    state.budgetStatus.warnings.tokens.warning80 = true
    state.budgetStatus.warnings.timeMs.warning90 = true
    await instance.checkBeforeExecution(id)
    expect(instance.resetHaltedSession(id)).toBe(true)
    expect(instance.getSessionState(id)).toBe(state)
    expect(state.budgetStatus.consumption).toEqual({ tokens: 100, toolCalls: 1, timeMs: 0, costUsd: 1, steps: 1 })
    expect(state.budgetStatus.utilization.timeMs).toBe(0)
    expect(state.budgetStatus.warnings.timeMs).toEqual({ warning80: false, warning90: false })
    expect(state.budgetStatus.warnings.tokens.warning80).toBe(true)
    expect(state.reasoningHistory).toHaveLength(1)
    expect(state.toolCallHistory).toHaveLength(1)
    expect(checkBudgetBeforeCall(instance, id).allowed).toBe(true)
  })
  it.each(["tokens", "toolCalls", "costUsd", "steps"] as const)("refuses time reset with %s exhausted", async (dimension) => {
    const instance = enforcer()
    instance.updateBudget(id, { timeMs: 1000 })
    await instance.checkBeforeExecution(id)
    instance.updateBudget(id, { [dimension]: dimension === "tokens" ? 10000 : 10 })
    expect(instance.resetHaltedSession(id)).toBe(false)
    expect(instance.isHalted(id)).toBe(true)
    expect(instance.getStatus(id)?.consumption.timeMs).toBe(1000)
  })
  it.each(["tokens", "toolCalls", "timeMs", "costUsd", "steps"] as const)("TTL never renews exhausted %s capacity", async (dimension) => {
    const instance = enforcer()
    instance.updateBudget(id, { [dimension]: dimension === "tokens" ? 10000 : dimension === "timeMs" ? 1000 : 10 })
    await instance.haltSession(id, { type: "time_limit", elapsedMs: 1000, limitMs: 1000 })
    vi.advanceTimersByTime(101)
    expect(checkBudgetBeforeCall(instance, id).allowed).toBe(false)
    expect(instance.isHalted(id)).toBe(true)
  })
  it("counts only actual time-only releases", async () => {
    const instance = enforcer()
    const other = { ...id, sessionId: "other" }
    instance.startSession(other, limits)
    instance.updateBudget(id, { timeMs: 1000 })
    instance.updateBudget(other, { tokens: 10000 })
    await instance.checkBeforeExecution(id)
    await instance.checkBeforeExecution(other)
    expect(instance.resetAllHaltedSessions()).toBe(1)
    expect(instance.isHalted(other)).toBe(true)
    instance.endSession(other)
  })
  it("reports the actual recorded step exhaustion at the pre-execution boundary", async () => {
    const instance = enforcer()
    instance.updateBudget(id, { steps: 10 })
    expect((await instance.checkBeforeExecution(id)).haltReason).toEqual({ type: "kmax_exceeded", currentStep: 10, maxSteps: 10 })
  })
})
