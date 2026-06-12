/**
 * Evidence Manager Tests — Work Plane Phase 2
 *
 * Covers:
 *   createEvidencePacket — insert with all fields, defaults for optional fields
 *   getEvidencePacket    — fetch by (id, group_id), returns null when missing
 *   listEvidenceByWorkItem — filters by work_item_id + group_id, respects limit
 *   listEvidenceByRun    — filters by run_id + group_id, respects limit
 *   artifact_refs        — serialized as JSONB array, deserialized as string[]
 */

import { describe, expect, it, vi } from "vitest"
import type { Pool, QueryResult } from "pg"
import {
  createEvidencePacket,
  getEvidencePacket,
  listEvidenceByWorkItem,
  listEvidenceByRun,
} from "./evidence-manager"
import type { EvidencePacketType } from "./types"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvidenceRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "ep_001",
    group_id: "allura-system",
    work_item_id: "wi_001",
    run_id: null,
    step_id: null,
    actor_id: "agent-woz",
    packet_type: "general",
    content: { result: "pass" },
    artifact_refs: [],
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

function mockPool(responses: Array<Partial<QueryResult>>): { pool: Pool; querySpy: ReturnType<typeof vi.fn> } {
  let callIndex = 0
  const querySpy = vi.fn().mockImplementation(() => {
    const response = responses[callIndex] ?? { rows: [], rowCount: 0 }
    callIndex++
    return Promise.resolve({
      rows: [],
      rowCount: 0,
      ...response,
    } as QueryResult)
  })
  const pool = { query: querySpy } as unknown as Pool
  return { pool, querySpy }
}

// ── createEvidencePacket ──────────────────────────────────────────────────────

