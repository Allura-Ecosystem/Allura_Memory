/**
 * Auth Configuration
 *
 * Centralizes auth-related environment variable validation and defaults.
 * Uses Zod for env validation at boundaries (per project convention).
 *
 * Reference: Phase 7 benchmark — Clerk auth integration
 */

import { z } from "zod";
import type { AlluraRole, DevAuthConfig } from "./types";

// ── Environment Schema ──────────────────────────────────────────────────────

/**
 * Zod schema for auth-related environment variables.
 *
 * Clerk keys are optional — when absent, DevAuthProvider is used.
 * Dev auth variables have safe defaults for local development.
 */
export const authEnvSchema = z.object({
  /** Clerk publishable key (client-side). Required for production. */
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),

  /** Clerk secret key (server-side). Required for production. */
  CLERK_SECRET_KEY: z.string().min(1).optional(),

  /** Enable dev auth bypass. Defaults to true in development. */
  ALLURA_DEV_AUTH_ENABLED: z.preprocess(
    (val) => val ?? (process.env.NODE_ENV !== "production" ? "true" : "false"),
    z.string().transform((val) => val === "true")
  ),

  /** Default role for dev auth users. Defaults to "admin" for convenience. */
  ALLURA_DEV_AUTH_ROLE: z
    .string()
    .transform((val) => val as AlluraRole)
    .default("admin"),

  /** Default group_id for dev auth users. */
  ALLURA_DEV_AUTH_GROUP_ID: z.string().default("allura-system"),

  /** Default user ID for dev auth users. */
  ALLURA_DEV_AUTH_USER_ID: z.string().default("dev-user-allura"),

  /** Default email for dev auth users. */
  ALLURA_DEV_AUTH_EMAIL: z.string().default("dev@allura.local"),

  /** Node environment */
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ── Sentry Configuration ────────────────────────────────────────────────

  /** Sentry DSN. When not set, Sentry is a complete no-op. */
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional().or(z.literal("")),

  /** Sentry environment override. Defaults to NODE_ENV. */
  SENTRY_ENVIRONMENT: z
    .string()
    .default("development")
    .refine(
      (val) => ["development", "staging", "production"].includes(val),
      { message: "SENTRY_ENVIRONMENT must be development, staging, or production" }
    ),

  /** Sentry traces sample rate (0.0 to 1.0). Defaults to 0.1. */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  /** Sentry profiles sample rate (0.0 to 1.0). Defaults to 0.1. */
  SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  /** Sentry release version. Defaults to npm_package_version. */
  SENTRY_RELEASE: z.string().optional(),

  // ── MCP / SDK Configuration ────────────────────────────────────────────

  /** Base URL of the Allura MCP HTTP gateway. Defaults to http://localhost:3201. */
  ALLURA_MCP_BASE_URL: z.string().url().default("http://localhost:3201"),

  /** Bearer token for MCP gateway authentication. Empty = dev mode (no auth). */
  ALLURA_MCP_AUTH_TOKEN: z.string().default(""),

  /** Request timeout for MCP SDK client in milliseconds. Defaults to 5000. */
  ALLURA_MCP_TIMEOUT_MS: z.coerce.number().min(100).max(60000).default(5000),

  /** Number of retry attempts for MCP SDK client. Defaults to 3. */
  ALLURA_MCP_RETRIES: z.coerce.number().min(0).max(10).default(3),
});

export type AuthEnvConfig = z.infer<typeof authEnvSchema>;

// ── Configuration Access ────────────────────────────────────────────────────

let _cachedConfig: AuthEnvConfig | null = null;

/**
 * Parse and validate auth environment variables.
 *
 * Results are cached for the lifetime of the process.
 * Call `clearAuthConfig()` to force re-validation (useful in tests).
 */
export function getAuthConfig(): AuthEnvConfig {
  if (_cachedConfig) {
    return _cachedConfig;
  }

  const result = authEnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error("[auth] Invalid auth environment variables:", result.error.flatten().fieldErrors);
    // In production, fail fast. In development, use defaults.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Auth environment validation failed: ${JSON.stringify(result.error.flatten().fieldErrors)}`
      );
    }
    // Development: use safe defaults
    console.warn("[auth] Using default auth config due to validation errors.");
    _cachedConfig = authEnvSchema.parse({});
    return _cachedConfig;
  }

  _cachedConfig = result.data;
  return _cachedConfig;
}

