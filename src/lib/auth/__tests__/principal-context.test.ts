/**
 * Story 24.2 — PrincipalContext unit contract tests.
 *
 * Pure logic. No database, no HTTP server, no live infrastructure.
 */

import { describe, expect, it } from "vitest";
import {
  ACTOR_FIELDS,
  applyPrincipalToArgs,
  authorizeToolCall,
  buildAuthAuditEvent,
  canRebindSession,
  createPrincipalContext,
  ELEVATED_TOOLS,
  isElevatedTool,
  isValidTenantId,
  PrincipalAuthError,
  type PrincipalContext,
  resolveEffectiveActor,
  resolveEffectiveTenant,
  STRIPPED_AUTHORITY_KEYS,
} from "../principal-context";

function tokenPrincipal(overrides: Partial<Parameters<typeof createPrincipalContext>[0]> = {}): PrincipalContext {
  return createPrincipalContext({
    principalId: "agent-scout",
    tenantIds: ["allura-system"],
    roles: ["viewer"],
    authMethod: "mcp_token",
    sessionId: "sess-1",
    credentialId: "tok_abc",
    ...overrides,
  });
}

describe("createPrincipalContext", () => {
  it("freezes the principal and its arrays (AC-3)", () => {
    const p = tokenPrincipal();
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.roles)).toBe(true);
    expect(Object.isFrozen(p.tenantIds)).toBe(true);

    expect(() => {
      (p as { principalId: string }).principalId = "attacker";
    }).toThrow();
    expect(p.principalId).toBe("agent-scout");
  });

  it("drops unrecognised role strings instead of honouring them", () => {
    const p = tokenPrincipal({ roles: ["superuser", "root", "curator"] });
    expect(p.roles).toEqual(["curator"]);
  });

  it("normalises role order least -> most privileged", () => {
    const p = tokenPrincipal({ roles: ["admin", "viewer", "curator"] });
    expect(p.roles).toEqual(["viewer", "curator", "admin"]);
  });

  it("rejects an empty tenant allowlist", () => {
    expect(() => tokenPrincipal({ tenantIds: [] })).toThrow(PrincipalAuthError);
  });

  it("rejects a malformed tenant id", () => {
    expect(() => tokenPrincipal({ tenantIds: ["evil-corp"] })).toThrow(/Invalid tenant id/);
  });

  it("refuses the wildcard tenant for mcp_token principals", () => {
    expect(() => tokenPrincipal({ tenantIds: ["*"] })).toThrow(/Wildcard tenant is not permitted/);
  });

  it("allows the wildcard tenant for dev_local", () => {
    const p = createPrincipalContext({
      principalId: "dev-local",
      tenantIds: ["*"],
      roles: ["admin"],
      authMethod: "dev_local",
      sessionId: "sess-dev",
    });
    expect(p.tenantIds).toEqual(["*"]);
  });

  it("requires principalId and sessionId", () => {
    expect(() => tokenPrincipal({ principalId: "  " })).toThrow(/principalId is required/);
    expect(() => tokenPrincipal({ sessionId: "" })).toThrow(/sessionId is required/);
  });

  it("never carries token material", () => {
    const p = tokenPrincipal();
    const serialized = JSON.stringify(p);
    expect(serialized).not.toMatch(/token_hash|secret|allura_mcp_/);
    expect(p.credentialId).toBe("tok_abc");
  });
});

describe("isValidTenantId", () => {
  it.each([
    ["allura-system", true],
    ["allura-mortagate", true],
    ["allura-a", true],
    ["allura-", false],
    ["allura-System", false],
    ["system", false],
    ["allura-x-", false],
    ["", false],
  ])("%s -> %s", (value, expected) => {
    expect(isValidTenantId(value)).toBe(expected);
  });
});

