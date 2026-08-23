import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/postgres/connection", () => ({
  getPool: vi.fn(),
  closePool: vi.fn(),
}));
vi.mock("../lib/curator/score", () => ({ curatorScore: vi.fn() }));
vi.mock("../lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: vi.fn() }));
vi.mock("../lib/config/tenant-config", () => ({ resolveScoreThresholdWithClient: vi.fn() }));

import { getWorkspaceWatchdogCandidates, runWatchdogCycle, scanAndPropose, type WatchdogConfig } from "./watchdog";
import { getPool } from "../lib/postgres/connection";
import { curatorScore } from "../lib/curator/score";
import { withWorkspaceTransaction } from "../lib/db/tenant-transaction";
import { resolveScoreThresholdWithClient } from "../lib/config/tenant-config";

function makeConfig(overrides: Partial<WatchdogConfig> = {}): WatchdogConfig {
  return {
    groupId: "allura-system",
    scope: { tenantId: "allura-system", workspaceId: "watchdog-test", principalId: "watchdog-test" },
    scoreThreshold: 0.7,
    ...overrides,
  };
}

function makeMockPool(responses: Array<{ rows: Record<string, unknown>[] }> = []) {
  const queue = [...responses];
  return { query: vi.fn().mockImplementation(() => Promise.resolve(queue.shift() ?? { rows: [] })) };
}

describe("watchdog workspace integrity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes heartbeat through the strict workspace transaction and counts only its group and workspace", async () => {
    const config = makeConfig({ queueDepthThreshold: 100 });
    vi.mocked(getPool).mockReturnValue(makeMockPool([{ rows: [] }]) as never);
    const appClient = makeMockPool([{ rows: [] }, { rows: [] }, { rows: [{ pending: 50 }] }]);
    vi.mocked(withWorkspaceTransaction).mockImplementation(async (scope, callback) => {
      expect(scope).toBe(config.scope);
      return callback(appClient as never);
    });

    await runWatchdogCycle(config, 1);

    expect(withWorkspaceTransaction).toHaveBeenCalledTimes(2);
    const [heartbeatSql, heartbeatParams] = appClient.query.mock.calls[1] as [string, unknown[]];
    expect(heartbeatSql).toContain("INSERT INTO events");
    expect(heartbeatParams.slice(0, 4)).toEqual(["WATCHDOG_HEARTBEAT", "watchdog", config.groupId, config.scope.workspaceId]);
    const [depthSql, depthParams] = appClient.query.mock.calls[2] as [string, unknown[]];
    expect(depthSql).toContain("group_id = $1");
    expect(depthSql).toContain("workspace_id = $2");
    expect(depthParams).toEqual([config.groupId, config.scope.workspaceId]);
  });

  it("writes a workspace-scoped BLOCKER through the same strict transaction", async () => {
    const config = makeConfig({ queueDepthThreshold: 100 });
    vi.mocked(getPool).mockReturnValue(makeMockPool([{ rows: [] }]) as never);
    const appClient = makeMockPool([{ rows: [] }, { rows: [] }, { rows: [{ pending: 704 }] }, { rows: [] }]);
    vi.mocked(withWorkspaceTransaction).mockImplementation(async (_scope, callback) => callback(appClient as never));

    await runWatchdogCycle(config, 2);

    expect(withWorkspaceTransaction).toHaveBeenCalledTimes(2);
    const blockerCall = appClient.query.mock.calls.find(([, params]) => (params as unknown[])?.[0] === "BLOCKER") as [string, unknown[]] | undefined;
    expect(blockerCall).toBeDefined();
    expect(blockerCall![1].slice(0, 4)).toEqual(["BLOCKER", "watchdog", config.groupId, config.scope.workspaceId]);
  });

  it("reads candidates and score config through one strict workspace transaction, never the owner pool", async () => {
    const config = makeConfig();
    vi.mocked(curatorScore).mockResolvedValue({ confidence: 0.9, reasoning: "qualified", tier: "adoption" });
    vi.mocked(resolveScoreThresholdWithClient).mockResolvedValue(0.7);
    const appClient = makeMockPool([{ rows: [{ id: 42, event_type: "memory_add", agent_id: "agent-a", metadata: {}, created_at: new Date().toISOString() }] }, { rows: [] }]);
    vi.mocked(withWorkspaceTransaction).mockImplementation(async (_scope, callback) => callback(appClient as never));

    await expect(scanAndPropose(config)).resolves.toBe(1);

    expect(getPool).not.toHaveBeenCalled();
    expect(resolveScoreThresholdWithClient).toHaveBeenCalledWith(appClient, config.groupId, config.scoreThreshold);
    const [candidateSql, candidateParams] = appClient.query.mock.calls[0] as [string, unknown[]];
    expect(candidateSql).toContain("FROM events e");
    expect(candidateParams).toEqual([config.groupId, config.scope.workspaceId]);
    const [proposalSql, proposalParams] = appClient.query.mock.calls[1] as [string, unknown[]];
    expect(proposalSql).toContain("workspace_id");
    expect(proposalParams.slice(0, 2)).toEqual([config.groupId, config.scope.workspaceId]);
    expect(withWorkspaceTransaction).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the workspace scope is absent or belongs to another tenant", async () => {
    await expect(scanAndPropose({ groupId: "allura-system", scoreThreshold: 0.7 } as WatchdogConfig)).rejects.toThrow("server-resolved workspace scope");
    await expect(scanAndPropose(makeConfig({ scope: { tenantId: "allura-other", workspaceId: "ws-other", principalId: "attacker" } }))).rejects.toThrow("server-resolved workspace scope");
  });

  it("queries only scoped events and deduplicates trace references within that workspace", async () => {
    const config = makeConfig();
    const appClient = makeMockPool([{ rows: [] }]);
    vi.mocked(resolveScoreThresholdWithClient).mockResolvedValue(0.7);
    vi.mocked(withWorkspaceTransaction).mockImplementation(async (_scope, callback) => callback(appClient as never));
    await expect(scanAndPropose(config)).resolves.toBe(0);
    expect(getPool).not.toHaveBeenCalled();
    const [sql, params] = appClient.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("e.workspace_id = $2");
    expect(sql).toContain("cp.workspace_id = e.workspace_id");
    expect(params).toEqual([config.groupId, config.scope.workspaceId]);
  });

  it("excludes legacy unscoped events from watchdog candidates", async () => {
    const pool = makeMockPool([{ rows: [] }]);
    await getWorkspaceWatchdogCandidates(pool, makeConfig().scope);
    expect(pool.query.mock.calls[0]?.[0]).toContain("e.workspace_id = $2");
  });
});