/**
 * Clear the cached auth config. Useful in tests.
 */
export function clearAuthConfig(): void {
  _cachedConfig = null;
}

// ── Derived Configuration ───────────────────────────────────────────────────

/**
 * Check if Clerk is properly configured (both keys present).
 */
export function isClerkEnabled(config?: AuthEnvConfig): boolean {
  const c = config ?? getAuthConfig();
  return (
    typeof c.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
    c.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0 &&
    typeof c.CLERK_SECRET_KEY === "string" &&
    c.CLERK_SECRET_KEY.length > 0
  );
}

/**
 * Check if dev auth bypass is active.
 *
 * Dev auth is NEVER active in production. This is unconditional and is checked
 * first: no combination of ALLURA_DEV_AUTH_ENABLED, missing Clerk keys, or role
 * configuration can re-enable it. Outside production, dev auth is active only
 * when explicitly enabled AND Clerk is not configured.
 *
 * The previous form was:
 *   ALLURA_DEV_AUTH_ENABLED && (!isClerkEnabled(c) || c.NODE_ENV !== "production")
 * where the `||` made "Clerk not configured" sufficient on its own, so a
 * production deployment without Clerk and with ALLURA_DEV_AUTH_ENABLED=true
 * granted an authenticated principal with ALLURA_DEV_AUTH_ROLE (default "admin").
 */
export function isDevAuthActive(config?: AuthEnvConfig): boolean {
  const c = config ?? getAuthConfig();
  if (c.NODE_ENV === "production") return false;
  return c.ALLURA_DEV_AUTH_ENABLED && !isClerkEnabled(c);
}

/**
 * Get the DevAuthProvider configuration.
 */
export function getDevAuthConfig(config?: AuthEnvConfig): DevAuthConfig {
  const c = config ?? getAuthConfig();
  return {
    enabled: isDevAuthActive(c),
    defaultRole: c.ALLURA_DEV_AUTH_ROLE as AlluraRole,
    defaultGroupId: c.ALLURA_DEV_AUTH_GROUP_ID,
    defaultUserId: c.ALLURA_DEV_AUTH_USER_ID,
    defaultEmail: c.ALLURA_DEV_AUTH_EMAIL,
  };
}

// ── Route Protection Configuration ───────────────────────────────────────────

/**
 * Route protection rules.
 *
 * Routes not listed here are public (no auth required).
 * Public routes: /api/health, /api/mcp (MCP has its own Bearer token auth)
 */
export const PROTECTED_ROUTES = [
  // Admin routes — admin only
  { pattern: "/admin", requiredRole: "admin" as AlluraRole },
  { pattern: "/admin/:path*", requiredRole: "admin" as AlluraRole },

  // Curator API — curator or admin
  { pattern: "/api/curator/approve", requiredRole: "curator" as AlluraRole },
  { pattern: "/api/curator/watchdog", requiredRole: "curator" as AlluraRole },

  // Curator proposals — viewer can read, but write requires curator
  { pattern: "/api/curator/proposals", requiredRole: "viewer" as AlluraRole },

  // Memory API — viewer or above
  { pattern: "/api/memory", requiredRole: "viewer" as AlluraRole },
  { pattern: "/api/memory/:path*", requiredRole: "viewer" as AlluraRole },

  // Permission profiles — viewer may read; route handlers enforce admin for mutation
  { pattern: "/api/permission-profiles", requiredRole: "viewer" as AlluraRole },
  { pattern: "/api/permission-profiles/:path*", requiredRole: "viewer" as AlluraRole },

  // Memory UI — viewer or above
  { pattern: "/memory", requiredRole: "viewer" as AlluraRole },
  { pattern: "/memory/:path*", requiredRole: "viewer" as AlluraRole },

  // Curator UI — curator or above
  { pattern: "/curator", requiredRole: "curator" as AlluraRole },
  { pattern: "/curator/:path*", requiredRole: "curator" as AlluraRole },
] as const;

/**
 * Routes that are always public (no auth required).
 */
export const PUBLIC_ROUTES = [
  "/api/health",
  "/api/health/:path*",
  "/api/mcp",
  "/api/mcp/:path*",
  "/auth/:path*",
  "/",
] as const;

/**
 * Routes that redirect authenticated users away (e.g., login page).
 */
export const AUTH_ROUTES = [
  "/auth/v1/login",
  "/auth/v1/register",
  "/auth/v2/login",
  "/auth/v2/register",
] as const;
