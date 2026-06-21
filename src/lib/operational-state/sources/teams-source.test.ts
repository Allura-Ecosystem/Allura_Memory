/**
 * Teams Source — Unit Tests (Phase 0 Story 8)
 *
 * Pins the SourceOutcome mapping for the Teams surface:
 * - successful query          -> { ok: true } with parsed snapshot
 * - empty activity           -> isTeamsEmpty() = true
 * - unreachable pool         -> null (degraded)
 * - query failure            -> { ok: false } with sanitized error
 * - group_id is always a bound parameter (tenant invariant)
 * - team roster built from AGENT_MANIFEST (AD-15)
 * - activity counts merged from Postgres
 *
 * Usage: bun vitest run src/lib/operational-state/sources/teams-source.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Mock dependencies before importing ────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(),
}))

// ── Import after mocking ──────────────────────────────────────────────────────

import { getPool } from "@/lib/postgres/connection"
import { resolveOperationalSurface } from "../index"
import {
  isTeamsEmpty,
  readTeams,
  type TeamsSnapshot,
} from "./teams-source"

const getPoolMock = getPool as unknown as ReturnType<typeof vi.fn>

const GROUP_ID = "allura-system"

// The source runs 3 parallel queries: workspaces, mcp_tokens, events (activity)
const DEFAULT_WORKSPACES = [
  { workspace_id: "ram", name: "Team RAM", lock_mode: "open" },
]
const DEFAULT_TOKENS = [
  { id: "brooks", workspace_id: "ram", agent_name: "brooks", scopes: ["memory:read", "memory:write"], revoked_at: null },
  { id: "woz", workspace_id: "ram", agent_name: "woz", scopes: ["memory:read", "memory:write"], revoked_at: null },
  { id: "scout", workspace_id: "ram", agent_name: "scout", scopes: ["memory:read"], revoked_at: null },
  { id: "pike", workspace_id: "ram", agent_name: "pike", scopes: ["memory:read"], revoked_at: null },
]

function mockQueryResults(opts: {
  workspaces?: Record<string, unknown>[]
  tokens?: Record<string, unknown>[]
  events?: Record<string, unknown>[]
}) {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: opts.workspaces ?? DEFAULT_WORKSPACES })
    .mockResolvedValueOnce({ rows: opts.tokens ?? DEFAULT_TOKENS })
    .mockResolvedValueOnce({ rows: opts.events ?? [] })
  getPoolMock.mockReturnValue({ query })
  return query
}

/** Convenience: only customize the events query, use defaults for workspaces+tokens */
function mockQueryResult(eventRows: Record<string, unknown>[] | undefined) {
  return mockQueryResults({ events: eventRows === undefined ? [] : eventRows })
}

