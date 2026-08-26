/**
 * MCP credential verification and principal resolution.
 *
 * Story 24.2 (Epic 24). This module turns a transport-level credential into a
 * verified `PrincipalContext`, or refuses with a stable reason code.
 *
 * Design constraints:
 *  - No import-time environment reads and no import-time DB access. Every
 *    dependency is injected, so the whole module is unit testable in-process
 *    with no live server and no live database.
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
 *  - `ALLURA_MCP_AUTH_CACHE_TTL_MS` may raise the TTL to at most 60000 ms.
 *    With a non-zero TTL, `expires_at` is still evaluated live on every
 *    request (it is carried in the cached record), so expiry is always
 *    immediate; only *revocation* may lag by up to the configured TTL.
 */

import { timingSafeEqual } from "node:crypto";
import {
  type AuthMethod,
  createPrincipalContext,
  PrincipalAuthError,
  type PrincipalContext,
  type PrincipalRole,
  TENANT_WILDCARD,
} from "./principal-context";

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
  expires_at: string | Date | null;
  revoked_at: string | Date | null;
}

export interface AuthenticatorDeps {
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
  authMethod: Extract<AuthMethod, "service_identity" | "dev_local">;
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
    return { principalId, workspaceId, tenantIds, roles, authMethod: "service_identity" };
  }

  // Non-production: an explicit service identity is honoured when configured,
  // otherwise fall back to the dev-local principal.
  if (principalId && tenantIds.length > 0) {
    return { principalId, workspaceId: workspaceId || "dev-local", tenantIds, roles, authMethod: "service_identity" };
  }

  return {
    principalId: env.ALLURA_MCP_DEV_PRINCIPAL_ID || "dev-local-stdio",
    workspaceId: workspaceId || "dev-local",
    tenantIds: parseList(env.ALLURA_MCP_DEV_TENANTS).length
      ? parseList(env.ALLURA_MCP_DEV_TENANTS)
      : [TENANT_WILDCARD],
    roles: parseRoles(env.ALLURA_MCP_DEV_ROLES, ["admin", "curator", "viewer"]),
    authMethod: "dev_local",
  };
}

/** Build the stdio/service principal from resolved configuration. */
export function createServicePrincipal(
  config: ServiceAuthConfig,
  sessionId: string,
): PrincipalContext {
  return createPrincipalContext({
    principalId: config.principalId,
    workspaceId: config.workspaceId,
    tenantIds: config.tenantIds,
    roles: config.roles,
    authMethod: config.authMethod,
    sessionId,
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

export class McpAuthenticator {
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
  async authenticate(headers: HeaderBag, sessionId?: string): Promise<PrincipalContext> {
    const token = extractBearerToken(headers);

    if (token === null) {
      if (this.config.mode === "dev_local") {
        return createPrincipalContext({
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
      return createPrincipalContext({
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
      return createPrincipalContext({
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
  ): Promise<PrincipalContext> {
    const prefix = this.deps.prefixOf(token);
    const nowMs = this.now().getTime();

    let record = this.cache.get(prefix, nowMs);
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

    this.cache.set(prefix, record, nowMs);

    if (this.deps.touchLastUsed) {
      // Best effort — bookkeeping must never fail a valid request.
      void this.deps.touchLastUsed(record.id).catch(() => undefined);
    }

    return createPrincipalContext({
      principalId: record.agent_name,
      workspaceId: record.workspace_id,
      tenantIds: [record.group_id],
      roles: rolesFromScopes(record.scopes ?? []),
      authMethod: "mcp_token",
      sessionId: this.sessionId(sessionId),
      credentialId: record.id,
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
export async function createDefaultAuthenticator(
  config: HttpAuthConfig,
  newSessionId: () => string,
): Promise<McpAuthenticator> {
  if (config.mode !== "mcp_token") {
    // No DB needed for shared_token / dev_local modes.
    return new McpAuthenticator(config, {
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

  return new McpAuthenticator(config, {
    prefixOf,
    verifyToken,
    findByPrefix: async (prefix) =>
      (await repo.findByPrefix(prefix)) as unknown as McpCredentialRecord | null,
    touchLastUsed: repo.touchLastUsed,
    newSessionId,
  });
}
