/**
 * Story 24.2 — MCP authentication adversarial matrix (AC-9).
 *
 * Runs fully in-process: no live gateway, no live database. The credential
 * store is an injected in-memory fixture and the clock is injected, so
 * revocation and expiry are deterministic.
 *
 * The suite exercises the exact chokepoint both transports use:
 *   McpAuthenticator.authenticate()  ->  guardToolCall()
 *
 * Attack cases covered:
 *   missing auth, malformed auth, forged role, forged tenant, forged curator
 *   id, revoked token, expired token, valid least-privilege access.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type AuthenticatorDeps,
  createServicePrincipal,
  extractBearerToken,
  type HttpAuthConfig,
  McpAuthenticator,
  type McpCredentialRecord,
  resolveHttpAuthConfig,
  resolveServiceAuthConfig,
  rolesFromScopes,
  timingSafeCompare,
} from "@/lib/auth/mcp-authenticator";
import {
  type AuthReasonCode,
  buildAuthAuditEvent,
  canRebindSession,
  guardToolCall,
  PrincipalAuthError,
  type PrincipalContext,
} from "@/lib/auth/principal-context";

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY CREDENTIAL FIXTURE (mirrors docker/postgres-init/28-mcp-tokens.sql)
// ─────────────────────────────────────────────────────────────────────────────

const RAW_VIEWER = "allura_mcp_viewertoken0000000000000000";
const RAW_CURATOR = "allura_mcp_curatortoken000000000000000";
const RAW_ADMIN = "allura_mcp_admintoken00000000000000000";
const RAW_REVOKED = "allura_mcp_revokedtoken000000000000000";
const RAW_EXPIRED = "allura_mcp_expiredtoken000000000000000";
const RAW_UNKNOWN = "allura_mcp_unknowntoken000000000000000";

/** Deterministic stand-in for the real HMAC. Never a real secret. */
function fakeHash(raw: string): string {
  return `hash::${raw}`;
}
function fakePrefix(raw: string): string {
  return raw.slice(0, 18);
}

const NOW = new Date("2026-08-15T12:00:00.000Z");

function record(
  raw: string,
  overrides: Partial<McpCredentialRecord> = {},
): McpCredentialRecord {
  return {
    id: `tok_${raw.slice(11, 18)}`,
    group_id: "allura-system",
    workspace_id: "ws-main",
    agent_name: "agent-scout",
    token_prefix: fakePrefix(raw),
    token_hash: fakeHash(raw),
    scopes: ["memory:read"],
    expires_at: null,
    revoked_at: null,
    ...overrides,
  };
}

let store: Map<string, McpCredentialRecord>;
let touched: string[];

function seedStore(): void {
  store = new Map();
  touched = [];
  const seed = (r: McpCredentialRecord) => store.set(r.token_prefix, r);

  seed(record(RAW_VIEWER, { agent_name: "agent-viewer", scopes: ["memory:read"] }));
  seed(
    record(RAW_CURATOR, {
      agent_name: "agent-curator",
      scopes: ["memory:read", "review:approve", "review:reject", "memory:promote"],
    }),
  );
  seed(
    record(RAW_ADMIN, {
      agent_name: "agent-admin",
      group_id: "allura-mortagate",
      scopes: ["memory:read", "admin:roles", "workspace:lock"],
    }),
  );
  seed(
    record(RAW_REVOKED, {
      agent_name: "agent-revoked",
      scopes: ["memory:read"],
      revoked_at: "2026-08-14T00:00:00.000Z",
    }),
  );
  seed(
    record(RAW_EXPIRED, {
      agent_name: "agent-expired",
      scopes: ["memory:read"],
      expires_at: "2026-08-14T00:00:00.000Z",
    }),
  );
}

function deps(now: Date = NOW): AuthenticatorDeps {
  return {
    prefixOf: fakePrefix,
    findByPrefix: async (prefix) => store.get(prefix) ?? null,
    verifyToken: (raw, storedHash) => fakeHash(raw) === storedHash,
    touchLastUsed: async (id) => {
      touched.push(id);
    },
    now: () => now,
    newSessionId: () => "sess-fixed",
  };
}

