import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { approveProposal, getMemoryStats, rejectProposal } from "@/lib/dashboard/api"
import { loadCuratorQueue, loadDashboardOverview, loadMemoryStats } from "@/lib/dashboard/queries"

const fetchMock = vi.fn()
const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: vi.fn().mockResolvedValue(body),
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("dashboard api", () => {
  it("posts tenant provenance on approve without curator identity", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))

    await approveProposal("proposal-1", { groupId: "allura-test" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/curator/approve")
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      proposal_id: "proposal-1",
      group_id: "allura-test",
      decision: "approve",
    })
  })

  it("posts tenant provenance on reject and requires rationale", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))

    await rejectProposal("proposal-2", {
      groupId: "allura-test",
      rationale: "needs more evidence",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/curator/reject")
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      proposal_id: "proposal-2",
      group_id: "allura-test",
      rationale: "needs more evidence",
    })
  })

  it("throws before fetch when reject rationale is blank", async () => {
    await expect(
      rejectProposal("proposal-2", { groupId: "allura-test", rationale: "   " }),
    ).rejects.toThrow(/rationale/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws before fetch when reject rationale is missing", async () => {
    await expect(rejectProposal("proposal-2", { groupId: "allura-test" })).rejects.toThrow(/rationale/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("threads the supplied group into dashboard overview and surfaces real health metrics", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith("/api/memory/count")) return jsonResponse({ count: 12 })
      if (url.startsWith("/api/curator/proposals")) return jsonResponse({ proposals: [] })
      if (url.startsWith("/api/memory/insights")) return jsonResponse({ insights: [] })
      if (url.startsWith("/api/audit/events")) return jsonResponse({ events: [] })
      if (url.startsWith("/api/health?")) return jsonResponse({ status: "healthy", components: [] })
      if (url.startsWith("/api/health/metrics")) {
        expect(url).toContain("group_id=allura-test")
        return jsonResponse({
          timestamp: "2026-05-19T00:00:00.000Z",
          queue: {
            pending_count: 4,
            oldest_age_hours: 3.5,
            approved_24h: 2,
            rejected_24h: 1,
          },
          recall: { search_available: true, last_latency_ms: 42 },
          storage: {
            postgres: { status: "healthy", latency_ms: 8, total_memories: 99 },
            neo4j: { status: "degraded", latency_ms: 17, total_nodes: 18 },
          },
          degraded: {
            neo4j_unavailable: 0,
            scope_error: 0,
            embedding_failures: 0,
            promotion_failures_24h: 3,
          },
          skills: [],
        })
      }
      if (url.startsWith("/api/memory/graph")) return jsonResponse({ total_edges: 7 })

      return jsonResponse({})
    })

    const result = await loadDashboardOverview("allura-test")

    expect(result.data?.healthMetrics?.queue.pending_count).toBe(4)
    expect(result.data?.healthMetrics?.storage.postgres.total_memories).toBe(99)
    expect(result.data?.healthMetrics?.degraded.promotion_failures_24h).toBe(3)

    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.filter((url) => url.includes("group_id=allura-test")).length).toBeGreaterThanOrEqual(5)
  })

  it("loads the curator queue within the supplied tenant scope", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("status=pending")) {
        return jsonResponse({
          proposals: [
            {
              id: "proposal-3",
              content: "Promote queue insight",
              score: 0.91,
              status: "pending",
              tier: "memory",
              reasoning: "Ready for review",
              trace_ref: "trace-3",
              created_at: "2026-05-19T00:00:00.000Z",
              metadata: { agent_id: "curator-test", project: "Allura Core" },
            },
          ],
        })
      }
      if (url.includes("status=approved")) {
        return jsonResponse({ proposals: [] })
      }
      return jsonResponse({})
    })

    const result = await loadCuratorQueue("pending", "allura-test")

    expect(result.data).toHaveLength(1)
    expect(result.data?.[0].id).toBe("proposal-3")

    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.some((url) => url.includes("status=pending") && url.includes("group_id=allura-test"))).toBe(true)
  })

  it("fetches memory stats with tenant scope and 200 OK", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: vi.fn().mockResolvedValue({
        episodic_count: 12,
        semantic_count: 5,
        search_count: 3,
        total_count: 17,
        last_activity: "2026-05-21T06:00:00.000Z",
      }),
    })

    const result = await getMemoryStats("allura-test")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("group_id=allura-test")
    expect(result.data.episodic_count).toBe(12)
    expect(result.data.total_count).toBe(17)
    expect(result.degraded).toBe(false)
    expect(result.warning).toBeNull()
  })

  it("surfaces degraded flag and warning header when Neo4j is unavailable (206)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 206,
      headers: { get: (name: string) => (name === "Warning" ? '299 Allura "neo4j_unavailable"' : null) },
      json: vi.fn().mockResolvedValue({
        episodic_count: 7,
        semantic_count: null,
        search_count: 2,
        total_count: 7,
        last_activity: null,
      }),
    })

    const result = await getMemoryStats("allura-test")

    expect(result.degraded).toBe(true)
    expect(result.warning).toBe('299 Allura "neo4j_unavailable"')
    expect(result.data.semantic_count).toBeNull()
  })

  it("loadMemoryStats threads the supplied group_id and returns correct shape", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: vi.fn().mockResolvedValue({
        episodic_count: 9,
        semantic_count: 4,
        search_count: 1,
        total_count: 13,
        last_activity: "2026-05-20T12:00:00.000Z",
      }),
    })

    const result = await loadMemoryStats("allura-test")

    expect(result.data).toBeDefined()
    expect(result.data?.episodic_count).toBe(9)
    expect(result.data?.last_activity).toBe("2026-05-20T12:00:00.000Z")
    expect(result.error).toBeNull()
    expect(result.degraded).toBe(false)
  })
})