describe("createEvidencePacket", () => {
  it("inserts and returns the created packet", async () => {
    const row = makeEvidenceRow()
    const { pool } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await createEvidencePacket(pool, {
      id: "ep_001",
      groupId: "allura-system",
      actorId: "agent-woz",
      packetType: "general",
      content: { result: "pass" },
      workItemId: "wi_001",
    })

    expect(result.id).toBe("ep_001")
    expect(result.group_id).toBe("allura-system")
    expect(result.actor_id).toBe("agent-woz")
    expect(result.packet_type).toBe("general")
    expect(result.work_item_id).toBe("wi_001")
  })

  it("sets run_id and step_id when provided", async () => {
    const row = makeEvidenceRow({ run_id: "run_abc", step_id: "step_1", work_item_id: null })
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await createEvidencePacket(pool, {
      id: "ep_002",
      groupId: "allura-system",
      actorId: "agent-woz",
      packetType: "gate_result",
      content: { status: "ok" },
      runId: "run_abc",
      stepId: "step_1",
    })

    expect(result.run_id).toBe("run_abc")
    expect(result.step_id).toBe("step_1")
    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[3]).toBe("run_abc")
    expect(params[4]).toBe("step_1")
  })

  it("defaults workItemId, runId, stepId to null when omitted", async () => {
    const row = makeEvidenceRow({ work_item_id: null, run_id: null, step_id: null })
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    await createEvidencePacket(pool, {
      id: "ep_003",
      groupId: "allura-system",
      actorId: "agent-woz",
      packetType: "audit",
      content: {},
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[2]).toBeNull() // workItemId
    expect(params[3]).toBeNull() // runId
    expect(params[4]).toBeNull() // stepId
  })

  it("serializes content as a JSON string in the INSERT params", async () => {
    const row = makeEvidenceRow({ content: { key: "value" } })
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    await createEvidencePacket(pool, {
      id: "ep_004",
      groupId: "allura-system",
      actorId: "agent-woz",
      packetType: "review",
      content: { key: "value" },
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(typeof params[7]).toBe("string")
    expect(JSON.parse(params[7] as string)).toEqual({ key: "value" })
  })

  it("serializes artifact_refs as a JSON array string", async () => {
    const refs = ["s3://bucket/file1.txt", "s3://bucket/file2.txt"]
    const row = makeEvidenceRow({ artifact_refs: refs })
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    await createEvidencePacket(pool, {
      id: "ep_005",
      groupId: "allura-system",
      actorId: "agent-woz",
      packetType: "test_result",
      content: {},
      artifactRefs: refs,
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(typeof params[8]).toBe("string")
    expect(JSON.parse(params[8] as string)).toEqual(refs)
  })

  it("returns artifact_refs as an array on the result", async () => {
    const refs = ["s3://bucket/report.html"]
    const row = makeEvidenceRow({ artifact_refs: refs })
    const { pool } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await createEvidencePacket(pool, {
      id: "ep_006",
      groupId: "allura-system",
      actorId: "agent-woz",
      packetType: "approval",
      content: {},
      artifactRefs: refs,
    })

    expect(Array.isArray(result.artifact_refs)).toBe(true)
    expect(result.artifact_refs).toEqual(refs)
  })

  it("defaults artifact_refs to empty array when omitted", async () => {
    const row = makeEvidenceRow({ artifact_refs: [] })
    const { pool } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await createEvidencePacket(pool, {
      id: "ep_007",
      groupId: "allura-system",
      actorId: "agent-woz",
      packetType: "general",
      content: {},
    })

    expect(result.artifact_refs).toEqual([])
  })

  it("returned created_at is an ISO-8601 string", async () => {
    const row = makeEvidenceRow()
    const { pool } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await createEvidencePacket(pool, {
      id: "ep_008",
      groupId: "allura-system",
      actorId: "agent-woz",
      packetType: "general",
      content: {},
    })

    expect(typeof result.created_at).toBe("string")
    expect(new Date(result.created_at).toISOString()).toBe(result.created_at)
  })
})

// ── getEvidencePacket ─────────────────────────────────────────────────────────

describe("getEvidencePacket", () => {
  it("returns the matching packet", async () => {
    const row = makeEvidenceRow()
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await getEvidencePacket(pool, {
      id: "ep_001",
      groupId: "allura-system",
    })

    expect(result).not.toBeNull()
    expect(result!.id).toBe("ep_001")
    expect(querySpy.mock.calls[0][1]).toEqual(["ep_001", "allura-system"])
  })

  it("returns null when no packet matches", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await getEvidencePacket(pool, {
      id: "missing",
      groupId: "allura-system",
    })

    expect(result).toBeNull()
  })

  it("scopes query to group_id", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await getEvidencePacket(pool, { id: "ep_001", groupId: "allura-test" })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[1]).toBe("allura-test")
  })
})

// ── listEvidenceByWorkItem ────────────────────────────────────────────────────

describe("listEvidenceByWorkItem", () => {
  it("returns all packets for the work item", async () => {
    const rows = [
      makeEvidenceRow({ id: "ep_002" }),
      makeEvidenceRow({ id: "ep_001" }),
    ]
    const { pool } = mockPool([{ rows, rowCount: rows.length }])

    const result = await listEvidenceByWorkItem(pool, {
      workItemId: "wi_001",
      groupId: "allura-system",
    })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("ep_002")
  })

  it("scopes query to group_id and work_item_id", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listEvidenceByWorkItem(pool, {
      workItemId: "wi_abc",
      groupId: "allura-test",
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[0]).toBe("wi_abc")
    expect(params[1]).toBe("allura-test")
  })

  it("defaults limit to 100", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listEvidenceByWorkItem(pool, {
      workItemId: "wi_001",
      groupId: "allura-system",
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[2]).toBe(100)
  })

  it("respects caller-supplied limit", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listEvidenceByWorkItem(pool, {
      workItemId: "wi_001",
      groupId: "allura-system",
      limit: 10,
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[2]).toBe(10)
  })

  it("returns empty array when no packets exist", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await listEvidenceByWorkItem(pool, {
      workItemId: "wi_empty",
      groupId: "allura-system",
    })

    expect(result).toEqual([])
  })
})

// ── listEvidenceByRun ─────────────────────────────────────────────────────────

describe("listEvidenceByRun", () => {
  it("returns all packets for the run", async () => {
    const rows = [
      makeEvidenceRow({ id: "ep_r2", run_id: "run_abc", work_item_id: null }),
      makeEvidenceRow({ id: "ep_r1", run_id: "run_abc", work_item_id: null }),
    ]
    const { pool } = mockPool([{ rows, rowCount: rows.length }])

    const result = await listEvidenceByRun(pool, {
      runId: "run_abc",
      groupId: "allura-system",
    })

    expect(result).toHaveLength(2)
  })

  it("scopes query to group_id and run_id", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listEvidenceByRun(pool, {
      runId: "run_xyz",
      groupId: "allura-test",
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[0]).toBe("run_xyz")
    expect(params[1]).toBe("allura-test")
  })

  it("defaults limit to 100", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listEvidenceByRun(pool, {
      runId: "run_abc",
      groupId: "allura-system",
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[2]).toBe(100)
  })

  it("respects caller-supplied limit", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listEvidenceByRun(pool, {
      runId: "run_abc",
      groupId: "allura-system",
      limit: 5,
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[2]).toBe(5)
  })

  it("returns empty array when no packets exist for the run", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await listEvidenceByRun(pool, {
      runId: "run_missing",
      groupId: "allura-system",
    })

    expect(result).toEqual([])
  })
})
