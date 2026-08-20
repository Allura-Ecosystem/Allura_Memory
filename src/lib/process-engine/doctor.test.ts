/**
 * Doctor Module Tests
 * Phase 1 Run ControlPlane (AD-P1-04)
 *
 * Covers:
 *   - stale detection (active run, last event older than threshold)
 *   - stale non-detection (active run, recent event)
 *   - revision_drifted detection (run pinned to old revision)
 *   - revision_drifted non-detection (run pinned to latest)
 *   - partially_persisted detection (snapshot vs event mismatch)
 *   - partially_persisted non-detection (snapshot matches events)
 *   - diagnoseRun: single run, returns all findings
 *   - runDoctorCycle: scans all active runs in tenant
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Pool Mock ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal pg Pool mock.
 * queryResponses is a list of return values that pool.query() will cycle through
 * in order — first call returns queryResponses[0], second call returns [1], etc.
 */
function buildPool(queryResponses: Array<{ rows: Record<string, unknown>[] }>) {
  let callIndex = 0
  return {
    query: vi.fn(async () => {
      const response = queryResponses[callIndex] ?? { rows: [] }
      callIndex++
      return response
    }),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

const GROUP_ID = "allura-system"
const RUN_ID = "run_abc123"
const DEF_ID = "def_xyz"

// ── Import under test ─────────────────────────────────────────────────────────

// We import after the window guard would run (Node environment = safe).
// Vitest runs in Node so the guard does not fire.
const { diagnoseRun, runDoctorCycle } = await import("./doctor")

// ── stale condition ───────────────────────────────────────────────────────────

describe("stale condition", () => {
  it("detects a stale run when last event exceeds threshold", async () => {
    const pool = buildPool([
      // (1) process_runs lookup — run is "running"
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      // (2) stale check — last event was 90 minutes ago (> default 60m threshold)
      { rows: [{ last_event: minutesAgo(90) }] },
      // (3) revision_drifted — latest revision matches pinned
      { rows: [{ max_revision: 1 }] },
      // (4) partially_persisted — last event type implies "running"
      { rows: [{ event_type: "step_completed" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    const staleFindings = findings.filter((f) => f.condition === "stale")
    expect(staleFindings).toHaveLength(1)
    expect(staleFindings[0].runId).toBe(RUN_ID)
    expect(staleFindings[0].severity).toBe("warning")
    expect(staleFindings[0].recommendedAction).toBe("flag")
    expect(staleFindings[0].detail).toMatch(/90/)
  })

  it("does not flag a stale run when last event is within threshold", async () => {
    const pool = buildPool([
      // (1) process_runs lookup
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      // (2) stale check — last event only 5 minutes ago
      { rows: [{ last_event: minutesAgo(5) }] },
      // (3) revision_drifted — latest matches
      { rows: [{ max_revision: 1 }] },
      // (4) partially_persisted — event implies running
      { rows: [{ event_type: "step_started" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    expect(findings.filter((f) => f.condition === "stale")).toHaveLength(0)
  })

  it("flags as stale when there are no events at all", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      // No events recorded
      { rows: [{ last_event: null }] },
      { rows: [{ max_revision: 1 }] },
      // No events for partial check either
      { rows: [] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    const staleFindings = findings.filter((f) => f.condition === "stale")
    expect(staleFindings).toHaveLength(1)
    expect(staleFindings[0].detail).toMatch(/no recorded events/)
  })

  it("respects a custom staleThresholdMinutes parameter", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "paused",
          },
        ],
      },
      // 10 minutes ago — above custom 5m threshold
      { rows: [{ last_event: minutesAgo(10) }] },
      { rows: [{ max_revision: 1 }] },
      { rows: [{ event_type: "checkpoint_blocked" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
      staleThresholdMinutes: 5,
    })

    expect(findings.filter((f) => f.condition === "stale")).toHaveLength(1)
  })
})

// ── revision_drifted condition ────────────────────────────────────────────────

describe("revision_drifted condition", () => {
  it("detects drift when run is pinned to an older revision", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      // Recent event — no stale
      { rows: [{ last_event: minutesAgo(2) }] },
      // Latest definition revision is 3, run is pinned to 1
      { rows: [{ max_revision: 3 }] },
      // Event implies running — no partial_persisted
      { rows: [{ event_type: "step_completed" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    const driftFindings = findings.filter((f) => f.condition === "revision_drifted")
    expect(driftFindings).toHaveLength(1)
    expect(driftFindings[0].runId).toBe(RUN_ID)
    expect(driftFindings[0].severity).toBe("warning")
    expect(driftFindings[0].detail).toMatch(/revision 1/)
    expect(driftFindings[0].detail).toMatch(/3/)
    expect(driftFindings[0].recommendedAction).toBe("flag")
  })

  it("does not flag drift when run is pinned to the latest revision", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 3,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      { rows: [{ last_event: minutesAgo(2) }] },
      // Latest revision also 3 — no drift
      { rows: [{ max_revision: 3 }] },
      { rows: [{ event_type: "step_completed" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    expect(findings.filter((f) => f.condition === "revision_drifted")).toHaveLength(0)
  })

  it("does not flag drift when no active definition exists", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      { rows: [{ last_event: minutesAgo(2) }] },
      // No active (non-deleted) definition found
      { rows: [{ max_revision: null }] },
      { rows: [{ event_type: "step_completed" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    expect(findings.filter((f) => f.condition === "revision_drifted")).toHaveLength(0)
  })
})

// ── partially_persisted condition ─────────────────────────────────────────────

describe("partially_persisted condition", () => {
  it("detects mismatch when snapshot says running but last event is checkpoint_blocked", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running", // snapshot says running
          },
        ],
      },
      { rows: [{ last_event: minutesAgo(2) }] },
      { rows: [{ max_revision: 1 }] },
      // Latest event implies "paused" — mismatch!
      { rows: [{ event_type: "checkpoint_blocked" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    const partialFindings = findings.filter((f) => f.condition === "partially_persisted")
    expect(partialFindings).toHaveLength(1)
    expect(partialFindings[0].runId).toBe(RUN_ID)
    expect(partialFindings[0].severity).toBe("critical")
    expect(partialFindings[0].recommendedAction).toBe("repair_with_approval")
    expect(partialFindings[0].detail).toMatch(/running/)
    expect(partialFindings[0].detail).toMatch(/checkpoint_blocked/)
    expect(partialFindings[0].detail).toMatch(/paused/)
  })

  it("detects mismatch when snapshot says paused but last event implies running", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "paused", // snapshot says paused
          },
        ],
      },
      { rows: [{ last_event: minutesAgo(2) }] },
      { rows: [{ max_revision: 1 }] },
      // Latest event is checkpoint_resumed — implies "running"
      { rows: [{ event_type: "checkpoint_resumed" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    expect(findings.filter((f) => f.condition === "partially_persisted")).toHaveLength(1)
  })

  it("does not flag when snapshot status matches last event", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "paused", // snapshot says paused
          },
        ],
      },
      { rows: [{ last_event: minutesAgo(2) }] },
      { rows: [{ max_revision: 1 }] },
      // Latest event also implies "paused" — matches
      { rows: [{ event_type: "checkpoint_blocked" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    expect(findings.filter((f) => f.condition === "partially_persisted")).toHaveLength(0)
  })

  it("skips the check when no events exist for the run", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      // No events at all — stale check
      { rows: [{ last_event: null }] },
      { rows: [{ max_revision: 1 }] },
      // No events for partial check
      { rows: [] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    expect(findings.filter((f) => f.condition === "partially_persisted")).toHaveLength(0)
  })
})

// ── diagnoseRun ───────────────────────────────────────────────────────────────

describe("diagnoseRun", () => {
  it("returns all findings for a single unhealthy run", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      // stale — last event 120 minutes ago
      { rows: [{ last_event: minutesAgo(120) }] },
      // revision_drifted — definition is now at revision 5
      { rows: [{ max_revision: 5 }] },
      // partially_persisted — snapshot running but event implies paused
      { rows: [{ event_type: "checkpoint_blocked" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    expect(findings).toHaveLength(3)
    expect(findings.map((f) => f.condition).sort()).toEqual([
      "partially_persisted",
      "revision_drifted",
      "stale",
    ])
  })

  it("returns empty array for a healthy run", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 2,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      // No stale — recent event
      { rows: [{ last_event: minutesAgo(1) }] },
      // No drift — pinned to latest
      { rows: [{ max_revision: 2 }] },
      // No partial — event matches snapshot
      { rows: [{ event_type: "step_completed" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    expect(findings).toHaveLength(0)
  })

  it("returns empty array when the run does not exist", async () => {
    const pool = buildPool([{ rows: [] }])

    const findings = await diagnoseRun(pool as never, {
      runId: "run_nonexistent",
      groupId: GROUP_ID,
    })

    expect(findings).toHaveLength(0)
  })

  it("returns empty array for a completed run (not active)", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "completed", // not active — doctor skips
          },
        ],
      },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    expect(findings).toHaveLength(0)
  })

  it("returns empty array for a failed run (not active)", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "failed",
          },
        ],
      },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    expect(findings).toHaveLength(0)
  })

  it("every finding carries runId and a detectedAt ISO timestamp", async () => {
    const pool = buildPool([
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      { rows: [{ last_event: minutesAgo(200) }] },
      { rows: [{ max_revision: 1 }] },
      { rows: [{ event_type: "step_completed" }] },
    ])

    const findings = await diagnoseRun(pool as never, {
      runId: RUN_ID,
      groupId: GROUP_ID,
    })

    for (const f of findings) {
      expect(f.runId).toBe(RUN_ID)
      expect(() => new Date(f.detectedAt)).not.toThrow()
      expect(new Date(f.detectedAt).toISOString()).toBe(f.detectedAt)
    }
  })
})

// ── runDoctorCycle ────────────────────────────────────────────────────────────

describe("runDoctorCycle", () => {
  it("returns findings across all active runs in a tenant", async () => {
    const RUN_A = "run_a"
    const RUN_B = "run_b"

    const pool = buildPool([
      // (1) Fetch all active runs — two active runs
      {
        rows: [
          {
            id: RUN_A,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running",
          },
          {
            id: RUN_B,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "paused",
          },
        ],
      },
      // Run A conditions
      { rows: [{ last_event: minutesAgo(90) }] },   // stale
      { rows: [{ max_revision: 1 }] },               // no drift
      { rows: [{ event_type: "step_completed" }] },  // no partial
      // Run B conditions
      { rows: [{ last_event: minutesAgo(5) }] },     // not stale
      { rows: [{ max_revision: 3 }] },               // drifted (pinned 1, latest 3)
      { rows: [{ event_type: "checkpoint_blocked" }] }, // partial? paused vs paused = ok
    ])

    const findings = await runDoctorCycle(pool as never, { groupId: GROUP_ID })

    // Run A should have 1 stale finding
    const runAFindings = findings.filter((f) => f.runId === RUN_A)
    expect(runAFindings.some((f) => f.condition === "stale")).toBe(true)

    // Run B should have 1 revision_drifted finding
    const runBFindings = findings.filter((f) => f.runId === RUN_B)
    expect(runBFindings.some((f) => f.condition === "revision_drifted")).toBe(true)
  })

  it("returns empty array when there are no active runs", async () => {
    const pool = buildPool([{ rows: [] }])

    const findings = await runDoctorCycle(pool as never, { groupId: GROUP_ID })

    expect(findings).toHaveLength(0)
    // Only one query should have been made (the active runs query)
    expect(pool.query).toHaveBeenCalledTimes(1)
  })

  it("passes staleThresholdMinutes through to each run check", async () => {
    const pool = buildPool([
      // One active run
      {
        rows: [
          {
            id: RUN_ID,
            definition_id: DEF_ID,
            definition_revision: 1,
            group_id: GROUP_ID,
            status: "running",
          },
        ],
      },
      // Last event 10 minutes ago — only stale if threshold < 10
      { rows: [{ last_event: minutesAgo(10) }] },
      { rows: [{ max_revision: 1 }] },
      { rows: [{ event_type: "step_completed" }] },
    ])

    const findings = await runDoctorCycle(pool as never, {
      groupId: GROUP_ID,
      staleThresholdMinutes: 5, // 10m > 5m threshold → should be stale
    })

    expect(findings.filter((f) => f.condition === "stale")).toHaveLength(1)
  })

  it("does not include findings from completed or failed runs", async () => {
    const pool = buildPool([
      // Active runs query returns only running/paused — completed/failed
      // are excluded by the SQL WHERE clause (status = ANY(...active statuses))
      { rows: [] },
    ])

    const findings = await runDoctorCycle(pool as never, { groupId: GROUP_ID })

    expect(findings).toHaveLength(0)
  })
})

// ── Read-only contract ────────────────────────────────────────────────────────

describe("read-only contract", () => {
  it("never issues INSERT or UPDATE queries", async () => {
    const queries: string[] = []
    const pool = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql.trim().toUpperCase())
        // Return empty results for all queries
        return { rows: [] }
      }),
    }

    await diagnoseRun(pool as never, { runId: RUN_ID, groupId: GROUP_ID })

    for (const q of queries) {
      expect(q).not.toMatch(/^\s*INSERT/)
      expect(q).not.toMatch(/^\s*UPDATE/)
      expect(q).not.toMatch(/^\s*DELETE/)
    }
  })
})
