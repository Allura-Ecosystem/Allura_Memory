import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { PrincipalContext } from "@/lib/auth/principal-context";
import { approveProposal, type GovernanceReceipt, type PromotionFailurePoint } from "./approve-proposal";

const groupId = "allura-system";
const workspaceId = "00000000-0000-4000-8000-000000000001";
const proposalId = "00000000-0000-4000-8000-000000000002";
const evidenceId = "00000000-0000-4000-8000-000000000003";
const principal: PrincipalContext = {
  principalId: "independent-reviewer", workspaceId, tenantIds: [groupId],
  roles: ["curator"], scopes: ["review:approve"], authMethod: "web_session", sessionId: "offline-test",
};
const proposal = {
  id: proposalId, group_id: groupId, workspace_id: workspaceId, content: "Reviewed evidence",
  score: "0.9", tier: "high", status: "pending", trace_ref: "41",
  approved_memory_id: null, proposal_version: "3",
};
const receipt: GovernanceReceipt = {
  id: "00000000-0000-4000-8000-000000000004", group_id: groupId, workspace_id: workspaceId,
  proposal_id: proposalId, proposal_version: "4", evidence_request_id: null,
  evidence_identity_hash: "persisted-evidence-hash", action: "approve",
  actor_id: principal.principalId, actor_role: "curator", rationale: "Evidence checked",
  policy_reference: "policy://allura/curator-decision", policy_version: "25.2a/v1",
  memory_id: "00000000-0000-4000-8000-000000000005", result_ref: null, outbox_state: "queued",
  source_event_id: "41", witness_hash: "persisted-witness", evidence_references: ["event:41"],
  occurred_at: "2026-10-22T00:00:00Z", created_at: "2026-10-22T00:00:00Z",
};

type FixtureOptions = {
  proposal?: Partial<Omit<typeof proposal, "trace_ref">> & { trace_ref?: string | null };
  proposalMissing?: boolean;
  source?: { id: string; agent_id: string | null } | null;
  replay?: { proposal_id: string; result: unknown };
  evidence?: { id: string }[];
  transitionMissing?: boolean;
  receiptError?: Error;
};

// Canned responses only: this double neither executes SQL nor simulates RLS,
// triggers, persistence, or transaction isolation. The service under test is real.
function database(options: FixtureOptions = {}) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("FROM canonical_proposals")) return { rows: options.proposalMissing ? [] : [{ ...proposal, ...options.proposal }] };
    if (sql.includes("FROM promotion_idempotency")) return { rows: options.replay ? [options.replay] : [] };
    if (sql.includes("FROM events")) return { rows: options.source === null ? [] : [options.source ?? { id: "41", agent_id: "requester" }] };
    if (sql.includes("FROM evidence_requests")) return { rows: options.evidence ?? [] };
    if (sql.includes("UPDATE canonical_proposals")) return { rows: options.transitionMissing ? [] : [{ proposal_version: "4" }] };
    if (sql.includes("INSERT INTO governance_receipts")) {
      if (options.receiptError) throw options.receiptError;
      return { rows: [receipt] };
    }
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) || sql.startsWith("SET LOCAL ") ||
        /INSERT INTO (graph_memories|promotion_outbox|promotion_idempotency)/.test(sql) ||
        sql.includes("SELECT app.finalize_governance_receipt_evidence")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const pool = { connect } as unknown as Pool;
  return { query, release, connect, pool };
}

function input(db: ReturnType<typeof database>) {
  return { principal, groupId, workspaceId, proposalId, rationale: "Evidence checked", idempotencyKey: "approval-1", pool: db.pool };
}

