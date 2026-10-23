import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createPrincipalContext } from "@/lib/auth/principal-context";
import { approveProposal } from "./approve-proposal";

const principal = createPrincipalContext({
  principalId: "curator-reviewed-version",
  workspaceId: "workspace-reviewed-version",
  tenantIds: ["allura-reviewed-version"],
  roles: ["curator"],
  scopes: ["review:approve"],
  authMethod: "web_session",
  sessionId: "reviewed-version-test",
});

const receipt = {
  id: "receipt-1",
  group_id: "allura-reviewed-version",
  workspace_id: "workspace-reviewed-version",
  proposal_id: "proposal-1",
  proposal_version: "4",
  reviewed_proposal_version: "3",
  evidence_request_id: null,
  evidence_identity_hash: "a".repeat(64),
  action: "approve" as const,
  actor_id: principal.principalId,
  actor_role: "curator" as const,
  rationale: "Reviewed version 3",
  policy_reference: "policy://allura/curator-decision",
  policy_version: "25.2a/v1",
  memory_id: "memory-1",
  result_ref: null,
  outbox_state: "queued" as const,
  source_event_id: 41,
  witness_hash: "witness",
  evidence_references: ["event:41"],
  occurred_at: "2026-10-23T00:00:00.000Z",
  created_at: "2026-10-23T00:00:00.000Z",
};

function input(pool: Pool, expectedProposalVersion = "3") {
  return {
    principal,
    groupId: "allura-reviewed-version",
    workspaceId: "workspace-reviewed-version",
    proposalId: "proposal-1",
    expectedProposalVersion,
    rationale: "Reviewed version 3",
    idempotencyKey: "reviewed-version-key",
    pool,
  };
}

function proposal(version: string, status: "pending" | "approved" = "pending") {
  return {
    id: "proposal-1",
    group_id: "allura-reviewed-version",
    workspace_id: "workspace-reviewed-version",
    content: "Reviewed content",
    score: "0.9",
    tier: "mainstream",
    status,
    trace_ref: 41,
    approved_memory_id: status === "approved" ? "memory-1" : null,
    proposal_version: version,
  };
}

function mockPool(query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  const client = { query: vi.fn(query), release: vi.fn() };
  return { pool: { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool, client };
}

describe("approveProposal reviewed-version guard", () => {
  it("persists the human-reviewed version while returning the post-transition version", async () => {
    const storedReceipt = { ...receipt, proposal_version: "5", reviewed_proposal_version: "4" };
    const { pool, client } = mockPool(async (sql) => {
      if (sql.includes("FROM canonical_proposals")) return { rows: [proposal("4")] };
      if (sql.includes("FROM promotion_idempotency")) return { rows: [] };
      if (sql.includes("SELECT id, agent_id FROM events")) {
        return { rows: [{ id: 41, agent_id: "requester" }] };
      }
      if (sql.includes("FROM evidence_requests")) return { rows: [] };
      if (sql.includes("INSERT INTO graph_memories")) return { rows: [{ id: "memory-1" }] };
      if (sql.includes("UPDATE canonical_proposals")) return { rows: [{ proposal_version: "5" }] };
      if (sql.includes("INSERT INTO events")) return { rows: [{ id: 42 }] };
      if (sql.includes("INSERT INTO promotion_outbox")) return { rows: [{ id: "outbox-1" }] };
      if (sql.includes("INSERT INTO governance_receipts")) return { rows: [storedReceipt] };
      return { rows: [] };
    });

    await expect(approveProposal(input(pool, "4"))).resolves.toEqual(storedReceipt);
    const receiptInsert = client.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO governance_receipts"));
    expect(receiptInsert?.[1]?.[4]).toBe("4");
    expect(String(receiptInsert?.[0])).toContain("reviewed_proposal_version");
  });

  it("rejects a stale human-reviewed version before semantic or audit writes", async () => {
    const { pool, client } = mockPool(async (sql) => {
      if (sql.includes("FROM canonical_proposals")) return { rows: [proposal("4")] };
      if (sql.includes("FROM promotion_idempotency")) return { rows: [] };
      return { rows: [] };
    });

    await expect(approveProposal(input(pool))).rejects.toMatchObject({ code: "PROPOSAL_VERSION_CONFLICT" });

    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false);
    expect(statements).not.toEqual(expect.arrayContaining([expect.stringContaining("FROM events")]));
    expect(statements.at(-1)).toBe("ROLLBACK");
  });

  it("returns the original immutable receipt before comparing a now-stale reviewed version", async () => {
    const { pool, client } = mockPool(async (sql) => {
      if (sql.includes("FROM canonical_proposals")) return { rows: [proposal("4", "approved")] };
      if (sql.includes("FROM promotion_idempotency")) return { rows: [{ proposal_id: "proposal-1", result: receipt }] };
      return { rows: [] };
    });

    await expect(approveProposal(input(pool, "3"))).resolves.toEqual(receipt);
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.some((sql) => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false);
  });

  it("projects a historical replay with no reviewed version as explicit null without mutating stored JSON", async () => {
    const historical = { ...receipt } as Record<string, unknown>;
    delete historical.reviewed_proposal_version;
    const { pool } = mockPool(async (sql) => {
      if (sql.includes("FROM canonical_proposals")) return { rows: [proposal("4", "approved")] };
      if (sql.includes("FROM promotion_idempotency")) return { rows: [{ proposal_id: "proposal-1", result: historical }] };
      return { rows: [] };
    });

    await expect(approveProposal(input(pool, "3"))).resolves.toMatchObject({ reviewed_proposal_version: null });
    expect(historical).not.toHaveProperty("reviewed_proposal_version");
  });

  it("rejects replay when the stored receipt belongs to another or missing actor", async () => {
    for (const stored of [{ ...receipt, actor_id: "another-curator" }, { ...receipt, actor_id: undefined }]) {
      const { pool } = mockPool(async (sql) => {
        if (sql.includes("FROM canonical_proposals")) return { rows: [proposal("4", "approved")] };
        if (sql.includes("FROM promotion_idempotency")) return { rows: [{ proposal_id: "proposal-1", result: stored }] };
        return { rows: [] };
      });
      await expect(approveProposal(input(pool, "3"))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    }
  });

  it("rejects known nonhuman principals before opening a database connection", async () => {
    for (const authMethod of ["service_identity", "dev_local"] as const) {
      const connect = vi.fn();
      await expect(approveProposal({
        ...input({ connect } as unknown as Pool),
        principal: createPrincipalContext({ ...principal, authMethod, sessionId: `nonhuman-${authMethod}` }),
      })).rejects.toMatchObject({ reasonCode: "ROLE_INSUFFICIENT" });
      expect(connect).not.toHaveBeenCalled();
    }
  });
});
