import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrincipalContext } from "@/lib/auth/principal-context";
import { getAppPool, getPool } from "@/lib/postgres/connection";
import { withTenantTransaction } from "@/lib/db/tenant-transaction";
import { approveProposal } from "../approve-proposal";

const GROUP_ID = "allura-atomic-promotion-e2e";
const WORKSPACE_ID = "workspace-atomic-promotion-e2e";
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

  beforeAll(async () => {
    await pool.query(`INSERT INTO workspaces(workspace_id,group_id,name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id) DO NOTHING`, [WORKSPACE_ID, GROUP_ID, "Atomic promotion", principal.principalId]);
  });


  afterEach(async () => {
    if (proposalIds.length === 0) return;
    await pool.query("BEGIN");
    await pool.query("SET LOCAL session_replication_role='replica'");
    await pool.query("DELETE FROM governance_receipts WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM promotion_idempotency WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM promotion_outbox WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM graph_memories WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM canonical_proposals WHERE group_id = $1", [GROUP_ID]);
    await pool.query("DELETE FROM events WHERE group_id = $1", [GROUP_ID]);
    await pool.query("COMMIT");
    proposalIds.length = 0;
  });

  async function insertPendingProposal(): Promise<string> {
    const id = randomUUID();
    proposalIds.push(id);
    const source = await pool.query<{ id: number }>(
      `INSERT INTO events(group_id,workspace_id,event_type,agent_id,status,metadata)
       VALUES($1,$2,'proposal_source','requester-atomic-e2e','completed','{}') RETURNING id`,
      [GROUP_ID, WORKSPACE_ID],
    );
    await pool.query(
      `INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, reasoning, tier, status, trace_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`,
      [id, GROUP_ID, WORKSPACE_ID, "Atomic promotion must leave no partial state.", 0.91, "Story 24.4 E2E fixture", "mainstream", source.rows[0]!.id],
    );
    return id;
  }

  it("commits proposal decision, canonical memory, audit event, and projection outbox together", async () => {
    const proposalId = await insertPendingProposal();

    const result = await approveProposal({
      principal,
      workspaceId: WORKSPACE_ID,
      proposalId,
      rationale: "Approved after curator review.",
      idempotencyKey: `atomic-${proposalId}`,
      pool,
    });

    expect(result.action).toBe("approve");
    expect(result.memory_id).toBeTruthy();
    expect(result.source_event_id).toBeTruthy();

    const [proposal, memory, audit, outbox, receipts] = await Promise.all([
      pool.query("SELECT status, decided_by FROM canonical_proposals WHERE id = $1 AND group_id = $2", [proposalId, GROUP_ID]),
      pool.query("SELECT id, deprecated FROM graph_memories WHERE id = $1 AND group_id = $2", [result.memory_id, GROUP_ID]),
      pool.query("SELECT id FROM events WHERE group_id = $1 AND event_type = 'proposal_approved' AND metadata->>'proposal_id' = $2", [GROUP_ID, proposalId]),
      pool.query("SELECT id, status FROM promotion_outbox WHERE group_id = $1 AND proposal_id = $2", [GROUP_ID, proposalId]),
      pool.query("SELECT action, source_event_id, memory_id FROM governance_receipts WHERE group_id=$1 AND workspace_id=$2 AND proposal_id=$3", [GROUP_ID, WORKSPACE_ID, proposalId]),
    ]);

    expect(proposal.rows).toEqual([{ status: "approved", decided_by: principal.principalId }]);
    expect(memory.rows).toEqual([{ id: result.memory_id, deprecated: false }]);
    expect(audit.rows).toHaveLength(1);
    expect(outbox.rows).toEqual([{ id: expect.any(String), status: expect.stringMatching(/^(pending|delivered)$/) }]);
    expect(receipts.rows).toEqual([{ action: "approve", source_event_id: result.source_event_id, memory_id: result.memory_id }]);
  });

  it("rolls back every durable write at each injected boundary", async () => {
    for (const failAt of ["canonical", "proposal", "audit", "outbox", "idempotency"] as const) {
      const proposalId = await insertPendingProposal();
      await expect(approveProposal({
        principal,
        workspaceId: WORKSPACE_ID,
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
    const first = await approveProposal({ principal, workspaceId: WORKSPACE_ID, proposalId, rationale: "Replay proof.", idempotencyKey: key, pool });
    const replay = await approveProposal({ principal, workspaceId: WORKSPACE_ID, proposalId, rationale: "Ignored on replay.", idempotencyKey: key, pool });
    expect(replay).toEqual(JSON.parse(JSON.stringify(first)));

    const [memories, audits, outbox] = await Promise.all([
      pool.query("SELECT id FROM graph_memories WHERE group_id = $1", [GROUP_ID]),
      pool.query("SELECT id FROM events WHERE group_id = $1 AND event_type = 'proposal_approved' AND metadata->>'proposal_id' = $2", [GROUP_ID, proposalId]),
      pool.query("SELECT id FROM promotion_outbox WHERE group_id = $1 AND proposal_id = $2", [GROUP_ID, proposalId]),
    ]);
    expect(memories.rows).toHaveLength(1);
    expect(audits.rows).toHaveLength(1);
    expect(outbox.rows).toHaveLength(1);
  });

  it("rejects reuse of one idempotency key for a different proposal", async () => {
    const firstProposalId = await insertPendingProposal();
    const secondProposalId = await insertPendingProposal();
    const key = `proposal-bound-${randomUUID()}`;
    await approveProposal({ principal, workspaceId: WORKSPACE_ID, proposalId: firstProposalId, rationale: "First proposal.", idempotencyKey: key, pool });
    await expect(approveProposal({ principal, workspaceId: WORKSPACE_ID, proposalId: secondProposalId, rationale: "Second proposal.", idempotencyKey: key, pool }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("maps a concurrent cross-proposal unique race to deterministic IDEMPOTENCY_CONFLICT", async () => {
    const ids = [await insertPendingProposal(), await insertPendingProposal()];
    const key = `concurrent-cross-proposal-${randomUUID()}`;
    const attempts = await Promise.allSettled(ids.map((proposalId) => approveProposal({
      principal, groupId: GROUP_ID, workspaceId: WORKSPACE_ID, proposalId,
      rationale: "Concurrent proposal-bound key proof.", idempotencyKey: key, pool,
    })));
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("persists every evidence request in canonical order with FK and delete safety", async () => {
    const proposalId = await insertPendingProposal();
    const evidenceIds = [randomUUID(), randomUUID()];
    for (const id of evidenceIds) {
      await pool.query(
        `INSERT INTO evidence_requests(id,group_id,workspace_id,proposal_id,requested_by,reason)
         VALUES($1,$2,$3,$4,'requester-atomic-e2e','multi-evidence proof')`,
        [id, GROUP_ID, WORKSPACE_ID, proposalId],
      );
    }
    const receipt = await approveProposal({
      principal, workspaceId: WORKSPACE_ID, proposalId, rationale: "All evidence reviewed.",
      idempotencyKey: `multi-evidence-${proposalId}`, evidenceRequestIds: [...evidenceIds].reverse(), pool,
    });
    const links = await pool.query(
      `SELECT evidence_request_id, ordinal FROM governance_receipt_evidence_requests
       WHERE receipt_id=$1 ORDER BY ordinal`, [receipt.id],
    );
    expect(links.rows).toEqual([...evidenceIds].sort().map((evidence_request_id, ordinal) => ({ evidence_request_id, ordinal })));
    await expect(withTenantTransaction(
      { tenantId: GROUP_ID, workspaceId: WORKSPACE_ID, principalId: principal.principalId },
      (db) => db.query(
        `INSERT INTO governance_receipt_evidence_requests(receipt_id,group_id,workspace_id,proposal_id,evidence_request_id,ordinal)
         VALUES($1,$2,$3,$4,$5,99)`,
        [receipt.id, GROUP_ID, WORKSPACE_ID, proposalId, evidenceIds[0]],
      ), getAppPool(),
    )).rejects.toThrow(/permission denied|duplicate key|immutable/i);
    await expect(pool.query("DELETE FROM evidence_requests WHERE id=$1", [evidenceIds[1]]))
      .rejects.toThrow(/governance_receipt_evidence_requests|governance_receipts_evidence_scope_fkey/);
  });

  it("allows one concurrent approval and leaves no duplicate canonical result", async () => {
    const proposalId = await insertPendingProposal();
    const attempts = await Promise.allSettled([
      approveProposal({ principal, workspaceId: WORKSPACE_ID, proposalId, rationale: "Concurrent approval A.", idempotencyKey: `concurrent-a-${proposalId}`, pool }),
      approveProposal({ principal, workspaceId: WORKSPACE_ID, proposalId, rationale: "Concurrent approval B.", idempotencyKey: `concurrent-b-${proposalId}`, pool }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const canonical = await pool.query("SELECT id FROM graph_memories WHERE group_id = $1", [GROUP_ID]);
    expect(canonical.rows).toHaveLength(1);
  });
});
