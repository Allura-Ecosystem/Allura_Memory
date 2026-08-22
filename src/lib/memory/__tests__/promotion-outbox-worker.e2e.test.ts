import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrincipalContext } from "@/lib/auth/principal-context";
import { getPool } from "@/lib/postgres/connection";
import { approveProposal } from "../approve-proposal";
import { drainPromotionOutbox } from "../promotion-outbox-worker";

const GROUP_ID = "allura-atomic-outbox-worker";
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

  afterEach(async () => {
    await pool.query("DELETE FROM promotion_outbox WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM graph_memories WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM canonical_proposals WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM events WHERE group_id = $1 AND event_type = 'canonical_memory_promoted'", [GROUP_ID]);
    proposalIds.length = 0;
  });

  async function insertAndApprove(): Promise<{ proposalId: string; memoryId: string }> {
    const id = randomUUID();
    proposalIds.push(id);
    await pool.query(
      `INSERT INTO canonical_proposals (id, group_id, content, score, reasoning, tier, status)
       VALUES ($1, $2, $3, 0.91, 'outbox test', 'mainstream', 'pending')`,
      [id, GROUP_ID, "Outbox worker delivers projection event after commit."],
    );
    const result = await approveProposal({ principal, proposalId: id, rationale: "Outbox delivery test.", idempotencyKey: `outbox-${id}`, pool });
    return { proposalId: id, memoryId: result.memoryId };
  }

  it("drains pending outbox rows and emits canonical_memory_promoted events", async () => {
    const { memoryId } = await insertAndApprove();

    const result = await drainPromotionOutbox(pool, { maxBatch: 10, maxAttempts: 3 });
    expect(result.delivered).toBeGreaterThanOrEqual(1);

    const outbox = await pool.query("SELECT status, delivered_at FROM promotion_outbox WHERE group_id = $1 AND memory_id = $2", [GROUP_ID, memoryId]);
    expect(outbox.rows[0].status).toBe("delivered");
    expect(outbox.rows[0].delivered_at).toBeTruthy();

    const event = await pool.query("SELECT id FROM events WHERE group_id = $1 AND event_type = 'canonical_memory_promoted' AND metadata->>'memory_id' = $2", [GROUP_ID, memoryId]);
    expect(event.rows).toHaveLength(1);
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