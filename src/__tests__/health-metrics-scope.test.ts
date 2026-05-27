/**
 * @vitest-environment node
 */
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { queryMock, getPoolMock } = vi.hoisted(() => {
  const queryMock = vi.fn()
  const getPoolMock = vi.fn(() => ({ query: queryMock }))
  return { queryMock, getPoolMock }
})

vi.mock("@/lib/postgres/connection", () => ({
  getPool: getPoolMock,
}))

vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(),
}))

vi.mock("neo4j-driver", () => ({
  driver: () => ({
    session: () => ({
      run: vi.fn().mockResolvedValue({
        records: [{ get: () => ({ toNumber: () => 9 }) }],
      }),
      close: vi.fn(),
    }),
    close: vi.fn(),
  }),
  auth: {
    basic: vi.fn(),
  },
}))

import { GET } from "@/app/api/health/metrics/route"

beforeEach(() => {
  queryMock.mockReset()
  getPoolMock.mockClear()

  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("information_schema.columns")) {
      return {
        rows: [
          { table_name: "canonical_proposals", has_group_id: true },
          { table_name: "events", has_group_id: true },
          { table_name: "allura_memories", has_group_id: true },
        ],
      }
    }

    if (sql.includes("FROM canonical_proposals")) {
      return {
        rows: [
          {
            pending_count: "7",
            oldest_age_hours: "1.25",
            approved_24h: "2",
            rejected_24h: "1",
          },
        ],
      }
    }

    if (sql.includes("FROM allura_memories")) {
      return { rows: [{ total: "11" }] }
    }

    if (sql.includes("neo4j_unavailable")) {
      return {
        rows: [
          {
            neo4j_unavailable: "4",
            scope_error: "3",
            embedding_failures: "2",
            promotion_failures_24h: "1",
          },
        ],
      }
    }

    if (sql.includes("skill_name")) {
      return {
        rows: [
          {
            tool_name: "memory_search",
            calls_24h: "5",
            success_rate: "99",
            last_used: "2026-05-19T00:00:00.000Z",
          },
        ],
      }
    }

    if (sql.includes("SELECT id FROM allura_memories")) {
      return { rows: [{ id: "mem-1" }] }
    }

    return { rows: [{}] }
  })
})

describe("health metrics scope", () => {
  it("scopes queue, degraded, and memory counts by group_id when supplied", async () => {
    const response = await GET(new NextRequest("http://localhost:4748/api/health/metrics?group_id=allura-test"))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.queue.pending_count).toBe(7)
    expect(body.storage.postgres.total_memories).toBe(11)
    expect(body.storage.neo4j.total_nodes).toBeNull()
    expect(body.storage.neo4j.status).toBe("degraded")
    expect(body.degraded.promotion_failures_24h).toBe(1)
    expect(body.skills).toHaveLength(1)

    const queries = queryMock.mock.calls.map(([text]) => String(text))
    expect(queries.some((sql) => sql.includes("FROM canonical_proposals") && sql.includes("group_id = $1"))).toBe(true)
    expect(queries.some((sql) => sql.includes("FROM events") && sql.includes("group_id = $1"))).toBe(true)
    expect(queries.some((sql) => sql.includes("FROM allura_memories") && sql.includes("WHERE group_id = $1"))).toBe(true)
    expect(queries.some((sql) => sql.includes("skill_name") && sql.includes("group_id = $1"))).toBe(true)

    const skillQuery = queryMock.mock.calls.find(([text]) => String(text).includes("skill_name"))
    expect(skillQuery?.[1]).toEqual(["allura-test"])
  })

  it("rejects invalid group_id values before querying storage", async () => {
    const response = await GET(new NextRequest("http://localhost:4748/api/health/metrics?group_id=bad-group"))
    expect(response.status).toBe(400)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it("fails closed when tenant scoping cannot be determined", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("information_schema.columns")) {
        throw new Error("scoping unavailable")
      }
      throw new Error(`unexpected query after scoping failure: ${sql}`)
    })

    const response = await GET(new NextRequest("http://localhost:4748/api/health/metrics?group_id=allura-test"))
    expect(response.status).toBe(503)
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("information_schema.columns")
  })
})
