import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrincipalContext } from "@/lib/auth/principal-context";
import { getPool } from "@/lib/postgres/connection";
import { approveProposal } from "../approve-proposal";

const GROUP_ID = "allura-atomic-promotion-roundtrip";
const WORKSPACE_ID = "workspace-atomic-promotion-roundtrip";
const principal = createPrincipalContext({
  principalId: "curator-roundtrip-e2e",
  tenantIds: [GROUP_ID],
  roles: ["curator"],
  scopes: ["review:approve"],
  authMethod: "service_identity",
  sessionId: "atomic-roundtrip-e2e",
});

const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip;

describeLive("Story 24.4 AC-10: approved-only retrieval round-trip", () => {
  const pool = getPool();
  const proposalIds: string[] = [];

  beforeAll(async () => {
    await pool.query(`INSERT INTO workspaces(workspace_id,group_id,name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id) DO NOTHING`, [WORKSPACE_ID, GROUP_ID, "Promotion roundtrip", principal.principalId]);
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
       VALUES($1,$2,'proposal_source','requester-roundtrip-e2e','completed','{}') RETURNING id`, [GROUP_ID, WORKSPACE_ID]);
    await pool.query(
      `INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, reasoning, tier, status, trace_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`,
      [id, GROUP_ID, WORKSPACE_ID, "Round-trip retrieval proves the promoted memory is searchable.", 0.91, "AC-10 fixture", "mainstream", source.rows[0]!.id],
    );
    return id;
  }

  it("retrieves the promoted memory by ID and via approved-only full-text search", async () => {
    const proposalId = await insertPendingProposal();
    const result = await approveProposal({
      principal,
      workspaceId: WORKSPACE_ID,
      proposalId,
      rationale: "Approved for round-trip retrieval proof.",
      idempotencyKey: `roundtrip-${proposalId}`,
      pool,
    });

    // AC-10: retrievable by ID
    const byId = await pool.query(
      "SELECT id, content, deprecated FROM graph_memories WHERE id = $1 AND group_id = $2",
      [result.memory_id, GROUP_ID],
    );
    expect(byId.rows).toHaveLength(1);
    expect(byId.rows[0].deprecated).toBe(false);
    expect(byId.rows[0].content).toContain("Round-trip retrieval");

    // AC-10: retrievable via approved-only full-text search (content_tsv)
    const fts = await pool.query(
      "SELECT id FROM graph_memories WHERE group_id = $1 AND deprecated = false AND content_tsv @@ plainto_tsquery('english', $2)",
      [GROUP_ID, "round-trip retrieval"],
    );
    expect(fts.rows.some((r) => r.id === result.memory_id)).toBe(true);
  });
});
