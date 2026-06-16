import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock the postgres connection before importing the module under test
vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(),
}))

vi.mock("@/lib/operational-state/utils/error-classifier", () => ({
  isConnectionError: (err: unknown) => {
    return err instanceof Error && err.message.includes("ECONNREFUSED")
  },
}))

// Mock tenant-roster so tests control the DB-derived agent list
vi.mock("@/lib/agents/tenant-roster", () => ({
  listTenantAgents: vi.fn(),
}))

import { getPool } from "@/lib/postgres/connection"
import { listTenantAgents } from "@/lib/agents/tenant-roster"
import { getExecutionOverview } from "./execution-view"
import {
  TEAM_RAM_AGENTS,
  type AgentStatus,
  type ExecutionOverview,
} from "./execution-view.types"

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_TENANT_AGENTS = TEAM_RAM_AGENTS.map((name) => ({
  id: `tok_${name}`,
  name,
  scopes: "memory:read",
  workspaceId: "ws-default",
  lastUsed: null,
  active: true,
}))

function makePool(overrides: {
  processRunsRows?: unknown[]
  eventsRows?: unknown[]
  shouldThrow?: boolean
}) {
  const { processRunsRows = [], eventsRows = [], shouldThrow = false } = overrides

  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (shouldThrow) throw new Error("ECONNREFUSED")
      if (sql.includes("FROM process_runs")) {
        return Promise.resolve({ rows: processRunsRows })
      }
      if (sql.includes("FROM events")) {
        return Promise.resolve({ rows: eventsRows })
      }
      return Promise.resolve({ rows: [] })
    }),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TEAM_RAM_AGENTS", () => {
  it("contains all 10 agents", () => {
    expect(TEAM_RAM_AGENTS).toHaveLength(10)
    expect(TEAM_RAM_AGENTS).toContain("brooks")
    expect(TEAM_RAM_AGENTS).toContain("woz")
    expect(TEAM_RAM_AGENTS).toContain("scout")
    expect(TEAM_RAM_AGENTS).toContain("jobs")
  })
})

