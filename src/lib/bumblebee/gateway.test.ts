import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpTokenRecord } from "@/lib/mcp-token/repository";

// Mock the DB-backed repository and the append-only audit writer so the gateway
// pipeline can be exercised without Postgres.
const findByPrefix = vi.fn<(prefix: string) => Promise<McpTokenRecord | null>>();
const touchLastUsed = vi.fn(async (_id: string) => {});
const auditGateway = vi.fn(async (..._args: unknown[]) => {});

vi.mock("@/lib/mcp-token/repository", () => ({
  findByPrefix: (p: string) => findByPrefix(p),
  touchLastUsed: (id: string) => touchLastUsed(id),
}));
vi.mock("./audit", () => ({ auditGateway: (...a: unknown[]) => auditGateway(...a) }));

import { generateToken } from "@/lib/mcp-token/hash";
import { authorizeToolCall } from "./gateway";

let raw: string;
let record: McpTokenRecord;

beforeAll(() => {
  process.env.ALLURA_MCP_TOKEN_SECRET = "test-secret-at-least-16-chars-long";
});

beforeEach(() => {
  vi.clearAllMocks();
  const t = generateToken();
  raw = t.raw;
  record = {
    id: "tok_1",
    group_id: "allura-faithmeats",
    workspace_id: "ws_sales",
    agent_name: "claude",
    token_prefix: t.prefix,
    token_hash: t.hash,
    scopes: ["memory:read", "memory:write"],
    expires_at: null,
    revoked_at: null,
    last_used_at: null,
    created_by: "user_1",
    created_at: new Date().toISOString(),
  };
});

describe("bumblebee/gateway", () => {
  it("permits a valid token with sufficient scope and audits PERMIT", async () => {
    findByPrefix.mockResolvedValue(record);
    const result = await authorizeToolCall(`Bearer ${raw}`, "memory_add");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.group_id).toBe("allura-faithmeats");
      expect(result.scope.workspace_id).toBe("ws_sales");
    }
    expect(auditGateway).toHaveBeenCalledWith(expect.objectContaining({ decision: "permit", action: "memory_add" }));
  });

  it("denies (403) when scope is insufficient and audits DENY", async () => {
    findByPrefix.mockResolvedValue({ ...record, scopes: ["memory:read"] });
    const result = await authorizeToolCall(`Bearer ${raw}`, "memory_add");
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(auditGateway).toHaveBeenCalledWith(expect.objectContaining({ decision: "deny" }));
  });

  it("denies (401) for a missing token", async () => {
    const result = await authorizeToolCall(null, "memory_add");
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(findByPrefix).not.toHaveBeenCalled();
  });

  it("denies (401) for a revoked token", async () => {
    findByPrefix.mockResolvedValue({ ...record, revoked_at: new Date().toISOString() });
    const result = await authorizeToolCall(`Bearer ${raw}`, "memory_search");
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("ignores any client-supplied group_id — scope comes only from the token", async () => {
    findByPrefix.mockResolvedValue(record);
    const result = await authorizeToolCall(`Bearer ${raw}`, "memory_search");
    expect(result.ok).toBe(true);
    // authorizeToolCall takes no request body; there is no code path that reads a
    // caller-supplied group_id. The resolved scope is the token's org.
    if (result.ok) expect(result.scope.group_id).toBe("allura-faithmeats");
  });
});