describe("authorizeToolCall (AC-5)", () => {
  it("permits non-elevated tools for a viewer", () => {
    expect(() => authorizeToolCall(tokenPrincipal(), "memory_search")).not.toThrow();
  });

  it.each([...ELEVATED_TOOLS])("denies %s to a viewer", (tool) => {
    try {
      authorizeToolCall(tokenPrincipal({ roles: ["viewer"] }), tool);
      throw new Error("expected refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(PrincipalAuthError);
      expect((error as PrincipalAuthError).reasonCode).toBe("ROLE_INSUFFICIENT");
      expect((error as PrincipalAuthError).httpStatus).toBe(403);
    }
  });

  it.each([...ELEVATED_TOOLS])("permits %s to a curator", (tool) => {
    expect(() => authorizeToolCall(tokenPrincipal({ roles: ["curator"] }), tool)).not.toThrow();
  });

  it.each([...ELEVATED_TOOLS])("permits %s to an admin", (tool) => {
    expect(() => authorizeToolCall(tokenPrincipal({ roles: ["admin"] }), tool)).not.toThrow();
  });

  it("denies when the principal has no roles at all", () => {
    const p = tokenPrincipal({ roles: [] });
    expect(() => authorizeToolCall(p, "governance_curator_pass")).toThrow(/requires role admin or curator/);
  });

  it("refuses with PRINCIPAL_MISSING when no principal is supplied", () => {
    expect(() => authorizeToolCall(undefined as unknown as PrincipalContext, "memory_add"))
      .toThrow(/No verified principal/);
  });

  it("recognises exactly the four elevated tools", () => {
    expect([...ELEVATED_TOOLS].sort()).toEqual([
      "governance_curator_pass",
      "governance_proposal_approve",
      "governance_proposal_reject",
      "governance_update_policy",
    ]);
    expect(isElevatedTool("memory_add")).toBe(false);
  });
});

describe("resolveEffectiveTenant (AC-4)", () => {
  it("falls back to the principal default when no selector is given", () => {
    expect(resolveEffectiveTenant(tokenPrincipal(), undefined)).toBe("allura-system");
    expect(resolveEffectiveTenant(tokenPrincipal(), "")).toBe("allura-system");
  });

  it("accepts a selector inside the allowlist", () => {
    const p = tokenPrincipal({ tenantIds: ["allura-system", "allura-mortagate"] });
    expect(resolveEffectiveTenant(p, "allura-mortagate")).toBe("allura-mortagate");
  });

  it("rejects a selector outside the allowlist with TENANT_MISMATCH", () => {
    try {
      resolveEffectiveTenant(tokenPrincipal(), "allura-othertenant");
      throw new Error("expected refusal");
    } catch (error) {
      expect((error as PrincipalAuthError).reasonCode).toBe("TENANT_MISMATCH");
      expect((error as PrincipalAuthError).httpStatus).toBe(403);
    }
  });

  it("rejects a malformed selector even for a wildcard principal", () => {
    const p = createPrincipalContext({
      principalId: "dev",
      tenantIds: ["*"],
      roles: ["admin"],
      authMethod: "dev_local",
      sessionId: "s",
    });
    expect(() => resolveEffectiveTenant(p, "DROP TABLE events")).toThrow(/Invalid group_id/);
    expect(resolveEffectiveTenant(p, "allura-anything")).toBe("allura-anything");
  });

  it("rejects a non-string selector", () => {
    expect(() => resolveEffectiveTenant(tokenPrincipal(), { toString: () => "allura-system" }))
      .toThrow(/must be a string/);
  });
});

describe("resolveEffectiveActor (AC-4)", () => {
  it("injects the principal id when the selector is absent", () => {
    expect(resolveEffectiveActor(tokenPrincipal(), "curator_id", undefined)).toBe("agent-scout");
  });

  it("accepts a matching selector", () => {
    expect(resolveEffectiveActor(tokenPrincipal(), "curator_id", "agent-scout")).toBe("agent-scout");
  });

  it("rejects a forged curator id with ACTOR_MISMATCH", () => {
    try {
      resolveEffectiveActor(tokenPrincipal(), "curator_id", "sabir-the-boss");
      throw new Error("expected refusal");
    } catch (error) {
      expect((error as PrincipalAuthError).reasonCode).toBe("ACTOR_MISMATCH");
    }
  });

  it("allows an override only under dev_local", () => {
    const dev = createPrincipalContext({
      principalId: "dev-local",
      tenantIds: ["*"],
      roles: ["admin"],
      authMethod: "dev_local",
      sessionId: "s",
    });
    expect(resolveEffectiveActor(dev, "curator_id", "local-human")).toBe("local-human");
  });

  it("does not allow an override for service_identity", () => {
    const svc = createPrincipalContext({
      principalId: "svc-memory",
      tenantIds: ["allura-system"],
      roles: ["curator"],
      authMethod: "service_identity",
      sessionId: "s",
    });
    expect(() => resolveEffectiveActor(svc, "curator_id", "someone-else")).toThrow(/does not match/);
  });
});

describe("applyPrincipalToArgs (AC-3, AC-4, AC-5)", () => {
  it("strips every caller-supplied authority key", () => {
    const { args } = applyPrincipalToArgs(tokenPrincipal(), "memory_search", {
      group_id: "allura-system",
      query: "x",
      role: "admin",
      roles: ["admin"],
      principal: { principalId: "root" },
      principal_context: { roles: ["admin"] },
      auth_method: "mcp_token",
      session_id: "forged",
    });
    for (const key of STRIPPED_AUTHORITY_KEYS) {
      expect(args).not.toHaveProperty(key);
    }
    expect(args.query).toBe("x");
  });

  it("does not mutate the caller's object", () => {
    const original = { group_id: "allura-system", role: "admin" };
    applyPrincipalToArgs(tokenPrincipal(), "memory_search", original);
    expect(original.role).toBe("admin");
  });

  it("forces group_id to the reconciled effective tenant", () => {
    const p = tokenPrincipal({ tenantIds: ["allura-system", "allura-mortagate"] });
    const { args, effectiveTenant } = applyPrincipalToArgs(p, "memory_add", {
      group_id: "allura-mortagate",
      content: "c",
    });
    expect(args.group_id).toBe("allura-mortagate");
    expect(effectiveTenant).toBe("allura-mortagate");
  });

  it("injects group_id when the caller omits it", () => {
    const { args } = applyPrincipalToArgs(tokenPrincipal(), "memory_list", {});
    expect(args.group_id).toBe("allura-system");
  });

  it("refuses a forged tenant selector", () => {
    expect(() =>
      applyPrincipalToArgs(tokenPrincipal(), "memory_add", { group_id: "allura-victim" }),
    ).toThrow(/not authorized for tenant/);
  });

  it("refuses a forged curator_id", () => {
    const p = tokenPrincipal({ roles: ["curator"] });
    expect(() =>
      applyPrincipalToArgs(p, "governance_proposal_approve", {
        group_id: "allura-system",
        proposal_id: "p1",
        curator_id: "someone-important",
      }),
    ).toThrow(/does not match the authenticated principal/);
  });

  it("injects curator_id for elevated tools when omitted (AC-10 compatibility)", () => {
    const p = tokenPrincipal({ roles: ["curator"] });
    const { args, actors } = applyPrincipalToArgs(p, "governance_proposal_approve", {
      group_id: "allura-system",
      proposal_id: "p1",
    });
    expect(args.curator_id).toBe("agent-scout");
    expect(actors.curator_id).toBe("agent-scout");
  });

  it("does not inject curator_id into non-elevated tools", () => {
    const { args } = applyPrincipalToArgs(tokenPrincipal(), "memory_search", { query: "q" });
    expect(args).not.toHaveProperty("curator_id");
  });

  it("reconciles every actor field that is present", () => {
    const p = tokenPrincipal({ roles: ["curator"] });
    const supplied: Record<string, unknown> = { group_id: "allura-system" };
    for (const field of ACTOR_FIELDS) supplied[field] = "agent-scout";
    const { args } = applyPrincipalToArgs(p, "memory_add", supplied);
    for (const field of ACTOR_FIELDS) expect(args[field]).toBe("agent-scout");
  });

  it("tolerates non-object arguments", () => {
    const { args } = applyPrincipalToArgs(tokenPrincipal(), "memory_list", undefined);
    expect(args.group_id).toBe("allura-system");
  });
});

describe("buildAuthAuditEvent (AC-7)", () => {
  it("records principal, tenant, roles, session, tool, decision and reason code", () => {
    const p = tokenPrincipal({ roles: ["curator"] });
    const event = buildAuthAuditEvent({
      principal: p,
      tool: "governance_proposal_approve",
      decision: "allow",
      effectiveTenant: "allura-system",
      now: new Date("2026-08-15T00:00:00.000Z"),
    });
    expect(event).toEqual({
      principal_id: "agent-scout",
      effective_tenant: "allura-system",
      roles: ["curator"],
      session_id: "sess-1",
      tool: "governance_proposal_approve",
      decision: "allow",
      reason_code: "OK",
      auth_method: "mcp_token",
      credential_id: "tok_abc",
      occurred_at: "2026-08-15T00:00:00.000Z",
    });
  });

  it("records a denial for an unauthenticated caller without inventing identity", () => {
    const event = buildAuthAuditEvent({
      principal: null,
      tool: "memory_add",
      decision: "deny",
      reasonCode: "AUTH_MISSING",
    });
    expect(event.principal_id).toBe("anonymous");
    expect(event.auth_method).toBe("none");
    expect(event.credential_id).toBeNull();
    expect(event.reason_code).toBe("AUTH_MISSING");
  });

  it("never exposes credential material", () => {
    const event = buildAuthAuditEvent({ principal: tokenPrincipal(), tool: "memory_get", decision: "allow" });
    expect(JSON.stringify(event)).not.toMatch(/allura_mcp_|token_hash|Bearer/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW FINDING 4 — workspace_id is authority-shaped
// ─────────────────────────────────────────────────────────────────────────────

describe("workspace_id reconciliation (review Finding 4)", () => {
  it("lists workspace_id as a stripped authority key", () => {
    expect(STRIPPED_AUTHORITY_KEYS).toContain("workspace_id");
  });

  it("injects the credential-bound workspace when the caller omits it", () => {
    const p = tokenPrincipal({ workspaceId: "ws-main" });
    const { args } = applyPrincipalToArgs(p, "memory_add", { group_id: "allura-system" });
    expect(args.workspace_id).toBe("ws-main");
  });

  it("accepts a matching workspace selector", () => {
    const p = tokenPrincipal({ workspaceId: "ws-main" });
    const { args } = applyPrincipalToArgs(p, "memory_add", { workspace_id: "ws-main" });
    expect(args.workspace_id).toBe("ws-main");
  });

  it("refuses a forged workspace selector", () => {
    const p = tokenPrincipal({ workspaceId: "ws-main" });
    try {
      applyPrincipalToArgs(p, "memory_add", { workspace_id: "ws-someone-else" });
      throw new Error("expected refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(PrincipalAuthError);
      expect((error as PrincipalAuthError).reasonCode).toBe("TENANT_MISMATCH");
    }
  });

  it("drops a caller-supplied workspace when the principal has none", () => {
    const p = tokenPrincipal();
    const { args } = applyPrincipalToArgs(p, "memory_add", { workspace_id: "ws-invented" });
    expect(args).not.toHaveProperty("workspace_id");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW FINDING 1 — session rebinding must compare credential identity
// ─────────────────────────────────────────────────────────────────────────────

describe("canRebindSession (review Finding 1)", () => {
  const sessionOwner = tokenPrincipal({
    principalId: "cursor",
    tenantIds: ["allura-system"],
    roles: ["curator"],
    credentialId: "tok_alpha",
    workspaceId: "ws-a",
  });

  it("allows the same credential to continue its own session", () => {
    const sameCredential = tokenPrincipal({
      principalId: "cursor",
      tenantIds: ["allura-system"],
      roles: ["curator"],
      credentialId: "tok_alpha",
      workspaceId: "ws-a",
      sessionId: "sess-2",
    });
    expect(canRebindSession(sessionOwner, sameCredential)).toBe(true);
  });

  it("REFUSES a different credential that shares the same agent_name", () => {
    // The exact attack: mcp_tokens.agent_name has no uniqueness constraint, so
    // two tenants can both mint a token named "cursor".
    const impostor = tokenPrincipal({
      principalId: "cursor",
      tenantIds: ["allura-mortagate"],
      roles: ["admin"],
      credentialId: "tok_beta",
      workspaceId: "ws-b",
      sessionId: "sess-3",
    });
    expect(impostor.principalId).toBe(sessionOwner.principalId);
    expect(canRebindSession(sessionOwner, impostor)).toBe(false);
  });

  it("refuses a same-name credential even when tenant and roles happen to match", () => {
    const impostor = tokenPrincipal({
      principalId: "cursor",
      tenantIds: ["allura-system"],
      roles: ["curator"],
      credentialId: "tok_beta",
      workspaceId: "ws-a",
    });
    expect(canRebindSession(sessionOwner, impostor)).toBe(false);
  });

  it("refuses when the authority envelope widens under the same credential id", () => {
    const escalated = tokenPrincipal({
      principalId: "cursor",
      tenantIds: ["allura-system", "allura-mortagate"],
      roles: ["curator"],
      credentialId: "tok_alpha",
      workspaceId: "ws-a",
    });
    expect(canRebindSession(sessionOwner, escalated)).toBe(false);

    const roleEscalated = tokenPrincipal({
      principalId: "cursor",
      tenantIds: ["allura-system"],
      roles: ["curator", "admin"],
      credentialId: "tok_alpha",
      workspaceId: "ws-a",
    });
    expect(canRebindSession(sessionOwner, roleEscalated)).toBe(false);
  });

  it("refuses a workspace change under the same credential id", () => {
    const moved = tokenPrincipal({
      principalId: "cursor",
      tenantIds: ["allura-system"],
      roles: ["curator"],
      credentialId: "tok_alpha",
      workspaceId: "ws-b",
    });
    expect(canRebindSession(sessionOwner, moved)).toBe(false);
  });

  it("refuses when there is no incumbent principal", () => {
    expect(canRebindSession(null, sessionOwner)).toBe(false);
    expect(canRebindSession(undefined, sessionOwner)).toBe(false);
  });

  it("refuses a credential-backed principal taking over a dev_local session", () => {
    const dev = createPrincipalContext({
      principalId: "cursor",
      tenantIds: ["allura-system"],
      roles: ["curator"],
      authMethod: "dev_local",
      sessionId: "s",
    });
    expect(canRebindSession(dev, sessionOwner)).toBe(false);
    expect(canRebindSession(sessionOwner, dev)).toBe(false);
  });

  it("falls back to identity for configuration-derived principals", () => {
    const svcA = createPrincipalContext({
      principalId: "svc-memory",
      tenantIds: ["allura-system"],
      roles: ["curator"],
      authMethod: "service_identity",
      sessionId: "s1",
    });
    const svcSame = createPrincipalContext({
      principalId: "svc-memory",
      tenantIds: ["allura-system"],
      roles: ["curator"],
      authMethod: "service_identity",
      sessionId: "s2",
    });
    const svcOther = createPrincipalContext({
      principalId: "svc-other",
      tenantIds: ["allura-system"],
      roles: ["curator"],
      authMethod: "service_identity",
      sessionId: "s3",
    });
    expect(canRebindSession(svcA, svcSame)).toBe(true);
    expect(canRebindSession(svcA, svcOther)).toBe(false);
  });

  it("is order-insensitive for tenant and role sets", () => {
    const a = tokenPrincipal({
      tenantIds: ["allura-system", "allura-mortagate"],
      roles: ["admin", "curator"],
      credentialId: "tok_x",
    });
    const b = tokenPrincipal({
      tenantIds: ["allura-mortagate", "allura-system"],
      roles: ["curator", "admin"],
      credentialId: "tok_x",
    });
    expect(canRebindSession(a, b)).toBe(true);
  });
});
