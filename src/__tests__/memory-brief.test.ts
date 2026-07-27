/**
 * Memory Brief Helper Tests — Story 20.4
 *
 * Verifies:
 * - getMemoryBrief calls memory_search with correct params
 * - Results are categorized into priorWork / decisions / blockers
 * - group_id validation is enforced (rejects invalid formats)
 * - Empty results are handled gracefully
 * - The MCP tool wrapper returns proper response envelope
 * - categorizeMemory correctly classifies content by heuristics
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock environment ──────────────────────────────────────────────────────────

process.env.ALLURA_DEV_AUTH_ENABLED = "true";
// @ts-expect-error — NODE_ENV is read-only in Next.js types but must be set for tests
process.env.NODE_ENV = "test";

// ── Mutable mock state ────────────────────────────────────────────────────────

const mockSearchResponse = {
  results: [] as any[],
  count: 0,
  latency_ms: 5,
};

const memorySearchMock = vi.fn(async () => ({ ...mockSearchResponse }));

// ── Mock canonical-tools ──────────────────────────────────────────────────────

vi.mock("@/mcp/canonical-tools", () => ({
  memory_search: memorySearchMock,
  memory_add: vi.fn(),
  memory_get: vi.fn(),
  memory_list: vi.fn(),
  memory_delete: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import {
  getMemoryBrief,
  categorizeMemory,
  memory_brief_tool,
} from "@/lib/memory/memory-brief";
import type { MemorySearchResult } from "@/lib/memory/canonical-contracts";
import { GroupIdValidationError } from "@/lib/validation/group-id";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeResult(content: string, score = 0.8): MemorySearchResult {
  return {
    id: `mem-${Math.random().toString(36).slice(2, 10)}` as any,
    content,
    score,
    source: "episodic",
    provenance: "conversation",
    created_at: "2026-07-27T00:00:00Z",
  };
}

beforeEach(() => {
  memorySearchMock.mockReset();
  mockSearchResponse.results = [];
  mockSearchResponse.count = 0;
});

// ── categorizeMemory ───────────────────────────────────────────────────────────

describe("Story 20.4 — categorizeMemory", () => {
  it("categorizes prior work content", () => {
    const result = makeResult("We implemented the API and deployed it last week.");
    const cats = categorizeMemory(result);
    expect(cats.priorWork).toBe(true);
    expect(cats.decisions).toBe(false);
    expect(cats.blockers).toBe(false);
  });

  it("categorizes decision content", () => {
    const result = makeResult("ADR-001: We decided to use PostgreSQL for persistence.");
    const cats = categorizeMemory(result);
    expect(cats.decisions).toBe(true);
    expect(cats.priorWork).toBe(false);
    expect(cats.blockers).toBe(false);
  });

  it("categorizes blocker content", () => {
    const result = makeResult("The deployment is blocked by a broken dependency.");
    const cats = categorizeMemory(result);
    expect(cats.blockers).toBe(true);
    expect(cats.priorWork).toBe(false);
    expect(cats.decisions).toBe(false);
  });

  it("a memory can match multiple categories", () => {
    const result = makeResult("We implemented the feature but it's broken and we decided to revert.");
    const cats = categorizeMemory(result);
    expect(cats.priorWork).toBe(true);
    expect(cats.decisions).toBe(true);
    expect(cats.blockers).toBe(true);
  });

  it("returns all-false for content matching no patterns", () => {
    const result = makeResult("The weather is nice today.");
    const cats = categorizeMemory(result);
    expect(cats.priorWork).toBe(false);
    expect(cats.decisions).toBe(false);
    expect(cats.blockers).toBe(false);
  });

  it("handles empty content", () => {
    const result = makeResult("");
    const cats = categorizeMemory(result);
    expect(cats.priorWork).toBe(false);
    expect(cats.decisions).toBe(false);
    expect(cats.blockers).toBe(false);
  });
});

// ── getMemoryBrief ─────────────────────────────────────────────────────────────

describe("Story 20.4 — getMemoryBrief", () => {
  it("calls memory_search with topic, group_id, and limit", async () => {
    memorySearchMock.mockResolvedValue({
      results: [],
      count: 0,
      latency_ms: 3,
    });

    await getMemoryBrief({ topic: "auth refactor", group_id: "allura-system" });

    expect(memorySearchMock).toHaveBeenCalledTimes(1);
    const callArgs = (memorySearchMock.mock.calls[0] as any[])[0] as Record<string, unknown>;
    expect(callArgs["query"]).toBe("auth refactor");
    expect(callArgs["group_id"]).toBe("allura-system");
    expect(callArgs["limit"]).toBe(5);
    expect(callArgs["status"]).toBe("all");
  });

  it("categorizes results into priorWork, decisions, and blockers", async () => {
    const results: MemorySearchResult[] = [
      makeResult("We implemented the auth module and deployed it."),
      makeResult("ADR-002: We chose to use JWT for authentication."),
      makeResult("The payment gateway is broken and doesn't work."),
    ];
    memorySearchMock.mockResolvedValue({
      results,
      count: 3,
      latency_ms: 10,
    });

    const brief = await getMemoryBrief({
      topic: "auth",
      group_id: "allura-system",
    });

    expect(brief.priorWork).toHaveLength(1);
    expect(brief.priorWork[0].content).toContain("implemented");
    expect(brief.decisions).toHaveLength(1);
    expect(brief.decisions[0].content).toContain("ADR-002");
    expect(brief.blockers).toHaveLength(1);
    expect(brief.blockers[0].content).toContain("broken");
  });

  it("places uncategorized results into priorWork as default bucket", async () => {
    const results: MemorySearchResult[] = [
      makeResult("Some random note about the project."),
    ];
    memorySearchMock.mockResolvedValue({
      results,
      count: 1,
      latency_ms: 2,
    });

    const brief = await getMemoryBrief({
      topic: "project",
      group_id: "allura-system",
    });

    expect(brief.priorWork).toHaveLength(1);
    expect(brief.decisions).toHaveLength(0);
    expect(brief.blockers).toHaveLength(0);
  });

  it("handles empty results gracefully", async () => {
    memorySearchMock.mockResolvedValue({
      results: [],
      count: 0,
      latency_ms: 1,
    });

    const brief = await getMemoryBrief({
      topic: "nonexistent",
      group_id: "allura-system",
    });

    expect(brief.priorWork).toHaveLength(0);
    expect(brief.decisions).toHaveLength(0);
    expect(brief.blockers).toHaveLength(0);
    expect(brief.totalFound).toBe(0);
    expect(brief.latency_ms).toBe(1);
  });

  it("rejects invalid group_id format", async () => {
    await expect(
      getMemoryBrief({ topic: "test", group_id: "invalid" })
    ).rejects.toThrow(GroupIdValidationError);
  });

  it("respects custom limit parameter", async () => {
    memorySearchMock.mockResolvedValue({
      results: [],
      count: 0,
      latency_ms: 1,
    });

    await getMemoryBrief({
      topic: "test",
      group_id: "allura-system",
      limit: 3,
    });

    const callArgs = (memorySearchMock.mock.calls[0] as any[])[0] as Record<string, unknown>;
    expect(callArgs["limit"]).toBe(3);
  });

  it("clamps limit to max 10", async () => {
    memorySearchMock.mockResolvedValue({
      results: [],
      count: 0,
      latency_ms: 1,
    });

    await getMemoryBrief({
      topic: "test",
      group_id: "allura-system",
      limit: 50,
    });

    const callArgs = (memorySearchMock.mock.calls[0] as any[])[0] as Record<string, unknown>;
    expect(callArgs["limit"]).toBe(10);
  });

  it("returns topic and group_id in the brief", async () => {
    memorySearchMock.mockResolvedValue({
      results: [],
      count: 0,
      latency_ms: 1,
    });

    const brief = await getMemoryBrief({
      topic: "deployment",
      group_id: "allura-faithmeats",
    });

    expect(brief.topic).toBe("deployment");
    expect(brief.group_id).toBe("allura-faithmeats");
  });
});

// ── memory_brief_tool (MCP wrapper) ────────────────────────────────────────────

describe("Story 20.4 — memory_brief_tool", () => {
  it("returns data envelope on success", async () => {
    memorySearchMock.mockResolvedValue({
      results: [],
      count: 0,
      latency_ms: 1,
    });

    const response = await memory_brief_tool({
      topic: "test",
      group_id: "allura-system",
    });

    expect(response.data).not.toBeNull();
    expect(response.data!.topic).toBe("test");
    expect(response.error).toBeNull();
    expect(response.meta.contract_version).toBe("v1");
    expect(response.meta.degraded).toBe(false);
  });

  it("returns error envelope on invalid group_id", async () => {
    const response = await memory_brief_tool({
      topic: "test",
      group_id: "invalid",
    });

    expect(response.data).toBeNull();
    expect(response.error).toBeTruthy();
    expect(response.error).toContain("group_id");
  });

  it("returns error envelope when memory_search throws", async () => {
    memorySearchMock.mockRejectedValue(new Error("DB connection failed"));

    const response = await memory_brief_tool({
      topic: "test",
      group_id: "allura-system",
    });

    expect(response.data).toBeNull();
    expect(response.error).toBe("DB connection failed");
  });
});