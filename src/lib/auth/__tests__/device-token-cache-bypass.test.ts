import { expect, it, vi } from "vitest"

const repository = vi.hoisted(() => ({ findByPrefix: vi.fn(), touchLastUsed: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/mcp-token/repository", () => repository)

import { createHttpAuthenticator, resolveHttpAuthConfig } from "../mcp-authenticator"
import { hashToken, prefixOf } from "@/lib/mcp-token/hash"

it("always re-reads a paired-device credential even when the non-device cache TTL is enabled", async () => {
  const raw = "allura_mcp_fixture_000000000000000000"
  process.env.ALLURA_MCP_TOKEN_SECRET = "0123456789abcdefghij"
  repository.findByPrefix.mockImplementation(async () => ({
    id: "tok-device",
    group_id: "allura-system",
    workspace_id: "ws-main",
    agent_name: "human-1",
    token_prefix: prefixOf(raw),
    token_hash: hashToken(raw),
    scopes: ["memory:read"],
    expires_at: null,
    revoked_at: null,
    paired_device_id: "dev-terminal",
  }))
  const rawConfig = resolveHttpAuthConfig({ ALLURA_MCP_TOKEN_SECRET: "0123456789abcdefghij" })
  const rawDeviceConfig = { ...rawConfig, cacheTtlMs: 60_000 }

  await expect(createHttpAuthenticator(rawDeviceConfig as never, () => "sess-raw-device"))
    .rejects.toMatchObject({ reasonCode: "CONFIG_MISSING" })

  const authenticator = await createHttpAuthenticator({
    ALLURA_MCP_TOKEN_SECRET: "0123456789abcdefghij",
    ALLURA_MCP_AUTH_CACHE_TTL_MS: "60000",
  }, () => "sess-1")

  await authenticator.authenticate({ authorization: `Bearer ${raw}` })
  await authenticator.authenticate({ authorization: `Bearer ${raw}` })

  expect(repository.findByPrefix).toHaveBeenCalledTimes(2)
})
