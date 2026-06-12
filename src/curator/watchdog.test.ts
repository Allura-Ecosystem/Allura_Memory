/**
 * watchdog.test.ts — Unit tests for runWatchdogCycle()
 *
 * Strategy:
 * - Mock `getPool` so no real DB connection is required
 * - Mock `curatorScore` to control scoring output
 * - Test heartbeat INSERT, queue-depth SELECT, and conditional BLOCKER INSERT
 *
 * No external services required. Pure unit lane.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../lib/postgres/connection", () => ({
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

vi.mock("../lib/curator/score", () => ({
  curatorScore: vi.fn(),
}));

import { runWatchdogCycle, type WatchdogConfig } from "./watchdog";
import { getPool } from "../lib/postgres/connection";
import { curatorScore } from "../lib/curator/score";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<WatchdogConfig> = {}): WatchdogConfig {
  return {
    groupId: "allura-system",
    scoreThreshold: 0.7,
    ...overrides,
  };
}

/**
 * Build a mock pool whose query() responses are driven by a sequence.
 * Each call pops from the front of `responses`; falls back to { rows: [] }.
 */
function makeMockPool(responses: Array<{ rows: Record<string, unknown>[] }> = []) {
  const queue = [...responses];
  return {
    query: vi.fn().mockImplementation(() => {
      const next = queue.shift();
      return Promise.resolve(next ?? { rows: [] });
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runWatchdogCycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts WATCHDOG_HEARTBEAT and does NOT insert BLOCKER when queue depth is below threshold", async () => {
    const config = makeConfig({ queueDepthThreshold: 100 });

    // scanAndPropose calls getPool() internally; return a pool that
    // returns 0 events (so no proposals are created)
    const innerPool = makeMockPool([{ rows: [] }]);
    vi.mocked(getPool).mockReturnValue(innerPool as unknown as ReturnType<typeof getPool>);

    // The outer pool passed to runWatchdogCycle returns:
    //  call 1 — WATCHDOG_HEARTBEAT INSERT → { rows: [] }
    //  call 2 — COUNT query → pending = 50 (below threshold)
    const outerPool = makeMockPool([
      { rows: [] },                           // heartbeat INSERT
      { rows: [{ pending: 50 }] },            // COUNT query
    ]);

    await runWatchdogCycle(outerPool, config, 1);

    // Should have made exactly 2 queries on outerPool
    expect(outerPool.query).toHaveBeenCalledTimes(2);

    // First call must be the heartbeat INSERT (event type in params, not SQL)
    const [firstSql, firstParams] = outerPool.query.mock.calls[0] as [string, unknown[]];
    expect(firstSql).toContain("INSERT INTO events");
    expect(firstParams[0]).toBe("WATCHDOG_HEARTBEAT");

    // Second call must be the COUNT SELECT with group_id
    const [secondSql, secondParams] = outerPool.query.mock.calls[1] as [string, unknown[]];
    expect(secondSql).toContain("canonical_proposals");
    expect(secondSql).toContain("group_id = $1");
    expect(secondParams).toEqual([config.groupId]);

    // No BLOCKER INSERT (check params, not SQL — parameterized queries)
    const allCalls = outerPool.query.mock.calls as [string, unknown[]][];
    expect(allCalls.some(([, params]) => params?.[0] === "BLOCKER")).toBe(false);
  });

  it("inserts BLOCKER event when queue depth exceeds threshold", async () => {
    const config = makeConfig({ queueDepthThreshold: 100 });

    const innerPool = makeMockPool([{ rows: [] }]);
    vi.mocked(getPool).mockReturnValue(innerPool as unknown as ReturnType<typeof getPool>);

    // outerPool responses:
    //  call 1 — heartbeat INSERT
    //  call 2 — COUNT query → pending = 704 (above threshold)
    //  call 3 — BLOCKER INSERT
    const outerPool = makeMockPool([
      { rows: [] },
      { rows: [{ pending: 704 }] },
      { rows: [] },
    ]);

    await runWatchdogCycle(outerPool, config, 2);

    expect(outerPool.query).toHaveBeenCalledTimes(3);

    const allCalls = outerPool.query.mock.calls as [string, unknown[]][];
    const blockerCall = allCalls.find(([, params]) => params?.[0] === "BLOCKER");
    expect(blockerCall).toBeDefined();

    // BLOCKER INSERT must carry correct params
    const [, blockerParams] = blockerCall!;
    expect(blockerParams![0]).toBe("BLOCKER");
    expect(blockerParams![1]).toBe("watchdog");
    expect(blockerParams![2]).toBe(config.groupId);

    const meta = JSON.parse(blockerParams![3] as string) as Record<string, unknown>;
    expect(meta.kind).toBe("curator_queue_depth");
    expect(meta.pending).toBe(704);
    expect(meta.threshold).toBe(100);
    expect(meta.hint).toBe("run curator batch triage");
  });

  it("respects WATCHDOG_QUEUE_DEPTH_THRESHOLD env var when queueDepthThreshold is not set in config", async () => {
    const originalEnv = process.env.WATCHDOG_QUEUE_DEPTH_THRESHOLD;
    process.env.WATCHDOG_QUEUE_DEPTH_THRESHOLD = "50";

    const config = makeConfig(); // no queueDepthThreshold set

    const innerPool = makeMockPool([{ rows: [] }]);
    vi.mocked(getPool).mockReturnValue(innerPool as unknown as ReturnType<typeof getPool>);

    // pending = 60, env threshold = 50 → should emit BLOCKER
    const outerPool = makeMockPool([
      { rows: [] },
      { rows: [{ pending: 60 }] },
      { rows: [] },
    ]);

    await runWatchdogCycle(outerPool, config, 1);

    const allCalls = outerPool.query.mock.calls as [string, unknown[]][];
    const blockerCall = allCalls.find(([, params]) => params?.[0] === "BLOCKER");
    expect(blockerCall).toBeDefined();

    // Restore env
    if (originalEnv === undefined) {
      delete process.env.WATCHDOG_QUEUE_DEPTH_THRESHOLD;
    } else {
      process.env.WATCHDOG_QUEUE_DEPTH_THRESHOLD = originalEnv;
    }
  });
});
