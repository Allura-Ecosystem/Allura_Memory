import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrincipalContext } from "@/lib/auth/principal-context";
import { getPool } from "@/lib/postgres/connection";
import { approveProposal } from "../approve-proposal";
import { drainPromotionOutbox } from "../promotion-outbox-worker";

const GROUP_ID = "allura-atomic-outbox-worker";
const WORKSPACE_ID = "workspace-atomic-outbox-worker";
const principal = createPrincipalContext({
  principalId: "curator-outbox-e2e",
  tenantIds: [GROUP_ID],
  roles: ["curator"],
  scopes: ["review:approve"],
  authMethod: "service_identity",
  sessionId: "outbox-worker-e2e",
});

const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip;

describeLive("Story 24.4 AC-9: outbox worker delivery and retry", () => {
  const pool = getPool();
  const proposalIds: string[] = [];

  beforeAll(async () => {
    await pool.query(`INSERT INTO workspaces(workspace_id,group_id,name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id) DO NOTHING`, [WORKSPACE_ID, GROUP_ID, "Outbox worker", principal.principalId]);
  });


  afterEach(async () => {
    await pool.query("BEGIN");
    await pool.query("SET LOCAL session_replication_role='replica'");
    await pool.query("DELETE FROM governance_receipts WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM promotion_idempotency WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM promotion_outbox WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM graph_memories WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM canonical_proposals WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM events WHERE group_id = $1 AND event_type = 'canonical_memory_promoted'", [GROUP_ID]);
    await pool.query("DELETE FROM events WHERE group_id = $1", [GROUP_ID]);
    await pool.query("COMMIT");
    proposalIds.length = 0;
  });

  async function insertAndApprove(): Promise<{ proposalId: string; memoryId: string }> {
    const id = randomUUID();
    proposalIds.push(id);
    const source = await pool.query<{ id: number }>(
      `INSERT INTO events(group_id,workspace_id,event_type,agent_id,status,metadata)
       VALUES($1,$2,'proposal_source','requester-outbox-e2e','completed','{}') RETURNING id`, [GROUP_ID, WORKSPACE_ID]);
    await pool.query(
      `INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, reasoning, tier, status, trace_ref)
       VALUES ($1, $2, $3, $4, 0.91, 'outbox test', 'mainstream', 'pending', $5)`,
      [id, GROUP_ID, WORKSPACE_ID, "Outbox worker delivers projection event after commit.", source.rows[0]!.id],
    );
    const result = await approveProposal({ principal, workspaceId: WORKSPACE_ID, proposalId: id, rationale: "Outbox delivery test.", idempotencyKey: `outbox-${id}`, pool });
    return { proposalId: id, memoryId: result.memory_id! };
  }

  it("drains pending outbox rows and emits canonical_memory_promoted events", async () => {
    const { memoryId } = await insertAndApprove();

    const result = await drainPromotionOutbox(pool, { maxBatch: 10, maxAttempts: 3 });
    expect(result.delivered).toBeGreaterThanOrEqual(1);

    const outbox = await pool.query("SELECT status, delivered_at FROM promotion_outbox WHERE group_id = $1 AND memory_id = $2", [GROUP_ID, memoryId]);
    expect(outbox.rows[0].status).toBe("delivered");
    expect(outbox.rows[0].delivered_at).toBeTruthy();

    const event = await pool.query("SELECT id,workspace_id FROM events WHERE group_id = $1 AND event_type = 'canonical_memory_promoted' AND metadata->>'memory_id' = $2", [GROUP_ID, memoryId]);
    expect(event.rows).toEqual([{ id: expect.anything(), workspace_id: WORKSPACE_ID }]);
  });

  it("does not alter the committed approval decision", async () => {
    const { proposalId, memoryId } = await insertAndApprove();
    await drainPromotionOutbox(pool);

    // The canonical memory and proposal decision remain unchanged
    const memory = await pool.query("SELECT deprecated FROM graph_memories WHERE id = $1 AND group_id = $2", [memoryId, GROUP_ID]);
    expect(memory.rows[0].deprecated).toBe(false);

    const proposal = await pool.query("SELECT status, decided_by FROM canonical_proposals WHERE id = $1", [proposalId]);
    expect(proposal.rows[0].status).toBe("approved");
  });
});
