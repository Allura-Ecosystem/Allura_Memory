import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrincipalContext } from "@/lib/auth/principal-context";
import { getPool } from "@/lib/postgres/connection";
import { approveProposal } from "../approve-proposal";

const GROUP_ID = "allura-atomic-promotion-e2e";
const principal = createPrincipalContext({
  principalId: "curator-atomic-e2e",
  tenantIds: [GROUP_ID],
  roles: ["curator"],
  scopes: ["review:approve"],
  authMethod: "service_identity",
  sessionId: "atomic-promotion-e2e",
});

const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip;

describeLive("Story 24.4 atomic approval (live PostgreSQL)", () => {
  const pool = getPool();
  const proposalIds: string[] = [];

  afterEach(async () => {
    if (proposalIds.length === 0) return;
    await pool.query("DELETE FROM promotion_outbox WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM graph_memories WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM canonical_proposals WHERE group_id = $1", [GROUP_ID]);
    proposalIds.length = 0;
  });

  async function insertPendingProposal(): Promise<string> {
    const id = randomUUID();
    proposalIds.push(id);
    await pool.query(
      `INSERT INTO canonical_proposals (id, group_id, content, score, reasoning, tier, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [id, GROUP_ID, "Atomic promotion must leave no partial state.", 0.91, "Story 24.4 E2E fixture", "mainstream"],
    );
    return id;
  }

  it("commits proposal decision, canonical memory, audit event, and projection outbox together", async () => {
    const proposalId = await insertPendingProposal();

    const result = await approveProposal({
      principal,
      proposalId,
      rationale: "Approved after curator review.",
      idempotencyKey: `atomic-${proposalId}`,
      pool,
    });

    expect(result.outcome).toBe("approved");
    expect(result.memoryId).toBeTruthy();

    const [proposal, memory, audit, outbox] = await Promise.all([
      pool.query("SELECT status, decided_by FROM canonical_proposals WHERE id = $1 AND group_id = $2", [proposalId, GROUP_ID]),
      pool.query("SELECT id, deprecated FROM graph_memories WHERE id = $1 AND group_id = $2", [result.memoryId, GROUP_ID]),
      pool.query("SELECT id FROM events WHERE group_id = $1 AND event_type = 'proposal_approved' AND metadata->>'proposal_id' = $2", [GROUP_ID, proposalId]),
      pool.query("SELECT id, status FROM promotion_outbox WHERE group_id = $1 AND proposal_id = $2", [GROUP_ID, proposalId]),
    ]);

    expect(proposal.rows).toEqual([{ status: "approved", decided_by: principal.principalId }]);
    expect(memory.rows).toEqual([{ id: result.memoryId, deprecated: false }]);
    expect(audit.rows).toHaveLength(1);
    expect(outbox.rows).toEqual([{ id: expect.any(String), status: "pending" }]);
  });

  it("rolls back every durable write at each injected boundary", async () => {
    for (const failAt of ["canonical", "proposal", "audit", "outbox", "idempotency"] as const) {
      const proposalId = await insertPendingProposal();
      await expect(approveProposal({
        principal,
        proposalId,
        rationale: "Rollback proof.",
        idempotencyKey: `rollback-${failAt}-${proposalId}`,
        pool,
        failAt,
      })).rejects.toMatchObject({ code: "FAILURE_INJECTED" });

      const [proposal, memories, audits, outbox, receipts] = await Promise.all([
        pool.query("SELECT status FROM canonical_proposals WHERE id = $1", [proposalId]),
        pool.query("SELECT id FROM graph_memories WHERE group_id = $1", [GROUP_ID]),
        pool.query("SELECT id FROM events WHERE group_id = $1 AND event_type = 'proposal_approved' AND metadata->>'proposal_id' = $2", [GROUP_ID, proposalId]),
        pool.query("SELECT id FROM promotion_outbox WHERE group_id = $1 AND proposal_id = $2", [GROUP_ID, proposalId]),
        pool.query("SELECT idempotency_key FROM promotion_idempotency WHERE group_id = $1 AND proposal_id = $2", [GROUP_ID, proposalId]),
      ]);
      expect(proposal.rows).toEqual([{ status: "pending" }]);
      expect(memories.rows).toHaveLength(0);
      expect(audits.rows).toHaveLength(0);
      expect(outbox.rows).toHaveLength(0);
      expect(receipts.rows).toHaveLength(0);
    }
  });

  it("replays the original result for one idempotency key without duplicate records", async () => {
    const proposalId = await insertPendingProposal();
    const key = `replay-${proposalId}`;
    const first = await approveProposal({ principal, proposalId, rationale: "Replay proof.", idempotencyKey: key, pool });
    const replay = await approveProposal({ principal, proposalId, rationale: "Ignored on replay.", idempotencyKey: key, pool });
    expect(replay).toMatchObject({ ...first, replayed: true });

    const [memories, audits, outbox] = await Promise.all([
      pool.query("SELECT id FROM graph_memories WHERE group_id = $1", [GROUP_ID]),
      pool.query("SELECT id FROM events WHERE group_id = $1 AND event_type = 'proposal_approved' AND metadata->>'proposal_id' = $2", [GROUP_ID, proposalId]),
      pool.query("SELECT id FROM promotion_outbox WHERE group_id = $1 AND proposal_id = $2", [GROUP_ID, proposalId]),
    ]);
    expect(memories.rows).toHaveLength(1);
    expect(audits.rows).toHaveLength(1);
    expect(outbox.rows).toHaveLength(1);
  });

  it("allows one concurrent approval and leaves no duplicate canonical result", async () => {
    const proposalId = await insertPendingProposal();
    const attempts = await Promise.allSettled([
      approveProposal({ principal, proposalId, rationale: "Concurrent approval A.", idempotencyKey: `concurrent-a-${proposalId}`, pool }),
      approveProposal({ principal, proposalId, rationale: "Concurrent approval B.", idempotencyKey: `concurrent-b-${proposalId}`, pool }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const canonical = await pool.query("SELECT id FROM graph_memories WHERE group_id = $1", [GROUP_ID]);
    expect(canonical.rows).toHaveLength(1);
  });
});
