/**
 * Route-Scope Manifest (AD-42)
 *
 * Standalone, CI-validatable declaration of every protected route and its
 * required authorization scope. CI fails any route missing a declaration,
 * making an unguarded route a build error.
 *
 * Separated from proxy.ts so CI can validate the manifest independently
 * without importing Next.js internals or Edge-runtime dependencies.
 *
 * Usage in proxy.ts:
 *   import { getRequiredRole } from "./route-scope-manifest";
 *   const required = getRequiredRole(pathname);
 *
 * Usage in route handler:
 *   import { requireRole } from "@/lib/auth/api-auth";
 *   import { getScope, SCOPE_KEYS } from "@/lib/auth/route-scope-manifest";
 *   const user = requireAuth(request);
 *   if (!user) return unauthorizedResponse();
 *   const scope = getScope(pathname); // exact scope this route declares
 *
 * Usage in CI:
 *   bun scripts/validate-route-manifest.ts
 */

import type { AlluraRole } from "./types";

// ── Route-Scope Entry ────────────────────────────────────────────────────────

export interface RouteScopeEntry {
  /** URL pattern (supports Next.js matcher syntax, same as proxy.ts) */
  pattern: string;
  /** Minimum role required */
  requiredRole: AlluraRole;
  /** Human-readable scope label for audit events */
  scopeName: string;
  /** HTTP methods to protect (defaults to all methods) */
  methods?: string[];
  /** Description of what this route does */
  description?: string;
}

// ── Canonical Manifest (SINGLE SOURCE OF TRUTH) ──────────────────────────────

/**
 * Every protected route in the system must be declared here.
 *
 * Routes NOT declared here are treated as public.
 * CI enforces that every API and page route has an entry.
 *
 * Organisation: group by scope category, alphabetically within each group.
 */
