/**
 * Route-Scope Manifest (AD-42)
 *
 * Standalone, CI-validatable declaration of every route and its required
 * authorization scope. CI fails any route missing a declaration, making an
 * unguarded route a build error.
 *
 * FAIL CLOSED (Story 24.11a). A pathname that matches no entry in either
 * ROUTE_SCOPE_MANIFEST or PUBLIC_ROUTE_MANIFEST is NOT public. It resolves to
 * `kind: "undeclared"` and requires UNDECLARED_ROUTE_ROLE ("admin"). Undeclared
 * authority is the most restrictive authority, never the absence of authority.
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
 * Routes NOT declared here are NOT public — see PUBLIC_ROUTE_MANIFEST for the
 * explicit public allowlist and resolveRouteAuthority() for the fail-closed
 * resolution order. CI enforces that every API and page route has an entry in
 * one of the two manifests.
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

  // ── Admin pending reviewed authority assignment (Story 24.11b) ───────────
  // These existing handlers intentionally keep the runtime fail-closed admin
  // default while Story 24.11b reviews their least-privilege authority.
  {
    pattern: "/api/coherence/conflicts", requiredRole: "admin", scopeName: "pending-review:coherence:conflicts",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/coherence/resolve", requiredRole: "admin", scopeName: "pending-review:coherence:resolve",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/curator/metrics", requiredRole: "admin", scopeName: "pending-review:curator:metrics",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/evidence/:id", requiredRole: "admin", scopeName: "pending-review:evidence:id",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/execution-overview", requiredRole: "admin", scopeName: "pending-review:execution-overview",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/genesis/proposals", requiredRole: "admin", scopeName: "pending-review:genesis:proposals",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/genesis/proposals/approve", requiredRole: "admin", scopeName: "pending-review:genesis:proposals:approve",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/genesis/proposals/reject", requiredRole: "admin", scopeName: "pending-review:genesis:proposals:reject",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/handoffs", requiredRole: "admin", scopeName: "pending-review:handoffs",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/handoffs/:id", requiredRole: "admin", scopeName: "pending-review:handoffs:id",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/handoffs/:id/acknowledge", requiredRole: "admin", scopeName: "pending-review:handoffs:id:acknowledge",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/handoffs/:id/reject", requiredRole: "admin", scopeName: "pending-review:handoffs:id:reject",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/projects/:id", requiredRole: "admin", scopeName: "pending-review:projects:id",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/runs", requiredRole: "admin", scopeName: "pending-review:runs",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/runs/:id", requiredRole: "admin", scopeName: "pending-review:runs:id",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/runs/:id/breakpoints", requiredRole: "admin", scopeName: "pending-review:runs:id:breakpoints",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/runs/:id/cancel", requiredRole: "admin", scopeName: "pending-review:runs:id:cancel",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/runs/:id/doctor", requiredRole: "admin", scopeName: "pending-review:runs:id:doctor",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/runs/:id/events", requiredRole: "admin", scopeName: "pending-review:runs:id:events",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/runs/:id/resume", requiredRole: "admin", scopeName: "pending-review:runs:id:resume",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/tenants", requiredRole: "admin", scopeName: "pending-review:tenants",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/tenants/:group_id", requiredRole: "admin", scopeName: "pending-review:tenants:group-id",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/tracking/skill-usage", requiredRole: "admin", scopeName: "pending-review:tracking:skill-usage",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/trajectories", requiredRole: "admin", scopeName: "pending-review:trajectories",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/trajectories/stats", requiredRole: "admin", scopeName: "pending-review:trajectories:stats",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/work-items", requiredRole: "admin", scopeName: "pending-review:work-items",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/work-items/:id", requiredRole: "admin", scopeName: "pending-review:work-items:id",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
  },
  {
    pattern: "/api/work-items/:id/transition", requiredRole: "admin", scopeName: "pending-review:work-items:id:transition",
    description: "Pending Story 24.11b reviewed authority assignment; fail-closed admin.",
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
    pattern: "/api/memory/:id/restore",
    requiredRole: "admin",
    scopeName: "memory:restore",
    description: "Restore a memory by ID (admin)",
  },
  {
    pattern: "/api/memory/user/:userId",
    requiredRole: "admin",
    scopeName: "memory:user:delete",
    description: "Delete a user's memories (admin)",
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
    pattern: "/api/audit/cross-tenant",
    requiredRole: "admin",
    scopeName: "audit:cross-tenant",
    description: "Cross-tenant audit access (admin)",
  },
  {
    pattern: "/api/audit/:path*",
    requiredRole: "curator",
    scopeName: "audit:read",
    description: "Audit event logs",
  },

  // ── Brain (governed memory surface — Story 24.11a AC-4) ──────────────
  {
    pattern: "/api/brain/memories",
    requiredRole: "viewer",
    scopeName: "brain:memories:read",
    description: "List Brain memories for a tenant (returns real memory content)",
  },
  {
    pattern: "/api/brain/search",
    requiredRole: "viewer",
    scopeName: "brain:search:read",
    description: "Hybrid search over Brain memories (returns real memory content)",
  },

  // ── Hosted Platform (Allura Guard) ────────────────────────────────────────
  {
    pattern: "/api/tokens",
    requiredRole: "admin",
    scopeName: "tokens:admin",
    description: "MCP token mint/list (admin)",
  },
  {
    pattern: "/api/tokens/:path*",
    requiredRole: "admin",
    scopeName: "tokens:admin:routes",
    description: "MCP token revoke/rotate by id (admin)",
  },
  {
    pattern: "/api/members",
    requiredRole: "admin",
    scopeName: "members:admin",
    description: "Team membership list/add (admin)",
  },
  {
    pattern: "/api/members/:path*",
    requiredRole: "admin",
    scopeName: "members:admin:routes",
    description: "Member role change / removal by id (admin)",
  },
  {
    pattern: "/api/workspaces",
    requiredRole: "viewer",
    scopeName: "workspaces:api",
    description: "Workspace list (viewer) / create (admin — enforced in handler)",
  },
  {
    pattern: "/api/workspaces/:path*",
    requiredRole: "viewer",
    scopeName: "workspaces:api:routes",
    description: "Workspace sub-routes (write enforced in handler)",
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

// ── Public Route Manifest (explicit allowlist) ───────────────────────────────

/**
 * A route that is deliberately served without an authenticated principal.
 *
 * Every entry MUST carry a rationale. "It was open before" is not a rationale.
 * If a route cannot justify being here it belongs in ROUTE_SCOPE_MANIFEST.
 */
