import { describe, expect, it } from "vitest";
import type { McpTokenRecord } from "@/lib/mcp-token/repository";
import { injectContext } from "./inject-context";

function fakeToken(overrides: Partial<McpTokenRecord> = {}): McpTokenRecord {
  return {
    id: "tok_1",
    group_id: "allura-faithmeats",
    workspace_id: "ws_sales",
    agent_name: "claude",
    token_prefix: "allura_mcp_abcd1234",
    token_hash: "deadbeef",
    scopes: ["memory:read", "memory:write"],
    expires_at: null,
    revoked_at: null,
    last_used_at: null,
    created_by: "user_1",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("bumblebee/inject-context (ADR-001)", () => {
  it("derives group_id, workspace_id, scopes, actor strictly from the token", () => {
    const scope = injectContext(fakeToken());
    expect(scope.group_id).toBe("allura-faithmeats");
    expect(scope.workspace_id).toBe("ws_sales");
    expect(scope.actor_id).toBe("claude");
    expect(scope.scopes).toEqual(["memory:read", "memory:write"]);
    expect(scope.request_id).toBeTruthy();
  });

  it("generates a fresh request_id per call", () => {
    const a = injectContext(fakeToken());
    const b = injectContext(fakeToken());
    expect(a.request_id).not.toBe(b.request_id);
  });
});