export const ROUTE_SCOPE_MANIFEST: RouteScopeEntry[] = [
  // ── Admin ────────────────────────────────────────────────────────────────
  {
    pattern: "/admin",
    requiredRole: "admin",
    scopeName: "admin:dashboard",
    description: "Admin dashboard landing page",
  },
  {
    pattern: "/admin/:path*",
    requiredRole: "admin",
    scopeName: "admin:routes",
    description: "Admin sub-routes",
  },
  {
    pattern: "/api/curator/watchdog",
    requiredRole: "curator",
    scopeName: "curator:watchdog",
    description: "Curator watchdog trigger",
  },

  // ── Curator ──────────────────────────────────────────────────────────────
  {
    pattern: "/api/curator/approve",
    requiredRole: "curator",
    scopeName: "curator:approve",
    description: "Curator proposal approve/reject",
  },
  {
    pattern: "/api/curator/reject",
    requiredRole: "curator",
    scopeName: "curator:reject",
    description: "Curator proposal reject",
  },
  {
    pattern: "/curator",
    requiredRole: "curator",
    scopeName: "curator:dashboard",
    description: "Curator dashboard landing page",
  },
  {
    pattern: "/curator/:path*",
    requiredRole: "curator",
    scopeName: "curator:routes",
    description: "Curator sub-routes",
  },

  // ── Memory (viewer+ read, curator+ write — route handler enforces write gate) ──
  {
    pattern: "/api/curator/proposals",
    requiredRole: "viewer",
    scopeName: "memory:curator:read",
    description: "Read curator proposals",
  },
  {
    pattern: "/api/memory",
    requiredRole: "viewer",
    scopeName: "memory:api",
    description: "Memory API root",
  },
  {
    pattern: "/api/memory/:path*",
    requiredRole: "viewer",
    scopeName: "memory:api:routes",
    description: "Memory API sub-routes",
  },
  {
    pattern: "/memory",
    requiredRole: "viewer",
    scopeName: "memory:ui",
    description: "Memory UI landing page",
  },
  {
    pattern: "/memory/:path*",
    requiredRole: "viewer",
    scopeName: "memory:ui:routes",
    description: "Memory UI sub-routes",
  },

  // ── Permission Profiles ───────────────────────────────────────────────────
  {
    pattern: "/api/permission-profiles",
    requiredRole: "viewer",
    scopeName: "permission:profiles:list",
    description: "List permission profiles",
  },
  {
    pattern: "/api/permission-profiles/:path*",
    requiredRole: "viewer",
    scopeName: "permission:profiles:routes",
    description: "Permission profile by ID (write enforced in handler)",
  },

  // ── MCP Catalog (admin — governance operations) ──────────────────────────
  {
    pattern: "/api/mcp-catalog/:path*",
    requiredRole: "admin",
    scopeName: "mcp-catalog:admin",
    description: "MCP catalog governance (import/approve/deny/profiles/candidates)",
  },

  // ── Audit ─────────────────────────────────────────────────────────────────
  {
    pattern: "/api/audit/:path*",
    requiredRole: "curator",
    scopeName: "audit:read",
    description: "Audit event logs",
  },

  // ── Agents & Projects ─────────────────────────────────────────────────────
  {
    pattern: "/api/agents",
    requiredRole: "viewer",
    scopeName: "agents:list",
    description: "List agents",
  },
  {
    pattern: "/api/projects",
    requiredRole: "viewer",
    scopeName: "projects:list",
    description: "List projects",
  },
  {
    pattern: "/agents",
    requiredRole: "viewer",
    scopeName: "agents:ui",
    description: "Agents UI page",
  },

  // ── Skills ─────────────────────────────────────────────────────────────────
  {
    pattern: "/api/skills",
    requiredRole: "viewer",
    scopeName: "skills:api",
    description: "Skills API",
  },

  // ── Metrics ────────────────────────────────────────────────────────────────
  {
    pattern: "/api/metrics",
    requiredRole: "viewer",
    scopeName: "metrics:api",
    description: "Metrics API",
  },

  // ── Stream (SSE events) ────────────────────────────────────────────────────
  {
    pattern: "/api/stream",
    requiredRole: "viewer",
    scopeName: "stream:events",
    description: "SSE event stream",
  },

  // ── Users & Groups (profile data) ──────────────────────────────────────────
  {
    pattern: "/api/users/:path*",
    requiredRole: "viewer",
    scopeName: "users:profile",
    description: "User profile routes",
  },
  {
    pattern: "/api/groups/:path*",
    requiredRole: "viewer",
    scopeName: "groups:profile",
    description: "Group profile routes",
  },

  // ── Dashboard (Phase 0 surfaces — en route to release approval) ──────────
  {
    pattern: "/api/scheduled-tasks",
    requiredRole: "viewer",
    scopeName: "dashboard:scheduled-tasks",
    description: "Scheduled tasks API",
  },
  {
    pattern: "/api/scheduled-tasks/:path*",
    requiredRole: "viewer",
    scopeName: "dashboard:scheduled-tasks:routes",
    description: "Scheduled tasks API sub-routes",
  },
  {
    pattern: "/api/settings",
    requiredRole: "viewer",
    scopeName: "dashboard:settings",
    description: "Settings API",
  },
  {
    pattern: "/api/settings/:path*",
    requiredRole: "viewer",
    scopeName: "dashboard:settings:routes",
    description: "Settings API sub-routes",
  },
  {
    pattern: "/api/teams",
    requiredRole: "viewer",
    scopeName: "dashboard:teams",
    description: "Teams API",
  },
  {
    pattern: "/api/teams/:path*",
    requiredRole: "viewer",
    scopeName: "dashboard:teams:routes",
    description: "Teams API sub-routes",
  },
  {
    pattern: "/api/dreams",
    requiredRole: "viewer",
    scopeName: "dashboard:dreams",
    description: "Dreams API",
  },
  {
    pattern: "/api/dreams/:path*",
    requiredRole: "viewer",
    scopeName: "dashboard:dreams:routes",
    description: "Dreams API sub-routes",
  },

  // ── Dashboard Pages ───────────────────────────────────────────────────────
  {
    pattern: "/dashboard",
    requiredRole: "viewer",
    scopeName: "dashboard:home",
    description: "Dashboard landing page",
  },
  {
    pattern: "/dashboard/:path*",
    requiredRole: "viewer",
    scopeName: "dashboard:pages",
    description: "Dashboard sub-pages (kanban/settings/scheduled-tasks/governance/mission-control/dreams/search/teams/graph)",
  },

  // ── Main UI Pages ─────────────────────────────────────────────────────────
  {
    pattern: "/allura",
    requiredRole: "viewer",
    scopeName: "ui:allura",
    description: "Allura UI page",
  },
  {
    pattern: "/command",
    requiredRole: "viewer",
    scopeName: "ui:command",
    description: "Command UI page",
  },
  {
    pattern: "/resources",
    requiredRole: "viewer",
    scopeName: "ui:resources",
    description: "Resources UI page",
  },
  {
    pattern: "/telemetry",
    requiredRole: "viewer",
    scopeName: "ui:telemetry",
    description: "Telemetry UI page",
  },
  {
    pattern: "/work-board",
    requiredRole: "viewer",
    scopeName: "ui:work-board",
    description: "Work board UI page",
  },
];

