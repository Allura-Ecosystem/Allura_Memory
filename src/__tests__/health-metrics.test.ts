/**
 * @vitest-environment node
 */
import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

// Mock the data layer so these *structure-only* assertions don't depend on live
// DB latency. Under full-suite parallel load the real route opens ~5 sequential
// PostgreSQL queries against one local DB, and contention
// pushed the first call past the 10s timeout (flake). The fake pool returns a
// single shaped row that satisfies every query the route reads, so the SUCCESS
// path is still exercised — assertions are unchanged, only latency is removed.
vi.mock("@/lib/postgres/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/postgres/connection")>()
  const row = {
    pending_count: "0",
    oldest_age_hours: "0",
    approved_24h: "0",
    rejected_24h: "0",
    total: "0",
    scope_error: "0",
    embedding_failures: "0",
    promotion_failures_24h: "0",
    tool_name: "memory_search",
    calls_24h: 1,
    success_rate: "100",
    last_used: new Date().toISOString(),
    id: 1,
  }
  return {
    ...actual,
    getPool: () => ({ query: async () => ({ rows: [row] }) }),
  }
})

import { GET } from "@/app/api/health/metrics/route"

describe("Health Metrics Endpoint", () => {
  describe("Response structure", () => {
    it("returns a well-formed MetricsResponse object", async () => {
      const response = await GET(new NextRequest("http://localhost:4748/api/health/metrics"))
      const body = await response.json()

      // Must have top-level keys
      expect(body).toHaveProperty("timestamp")
      expect(body).toHaveProperty("queue")
      expect(body).toHaveProperty("recall")
      expect(body).toHaveProperty("storage")
      expect(body).toHaveProperty("degraded")
    })

    it("returns queue metrics with correct structure", async () => {
      const response = await GET(new NextRequest("http://localhost:4748/api/health/metrics"))
      const body = await response.json()

      expect(body.queue).toHaveProperty("pending_count")
      expect(body.queue).toHaveProperty("oldest_age_hours")
      expect(body.queue).toHaveProperty("approved_24h")
      expect(body.queue).toHaveProperty("rejected_24h")

      expect(typeof body.queue.pending_count).toBe("number")
      expect(typeof body.queue.oldest_age_hours).toBe("number")
    })

    it("returns recall metrics", async () => {
      const response = await GET(new NextRequest("http://localhost:4748/api/health/metrics"))
      const body = await response.json()

      expect(body.recall).toHaveProperty("search_available")
      expect(typeof body.recall.search_available).toBe("boolean")
    })

    it("returns storage metrics for postgres", async () => {
      const response = await GET(new NextRequest("http://localhost:4748/api/health/metrics"))
      const body = await response.json()

      expect(body.storage.postgres).toHaveProperty("status")
      expect(body.storage.postgres).toHaveProperty("latency_ms")
      expect(body.storage.postgres).toHaveProperty("total_memories")

      expect(body.storage).not.toHaveProperty("neo4j")
    })

    it("returns degraded counters", async () => {
      const response = await GET(new NextRequest("http://localhost:4748/api/health/metrics"))
      const body = await response.json()

      expect(body.degraded).not.toHaveProperty("neo4j_unavailable")
      expect(body.degraded).toHaveProperty("scope_error")
      expect(body.degraded).toHaveProperty("embedding_failures")
      expect(body.degraded).toHaveProperty("promotion_failures_24h")
    })
  })
})