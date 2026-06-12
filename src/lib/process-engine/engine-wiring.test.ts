/**
 * Process Engine — Wiring Tests (Story 14.2)
 *
 * Verifies that ProcessEngine delegates to:
 *   - run-manager (createRun, updateRunSnapshot) for lifecycle tracking
 *   - quality-gate (evaluateGate) for scored gate evaluation
 *   - doctor (diagnoseRun) via engine.diagnose()
 *   - ReplayEngine.replay() via engine.getTimeline()
 *
 * All DB calls are mocked via vi.mock. The core execution logic is not
 * re-tested here — that belongs to the existing engine/replay tests.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Mock all external dependencies ────────────────────────────────────────────

vi.mock("./run-manager", () => ({
  createRun: vi.fn().mockResolvedValue({
    id: "test-run-id",
    definition_id: "def-001",
    definition_revision: 1,
    group_id: "allura-system",
    status: "pending",
    state_json: {},
    actor_id: "process-engine",
    started_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
  }),
  updateRunSnapshot: vi.fn().mockResolvedValue({
    id: "test-run-id",
    definition_id: "def-001",
    definition_revision: 1,
    group_id: "allura-system",
    status: "completed",
    state_json: {},
    actor_id: "process-engine",
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
        evidenceId: "ev-001",
        reasoning: "High quality",
      },
    ],
    finalResult: {
      score: 0.9,
      threshold: 0.8,
      passed: true,
      attempt: 1,
      maxAttempts: 3,
      evidenceId: "ev-001",
      reasoning: "High quality",
    },
  }),
  extractGateConfig: vi.fn().mockReturnValue(null),
}))

vi.mock("./doctor", () => ({
  diagnoseRun: vi.fn().mockResolvedValue([]),
  runDoctorCycle: vi.fn().mockResolvedValue([]),
}))

vi.mock("./replay", () => ({
  ReplayEngine: vi.fn().mockImplementation(() => ({
    replay: vi.fn().mockResolvedValue({
      processId: "test-process-id",
      definitionId: "def-001",
      groupId: "allura-system",
      status: "completed",
      steps: [],
      totalDuration: 100,
      startedAt: "2026-01-01T00:00:00.000Z",
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

vi.mock("@/lib/postgres/queries/insert-trace", () => ({
  insertEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/circuit-breaker", () => ({
  getBreakerManager: vi.fn().mockReturnValue({
    getOrCreateBreaker: vi.fn().mockReturnValue({
      getState: vi.fn().mockReturnValue("closed"),
    }),
  }),
}))

// ── Import after mocks ─────────────────────────────────────────────────────────

import type { Pool } from "pg"
import { ProcessEngine } from "./engine"
import { createRun, updateRunSnapshot } from "./run-manager"
import { evaluateGate } from "./quality-gate"
import { diagnoseRun } from "./doctor"
import { ReplayEngine } from "./replay"
import type { ProcessDefinition } from "./types"

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePool(): Pool {
  return {} as Pool
}

function makeDefinition(overrides: Partial<ProcessDefinition> = {}): ProcessDefinition {
  return {
    id: "def-001",
    name: "Test Process",
    group_id: "allura-system",
    revision: "1",
    steps: [
      {
        id: "step-1",
        name: "Step One",
        type: "step",
        execute: vi.fn().mockResolvedValue({ result: "ok" }),
      },
    ],
    ...overrides,
  }
}

// ── run() delegates to run-manager ────────────────────────────────────────────

describe("ProcessEngine.run() — run-manager delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset updateRunSnapshot to return a valid object so optimistic lock works
    vi.mocked(updateRunSnapshot).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-001",
      definition_revision: 1,
      group_id: "allura-system",
      status: "completed",
      state_json: {},
      actor_id: "process-engine",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      completed_at: "2026-01-01T00:01:00.000Z",
    })
    vi.mocked(createRun).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-001",
      definition_revision: 1,
      group_id: "allura-system",
      status: "pending",
      state_json: {},
      actor_id: "process-engine",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
    })
  })

  it("calls createRun once with correct params", async () => {
    const engine = new ProcessEngine(makePool())
    const def = makeDefinition()

    await engine.run(def, { agentId: "woz-builder" })

    expect(createRun).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(createRun).mock.calls[0]
    const params = callArgs[1]
    expect(params.definitionId).toBe("def-001")
    expect(params.groupId).toBe("allura-system")
    expect(params.definitionRevision).toBe(1)
    expect(params.actorId).toBe("woz-builder")
  })

  it("calls updateRunSnapshot with terminal status after completion", async () => {
    const engine = new ProcessEngine(makePool())
    const def = makeDefinition()

    const state = await engine.run(def)

    expect(state.status).toBe("completed")
    expect(updateRunSnapshot).toHaveBeenCalled()
    const lastCall = vi.mocked(updateRunSnapshot).mock.calls.at(-1)!
    expect(lastCall[1].status).toBe("completed")
    expect(lastCall[1].groupId).toBe("allura-system")
  })

  it("calls createRun with definition revision parsed as integer", async () => {
    const engine = new ProcessEngine(makePool())
    const def = makeDefinition({ revision: "3" })

    await engine.run(def)

    const params = vi.mocked(createRun).mock.calls[0][1]
    expect(params.definitionRevision).toBe(3)
  })

  it("defaults actorId to 'process-engine' when agentId is not provided", async () => {
    const engine = new ProcessEngine(makePool())
    const def = makeDefinition()

    await engine.run(def)

    const params = vi.mocked(createRun).mock.calls[0][1]
    expect(params.actorId).toBe("process-engine")
  })
})

// ── runParallel() delegates to run-manager ────────────────────────────────────

describe("ProcessEngine.runParallel() — run-manager delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createRun).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-001",
      definition_revision: 1,
      group_id: "allura-system",
      status: "pending",
      state_json: {},
      actor_id: "process-engine",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
    })
    vi.mocked(updateRunSnapshot).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-001",
      definition_revision: 1,
      group_id: "allura-system",
      status: "completed",
      state_json: {},
      actor_id: "process-engine",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      completed_at: "2026-01-01T00:01:00.000Z",
    })
  })

  it("calls createRun once for a parallel run", async () => {
    const engine = new ProcessEngine(makePool())
    const def = makeDefinition()

    await engine.runParallel(def)

    expect(createRun).toHaveBeenCalledOnce()
  })

  it("calls updateRunSnapshot after parallel run completes", async () => {
    const engine = new ProcessEngine(makePool())
    const def = makeDefinition()

    const state = await engine.runParallel(def)

    expect(state.status).toBe("completed")
    expect(updateRunSnapshot).toHaveBeenCalled()
    const lastCall = vi.mocked(updateRunSnapshot).mock.calls.at(-1)!
    expect(lastCall[1].status).toBe("completed")
  })
})

// ── Scored gate delegates to evaluateGate() ───────────────────────────────────

describe("ProcessEngine.run() — scored gate delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createRun).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-001",
      definition_revision: 1,
      group_id: "allura-system",
      status: "pending",
      state_json: {},
      actor_id: "process-engine",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
    })
    vi.mocked(updateRunSnapshot).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-001",
      definition_revision: 1,
      group_id: "allura-system",
      status: "completed",
      state_json: {},
      actor_id: "process-engine",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      completed_at: null,
    })
  })

  it("calls evaluateGate when step has gateConfig", async () => {
    const engine = new ProcessEngine(makePool())
    const evaluateFn = vi.fn().mockResolvedValue({
      score: 0.95,
      evidenceId: "ev-test",
      reasoning: "Looks great",
    })
    const def = makeDefinition({
      steps: [
        {
          id: "scored-gate",
          name: "Scored Gate",
          type: "gate",
          gateConfig: {
            threshold: 0.8,
            maxAttempts: 3,
            evaluate: evaluateFn,
          },
        },
      ],
    })

    const state = await engine.run(def)

    expect(evaluateGate).toHaveBeenCalledOnce()
    const gateCallArgs = vi.mocked(evaluateGate).mock.calls[0]
    expect(gateCallArgs[0].threshold).toBe(0.8)
    expect(gateCallArgs[0].maxAttempts).toBe(3)
    expect(state.status).toBe("completed")
  })

  it("does NOT call evaluateGate for boolean condition gates", async () => {
    const engine = new ProcessEngine(makePool())
    const def = makeDefinition({
      steps: [
        {
          id: "bool-gate",
          name: "Boolean Gate",
          type: "gate",
          condition: async () => true,
        },
      ],
    })

    await engine.run(def)

    expect(evaluateGate).not.toHaveBeenCalled()
  })

  it("stores gate result and evidence in stepResults when scored gate passes", async () => {
    const engine = new ProcessEngine(makePool())
    const def = makeDefinition({
      steps: [
        {
          id: "scored-gate",
          name: "Scored Gate",
          type: "gate",
          gateConfig: {
            threshold: 0.8,
            maxAttempts: 1,
            evaluate: vi.fn().mockResolvedValue({
              score: 0.9,
              evidenceId: "ev-001",
              reasoning: "Passes",
            }),
          },
        },
      ],
    })

    const state = await engine.run(def)

    const gateStepResult = state.stepResults["scored-gate"] as Record<string, unknown>
    expect(gateStepResult).toBeDefined()
    expect(gateStepResult.passed).toBe(true)
    expect(gateStepResult.gateResult).toBeDefined()
  })
})

// ── diagnose() delegates to diagnoseRun() ─────────────────────────────────────

describe("ProcessEngine.diagnose() — doctor delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(diagnoseRun).mockResolvedValue([])
  })

  it("calls diagnoseRun with correct runId and groupId", async () => {
    const engine = new ProcessEngine(makePool())

    const findings = await engine.diagnose("proc-123", "allura-system")

    expect(diagnoseRun).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(diagnoseRun).mock.calls[0]
    expect(callArgs[1]).toMatchObject({
      runId: "proc-123",
      groupId: "allura-system",
    })
    expect(findings).toEqual([])
  })

  it("passes staleThresholdMinutes option through to diagnoseRun", async () => {
    const engine = new ProcessEngine(makePool())

    await engine.diagnose("proc-123", "allura-system", { staleThresholdMinutes: 30 })

    const callArgs = vi.mocked(diagnoseRun).mock.calls[0]
    expect(callArgs[1].staleThresholdMinutes).toBe(30)
  })

  it("returns findings from diagnoseRun", async () => {
    const mockFindings = [
      {
        runId: "proc-123",
        condition: "stale" as const,
        severity: "warning" as const,
        detail: "Run is stale",
        recommendedAction: "flag" as const,
        detectedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    vi.mocked(diagnoseRun).mockResolvedValue(mockFindings)

    const engine = new ProcessEngine(makePool())
    const findings = await engine.diagnose("proc-123", "allura-system")

    expect(findings).toEqual(mockFindings)
  })
})

// ── getTimeline() delegates to ReplayEngine ────────────────────────────────────

describe("ProcessEngine.getTimeline() — replay delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls ReplayEngine.replay() with the processId", async () => {
    const engine = new ProcessEngine(makePool())

    const timeline = await engine.getTimeline("proc-456")

    // ReplayEngine is mocked — verify it was instantiated and replay() was called
    expect(ReplayEngine).toHaveBeenCalledOnce()
    const replayInstance = vi.mocked(ReplayEngine).mock.results[0].value as { replay: ReturnType<typeof vi.fn> }
    expect(replayInstance.replay).toHaveBeenCalledWith("proc-456", {})
    expect(timeline.processId).toBe("test-process-id")
  })

  it("passes replay options through to ReplayEngine.replay()", async () => {
    const engine = new ProcessEngine(makePool())
    const options = { fromStep: "step-1", toStep: "step-3", verbose: true }

    await engine.getTimeline("proc-456", options)

    const replayInstance = vi.mocked(ReplayEngine).mock.results[0].value as { replay: ReturnType<typeof vi.fn> }
    expect(replayInstance.replay).toHaveBeenCalledWith("proc-456", options)
  })

  it("returns the timeline from ReplayEngine.replay()", async () => {
    const engine = new ProcessEngine(makePool())

    const timeline = await engine.getTimeline("proc-789")

    expect(timeline).toMatchObject({
      processId: "test-process-id",
      groupId: "allura-system",
      status: "completed",
    })
  })
})

// ── updateRunSnapshot is called at failure path ───────────────────────────────

describe("ProcessEngine — updateRunSnapshot on failure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createRun).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-001",
      definition_revision: 1,
      group_id: "allura-system",
      status: "pending",
      state_json: {},
      actor_id: "process-engine",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
    })
    vi.mocked(updateRunSnapshot).mockResolvedValue({
      id: "test-run-id",
      definition_id: "def-001",
      definition_revision: 1,
      group_id: "allura-system",
      status: "failed",
      state_json: {},
      actor_id: "process-engine",
      started_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
      completed_at: "2026-01-01T00:01:00.000Z",
    })
  })

  it("calls updateRunSnapshot with status=failed when a required step throws", async () => {
    const engine = new ProcessEngine(makePool())
    const def = makeDefinition({
      steps: [
        {
          id: "failing-step",
          name: "Failing Step",
          type: "step",
          required: true,
          execute: vi.fn().mockRejectedValue(new Error("step blew up")),
        },
      ],
    })

    const state = await engine.run(def)

    expect(state.status).toBe("failed")
    expect(updateRunSnapshot).toHaveBeenCalled()
    const lastCall = vi.mocked(updateRunSnapshot).mock.calls.at(-1)!
    expect(lastCall[1].status).toBe("failed")
  })

  it("passes completedAt to updateRunSnapshot on failure", async () => {
    const engine = new ProcessEngine(makePool())
    const def = makeDefinition({
      steps: [
        {
          id: "failing-step",
          name: "Failing Step",
          type: "step",
          required: true,
          execute: vi.fn().mockRejectedValue(new Error("boom")),
        },
      ],
    })

    await engine.run(def)

    const lastCall = vi.mocked(updateRunSnapshot).mock.calls.at(-1)!
    expect(lastCall[1].completedAt).toBeDefined()
    expect(typeof lastCall[1].completedAt).toBe("string")
  })
})