// ── Pattern Matching ──────────────────────────────────────────────────────────

/**
 * Match a URL pattern against an actual pathname.
 * Supports the same syntax as proxy.ts's matchesRoute.
 */
export function matchesPattern(pathname: string, pattern: string): boolean {
  if (!pattern.includes(":path*") && !pattern.includes(":path+")) {
    return pathname === pattern || pathname.startsWith(pattern + "/");
  }
  const regexPattern = pattern
    .replace(/:path\*/g, "(?:/.*)?")
    .replace(/:path\+/g, "(?:/.+)")
    .replace(/\//g, "\\/");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(pathname);
}

// ── Route Resolution ─────────────────────────────────────────────────────────

/**
 * Get the required role for a given pathname.
 * Returns null if the route is public (not in the manifest).
 */
export function getRequiredRole(pathname: string): AlluraRole | null {
  for (const entry of ROUTE_SCOPE_MANIFEST) {
    if (matchesPattern(pathname, entry.pattern)) {
      return entry.requiredRole;
    }
  }
  return null;
}

/**
 * Get the full scope entry for a given pathname.
 * Returns null if the route is public.
 */
export function getScopeEntry(pathname: string): RouteScopeEntry | null {
  for (const entry of ROUTE_SCOPE_MANIFEST) {
    if (matchesPattern(pathname, entry.pattern)) {
      return entry;
    }
  }
  return null;
}

/**
 * Get scope name for a given pathname.
 * Returns undefined if the route is public.
 */
export function getScopeName(pathname: string): string | undefined {
  return getScopeEntry(pathname)?.scopeName;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** All unique scope names for documentation/CI use. */
export const SCOPE_NAMES: readonly string[] = ROUTE_SCOPE_MANIFEST.map(
  (e) => e.scopeName,
);

/** All unique roles used in the manifest. */
export const MANIFEST_ROLES: readonly AlluraRole[] = [
  ...new Set(ROUTE_SCOPE_MANIFEST.map((e) => e.requiredRole)),
];

/** API route patterns (for CI filtering). */
export const API_PATTERNS: readonly string[] = ROUTE_SCOPE_MANIFEST
  .filter((e) => e.pattern.startsWith("/api/"))
  .map((e) => e.pattern);

/** Page route patterns. */
export const PAGE_PATTERNS: readonly string[] = ROUTE_SCOPE_MANIFEST
  .filter((e) => !e.pattern.startsWith("/api/"))
  .map((e) => e.pattern);