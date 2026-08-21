import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPrincipalContext } from "@/lib/auth/principal-context";
import { getPool } from "@/lib/postgres/connection";
import { approveProposal } from "../approve-proposal";

const GROUP_ID = "allura-atomic-promotion-roundtrip";
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
      [id, GROUP_ID, "Round-trip retrieval proves the promoted memory is searchable.", 0.91, "AC-10 fixture", "mainstream"],
    );
    return id;
  }

  it("retrieves the promoted memory by ID and via approved-only full-text search", async () => {
    const proposalId = await insertPendingProposal();
    const result = await approveProposal({
      principal,
      proposalId,
      rationale: "Approved for round-trip retrieval proof.",
      idempotencyKey: `roundtrip-${proposalId}`,
      pool,
    });

    // AC-10: retrievable by ID
    const byId = await pool.query(
      "SELECT id, content, deprecated FROM graph_memories WHERE id = $1 AND group_id = $2",
      [result.memoryId, GROUP_ID],
    );
    expect(byId.rows).toHaveLength(1);
    expect(byId.rows[0].deprecated).toBe(false);
    expect(byId.rows[0].content).toContain("Round-trip retrieval");

    // AC-10: retrievable via approved-only full-text search (content_tsv)
    const fts = await pool.query(
      "SELECT id FROM graph_memories WHERE group_id = $1 AND deprecated = false AND content_tsv @@ plainto_tsquery('english', $2)",
      [GROUP_ID, "round-trip retrieval"],
    );
    expect(fts.rows.some((r) => r.id === result.memoryId)).toBe(true);
  });
});