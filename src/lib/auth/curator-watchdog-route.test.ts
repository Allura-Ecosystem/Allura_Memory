import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { McpTokenRecord } from "@/lib/mcp-token/repository";

vi.mock("@/curator/watchdog", () => ({ scanAndPropose: vi.fn() }));
vi.mock("@/lib/guard/validate-token", () => ({ validateToken: vi.fn() }));
vi.mock("@/lib/db/workspace-scope", () => ({
  resolveWorkspaceScope: vi.fn((token) => ({
    tenantId: token.group_id,
    workspaceId: token.workspace_id,
    principalId: token.agent_name,
  })),
}));
vi.mock("@/lib/db/tenant-transaction", () => ({
  withWorkspaceTransaction: vi.fn(),
}));

import { scanAndPropose } from "@/curator/watchdog";
import { validateToken } from "@/lib/guard/validate-token";
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction";
import { GET, POST } from "@/app/api/curator/watchdog/route";

const validToken: McpTokenRecord = {
  id: "tok_real",
  group_id: "allura-real",
  workspace_id: "workspace-real",
  agent_name: "watchdog-agent",
  token_prefix: "prefix",
  token_hash: "hash",
  scopes: ["review:read"],
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  created_by: null,
};

function request(body: object, authorization?: string): NextRequest {
  return new NextRequest("http://localhost/api/curator/watchdog", {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify(body),
  });
}

function getRequest(authorization?: string): NextRequest {
  return new NextRequest("http://localhost/api/curator/watchdog?group_id=allura-attacker&workspace_id=workspace-attacker", {
    method: "GET",
    headers: authorization ? { authorization } : {},
  });
}

describe("POST /api/curator/watchdog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scanAndPropose).mockResolvedValue(0);
  });

  it("derives scope and tenant from a validated credential, ignoring forged browser values", async () => {
    vi.mocked(validateToken).mockResolvedValue({ ok: true, token: validToken });

    const response = await POST(request({ group_id: "allura-attacker", workspace_id: "workspace-attacker", score_threshold: 0.2 }, "Bearer real"));

    expect(response.status).toBe(200);
    expect(scanAndPropose).toHaveBeenCalledWith(expect.objectContaining({
      groupId: "allura-real",
      scope: { tenantId: "allura-real", workspaceId: "workspace-real", principalId: "watchdog-agent" },
      scoreThreshold: 0.2,
    }));
  });

  it("rejects absent or invalid server credentials before watchdog execution", async () => {
    vi.mocked(validateToken).mockResolvedValue({ ok: false, reason: "missing" });

    const response = await POST(request({ group_id: "allura-real" }));

    expect(response.status).toBe(401);
    expect(scanAndPropose).not.toHaveBeenCalled();
  });

  it("rejects a valid credential without the curator watchdog permission", async () => {
    vi.mocked(validateToken).mockResolvedValue({ ok: true, token: { ...validToken, scopes: ["memory:read"] } });

    const response = await POST(request({}, "Bearer low-privilege"));

    expect(response.status).toBe(403);
    expect(scanAndPropose).not.toHaveBeenCalled();
  });

  it("does not treat memory promotion capability as reviewer authorization", async () => {
    vi.mocked(validateToken).mockResolvedValue({ ok: true, token: { ...validToken, scopes: ["memory:promote"] } });
    const response = await POST(request({}, "Bearer promoter"));
    expect(response.status).toBe(403);
    expect(scanAndPropose).not.toHaveBeenCalled();
  });
});

describe("GET /api/curator/watchdog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects absent or invalid credentials before any scoped count", async () => {
    vi.mocked(validateToken).mockResolvedValue({ ok: false, reason: "missing" });

    await expect(GET(getRequest())).resolves.toMatchObject({ status: 401 });
    expect(withWorkspaceTransaction).not.toHaveBeenCalled();
  });

  it("rejects a validated credential without curator permission", async () => {
    vi.mocked(validateToken).mockResolvedValue({ ok: true, token: { ...validToken, scopes: ["memory:read"] } });

    await expect(GET(getRequest("Bearer low-privilege"))).resolves.toMatchObject({ status: 403 });
    expect(withWorkspaceTransaction).not.toHaveBeenCalled();
  });

  it("derives counts from the validated token scope and ignores forged query scope", async () => {
    vi.mocked(validateToken).mockResolvedValue({ ok: true, token: validToken });
    const appClient = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ cnt: "2" }] })
        .mockResolvedValueOnce({ rows: [{ cnt: "3" }] }),
    };
    vi.mocked(withWorkspaceTransaction).mockImplementation(async (scope, callback) => {
      expect(scope).toEqual({ tenantId: "allura-real", workspaceId: "workspace-real", principalId: "watchdog-agent" });
      return callback(appClient as never);
    });

    const response = await GET(getRequest("Bearer real"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ group_id: "allura-real", pending: 2, total: 3 });
    expect(withWorkspaceTransaction).toHaveBeenCalledTimes(1);
    for (const [, params] of appClient.query.mock.calls) {
      expect(params).toEqual(["allura-real", "workspace-real"]);
    }
    expect(appClient.query.mock.calls[0][0]).toContain("group_id = $1 AND workspace_id = $2");
  });
});
