import { expect, it, vi } from "vitest"

import { McpAuthenticator } from "../mcp-authenticator"

it("always re-reads a paired-device credential even when the non-device cache TTL is enabled", async () => {
  const findByPrefix = vi.fn(async () => ({
    id: "tok-device",
    group_id: "allura-system",
    workspace_id: "ws-main",
    agent_name: "human-1",
    token_prefix: "prefix",
    token_hash: "hash",
    scopes: ["memory:read"],
    expires_at: null,
    revoked_at: null,
    paired_device_id: "dev-terminal",
  }))
  const authenticator = new McpAuthenticator({
    mode: "mcp_token",
    sharedTenantIds: [], sharedRoles: [], sharedPrincipalId: "shared",
    devPrincipalId: "dev", devTenantIds: ["allura-system"], devRoles: ["viewer"],
    cacheTtlMs: 60_000, warnings: [],
  }, {
    prefixOf: () => "prefix",
    findByPrefix,
    verifyToken: () => true,
  })

  await authenticator.authenticate({ authorization: "Bearer device-token" })
  await authenticator.authenticate({ authorization: "Bearer device-token" })

  expect(findByPrefix).toHaveBeenCalledTimes(2)
})
