/**
 * memory_export(canonical_only=true) contract.
 *
 * The REAL RuVectorGraphAdapter runs over a fake pg pool (only the database is
 * faked), so this proves the export travels a supported, workspace-scoped read
 * path and returns the records the store holds. A retired adapter method would
 * throw here rather than be mocked away.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const queries: Array<{ text: string; values?: unknown[] }> = []
let semanticRows: Array<Record<string, unknown>> = []
let failSemanticRead = false

function respond(text: string, values?: unknown[]) {
  queries.push({ text, values })
  if (/FROM graph_memories/.test(text)) {
    if (failSemanticRead) throw new Error("db down")
    if (/COUNT\(\*\)/.test(text)) return { rows: [{ total: String(semanticRows.length) }] }
    return { rows: semanticRows }
  }
  return { rows: [], rowCount: 0 }
}

const fakeClient = { query: vi.fn(async (t: string, v?: unknown[]) => respond(t, v)), release: vi.fn() }
const fakePool = { query: fakeClient.query, connect: vi.fn(async () => fakeClient) }

vi.mock("@/mcp/canonical-tools/connection", () => ({
  getConnections: vi.fn(async () => ({ pg: fakePool })),
  resetConnections: vi.fn(),
}))

import { DatabaseUnavailableError } from "@/lib/errors/database-errors"
import { memory_export } from "@/mcp/canonical-tools"
import type { GroupId } from "@/lib/memory/canonical-contracts"

const GROUP = "allura-test-export" as GroupId
const SCOPE = { group_id: GROUP, workspace_id: "ws-export", agent_id: "exporter" }

function row(id: string, content: string) {
  return {
    id,
    group_id: GROUP,
    user_id: "u1",
    content,
    score: 0.9,
    provenance: "manual",
    created_at: "2026-01-01T00:00:00.000Z",
    version: 1,
    tags: [],
    deprecated: false,
    deleted_at: null,
    restored_at: null,
  }
}

describe("memory_export canonical_only contract", () => {
  beforeEach(() => {
    queries.length = 0
    semanticRows = []
    failSemanticRead = false
  })

  it("returns the canonical records held by the active semantic store", async () => {
    semanticRows = [row("mem-1", "canonical fact")]

    const res = await memory_export({ group_id: GROUP, scope: SCOPE, canonical_only: true })

    expect(res.memories.map((m) => [m.id, m.content, m.source])).toEqual([
      ["mem-1", "canonical fact", "semantic"],
    ])
    expect(res.canonical_count).toBe(1)
    expect(res.episodic_count).toBe(0)
    // Read is workspace-scoped and never touches the episodic events table.
    const read = queries.find((q) => /FROM graph_memories/.test(q.text) && !/COUNT/.test(q.text))
    expect(read?.values).toEqual(expect.arrayContaining([GROUP, "ws-export"]))
    expect(queries.some((q) => /FROM events/.test(q.text))).toBe(false)
  })

  it("applies limit and offset to the canonical set", async () => {
    semanticRows = [row("m1", "a"), row("m2", "b"), row("m3", "c")]

    const res = await memory_export({ group_id: GROUP, scope: SCOPE, canonical_only: true, limit: 2, offset: 1 })

    expect(res.memories.map((m) => m.id)).toEqual(["m2", "m3"])
  })

  it("fails closed without a workspace scope instead of returning an empty success", async () => {
    semanticRows = [row("mem-1", "canonical fact")]

    await expect(memory_export({ group_id: GROUP, canonical_only: true })).rejects.toThrow(
      /workspace scope is required/
    )
    expect(queries).toEqual([])
  })

  it("surfaces a semantic-store outage as DatabaseUnavailableError", async () => {
    failSemanticRead = true

    const err = await memory_export({ group_id: GROUP, scope: SCOPE, canonical_only: true }).catch(
      (e: unknown) => e
    )

    expect(err).toBeInstanceOf(DatabaseUnavailableError)
    expect((err as Error).message).toContain("memory_export:semantic")
  })
})
