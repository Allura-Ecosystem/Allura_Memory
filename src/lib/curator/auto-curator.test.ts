import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/postgres/connection", () => ({ getPool: vi.fn() }));
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: vi.fn() }));

import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction";
import { getPool } from "@/lib/postgres/connection";
import { autoCurate, type CandidateInsight, submitCandidate } from "./auto-curator";

const scope = { tenantId: "allura-curator-test", workspaceId: "workspace-curator-test", principalId: "curator-test-agent" };
const candidate: CandidateInsight = {
  id: "candidate-1", group_id: scope.tenantId, type: "pattern", content: "Workspace-scoped curator event integrity",
  confidence: 0.9, impact: "medium", frequency: 2, novelty_score: 0.8, reasoning: "Regression coverage",
  tier: "mainstream", source_event_ids: [1, 2], source_scope: { group_id: scope.tenantId, workspace_id: scope.workspaceId }, requires_approval: true, created_at: "2026-08-22T00:00:00.000Z",
};

describe("submitCandidate", () => {
  it("writes validated source-event provenance, proposal, and evidence in one strict workspace transaction", async () => {
    const appClient = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: "proposal-1", status: "pending" }] })
      .mockResolvedValueOnce({ rows: [] }) };
    vi.mocked(withWorkspaceTransaction).mockImplementation(async (receivedScope, callback) => {
      expect(receivedScope).toBe(scope);
      return callback(appClient as never);
    });

    await expect(submitCandidate(candidate, scope)).resolves.toMatchObject({ proposal_id: "proposal-1", status: "pending" });
    expect(withWorkspaceTransaction).toHaveBeenCalledTimes(1);
    expect(appClient.query).toHaveBeenCalledTimes(3);
    const [sourceSql, sourceParams] = appClient.query.mock.calls[0] as [string, unknown[]];
    expect(sourceSql).toContain("FROM events");
    expect(sourceParams).toEqual([scope.tenantId, scope.workspaceId, candidate.source_event_ids]);
    const [proposalSql, proposalParams] = appClient.query.mock.calls[1] as [string, unknown[]];
    expect(proposalSql).toContain("INSERT INTO canonical_proposals");
    expect(proposalParams.at(-1)).toBe(candidate.source_event_ids[0]);
    const [eventSql, eventParams] = appClient.query.mock.calls[2] as [string, unknown[]];
    expect(eventSql).toContain("INSERT INTO events (group_id, workspace_id");
    expect(eventParams.slice(0, 3)).toEqual([scope.tenantId, scope.workspaceId, "auto_curated"]);
    expect(JSON.parse(eventParams[5] as string)).toMatchObject({ source_scope: { group_id: scope.tenantId, workspace_id: scope.workspaceId }, source_event_ids: candidate.source_event_ids });
  });

  it("fails closed before writing when any source event is outside the resolved workspace", async () => {
    const appClient = { query: vi.fn().mockResolvedValueOnce({ rows: [{ id: 1 }] }) };
    vi.mocked(withWorkspaceTransaction).mockImplementation(async (_scope, callback) => callback(appClient as never));

    await expect(submitCandidate(candidate, scope)).rejects.toThrow("candidate source events do not belong to resolved workspace scope");
    expect(appClient.query).toHaveBeenCalledTimes(1);
  });
});

describe("autoCurate", () => {
  it("requires a resolved workspace scope and reads only that group/workspace through the app transaction", async () => {
    const appClient = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [
        { id: 1, event_type: "promotion_failed", agent_id: "agent-a", group_id: scope.tenantId, workspace_id: scope.workspaceId, status: "failed", metadata: { error: "only-a" }, created_at: "2026-08-22T00:00:00.000Z" },
        { id: 2, event_type: "promotion_failed", agent_id: "agent-a", group_id: scope.tenantId, workspace_id: scope.workspaceId, status: "failed", metadata: { error: "only-a" }, created_at: "2026-08-22T00:01:00.000Z" },
      ] })
      // This is legacy group-scoped retained content. It may have been written
      // by another workspace and must not suppress this workspace's candidate.
      .mockResolvedValueOnce({ rows: [
        { content: "Agent agent-a encountered repeated failures: only-a (2 occurrences)" },
      ] }) };
    vi.mocked(withWorkspaceTransaction).mockImplementation(async (receivedScope, callback) => {
      expect(receivedScope).toBe(scope);
      return callback(appClient as never);
    });

    const result = await autoCurate(scope, { windowHours: 24 });
    expect(result.candidates).toHaveLength(1);
    expect(result.duplicates_suppressed).toBe(0);
    expect(result.candidates[0]).toMatchObject({ source_event_ids: [1, 2], source_scope: { group_id: scope.tenantId, workspace_id: scope.workspaceId } });
    expect(appClient.query.mock.calls[0][0]).toContain("workspace_id = $2");
    expect(appClient.query.mock.calls[0][1]).toEqual([scope.tenantId, scope.workspaceId, 24]);
    expect(appClient.query).toHaveBeenCalledTimes(1);
    expect(appClient.query.mock.calls.some(([sql]) => String(sql).includes("allura_memories"))).toBe(false);
    expect(getPool).not.toHaveBeenCalled();
  });

  it("fails closed for the legacy group-only entrypoint", async () => {
    await expect(autoCurate(scope.tenantId as never)).rejects.toThrow("auto-curator requires a server-resolved workspace scope");
  });
});