export interface PublicRouteEntry {
  /** URL pattern (same syntax as RouteScopeEntry.pattern) */
  pattern: string;
  /** Human-readable scope label for audit events */
  scopeName: string;
  /** Why this route is reachable without a principal. Required, not optional. */
  rationale: string;
}

/**
 * The complete set of routes served without authentication.
 *
 * ROUTE_SCOPE_MANIFEST wins on conflict: resolveRouteAuthority() checks the
 * protected manifest first, so adding a broad pattern here cannot silently
 * un-gate a route that is declared protected.
 */
export const PUBLIC_ROUTE_MANIFEST: PublicRouteEntry[] = [
  {
    pattern: "/",
    scopeName: "public:root",
    rationale: "Unauthenticated landing surface; renders no tenant data.",
  },
  {
    pattern: "/auth/:path*",
    scopeName: "public:auth",
    rationale:
      "Sign-in, sign-up and callback surfaces must be reachable before a principal exists.",
  },
  {
    pattern: "/api/auth/:path*",
    scopeName: "public:auth:api",
    rationale:
      "Clerk-owned auth API routes; authentication is performed by the provider, not by this gate.",
  },
  {
    pattern: "/api/health",
    scopeName: "public:health",
    rationale:
      "Liveness/readiness probe. Returns subsystem status only, no tenant rows.",
  },
  {
    pattern: "/api/health/:path*",
    scopeName: "public:health:routes",
    rationale:
      "Probe family (live/ready/isolation/metrics/recovery-log) consumed by container orchestration before any principal exists.",
  },
  {
    pattern: "/api/live",
    scopeName: "public:live",
    rationale: "Container liveness probe. No tenant data.",
  },
  {
    pattern: "/api/ready",
    scopeName: "public:ready",
    rationale: "Container readiness probe. No tenant data.",
  },
  {
    pattern: "/api/trace",
    scopeName: "public:trace",
    rationale:
      "Internal audit sink. Authorized by the x-internal-trace shared secret, not by a principal, because the Edge gate calls it while emitting its own unauthenticated-denial events. Gating it on a principal would silence the audit trail for exactly the requests that matter.",
  },
  {
    pattern: "/api/mcp",
    scopeName: "public:mcp",
    rationale:
      "MCP transport endpoint. Carries its own Bearer-token authentication (see src/lib/mcp-token).",
  },
  {
    pattern: "/api/mcp/:path*",
    scopeName: "public:mcp:routes",
    rationale: "MCP transport sub-routes. Bearer-token authenticated.",
  },
  {
    pattern: "/mcp",
    scopeName: "public:mcp:page",
    rationale: "MCP transport surface. Bearer-token authenticated.",
  },
  {
    pattern: "/api/brain/health",
    scopeName: "public:brain:health",
    rationale:
      "Brain liveness report (audit_health_report). Returns subsystem status and queue depth only, no memory content, so it is consistent with the other /api/health/* probes. Story 24.11a AC-4: sibling routes /api/brain/memories and /api/brain/search return real memory content and are declared protected.",
  },
];

