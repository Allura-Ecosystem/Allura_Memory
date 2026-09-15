/**
 * MCP credential verification and principal resolution.
 *
 * Story 24.2 (Epic 24). This module turns a transport-level credential into a
 * verified `PrincipalContext`, or refuses with a stable reason code.
 *
 * Design constraints:
 *  - No import-time environment reads and no import-time DB access. Production
 *    dependency wiring is private to this module; callers cannot supply a
 *    credential verifier or repository and thereby mint transport authority.
 *  - The raw bearer token never leaves this module: it is never returned,
 *    never stored, never logged, and never placed on a PrincipalContext.
 *  - Credential state lives in the existing `mcp_tokens` table
 *    (docker/postgres-init/28-mcp-tokens.sql): HMAC-SHA256 hash + display
 *    prefix, `revoked_at` / `expires_at` as nullable timestamps. No parallel
 *    credential table, no destructive revocation.
 *
 * CACHE POLICY (AC-8)
 *  - Default TTL is 0 ms: every request re-reads the credential row, so a
 *    revocation or expiry takes effect on the very next request.
 *  - Paired-device credentials always bypass the cache, even when a deployment
 *    enables a non-zero cache TTL for non-device credentials. Revocation/loss
 *    therefore takes effect for device tokens on the next MCP request.
 *  - `ALLURA_MCP_AUTH_CACHE_TTL_MS` may raise the non-device TTL to at most
 *    60000 ms. With a non-zero TTL, `expires_at` is still evaluated live on
 *    every request; only non-device revocation may lag by the configured TTL.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  type AuthMethod,
  createPrincipalContext,
  guardToolCall,
  PrincipalAuthError,
  type PrincipalContext,
  type PrincipalRole,
  TENANT_WILDCARD,
} from "./principal-context";
import type { Scope } from "@allura/types";
import { isValidatedToken } from "@/lib/guard/validate-token";
import type { MemoryAddRequest, ScopeTuple } from "@/lib/memory/canonical-contracts";

type MemoryAddAuthority = Readonly<{
  group_id: string;
  workspace_id: string;
  agent_id: string;
  user_id: string;
  session_id: string;
}>;

const memoryAddAuthorities = new WeakMap<object, MemoryAddAuthority>();

export interface PreparedTransportMemoryAdd {
  readonly request: MemoryAddRequest;
  readonly guarded: import("./principal-context").GuardedToolCall;
}

/** A credential-verified or explicitly configured service identity. */
export interface AuthenticatedTransportPrincipal extends PrincipalContext {
  prepareMemoryAdd(rawArgs: unknown): PreparedTransportMemoryAdd;
}

class VerifiedTransportPrincipal implements AuthenticatedTransportPrincipal {
  constructor(private readonly principal: PrincipalContext) {}

  get principalId(): string { return this.principal.principalId; }
  get workspaceId(): string | undefined { return this.principal.workspaceId; }
  get tenantIds(): readonly string[] { return this.principal.tenantIds; }
  get roles(): readonly PrincipalRole[] { return this.principal.roles; }
  get scopes(): readonly Scope[] { return this.principal.scopes; }
  get authMethod(): AuthMethod { return this.principal.authMethod; }
  get sessionId(): string { return this.principal.sessionId; }
  get credentialId(): string | undefined { return this.principal.credentialId; }
  get pairedDeviceId(): string | undefined { return this.principal.pairedDeviceId; }
  get expiresAt(): string | null | undefined { return this.principal.expiresAt; }

