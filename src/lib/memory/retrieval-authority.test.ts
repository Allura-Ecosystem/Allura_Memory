import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { retrieveKnowledge } = vi.hoisted(() => ({ retrieveKnowledge: vi.fn() }));
vi.mock("@/lib/memory/retrieval-layer", async (original) => ({
  ...(await original<typeof import("./retrieval-layer")>()),
  retrieveKnowledge,
}));

import { POST } from "@/app/api/memory/retrieval/route";

const headers = {
  "x-allura-user-id": "viewer-authenticated",
  "x-allura-session-id": "session-1",
  "x-allura-role": "viewer",
  "x-allura-group-id": "allura-authority",
  "x-allura-workspace-id": "workspace-a",
};

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/memory/retrieval", {
    method: "POST",
    headers,
    body: JSON.stringify({ query: "governed", ...body }),
  });
}

describe("authenticated retrieval authority", () => {
  beforeEach(() => retrieveKnowledge.mockReset().mockResolvedValue({ results: [], total: 0, metadata: {} }));

  it("derives tenant, workspace, and actor exclusively from the authenticated user", async () => {
    const response = await POST(request({}), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(retrieveKnowledge).toHaveBeenCalledWith(expect.objectContaining({
      group_id: "allura-authority",
      workspace_id: "workspace-a",
      agent_id: "viewer-authenticated",
    }));
  });

  it.each([
    { group_id: "allura-other" },
    { workspace_id: "workspace-b" },
    { agent_id: "forged-agent" },
  ])("rejects forged authority selector %#", async (forgery) => {
    const response = await POST(request(forgery), { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
    expect(retrieveKnowledge).not.toHaveBeenCalled();
  });
});
