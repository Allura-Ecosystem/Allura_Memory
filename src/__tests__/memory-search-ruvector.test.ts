/**
 * RuVector Primary Backend Tests for memory_search (Slice B)
 *
 * Tests the existing RuVector path and AD-70 explicit all-mode selection:
 * - Each authorized store gets a bounded candidate budget under status all
 * - RuVector is always called first (no feature flag check)
 * - Fail-closed: if RuVector fails, falls back to Neo4j, then PG
 * - Evidence-gated feedback: trajectoryId surfaced in metadata
 * - Stores are attempted in order, with successful candidate sources in stores_used
 *
 * Architecture change (Slice B): RuVector moved from "conditional enrichment"
 * to "primary backend" for episodic retrieval.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock the RuVector retrieval adapter (now primary, not conditional)
const mockSearchWithFeedback = vi.fn();

vi.mock("@/lib/ruvector/retrieval-adapter", () => ({
  // Slice B: RuVector is primary — always call searchWithFeedback
  shouldUseRuVector: vi.fn().mockResolvedValue(true),
  searchWithFeedback: (...args: unknown[]) => mockSearchWithFeedback(...args),
}));

// Mock database connections — PG query mock for fallback path (Step 3: PostgreSQL traces)
const mockPgQuery = vi.fn();
const mockPgPool = {
  query: mockPgQuery,
  end: vi.fn(),
  on: vi.fn(),
  // Tenant-scoped queries run inside withTenantTransaction, which needs a
  // pooled client (BEGIN/SET LOCAL/query/COMMIT + release).
  connect: vi.fn(async () => ({
    query: mockPgQuery,
    release: vi.fn(),
  })),
};

// Mock graph adapter for Neo4j fallback path (Step 2: semantic search via graph adapter)
const mockGraphSearchMemories = vi.fn();

vi.mock("@/lib/graph-adapter", () => ({
  createGraphAdapter: vi.fn().mockImplementation(() => ({
    searchMemories: mockGraphSearchMemories,
  })),
}));

// Mock getConnections — memory_search calls this for Neo4j/PG fallback steps
vi.mock("@/mcp/canonical-tools/connection", () => ({
  getConnections: vi.fn().mockImplementation(async () => ({
    pg: mockPgPool,
    neo4j: {},
  })),
  resetConnections: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: vi.fn().mockImplementation(() => mockPgPool),
}));

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn().mockReturnValue({ close: vi.fn() }),
    int: (val: number) => ({ toNumber: () => val }),
    auth: { basic: vi.fn() },
  },
  Driver: vi.fn(),
}));

// Mock RuVector bridge (storeMemory used by memory_add, not memory_search — but imported by canonical-tools)
vi.mock("@/lib/ruvector/bridge", () => ({
  storeMemory: vi.fn().mockResolvedValue({ id: "1", status: "stored", createdAt: new Date().toISOString(), groupId: "allura-test" }),
}));

vi.mock("dotenv", () => ({ config: vi.fn() }));

vi.mock("@/lib/curator/score", () => ({
  curatorScore: vi.fn().mockResolvedValue(0.5),
}));

vi.mock("@/lib/validation/group-id", () => ({
  validateGroupId: vi.fn((id: string) => {
    if (!id.startsWith("allura-")) {
      throw new Error("Invalid group_id: must match ^allura-[a-z0-9-]+$");
    }
    return id;
  }),
}));

vi.mock("@/lib/dedup/proposal-dedup", () => ({
  createProposalDedupChecker: vi.fn(),
  getDedupThreshold: vi.fn().mockReturnValue(0.95),
}));

vi.mock("@/lib/budget/enforcer", () => ({
  BudgetEnforcer: vi.fn(),
}));

vi.mock("@/lib/budget/middleware-integration", () => ({
  checkBudgetBeforeCall: vi.fn().mockReturnValue({ allowed: true }),
  updateBudgetAfterCall: vi.fn(),
  createSessionId: vi.fn().mockReturnValue("mock-session-id"),
}));

vi.mock("@/lib/circuit-breaker/manager", () => ({
  BreakerManager: vi.fn(),
}));

// Mock budget-circuit sub-module (fail-open: all budget checks pass, circuit breakers execute directly)
vi.mock("@/mcp/canonical-tools/budget-circuit", () => ({
  getBudgetEnforcer: vi.fn().mockReturnValue(null),
  getBreakerManager: vi.fn().mockReturnValue(null),
  ensureSession: vi.fn().mockReturnValue("mock-session"),
  checkBudget: vi.fn().mockResolvedValue({ allowed: true }),
  recordToolCall: vi.fn(),
  withCircuitBreaker: vi.fn().mockImplementation(
    (_type: string, _group: string, _op: string, fn: () => unknown) => fn()
  ),
}));

vi.mock("@/lib/errors/database-errors", () => ({
  DatabaseUnavailableError: class extends Error {
    operation: string;
    constructor(op: string, cause: Error) {
      super(`Database unavailable for operation: ${op}`);
      this.name = "DatabaseUnavailableError";
      this.operation = op;
    }
  },
  DatabaseQueryError: class extends Error {
    operation: string;
    query: string;
    constructor(op: string, q: string, cause: Error) {
      super(`Database query failed for operation: ${op}`);
      this.name = "DatabaseQueryError";
      this.operation = op;
      this.query = q;
    }
  },
  classifyPostgresError: vi.fn((err: Error, op: string, q: string) => err),
}));

import type { MemorySearchRequest } from "../lib/memory/canonical-contracts";
import { memory_search } from "../mcp/canonical-tools";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const VALID_GROUP_ID = "allura-test-group";

function makeSearchRequest(overrides?: Partial<MemorySearchRequest>): MemorySearchRequest {
  return {
    query: "test query",
    group_id: VALID_GROUP_ID as any,
    scope: {
      group_id: VALID_GROUP_ID as any,
      workspace_id: "workspace-test",
      agent_id: "integration-test-agent",
    },
    status: "all" as any, // Bypass approved-only path to exercise RuVector primary backend
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("memory_search RuVector PRIMARY backend (Slice B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: RuVector returns results (primary backend)
    mockSearchWithFeedback.mockResolvedValue({
      memories: [
        {
          id: "rv-mem-1",
          content: "RuVector semantic memory about TypeScript",
          memoryType: "episodic",
          score: 0.85,
        },
        {
          id: "rv-mem-2",
          content: "RuVector memory about dark mode preference",
          memoryType: "episodic",
          score: 0.72,
        },
      ],
      total: 2,
      latencyMs: 15,
      trajectoryId: "traj-abc-123",
      bridgeSource: "ruvector",
      shouldLogFeedback: true,
    });

    // Default: Graph adapter fallback returns results (Neo4j semantic search)
    mockGraphSearchMemories.mockResolvedValue([
      {
        id: "neo4j-mem-1",
        content: "Semantic knowledge about dark mode",
        score: 0.9,
        provenance: "conversation",
        created_at: new Date().toISOString(),
        usage_count: 5,
        relevance: 0.9,
        tags: [],
      },
    ]);

    // Default: PG fallback returns results
    mockPgQuery.mockResolvedValue({
      rows: [
        {
          id: "pg-mem-1",
          content: "User prefers dark mode",
          provenance: "conversation",
          created_at: new Date().toISOString(),
        },
      ],
    });
  });

  afterEach(() => {
    // Use clearAllMocks, not restoreAllMocks — restoreAllMocks resets
    // vi.fn().mockImplementation() inside vi.mock factories, breaking
    // module-level mocks (getConnections, createGraphAdapter) between tests.
    vi.clearAllMocks();
  });

  describe("AD-70 bounded fresh-evidence candidate selection", () => {
    const event = (id: string, content: string) => ({
      id, content, provenance: "manual", created_at: "2026-10-20T22:00:00Z", tags: "durable",
    });
    const graph = (id: string, content: string, score = 0.85) => ({
      id, content, score, provenance: "conversation", created_at: "2026-10-19T00:00:00Z",
      usage_count: 2, relevance: score, tags: [],
    });
    const vector = (id: string, content: string, score = 0.9) => ({ id, content, memoryType: "episodic", score });
    const setVector = (memories: ReturnType<typeof vector>[]) => {
      mockSearchWithFeedback.mockResolvedValue({ memories, trajectoryId: "ad70-trajectory" });
    };
    const eventQueries = () => mockPgQuery.mock.calls.filter(([sql]) => typeof sql === "string" && sql.includes("FROM events"));

    it.each([0, -1, 0.5, 100.1, 101, NaN, Infinity, -Infinity, "2", null, true, {}])(
      "rejects an invalid explicit all-mode limit %s before any store call",
      async (rawLimit) => {
        await expect(memory_search(makeSearchRequest({ limit: rawLimit as number })))
          .rejects.toThrow("limit must be a finite number between 1 and 100");
        expect(mockSearchWithFeedback).not.toHaveBeenCalled();
        expect(mockGraphSearchMemories).not.toHaveBeenCalled();
        expect(mockPgQuery).not.toHaveBeenCalled();
      },
    );

    it.each([[undefined, 10], [1, 1], [100, 100], [2.9, 2]] as const)(
      "bounds every source and final output for supplied limit %s",
      async (requestedLimit, expectedLimit) => {
        setVector(Array.from({ length: expectedLimit + 1 }, (_, i) => vector(`rv-${i}`, `vector record ${i}`)));
        mockGraphSearchMemories.mockResolvedValue(Array.from({ length: expectedLimit + 1 }, (_, i) => graph(`g-${i}`, `graph record ${i}`)));
        mockPgQuery.mockResolvedValue({ rows: Array.from({ length: expectedLimit + 1 }, (_, i) => event(`p-${i}`, `event record ${i}`)) });
        const response = await memory_search(makeSearchRequest({ limit: requestedLimit }));
        expect(mockSearchWithFeedback).toHaveBeenCalledWith(VALID_GROUP_ID, "test query", expect.objectContaining({ limit: expectedLimit }));
        expect(mockGraphSearchMemories).toHaveBeenCalledWith(expect.objectContaining({ limit: expectedLimit }));
        expect(eventQueries()[0][1]).toEqual([VALID_GROUP_ID, null, "test query", expectedLimit]);
        expect(response.count).toBe(expectedLimit);
        expect(response.results).toHaveLength(expectedLimit);
      },
    );

    it.each([undefined, "approved"] as const)("preserves existing %s approved-only limit handling", async (status) => {
      await memory_search(makeSearchRequest({ status, limit: 101 }));
      expect(mockGraphSearchMemories).toHaveBeenCalledWith(expect.objectContaining({ limit: 101 }));
      expect(mockSearchWithFeedback).not.toHaveBeenCalled();
      expect(mockPgQuery).not.toHaveBeenCalled();
    });

    it.each(["proposed", "deprecated"] as const)("does not add the all-mode input guard to internal status %s", async (status) => {
      await memory_search(makeSearchRequest({ status, limit: 101 }));
      expect(mockSearchWithFeedback).toHaveBeenCalledWith(VALID_GROUP_ID, "test query", expect.objectContaining({ limit: 101 }));
    });

    it("considers a fresh exact event when unrelated graph candidates fill the limit", async () => {
      setVector([]);
      mockGraphSearchMemories.mockResolvedValue([graph("old-1", "Historical unrelated work"), graph("old-2", "Another historical record")]);
      mockPgQuery.mockResolvedValue({ rows: [event("fresh", "PostgreSQL marker")] });
      const response = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 2 }));
      expect(eventQueries()).toHaveLength(1);
      expect(response.results[0]).toMatchObject({ id: "fresh", score: 0.5, source: "episodic", provenance: "manual" });
      expect(response.results).toHaveLength(2);
      expect(response.meta).toMatchObject({ degraded: false, stores_attempted: ["ruvector", "graph", "postgres"] });
    });

    it("queries both authorized later stores even when RuVector fills the limit", async () => {
      setVector([vector("rv-1", "Unrelated one"), vector("rv-2", "Unrelated two")]);
      mockGraphSearchMemories.mockResolvedValue([]);
      mockPgQuery.mockResolvedValue({ rows: [event("fresh", "PostgreSQL marker")] });
      const response = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 2 }));
      expect(mockGraphSearchMemories).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }));
      expect(eventQueries()).toHaveLength(1);
      expect(response.results[0].id).toBe("fresh");
    });

    it("selects trimmed case-insensitive equality, then literal containment, without inflating scores", async () => {
      setVector([vector("unrelated", "High-confidence unrelated record", 0.99)]);
      mockGraphSearchMemories.mockResolvedValue([graph("literal", "A PostgreSQL marker appears here", 0.95)]);
      mockPgQuery.mockResolvedValue({ rows: [event("exact", "PostgreSQL marker")] });
      const response = await memory_search(makeSearchRequest({ query: "  POSTGRESQL MARKER  ", limit: 2 }));
      expect(response.results.map(({ id, score }) => ({ id, score }))).toEqual([{ id: "exact", score: 0.5 }, { id: "literal", score: 0.95 }]);
    });

    it("applies an explicit confidence minimum before choosing a duplicate representation", async () => {
      setVector([vector("same", "PostgreSQL marker", 0.8)]);
      mockGraphSearchMemories.mockResolvedValue([]);
      mockPgQuery.mockResolvedValue({ rows: [event("same", "PostgreSQL marker")] });
      const response = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 1, min_score: 0.6 }));
      expect(eventQueries()).toHaveLength(1);
      expect(response.results).toHaveLength(1);
      expect(response.results[0]).toMatchObject({ id: "same", score: 0.8, provenance: "conversation" });
    });

    it("does not let an exact event bypass an explicit confidence filter", async () => {
      setVector([]);
      mockGraphSearchMemories.mockResolvedValue([graph("old", "Unrelated history")]);
      mockPgQuery.mockResolvedValue({ rows: [event("fresh", "PostgreSQL marker")] });
      const response = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 2, min_score: 0.6 }));
      expect(response.results.map(({ id }) => id)).toEqual(["old"]);
    });

    it("retains a matching representation of a duplicated ID", async () => {
      setVector([vector("same", "Unrelated vector projection", 0.99)]);
      mockGraphSearchMemories.mockResolvedValue([]);
      mockPgQuery.mockResolvedValue({ rows: [event("same", "PostgreSQL marker")] });
      const response = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 1 }));
      expect(response.results).toHaveLength(1);
      expect(response.results[0]).toMatchObject({ id: "same", content: "PostgreSQL marker", score: 0.5 });
    });

    it("enriches identical event and vector content without discarding the retrieval score", async () => {
      setVector([vector("same", "PostgreSQL marker", 0.99)]);
      mockGraphSearchMemories.mockResolvedValue([]);
      mockPgQuery.mockResolvedValue({ rows: [event("same", "PostgreSQL marker")] });
      const response = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 1 }));
      expect(response.results[0]).toMatchObject({ id: "same", score: 0.99, provenance: "manual", created_at: "2026-10-20T22:00:00Z", tags: ["durable"] });
    });

    it("preserves nonliteral retrieval ordering when a duplicate supplies durable metadata", async () => {
      const content = "TypeScript supports strict compiler checks";
      setVector([vector("relevant", content, 0.95), vector("other", "A dark interface preference", 0.9)]);
      mockGraphSearchMemories.mockResolvedValue([]);
      mockPgQuery.mockResolvedValue({ rows: [event("relevant", content)] });
      const response = await memory_search(makeSearchRequest({ query: "Which compiler options are needed?", limit: 2 }));
      expect(response.results.map(({ id, score }) => ({ id, score })))
        .toEqual([{ id: "relevant", score: 0.95 }, { id: "other", score: 0.9 }]);
      expect(response.results[0]).toMatchObject({ provenance: "manual", created_at: "2026-10-20T22:00:00Z", tags: ["durable"] });
    });

    it("retains the newest durable metadata when older identical raw duplicates follow", async () => {
      setVector([vector("same", "PostgreSQL marker", 0.99)]);
      mockGraphSearchMemories.mockResolvedValue([]);
      mockPgQuery.mockResolvedValue({ rows: [
        { ...event("same", "PostgreSQL marker"), tags: "newest" },
        { ...event("same", "PostgreSQL marker"), provenance: "conversation", created_at: "2026-10-19T00:00:00Z", tags: "older" },
      ] });
      const response = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 2 }));
      expect(response.results).toHaveLength(1);
      expect(response.results[0]).toMatchObject({ id: "same", score: 0.99, provenance: "manual", created_at: "2026-10-20T22:00:00Z", tags: ["newest"] });
    });

    it("never lends an indexed result's score to a raw-only ID or bypasses its confidence filter", async () => {
      setVector([vector("indexed", "PostgreSQL marker", 0.99)]);
      mockGraphSearchMemories.mockResolvedValue([]);
      mockPgQuery.mockResolvedValue({ rows: [event("raw-only", "PostgreSQL marker")] });
      const response = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 2 }));
      expect(response.results.map(({ id, score }) => ({ id, score })))
        .toEqual([{ id: "indexed", score: 0.99 }, { id: "raw-only", score: 0.5 }]);
      const filtered = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 2, min_score: 0.6 }));
      expect(filtered.results.map(({ id, score }) => ({ id, score }))).toEqual([{ id: "indexed", score: 0.99 }]);
    });

    it("does not give an empty query literal-match priority", async () => {
      setVector([vector("highest", "Unrelated content", 0.9)]);
      mockGraphSearchMemories.mockResolvedValue([graph("next", "Other content", 0.8)]);
      mockPgQuery.mockResolvedValue({ rows: [event("empty", "")] });
      const response = await memory_search(makeSearchRequest({ query: "  ", limit: 2 }));
      expect(eventQueries()).toHaveLength(1);
      expect(response.results.map(({ id }) => id)).toEqual(["highest", "next"]);
    });

    it("uses the normalized per-store budget and verified workspace without expanding output", async () => {
      setVector([vector("rv1", "first", 0.9), vector("rv2", "second", 0.8), vector("rv-over-budget", "PostgreSQL marker", 1)]);
      mockGraphSearchMemories.mockResolvedValue([graph("g1", "third", 0.7), graph("g2", "fourth", 0.6), graph("g-over-budget", "PostgreSQL marker", 1)]);
      mockPgQuery.mockResolvedValue({ rows: [event("p1", "fifth"), event("p2", "sixth"), event("p-over-budget", "PostgreSQL marker")] });
      const response = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 2.9 }));
      expect(mockSearchWithFeedback).toHaveBeenCalledWith(VALID_GROUP_ID, "PostgreSQL marker", expect.objectContaining({ limit: 2 }));
      expect(mockGraphSearchMemories).toHaveBeenCalledWith(expect.objectContaining({ group_id: VALID_GROUP_ID, workspace_id: "workspace-test", principal_id: "integration-test-agent", limit: 2 }));
      expect(eventQueries()[0][1]).toEqual([VALID_GROUP_ID, null, "PostgreSQL marker", 2]);
      expect(mockPgQuery).toHaveBeenCalledWith("SET LOCAL app.current_workspace_id = 'workspace-test'");
      expect(response.results.map(({ id }) => id)).toEqual(["rv1", "rv2"]);
      expect(response.results).toHaveLength(2);
    });

    it.each([undefined, "approved"] as const)("keeps %s approved-only search separate from episodic evidence", async (status) => {
      const response = await memory_search(makeSearchRequest({ status }));
      expect(response.results.every(({ source }) => source === "semantic")).toBe(true);
      expect(mockSearchWithFeedback).not.toHaveBeenCalled();
      expect(mockPgQuery).not.toHaveBeenCalled();
      expect(response.meta?.stores_attempted).toEqual(["graph"]);
    });

    it("rejects missing verified workspace scope before any candidate search", async () => {
      await expect(memory_search(makeSearchRequest({ scope: undefined }))).rejects.toThrow("verified MCP workspace scope is required");
      expect(mockSearchWithFeedback).not.toHaveBeenCalled();
      expect(mockGraphSearchMemories).not.toHaveBeenCalled();
      expect(mockPgQuery).not.toHaveBeenCalled();
    });

    it("preserves partial-store warnings even when RuVector fills the limit", async () => {
      setVector([vector("rv", "PostgreSQL marker")]);
      mockGraphSearchMemories.mockRejectedValue(new Error("graph unavailable"));
      mockPgQuery.mockRejectedValue(new Error("postgres unavailable"));
      const response = await memory_search(makeSearchRequest({ query: "PostgreSQL marker", limit: 1 }));
      expect(response.results.map(({ id }) => id)).toEqual(["rv"]);
      expect(response.meta?.warnings).toEqual(expect.arrayContaining(["graph_unavailable", "postgres_unavailable"]));
      expect(response.meta?.stores_used).toEqual(["ruvector"]);
      expect(response.meta?.degraded).toBe(true);
      expect(response.meta?.stores_attempted).toEqual(["ruvector", "graph", "postgres"]);
    });

    it("treats punctuation as literal content rather than a match pattern", async () => {
      setVector([vector("pattern-only", "aXb", 0.99)]);
      mockGraphSearchMemories.mockResolvedValue([graph("literal", "prefix a.b suffix", 0.7)]);
      mockPgQuery.mockResolvedValue({ rows: [] });
      const response = await memory_search(makeSearchRequest({ query: "a.b", limit: 1 }));
      expect(response.results[0]).toMatchObject({ id: "literal", score: 0.7 });
    });

    it("keeps every store failure visible when no candidate source succeeds", async () => {
      mockSearchWithFeedback.mockRejectedValue(new Error("vector unavailable"));
      mockGraphSearchMemories.mockRejectedValue(new Error("graph unavailable"));
      mockPgQuery.mockRejectedValue(new Error("postgres unavailable"));
      const response = await memory_search(makeSearchRequest({ limit: 1 }));
      expect(response.results).toEqual([]);
      expect(response.count).toBe(0);
      expect(response.meta?.stores_used).toEqual([]);
      expect(response.meta?.degraded).toBe(true);
      expect(response.meta?.stores_attempted).toEqual(["ruvector", "graph", "postgres"]);
      expect(response.meta?.warnings).toEqual(expect.arrayContaining([expect.stringContaining("ruvector_unavailable"), "graph_unavailable", "postgres_unavailable"]));
    });

    it("preserves approved-only degradation without falling through to raw evidence", async () => {
      mockGraphSearchMemories.mockRejectedValue(new Error("graph unavailable"));
      const response = await memory_search(makeSearchRequest({ status: "approved" }));
      expect(response.results).toEqual([]);
      expect(response.meta).toMatchObject({ degraded: true, degraded_reason: "graph_unavailable", stores_attempted: ["graph"] });
      expect(mockSearchWithFeedback).not.toHaveBeenCalled();
      expect(mockPgQuery).not.toHaveBeenCalled();
    });
  });

  describe("RuVector as PRIMARY (default)", () => {
    it("should ALWAYS call searchWithFeedback (no feature flag check)", async () => {
      await memory_search(makeSearchRequest());

      // Slice B: RuVector is primary — always called
      expect(mockSearchWithFeedback).toHaveBeenCalled();
    });

    it("should call searchWithFeedback with validated group_id and query", async () => {
      const request = makeSearchRequest({ query: "dark mode preferences" });
      await memory_search(request);

      expect(mockSearchWithFeedback).toHaveBeenCalledWith(
        VALID_GROUP_ID,
        "dark mode preferences",
        expect.objectContaining({
          limit: 10,
          threshold: 0.3,
        }),
      );
    });

    it("should return RuVector results first in priority", async () => {
      const response = await memory_search(makeSearchRequest());

      // RuVector results should be present
      const ruvectorContents = response.results
        .filter((r) => r.content.includes("RuVector"))
        .map((r) => r.content);
      expect(ruvectorContents.length).toBe(2);

      // stores_used should include ruvector first (attempted order)
      expect(response.meta?.stores_used).toContain("ruvector");
    });

    it("should include ruvector_trajectory_id and ruvector_count in metadata", async () => {
      const response = await memory_search(makeSearchRequest());

      expect(response.meta?.ruvector_trajectory_id).toBe("traj-abc-123");
      expect(response.meta?.ruvector_count).toBe(2);
    });

    it("should map RuVector results as episodic source with conversation provenance", async () => {
      const response = await memory_search(makeSearchRequest());

      const ruvectorResults = response.results.filter((r) =>
        r.content.includes("RuVector"),
      );

      for (const result of ruvectorResults) {
        expect(result.source).toBe("episodic");
        expect(result.provenance).toBe("conversation");
        expect(result.created_at).toBeDefined();
        expect(result.usage_count).toBe(0);
      }
    });

    it("should respect the limit parameter across all sources", async () => {
      const request = makeSearchRequest({ limit: 2 });
      const response = await memory_search(request);

      expect(response.results.length).toBeLessThanOrEqual(2);
    });

    it("should pass the request limit to searchWithFeedback", async () => {
      const request = makeSearchRequest({ limit: 5 });
      await memory_search(request);

      expect(mockSearchWithFeedback).toHaveBeenCalledWith(
        VALID_GROUP_ID,
        expect.any(String),
        expect.objectContaining({
          limit: 5,
        }),
      );
    });

    it("still queries graph candidates in all-mode when RuVector fills the limit", async () => {
      // RuVector returns 2 results, limit is 2
      const request = makeSearchRequest({ limit: 2 });
      await memory_search(request);

      expect(mockGraphSearchMemories).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }));
    });

    it("still queries raw events in all-mode when RuVector fills the limit", async () => {
      // RuVector returns 2 results, limit is 2
      const request = makeSearchRequest({ limit: 2 });
      await memory_search(request);

      expect(mockPgQuery.mock.calls.some(([sql]) => String(sql).includes("FROM events"))).toBe(true);
    });
  });

  describe("Neo4j fallback when RuVector returns insufficient results", () => {
    beforeEach(() => {
      // RuVector returns only 1 result
      mockSearchWithFeedback.mockResolvedValue({
        memories: [
          {
            id: "rv-mem-1",
            content: "RuVector memory about TypeScript",
            memoryType: "episodic",
            score: 0.85,
          },
        ],
        total: 1,
        latencyMs: 10,
        trajectoryId: "traj-abc-456",
        bridgeSource: "ruvector",
        shouldLogFeedback: true,
      });
    });

    it("should query Neo4j when RuVector results < limit", async () => {
      const request = makeSearchRequest({ limit: 3 });
      await memory_search(request);

      expect(mockGraphSearchMemories).toHaveBeenCalled();
    });

    it("should include both ruvector and graph in stores_used", async () => {
      const response = await memory_search(makeSearchRequest({ limit: 3 }));

      expect(response.meta?.stores_used).toContain("ruvector");
      expect(response.meta?.stores_used).toContain("graph");
    });

    it("should combine results from RuVector and Neo4j", async () => {
      const response = await memory_search(makeSearchRequest({ limit: 3 }));

      // Should have both RuVector and Neo4j results
      const contents = response.results.map((r) => r.content);
      expect(contents).toContain("RuVector memory about TypeScript");
      expect(contents).toContain("Semantic knowledge about dark mode");
    });

    it("still queries raw events when vector and graph candidates fill the limit", async () => {
      const request = makeSearchRequest({ limit: 2 }); // 1 RV + 1 Neo4j = 2
      await memory_search(request);

      expect(mockPgQuery.mock.calls.some(([sql]) => String(sql).includes("FROM events"))).toBe(true);
    });
  });

  describe("PostgreSQL fallback when RuVector + Neo4j insufficient", () => {
    beforeEach(() => {
      // RuVector returns empty
      mockSearchWithFeedback.mockResolvedValue({
        memories: [],
        total: 0,
        latencyMs: 5,
        trajectoryId: "traj-empty-789",
        bridgeSource: "ruvector",
        shouldLogFeedback: false,
      });

      // Graph adapter returns empty (Neo4j semantic search returns nothing)
      mockGraphSearchMemories.mockResolvedValue([]);
    });

    it("should query PostgreSQL when RuVector and Neo4j return no results", async () => {
      await memory_search(makeSearchRequest());

      expect(mockPgQuery).toHaveBeenCalled();
    });

    it("should include postgres in stores_used (only store with results)", async () => {
      const response = await memory_search(makeSearchRequest());

      // Only postgres returned results (RuVector and Neo4j returned empty)
      expect(response.meta?.stores_used).not.toContain("ruvector");
      expect(response.meta?.stores_used).not.toContain("neo4j");
      expect(response.meta?.stores_used).toContain("postgres");
    });

    it("should still return PG results when RuVector and Neo4j are empty", async () => {
      const response = await memory_search(makeSearchRequest());

      expect(response.results.length).toBeGreaterThan(0);
      const contents = response.results.map((r) => r.content);
      expect(contents).toContain("User prefers dark mode");
    });
  });

  describe("RuVector failure (fail-closed to Neo4j)", () => {
    beforeEach(() => {
      mockSearchWithFeedback.mockRejectedValue(
        new Error("RuVector connection refused"),
      );
    });

    it("should NOT fail the entire search", async () => {
      const response = await memory_search(makeSearchRequest());

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.count).toBeGreaterThan(0);
    });

    it("should fallback to Neo4j when RuVector fails", async () => {
      await memory_search(makeSearchRequest());

      expect(mockGraphSearchMemories).toHaveBeenCalled();
    });

    it("should include warning about RuVector failure in metadata", async () => {
      const response = await memory_search(makeSearchRequest());

      expect(response.meta?.warnings).toBeDefined();
      expect(response.meta?.warnings?.some((w: string) =>
        w.includes("ruvector_unavailable")
      )).toBe(true);
    });

    it("should NOT include RuVector metadata when it fails", async () => {
      const response = await memory_search(makeSearchRequest());

      expect(response.meta?.ruvector_trajectory_id).toBeUndefined();
      expect(response.meta?.ruvector_count).toBeUndefined();
    });

    it("should NOT include 'ruvector' in stores_used when it fails", async () => {
      const response = await memory_search(makeSearchRequest());

      expect(response.meta?.stores_used).not.toContain("ruvector");
    });
  });

  describe("Neo4j failure (fail-closed to PostgreSQL)", () => {
    beforeEach(() => {
      // RuVector succeeds but returns insufficient results
      mockSearchWithFeedback.mockResolvedValue({
        memories: [{ id: "rv-1", content: "test", memoryType: "episodic", score: 0.5 }],
        total: 1,
        latencyMs: 10,
        trajectoryId: "traj-123",
        bridgeSource: "ruvector",
        shouldLogFeedback: true,
      });

      // Graph adapter fails (Neo4j connection refused)
      mockGraphSearchMemories.mockRejectedValue(
        new Error("Neo4j connection refused"),
      );
    });

    it("should NOT fail when Neo4j fails", async () => {
      const response = await memory_search(makeSearchRequest({ limit: 3 }));

      expect(response.results.length).toBeGreaterThan(0);
    });

    it("should fallback to PostgreSQL when Neo4j fails", async () => {
      await memory_search(makeSearchRequest({ limit: 3 }));

      expect(mockPgQuery).toHaveBeenCalled();
    });

    it("should include ruvector in stores_used but not neo4j when Neo4j fails", async () => {
      const response = await memory_search(makeSearchRequest({ limit: 3 }));

      expect(response.meta?.stores_used).toContain("ruvector");
      expect(response.meta?.stores_used).not.toContain("neo4j");
    });
  });

  describe("when RuVector returns empty", () => {
    beforeEach(() => {
      mockSearchWithFeedback.mockResolvedValue({
        memories: [],
        total: 0,
        latencyMs: 5,
        trajectoryId: "traj-empty-456",
        bridgeSource: "ruvector",
        shouldLogFeedback: false,
      });
    });

    it("should still include trajectory_id but with count 0", async () => {
      const response = await memory_search(makeSearchRequest());

      expect(response.meta?.ruvector_trajectory_id).toBe("traj-empty-456");
      expect(response.meta?.ruvector_count).toBe(0);
    });

    it("should NOT include 'ruvector' in stores_used with zero results", async () => {
      const response = await memory_search(makeSearchRequest());

      expect(response.meta?.stores_used).not.toContain("ruvector");
    });

    it("should fallback to Neo4j when RuVector returns empty", async () => {
      await memory_search(makeSearchRequest());

      expect(mockGraphSearchMemories).toHaveBeenCalled();
    });
  });

  describe("group_id validation", () => {
    it("should reject invalid group_id before reaching any store", async () => {
      const request = makeSearchRequest({
        group_id: "invalid-group" as any,
      });

      await expect(memory_search(request)).rejects.toThrow("Invalid group_id");
      // No stores should be called since validation fails first
      expect(mockSearchWithFeedback).not.toHaveBeenCalled();
    });
  });

  describe("result ordering and deduplication", () => {
    beforeEach(() => {
      // RuVector returns result with same ID as Neo4j (duplication test)
      mockSearchWithFeedback.mockResolvedValue({
        memories: [
          { id: "dup-mem-1", content: "RuVector version", memoryType: "episodic", score: 0.9 },
          { id: "rv-unique", content: "RuVector unique", memoryType: "episodic", score: 0.8 },
        ],
        total: 2,
        latencyMs: 10,
        trajectoryId: "traj-dup",
        bridgeSource: "ruvector",
        shouldLogFeedback: true,
      });

      // Graph adapter returns results with a duplicate ID
      mockGraphSearchMemories.mockResolvedValue([
        {
          id: "dup-mem-1", // Same ID as RuVector
          content: "Neo4j version (should be deduped)",
          score: 0.85,
          provenance: "conversation",
          created_at: new Date().toISOString(),
          usage_count: 0,
          relevance: 0.85,
          tags: [],
        },
        {
          id: "neo4j-unique",
          content: "Neo4j unique",
          score: 0.7,
          provenance: "conversation",
          created_at: new Date().toISOString(),
          usage_count: 0,
          relevance: 0.7,
          tags: [],
        },
      ]);

      // PG returns empty for this test (we're testing RuVector+Neo4j dedup)
      mockPgQuery.mockResolvedValue({
        rows: [],
      });
    });

    it("should deduplicate results by ID (keep first occurrence)", async () => {
      const response = await memory_search(makeSearchRequest({ limit: 5 }));

      // Count occurrences of "dup-mem-1"
      const dupCount = response.results.filter((r) => r.id === "dup-mem-1").length;
      expect(dupCount).toBe(1);

      // Should have 3 unique results: dup-mem-1, rv-unique, neo4j-unique (PG is empty)
      expect(response.results.length).toBe(3);
    });

    it("should sort results by score descending", async () => {
      const response = await memory_search(makeSearchRequest({ limit: 5 }));

      // Verify scores are in descending order
      for (let i = 1; i < response.results.length; i++) {
        expect(response.results[i - 1].score).toBeGreaterThanOrEqual(
          response.results[i].score,
        );
      }
    });
  });
});
