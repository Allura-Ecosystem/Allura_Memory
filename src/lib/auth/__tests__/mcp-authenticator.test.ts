import { describe, expect, it } from "vitest";
import { McpAuthenticator } from "../mcp-authenticator";

describe("McpAuthenticator device credential binding", () => {
  it("projects paired_device_id from a verified token row into PrincipalContext", async () => {
    const authenticator = new McpAuthenticator({
      mode: "mcp_token",
      sharedTenantIds: [], sharedRoles: [], sharedPrincipalId: "shared",
      devPrincipalId: "dev", devTenantIds: ["allura-system"], devRoles: ["viewer"],
      cacheTtlMs: 0, warnings: [],
    }, {
      prefixOf: () => "prefix",
      findByPrefix: async () => ({
        id: "tok_device", group_id: "allura-system", workspace_id: "ws-main",
        agent_name: "user-1", token_prefix: "prefix", token_hash: "hash",
        scopes: ["memory:read"], expires_at: null, revoked_at: null,
        paired_device_id: "dev_123",
      }),
      verifyToken: () => true,
    });

    const principal = await authenticator.authenticate({ authorization: "Bearer raw-token" }, "sess-1");

    expect(principal.pairedDeviceId).toBe("dev_123");
  });
});
