import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

type AutoCuratorModule = typeof import("@/lib/curator/auto-curator");

const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_PASSWORD
  ? describe
  : describe.skip;
const groupId = `allura-autocurator-${randomUUID().slice(0, 8)}`;
const workspaceA = `workspace-auto-a-${randomUUID().slice(0, 8)}`;
const workspaceB = `workspace-auto-b-${randomUUID().slice(0, 8)}`;
const scopeA = { tenantId: groupId, workspaceId: workspaceA, principalId: "auto-curator-live-test" };

/** Uses the fresh disposable live-lane database; every fixture is UUID-namespaced and removed. */
describeLive("auto-curator workspace authority", () => {
  let owner: Pool;
  let curator: AutoCuratorModule;

  beforeAll(async () => {
    // Keep all DB-owning modules out of skipped-suite collection. Vitest still
    // evaluates describe.skip callbacks, so live dependencies load only here.
    const [{ getPool }, autoCurator] = await Promise.all([
      import("@/lib/postgres/connection"),
      import("@/lib/curator/auto-curator"),
    ]);
    owner = getPool();
    curator = autoCurator;
    await owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ($1, $2, 'Auto curator A'), ($3, $2, 'Auto curator B')`,
      [workspaceA, groupId, workspaceB],
    );
    await owner.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata)
       VALUES
         ($1, $2, 'promotion_failed', 'agent-a', 'failed', '{"error":"workspace-a-only"}'::jsonb),
         ($1, $2, 'promotion_failed', 'agent-a', 'failed', '{"error":"workspace-a-only"}'::jsonb),
         ($1, $3, 'promotion_failed', 'agent-a', 'failed', '{"error":"workspace-b-must-not-influence"}'::jsonb),
         ($1, $3, 'promotion_failed', 'agent-a', 'failed', '{"error":"workspace-b-must-not-influence"}'::jsonb)`,
      [groupId, workspaceA, workspaceB],
    );
  });

  afterAll(async () => {
    await owner.query("DELETE FROM events WHERE group_id = $1", [groupId]);
    await owner.query("DELETE FROM canonical_proposals WHERE group_id = $1", [groupId]);
    await owner.query("DELETE FROM workspaces WHERE group_id = $1", [groupId]);
  });

  it("does not let a same-group workspace-B event appear in or influence workspace-A candidate, proposal, or evidence", async () => {
    const analysis = await curator.autoCurate(scopeA, { windowHours: 24 });
    expect(analysis.events_analyzed).toBe(2);
    expect(analysis.candidates).toHaveLength(1);
    const candidate = analysis.candidates[0];
    expect(candidate.content).toContain("workspace-a-only");
    expect(candidate.content).not.toContain("workspace-b-must-not-influence");
    expect(candidate.source_scope).toEqual({ group_id: groupId, workspace_id: workspaceA });

    const submitted = await curator.submitCandidate(candidate, scopeA);
    const proposal = await owner.query(
      "SELECT workspace_id, content FROM canonical_proposals WHERE id = $1",
      [submitted.proposal_id],
    );
    const evidence = await owner.query(
      "SELECT workspace_id, metadata FROM events WHERE event_type = 'auto_curated' AND metadata->>'proposal_id' = $1",
      [submitted.proposal_id],
    );
    expect(proposal.rows).toEqual([{ workspace_id: workspaceA, content: candidate.content }]);
    expect(evidence.rows).toHaveLength(1);
    expect(evidence.rows[0].workspace_id).toBe(workspaceA);
    expect(evidence.rows[0].metadata.source_scope).toEqual({ group_id: groupId, workspace_id: workspaceA });
    expect(JSON.stringify(evidence.rows[0].metadata)).not.toContain("workspace-b-must-not-influence");
  });
});