describe("getExecutionOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: return 10-agent roster from DB
    vi.mocked(listTenantAgents).mockResolvedValue(MOCK_TENANT_AGENTS)
  })

  it("returns offline state when getPool throws", async () => {
    vi.mocked(getPool).mockImplementation(() => {
      throw new Error("pool not available")
    })

    const result = await getExecutionOverview("allura-system")

    expect(result.online).toBe(false)
    // DB-derived: empty roster when pool unavailable
    expect(result.agents).toHaveLength(0)
    expect(result.activeRuns).toHaveLength(0)
    expect(result.timeline).toHaveLength(0)
  })

  it("returns online state with agents from DB when queries succeed with no rows", async () => {
    const pool = makePool({})
    vi.mocked(getPool).mockReturnValue(pool as unknown as ReturnType<typeof getPool>)

    const result = await getExecutionOverview("allura-system")

    expect(result.online).toBe(true)
    // All 10 agents from mock tenant roster
    expect(result.agents).toHaveLength(10)
    expect(result.activeRuns).toHaveLength(0)
    expect(result.timeline).toHaveLength(0)
  })

  it("marks agent as active when a matching run exists with their actor_id", async () => {
    const runStarted = new Date(Date.now() - 120_000) // 2 min ago

    const pool = makePool({
      processRunsRows: [
        {
          id: "run-abc123def456",
          definition_id: "def-001",
          definition_name: "Test Process",
          status: "running",
          actor_id: "woz",
          started_at: runStarted,
          state_json: { currentStepIndex: 4 },
        },
      ],
      eventsRows: [],
    })
    vi.mocked(getPool).mockReturnValue(pool as unknown as ReturnType<typeof getPool>)

    const result = await getExecutionOverview("allura-system")

    const woz = result.agents.find((a) => a.agentId === "woz")
    expect(woz).toBeDefined()
    expect(woz!.state).toBe("active")
    expect(woz!.activeRunId).toBe("run-abc123def456")
    expect(woz!.activeRunName).toBe("Test Process")
    expect(woz!.currentStep).toBe(4)
    expect(woz!.elapsedMs).toBeGreaterThan(0)
  })

  it("marks agent as blocked when run status is blocked", async () => {
    const pool = makePool({
      processRunsRows: [
        {
          id: "run-blocked001",
          definition_id: "def-002",
          definition_name: "Blocked Process",
          status: "blocked",
          actor_id: "pike",
          started_at: new Date(Date.now() - 5_000),
          state_json: {},
        },
      ],
      eventsRows: [],
    })
    vi.mocked(getPool).mockReturnValue(pool as unknown as ReturnType<typeof getPool>)

    const result = await getExecutionOverview("allura-system")

    const pike = result.agents.find((a) => a.agentId === "pike")
    expect(pike).toBeDefined()
    expect(pike!.state).toBe("blocked")
  })

  it("marks agents without runs as idle", async () => {
    const pool = makePool({})
    vi.mocked(getPool).mockReturnValue(pool as unknown as ReturnType<typeof getPool>)

    const result = await getExecutionOverview("allura-system")

    const brooks = result.agents.find((a) => a.agentId === "brooks")
    expect(brooks).toBeDefined()
    expect(brooks!.state).toBe("idle")
    expect(brooks!.activeRunId).toBeNull()
  })

  it("marks agent active via recent events even without an active run", async () => {
    const recentEvent = new Date(Date.now() - 60_000) // 1 min ago — within 5 min window

    const pool = makePool({
      processRunsRows: [],
      eventsRows: [
        {
          agent_id: "scout",
          event_type: "memory_search",
          created_at: recentEvent,
        },
      ],
    })
    vi.mocked(getPool).mockReturnValue(pool as unknown as ReturnType<typeof getPool>)

    const result = await getExecutionOverview("allura-system")

    const scout = result.agents.find((a) => a.agentId === "scout")
    expect(scout).toBeDefined()
    expect(scout!.state).toBe("active")
    expect(scout!.lastEventType).toBe("memory_search")
  })

  it("includes activeRuns in the response", async () => {
    const pool = makePool({
      processRunsRows: [
        {
          id: "run-xyz789abc",
          definition_id: "def-003",
          definition_name: "My Process",
          status: "running",
          actor_id: "brooks",
          started_at: new Date(Date.now() - 300_000),
          state_json: {},
        },
      ],
      eventsRows: [],
    })
    vi.mocked(getPool).mockReturnValue(pool as unknown as ReturnType<typeof getPool>)

    const result = await getExecutionOverview("allura-system")

    expect(result.activeRuns).toHaveLength(1)
    expect(result.activeRuns[0].id).toBe("run-xyz789abc")
    expect(result.activeRuns[0].definitionName).toBe("My Process")
    expect(result.activeRuns[0].status).toBe("running")
  })

  it("generates timeline buckets for agents with events", async () => {
    const t = new Date(Date.now() - 10 * 60 * 1000) // 10 min ago

    const pool = makePool({
      processRunsRows: [],
      eventsRows: [
        { agent_id: "woz", event_type: "step_started", created_at: t },
        {
          agent_id: "woz",
          event_type: "step_completed",
          created_at: new Date(t.getTime() + 30_000),
        },
      ],
    })
    vi.mocked(getPool).mockReturnValue(pool as unknown as ReturnType<typeof getPool>)

    const result = await getExecutionOverview("allura-system")

    const wozBuckets = result.timeline.filter((b) => b.agentId === "woz")
    expect(wozBuckets.length).toBeGreaterThan(0)
    const totalEvents = wozBuckets.reduce((sum, b) => sum + b.eventCount, 0)
    expect(totalEvents).toBe(2)
  })

  it("returns a fetchedAt ISO timestamp", async () => {
    const pool = makePool({})
    vi.mocked(getPool).mockReturnValue(pool as unknown as ReturnType<typeof getPool>)

    const before = Date.now()
    const result = await getExecutionOverview("allura-system")
    const after = Date.now()

    const fetchedMs = new Date(result.fetchedAt).getTime()
    expect(fetchedMs).toBeGreaterThanOrEqual(before)
    expect(fetchedMs).toBeLessThanOrEqual(after)
  })

  it("returns online: false when postgres connection is refused", async () => {
    const pool = makePool({ shouldThrow: true })
    vi.mocked(getPool).mockReturnValue(pool as unknown as ReturnType<typeof getPool>)

    const result = await getExecutionOverview("allura-system")

    expect(result.online).toBe(false)
  })

  it("all DB agents are present in the result", async () => {
    const pool = makePool({})
    vi.mocked(getPool).mockReturnValue(pool as unknown as ReturnType<typeof getPool>)

    const result = await getExecutionOverview("allura-system")

    const returnedIds = result.agents.map((a: AgentStatus) => a.agentId).sort()
    const expectedIds = [...TEAM_RAM_AGENTS].sort()
    expect(returnedIds).toEqual(expectedIds)
  })
})

describe("ExecutionOverview shape", () => {
  it("offline result has valid shape", async () => {
    vi.mocked(getPool).mockImplementation(() => {
      throw new Error("no pool")
    })

    const result: ExecutionOverview = await getExecutionOverview("allura-system")

    expect(typeof result.fetchedAt).toBe("string")
    expect(typeof result.online).toBe("boolean")
    expect(Array.isArray(result.agents)).toBe(true)
    expect(Array.isArray(result.timeline)).toBe(true)
    expect(Array.isArray(result.activeRuns)).toBe(true)
  })
})
