/**
 * AC6 Tenant Resolver + Auth Guard — Unit Tests
 *
 * Tests the 6+ scenarios from AC6 ADR §6.2 / §5.1 without DB or network.
 * getMembershipsForEmail and verifyCfAccessJwt are vi.mock'd so these are
 * pure-logic tests.
 *
 * Scenarios covered:
 *   ✅ 1. valid JWT, default tenant resolved (is_default = true)
 *   ✅ 2. valid JWT, explicit allowed tenant
 *   ✅ 3. valid JWT, disallowed tenant → deny (auth_group_not_allowed)
 *   ✅ 4. no credential → default-deny (403); chat path requires a valid X-Allura-Internal-Token
 *   ✅ 5. human requesting allura-system → deny (auth_system_tenant_forbidden)
 *   ✅ 6. chat path group_id override attempt → deny (chat_invalid_group_override)
 *   ✅ 7. no default tenant configured → deny (auth_no_default_tenant)
 *   ✅ 8. legacy tenant allura-roninmemory → deny (auth_legacy_tenant_blocked)
 *   ✅ 9. legacy tenant allura-team-ram → deny
 *   ✅ 10. dev mode uses allura-dev (NOT allura-system)
 *   ✅ 11. invalid JWT signature → deny (auth_invalid_token)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks (must be hoisted before imports) ─────────────────────────────

vi.mock("@/lib/auth/memberships.js", () => ({
  getMembershipsForEmail: vi.fn(),
}));

vi.mock("@/lib/auth/cf-access-jwt.js", () => ({
  verifyCfAccessJwt: vi.fn(),
  invalidateJwksCache: vi.fn(),
  // CfAccessJwtError class must be real for instanceof checks
  CfAccessJwtError: class CfAccessJwtError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = "CfAccessJwtError";
      this.code = code;
    }
  },
}));

import { getMembershipsForEmail } from "@/lib/auth/memberships.js";
import { verifyCfAccessJwt, CfAccessJwtError } from "@/lib/auth/cf-access-jwt.js";
import {
  AC6Error,
  CHAT_PINNED_GROUP_ID,
  DEV_GROUP_ID,
  assertChatGroupId,
  resolveGroupId,
} from "./tenant-resolver.js";
import {
  resolveAc6SessionCtx,
  resolveAndInjectGroupId,
} from "@/mcp/ac6-auth-guard.js";
import type { IncomingMessage } from "http";

const mockGetMemberships = vi.mocked(getMembershipsForEmail);
const mockVerifyJwt = vi.mocked(verifyCfAccessJwt);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MEMBERSHIPS_OWNER = [
  { email: "sabir@example.com", group_id: "allura-faithmeats", role: "owner" as const, is_default: true },
  { email: "sabir@example.com", group_id: "allura-difference-driven", role: "owner" as const, is_default: false },
  { email: "sabir@example.com", group_id: "allura-personal", role: "owner" as const, is_default: false },
];

const MEMBERSHIPS_EMPLOYEE = [
  { email: "gabe@faithmeats.com", group_id: "allura-faithmeats", role: "admin" as const, is_default: true },
];

const VALID_JWT_CLAIMS = {
  email: "sabir@example.com",
  sub: "uid-abc123",
  aud: "test-cf-aud",
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

function makeReq(headers: Record<string, string> = {}): IncomingMessage {
  return {
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    ),
    method: "POST",
    url: "/mcp",
  } as unknown as IncomingMessage;
}

// ── resolveGroupId unit tests ─────────────────────────────────────────────────

describe("resolveGroupId", () => {
  beforeEach(() => vi.clearAllMocks());

  // Scenario 1: valid identity, default tenant
  it("resolves is_default tenant when client omits group_id", async () => {
    mockGetMemberships.mockResolvedValue(MEMBERSHIPS_OWNER);
    const result = await resolveGroupId("sabir@example.com", null);
    expect(result).toBe("allura-faithmeats");
    expect(mockGetMemberships).toHaveBeenCalledWith("sabir@example.com");
  });

  // Scenario 2: valid identity, explicit allowed tenant
  it("allows an explicit group_id that is in the user's memberships", async () => {
    mockGetMemberships.mockResolvedValue(MEMBERSHIPS_OWNER);
    const result = await resolveGroupId("sabir@example.com", "allura-difference-driven");
    expect(result).toBe("allura-difference-driven");
  });

  // Scenario 3: valid identity, disallowed tenant → deny
  it("rejects a group_id the user is not a member of", async () => {
    mockGetMemberships.mockResolvedValue(MEMBERSHIPS_EMPLOYEE);
    await expect(
      resolveGroupId("gabe@faithmeats.com", "allura-difference-driven")
    ).rejects.toMatchObject({ code: "auth_group_not_allowed", httpStatus: 403 });
  });

  // Scenario 5: human → allura-system DENY
  it("rejects allura-system requests from human identities (no DB call)", async () => {
    await expect(
      resolveGroupId("sabir@example.com", "allura-system")
    ).rejects.toMatchObject({ code: "auth_system_tenant_forbidden", httpStatus: 403 });
    expect(mockGetMemberships).not.toHaveBeenCalled();
  });

  it("rejects legacy tenant allura-roninmemory without DB call", async () => {
    await expect(
      resolveGroupId("sabir@example.com", "allura-roninmemory")
    ).rejects.toMatchObject({ code: "auth_legacy_tenant_blocked", httpStatus: 403 });
    expect(mockGetMemberships).not.toHaveBeenCalled();
  });

  it("rejects legacy tenant allura-team-ram without DB call", async () => {
    await expect(
      resolveGroupId("sabir@example.com", "allura-team-ram")
    ).rejects.toMatchObject({ code: "auth_legacy_tenant_blocked", httpStatus: 403 });
    expect(mockGetMemberships).not.toHaveBeenCalled();
  });

  // Scenario 7: no default tenant configured
  it("rejects when no membership has is_default = true", async () => {
    mockGetMemberships.mockResolvedValue([
      { email: "sabir@example.com", group_id: "allura-personal", role: "owner" as const, is_default: false },
    ]);
    await expect(
      resolveGroupId("sabir@example.com", null)
    ).rejects.toMatchObject({ code: "auth_no_default_tenant", httpStatus: 400 });
  });

  it("rejects when user has no memberships at all", async () => {
    mockGetMemberships.mockResolvedValue([]);
    await expect(
      resolveGroupId("nobody@example.com", null)
    ).rejects.toMatchObject({ code: "auth_no_default_tenant", httpStatus: 400 });
  });

  it("rejects a group_id that fails format validation (no DB call)", async () => {
    await expect(
      resolveGroupId("sabir@example.com", "INVALID_FORMAT")
    ).rejects.toMatchObject({ code: "auth_invalid_group_id_format", httpStatus: 400 });
    expect(mockGetMemberships).not.toHaveBeenCalled();
  });
});

// ── assertChatGroupId tests ───────────────────────────────────────────────────

describe("assertChatGroupId", () => {
  // Scenario 6: chat-path override attempt DENY
  it("rejects when client sends a non-faithmeats group_id on chat path", () => {
    expect(() => assertChatGroupId("allura-personal"))
      .toThrow(expect.objectContaining({ code: "chat_invalid_group_override" }));
  });

  it("rejects allura-system on chat path", () => {
    expect(() => assertChatGroupId("allura-system"))
      .toThrow(expect.objectContaining({ code: "chat_invalid_group_override" }));
  });

  it("accepts allura-faithmeats on chat path", () => {
    expect(() => assertChatGroupId("allura-faithmeats")).not.toThrow();
  });

  it("accepts undefined (client omitted group_id) on chat path", () => {
    expect(() => assertChatGroupId(undefined)).not.toThrow();
  });

  it("accepts null on chat path", () => {
    expect(() => assertChatGroupId(null)).not.toThrow();
  });
});

// ── resolveAc6SessionCtx tests ────────────────────────────────────────────────

describe("resolveAc6SessionCtx", () => {
  beforeEach(() => vi.clearAllMocks());

  // Scenario 4 (Pike fix): no JWT AND no internal token → default-deny.
  // Bare absence of a credential must NEVER auto-pin to a tenant.
  it("default-denies (403) when neither Cf-Access-Jwt-Assertion nor X-Allura-Internal-Token is present", async () => {
    const req = makeReq({});
    await expect(resolveAc6SessionCtx(req)).rejects.toMatchObject({
      code: "auth_no_jwt",
      httpStatus: 403,
    });
  });

  // Scenario 4b: chat path requires a VALID pre-shared internal token (mcpo → Brain hop).
  // INTERNAL_CHAT_TOKEN is read at module load, so re-import the guard with the env set.
  it("classifies chat path when a valid X-Allura-Internal-Token is present", async () => {
    vi.resetModules();
    vi.stubEnv("ALLURA_MCP_AUTH_TOKEN", ""); // ensure dev-mode is off
    vi.stubEnv("ALLURA_INTERNAL_CHAT_TOKEN", "test-internal-secret");
    const { resolveAc6SessionCtx: resolveWithToken } = await import("@/mcp/ac6-auth-guard.js");
    const req = makeReq({ "x-allura-internal-token": "test-internal-secret" });
    const ctx = await resolveWithToken(req);
    expect(ctx.path).toBe("chat");
    expect(ctx.email).toBe("internal@mcpo.chat");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Scenario 4c: a WRONG internal token (and no JWT) is denied, not pinned.
  it("default-denies (403) when X-Allura-Internal-Token is wrong and no JWT is present", async () => {
    vi.resetModules();
    vi.stubEnv("ALLURA_MCP_AUTH_TOKEN", "");
    vi.stubEnv("ALLURA_INTERNAL_CHAT_TOKEN", "test-internal-secret");
    const { resolveAc6SessionCtx: resolveWithToken } = await import("@/mcp/ac6-auth-guard.js");
    const req = makeReq({ "x-allura-internal-token": "wrong-secret" });
    await expect(resolveWithToken(req)).rejects.toMatchObject({
      code: "auth_no_jwt",
      httpStatus: 403,
    });
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Scenario 1 (session init portion): valid JWT → direct path + email extracted
  it("classifies direct-MCP path and extracts email from valid JWT", async () => {
    mockVerifyJwt.mockResolvedValue(VALID_JWT_CLAIMS);
    const req = makeReq({ "cf-access-jwt-assertion": "header.payload.sig" });
    const ctx = await resolveAc6SessionCtx(req);
    expect(ctx.path).toBe("direct");
    expect(ctx.email).toBe("sabir@example.com");
    expect(mockVerifyJwt).toHaveBeenCalledWith("header.payload.sig");
  });

  // Scenario 11: invalid JWT signature → deny
  it("rejects direct-MCP path when JWT verification fails", async () => {
    const jwtErr = new CfAccessJwtError("JWT signature is invalid", "auth_invalid_token");
    mockVerifyJwt.mockRejectedValue(jwtErr);
    const req = makeReq({ "cf-access-jwt-assertion": "bad.jwt.token" });
    await expect(resolveAc6SessionCtx(req)).rejects.toMatchObject({
      code: "auth_invalid_token",
      httpStatus: 403,
    });
  });

  it("handles array Cf-Access-Jwt-Assertion header by using first value", async () => {
    mockVerifyJwt.mockResolvedValue(VALID_JWT_CLAIMS);
    const req = {
      headers: { "cf-access-jwt-assertion": ["first.token", "second.token"] },
      method: "POST",
      url: "/mcp",
    } as unknown as IncomingMessage;
    await resolveAc6SessionCtx(req);
    expect(mockVerifyJwt).toHaveBeenCalledWith("first.token");
  });
});

// ── resolveAndInjectGroupId tests ─────────────────────────────────────────────

describe("resolveAndInjectGroupId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("injects resolved group_id on direct path, replacing client value", async () => {
    mockGetMemberships.mockResolvedValue(MEMBERSHIPS_OWNER);
    const ctx = { email: "sabir@example.com", path: "direct" as const };
    const result = await resolveAndInjectGroupId(
      { group_id: "allura-faithmeats", content: "hello" },
      ctx
    );
    expect(result.group_id).toBe("allura-faithmeats");
    expect(result.content).toBe("hello");
  });

  it("injects default tenant on direct path when client omits group_id", async () => {
    mockGetMemberships.mockResolvedValue(MEMBERSHIPS_OWNER);
    const ctx = { email: "sabir@example.com", path: "direct" as const };
    const result = await resolveAndInjectGroupId({ content: "hello" }, ctx);
    expect(result.group_id).toBe("allura-faithmeats");
  });

  // Scenario 6: chat path group_id override attempt → deny
  it("rejects on chat path when client sends non-faithmeats group_id", async () => {
    const ctx = { email: "internal@mcpo.chat", path: "chat" as const };
    await expect(
      resolveAndInjectGroupId({ group_id: "allura-personal", content: "x" }, ctx)
    ).rejects.toMatchObject({ code: "chat_invalid_group_override" });
  });

  it("injects allura-faithmeats on chat path when client omits group_id", async () => {
    const ctx = { email: "internal@mcpo.chat", path: "chat" as const };
    const result = await resolveAndInjectGroupId({ content: "x" }, ctx);
    expect(result.group_id).toBe(CHAT_PINNED_GROUP_ID);
  });

  // Scenario 10: dev mode uses allura-dev (NOT allura-system)
  it("injects allura-dev on dev path regardless of client value", async () => {
    const ctx = { email: "dev@allura-dev", path: "dev" as const };
    const result = await resolveAndInjectGroupId(
      { group_id: "allura-system", content: "x" },
      ctx
    );
    expect(result.group_id).toBe(DEV_GROUP_ID);
    expect(result.group_id).toBe("allura-dev");
    expect(result.group_id).not.toBe("allura-system");
  });

  it("does not call memberships for chat path", async () => {
    const ctx = { email: "internal@mcpo.chat", path: "chat" as const };
    await resolveAndInjectGroupId({ content: "x" }, ctx);
    expect(mockGetMemberships).not.toHaveBeenCalled();
  });

  it("does not call memberships for dev path", async () => {
    const ctx = { email: "dev@allura-dev", path: "dev" as const };
    await resolveAndInjectGroupId({ content: "x" }, ctx);
    expect(mockGetMemberships).not.toHaveBeenCalled();
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe("AC6 constants", () => {
  it("CHAT_PINNED_GROUP_ID is allura-faithmeats", () => {
    expect(CHAT_PINNED_GROUP_ID).toBe("allura-faithmeats");
  });

  it("DEV_GROUP_ID is allura-dev, not allura-system (Brooks override)", () => {
    expect(DEV_GROUP_ID).toBe("allura-dev");
    expect(DEV_GROUP_ID).not.toBe("allura-system");
  });
});

// ── AC6Error structure ────────────────────────────────────────────────────────

describe("AC6Error", () => {
  it("is an Error with code and httpStatus", () => {
    const err = new AC6Error("test message", "auth_no_jwt", 403);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("test message");
    expect(err.code).toBe("auth_no_jwt");
    expect(err.httpStatus).toBe(403);
    expect(err.name).toBe("AC6Error");
  });
});
