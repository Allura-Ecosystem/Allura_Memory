/**
 * PrincipalContext — the trusted identity contract for MCP transports.
 *
 * Story 24.2 (Epic 24 — Agentic AI Framework and Harness Portfolio Readiness).
 *
 * IRON LAW: every field on a PrincipalContext originates from a *verified*
 * credential (hashed MCP token), an explicitly configured service identity, or
 * an explicit local-development configuration that refuses to activate in
 * production. Tool arguments (`group_id`, `user_id`, `curator_id`, `role`) are
 * resource *selectors* — they select what to act on, they never grant authority.
 *
 * This module is deliberately dependency-free (no DB, no HTTP, no env reads at
 * import time) so it can be unit tested in-process with no live infrastructure.
 *
 * Related: `src/lib/auth/mcp-authenticator.ts` (credential verification),
 * `src/mcp/canonical-http-gateway.ts` (HTTP boundary),
 * `src/mcp/memory-server-canonical.ts` (stdio/service boundary).
 *
 * NOTE: this is the *MCP transport* principal. It is intentionally separate
 * from the Next.js/Clerk web-app auth in `src/lib/auth/api-auth.ts` and from
 * the approval-workflow `role` union in `src/kernel/policy.ts`.
 */

import { MEMORY_TOOLS } from "@allura/mcp-server";
import { scopesForRole } from "@allura/rbac";
import type { Scope } from "@allura/types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Roles the MCP authorization model recognises. Ordered least -> most. */
export const PRINCIPAL_ROLES = ["viewer", "curator", "admin"] as const;

export type PrincipalRole = (typeof PRINCIPAL_ROLES)[number];

/** How the principal proved who it is. */
export type AuthMethod = "mcp_token" | "service_identity" | "dev_local";

/** Wildcard tenant marker. Only ever legal for dev_local / service_identity. */
export const TENANT_WILDCARD = "*";

/**
 * The verified identity of the caller. Frozen — handlers receive it read-only
 * and there is no code path that lets a tool argument mutate it.
 */
export interface PrincipalContext {
  /** Stable identity of the caller (agent name, service id, or dev id). */
  readonly principalId: string;
  /** Tenants this principal may act on. May be ["*"] for dev/service only. */
  readonly tenantIds: readonly string[];
  /** Effective roles. Authority for elevated tools comes from here ONLY. */
  readonly roles: readonly PrincipalRole[];
  /** Exact MCP scopes granted by the verified credential. */
  readonly scopes: readonly Scope[];
  /** How the identity was established. */
  readonly authMethod: AuthMethod;
  /** Per-connection session identifier, used to correlate audit events. */
  readonly sessionId: string;
  /**
   * Opaque credential row id (`mcp_tokens.id`) when authMethod is mcp_token.
   * NEVER the raw token, and never the token hash.
   */
  readonly credentialId?: string;
  /** Credential expiry (ISO 8601) when the credential carries one. */
  readonly expiresAt?: string | null;
}

/**
 * Stable, machine-readable reason codes. These appear in audit events and in
 * the error payload returned to callers; they must not drift.
 */
export type AuthReasonCode =
  // authentication
  | "AUTH_MISSING"
  | "AUTH_MALFORMED"
  | "AUTH_INVALID"
  | "AUTH_REVOKED"
  | "AUTH_EXPIRED"
  // authorization
  | "TENANT_MISMATCH"
  | "ROLE_INSUFFICIENT"
  | "SCOPE_INSUFFICIENT"
  | "ACTOR_MISMATCH"
  | "PRINCIPAL_MISSING"
  // configuration
  | "CONFIG_MISSING"
  | "DEV_MODE_FORBIDDEN";

const REASON_STATUS: Record<AuthReasonCode, number> = {
  AUTH_MISSING: 401,
  AUTH_MALFORMED: 401,
  AUTH_INVALID: 401,
  AUTH_REVOKED: 401,
  AUTH_EXPIRED: 401,
  TENANT_MISMATCH: 403,
  ROLE_INSUFFICIENT: 403,
  SCOPE_INSUFFICIENT: 403,
  ACTOR_MISMATCH: 403,
  PRINCIPAL_MISSING: 401,
  CONFIG_MISSING: 500,
  DEV_MODE_FORBIDDEN: 500,
};

/** Thrown by every authentication/authorization refusal in this subsystem. */
export class PrincipalAuthError extends Error {
  readonly reasonCode: AuthReasonCode;
  readonly httpStatus: number;

