import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the data layer — these route tests are pure auth/shape checks, no DB.
const createToken = vi.fn();
const listTokensForWorkspace = vi.fn();
const createWorkspace = vi.fn();
const listWorkspacesForGroup = vi.fn();
const revokeToken = vi.fn(async (_id: string) => {});

vi.mock("@/lib/mcp-token/repository", () => ({
  createToken: (...a: unknown[]) => createToken(...a),
  listTokensForWorkspace: (...a: unknown[]) => listTokensForWorkspace(...a),
  revokeToken: (id: string) => revokeToken(id),
}));
vi.mock("@/lib/workspace/repository", () => ({
  createWorkspace: (...a: unknown[]) => createWorkspace(...a),
  listWorkspacesForGroup: (...a: unknown[]) => listWorkspacesForGroup(...a),
}));

import { POST as revokePOST } from "@/app/api/tokens/[id]/revoke/route";
import { GET as tokensGET, POST as tokensPOST } from "@/app/api/tokens/route";
import { POST as wsPOST } from "@/app/api/workspaces/route";

function req(url: string, role: string | null, body?: unknown): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (role) {
    headers["x-allura-user-id"] = "u1";
    headers["x-allura-role"] = role;
    headers["x-allura-group-id"] = "allura-test";
    headers["x-allura-workspace-id"] = "ws_1";
    headers["x-allura-session-id"] = "session-admin-route-test";
  }
  return new NextRequest(`http://localhost${url}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const RECORD = {
  id: "tok_1",
  group_id: "allura-test",
  workspace_id: "ws_1",
  agent_name: "claude",
  token_prefix: "allura_mcp_abcd1234",
  token_hash: "SECRET_HASH_NEVER_LEAKS",
  scopes: ["memory:read", "memory:write"],
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
  created_by: "u1",
  created_at: new Date().toISOString(),
};

beforeEach(() => vi.clearAllMocks());

describe("POST /api/tokens", () => {
  it("admin mints a token: raw returned once, hash never exposed", async () => {
    createToken.mockResolvedValue({ raw: "allura_mcp_RAWSECRET", record: RECORD });
    const res = await tokensPOST(req("/api/tokens", "admin", { workspace_id: "ws_1", agent_name: "claude" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.token).toBe("allura_mcp_RAWSECRET");
    expect(json.record.token_prefix).toBe("allura_mcp_abcd1234");
    expect(json.record.token_hash).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("SECRET_HASH_NEVER_LEAKS");
  });

  it("rejects unknown scopes (400)", async () => {
    const res = await tokensPOST(req("/api/tokens", "admin", { workspace_id: "ws_1", agent_name: "x", scopes: ["memory:read", "do:evil"] }));
    expect(res.status).toBe(400);
    expect(createToken).not.toHaveBeenCalled();
  });

  it("non-admin is forbidden (403)", async () => {
    const res = await tokensPOST(req("/api/tokens", "viewer", { workspace_id: "ws_1", agent_name: "x" }));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/tokens", () => {
  it("lists tokens without the hash", async () => {
    listTokensForWorkspace.mockResolvedValue([RECORD]);
    const res = await tokensGET(req("/api/tokens?workspace_id=ws_1", "admin"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tokens[0].token_hash).toBeUndefined();
    expect(json.tokens[0].token_prefix).toBe("allura_mcp_abcd1234");
  });
});

describe("POST /api/workspaces", () => {
  it("admin creates a workspace scoped to the auth group_id", async () => {
    createWorkspace.mockResolvedValue({ workspace_id: "ws_9", group_id: "allura-test", name: "Sales", lock_mode: "normal" });
    const res = await wsPOST(req("/api/workspaces", "admin", { name: "Sales" }));
    expect(res.status).toBe(201);
    expect(createWorkspace).toHaveBeenCalledWith(expect.objectContaining({ group_id: "allura-test", name: "Sales" }));
  });

  it("non-admin is forbidden (403)", async () => {
    const res = await wsPOST(req("/api/workspaces", "viewer", { name: "Sales" }));
    expect(res.status).toBe(403);
    expect(createWorkspace).not.toHaveBeenCalled();
  });
});

describe("POST /api/tokens/[id]/revoke", () => {
  it("admin revokes a token", async () => {
    const res = await revokePOST(req("/api/tokens/tok_1/revoke", "admin", {}), { params: Promise.resolve({ id: "tok_1" }) });
    expect(res.status).toBe(200);
    expect(revokeToken).toHaveBeenCalledWith("tok_1");
  });
});