function tokenConfig(overrides: Partial<HttpAuthConfig> = {}): HttpAuthConfig {
  return resolveHttpAuthConfig({
    NODE_ENV: "test",
    ALLURA_MCP_TOKEN_SECRET: "0123456789abcdefghij",
    ...(overrides as Record<string, string>),
  }) as HttpAuthConfig;
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeEach(seedStore);

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP CONFIGURATION (AC-1, AC-6)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: production HTTP startup fails without auth configuration", () => {
  it("throws CONFIG_MISSING in production with no credential configuration", () => {
    try {
      resolveHttpAuthConfig({ NODE_ENV: "production" });
      throw new Error("expected startup refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(PrincipalAuthError);
      expect((error as PrincipalAuthError).reasonCode).toBe("CONFIG_MISSING");
    }
  });

  it("throws CONFIG_MISSING when ALLURA_ENV declares production", () => {
    expect(() => resolveHttpAuthConfig({ ALLURA_ENV: "production" })).toThrow(PrincipalAuthError);
  });

  it("refuses dev-local mode in production (DEV_MODE_FORBIDDEN)", () => {
    try {
      resolveHttpAuthConfig({ NODE_ENV: "production", ALLURA_MCP_DEV_AUTH: "true" });
      throw new Error("expected startup refusal");
    } catch (error) {
      expect((error as PrincipalAuthError).reasonCode).toBe("DEV_MODE_FORBIDDEN");
    }
  });

  it("accepts ALLURA_MCP_TOKEN_SECRET in production", () => {
    const cfg = resolveHttpAuthConfig({
      NODE_ENV: "production",
      ALLURA_MCP_TOKEN_SECRET: "0123456789abcdefghij",
    });
    expect(cfg.mode).toBe("mcp_token");
  });

  it("accepts the legacy shared token in production", () => {
    const cfg = resolveHttpAuthConfig({ NODE_ENV: "production", ALLURA_MCP_AUTH_TOKEN: "s3cr3t" });
    expect(cfg.mode).toBe("shared_token");
  });

  it("rejects a too-short token secret as a credential configuration", () => {
    expect(() => resolveHttpAuthConfig({ NODE_ENV: "production", ALLURA_MCP_TOKEN_SECRET: "short" }))
      .toThrow(/No supported MCP authentication configuration/);
  });

  it("refuses to start unauthenticated even in development without an explicit opt-in", () => {
    expect(() => resolveHttpAuthConfig({ NODE_ENV: "development" }))
      .toThrow(/ALLURA_MCP_DEV_AUTH=true/);
  });

  it("activates dev-local only with the explicit opt-in outside production", () => {
    const cfg = resolveHttpAuthConfig({ NODE_ENV: "development", ALLURA_MCP_DEV_AUTH: "true" });
    expect(cfg.mode).toBe("dev_local");
  });

  it("caps the credential cache TTL and defaults it to 0 (revocation next request)", () => {
    expect(resolveHttpAuthConfig({ ALLURA_MCP_DEV_AUTH: "true" }).cacheTtlMs).toBe(0);
    expect(
      resolveHttpAuthConfig({ ALLURA_MCP_DEV_AUTH: "true", ALLURA_MCP_AUTH_CACHE_TTL_MS: "999999" })
        .cacheTtlMs,
    ).toBe(60_000);
  });
});

