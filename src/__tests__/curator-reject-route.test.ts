/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { postDecisionMock } = vi.hoisted(() => ({ postDecisionMock: vi.fn() }));
vi.mock("@/app/api/curator/approve/route", () => ({ POST: postDecisionMock }));
import { POST } from "@/app/api/curator/reject/route";

beforeEach(() => postDecisionMock.mockReset());

describe("curator reject compatibility route", () => {
  it("delegates rejection to the governed workspace decision boundary and returns its receipt unchanged", async () => {
    const receipt = {
      id: "receipt-1", group_id: "allura-test", workspace_id: "workspace-a",
      proposal_id: "proposal-1", proposal_version: "2", evidence_request_id: null,
      evidence_identity_hash: "a".repeat(64), action: "reject", actor_id: "curator-1",
      actor_role: "curator", rationale: "not enough evidence", policy_reference: "policy://test",
      policy_version: "v1", memory_id: null, result_ref: null, outbox_state: "not_applicable",
      source_event_id: 41, witness_hash: null, evidence_references: ["event:41"],
      occurred_at: "2026-08-25T17:00:00.000Z", created_at: "2026-08-25T17:00:00.000Z",
    };
    postDecisionMock.mockResolvedValue(NextResponse.json(receipt));
    const request = new NextRequest("http://localhost/api/curator/reject", {
      method: "POST",
      headers: { "x-allura-group-id": "allura-test", "x-allura-workspace-id": "workspace-a" },
      body: JSON.stringify({ proposal_id: "proposal-1", group_id: "allura-test", workspace_id: "forged", rationale: "not enough evidence" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
    const delegated = postDecisionMock.mock.calls[0][0] as NextRequest;
    expect(await delegated.json()).toMatchObject({ proposal_id: "proposal-1", decision: "reject", rationale: "not enough evidence" });
    expect(delegated.headers.get("x-allura-workspace-id")).toBe("workspace-a");
  });

  it("contains no direct unreceipted decision DML", () => {
    const source = readFileSync(new URL("../app/api/curator/reject/route.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/UPDATE\s+canonical_proposals|INSERT\s+INTO\s+events/i);
    expect(source).toContain("postCuratorDecision");
  });
});
