import { describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ findByPrefix: vi.fn(), touchLastUsed: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/mcp-token/repository", () => repository);

import {
  createDefaultAuthenticatorFromEnvironment,
  createHttpAuthenticator,
  type HttpAuthConfig,
  resolveHttpAuthConfig,
} from "../mcp-authenticator";
import { hashToken, prefixOf } from "@/lib/mcp-token/hash";

describe("McpAuthenticator device credential binding", () => {
  it("does not publicly export the default authenticator issuer", async () => {
    const module = await import("../mcp-authenticator");

    expect(module).not.toHaveProperty("createDefaultAuthenticator");
  });

  it("resolves FromEnvironment to raw, non-capability configuration", async () => {
    const config = await createDefaultAuthenticatorFromEnvironment({
      ALLURA_MCP_DEV_AUTH: "true",
    });

    expect(config).toMatchObject({ mode: "dev_local" });
    expect(config).not.toHaveProperty("authenticate");
  });

  it("refuses caller-forged auth configuration before it can issue a memory-write capability", async () => {
    const forgedConfig: HttpAuthConfig = {
      mode: "dev_local",
      sharedTenantIds: [],
      sharedRoles: [],
      sharedPrincipalId: "attacker",
      devPrincipalId: "attacker",
      devTenantIds: ["allura-system"],
      devRoles: ["admin"],
      cacheTtlMs: 0,
      warnings: [],
    };

    await expect(createHttpAuthenticator(forgedConfig as never, () => "sess-forged"))
      .rejects.toMatchObject({ reasonCode: "CONFIG_MISSING" });
  });

  it("keeps resolved HTTP configuration cloneable but rejects raw, spread, and symbol-forged lookalikes", async () => {
    const raw = resolveHttpAuthConfig({ ALLURA_MCP_DEV_AUTH: "true" });
    const rawSpread = { ...raw };
    const frozenLookalike = Object.freeze({ ...raw });
    const forgedSymbol = Object.freeze(Object.defineProperty(
      { ...raw },
      Symbol.for("allura:auth-proof"),
      { value: "forged", enumerable: false },
    ));

    expect(Object.isFrozen(raw)).toBe(false);
    expect(rawSpread).toMatchObject({ mode: "dev_local" });
    await expect(createHttpAuthenticator(raw as never, () => "sess-raw"))
      .rejects.toMatchObject({ reasonCode: "CONFIG_MISSING" });
    await expect(createHttpAuthenticator(frozenLookalike as never, () => "sess-lookalike"))
      .rejects.toMatchObject({ reasonCode: "CONFIG_MISSING" });
    await expect(createHttpAuthenticator(forgedSymbol as never, () => "sess-forged-symbol"))
      .rejects.toMatchObject({ reasonCode: "CONFIG_MISSING" });
  });

  it("projects paired_device_id from a verified token row into PrincipalContext", async () => {
    const raw = "allura_mcp_device-token-000000000000000000";
    process.env.ALLURA_MCP_TOKEN_SECRET = "0123456789abcdefghij";
    repository.findByPrefix.mockResolvedValue({
      id: "tok_device", group_id: "allura-system", workspace_id: "ws-main",
      agent_name: "user-1", token_prefix: prefixOf(raw), token_hash: hashToken(raw),
      scopes: ["memory:read"], expires_at: null, revoked_at: null,
      paired_device_id: "dev_123",
    });
    const authenticator = await createHttpAuthenticator({
      ALLURA_MCP_TOKEN_SECRET: "0123456789abcdefghij",
    }, () => "sess-1");

    const principal = await authenticator.authenticate({ authorization: `Bearer ${raw}` }, "sess-1");

    expect(principal.pairedDeviceId).toBe("dev_123");
  });
});
