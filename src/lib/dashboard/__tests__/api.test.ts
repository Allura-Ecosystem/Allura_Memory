import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { approveProposal, getMemoryStats, rejectProposal } from "@/lib/dashboard/api"
import { loadHonestDashboardPanels } from "@/lib/dashboard/honest-panels"
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
  it("posts tenant provenance and human rationale on approve without curator identity", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))

    await approveProposal("proposal-1", { groupId: "allura-test", rationale: "Approved from dashboard" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/curator/approve")
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      proposal_id: "proposal-1",
      group_id: "allura-test",
      decision: "approve",
      rationale: "Approved from dashboard",
    })
  })

  it("throws before fetch when approve rationale is missing", async () => {
    await expect(approveProposal("proposal-1", { groupId: "allura-test" })).rejects.toThrow(/rationale/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("posts tenant provenance on reject through the governed decision door", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))

    await rejectProposal("proposal-2", {
      groupId: "allura-test",
      rationale: "needs more evidence",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/curator/approve")
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      proposal_id: "proposal-2",
      group_id: "allura-test",
      decision: "reject",
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

  it("surfaces pending curator queue failures instead of returning an empty success state", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("status=pending")) {
        throw new Error("pending queue offline")
      }
      if (url.includes("status=approved")) {
        return jsonResponse({ proposals: [] })
      }
      return jsonResponse({})
    })

    const result = await loadCuratorQueue("pending", "allura-test")

    expect(result.data).toEqual([])
    expect(result.error).toBe("pending queue offline")
    expect(result.degraded).toBe(true)
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

  it("renders honest failed/empty/degraded panel states without fabricating healthy counts", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/health/metrics")) {
        expect(url).toContain("group_id=allura-test")
        throw new Error("health metrics offline")
      }
      if (url.startsWith("/api/audit/events") && url.includes("policy_check")) {
        expect(url).toContain("group_id=allura-test")
        return jsonResponse({ events: [] })
      }
      if (url.startsWith("/api/audit/events") && url.includes("policy_violation")) {
        expect(url).toContain("group_id=allura-test")
        return jsonResponse({ events: [] })
      }
      if (url.startsWith("/api/curator/proposals") && url.includes("status=pending")) {
        expect(url).toContain("group_id=allura-test")
        return jsonResponse({ proposals: [] })
      }
      if (url.startsWith("/api/curator/proposals") && url.includes("status=approved")) {
        expect(url).toContain("group_id=allura-test")
        return jsonResponse({ proposals: [] })
      }
      return jsonResponse({})
    })

    const result = await loadHonestDashboardPanels("allura-test")

    expect(result.data?.find((panel) => panel.id === "system-truth")?.state).toBe("failed")
    expect(result.data?.find((panel) => panel.id === "hygiene-actions")?.state).toBe("empty")
    expect(result.data?.find((panel) => panel.id === "approvals")?.state).toBe("empty")
    expect(result.data?.every((panel) => panel.usesSampleData === false)).toBe(true)
    expect(JSON.stringify(result.data)).not.toMatch(/All enforced|Clear|0\/0 active/i)
  })

  it("marks partial dashboard panel data degraded and keeps every read scoped", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/health/metrics")) {
        expect(url).toContain("group_id=allura-test")
        return {
          ok: true,
          status: 206,
          headers: { get: (name: string) => (name === "Warning" ? '299 Allura "neo4j_unavailable"' : null) },
          json: vi.fn().mockResolvedValue({
            timestamp: "2026-05-19T00:00:00.000Z",
            queue: { pending_count: 2, oldest_age_hours: 4, approved_24h: 1, rejected_24h: 0 },
            recall: { search_available: false, last_latency_ms: null },
            storage: {
              postgres: { status: "healthy", latency_ms: 8, total_memories: 12 },
              neo4j: { status: "degraded", latency_ms: null, total_nodes: null },
            },
            degraded: { neo4j_unavailable: 1, scope_error: 0, embedding_failures: 0, promotion_failures_24h: 0 },
            skills: [],
          }),
        }
      }
      if (url.startsWith("/api/audit/events") && url.includes("policy_check")) {
        expect(url).toContain("group_id=allura-test")
        return jsonResponse({ events: [] })
      }
      if (url.startsWith("/api/audit/events") && url.includes("policy_violation")) {
        expect(url).toContain("group_id=allura-test")
        return jsonResponse({
          events: [
            {
              id: "evt-1",
              event_type: "policy_violation",
              agent_id: "woz-builder",
              status: "blocked",
              created_at: "2026-05-19T00:00:00.000Z",
              metadata: { rule: "scope" },
            },
          ],
        })
      }
      if (url.startsWith("/api/curator/proposals") && url.includes("status=pending")) {
        expect(url).toContain("group_id=allura-test")
        return jsonResponse({
          proposals: [
            {
              id: "proposal-1",
              content: "Needs review",
              score: 0.9,
              status: "pending",
              created_at: "2026-05-19T00:00:00.000Z",
              metadata: {},
            },
          ],
        })
      }
      if (url.startsWith("/api/curator/proposals") && url.includes("status=approved")) {
        expect(url).toContain("group_id=allura-test")
        return jsonResponse({ proposals: [] })
      }
      return jsonResponse({})
    })

    const result = await loadHonestDashboardPanels("allura-test")

    expect(result.error).toBeNull()
    expect(result.degraded).toBe(true)
    expect(result.data?.find((panel) => panel.id === "system-truth")?.state).toBe("degraded")
    expect(result.data?.find((panel) => panel.id === "hygiene-actions")?.state).toBe("degraded")
    expect(result.data?.find((panel) => panel.id === "approvals")?.state).toBe("degraded")
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("group_id=allura-test"))).toBe(true)
  })

  it("uses the default allura-system scope for honest panels when no group is supplied", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toContain("group_id=allura-system")
      if (url.startsWith("/api/health/metrics")) {
        return jsonResponse({
          timestamp: "2026-05-19T00:00:00.000Z",
          queue: { pending_count: 0, oldest_age_hours: 0, approved_24h: 0, rejected_24h: 0 },
          recall: { search_available: true, last_latency_ms: 12 },
          storage: {
            postgres: { status: "ready", latency_ms: 3, total_memories: 1 },
            neo4j: { status: "ready", latency_ms: 4, total_nodes: 2 },
          },
          degraded: { neo4j_unavailable: 0, scope_error: 0, embedding_failures: 0, promotion_failures_24h: 0 },
          skills: [],
        })
      }
      if (url.startsWith("/api/audit/events")) return jsonResponse({ events: [] })
      if (url.startsWith("/api/curator/proposals")) return jsonResponse({ proposals: [] })
      return jsonResponse({})
    })

    const result = await loadHonestDashboardPanels()

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(3)
    expect(result.data?.find((panel) => panel.id === "system-truth")?.state).toBe("ready")
  })

  it("describes warning-only degraded health without claiming zero degraded signals", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith("/api/health/metrics")) {
        return {
          ok: true,
          status: 206,
          headers: { get: (name: string) => (name === "Warning" ? '299 Allura "partial_health"' : null) },
          json: vi.fn().mockResolvedValue({
            timestamp: "2026-05-19T00:00:00.000Z",
            queue: { pending_count: 0, oldest_age_hours: 0, approved_24h: 0, rejected_24h: 0 },
            recall: { search_available: true, last_latency_ms: 12 },
            storage: {
              postgres: { status: "ready", latency_ms: 3, total_memories: 1 },
              neo4j: { status: "ready", latency_ms: 4, total_nodes: 2 },
            },
            degraded: { neo4j_unavailable: 0, scope_error: 0, embedding_failures: 0, promotion_failures_24h: 0 },
            skills: [],
          }),
        }
      }
      if (url.startsWith("/api/audit/events")) return jsonResponse({ events: [] })
      if (url.startsWith("/api/curator/proposals")) return jsonResponse({ proposals: [] })
      return jsonResponse({})
    })

    const result = await loadHonestDashboardPanels("allura-test")
    const systemPanel = result.data?.find((panel) => panel.id === "system-truth")

    expect(systemPanel?.state).toBe("degraded")
    expect(systemPanel?.summary).not.toContain("0 degraded")
  })
})
