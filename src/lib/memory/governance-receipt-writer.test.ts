import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { writeGovernanceReceipt } from "./governance-receipt-writer";

const scope = { tenantId: "allura-system", workspaceId: "workspace-a", principalId: "curator-server" };
const principal = { actorId: "curator-server", role: "curator" as const };
const base = {
  proposalId: "proposal-1", action: "reject" as const, rationale: "Insufficient evidence",
  policyReference: "policy://curation", policyVersion: "v2", proposalVersion: "3",
};

function db(options: { source?: boolean; evidence?: string[]; replayFinalized?: boolean } = {}) {
  const evidence = options.evidence ?? [];
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("FROM canonical_proposals")) return { rows: [{ id: "proposal-1", proposal_version: "3", approved_memory_id: null, trace_ref: "41", witness_hash: "witness" }] };
    if (sql.includes("FROM events")) return { rows: options.source === false ? [] : [{ id: "41" }] };
    if (sql.includes("FROM evidence_requests")) return { rows: evidence.map((id) => ({ id })) };
    if (sql.includes("INSERT INTO governance_receipts")) return { rows: [{ id: "receipt-1", action: "reject", source_event_id: "41", evidence_request_id: evidence[0] ?? null, evidence_membership_finalized: options.replayFinalized ?? false }] };
    return { rows: [] };
  });
  return { query };
}

describe("governed receipt writer", () => {
  it("persists exact same-scope source_event_id and stable evidence identity", async () => {
    const database = db({ evidence: ["00000000-0000-4000-8000-000000000001"] });
    await writeGovernanceReceipt(scope, principal, { ...base, evidenceRequestIds: ["00000000-0000-4000-8000-000000000001"] }, database as never);
    const insert = database.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO governance_receipts"))!;
    const canonical = JSON.stringify(["event:41", "evidence-request:00000000-0000-4000-8000-000000000001"]);
    expect(insert[0]).toContain("source_event_id");
    expect(insert[1]).toContain("41");
    expect(insert[1]).toContain(canonical);
    expect(insert[1]).toContain(createHash("sha256").update(canonical).digest("hex"));
  });

  it("allows normal reject without an evidence-request lifecycle row", async () => {
    const database = db();
    await expect(writeGovernanceReceipt(scope, principal, base, database as never)).resolves.toMatchObject({ evidence_request_id: null });
    expect(database.query.mock.calls.some(([sql]) => String(sql).includes("FROM evidence_requests"))).toBe(false);
  });

  it("rejects nonexistent or cross-workspace trace evidence", async () => {
    await expect(writeGovernanceReceipt(scope, principal, base, db({ source: false }) as never)).rejects.toThrow(/missing or outside workspace/i);
  });

  it("requires scoped evidence-request identity for request_evidence", async () => {
    await expect(writeGovernanceReceipt(scope, principal, { ...base, action: "request_evidence", evidenceRequestIds: [] }, db() as never)).rejects.toThrow(/requires its durable evidence request/i);
    await expect(writeGovernanceReceipt(scope, principal, { ...base, action: "request_evidence", evidenceRequestIds: ["00000000-0000-4000-8000-000000000001"] }, db({ evidence: [] }) as never)).rejects.toThrow(/outside proposal scope/i);
  });

  it("fails closed when actor or role is not server-authoritative", async () => {
    await expect(writeGovernanceReceipt(scope, { actorId: "spoofed", role: "curator" }, base, db() as never)).rejects.toThrow(/authenticated workspace principal/i);
    await expect(writeGovernanceReceipt(scope, { actorId: scope.principalId, role: "viewer" }, base, db() as never)).rejects.toThrow(/curator or admin authority/i);
  });

  it("returns a replayed finalized receipt without finalizing evidence twice", async () => {
    const evidenceId = "00000000-0000-4000-8000-000000000001";
    const database = db({ evidence: [evidenceId], replayFinalized: true });
    await expect(writeGovernanceReceipt(scope, principal, { ...base, action: "request_evidence", evidenceRequestIds: [evidenceId] }, database as never))
      .resolves.toMatchObject({ id: "receipt-1" });
    expect(database.query.mock.calls.filter(([sql]) => String(sql).includes("finalize_governance_receipt_evidence"))).toHaveLength(0);
  });
});