// ── Fail-Closed Default ──────────────────────────────────────────────────────

/**
 * Role required by a pathname that matches neither manifest.
 *
 * Deliberately the most privileged role. An undeclared route has no reviewed
 * authority statement, so the gate cannot know who should reach it; the safe
 * answer is "almost nobody" rather than "everybody". Declaring the route in
 * ROUTE_SCOPE_MANIFEST is the way to widen access.
 */
export const UNDECLARED_ROUTE_ROLE: AlluraRole = "admin";

// ── Pattern Matching ──────────────────────────────────────────────────────────

/**
 * Match a URL pattern against an actual pathname.
 *
 * Three forms:
 *   "/api/memory"        exact only
 *   "/api/memory/:id"    one nonempty path segment
 *   "/api/audit/:path*"  "/api/audit" or any descendant
 *
 * Descendants must be explicit. Treating an exact entry as a prefix hides a
 * newly-added child route behind an authority statement that was only reviewed
 * for its parent, defeating the manifest's fail-closed ratchet.
 *
 * The wildcard replacement consumes the slash that precedes ":path*". Without
 * that, "/api/audit/:path*" expanded to /^\/api\/audit\/(?:\/.*)?$/, which
 * requires a double slash and therefore matched nothing real -- every
 * ":path*" entry in both manifests was silently dead, including
 * "/auth/:path*". Fixed in Story 24.11a, where a dead public entry would have
 * meant the login page itself was gated.
 */
export function matchesPattern(pathname: string, pattern: string): boolean {
  if (!pattern.includes(":")) {
    return pathname === pattern;
  }
  const regexPattern = pattern
    .replace(/\/:path\*/g, "(?:/.*)?")
    .replace(/\/:path\+/g, "(?:/.+)")
    .replace(/\/:[^/]+/g, "/[^/]+")
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

// ── Fail-Closed Authority Resolution ─────────────────────────────────────────

/**
 * The authority decision for a pathname. There is no fourth case: every
 * pathname is public, declared-protected, or undeclared-and-therefore-denied.
 */
export type RouteAuthority =
  | { kind: "public"; scopeName: string; rationale: string }
  | { kind: "declared"; requiredRole: AlluraRole; scopeName: string }
  | { kind: "undeclared"; requiredRole: AlluraRole; scopeName: string };

/** Look up the public allowlist entry for a pathname, if any. */
export function getPublicEntry(pathname: string): PublicRouteEntry | null {
  for (const entry of PUBLIC_ROUTE_MANIFEST) {
    if (matchesPattern(pathname, entry.pattern)) {
      return entry;
    }
  }
  return null;
}

/**
 * Resolve the authority for a pathname. This is the single entry point the
 * HTTP gate uses, for both the production (Clerk) and dev-auth branches.
 *
 * Resolution order is fail-closed:
 *   1. ROUTE_SCOPE_MANIFEST  -> declared, use its role
 *   2. PUBLIC_ROUTE_MANIFEST -> public, no principal required
 *   3. neither               -> undeclared, UNDECLARED_ROUTE_ROLE required
 *
 * The protected manifest is checked first on purpose: a careless broad pattern
 * in the public allowlist cannot un-gate a route that was explicitly declared.
 */
export function resolveRouteAuthority(pathname: string): RouteAuthority {
  const declared = getScopeEntry(pathname);
  if (declared) {
    return {
      kind: "declared",
      requiredRole: declared.requiredRole,
      scopeName: declared.scopeName,
    };
  }

  const publicEntry = getPublicEntry(pathname);
  if (publicEntry) {
    return {
      kind: "public",
      scopeName: publicEntry.scopeName,
      rationale: publicEntry.rationale,
    };
  }

  return {
    kind: "undeclared",
    requiredRole: UNDECLARED_ROUTE_ROLE,
    scopeName: "route:undeclared",
  };
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