  prepareMemoryAdd(rawArgs: unknown): PreparedTransportMemoryAdd {
    const guarded = guardToolCall(this.principal, "memory_add", rawArgs);
    if (!this.principal.workspaceId) {
      throw new PrincipalAuthError("CONFIG_MISSING", `Principal '${this.principal.principalId}' has no verified workspace binding`);
    }
    const metadata = guarded.args.metadata && typeof guarded.args.metadata === "object" && !Array.isArray(guarded.args.metadata)
      ? Object.freeze({ ...(guarded.args.metadata as Record<string, unknown>) })
      : guarded.args.metadata;
    const authority = Object.freeze({
      group_id: guarded.effectiveTenant,
      workspace_id: this.principal.workspaceId,
      agent_id: this.principal.principalId,
      user_id: this.principal.principalId,
      session_id: this.principal.sessionId,
    });
    const scope = Object.freeze({
      group_id: authority.group_id,
      workspace_id: authority.workspace_id,
      agent_id: authority.agent_id,
      session_id: authority.session_id,
    });
    const request = Object.freeze({
      ...guarded.args,
      group_id: authority.group_id,
      user_id: authority.user_id,
      scope,
      ...(metadata === undefined ? {} : { metadata }),
    }) as MemoryAddRequest;
    memoryAddAuthorities.set(request, authority);
    return Object.freeze({ request, guarded });
  }
}

function createAuthenticatedPrincipal(input: Parameters<typeof createPrincipalContext>[0]): AuthenticatedTransportPrincipal {
  return new VerifiedTransportPrincipal(createPrincipalContext(input));
}

