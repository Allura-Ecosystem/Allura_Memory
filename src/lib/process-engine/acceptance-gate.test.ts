/**
 * Process Engine — 10-Point Acceptance Gate
 * Story 14.6: End-to-end validation that the engine pipeline works correctly
 * with all wired subsystems mocked at their module boundaries.
 *
 * Each test covers exactly ONE acceptance point. No shared mutable state between
 * tests — every test constructs its own engine instance.
 *
 * Mock boundaries:
 *   - @/lib/postgres/queries/insert-trace  (trace writer)
 *   - ./run-manager                        (lifecycle tracking)
 *   - ./quality-gate                       (scored gate)
 *   - ./doctor                             (diagnostics)
 *   - ./replay                             (timeline)
 *   - ./state-manager                      (state persistence)
 *   - @/lib/circuit-breaker               (circuit breaker)
 *
 * The engine itself is NOT mocked — it runs as a black box.
 */

// Server-only module — guard is tested at import time; tests run in Node.
import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Module mocks (must appear before any imports of the mocked modules) ────────

vi.mock("@/lib/postgres/queries/insert-trace", () => ({
  insertEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("./run-manager", () => ({
  createRun: vi.fn().mockResolvedValue({
    id: "test-run-id",
    definition_id: "def-accept",
    definition_revision: 1,
    group_id: "allura-system",
    status: "pending",
    state_json: {},
    actor_id: "woz-builder",
    started_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
  }),
  updateRunSnapshot: vi.fn().mockResolvedValue({
    id: "test-run-id",
    definition_id: "def-accept",
    definition_revision: 1,
    group_id: "allura-system",
    status: "completed",
    state_json: {},
    actor_id: "woz-builder",
    started_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:01:00.000Z",
    completed_at: "2026-01-01T00:01:00.000Z",
  }),
}))

vi.mock("./quality-gate", () => ({
  evaluateGate: vi.fn().mockResolvedValue({
    results: [
      {
        score: 0.9,
        threshold: 0.8,
        passed: true,
        attempt: 1,
        maxAttempts: 3,
        evidenceId: "ev-accept-001",
        reasoning: "Acceptance gate passed",
      },
    ],
    finalResult: {
      score: 0.9,
      threshold: 0.8,
      passed: true,
      attempt: 1,
      maxAttempts: 3,
      evidenceId: "ev-accept-001",
      reasoning: "Acceptance gate passed",
    },
  }),
}))

vi.mock("./doctor", () => ({
  diagnoseRun: vi.fn().mockResolvedValue([]),
  runDoctorCycle: vi.fn().mockResolvedValue([]),
}))

vi.mock("./replay", () => ({
  ReplayEngine: vi.fn().mockImplementation(() => ({
    replay: vi.fn().mockResolvedValue({
      processId: "test-process-id",
      definitionId: "def-accept",
      groupId: "allura-system",
      status: "completed",
      steps: [
        {
          stepId: "step-a",
          stepName: "Step A",
          type: "step",
          status: "completed",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
          duration: 1000,
        },
      ],
      totalDuration: 1000,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
    }),
  })),
}))

vi.mock("./state-manager", () => ({
  ProcessStateManager: vi.fn().mockImplementation(() => ({
    saveInitialState: vi.fn().mockResolvedValue(undefined),
    saveState: vi.fn().mockResolvedValue(undefined),
    loadState: vi.fn().mockResolvedValue(null),
  })),
}))

// Default circuit breaker mock: closed (healthy)
vi.mock("@/lib/circuit-breaker", () => ({
  getBreakerManager: vi.fn().mockReturnValue({
    getOrCreateBreaker: vi.fn().mockReturnValue({
      getState: vi.fn().mockReturnValue("closed"),
    }),
  }),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import type { Pool } from "pg"
import { ProcessEngine } from "./engine"
import { createRun, updateRunSnapshot } from "./run-manager"
import { evaluateGate } from "./quality-gate"
import { diagnoseRun } from "./doctor"
import { ReplayEngine } from "./replay"
import { getBreakerManager } from "@/lib/circuit-breaker"
import type { ProcessDefinition } from "./types"

// ── Shared helpers ─────────────────────────────────────────────────────────────

function makePool(): Pool {
  return {} as Pool
}

/** Minimal valid group_id — invariant: must match ^allura-[a-z0-9-]+ */
const GROUP_ID = "allura-system"

function makeDef(overrides: Partial<ProcessDefinition> = {}): ProcessDefinition {
  return {
    id: "def-accept",
    name: "Acceptance Definition",
    group_id: GROUP_ID,
    revision: "1",
    steps: [],
    ...overrides,
  }
}

// ── 10-Point Acceptance Gate ───────────────────────────────────────────────────

describe("10-Point Acceptance Gate", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Re-apply defaults after clearAllMocks to keep each test isolated
    vi.mocked(createRun).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-accept",
      definition_revision: 1,
      group_id: "allura-system",
      status: "pending",
      state_json: {},
      actor_id: "woz-builder",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
    })
    vi.mocked(updateRunSnapshot).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-accept",
      definition_revision: 1,
      group_id: "allura-system",
      status: "completed",
      state_json: {},
      actor_id: "woz-builder",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      completed_at: "2026-01-01T00:01:00.000Z",
    })
    vi.mocked(evaluateGate).mockResolvedValue({
      results: [
        {
          score: 0.9,
          threshold: 0.8,
          passed: true,
          attempt: 1,
          maxAttempts: 3,
          evidenceId: "ev-accept-001",
          reasoning: "Acceptance gate passed",
        },
      ],
      finalResult: {
        score: 0.9,
        threshold: 0.8,
        passed: true,
        attempt: 1,
        maxAttempts: 3,
        evidenceId: "ev-accept-001",
        reasoning: "Acceptance gate passed",
      },
    })
    vi.mocked(diagnoseRun).mockResolvedValue([])
    vi.mocked(getBreakerManager).mockReturnValue({
      getOrCreateBreaker: vi.fn().mockReturnValue({
        getState: vi.fn().mockReturnValue("closed"),
      }),
    } as unknown as ReturnType<typeof getBreakerManager>)
  })

  // ── Point 1: Sequential run ──────────────────────────────────────────────────

  it("1. Sequential run — 3 steps execute in order, all succeed", async () => {
    const executionOrder: string[] = []
    const def = makeDef({
      steps: [
        {
          id: "seq-1",
          name: "First",
          type: "step",
          execute: async () => {
            executionOrder.push("seq-1")
            return { value: 1 }
          },
        },
        {
          id: "seq-2",
          name: "Second",
          type: "step",
          execute: async () => {
            executionOrder.push("seq-2")
            return { value: 2 }
          },
        },
        {
          id: "seq-3",
          name: "Third",
          type: "step",
          execute: async () => {
            executionOrder.push("seq-3")
            return { value: 3 }
          },
        },
      ],
    })

    const engine = new ProcessEngine(makePool())
    const state = await engine.run(def, { agentId: "woz-builder" })

    expect(state.status).toBe("completed")
    expect(executionOrder).toEqual(["seq-1", "seq-2", "seq-3"])
    expect(state.stepStates["seq-1"]).toBe("completed")
    expect(state.stepStates["seq-2"]).toBe("completed")
    expect(state.stepStates["seq-3"]).toBe("completed")
  })

  // ── Point 2: Parallel run (DAG) ──────────────────────────────────────────────

  it("2. Parallel run (DAG) — independent steps execute in parallel", async () => {
    const startTimes: Record<string, number> = {}
    const def = makeDef({
      steps: [
        {
          id: "par-a",
          name: "Parallel A",
          type: "step",
          execute: async () => {
            startTimes["par-a"] = Date.now()
            await new Promise((r) => setTimeout(r, 10))
            return { branch: "a" }
          },
        },
        {
          id: "par-b",
          name: "Parallel B",
          type: "step",
          execute: async () => {
            startTimes["par-b"] = Date.now()
            await new Promise((r) => setTimeout(r, 10))
            return { branch: "b" }
          },
        },
        {
          id: "par-c",
          name: "Merge C",
          type: "step",
          dependsOn: ["par-a", "par-b"],
          execute: async () => {
            return { merged: true }
          },
        },
      ],
    })

    const engine = new ProcessEngine(makePool())
    const state = await engine.runParallel(def, { agentId: "woz-builder" })

    expect(state.status).toBe("completed")
    expect(state.stepStates["par-a"]).toBe("completed")
    expect(state.stepStates["par-b"]).toBe("completed")
    expect(state.stepStates["par-c"]).toBe("completed")

    // Both independent steps should have started at roughly the same wall-clock time
    const startDiff = Math.abs(startTimes["par-a"] - startTimes["par-b"])
    expect(startDiff).toBeLessThan(20) // concurrent — not sequential
  })

  // ── Point 3: Checkpoint pause + resume ──────────────────────────────────────

  it("3. Checkpoint pause + resume — process pauses and resumes correctly", async () => {
    const afterCheckpointExecuted = vi.fn()

    const def = makeDef({
      steps: [
        {
          id: "before-cp",
          name: "Before Checkpoint",
          type: "step",
          execute: async () => ({ done: true }),
        },
        {
          id: "cp-1",
          name: "Human Approval Gate",
          type: "checkpoint",
        },
        {
          id: "after-cp",
          name: "After Checkpoint",
          type: "step",
          execute: async () => {
            afterCheckpointExecuted()
            return { continued: true }
          },
        },
      ],
    })

    const engine = new ProcessEngine(makePool())

    // Run in SOC2 mode — checkpoint must block
    const pausedState = await engine.run(def, {
      agentId: "woz-builder",
      promotionMode: "soc2",
    })

    expect(pausedState.status).toBe("paused")
    expect(pausedState.stepStates["cp-1"]).toBe("blocked")
    expect(afterCheckpointExecuted).not.toHaveBeenCalled()

    // Now simulate resume: configure loadState to return the paused state
    const { ProcessStateManager } = await import("./state-manager")
    vi.mocked(ProcessStateManager).mockImplementation(
      () =>
        ({
          saveInitialState: vi.fn().mockResolvedValue(undefined),
          saveState: vi.fn().mockResolvedValue(undefined),
          loadState: vi.fn().mockResolvedValue(pausedState),
        }) as unknown as InstanceType<typeof ProcessStateManager>,
    )

    const engine2 = new ProcessEngine(makePool())
    const resumedState = await engine2.resume(pausedState.processId, { approver: "human" }, { definition: def })

    expect(resumedState.status).toBe("completed")
    expect(resumedState.stepStates["cp-1"]).toBe("completed")
    expect(afterCheckpointExecuted).toHaveBeenCalledOnce()
  })

  // ── Point 4: Gate evaluation (boolean) ──────────────────────────────────────

  it("4. Gate evaluation (boolean) — condition gate passes and fails correctly", async () => {
    // Passing gate
    const passDef = makeDef({
      steps: [
        {
          id: "bool-gate-pass",
          name: "Passing Boolean Gate",
          type: "gate",
          condition: async () => true,
        },
        {
          id: "after-gate",
          name: "After Gate",
          type: "step",
          execute: async () => ({ afterGate: true }),
        },
      ],
    })

    const engine = new ProcessEngine(makePool())
    const passState = await engine.run(passDef)

    expect(passState.status).toBe("completed")
    expect(passState.stepStates["bool-gate-pass"]).toBe("completed")
    expect(passState.stepResults["bool-gate-pass"]).toMatchObject({ passed: true })
    expect(passState.stepStates["after-gate"]).toBe("completed")

    // Failing required gate — should fail the process
    const failDef = makeDef({
      id: "def-fail-gate",
      steps: [
        {
          id: "bool-gate-fail",
          name: "Failing Required Boolean Gate",
          type: "gate",
          required: true,
          condition: async () => false,
        },
      ],
    })

    vi.clearAllMocks()
    vi.mocked(createRun).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-fail-gate",
      definition_revision: 1,
      group_id: "allura-system",
      status: "pending",
      state_json: {},
      actor_id: "woz-builder",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
    })
    vi.mocked(updateRunSnapshot).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-fail-gate",
      definition_revision: 1,
      group_id: "allura-system",
      status: "failed",
      state_json: {},
      actor_id: "woz-builder",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      completed_at: "2026-01-01T00:01:00.000Z",
    })
    vi.mocked(getBreakerManager).mockReturnValue({
      getOrCreateBreaker: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue("closed") }),
    } as unknown as ReturnType<typeof getBreakerManager>)

    const engine2 = new ProcessEngine(makePool())
    const failState = await engine2.run(failDef)

    expect(failState.status).toBe("failed")
    expect(failState.stepStates["bool-gate-fail"]).toBe("failed")
  })

  // ── Point 5: Gate evaluation (scored) ───────────────────────────────────────

  it("5. Gate evaluation (scored) — step with gateConfig delegates to evaluateGate()", async () => {
    const evaluateFn = vi.fn().mockResolvedValue({
      score: 0.95,
      evidenceId: "ev-scored-001",
      reasoning: "All quality criteria met",
    })

    const def = makeDef({
      steps: [
        {
          id: "scored-gate",
          name: "Scored Quality Gate",
          type: "gate",
          gateConfig: {
            threshold: 0.8,
            maxAttempts: 3,
            evaluate: evaluateFn,
          },
        },
      ],
    })

    const engine = new ProcessEngine(makePool())
    const state = await engine.run(def, { agentId: "woz-builder" })

    // evaluateGate module function must have been called
    expect(evaluateGate).toHaveBeenCalledOnce()
    const gateCallArgs = vi.mocked(evaluateGate).mock.calls[0]
    expect(gateCallArgs[0].threshold).toBe(0.8)
    expect(gateCallArgs[0].maxAttempts).toBe(3)

    // Process completed — scored gate passed
    expect(state.status).toBe("completed")
    expect(state.stepStates["scored-gate"]).toBe("completed")

    const gateResult = state.stepResults["scored-gate"] as Record<string, unknown>
    expect(gateResult.passed).toBe(true)
    expect(gateResult.gateResult).toBeDefined()
  })

  // ── Point 6: Run lifecycle tracking ─────────────────────────────────────────

  it("6. Run lifecycle tracking — createRun called at start, updateRunSnapshot at terminal states", async () => {
    const def = makeDef({
      steps: [
        {
          id: "lifecycle-step",
          name: "Lifecycle Step",
          type: "step",
          execute: async () => ({ value: 42 }),
        },
      ],
    })

    const engine = new ProcessEngine(makePool())
    const state = await engine.run(def, { agentId: "woz-builder" })

    // createRun called exactly once at the start
    expect(createRun).toHaveBeenCalledOnce()
    const createArgs = vi.mocked(createRun).mock.calls[0][1]
    expect(createArgs.groupId).toBe(GROUP_ID)
    expect(createArgs.definitionId).toBe("def-accept")
    expect(createArgs.actorId).toBe("woz-builder")

    // updateRunSnapshot called at terminal state with correct status
    expect(updateRunSnapshot).toHaveBeenCalled()
    const lastUpdate = vi.mocked(updateRunSnapshot).mock.calls.at(-1)![1]
    expect(lastUpdate.status).toBe("completed")
    expect(lastUpdate.groupId).toBe(GROUP_ID)
    expect(lastUpdate.completedAt).toBeDefined()
    expect(state.status).toBe("completed")
  })

  // ── Point 7: Circuit breaker ─────────────────────────────────────────────────

  it("7. Circuit breaker — process fails when circuit breaker is open", async () => {
    // Override circuit breaker to report open
    vi.mocked(getBreakerManager).mockReturnValue({
      getOrCreateBreaker: vi.fn().mockReturnValue({
        getState: vi.fn().mockReturnValue("open"),
      }),
    } as unknown as ReturnType<typeof getBreakerManager>)
    vi.mocked(updateRunSnapshot).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-accept",
      definition_revision: 1,
      group_id: "allura-system",
      status: "failed",
      state_json: {},
      actor_id: "woz-builder",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      completed_at: "2026-01-01T00:01:00.000Z",
    })

    const def = makeDef({
      steps: [
        {
          id: "cb-step",
          name: "Step Behind Circuit Breaker",
          type: "step",
          execute: async () => ({ unreachable: true }),
        },
      ],
    })

    const engine = new ProcessEngine(makePool())
    const state = await engine.run(def)

    expect(state.status).toBe("failed")
    expect(state.error).toContain("Circuit breaker")
    // The step should never have been marked completed
    expect(state.stepStates["cb-step"]).not.toBe("completed")
  })

  // ── Point 8: Cancel ──────────────────────────────────────────────────────────

  it("8. Cancel — running process can be cancelled", async () => {
    const targetProcessId = "cancel-target-proc"

    // State that cancel() will load
    const runningState = {
      processId: targetProcessId,
      definitionId: "def-accept",
      definitionRevision: "1",
      groupId: GROUP_ID,
      status: "running" as const,
      currentStepIndex: 0,
      stepStates: { "long-step": "running" as const },
      stepResults: {},
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }

    const { ProcessStateManager } = await import("./state-manager")
    vi.mocked(ProcessStateManager).mockImplementation(
      () =>
        ({
          saveInitialState: vi.fn().mockResolvedValue(undefined),
          saveState: vi.fn().mockResolvedValue(undefined),
          loadState: vi.fn().mockResolvedValue(runningState),
        }) as unknown as InstanceType<typeof ProcessStateManager>,
    )
    vi.mocked(updateRunSnapshot).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-accept",
      definition_revision: 1,
      group_id: "allura-system",
      status: "failed",
      state_json: {},
      actor_id: "woz-builder",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      completed_at: "2026-01-01T00:01:00.000Z",
    })

    const saveStateFn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(ProcessStateManager).mockImplementation(
      () =>
        ({
          saveInitialState: vi.fn().mockResolvedValue(undefined),
          saveState: saveStateFn,
          loadState: vi.fn().mockResolvedValue(runningState),
        }) as unknown as InstanceType<typeof ProcessStateManager>,
    )

    const engine = new ProcessEngine(makePool())

    // cancel() should not throw
    await expect(engine.cancel(targetProcessId, "user requested cancellation")).resolves.toBeUndefined()

    // cancel() persists the updated state via saveState with status "failed"
    expect(saveStateFn).toHaveBeenCalled()
    const savedState = saveStateFn.mock.calls.at(-1)![0] as { status: string; error: string }
    expect(savedState.status).toBe("failed")
    expect(savedState.error).toContain("Cancelled")
  })

  // ── Point 9: Diagnose ────────────────────────────────────────────────────────

  it("9. Diagnose — engine.diagnose() returns findings from doctor", async () => {
    const mockFindings = [
      {
        runId: "proc-diagnose-001",
        condition: "stale" as const,
        severity: "warning" as const,
        detail: "Run has been stale for 45 minutes",
        recommendedAction: "flag" as const,
        detectedAt: "2026-01-01T00:45:00.000Z",
      },
    ]
    vi.mocked(diagnoseRun).mockResolvedValue(mockFindings)

    const engine = new ProcessEngine(makePool())
    const findings = await engine.diagnose("proc-diagnose-001", GROUP_ID, {
      staleThresholdMinutes: 30,
    })

    // doctor.diagnoseRun() must have been called with the correct params
    expect(diagnoseRun).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(diagnoseRun).mock.calls[0][1]
    expect(callArgs.runId).toBe("proc-diagnose-001")
    expect(callArgs.groupId).toBe(GROUP_ID)
    expect(callArgs.staleThresholdMinutes).toBe(30)

    // The findings returned must match what doctor emitted
    expect(findings).toHaveLength(1)
    expect(findings[0].condition).toBe("stale")
    expect(findings[0].severity).toBe("warning")
    expect(findings[0].detail).toContain("stale")
  })

  // ── Point 10: Timeline replay ────────────────────────────────────────────────

  it("10. Timeline replay — engine.getTimeline() returns step execution history", async () => {
    const engine = new ProcessEngine(makePool())

    const timeline = await engine.getTimeline("proc-replay-001", { verbose: true })

    // ReplayEngine must have been instantiated
    expect(ReplayEngine).toHaveBeenCalledOnce()

    // replay() called with the correct processId and options
    const replayInstance = vi.mocked(ReplayEngine).mock.results[0].value as {
      replay: ReturnType<typeof vi.fn>
    }
    expect(replayInstance.replay).toHaveBeenCalledWith("proc-replay-001", { verbose: true })

    // Timeline returned contains expected shape
    expect(timeline.processId).toBe("test-process-id")
    expect(timeline.groupId).toBe(GROUP_ID)
    expect(timeline.status).toBe("completed")
    expect(Array.isArray(timeline.steps)).toBe(true)
    expect(timeline.steps.length).toBeGreaterThan(0)
    expect(timeline.steps[0].stepId).toBe("step-a")
  })
})
