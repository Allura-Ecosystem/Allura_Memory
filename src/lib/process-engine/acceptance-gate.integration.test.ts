/**
 * Process Engine — 10-Point Acceptance Gate (Live DB)
 * Story 14.6 / Phase 0 release gate — live PostgreSQL variant.
 *
 * Behavioral reference: acceptance-gate.test.ts (mocked, 10 points).
 * Pattern reference: checkpoint-continuation.integration.test.ts (runLive guard,
 *   lazy getPool import, describe.skipIf, group_id scoping).
 *
 * Runs ONLY when RUN_E2E_TESTS=true AND POSTGRES_PASSWORD is set.
 * Default `bun test` lane: all 10 points are SKIPPED (describe.skipIf).
 *
 * Design decisions:
 *   - group_id: "allura-e2e-acceptance" — unique, matches ^allura-[a-z0-9-]+$
 *   - process_definitions row seeded in beforeAll (FK required by process_runs)
 *   - Cleanup: DELETE process_runs and events scoped to our group_id in afterAll
 *     (events are append-only — we delete only OUR test tenant rows, which is
 *     permitted because test rows are not historical production traces)
 *   - Each test creates its own engine + definition with a unique id to avoid
 *     cross-test FK conflicts (process_definitions PK = (id, revision, group_id))
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { ProcessEngine } from "./engine"
import { ReplayEngine } from "./replay"
import type { ProcessDefinition } from "./types"

// ── Live guard (mirrors checkpoint-continuation.integration.test.ts) ──────────

const runLive =
  process.env.RUN_E2E_TESTS === "true" && Boolean(process.env.POSTGRES_PASSWORD)

// Lazy imports so module load never fails when PG is unconfigured.
let getPool: typeof import("../postgres/connection").getPool
let closePool: typeof import("../postgres/connection").closePool

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUP_ID = "allura-e2e-acceptance"
const ACTOR_ID = "woz-builder-e2e"

/** Seed a process_definitions row (FK required by createRun → process_runs). */
async function seedDefinition(
  pool: import("pg").Pool,
  defId: string,
  defName: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO process_definitions (id, revision, group_id, name, definition_json)
     VALUES ($1, 1, $2, $3, $4)
     ON CONFLICT (id, revision, group_id) DO NOTHING`,
    [
      defId,
      GROUP_ID,
      defName,
      JSON.stringify({ id: defId, name: defName, steps: [] }),
    ],
  )
}

/** Build a minimal ProcessDefinition that already has a seeded DB row. */
function makeDef(
  id: string,
  name: string,
  overrides: Partial<ProcessDefinition> = {},
): ProcessDefinition {
  return {
    id,
    name,
    group_id: GROUP_ID,
    revision: "1",
    steps: [],
    ...overrides,
  }
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe.skipIf(!runLive)(
  "10-Point Acceptance Gate (live PG)",
  () => {
    beforeAll(async () => {
      const conn = await import("../postgres/connection")
      getPool = conn.getPool
      closePool = conn.closePool
    })

    afterAll(async () => {
      // Clean up: delete process_runs and events that belong to our test tenant.
      // Append-only invariant applies to historical production traces; these are
      // isolated test rows under a dedicated group_id created solely by this suite.
      const pool = getPool()
      await pool.query(`DELETE FROM process_runs WHERE group_id = $1`, [GROUP_ID])
      await pool.query(`DELETE FROM events WHERE group_id = $1`, [GROUP_ID])
      await pool.query(
        `DELETE FROM process_definitions WHERE group_id = $1`,
        [GROUP_ID],
      )
      if (closePool) await closePool()
    })

    // ── Point 1: Sequential run ────────────────────────────────────────────────

    it("1. Sequential run — 3 steps execute in order, all succeed", async () => {
      const defId = `def-seq-${Date.now()}`
      const pool = getPool()
      await seedDefinition(pool, defId, "Sequential Test")

      const executionOrder: string[] = []
      const def = makeDef(defId, "Sequential Test", {
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

      const engine = new ProcessEngine(pool)
      const state = await engine.run(def, { agentId: ACTOR_ID })

      expect(state.status).toBe("completed")
      expect(executionOrder).toEqual(["seq-1", "seq-2", "seq-3"])
      expect(state.stepStates["seq-1"]).toBe("completed")
      expect(state.stepStates["seq-2"]).toBe("completed")
      expect(state.stepStates["seq-3"]).toBe("completed")
    })

    // ── Point 2: Parallel DAG ──────────────────────────────────────────────────

    it("2. Parallel run (DAG) — independent steps execute in parallel", async () => {
      const defId = `def-par-${Date.now()}`
      const pool = getPool()
      await seedDefinition(pool, defId, "Parallel Test")

      const startTimes: Record<string, number> = {}
      const def = makeDef(defId, "Parallel Test", {
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
            execute: async () => ({ merged: true }),
          },
        ],
      })

      const engine = new ProcessEngine(pool)
      const state = await engine.runParallel(def, { agentId: ACTOR_ID })

      expect(state.status).toBe("completed")
      expect(state.stepStates["par-a"]).toBe("completed")
      expect(state.stepStates["par-b"]).toBe("completed")
      expect(state.stepStates["par-c"]).toBe("completed")

      const startDiff = Math.abs(startTimes["par-a"] - startTimes["par-b"])
      expect(startDiff).toBeLessThan(20)
    })

    // ── Point 3: Checkpoint pause + resume ─────────────────────────────────────

    it(
      "3. Checkpoint pause + resume — process pauses and resumes correctly",
      async () => {
        const defId = `def-cp-${Date.now()}`
        const pool = getPool()
        await seedDefinition(pool, defId, "Checkpoint Test")

        let afterCheckpointRan = false

        const def = makeDef(defId, "Checkpoint Test", {
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
                afterCheckpointRan = true
                return { continued: true }
              },
            },
          ],
        })

        // Run in SOC2 mode — checkpoint must block
        const engine = new ProcessEngine(pool)
        const pausedState = await engine.run(def, {
          agentId: ACTOR_ID,
          promotionMode: "soc2",
        })

        expect(pausedState.status).toBe("paused")
        expect(pausedState.stepStates["cp-1"]).toBe("blocked")
        expect(afterCheckpointRan).toBe(false)

        // Resume on a fresh engine (simulated restart) — true continuation
        const engine2 = new ProcessEngine(pool)
        const resumedState = await engine2.resume(
          pausedState.processId,
          { approver: "human" },
          { definition: def, agentId: ACTOR_ID },
        )

        expect(resumedState.status).toBe("completed")
        expect(resumedState.stepStates["cp-1"]).toBe("completed")
        expect(resumedState.stepStates["after-cp"]).toBe("completed")
        expect(afterCheckpointRan).toBe(true)
      },
    )

    // ── Point 4: Gate evaluation (boolean) ────────────────────────────────────

    it("4. Gate evaluation (boolean) — condition gate passes and fails correctly", async () => {
      const pool = getPool()

      // Passing gate
      const passDefId = `def-gate-pass-${Date.now()}`
      await seedDefinition(pool, passDefId, "Gate Pass Test")
      const passDef = makeDef(passDefId, "Gate Pass Test", {
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

      const engine = new ProcessEngine(pool)
      const passState = await engine.run(passDef, { agentId: ACTOR_ID })

      expect(passState.status).toBe("completed")
      expect(passState.stepStates["bool-gate-pass"]).toBe("completed")
      expect(passState.stepResults["bool-gate-pass"]).toMatchObject({ passed: true })
      expect(passState.stepStates["after-gate"]).toBe("completed")

      // Failing required gate — should fail the process
      const failDefId = `def-gate-fail-${Date.now()}`
      await seedDefinition(pool, failDefId, "Gate Fail Test")
      const failDef = makeDef(failDefId, "Gate Fail Test", {
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

      const engine2 = new ProcessEngine(pool)
      const failState = await engine2.run(failDef, { agentId: ACTOR_ID })

      expect(failState.status).toBe("failed")
      expect(failState.stepStates["bool-gate-fail"]).toBe("failed")
    })

    // ── Point 5: Gate evaluation (scored) ─────────────────────────────────────

    it("5. Gate evaluation (scored) — step with gateConfig delegates to evaluateGate()", async () => {
      const defId = `def-scored-${Date.now()}`
      const pool = getPool()
      await seedDefinition(pool, defId, "Scored Gate Test")

      const evaluateFn = async () => ({
        score: 0.95,
        evidenceId: "ev-scored-e2e-001",
        reasoning: "All quality criteria met",
      })

      const def = makeDef(defId, "Scored Gate Test", {
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

      const engine = new ProcessEngine(pool)
      const state = await engine.run(def, { agentId: ACTOR_ID })

      expect(state.status).toBe("completed")
      expect(state.stepStates["scored-gate"]).toBe("completed")

      const gateResult = state.stepResults["scored-gate"] as Record<string, unknown>
      expect(gateResult.passed).toBe(true)
      expect(gateResult.gateResult).toBeDefined()
    })

    // ── Point 6: Run lifecycle tracking ───────────────────────────────────────

    it(
      "6. Run lifecycle tracking — process_runs row created; snapshot reaches terminal status; doctor reports no false-positive findings",
      async () => {
        const defId = `def-lifecycle-${Date.now()}`
        const pool = getPool()
        await seedDefinition(pool, defId, "Lifecycle Test")

        const def = makeDef(defId, "Lifecycle Test", {
          steps: [
            {
              id: "lifecycle-step",
              name: "Lifecycle Step",
              type: "step",
              execute: async () => ({ value: 42 }),
            },
          ],
        })

        const engine = new ProcessEngine(pool)
        const state = await engine.run(def, { agentId: ACTOR_ID })

        // Engine-level assertion: process completed
        expect(state.status).toBe("completed")

        // Verify process_runs snapshot row — tenant scoping and actor
        const row = await pool.query(
          `SELECT id, definition_id, group_id, actor_id, status
           FROM process_runs
           WHERE id = $1 AND group_id = $2`,
          [state.processId, GROUP_ID],
        )

        expect(row.rows.length).toBe(1)
        expect(row.rows[0].definition_id).toBe(defId)
        expect(row.rows[0].group_id).toBe(GROUP_ID)
        expect(row.rows[0].actor_id).toBe(ACTOR_ID)

        // REGRESSION GUARD (GIT-EXEC-001 / µs-precision fix):
        // The snapshot status MUST reach "completed" — not be stuck at "pending".
        // If updateRunSnapshot's optimistic-lock token lost µs precision the WHERE
        // would match 0 rows (rowCount 0 silent no-op) and status would stay "pending".
        // This assertion is the live-DB proof that the token round-trips exactly.
        expect(row.rows[0].status).toBe("completed")

        // The event trail is the canonical source of truth per architecture invariant
        const completedEvent = await pool.query(
          `SELECT event_type, metadata FROM events
           WHERE workflow_id = $1 AND event_type = 'process_completed'
           ORDER BY created_at DESC LIMIT 1`,
          [state.processId],
        )
        expect(completedEvent.rows.length).toBe(1)
        expect(completedEvent.rows[0].event_type).toBe("process_completed")
        expect(completedEvent.rows[0].metadata.definitionId).toBe(defId)

        // DOCTOR FALSE-POSITIVE GUARD:
        // checkPartiallyPersisted compares snapshot status against the latest event's
        // implied status. If the snapshot stayed "pending" (pre-fix) while the event
        // said "completed", it fired severity:"critical"/repair_with_approval on every
        // completed run. After the fix the snapshot status == event-implied status so
        // diagnoseRun must return zero findings for a cleanly completed run.
        const findings = await engine.diagnose(state.processId, GROUP_ID, {
          staleThresholdMinutes: 30,
        })
        expect(findings).toHaveLength(0)
      },
    )

    // ── Point 7: Circuit breaker ───────────────────────────────────────────────

    it("7. Circuit breaker — process fails immediately when circuit breaker is open", async () => {
      // This point requires overriding the circuit breaker. In the live-DB path
      // the circuit breaker is a real instance backed by no persistent store; its
      // state lives in-process memory. We trigger the open state by importing the
      // real getBreakerManager and force-tripping it for our group_id.
      // If the circuit-breaker module offers no trip API we fall back to
      // verifying the behaviour through process_runs status.
      //
      // Strategy: run a definition that has a single no-op step so there is no
      // real I/O to trip; instead trip the breaker manually via its internal state.
      const defId = `def-cb-${Date.now()}`
      const pool = getPool()
      await seedDefinition(pool, defId, "Circuit Breaker Test")

      const { getBreakerManager } = await import("@/lib/circuit-breaker")
      const manager = getBreakerManager()
      const breaker = manager.getOrCreateBreaker("process-engine", GROUP_ID, "tool")

      // Force the breaker open via the public forceTrip() API.
      ;(breaker as unknown as { forceTrip: () => void }).forceTrip()

      const def = makeDef(defId, "Circuit Breaker Test", {
        steps: [
          {
            id: "cb-step",
            name: "Step Behind Open Breaker",
            type: "step",
            execute: async () => ({ unreachable: true }),
          },
        ],
      })

      try {
        const engine = new ProcessEngine(pool)
        const state = await engine.run(def, { agentId: ACTOR_ID })

        // Engine ran with open breaker — state must be failed
        expect(state.status).toBe("failed")
        expect(state.error).toContain("Circuit breaker")
        expect(state.stepStates["cb-step"]).not.toBe("completed")
      } finally {
        // Reset breaker so it does not bleed into other tests
        ;(breaker as unknown as { reset: () => void }).reset()
      }
    })

    // ── Point 8: Cancel ────────────────────────────────────────────────────────

    it("8. Cancel — a paused process can be cancelled", async () => {
      // Run a process to paused state, then cancel it.
      const defId = `def-cancel-${Date.now()}`
      const pool = getPool()
      await seedDefinition(pool, defId, "Cancel Test")

      const def = makeDef(defId, "Cancel Test", {
        steps: [
          {
            id: "pre-cancel",
            name: "Pre-cancel step",
            type: "step",
            execute: async () => ({ done: true }),
          },
          {
            id: "cp-cancel",
            name: "Checkpoint before cancel",
            type: "checkpoint",
          },
          {
            id: "post-cancel",
            name: "Should not run",
            type: "step",
            execute: async () => ({ ran: true }),
          },
        ],
      })

      const engine = new ProcessEngine(pool)
      const paused = await engine.run(def, {
        agentId: ACTOR_ID,
        promotionMode: "soc2",
      })

      expect(paused.status).toBe("paused")
      const processId = paused.processId

      // Cancel the paused process
      await expect(
        engine.cancel(processId, "test-suite cancellation"),
      ).resolves.toBeUndefined()

      // Verify cancel persisted to events
      const eventRow = await pool.query(
        `SELECT event_type, metadata FROM events
         WHERE workflow_id = $1 AND event_type = 'process_cancelled'
         ORDER BY created_at DESC LIMIT 1`,
        [processId],
      )
      expect(eventRow.rows.length).toBe(1)
      expect(eventRow.rows[0].metadata.reason).toContain("cancellation")
    })

    // ── Point 9: Diagnose ──────────────────────────────────────────────────────

    it("9. Diagnose — engine.diagnose() returns findings (or empty) from live DB", async () => {
      // doctor.diagnoseRun() queries process_runs for the run.
      // With a real runId that doesn't exist, it returns [].
      // With a real completed run it also returns [] (not stale/active).
      // Point 9 verifies: diagnose() does NOT throw and returns an array.
      const pool = getPool()
      const engine = new ProcessEngine(pool)

      const findings = await engine.diagnose("nonexistent-run-e2e", GROUP_ID, {
        staleThresholdMinutes: 30,
      })

      expect(Array.isArray(findings)).toBe(true)
      // A nonexistent run returns no findings
      expect(findings.length).toBe(0)

      // Run a real process and verify diagnose still returns []
      // (a just-completed run is not stale or drifted)
      const defId = `def-diagnose-${Date.now()}`
      await seedDefinition(pool, defId, "Diagnose Test")
      const def = makeDef(defId, "Diagnose Test", {
        steps: [
          {
            id: "d-step",
            name: "Diagnose step",
            type: "step",
            execute: async () => ({ ok: true }),
          },
        ],
      })

      const engine2 = new ProcessEngine(pool)
      const state = await engine2.run(def, { agentId: ACTOR_ID })
      expect(state.status).toBe("completed")

      const findingsForCompleted = await engine2.diagnose(
        state.processId,
        GROUP_ID,
        { staleThresholdMinutes: 30 },
      )
      expect(Array.isArray(findingsForCompleted)).toBe(true)
    })

    // ── Point 10: Timeline replay ──────────────────────────────────────────────

    it("10. Timeline replay — engine.getTimeline() reconstructs execution history from live events", async () => {
      const defId = `def-replay-${Date.now()}`
      const pool = getPool()
      await seedDefinition(pool, defId, "Replay Test")

      const def = makeDef(defId, "Replay Test", {
        steps: [
          {
            id: "r-step-a",
            name: "Replay Step A",
            type: "step",
            execute: async () => ({ letter: "a" }),
          },
          {
            id: "r-step-b",
            name: "Replay Step B",
            type: "step",
            execute: async () => ({ letter: "b" }),
          },
        ],
      })

      const engine = new ProcessEngine(pool)
      const state = await engine.run(def, { agentId: ACTOR_ID })
      expect(state.status).toBe("completed")

      const timeline = await engine.getTimeline(state.processId, { verbose: true })

      expect(timeline.processId).toBe(state.processId)
      expect(timeline.groupId).toBe(GROUP_ID)
      expect(timeline.status).toBe("completed")
      expect(Array.isArray(timeline.steps)).toBe(true)
      expect(timeline.steps.length).toBeGreaterThan(0)

      // Both steps must appear in the timeline
      const stepIds = timeline.steps.map((s) => s.stepId)
      expect(stepIds).toContain("r-step-a")
      expect(stepIds).toContain("r-step-b")

      // Verify via ReplayEngine directly (mirrors mocked gate's assertion)
      const replayEngine = new ReplayEngine(pool)
      const timeline2 = await replayEngine.replay(state.processId, { verbose: true })
      expect(timeline2.status).toBe("completed")
      expect(timeline2.steps.find((s) => s.stepId === "r-step-a")).toBeDefined()
    })
  },
)