  constructor(reasonCode: AuthReasonCode, message: string) {
    super(message);
    this.name = "PrincipalAuthError";
    this.reasonCode = reasonCode;
    this.httpStatus = REASON_STATUS[reasonCode];
  }

  /** Stable wire shape. Never carries credential material. */
  toErrorPayload(): { error: { code: AuthReasonCode; message: string } } {
    return { error: { code: this.reasonCode, message: this.message } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_ID_PATTERN = /^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** Is this a syntactically valid tenant id? (Format check, NOT authority.) */
export function isValidTenantId(value: string): boolean {
  return GROUP_ID_PATTERN.test(value);
}

function normalizeRoles(roles: readonly string[]): PrincipalRole[] {
  const seen = new Set<PrincipalRole>();
  for (const raw of roles) {
    const role = String(raw).trim().toLowerCase();
    if ((PRINCIPAL_ROLES as readonly string[]).includes(role)) {
      seen.add(role as PrincipalRole);
    }
  }
  return PRINCIPAL_ROLES.filter((r) => seen.has(r));
}

export interface CreatePrincipalInput {
  principalId: string;
  tenantIds: readonly string[];
  roles: readonly string[];
  scopes?: readonly string[];
  authMethod: AuthMethod;
  sessionId: string;
  credentialId?: string;
  expiresAt?: string | null;
}

/**
 * Build a frozen PrincipalContext, rejecting anything structurally unsound.
 *
 * Hard rules enforced here:
 *  - principalId and sessionId must be non-empty.
 *  - at least one tenant, and every tenant must be a valid `allura-*` id
 *    (or the wildcard, which is refused for `mcp_token`).
 *  - unknown role strings are dropped, not silently upgraded.
 *  - the returned object is frozen, including its arrays.
 */
export function createPrincipalContext(input: CreatePrincipalInput): PrincipalContext {
  const principalId = String(input.principalId ?? "").trim();
  if (!principalId) {
    throw new PrincipalAuthError("PRINCIPAL_MISSING", "principalId is required");
  }

  const sessionId = String(input.sessionId ?? "").trim();
  if (!sessionId) {
    throw new PrincipalAuthError("PRINCIPAL_MISSING", "sessionId is required");
  }

  const tenantIds = (input.tenantIds ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (tenantIds.length === 0) {
    throw new PrincipalAuthError(
      "CONFIG_MISSING",
      `Principal '${principalId}' has no tenant allowlist; refusing to build an unbounded principal`,
    );
  }
  for (const tenant of tenantIds) {
    if (tenant === TENANT_WILDCARD) {
      if (input.authMethod === "mcp_token") {
        throw new PrincipalAuthError(
          "CONFIG_MISSING",
          "Wildcard tenant is not permitted for mcp_token principals",
        );
      }
      continue;
    }
    if (!isValidTenantId(tenant)) {
      throw new PrincipalAuthError(
        "CONFIG_MISSING",
        `Invalid tenant id '${tenant}' in principal allowlist (expected ^allura-[a-z0-9-]+$)`,
      );
    }
  }

  const roles = normalizeRoles(input.roles ?? []);
  const scopes = input.scopes === undefined
    ? [...new Set(roles.flatMap((role) => scopesForRole(role === "curator" ? "reviewer" : role)))]
    : [...new Set(input.scopes.map((scope) => String(scope).trim()).filter(Boolean))] as Scope[];

  return Object.freeze({
    principalId,
    tenantIds: Object.freeze([...tenantIds]) as readonly string[],
    roles: Object.freeze(roles) as readonly PrincipalRole[],
    scopes: Object.freeze(scopes) as readonly Scope[],
    authMethod: input.authMethod,
    sessionId,
    credentialId: input.credentialId,
    expiresAt: input.expiresAt ?? null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE AUTHORITY (AC-5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MCP tools that bypass HITL or mutate governance state. Authority to call
 * these comes from `PrincipalContext.roles` and nothing else — never from
 * `request.params.role` or any other caller-controlled field.
 */
export const ELEVATED_TOOLS: ReadonlySet<string> = new Set([
  "governance_curator_pass",
  "governance_proposal_approve",
  "governance_proposal_reject",
  "governance_update_policy",
]);

/** Roles that satisfy an elevated tool call. */
const ELEVATED_ROLES: readonly PrincipalRole[] = ["admin", "curator"];

export function hasRole(principal: PrincipalContext, role: PrincipalRole): boolean {
  return principal.roles.includes(role);
}

export function hasScope(principal: PrincipalContext, scope: Scope): boolean {
  return principal.scopes.includes(scope);
}

export function isElevatedTool(toolName: string): boolean {
  return ELEVATED_TOOLS.has(toolName);
}

/**
 * Authorize a tool call against the verified principal.
 *
 * @throws PrincipalAuthError ROLE_INSUFFICIENT when the principal lacks the
 *         required role. Reads ONLY `principal.roles`.
 */
export function authorizeToolCall(principal: PrincipalContext, toolName: string): void {
  if (!principal) {
    throw new PrincipalAuthError("PRINCIPAL_MISSING", "No verified principal on this request");
  }
  const tool = MEMORY_TOOLS.find((candidate) => candidate.name === toolName);
  if (isElevatedTool(toolName)) {
    const satisfied = ELEVATED_ROLES.some((r) => principal.roles.includes(r));
    if (!satisfied) {
      throw new PrincipalAuthError(
        "ROLE_INSUFFICIENT",
        `Tool '${toolName}' requires role admin or curator; principal '${principal.principalId}' has [${principal.roles.join(", ")}]`,
      );
    }
  }
  if (tool && !principal.scopes.includes(tool.requiredScope)) {
    throw new PrincipalAuthError(
      "SCOPE_INSUFFICIENT",
      `Tool '${toolName}' requires scope ${tool.requiredScope}; principal '${principal.principalId}' lacks it`,
    );
  }
  if (!isElevatedTool(toolName)) return;
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT AUTHORITY (AC-4)
// ─────────────────────────────────────────────────────────────────────────────

/** Does this principal hold the wildcard tenant grant? */
export function hasWildcardTenant(principal: PrincipalContext): boolean {
  return principal.tenantIds.includes(TENANT_WILDCARD);
}

/**
 * Reconcile a caller-supplied `group_id` selector against the principal.
 *
 * - selector absent  -> the principal's first (default) tenant is used.
 * - selector present -> must be in the allowlist, else TENANT_MISMATCH.
 *
 * A wildcard principal accepts any *well-formed* tenant id; it still rejects
 * malformed ones, so format validation is never skipped.
 */
export function resolveEffectiveTenant(
  principal: PrincipalContext,
  selector?: unknown,
): string {
  const wildcard = hasWildcardTenant(principal);

  if (selector === undefined || selector === null || selector === "") {
    const fallback = principal.tenantIds.find((t) => t !== TENANT_WILDCARD);
    if (fallback) return fallback;
    throw new PrincipalAuthError(
      "TENANT_MISMATCH",
      `Principal '${principal.principalId}' has no default tenant; group_id must be supplied explicitly`,
    );
  }

  if (typeof selector !== "string") {
    throw new PrincipalAuthError("TENANT_MISMATCH", "group_id must be a string");
  }

  const requested = selector.trim();
  if (!isValidTenantId(requested)) {
    throw new PrincipalAuthError(
      "TENANT_MISMATCH",
      `Invalid group_id '${requested}' (expected ^allura-[a-z0-9-]+$)`,
    );
  }

  if (!wildcard && !principal.tenantIds.includes(requested)) {
    throw new PrincipalAuthError(
      "TENANT_MISMATCH",
      `Principal '${principal.principalId}' is not authorized for tenant '${requested}'`,
    );
  }

  return requested;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTOR AUTHORITY (AC-4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Actor selector fields that must agree with the principal.
 *
 * `curator_id` is the decision actor written into approval/rejection audit and
 * into the segregation-of-duties check in `src/lib/memory/approval-audit.ts`;
 * it must be the *authenticated* identity, not a caller-chosen string.
 */
export const ACTOR_FIELDS = ["curator_id", "user_id", "actor", "agent_id"] as const;

export type ActorField = (typeof ACTOR_FIELDS)[number];

/**
 * dev_local is an explicit local-development escape hatch (it cannot activate
 * in production — see `mcp-authenticator.ts` / AC-1 / AC-6). Only in that mode
 * may a caller name a different actor, so that local curator scripts keep
 * working without minting tokens.
 */
function actorOverrideAllowed(principal: PrincipalContext): boolean {
  return principal.authMethod === "dev_local";
}

/**
 * Reconcile a caller-supplied actor selector against the principal.
 *
 * - absent   -> derived from the principal (backwards compatible: tools that
 *               previously required `curator_id` now get it injected).
 * - equal    -> allowed.
 * - differs  -> ACTOR_MISMATCH (stable authorization error).
 */
export function resolveEffectiveActor(
  principal: PrincipalContext,
  field: string,
  selector?: unknown,
): string {
  if (selector === undefined || selector === null || selector === "") {
    return principal.principalId;
  }
  if (typeof selector !== "string") {
    throw new PrincipalAuthError("ACTOR_MISMATCH", `${field} must be a string`);
  }
  const requested = selector.trim();
  if (requested === principal.principalId) return requested;
  if (actorOverrideAllowed(principal)) return requested;

  throw new PrincipalAuthError(
    "ACTOR_MISMATCH",
    `${field} '${requested}' does not match the authenticated principal '${principal.principalId}'`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ARGUMENT SANITIZATION (AC-3, AC-4, AC-5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Caller-controlled keys that used to convey authority and must never reach a
 * handler as-supplied. `role` is stripped outright — role authority now comes
 * from `PrincipalContext.roles`.
 */
export const STRIPPED_AUTHORITY_KEYS = [
  "role",
  "roles",
  "principal",
  "principal_context",
  "auth_method",
  "session_id",
] as const;

export interface AppliedPrincipalArgs {
  /** Rewritten arguments, safe to hand to a tool handler. */
  args: Record<string, unknown>;
  /** The tenant the operation will actually run against. */
  effectiveTenant: string;
  /** Actor fields that were injected or confirmed. */
  actors: Record<string, string>;
}

/**
 * Bind the verified principal onto a tool-call argument object.
 *
 * Guarantees, in order:
 *  1. authority keys (`role`, injected principal, ...) removed;
 *  2. `group_id` is replaced with the reconciled effective tenant;
 *  3. any present actor field must match the principal, else ACTOR_MISMATCH;
 *  4. `curator_id` is injected for elevated tools when omitted.
 *
 * The input object is never mutated.
 */
export function applyPrincipalToArgs(
  principal: PrincipalContext,
  toolName: string,
  rawArgs: unknown,
): AppliedPrincipalArgs {
  if (!principal) {
    throw new PrincipalAuthError("PRINCIPAL_MISSING", "No verified principal on this request");
  }

  const source =
    rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};

  const args: Record<string, unknown> = { ...source };

  // 1. Strip caller-supplied authority.
  for (const key of STRIPPED_AUTHORITY_KEYS) {
    delete args[key];
  }

  // 2. Tenant.
  const effectiveTenant = resolveEffectiveTenant(principal, source.group_id);
  args.group_id = effectiveTenant;

  // 3/4. Actors.
  const actors: Record<string, string> = {};
  for (const field of ACTOR_FIELDS) {
    const present = Object.prototype.hasOwnProperty.call(source, field);
    if (!present && !(field === "curator_id" && isElevatedTool(toolName))) continue;
    const resolved = resolveEffectiveActor(principal, field, source[field]);
    args[field] = resolved;
    actors[field] = resolved;
  }

  return { args, effectiveTenant, actors };
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION REBINDING (review Finding 1)
// ─────────────────────────────────────────────────────────────────────────────

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/**
 * May `next` take over a transport session currently bound to `current`?
 *
 * `principalId` alone is NOT sufficient. It derives from `mcp_tokens.agent_name`,
 * which has no uniqueness constraint (only `token_prefix` is unique). Two
 * credentials minted for different tenants with the same agent_name — entirely
 * plausible for names like "cursor" or "claude-desktop" — would otherwise let
 * the second credential inherit the first credential's live session, and with it
 * the first credential's tenant.
 *
 * So we compare the *credential identity* and the full authority envelope:
 *  - `credentialId` must match exactly when either side has one (mcp_token);
 *  - `authMethod`, tenant set, role set and exact scope set must all match.
 */
export function canRebindSession(
  current: PrincipalContext | null | undefined,
  next: PrincipalContext,
): boolean {
  if (!current) return false;
  if (current.authMethod !== next.authMethod) return false;

  // Credential-backed principals must present the same credential row.
  if (current.credentialId || next.credentialId) {
    if (current.credentialId !== next.credentialId) return false;
  } else if (current.principalId !== next.principalId) {
    // Non-credential principals (service_identity / dev_local) fall back to
    // identity, which is configuration-derived and therefore trustworthy.
    return false;
  }

  if (!sameStringSet(current.tenantIds, next.tenantIds)) return false;
  if (!sameStringSet(current.roles, next.roles)) return false;
  if (!sameStringSet(current.scopes, next.scopes)) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCH GUARD (single chokepoint for both transports)
// ─────────────────────────────────────────────────────────────────────────────

export interface GuardedToolCall {
  /** Arguments rewritten to the principal's authority. */
  args: Record<string, unknown>;
  effectiveTenant: string;
  actors: Record<string, string>;
}

/**
 * The one place a tool call is authorized.
 *
 * Both `canonical-http-gateway.ts` (HTTP) and `memory-server-canonical.ts`
 * (stdio) call this before dispatching, so the two transports cannot drift.
 *
 * Order matters: role authority is checked before arguments are touched, so a
 * caller learns nothing about tenant layout from an unauthorized elevated call.
 *
 * @throws PrincipalAuthError with a stable reason code.
 */
export function guardToolCall(
  principal: PrincipalContext | null | undefined,
  toolName: string,
  rawArgs: unknown,
): GuardedToolCall {
  if (!principal) {
    throw new PrincipalAuthError(
      "PRINCIPAL_MISSING",
      `Tool '${toolName}' was dispatched without a verified principal`,
    );
  }
  authorizeToolCall(principal, toolName);
  return applyPrincipalToArgs(principal, toolName, rawArgs);
}

/** Resolve a budget route's tenant without allowing omission to mean "all". */
export function resolveBudgetTenant(
  principal: PrincipalContext,
  selector?: unknown,
): string | null {
  if (selector === undefined || selector === null || selector === "") {
    if (principal.tenantIds.length === 1 && principal.tenantIds[0] !== "*") return principal.tenantIds[0]!;
    throw new PrincipalAuthError(
      "TENANT_MISMATCH",
      "A budget tenant must be selected explicitly for a multi-tenant principal",
    );
  }
  return resolveEffectiveTenant(principal, selector);
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT PROJECTION (AC-7)
// ─────────────────────────────────────────────────────────────────────────────

export type AuthDecision = "allow" | "deny";

export interface AuthAuditEvent {
  /** Principal that was (or failed to be) established. */
  principal_id: string;
  /** Tenant the decision applied to. */
  effective_tenant: string | null;
  /** Roles that were consulted. */
  roles: readonly PrincipalRole[];
  /** Correlating session id. */
  session_id: string;
  /** Tool or route the decision guarded. */
  tool: string;
  /** allow | deny. */
  decision: AuthDecision;
  /** Stable reason code; "OK" on allow. */
  reason_code: AuthReasonCode | "OK";
  /** How the principal authenticated. */
  auth_method: AuthMethod | "none";
  /** Credential row id — never the token, never the hash. */
  credential_id: string | null;
  /** ISO timestamp. */
  occurred_at: string;
}

/**
 * Project an auth decision into the append-only audit shape.
 *
 * Deliberately takes only already-safe values: there is no parameter through
 * which a raw token or a request payload could enter an audit record.
 */
export function buildAuthAuditEvent(input: {
  principal?: PrincipalContext | null;
  tool: string;
  decision: AuthDecision;
  reasonCode?: AuthReasonCode | "OK";
  effectiveTenant?: string | null;
  sessionId?: string;
  now?: Date;
}): AuthAuditEvent {
  const p = input.principal ?? null;
  return {
    principal_id: p?.principalId ?? "anonymous",
    effective_tenant: input.effectiveTenant ?? p?.tenantIds[0] ?? null,
    roles: p?.roles ?? [],
    session_id: input.sessionId ?? p?.sessionId ?? "unbound",
    tool: input.tool,
    decision: input.decision,
    reason_code: input.reasonCode ?? (input.decision === "allow" ? "OK" : "AUTH_INVALID"),
    auth_method: p?.authMethod ?? "none",
    credential_id: p?.credentialId ?? null,
    occurred_at: (input.now ?? new Date()).toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE ON KERNEL POLICY (Story 24.2 review, Finding 3)
// ─────────────────────────────────────────────────────────────────────────────
//
// An earlier draft added `ProofClaims.principal` plus a POL-028 "principal
// tenant binding" kernel policy as defence in depth. It was removed, because
// nothing could populate it: the canonical MCP dispatch path
// (canonical-http-gateway.ts / memory-server-canonical.ts -> memory-coordinator
// -> canonical-tools) never imports `src/kernel/*`, so `evaluatePolicies` is
// never reached by an MCP request. The policy would have been permanently
// short-circuited on `if (!principal) return true` while reading like a live
// second check.
//
// Tenant binding IS enforced, in the layer that actually sits in the request
// path: `resolveEffectiveTenant` below, called from `guardToolCall` before any
// handler runs. If the memory write path is ever moved onto the kernel syscall
// layer (`src/lib/memory/writer.ts` -> `syscall_mutate`), re-adding the kernel
// policy becomes worthwhile — until then it would be theatre.