describe("AC-6: stdio/service mode requires explicit identity and tenant allowlist", () => {
  it("refuses production stdio without a service principal id", () => {
    expect(() => resolveServiceAuthConfig({ NODE_ENV: "production" }))
      .toThrow(/ALLURA_MCP_SERVICE_PRINCIPAL_ID is required/);
  });

  it("refuses production stdio without a tenant allowlist", () => {
    expect(() =>
      resolveServiceAuthConfig({ NODE_ENV: "production", ALLURA_MCP_SERVICE_PRINCIPAL_ID: "svc-memory" }),
    ).toThrow(/ALLURA_MCP_SERVICE_TENANTS is required/);
  });

  it("refuses a wildcard tenant allowlist in production", () => {
    expect(() =>
      resolveServiceAuthConfig({
        NODE_ENV: "production",
        ALLURA_MCP_SERVICE_PRINCIPAL_ID: "svc-memory",
        ALLURA_MCP_SERVICE_TENANTS: "*",
      }),
    ).toThrow(/may not contain the wildcard/);
  });

  it("binds an explicit production service principal", () => {
    const cfg = resolveServiceAuthConfig({
      NODE_ENV: "production",
      ALLURA_MCP_SERVICE_PRINCIPAL_ID: "svc-memory",
      ALLURA_MCP_SERVICE_TENANTS: "allura-system,allura-mortagate",
      ALLURA_MCP_SERVICE_ROLES: "curator",
    });
    const principal = createServicePrincipal(cfg, "sess-stdio");
    expect(principal.authMethod).toBe("service_identity");
    expect(principal.principalId).toBe("svc-memory");
    expect(principal.tenantIds).toEqual(["allura-system", "allura-mortagate"]);
    expect(principal.roles).toEqual(["curator"]);
  });

  it("falls back to a dev-local stdio principal outside production", () => {
    const cfg = resolveServiceAuthConfig({ NODE_ENV: "test" });
    expect(cfg.authMethod).toBe("dev_local");
    expect(createServicePrincipal(cfg, "s").authMethod).toBe("dev_local");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSARIAL MATRIX (AC-9)
// ─────────────────────────────────────────────────────────────────────────────

interface AttackOutcome {
  status: number;
  reason: AuthReasonCode | "OK";
  auditEventId: string;
}

/**
 * Full request simulation: authenticate, then guard the tool dispatch, then
 * project the decision into an audit event. This mirrors the gateway exactly.
 */
async function simulateRequest(
  auth: McpAuthenticator,
  headers: Record<string, string | string[] | undefined>,
  toolName: string,
  args: unknown,
): Promise<{ outcome: AttackOutcome; principal: PrincipalContext | null; args?: Record<string, unknown> }> {
  let principal: PrincipalContext | null = null;
  try {
    principal = await auth.authenticate(headers);
    const guarded = guardToolCall(principal, toolName, args);
    const event = buildAuthAuditEvent({
      principal,
      tool: toolName,
      decision: "allow",
      effectiveTenant: guarded.effectiveTenant,
      now: NOW,
    });
    return {
      outcome: { status: 200, reason: "OK", auditEventId: auditId(event.session_id, toolName, event.reason_code) },
      principal,
      args: guarded.args,
    };
  } catch (error) {
    const err = error as PrincipalAuthError;
    const event = buildAuthAuditEvent({
      principal,
      tool: toolName,
      decision: "deny",
      reasonCode: err.reasonCode,
      now: NOW,
    });
    return {
      outcome: {
        status: err.httpStatus,
        reason: err.reasonCode,
        auditEventId: auditId(event.session_id, toolName, event.reason_code),
      },
      principal,
    };
  }
}

function auditId(sessionId: string, tool: string, reason: string): string {
  return `evt:${sessionId}:${tool}:${reason}`;
}

describe("AC-9: adversarial matrix", () => {
  let auth: McpAuthenticator;

  beforeEach(() => {
    auth = new McpAuthenticator(tokenConfig(), deps());
  });

  it("case 1 — missing auth: 401 AUTH_MISSING", async () => {
    const { outcome } = await simulateRequest(auth, {}, "memory_search", { group_id: "allura-system" });
    expect(outcome.status).toBe(401);
    expect(outcome.reason).toBe("AUTH_MISSING");
  });

  it.each([
    ["empty scheme", "justatoken"],
    ["wrong scheme", "Basic dXNlcjpwYXNz"],
    ["bearer without token", "Bearer"],
    ["bearer with only spaces", "Bearer    "],
    ["lowercase scheme", "bearer abc"],
    ["token with embedded space", "Bearer abc def"],
  ])("case 2 — malformed auth (%s): 401 AUTH_MALFORMED", async (_label, header) => {
    const { outcome } = await simulateRequest(
      auth,
      { authorization: header },
      "memory_search",
      { group_id: "allura-system" },
    );
    expect(outcome.status).toBe(401);
    expect(outcome.reason).toBe("AUTH_MALFORMED");
  });

  it("case 3 — forged role: 403 ROLE_INSUFFICIENT", async () => {
    const { outcome } = await simulateRequest(auth, bearer(RAW_VIEWER), "governance_curator_pass", {
      group_id: "allura-system",
      mode: "auto",
      role: "admin",
      curator_id: "agent-viewer",
    });
    expect(outcome.status).toBe(403);
    expect(outcome.reason).toBe("ROLE_INSUFFICIENT");
  });

  it("case 3b — role in params is stripped even when it is legitimate", async () => {
    const { args } = await simulateRequest(auth, bearer(RAW_CURATOR), "governance_curator_pass", {
      group_id: "allura-system",
      mode: "review",
      role: "admin",
    });
    expect(args).not.toHaveProperty("role");
  });

  it("case 4 — forged tenant: 403 TENANT_MISMATCH", async () => {
    const { outcome } = await simulateRequest(auth, bearer(RAW_VIEWER), "memory_search", {
      group_id: "allura-mortagate",
      query: "secrets",
    });
    expect(outcome.status).toBe(403);
    expect(outcome.reason).toBe("TENANT_MISMATCH");
  });

  it("case 4b — a token bound to another tenant cannot reach allura-system", async () => {
    const { outcome } = await simulateRequest(auth, bearer(RAW_ADMIN), "memory_search", {
      group_id: "allura-system",
    });
    expect(outcome.reason).toBe("TENANT_MISMATCH");
  });

  it("case 5 — forged curator id: 403 ACTOR_MISMATCH", async () => {
    const { outcome } = await simulateRequest(auth, bearer(RAW_CURATOR), "governance_proposal_approve", {
      group_id: "allura-system",
      proposal_id: "prop-1",
      curator_id: "sabir-the-owner",
    });
    expect(outcome.status).toBe(403);
    expect(outcome.reason).toBe("ACTOR_MISMATCH");
  });

  it("case 5b — segregation of duties still works from the derived curator id", async () => {
    const { args } = await simulateRequest(auth, bearer(RAW_CURATOR), "governance_proposal_approve", {
      group_id: "allura-system",
      proposal_id: "prop-1",
    });
    // approval-audit.ts compares requested_by === curator_id; the derived value
    // is the authenticated principal, so self-approval is still detectable.
    expect(args?.curator_id).toBe("agent-curator");
  });

  it("case 6 — revoked token: 401 AUTH_REVOKED", async () => {
    const { outcome } = await simulateRequest(auth, bearer(RAW_REVOKED), "memory_search", {
      group_id: "allura-system",
    });
    expect(outcome.status).toBe(401);
    expect(outcome.reason).toBe("AUTH_REVOKED");
  });

  it("case 7 — expired token: 401 AUTH_EXPIRED", async () => {
    const { outcome } = await simulateRequest(auth, bearer(RAW_EXPIRED), "memory_search", {
      group_id: "allura-system",
    });
    expect(outcome.status).toBe(401);
    expect(outcome.reason).toBe("AUTH_EXPIRED");
  });

  it("case 8 — valid least-privilege access: 200 OK", async () => {
    const { outcome, principal, args } = await simulateRequest(auth, bearer(RAW_VIEWER), "memory_search", {
      group_id: "allura-system",
      query: "controlPlane",
    });
    expect(outcome.status).toBe(200);
    expect(outcome.reason).toBe("OK");
    expect(principal?.principalId).toBe("agent-viewer");
    expect(principal?.roles).toEqual(["viewer"]);
    expect(principal?.authMethod).toBe("mcp_token");
    expect(args?.group_id).toBe("allura-system");
    expect(args?.query).toBe("controlPlane");
  });

  it("case 9 — unknown token: 401 AUTH_INVALID", async () => {
    const { outcome } = await simulateRequest(auth, bearer(RAW_UNKNOWN), "memory_search", {
      group_id: "allura-system",
    });
    expect(outcome.status).toBe(401);
    expect(outcome.reason).toBe("AUTH_INVALID");
  });

  it("case 10 — right prefix, wrong body: 401 AUTH_INVALID", async () => {
    const forged = `${RAW_VIEWER.slice(0, 18)}TAMPERED_BODY_XXXXXXXXX`;
    const { outcome } = await simulateRequest(auth, bearer(forged), "memory_search", {
      group_id: "allura-system",
    });
    expect(outcome.status).toBe(401);
    expect(outcome.reason).toBe("AUTH_INVALID");
  });

  it("every attack case produces an audit event id and never leaks the token", async () => {
    const cases: Array<[Record<string, string>, string, unknown]> = [
      [{}, "memory_search", {}],
      [{ authorization: "Basic x" }, "memory_search", {}],
      [bearer(RAW_VIEWER), "governance_curator_pass", { mode: "auto" }],
      [bearer(RAW_VIEWER), "memory_search", { group_id: "allura-mortagate" }],
      [bearer(RAW_CURATOR), "governance_proposal_approve", { curator_id: "someone" }],
      [bearer(RAW_REVOKED), "memory_search", {}],
      [bearer(RAW_EXPIRED), "memory_search", {}],
      [bearer(RAW_VIEWER), "memory_search", {}],
    ];
    for (const [headers, tool, args] of cases) {
      const { outcome } = await simulateRequest(auth, headers, tool, args);
      expect(outcome.auditEventId).toMatch(/^evt:/);
      expect(outcome.auditEventId).not.toMatch(/allura_mcp_/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REVOCATION AND EXPIRY (AC-8)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-8: revocation and expiry take effect per the documented cache policy", () => {
  it("with the default TTL of 0, revocation fails on the very next request", async () => {
    const auth = new McpAuthenticator(tokenConfig(), deps());
    const first = await auth.authenticate(bearer(RAW_VIEWER));
    expect(first.principalId).toBe("agent-viewer");

    // Revoke in place (never delete — additive lifecycle column).
    const row = store.get(fakePrefix(RAW_VIEWER))!;
    store.set(fakePrefix(RAW_VIEWER), { ...row, revoked_at: "2026-08-15T11:59:00.000Z" });

    await expect(auth.authenticate(bearer(RAW_VIEWER))).rejects.toMatchObject({
      reasonCode: "AUTH_REVOKED",
    });
  });

  it("expiry is evaluated against the live clock even when caching is enabled", async () => {
    const cfg = tokenConfig({ } as Partial<HttpAuthConfig>);
    const cached: HttpAuthConfig = { ...cfg, cacheTtlMs: 60_000 };
    let now = new Date("2026-08-15T12:00:00.000Z");
    const auth = new McpAuthenticator(cached, { ...deps(), now: () => now });

    const row = store.get(fakePrefix(RAW_VIEWER))!;
    store.set(fakePrefix(RAW_VIEWER), { ...row, expires_at: "2026-08-15T12:00:30.000Z" });

    await expect(auth.authenticate(bearer(RAW_VIEWER))).resolves.toMatchObject({
      principalId: "agent-viewer",
    });

    now = new Date("2026-08-15T12:01:00.000Z");
    await expect(auth.authenticate(bearer(RAW_VIEWER))).rejects.toMatchObject({
      reasonCode: "AUTH_EXPIRED",
    });
  });

  it("a token expiring exactly now is treated as expired", async () => {
    const row = store.get(fakePrefix(RAW_VIEWER))!;
    store.set(fakePrefix(RAW_VIEWER), { ...row, expires_at: NOW.toISOString() });
    const auth = new McpAuthenticator(tokenConfig(), deps());
    await expect(auth.authenticate(bearer(RAW_VIEWER))).rejects.toMatchObject({
      reasonCode: "AUTH_EXPIRED",
    });
  });

  it("records last-used bookkeeping for a valid credential", async () => {
    const auth = new McpAuthenticator(tokenConfig(), deps());
    await auth.authenticate(bearer(RAW_VIEWER));
    await new Promise((r) => setTimeout(r, 0));
    expect(touched).toContain(`tok_${RAW_VIEWER.slice(11, 18)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIAL HANDLING PRIMITIVES (AC-2)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: credential comparison and storage", () => {
  it("timingSafeCompare matches equal strings and rejects others", () => {
    expect(timingSafeCompare("abcdef", "abcdef")).toBe(true);
    expect(timingSafeCompare("abcdef", "abcdeg")).toBe(false);
    expect(timingSafeCompare("abcdef", "abc")).toBe(false);
    expect(timingSafeCompare("", "")).toBe(true);
  });

  it("the resolved principal carries the credential row id, never the token", async () => {
    const auth = new McpAuthenticator(tokenConfig(), deps());
    const principal = await auth.authenticate(bearer(RAW_CURATOR));
    expect(principal.credentialId).toBe(`tok_${RAW_CURATOR.slice(11, 18)}`);
    expect(JSON.stringify(principal)).not.toContain(RAW_CURATOR);
    expect(JSON.stringify(principal)).not.toContain("hash::");
  });

  it("extractBearerToken returns null for an absent header and throws for a malformed one", () => {
    expect(extractBearerToken({})).toBeNull();
    expect(extractBearerToken({ authorization: "" })).toBeNull();
    expect(extractBearerToken({ authorization: "Bearer abc" })).toBe("abc");
    expect(extractBearerToken({ authorization: ["Bearer abc"] })).toBe("abc");
    expect(() => extractBearerToken({ authorization: "Token abc" })).toThrow(/Bearer <token>/);
  });
});

describe("scope to role mapping is least privilege", () => {
  it.each([
    [[], []],
    [["memory:write"], ["viewer"]],
    [["memory:read"], ["viewer"]],
    [["memory:read", "review:approve"], ["viewer", "curator"]],
    [["admin:roles"], ["viewer", "admin"]],
    [["memory:read", "memory:promote", "workspace:lock"], ["viewer", "curator", "admin"]],
    [["not:a:real:scope"], []],
  ])("%j -> %j", (scopes, expected) => {
    expect(rolesFromScopes(scopes as string[])).toEqual(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BACKWARD COMPATIBILITY (AC-10)
// ─────────────────────────────────────────────────────────────────────────────

// -----------------------------------------------------------------------------
// REVIEW FINDING 1 - session rebinding across same-named credentials
// -----------------------------------------------------------------------------

describe("Finding 1: two credentials sharing an agent_name are distinct principals", () => {
  const RAW_CURSOR_A = "allura_mcp_cursoraaa00000000000000000";
  const RAW_CURSOR_B = "allura_mcp_cursorbbb00000000000000000";

  beforeEach(() => {
    // Same agent_name "cursor", different tenants. mcp_tokens has NO uniqueness
    // constraint on agent_name - only token_prefix is unique.
    store.set(
      fakePrefix(RAW_CURSOR_A),
      record(RAW_CURSOR_A, {
        id: "tok_cursor_a",
        agent_name: "cursor",
        group_id: "allura-system",
        workspace_id: "ws-a",
        scopes: ["memory:read"],
      }),
    );
    store.set(
      fakePrefix(RAW_CURSOR_B),
      record(RAW_CURSOR_B, {
        id: "tok_cursor_b",
        agent_name: "cursor",
        group_id: "allura-mortagate",
        workspace_id: "ws-b",
        scopes: ["memory:read", "admin:roles"],
      }),
    );
  });

  it("resolves the same principalId but different credential identity", async () => {
    const auth = new McpAuthenticator(tokenConfig(), deps());
    const a = await auth.authenticate(bearer(RAW_CURSOR_A));
    const b = await auth.authenticate(bearer(RAW_CURSOR_B));

    expect(a.principalId).toBe("cursor");
    expect(b.principalId).toBe("cursor");
    expect(a.credentialId).not.toBe(b.credentialId);
    expect(a.tenantIds).toEqual(["allura-system"]);
    expect(b.tenantIds).toEqual(["allura-mortagate"]);
  });

  it("credential B must NOT be able to take over credential A's session", async () => {
    const auth = new McpAuthenticator(tokenConfig(), deps());
    const a = await auth.authenticate(bearer(RAW_CURSOR_A));
    const b = await auth.authenticate(bearer(RAW_CURSOR_B));

    // The old principalId-only check would have allowed this.
    expect(a.principalId === b.principalId).toBe(true);
    expect(canRebindSession(a, b)).toBe(false);
    expect(canRebindSession(b, a)).toBe(false);
  });

  it("credential A may continue its own session across requests", async () => {
    const auth = new McpAuthenticator(tokenConfig(), deps());
    const first = await auth.authenticate(bearer(RAW_CURSOR_A));
    const second = await auth.authenticate(bearer(RAW_CURSOR_A));
    expect(canRebindSession(first, second)).toBe(true);
  });

  it("a hijacked session cannot reach the other tenant's data even if rebinding were attempted", async () => {
    const auth = new McpAuthenticator(tokenConfig(), deps());
    const b = await auth.authenticate(bearer(RAW_CURSOR_B));
    // Defence in depth: even holding a session, B's principal cannot select A's tenant.
    expect(() => guardToolCall(b, "memory_search", { group_id: "allura-system" })).toThrow(
      /not authorized for tenant/,
    );
  });
});

// -----------------------------------------------------------------------------
// REVIEW FINDING 5 - shared token is inert once mcp_token mode is active
// -----------------------------------------------------------------------------

describe("Finding 5: leftover shared token does not bypass per-credential revocation", () => {
  const envBoth = {
    NODE_ENV: "test",
    ALLURA_MCP_TOKEN_SECRET: "0123456789abcdefghij",
    ALLURA_MCP_AUTH_TOKEN: "leftover-shared-token",
  };

  it("selects mcp_token mode when both are configured", () => {
    expect(resolveHttpAuthConfig(envBoth).mode).toBe("mcp_token");
  });

  it("warns loudly that the shared token is ignored", () => {
    const warnings = resolveHttpAuthConfig(envBoth).warnings.join(" ");
    expect(warnings).toMatch(/ALLURA_MCP_AUTH_TOKEN is set but IGNORED/);
  });

  it("REFUSES the leftover shared token in mcp_token mode", async () => {
    const auth = new McpAuthenticator(resolveHttpAuthConfig(envBoth), deps());
    await expect(auth.authenticate(bearer("leftover-shared-token"))).rejects.toMatchObject({
      reasonCode: "AUTH_INVALID",
    });
  });

  it("still accepts a real mcp_tokens credential in that same mode", async () => {
    const auth = new McpAuthenticator(resolveHttpAuthConfig(envBoth), deps());
    await expect(auth.authenticate(bearer(RAW_VIEWER))).resolves.toMatchObject({
      principalId: "agent-viewer",
    });
  });

  it("warns about the missing revocation path when shared_token mode is active", () => {
    const warnings = resolveHttpAuthConfig({
      NODE_ENV: "test",
      ALLURA_MCP_AUTH_TOKEN: "legacy-shared-token",
    }).warnings.join(" ");
    expect(warnings).toMatch(/NO revocation path/);
  });
});

describe("AC-10: existing flows keep working with principal context injected", () => {
  it("legacy shared bearer token still authenticates", async () => {
    const cfg = resolveHttpAuthConfig({
      NODE_ENV: "test",
      ALLURA_MCP_AUTH_TOKEN: "legacy-shared-token",
      ALLURA_MCP_SHARED_TOKEN_ROLES: "curator",
      ALLURA_MCP_SHARED_TOKEN_TENANTS: "allura-system",
      ALLURA_MCP_SHARED_TOKEN_PRINCIPAL: "legacy-client",
    });
    const auth = new McpAuthenticator(cfg, deps());
    const principal = await auth.authenticate(bearer("legacy-shared-token"));
    expect(principal.principalId).toBe("legacy-client");
    expect(principal.authMethod).toBe("service_identity");

    const guarded = guardToolCall(principal, "governance_proposal_approve", {
      group_id: "allura-system",
      proposal_id: "p1",
    });
    expect(guarded.args.curator_id).toBe("legacy-client");
  });

  it("a wrong shared token is refused", async () => {
    const cfg = resolveHttpAuthConfig({ NODE_ENV: "test", ALLURA_MCP_AUTH_TOKEN: "legacy-shared-token" });
    const auth = new McpAuthenticator(cfg, deps());
    await expect(auth.authenticate(bearer("guessed"))).rejects.toMatchObject({
      reasonCode: "AUTH_INVALID",
    });
  });

  it("tokenless local dev still works and grants the dev principal", async () => {
    const cfg = resolveHttpAuthConfig({ NODE_ENV: "development", ALLURA_MCP_DEV_AUTH: "true" });
    const auth = new McpAuthenticator(cfg, deps());
    const principal = await auth.authenticate({});
    expect(principal.authMethod).toBe("dev_local");
    const guarded = guardToolCall(principal, "governance_curator_pass", {
      group_id: "allura-anything",
      mode: "review",
      curator_id: "local-human",
    });
    expect(guarded.effectiveTenant).toBe("allura-anything");
    expect(guarded.args.curator_id).toBe("local-human");
  });

  it("dev-local never escalates based on a presented token value", async () => {
    const cfg = resolveHttpAuthConfig({
      NODE_ENV: "development",
      ALLURA_MCP_DEV_AUTH: "true",
      ALLURA_MCP_DEV_ROLES: "viewer",
    });
    const auth = new McpAuthenticator(cfg, deps());
    const principal = await auth.authenticate(bearer(RAW_ADMIN));
    expect(principal.roles).toEqual(["viewer"]);
    expect(principal.principalId).toBe("dev-local");
  });

  it("plain viewer credentials can read but cannot mutate memory", async () => {
    const auth = new McpAuthenticator(tokenConfig(), deps());
    const principal = await auth.authenticate(bearer(RAW_VIEWER));
    for (const tool of ["memory_search", "memory_get", "memory_list", "memory_export"]) {
      expect(() => guardToolCall(principal, tool, { group_id: "allura-system" })).not.toThrow();
    }
    expect(() => guardToolCall(principal, "memory_add", { group_id: "allura-system" })).toThrow(/requires scope/);
  });
});