function call(db: ReturnType<typeof database>, fragment: string) {
  const matches = db.query.mock.calls.filter(([sql]) => sql.includes(fragment));
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function expectRollback(db: ReturnType<typeof database>) {
  expect(db.query.mock.calls[0]).toEqual(["BEGIN"]);
  expect(db.query).toHaveBeenCalledWith("ROLLBACK");
  expect(db.query).not.toHaveBeenCalledWith("COMMIT");
  expect(db.release).toHaveBeenCalledTimes(1);
}

function expectNoWrites(db: ReturnType<typeof database>) {
  expect(db.query.mock.calls.filter(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toEqual([]);
  expect(db.query.mock.calls.some(([sql]) => sql.includes("finalize_governance_receipt_evidence"))).toBe(false);
}

describe("approveProposal (offline production service)", () => {
  it("returns the persisted receipt after independent authorized approval and scoped writes", async () => {
    const db = database();
    await expect(approveProposal(input(db))).resolves.toBe(receipt);
    expect(db.query.mock.calls[0]).toEqual(["BEGIN"]);

    expect(call(db, "FROM canonical_proposals")[1]).toEqual([proposalId, workspaceId, groupId]);
    expect(call(db, "FROM promotion_idempotency")[1]).toEqual([groupId, workspaceId, "approval-1"]);
    expect(call(db, "FROM events")[1]).toEqual(["41", groupId, workspaceId]);
    expect(call(db, "FROM events")[0]).toContain("id=$1 AND group_id=$2 AND workspace_id=$3");
    expect(db.query).toHaveBeenCalledWith(`SET LOCAL app.current_workspace_id = '${workspaceId}'`);
    expect(db.query).toHaveBeenCalledWith(`SET LOCAL app.current_principal = '${principal.principalId}'`);
    expect(db.query).toHaveBeenCalledWith(`SET LOCAL app.current_group_id = '${groupId}'`);
    expect(db.query).toHaveBeenCalledWith(`SET LOCAL app.current_tenant = '${groupId}'`);

    const memoryParams = call(db, "INSERT INTO graph_memories")[1]!;
    expect(memoryParams.slice(1)).toEqual([groupId, workspaceId, principal.principalId, proposal.content, 0.9]);
    const transition = call(db, "UPDATE canonical_proposals");
    expect(transition[0]).toContain("proposal_version=$9 AND status='pending'");
    expect(transition[1]!.slice(5)).toEqual([proposalId, groupId, workspaceId, "3"]);
    const outbox = call(db, "INSERT INTO promotion_outbox")[1]!;
    expect(outbox.slice(0, 4)).toEqual([groupId, workspaceId, proposalId, memoryParams[0]]);
    expect(JSON.parse(String(outbox[4]))).toEqual({ proposal_id: proposalId, memory_id: memoryParams[0], group_id: groupId, workspace_id: workspaceId });
    const receiptParams = call(db, "INSERT INTO governance_receipts")[1]!;
    expect(receiptParams.slice(0, 4)).toEqual([groupId, workspaceId, proposalId, "4"]);
    expect(receiptParams.slice(6, 9)).toEqual([principal.principalId, "curator", "Evidence checked"]);
    expect(receiptParams[11]).toBe(memoryParams[0]);
    expect(receiptParams[12]).toBe("41");
    expect(call(db, "finalize_governance_receipt_evidence")[1]).toEqual([receipt.id, []]);
    expect(call(db, "INSERT INTO promotion_idempotency")[1]).toEqual([groupId, workspaceId, "approval-1", proposalId, JSON.stringify(receipt)]);
    expect(db.query.mock.calls.at(-1)).toEqual(["COMMIT"]);
    expect(db.query).not.toHaveBeenCalledWith("ROLLBACK");
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "viewer", change: { roles: ["viewer"] }, reasonCode: "ROLE_INSUFFICIENT" },
    { label: "missing approval scope", change: { scopes: [] }, reasonCode: "ROLE_INSUFFICIENT" },
    { label: "foreign tenant", change: { tenantIds: ["allura-other"] }, reasonCode: "TENANT_MISMATCH" },
  ] satisfies { label: string; change: Partial<PrincipalContext>; reasonCode: string }[])("denies $label without durable writes", async ({ change, reasonCode }) => {
    const db = database();
    await expect(approveProposal({ ...input(db), principal: { ...principal, ...change } })).rejects.toMatchObject({ reasonCode });
    expectNoWrites(db);
    expectRollback(db);
  });

  it.each([
    { label: "requester self-approval", agent_id: principal.principalId },
    { label: "missing requester provenance", agent_id: null },
  ])("denies $label", async ({ agent_id }) => {
    const db = database({ source: { id: "41", agent_id } });
    await expect(approveProposal(input(db))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expectNoWrites(db);
    expectRollback(db);
  });

  it("rejects missing or foreign source evidence when the scoped lookup returns no row", async () => {
    const db = database({ source: null });
    await expect(approveProposal(input(db))).rejects.toMatchObject({ code: "INVALID_EVIDENCE" });
    const source = call(db, "FROM events");
    expect(source[0]).toContain("id=$1 AND group_id=$2 AND workspace_id=$3");
    expect(source[1]).toEqual(["41", groupId, workspaceId]);
    expectNoWrites(db);
    expectRollback(db);
  });

  it.each([
    { label: "missing proposal", options: { proposalMissing: true }, code: "NOT_FOUND" },
    { label: "foreign proposal", options: { proposal: { group_id: "allura-other" } }, code: "NOT_FOUND" },
    { label: "missing trace reference", options: { proposal: { trace_ref: null } }, code: "INVALID_EVIDENCE" },
    { label: "already rejected proposal", options: { proposal: { status: "rejected" } }, code: "ALREADY_DECIDED" },
  ] satisfies { label: string; options: FixtureOptions; code: string }[])("rejects $label before writes", async ({ options, code }) => {
    const db = database(options);
    await expect(approveProposal(input(db))).rejects.toMatchObject({ code });
    expectNoWrites(db);
    expectRollback(db);
  });

  it("rejects evidence-request IDs missing from the exact proposal scope", async () => {
    const db = database();
    await expect(approveProposal({ ...input(db), evidenceRequestIds: [evidenceId] })).rejects.toMatchObject({ code: "INVALID_EVIDENCE" });
    const evidence = call(db, "FROM evidence_requests");
    expect(evidence[0]).toContain("group_id=$1 AND workspace_id=$2 AND proposal_id=$3");
    expect(evidence[1]).toEqual([groupId, workspaceId, proposalId, [evidenceId]]);
    expectNoWrites(db);
    expectRollback(db);
  });

  it("deduplicates evidence requests and binds the receipt to their verified membership", async () => {
    const db = database({ evidence: [{ id: evidenceId }] });
    await approveProposal({ ...input(db), evidenceRequestIds: [evidenceId, ` ${evidenceId} `, ""] });
    expect(call(db, "FROM evidence_requests")[1]).toEqual([groupId, workspaceId, proposalId, [evidenceId]]);
    const params = call(db, "INSERT INTO governance_receipts")[1]!;
    expect(params[5]).toBe(evidenceId);
    expect(JSON.parse(String(params[14]))).toEqual(["event:41", `evidence-request:${evidenceId}`]);
    expect(call(db, "finalize_governance_receipt_evidence")[1]).toEqual([receipt.id, [evidenceId]]);
  });

  it("conflicts when the replay key belongs to another proposal", async () => {
    const db = database({ replay: { proposal_id: "other-proposal", result: receipt } });
    await expect(approveProposal(input(db))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expectNoWrites(db);
    expectRollback(db);
  });

  it("returns the original receipt for an approved proposal replay without another durable write", async () => {
    const db = database({ proposal: { status: "approved" }, replay: { proposal_id: proposalId, result: receipt } });
    await expect(approveProposal(input(db))).resolves.toBe(receipt);
    expect(db.query.mock.calls[0]).toEqual(["BEGIN"]);
    expect(call(db, "FROM promotion_idempotency")[1]).toEqual([groupId, workspaceId, "approval-1"]);
    expectNoWrites(db);
    expect(db.query.mock.calls.at(-1)).toEqual(["COMMIT"]);
    expect(db.query).not.toHaveBeenCalledWith("ROLLBACK");
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and releases the client when receipt insertion fails", async () => {
    const receiptError = new Error("receipt insert failed");
    const db = database({ receiptError });
    await expect(approveProposal(input(db))).rejects.toBe(receiptError);
    call(db, "INSERT INTO governance_receipts");
    expect(db.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO promotion_idempotency"))).toBe(false);
    expectRollback(db);
  });

  it("rolls back when the guarded proposal transition returns no row", async () => {
    const db = database({ transitionMissing: true });
    await expect(approveProposal(input(db))).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
    expect(db.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO promotion_outbox"))).toBe(false);
    expectRollback(db);
  });

  it.each([
    { failAt: "canonical", reached: "INSERT INTO graph_memories", absent: "UPDATE canonical_proposals" },
    { failAt: "proposal", reached: "UPDATE canonical_proposals", absent: "INSERT INTO promotion_outbox" },
    // The audit hook follows the transition; the real trigger is not exercised here.
    { failAt: "audit", reached: "UPDATE canonical_proposals", absent: "INSERT INTO promotion_outbox" },
    { failAt: "outbox", reached: "INSERT INTO promotion_outbox", absent: "INSERT INTO governance_receipts" },
    { failAt: "receipt", reached: "finalize_governance_receipt_evidence", absent: "INSERT INTO promotion_idempotency" },
    { failAt: "idempotency", reached: "INSERT INTO promotion_idempotency", absent: "COMMIT" },
  ] satisfies { failAt: PromotionFailurePoint; reached: string; absent: string }[])("rolls back and releases after the $failAt failure hook", async ({ failAt, reached, absent }) => {
    const db = database();
    await expect(approveProposal({ ...input(db), failAt })).rejects.toMatchObject({
      code: "FAILURE_INJECTED", message: `Injected failure after ${failAt} write`,
    });
    call(db, reached);
    expect(db.query.mock.calls.some(([sql]) => sql.includes(absent))).toBe(false);
    expectRollback(db);
  });
});
