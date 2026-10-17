import { afterEach, describe, expect, it, vi } from "vitest"
import { checkBudget, ensureSession, getBudgetEnforcer, getHaltedSessions, resetBudgetState, resetHaltedGroup } from "@/mcp/canonical-tools/budget-circuit"

afterEach(() => {
  const monitor = getBudgetEnforcer()?.getMonitor()
  // New structured accessor is intentionally exercised only once implemented.
  for (const id of monitor?.getSessionIds?.() ?? []) monitor?.endSession(id)
  resetBudgetState()
  vi.clearAllTimers()
  vi.useRealTimers()
})
describe("MCP budget preservation", () => {
  it("uses recorded duration and emits no wait-based retryAfter", async () => {
    vi.useFakeTimers()
    const id = ensureSession("allura-budget-mcp", "agent:one")!
    const instance = getBudgetEnforcer()!
    instance.updateBudget(id, { timeMs: 10 })
    vi.advanceTimersByTime(2000)
    expect(instance.getStatus(id)?.consumption.timeMs).toBe(10)
    instance.updateBudget(id, { timeMs: instance.getStatus(id)!.limits.maxTimeMs })
    await instance.checkBeforeExecution(id)
    const result = await checkBudget(id.groupId, id.agentId, "memory_add")
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeUndefined()
  })
  it("resets the exact structured tenant with colon-bearing agent/session identities", async () => {
    vi.useFakeTimers()
    const instance = getBudgetEnforcer()!
    const id = { groupId: "allura-target", agentId: "agent:one", sessionId: "session:two" }
    const other = { groupId: "allura-target-extra", agentId: "agent:one", sessionId: "session:two" }
    for (const session of [id, other]) {
      instance.startSession(session)
      instance.updateBudget(session, { timeMs: instance.getStatus(session)!.limits.maxTimeMs })
      await instance.checkBeforeExecution(session)
    }
    expect(getHaltedSessions("allura-target:agent")).toEqual([])
    expect(resetHaltedGroup("allura-target:agent")).toBe(0)
    expect(resetHaltedGroup(id.groupId)).toBe(1)
    expect(instance.getStatus(id)?.consumption.timeMs).toBe(0)
    expect(instance.isHalted(other)).toBe(true)
    expect(getHaltedSessions(id.groupId)).toEqual([])
  })
})
