/**
 * Story 12.2: True Checkpoint Continuation (PostgreSQL-backed integration)
 *
 * Proves the full lifecycle against live PostgreSQL:
 *   start -> block -> approve -> resume -> complete -> replay
 *
 * and the two hard invariants:
 *   1. Idempotency: a completed side-effecting step is NOT re-executed on
 *      resume (counter stays at 1).
 *   2. Approval survives a simulated restart: resume runs on a *fresh* engine
 *      instance that loads state purely from PostgreSQL.
 *
 * Gated on POSTGRES_PASSWORD so it is a no-op when no live stack is present.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { ProcessEngine } from "./engine"
import { ReplayEngine } from "./replay"
import type { ProcessDefinition } from "./types"
import { DefinitionRevisionError } from "./types"

// DB-backed: only runs in the e2e lane (RUN_E2E_TESTS=true with a live stack
// and correct credentials). Excluded from the default lane by vitest.config.ts.
const runLive = process.env.RUN_E2E_TESTS === "true" && Boolean(process.env.POSTGRES_PASSWORD)

// Lazy imports so the module load never fails when pg is unconfigured.
let getPool: typeof import("../postgres/connection").getPool
let closePool: typeof import("../postgres/connection").closePool

describe.skipIf(!runLive)("Story 12.2 checkpoint continuation (live PG)", () => {
  beforeAll(async () => {
    const conn = await import("../postgres/connection")
    getPool = conn.getPool
    closePool = conn.closePool
  })

  afterAll(async () => {
    if (closePool) await closePool()
  })

  it("runs start -> block -> approve -> resume -> complete -> replay idempotently", async () => {
    // Side-effect counters captured by closure to prove single execution.
    let prepRuns = 0
    let finalizeRuns = 0

    const definition: ProcessDefinition = {
      id: `proc-def-12-2-${Date.now()}`,
      revision: "1",
      name: "Checkpoint Continuation Proof",
      group_id: "allura-system",
      steps: [
        {
          id: "prep",
          name: "Prepare (side-effecting)",
          type: "step",
          execute: async () => {
            prepRuns += 1
            return { prepared: true, prepRuns }
          },
        },
        {
          id: "approval",
          name: "Human Approval",
          type: "checkpoint",
        },
        {
          id: "finalize",
          name: "Finalize (side-effecting)",
          type: "step",
          execute: async () => {
            finalizeRuns += 1
            return { finalized: true, finalizeRuns }
          },
        },
      ],
    }

    // Start -> block.
    const engine = new ProcessEngine(getPool())
    const paused = await engine.run(definition, {
      promotionMode: "soc2",
      agentId: "test-actor",
    })

    expect(paused.status).toBe("paused")
    expect(paused.stepStates.prep).toBe("completed")
    expect(paused.stepStates.approval).toBe("blocked")
    expect(paused.stepStates.finalize).toBe("pending")
    expect(prepRuns).toBe(1)
    expect(finalizeRuns).toBe(0)

    const processId = paused.processId

    // Approve -> resume -> complete on a fresh engine (simulated restart).
    const restartedEngine = new ProcessEngine(getPool())
    const completed = await restartedEngine.resume(
      processId,
      { approved: true, approver: "test-actor" },
      { definition, promotionMode: "soc2", agentId: "test-actor" },
    )

    expect(completed.status).toBe("completed")
    expect(completed.stepStates.approval).toBe("completed")
    expect(completed.stepStates.finalize).toBe("completed")
    // Idempotency: prep was already completed pre-restart and must NOT re-run.
    expect(prepRuns).toBe(1)
    // Finalize ran exactly once during continuation.
    expect(finalizeRuns).toBe(1)

    // Replay: timeline reflects approval and completion.
    const replayEngine = new ReplayEngine(getPool())
    const timeline = await replayEngine.replay(processId, { verbose: true })

    expect(timeline.status).toBe("completed")
    const approvalStep = timeline.steps.find((s) => s.stepId === "approval")
    expect(approvalStep?.type).toBe("checkpoint")
    expect(approvalStep?.checkpointApproved).toBe(true)
    const finalizeStep = timeline.steps.find((s) => s.stepId === "finalize")
    expect(finalizeStep?.status).toBe("completed")

    // Replay safety: resuming a completed process must not re-run effects.
    await expect(
      restartedEngine.resume(processId, { approved: true }, { definition }),
    ).rejects.toThrow(/not paused/)
    expect(prepRuns).toBe(1)
    expect(finalizeRuns).toBe(1)
  })

  it("raises a doctor finding when the pinned definition revision changed", async () => {
    const base: ProcessDefinition = {
      id: `proc-def-drift-${Date.now()}`,
      revision: "1",
      name: "Definition Drift Proof",
      group_id: "allura-system",
      steps: [
        { id: "s1", name: "Step 1", type: "step", execute: async () => ({ ok: true }) },
        { id: "gate", name: "Approval", type: "checkpoint" },
        { id: "s2", name: "Step 2", type: "step", execute: async () => ({ ok: true }) },
      ],
    }

    const engine = new ProcessEngine(getPool())
    const paused = await engine.run(base, { promotionMode: "soc2", agentId: "test-actor" })
    expect(paused.status).toBe("paused")

    // Supply a drifted revision; resume must refuse with an explicit finding.
    const drifted: ProcessDefinition = { ...base, revision: "2" }
    await expect(
      engine.resume(paused.processId, { approved: true }, { definition: drifted }),
    ).rejects.toBeInstanceOf(DefinitionRevisionError)
  })
})