/** Rejects every request not issued by a verified transport capability. */
export function requireTransportMemoryAddAuthority(request: MemoryAddRequest): ScopeTuple & {
  workspace_id: string;
  agent_id: string;
  user_id: string;
  session_id: string;
} {
  const authority = memoryAddAuthorities.get(request);
  const scope = request.scope;
  if (!authority || !Object.isFrozen(request) || request.group_id !== authority.group_id || request.user_id !== authority.user_id ||
      !scope || !Object.isFrozen(scope) || scope.group_id !== authority.group_id ||
      scope.workspace_id !== authority.workspace_id || scope.agent_id !== authority.agent_id || scope.session_id !== authority.session_id) {
    throw new PrincipalAuthError("PRINCIPAL_MISSING", "memory_add requires a verified credential-issued write capability");
  }
  return authority as ScopeTuple & { workspace_id: string; agent_id: string; user_id: string; session_id: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// INJECTED DEPENDENCIES
// ─────────────────────────────────────────────────────────────────────────────

/** Structural subset of `mcp_tokens` needed to authenticate. */
export interface McpCredentialRecord {
  id: string;
  group_id: string;
  workspace_id?: string;
  agent_name: string;
  token_prefix: string;
  token_hash: string;
  scopes: string[];
  paired_device_id?: string | null;
  expires_at: string | Date | null;
  revoked_at: string | Date | null;
}

interface AuthenticatorDeps {
  /** Derive the stored lookup prefix from a presented raw token. */
  prefixOf(raw: string): string;
  /** Load the credential row by prefix. */
  findByPrefix(prefix: string): Promise<McpCredentialRecord | null>;
  /** Constant-time compare of presented token against the stored hash. */
  verifyToken(raw: string, storedHash: string): boolean;
  /** Optional last-used bookkeeping; failures are swallowed. */
  touchLastUsed?(id: string): Promise<void>;
  /** Injectable clock for deterministic expiry tests. */
  now?(): Date;
  /** Session id factory (per connection). */
  newSessionId?(): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP CONFIGURATION (AC-1, AC-6)
// ─────────────────────────────────────────────────────────────────────────────

export type AuthMode = "mcp_token" | "shared_token" | "dev_local";

export interface HttpAuthConfig {
  mode: AuthMode;
  /** Shared static bearer token, when mode === "shared_token". */
  sharedToken?: string;
  /** Principal attributes granted to a valid shared-token caller. */
  sharedTenantIds: readonly string[];
  sharedRoles: readonly PrincipalRole[];
  sharedPrincipalId: string;
  /** Dev-local principal, when mode === "dev_local". */
  devPrincipalId: string;
  devTenantIds: readonly string[];
  devRoles: readonly PrincipalRole[];
  /** Revocation cache TTL in ms (see CACHE POLICY above). */
  cacheTtlMs: number;
  /** Non-fatal configuration warnings for the startup banner. */
  warnings: readonly string[];
}

export interface ServiceAuthConfig {
  principalId: string;
  workspaceId: string;
  tenantIds: readonly string[];
  roles: readonly PrincipalRole[];
  /** Explicit configured service scopes; never caller-supplied tool data. */
  scopes?: readonly string[];
  authMethod: Extract<AuthMethod, "service_identity" | "dev_local">;
}

const resolvedServiceConfigs = new WeakSet<object>();

const AUTH_PROOF = Symbol.for("allura:auth-proof");
const AUTH_PROOF_KEY = randomBytes(32);

type AuthAuthorityFields = Pick<HttpAuthConfig,
  "mode" | "sharedToken" | "sharedTenantIds" | "sharedRoles" | "sharedPrincipalId" |
  "devPrincipalId" | "devTenantIds" | "devRoles"
>;

function authorityFields(config: HttpAuthConfig): AuthAuthorityFields {
  return {
    mode: config.mode,
    sharedToken: config.sharedToken,
    sharedTenantIds: config.sharedTenantIds,
    sharedRoles: config.sharedRoles,
    sharedPrincipalId: config.sharedPrincipalId,
    devPrincipalId: config.devPrincipalId,
    devTenantIds: config.devTenantIds,
    devRoles: config.devRoles,
  };
}

/** A process-private structural HMAC prevents Symbol.for lookalike forgery. */
function authProofFor(config: HttpAuthConfig): string {
  return createHmac("sha256", AUTH_PROOF_KEY)
    .update(JSON.stringify(authorityFields(config)))
    .digest("base64url");
}

/**
 * This is the HTTP transport boundary: freeze a defensive copy and attach an
 * unenumerable proof. It is intentionally not exported; callers receive raw,
 * cloneable diagnostics from resolveHttpAuthConfig(), never a proof issuer.
 */
function authenticateHttpConfig(config: HttpAuthConfig): HttpAuthConfig {
  const authenticated = {
    ...config,
    sharedTenantIds: Object.freeze([...config.sharedTenantIds]),
    sharedRoles: Object.freeze([...config.sharedRoles]),
    devTenantIds: Object.freeze([...config.devTenantIds]),
    devRoles: Object.freeze([...config.devRoles]),
    warnings: Object.freeze([...config.warnings]),
  } as HttpAuthConfig;
  Object.defineProperty(authenticated, AUTH_PROOF, {
    value: authProofFor(authenticated),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(authenticated);
}

function hasAuthenticatedHttpProof(config: HttpAuthConfig): boolean {
  if (!Object.isFrozen(config)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(config, AUTH_PROOF);
  if (!descriptor || descriptor.enumerable || descriptor.writable || descriptor.configurable || typeof descriptor.value !== "string") {
    return false;
  }
  const expected = Buffer.from(authProofFor(config));
  const actual = Buffer.from(descriptor.value);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function verifiedServiceConfig(config: ServiceAuthConfig): ServiceAuthConfig {
  resolvedServiceConfigs.add(config);
  return config;
}

export type EnvLike = Record<string, string | undefined>;

const MAX_CACHE_TTL_MS = 60_000;

/** Production is anything that declares itself production. Fail closed. */
export function isProductionEnv(env: EnvLike): boolean {
  return env.NODE_ENV === "production" || env.ALLURA_ENV === "production";
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseRoles(value: string | undefined, fallback: PrincipalRole[]): PrincipalRole[] {
  const parsed = parseList(value).filter((r): r is PrincipalRole =>
    r === "admin" || r === "curator" || r === "viewer",
  );
  return parsed.length > 0 ? parsed : fallback;
}

function parseCacheTtl(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_CACHE_TTL_MS);
}

/**
 * Resolve HTTP transport auth configuration.
 *
 * AC-1: in production, throws CONFIG_MISSING unless a supported authentication
 * configuration is present (`ALLURA_MCP_TOKEN_SECRET` for hashed per-caller
 * credentials, or `ALLURA_MCP_AUTH_TOKEN` for the legacy shared token).
 *
 * AC-6: `ALLURA_MCP_DEV_AUTH=true` is an explicit local-development mode and
 * throws DEV_MODE_FORBIDDEN if it is set while running in production.
 */
export function resolveHttpAuthConfig(env: EnvLike): HttpAuthConfig {
  const production = isProductionEnv(env);
  const devAuthRequested = env.ALLURA_MCP_DEV_AUTH === "true";

  if (production && devAuthRequested) {
    throw new PrincipalAuthError(
      "DEV_MODE_FORBIDDEN",
      "ALLURA_MCP_DEV_AUTH=true is not permitted in production; remove it and configure ALLURA_MCP_TOKEN_SECRET or ALLURA_MCP_AUTH_TOKEN",
    );
  }

  const tokenSecret = env.ALLURA_MCP_TOKEN_SECRET ?? "";
  const sharedToken = env.ALLURA_MCP_AUTH_TOKEN ?? "";

  const base = {
    sharedToken: sharedToken || undefined,
    sharedTenantIds: parseList(env.ALLURA_MCP_SHARED_TOKEN_TENANTS).length
      ? parseList(env.ALLURA_MCP_SHARED_TOKEN_TENANTS)
      : ["allura-system"],
    sharedRoles: parseRoles(env.ALLURA_MCP_SHARED_TOKEN_ROLES, ["viewer"]),
    sharedPrincipalId: env.ALLURA_MCP_SHARED_TOKEN_PRINCIPAL || "shared-bearer",
    devPrincipalId: env.ALLURA_MCP_DEV_PRINCIPAL_ID || "dev-local",
    devTenantIds: parseList(env.ALLURA_MCP_DEV_TENANTS).length
      ? parseList(env.ALLURA_MCP_DEV_TENANTS)
      : [TENANT_WILDCARD],
    devRoles: parseRoles(env.ALLURA_MCP_DEV_ROLES, ["admin", "curator", "viewer"]),
    cacheTtlMs: parseCacheTtl(env.ALLURA_MCP_AUTH_CACHE_TTL_MS),
    warnings: [] as readonly string[],
  };

  if (tokenSecret.length >= 16) {
    const warnings: string[] = [];
    if (sharedToken) {
      // Review Finding 5: the shared token is INERT in mcp_token mode. Say so
      // loudly, because an operator who believes it still works has a false
      // model of their own access surface.
      warnings.push(
        "ALLURA_MCP_AUTH_TOKEN is set but IGNORED: ALLURA_MCP_TOKEN_SECRET selects per-caller mcp_tokens credentials. Unset ALLURA_MCP_AUTH_TOKEN to avoid confusion.",
      );
    }
    return { ...base, mode: "mcp_token", warnings };
  }
  if (sharedToken) {
    return {
      ...base,
      mode: "shared_token",
      warnings: [
        "Using the legacy shared bearer token. It has NO per-caller identity and NO revocation path. Set ALLURA_MCP_TOKEN_SECRET and mint mcp_tokens rows to get revocable, least-privilege credentials.",
      ],
    };
  }

  if (production) {
    throw new PrincipalAuthError(
      "CONFIG_MISSING",
      "No supported MCP authentication configuration. Set ALLURA_MCP_TOKEN_SECRET (>=16 chars) for hashed per-caller credentials, or ALLURA_MCP_AUTH_TOKEN for a shared bearer token. Production refuses to start unauthenticated.",
    );
  }

  if (!devAuthRequested) {
    throw new PrincipalAuthError(
      "CONFIG_MISSING",
      "No MCP authentication configured. For local development set ALLURA_MCP_DEV_AUTH=true to run with an explicit dev-local principal.",
    );
  }

  return { ...base, mode: "dev_local" };
}

/**
 * Resolve the stdio/service transport principal (AC-6).
 *
 * Production requires an explicit service identity AND an explicit tenant
 * allowlist. There is no anonymous default.
 */
export function resolveServiceAuthConfig(env: EnvLike): ServiceAuthConfig {
  const production = isProductionEnv(env);
  const principalId = (env.ALLURA_MCP_SERVICE_PRINCIPAL_ID ?? "").trim();
  const workspaceId = (env.ALLURA_MCP_SERVICE_WORKSPACE_ID ?? "").trim();
  const tenantIds = parseList(env.ALLURA_MCP_SERVICE_TENANTS);
  const roles = parseRoles(env.ALLURA_MCP_SERVICE_ROLES, ["viewer", "curator"]);
  const scopes = parseList(env.ALLURA_MCP_SERVICE_SCOPES);

  if (production) {
    if (!principalId) {
      throw new PrincipalAuthError(
        "CONFIG_MISSING",
        "ALLURA_MCP_SERVICE_PRINCIPAL_ID is required for stdio/service mode in production (no anonymous default)",
      );
    }
    if (tenantIds.length === 0) {
      throw new PrincipalAuthError(
        "CONFIG_MISSING",
        "ALLURA_MCP_SERVICE_TENANTS is required for stdio/service mode in production (explicit tenant allowlist)",
      );
    }
    if (tenantIds.includes(TENANT_WILDCARD)) {
      throw new PrincipalAuthError(
        "CONFIG_MISSING",
        "ALLURA_MCP_SERVICE_TENANTS may not contain the wildcard '*' in production",
      );
    }
    if (!workspaceId) throw new PrincipalAuthError("CONFIG_MISSING", "ALLURA_MCP_SERVICE_WORKSPACE_ID is required for stdio/service mode in production");
    return verifiedServiceConfig({ principalId, workspaceId, tenantIds, roles, scopes: scopes.length ? scopes : undefined, authMethod: "service_identity" });
  }

  // Non-production: an explicit service identity is honoured when configured,
  // otherwise fall back to the dev-local principal.
  if (principalId && tenantIds.length > 0) {
    return verifiedServiceConfig({ principalId, workspaceId: workspaceId || "dev-local", tenantIds, roles, scopes: scopes.length ? scopes : undefined, authMethod: "service_identity" });
  }

  return verifiedServiceConfig({
    principalId: env.ALLURA_MCP_DEV_PRINCIPAL_ID || "dev-local-stdio",
    workspaceId: workspaceId || "dev-local",
    tenantIds: parseList(env.ALLURA_MCP_DEV_TENANTS).length
      ? parseList(env.ALLURA_MCP_DEV_TENANTS)
      : [TENANT_WILDCARD],
    roles: parseRoles(env.ALLURA_MCP_DEV_ROLES, ["admin", "curator", "viewer"]),
    scopes: parseList(env.ALLURA_MCP_DEV_SCOPES).length ? parseList(env.ALLURA_MCP_DEV_SCOPES) : undefined,
    authMethod: "dev_local",
  });
}

/**
 * Issue a stdio principal only inside the service-authentication boundary.
 *
 * Configuration is intentionally observable for startup diagnostics, but it is
 * not itself a credential or capability. Keeping this issuer private prevents
 * arbitrary in-process code from turning a public ServiceAuthConfig (or a
 * hand-built PrincipalContext) into transport write authority.
 */
function issueServicePrincipal(
  config: ServiceAuthConfig,
  sessionId: string,
): AuthenticatedTransportPrincipal {
  if (!resolvedServiceConfigs.has(config)) {
    throw new PrincipalAuthError("PRINCIPAL_MISSING", "service memory_add capability requires resolved service configuration");
  }
  return createAuthenticatedPrincipal({
    principalId: config.principalId,
    workspaceId: config.workspaceId,
    tenantIds: config.tenantIds,
    roles: config.roles,
    scopes: config.scopes,
    authMethod: config.authMethod,
    sessionId,
  });
}

/**
 * Authenticate the stdio/service transport using this process's configured
 * service identity. This is the sole public service-capability boundary.
 */
export function authenticateServiceTransport(sessionId: string): AuthenticatedTransportPrincipal {
  return issueServicePrincipal(
    resolveServiceAuthConfig(process.env as EnvLike),
    sessionId,
  );
}

/**
 * Legacy /mcp bridge only: converts the exact token object returned by
 * validateToken into a capability issuer. The validation module records those
 * objects in a process-local WeakSet after hash/revocation/expiry checks, so a
 * route or test cannot manufacture this authority from a lookalike token.
 */
export function createLegacyTokenPrincipal(token: McpCredentialRecord, sessionId: string): AuthenticatedTransportPrincipal {
  if (!isValidatedToken(token)) {
    throw new PrincipalAuthError("PRINCIPAL_MISSING", "legacy memory_add requires a credential verified by validateToken");
  }
  return createAuthenticatedPrincipal({
    principalId: token.agent_name,
    workspaceId: token.workspace_id,
    tenantIds: [token.group_id],
    roles: rolesFromScopes(token.scopes ?? []),
    scopes: token.scopes ?? [],
    authMethod: "mcp_token",
    sessionId,
    credentialId: token.id,
    pairedDeviceId: token.paired_device_id ?? undefined,
    expiresAt: token.expires_at instanceof Date ? token.expires_at.toISOString() : token.expires_at,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BEARER EXTRACTION (AC-2)
// ─────────────────────────────────────────────────────────────────────────────

export type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderBag, name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/**
 * Extract a bearer token from an Authorization header.
 *
 * Returns `null` when the header is absent (caller decides whether that is
 * AUTH_MISSING or a dev-local pass). Throws AUTH_MALFORMED for a header that
 * is present but not a well-formed `Bearer <token>`.
 */
export function extractBearerToken(headers: HeaderBag): string | null {
  const header = headerValue(headers, "authorization");
  if (header === undefined || header === null || header.trim() === "") return null;

  const match = /^Bearer[ ]+(\S+)$/.exec(header.trim());
  if (!match) {
    throw new PrincipalAuthError(
      "AUTH_MALFORMED",
      "Authorization header must be of the form 'Bearer <token>'",
    );
  }
  return match[1];
}

/** Constant-time string compare that does not leak length via early return. */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  // Compare equal-length digests of the inputs so that a length difference is
  // still resolved in constant time relative to the compared buffers.
  if (bufA.length !== bufB.length) {
    // Burn an equivalent comparison to keep the timing profile flat.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Stable transport correlation: MCP session, then request id, otherwise null. */
export function resolveRequestCorrelationId(headers: HeaderBag, protocolRequestId?: unknown): string | null {
  for (const name of ["mcp-session-id", "x-request-id"]) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    const candidate = Array.isArray(value) ? value[0] : value;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  if (typeof protocolRequestId === "string" && protocolRequestId.trim()) return protocolRequestId.trim();
  if (typeof protocolRequestId === "number" && Number.isFinite(protocolRequestId)) return String(protocolRequestId);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE -> ROLE MAPPING
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_SCOPES = new Set(["admin:roles", "admin:users", "workspace:lock", "agents:revoke", "admin:budget", "admin:budget:global"]);
const CURATOR_SCOPES = new Set(["review:approve", "review:reject", "memory:promote"]);

/** Every scope defined in `@allura/types`. An unknown scope grants nothing. */
const KNOWN_SCOPES = new Set([
  "memory:read",
  "memory:write",
  "memory:delete",
  "memory:forget",
  "memory:promote",
  "review:read",
  "review:approve",
  "review:reject",
  "receipt:create",
  "audit:read",
  "audit:export",
  "agents:create",
  "agents:revoke",
  "tokens:create",
  "tokens:rotate",
  "workspace:lock",
  "admin:users",
  "admin:roles",
  "admin:budget",
  "admin:budget:global",
]);

/**
 * Map credential scopes onto MCP principal roles. Least privilege:
 *  - any recognised scope implies `viewer` (the baseline);
 *  - review/promote scopes imply `curator`;
 *  - admin/workspace scopes imply `admin`;
 *  - a credential with no recognised scope gets no roles at all.
 */
export function rolesFromScopes(scopes: readonly string[]): PrincipalRole[] {
  const roles = new Set<PrincipalRole>();
  for (const scope of scopes ?? []) {
    if (!KNOWN_SCOPES.has(scope)) continue;
    roles.add("viewer");
    if (ADMIN_SCOPES.has(scope)) roles.add("admin");
    if (CURATOR_SCOPES.has(scope)) roles.add("curator");
  }
  return ["viewer", "curator", "admin"].filter((r) => roles.has(r as PrincipalRole)) as PrincipalRole[];
}

// ─────────────────────────────────────────────────────────────────────────────
// REVOCATION CACHE (AC-8)
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  record: McpCredentialRecord;
  loadedAtMs: number;
}

/**
 * In-process credential cache keyed by the credential's *stored hash* — never
 * by the raw token. Default TTL 0 disables caching entirely.
 */
export class CredentialCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number) {}

  get(key: string, nowMs: number): McpCredentialRecord | null {
    if (this.ttlMs <= 0) return null;
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (nowMs - entry.loadedAtMs >= this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return entry.record;
  }

  set(key: string, record: McpCredentialRecord, nowMs: number): void {
    if (this.ttlMs <= 0) return;
    this.entries.set(key, { record, loadedAtMs: nowMs });
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────

function toMillis(value: string | Date | null): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Public transport-authentication surface. Its issuer is deliberately private:
 * production callers can obtain it only through createDefaultAuthenticator(),
 * which wires the real token hash verifier and repository.
 */
export interface McpAuthenticator {
  authenticate(headers: HeaderBag, sessionId?: string): Promise<AuthenticatedTransportPrincipal>;
  clearCache(): void;
}

class McpAuthenticatorIssuer implements McpAuthenticator {
  private readonly cache: CredentialCache;

  constructor(
    private readonly config: HttpAuthConfig,
    private readonly deps: AuthenticatorDeps,
  ) {
    this.cache = new CredentialCache(config.cacheTtlMs);
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private sessionId(explicit?: string): string {
    if (explicit) return explicit;
    if (this.deps.newSessionId) return this.deps.newSessionId();
    return `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  /** Drop any cached credential state (used by tests and on revocation). */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Authenticate one request and resolve a verified PrincipalContext.
   *
   * @throws PrincipalAuthError with a stable reason code on every refusal.
   */
  async authenticate(headers: HeaderBag, sessionId?: string): Promise<AuthenticatedTransportPrincipal> {
    const token = extractBearerToken(headers);

    if (token === null) {
      if (this.config.mode === "dev_local") {
        return createAuthenticatedPrincipal({
          principalId: this.config.devPrincipalId,
          tenantIds: this.config.devTenantIds,
          roles: this.config.devRoles,
          authMethod: "dev_local",
          sessionId: this.sessionId(sessionId),
        });
      }
      throw new PrincipalAuthError(
        "AUTH_MISSING",
        "Missing Authorization header; a Bearer credential is required",
      );
    }

    // Legacy shared bearer token. Timing-safe compare (AC-2). Kept for
    // backwards compatibility with existing deployments (AC-10).
    //
    // GATED (review Finding 5): only honoured when shared_token is the ACTIVE
    // mode. Once an operator sets ALLURA_MCP_TOKEN_SECRET they have opted into
    // per-caller revocable credentials, and a leftover ALLURA_MCP_AUTH_TOKEN
    // must not remain a parallel, unrevocable way in. AC-10 is unaffected:
    // a deployment that has not migrated has no token secret, so it resolves to
    // shared_token mode and keeps working unchanged.
    if (
      this.config.mode === "shared_token" &&
      this.config.sharedToken &&
      timingSafeCompare(token, this.config.sharedToken)
    ) {
      return createAuthenticatedPrincipal({
        principalId: this.config.sharedPrincipalId,
        tenantIds: this.config.sharedTenantIds,
        roles: this.config.sharedRoles,
        authMethod: "service_identity",
        sessionId: this.sessionId(sessionId),
      });
    }

    if (this.config.mode === "shared_token") {
      // Only the shared token is accepted in this mode and it did not match.
      throw new PrincipalAuthError("AUTH_INVALID", "Bearer credential is not recognised");
    }

    if (this.config.mode === "dev_local") {
      // Dev-local accepts any token but grants only the dev principal — it
      // never escalates based on the token value.
      return createAuthenticatedPrincipal({
        principalId: this.config.devPrincipalId,
        tenantIds: this.config.devTenantIds,
        roles: this.config.devRoles,
        authMethod: "dev_local",
        sessionId: this.sessionId(sessionId),
      });
    }

    return this.authenticateMcpToken(token, sessionId);
  }

  private async authenticateMcpToken(
    token: string,
    sessionId?: string,
  ): Promise<AuthenticatedTransportPrincipal> {
    const prefix = this.deps.prefixOf(token);
    const nowMs = this.now().getTime();

    let record = this.cache.get(prefix, nowMs);
    // Device rows must never be served from an in-process credential cache.
    // A terminal transition revokes the DB row in the same transaction; this
    // forces the next request to observe that committed state without relying
    // on LISTEN/NOTIFY delivery.
    if (record?.paired_device_id != null) {
      this.cache.invalidate(prefix);
      record = null;
    }
    if (!record) {
      record = await this.deps.findByPrefix(prefix);
      if (!record) {
        throw new PrincipalAuthError("AUTH_INVALID", "Bearer credential is not recognised");
      }
      // Only cache after the hash verifies below.
    }

    if (!this.deps.verifyToken(token, record.token_hash)) {
      this.cache.invalidate(prefix);
      throw new PrincipalAuthError("AUTH_INVALID", "Bearer credential is not recognised");
    }

    if (record.revoked_at !== null && record.revoked_at !== undefined) {
      this.cache.invalidate(prefix);
      throw new PrincipalAuthError("AUTH_REVOKED", "Bearer credential has been revoked");
    }

    const expiresAtMs = toMillis(record.expires_at);
    if (expiresAtMs !== null && expiresAtMs <= nowMs) {
      this.cache.invalidate(prefix);
      throw new PrincipalAuthError("AUTH_EXPIRED", "Bearer credential has expired");
    }

    if (record.paired_device_id != null) {
      this.cache.invalidate(prefix);
    } else {
      this.cache.set(prefix, record, nowMs);
    }

    if (this.deps.touchLastUsed) {
      // Best effort — bookkeeping must never fail a valid request.
      void this.deps.touchLastUsed(record.id).catch(() => undefined);
    }

    return createAuthenticatedPrincipal({
      principalId: record.agent_name,
      workspaceId: record.workspace_id,
      tenantIds: [record.group_id],
      roles: rolesFromScopes(record.scopes ?? []),
      authMethod: "mcp_token",
      sessionId: this.sessionId(sessionId),
      credentialId: record.id,
      pairedDeviceId: record.paired_device_id ?? undefined,
      scopes: record.scopes ?? [],
      expiresAt: record.expires_at instanceof Date
        ? record.expires_at.toISOString()
        : record.expires_at,
    });
  }
}

/**
 * Build an authenticator backed by the real `mcp_tokens` repository.
 *
 * Imported lazily so that this module stays DB-free for unit tests.
 */
async function createDefaultAuthenticator(
  config: HttpAuthConfig,
  newSessionId: () => string,
): Promise<McpAuthenticator> {
  if (!hasAuthenticatedHttpProof(config)) {
    throw new PrincipalAuthError(
      "CONFIG_MISSING",
      "HTTP authenticator requires configuration resolved at the transport boundary",
    );
  }

  if (config.mode !== "mcp_token") {
    // No DB needed for shared_token / dev_local modes.
    return new McpAuthenticatorIssuer(config, {
      prefixOf: (raw) => raw,
      findByPrefix: async () => null,
      verifyToken: () => false,
      newSessionId,
    });
  }

  const [{ prefixOf, verifyToken }, repo] = await Promise.all([
    import("@/lib/mcp-token/hash"),
    import("@/lib/mcp-token/repository"),
  ]);

  return new McpAuthenticatorIssuer(config, {
    prefixOf,
    verifyToken,
    findByPrefix: async (prefix) =>
      (await repo.findByPrefix(prefix)) as unknown as McpCredentialRecord | null,
    touchLastUsed: repo.touchLastUsed,
    newSessionId,
  });
}

/**
 * Resolve raw HTTP configuration for diagnostics. This does not issue an
 * authenticator or any transport authority.
 */
export function createDefaultAuthenticatorFromEnvironment(env: EnvLike): HttpAuthConfig {
  return resolveHttpAuthConfig(env);
}

/**
 * The only public HTTP transport-authentication factory. It owns the complete
 * resolve → freeze → stamp → verify flow, so external callers cannot issue an
 * authenticator from caller-owned configuration.
 */
export async function createHttpAuthenticator(
  env: EnvLike,
  newSessionId: () => string,
): Promise<McpAuthenticator> {
  return createDefaultAuthenticator(
    authenticateHttpConfig(createDefaultAuthenticatorFromEnvironment(env)),
    newSessionId,
  );
}