describe("readTeams", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns ok with a parsed snapshot on a successful query with activity", async () => {
    const query = mockQueryResult([
      { agent_id: "brooks", event_count: "12" },
      { agent_id: "woz", event_count: "5" },
    ])

    const outcome = await readTeams(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")

    // Should have teams from workspaces table
    expect(outcome.data.teams.length).toBeGreaterThanOrEqual(1)
    expect(outcome.data.groupId).toBe(GROUP_ID)
    expect(outcome.data.totalAgents).toBe(4) // 4 tokens in ram workspace
    expect(outcome.data.totalEvents24h).toBe(17) // 12 + 5

    // Activity counts should be merged into agents
    const ramTeam = outcome.data.teams.find((t) => t.id === "ram")
    expect(ramTeam).toBeDefined()
    const brooksAgent = ramTeam?.agents.find((a) => a.persona === "brooks")
    expect(brooksAgent?.events24h).toBe(12)

    // Tenant invariant: group_id is a bound parameter on all queries
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain("group_id = $1")
    expect(params).toEqual([GROUP_ID])
  })

  it("returns ok with zero activity when no events exist", async () => {
    mockQueryResult([])

    const outcome = await readTeams(GROUP_ID)

    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
    expect(outcome.data.totalEvents24h).toBe(0)
    // With no events but workspaces+tokens present, not empty (has teams)
    expect(outcome.data.totalAgents).toBe(4)
  })

  it("returns ok with zero activity when query returns no rows", async () => {
    mockQueryResult(undefined)

    const outcome = await readTeams(GROUP_ID)

    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
    expect(outcome.data.totalEvents24h).toBe(0)
  })

  it("returns null (degraded) when the pool cannot be constructed", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("missing config")
    })

    const outcome = await readTeams(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns null (degraded) when the connection is unreachable", async () => {
    const query = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:5432"))
    getPoolMock.mockReturnValue({ query })

    const outcome = await readTeams(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns a sanitized error on a genuine query failure", async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error('relation "events" does not exist secret=hunter2'))
    getPoolMock.mockReturnValue({ query })

    const outcome = await readTeams(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === true) throw new Error("expected error outcome")
    expect(outcome.error).toBe("Teams query failed")
    expect(outcome.error).not.toContain("hunter2")
  })

  it("merges activity counts into each agent in the roster", async () => {
    mockQueryResult([
      { agent_id: "brooks", event_count: "3" },
      { agent_id: "scout", event_count: "7" },
    ])

    const outcome = await readTeams(GROUP_ID)

    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
    const ramTeam = outcome.data.teams.find((t) => t.id === "ram")
    const scoutAgent = ramTeam?.agents.find((a) => a.persona === "scout")
    expect(scoutAgent?.events24h).toBe(7)
  })

  it("agents with no events get events24h = 0", async () => {
    mockQueryResult([
      { agent_id: "brooks", event_count: "1" },
    ])

    const outcome = await readTeams(GROUP_ID)

    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
    const ramTeam = outcome.data.teams.find((t) => t.id === "ram")
    const pikeAgent = ramTeam?.agents.find((a) => a.persona === "pike")
    expect(pikeAgent?.events24h).toBe(0)
  })

  it("builds team roster from workspaces and mcp_tokens", async () => {
    mockQueryResult([])

    const outcome = await readTeams(GROUP_ID)

    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
    // RAM workspace should have agents from mcp_tokens
    const ramTeam = outcome.data.teams.find((t) => t.id === "ram")
    expect(ramTeam).toBeDefined()
    const personas = ramTeam?.agents.map((a) => a.persona) ?? []
    expect(personas).toContain("brooks")
    expect(personas).toContain("woz")
    expect(personas).toContain("scout")
    expect(personas).toContain("pike")
  })
})

describe("isTeamsEmpty", () => {
  const base: TeamsSnapshot = {
    groupId: GROUP_ID,
    teams: [],
    totalAgents: 0,
    totalEvents24h: 0,
  }

  it("is empty when there is no activity at all", () => {
    expect(isTeamsEmpty(base)).toBe(true)
  })

  it("is not empty when there are teams", () => {
    expect(isTeamsEmpty({ ...base, teams: [{ id: "ram", name: "RAM", description: "test", groupId: GROUP_ID, status: "active", agents: [] }] })).toBe(false)
  })

  it("is still empty when agents exist but have no events", () => {
    expect(isTeamsEmpty({ ...base, totalAgents: 10, totalEvents24h: 0 })).toBe(true)
  })
})

describe("operational-state integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("maps a live snapshot to ready via the contract", async () => {
    mockQueryResult([
      { agent_id: "brooks", event_count: "4" },
      { agent_id: "woz", event_count: "2" },
    ])

    const outcome = await readTeams(GROUP_ID)
    const surface = resolveOperationalSurface({
      source: { id: "teams", systemOfRecord: "manifest+postgres:events" },
      outcome,
      isEmpty: isTeamsEmpty,
      freshnessMs: 30_000,
    })

    expect(surface.status).toBe("ready")
    expect(surface.data?.totalEvents24h).toBe(6)
  })

  it("maps an unreachable source to degraded via the contract", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("no config")
    })

    const outcome = await readTeams(GROUP_ID)
    const surface = resolveOperationalSurface({
      source: { id: "teams", systemOfRecord: "manifest+postgres:events" },
      outcome,
      isEmpty: isTeamsEmpty,
      freshnessMs: 30_000,
    })

    expect(surface.status).toBe("degraded")
    expect(surface.data).toBeNull()
  })

  it("maps an empty snapshot to empty via the contract", async () => {
    mockQueryResults({ workspaces: [], tokens: [], events: [] })

    const outcome = await readTeams(GROUP_ID)
    const surface = resolveOperationalSurface({
      source: { id: "teams", systemOfRecord: "manifest+postgres:events" },
      outcome,
      isEmpty: isTeamsEmpty,
      freshnessMs: 30_000,
    })

    expect(surface.status).toBe("empty")
  })
})