/**
 * RuVector Primary Backend Tests for memory_search (Slice B)
 *
 * Tests that memory_search uses RuVector as the PRIMARY backend:
 * - Priority: RuVector → Neo4j fallback → PostgreSQL traces
 * - RuVector is always called first (no feature flag check)
 * - Fail-closed: if RuVector fails, falls back to Neo4j, then PG
 * - Evidence-gated feedback: trajectoryId surfaced in metadata
 * - Stores are attempted in priority order, only successful ones in stores_used
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

    it("should NOT query Neo4j if RuVector returns sufficient results", async () => {
      // RuVector returns 2 results, limit is 2
      const request = makeSearchRequest({ limit: 2 });
      await memory_search(request);

      // Neo4j should not be queried when RuVector satisfies the limit
      expect(mockGraphSearchMemories).not.toHaveBeenCalled();
    });

    it("should NOT query PostgreSQL if RuVector returns sufficient results", async () => {
      // RuVector returns 2 results, limit is 2
      const request = makeSearchRequest({ limit: 2 });
      await memory_search(request);

      // PG should not be queried when RuVector satisfies the limit
      expect(mockPgQuery).not.toHaveBeenCalled();
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

    it("should NOT query PostgreSQL if RuVector + Neo4j satisfy limit", async () => {
      const request = makeSearchRequest({ limit: 2 }); // 1 RV + 1 Neo4j = 2
      await memory_search(request);

      expect(mockPgQuery).not.toHaveBeenCalled();
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