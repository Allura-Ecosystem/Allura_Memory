/** @vitest-environment node */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, approveProposalMock, writeReceiptMock, appPool } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  approveProposalMock: vi.fn(),
  writeReceiptMock: vi.fn(),
  appPool: { connect: vi.fn() },
}));

vi.mock("@/lib/auth/api-auth", () => ({
  requireRole: vi.fn(() => ({ user: { id: "curator-1", role: "curator", groupId: "allura-test", workspaceId: "workspace-test", sessionId: "session-1" }, allowed: true })),
  unauthorizedResponse: vi.fn(), forbiddenResponse: vi.fn(),
}));
vi.mock("@/lib/postgres/connection", () => ({ getAppPool: vi.fn(() => appPool) }));
vi.mock("@/lib/db/tenant-transaction", () => ({
  withWorkspaceTransaction: vi.fn((_scope: unknown, action: (client: { query: typeof queryMock }) => Promise<unknown>) => action({ query: queryMock })),
}));
vi.mock("@/lib/memory/approve-proposal", async () => {
  const actual = await vi.importActual<typeof import("@/lib/memory/approve-proposal")>("@/lib/memory/approve-proposal");
  return { ...actual, approveProposal: approveProposalMock };
});
vi.mock("@/lib/memory/governance-receipt-writer", () => ({ writeGovernanceReceipt: writeReceiptMock }));
vi.mock("@/lib/observability/sentry", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/curator/approve/route";

const persistedReceipt = {
  id: "receipt-1", group_id: "allura-test", workspace_id: "workspace-test", proposal_id: "proposal-1",
  proposal_version: "2", evidence_request_id: null, evidence_identity_hash: "a".repeat(64), action: "approve",
  actor_id: "curator-1", actor_role: "curator", rationale: "Approved", policy_reference: "policy://allura/curator-decision",
  policy_version: "25.2a/v1", memory_id: "memory-1", result_ref: null, outbox_state: "queued", source_event_id: 41,
  witness_hash: "witness", evidence_references: ["event:41"], occurred_at: "2026-08-25T16:00:00Z", created_at: "2026-08-25T16:00:00Z",
};

function request(decision: string, extra: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/curator/approve", {
    method: "POST", headers: { "idempotency-key": "http-replay-key" },
    body: JSON.stringify({ proposal_id: "proposal-1", group_id: "allura-test", decision, rationale: "Approved", ...extra }),
  });
}

beforeEach(() => {
  queryMock.mockReset(); approveProposalMock.mockReset(); writeReceiptMock.mockReset();
  approveProposalMock.mockResolvedValue(persistedReceipt);
  writeReceiptMock.mockResolvedValue({ ...persistedReceipt, action: "reject", memory_id: null, outbox_state: "not_applicable" });
});

describe("curator decision route", () => {
  it("validates auth input then delegates approval to the canonical transaction", async () => {
    const response = await POST(request("approve", { curator_id: "spoofed" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(persistedReceipt);
    expect(approveProposalMock).toHaveBeenCalledOnce();
    expect(approveProposalMock).toHaveBeenCalledWith(expect.objectContaining({
      groupId: "allura-test", workspaceId: "workspace-test", proposalId: "proposal-1",
      rationale: "Approved", idempotencyKey: "http-replay-key", pool: appPool,
      principal: expect.objectContaining({ principalId: "curator-1", tenantIds: ["allura-test"] }),
    }));
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns only the persisted GovernanceReceipt without legacy aliases", async () => {
    const body = await (await POST(request("approve"))).json();
    expect(body).toEqual(persistedReceipt);
    for (const alias of ["success", "receipt", "decision", "actor", "decided_at", "promoted_memory_id", "queued_memory_id", "promotion_sync", "notion_sync"]) {
      expect(body).not.toHaveProperty(alias);
    }
  });

  it("validates required HTTP fields before invoking authority", async () => {
    const response = await POST(new NextRequest("http://localhost/api/curator/approve", {
      method: "POST", body: JSON.stringify({ proposal_id: "proposal-1", group_id: "allura-test", decision: "approve" }),
    }));
    expect(response.status).toBe(400);
    expect(approveProposalMock).not.toHaveBeenCalled();
  });

  it("keeps reject semantics separate and issues the validated persisted receipt", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM canonical_proposals")) return { rows: [{ id: "proposal-1", content: "x", score: "0.4", tier: "emerging", status: "pending", trace_ref: 41, proposal_version: "1" }] };
      if (sql.includes("SELECT id,agent_id FROM events")) return { rows: [{ id: 41, agent_id: "requester-1" }] };
      if (sql.includes("UPDATE canonical_proposals")) return { rows: [{ proposal_version: "2" }] };
      if (sql.includes("FROM events") && sql.includes("metadata")) return { rows: [] };
      return { rows: [], rowCount: 1 };
    });
    const response = await POST(request("reject", { rationale: "Insufficient" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ id: "receipt-1", action: "reject" }));
    expect(approveProposalMock).not.toHaveBeenCalled();
    expect(writeReceiptMock).toHaveBeenCalledWith(
      { tenantId: "allura-test", workspaceId: "workspace-test", principalId: "curator-1" },
      { actorId: "curator-1", role: "curator" },
      expect.objectContaining({ action: "reject", proposalVersion: "2", evidenceRequestIds: [] }),
      expect.any(Object),
    );
  });

  it("request-evidence receipt is bound to its newly persisted evidence request", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM canonical_proposals")) return { rows: [{ id: "proposal-1", content: "x", score: "0.7", tier: "adoption", status: "pending", trace_ref: 41, proposal_version: "1" }] };
      if (sql.includes("SELECT id,agent_id FROM events")) return { rows: [{ id: 41, agent_id: "requester-1" }] };
      if (sql.includes("INSERT INTO evidence_requests")) return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }] };
      return { rows: [] };
    });
    writeReceiptMock.mockResolvedValue({ ...persistedReceipt, action: "request_evidence", evidence_request_id: "00000000-0000-4000-8000-000000000001", memory_id: null, outbox_state: "not_applicable" });
    const response = await POST(request("request_evidence", { rationale: "Attach source" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ action: "request_evidence", evidence_request_id: "00000000-0000-4000-8000-000000000001" }));
    expect(writeReceiptMock).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expect.objectContaining({
      action: "request_evidence", evidenceRequestIds: ["00000000-0000-4000-8000-000000000001"],
    }), expect.any(Object));
  });

  it("rejects nonexistent or cross-workspace trace evidence before a receipt", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM canonical_proposals")) return { rows: [{ id: "proposal-1", status: "pending", trace_ref: 999, proposal_version: "1" }] };
      if (sql.includes("FROM events")) return { rows: [] };
      return { rows: [] };
    });
    const response = await POST(request("reject"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/missing or outside workspace/i);
    expect(writeReceiptMock).not.toHaveBeenCalled();
  });
});
