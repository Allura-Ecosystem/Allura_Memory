#!/usr/bin/env bun
/**
 * CI validation: Route-Scope Manifest Coverage (AD-42)
 *
 * Validates that all API routes and page routes in the source tree
 * are declared in the route-scope-manifest. Unlisted routes are a CI failure.
 *
 * Two gates, both fatal:
 *   1. Coverage  — every route file under src/app has a manifest entry
 *                  (or is on the public/exempt allowlist).
 *   2. Strength  — no manifest entry declares a role weaker than the role its
 *                  handler enforces on EVERY exported method. A handler that
 *                  splits read/write (GET viewer, POST admin) is legal: the
 *                  manifest declares the proxy-level floor, so it is compared
 *                  against the weakest role the handler enforces.
 *
 * Usage:
 *   bun run validate:route-scope-manifest
 *   bun scripts/validate-route-scope-manifest.ts
 *   bun scripts/validate-route-scope-manifest.ts --json=artifacts/route-scope.json
 *   # Exit code 0 = all routes covered and no weak declarations. 1 = failure.
 *
 * Runs in CI as a build gate (.github/workflows/epic-24-evidence.yml,
 * .github/workflows/ci.yml). Does NOT require PostgreSQL or Neo4j — purely
 * static analysis.
 *
 * The manifest is the single source of route authority. This script must never
 * be taught to read a hardcoded gate table in proxy.ts.
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";

import {
  matchesPattern,
  PUBLIC_ROUTE_MANIFEST,
  ROUTE_SCOPE_MANIFEST,
  type PublicRouteEntry,
  type RouteScopeEntry,
} from "../src/lib/auth/route-scope-manifest";
import { minimumRoleForAction } from "../src/lib/auth/permission-action-role";
import { ALLURA_ROLES, ROLE_LEVEL, type AlluraRole } from "../src/lib/auth/types";

// -- Configuration -----------------------------------------------------------

/**
 * The one directory that is scanned for routes.
 *
 * Historically this was SCAN_DIRS = [src/app, src/app/api], which walked every
 * API route twice — once as a child of src/app and once as its own scan root —
 * and inflated every reported count by 2x. src/app/api is nested inside
 * src/app, so a single root covers both.
 */
const APP_DIR_RELATIVE = join("src", "app");

/** File patterns that indicate a route handler. */
const ROUTE_FILE_PATTERNS = ["route.ts", "page.tsx", "page.ts"];

/**
 * Framework-owned paths that never correspond to a route file under src/app.
 *
 * The public-route allowlist itself is NOT duplicated here — it is read from
 * PUBLIC_ROUTE_MANIFEST in src/lib/auth/route-scope-manifest.ts, so that the
 * manifest module stays the single source of route authority and every public
 * route carries a recorded rationale.
 */
const FRAMEWORK_EXEMPT_PATTERNS = [
  "/_next/:path*",
  "/favicon.ico",
  "/favicon/:path*",
  "/healthz",
  "/ping",
];

function repoRoot(): string {
  return join(__dirname, "..");
}

// -- Route Discovery ---------------------------------------------------------

export interface FoundRoute {
  pathname: string;
  filePath: string;
  fileType: "api" | "page";
}

/**
 * Derive a URL pathname from a route file path relative to src/app.
 * `relPath` is expected to use the host platform separator.
 */
export function derivePathname(relPath: string): string {
  let pathname =
    "/" +
    relPath
      .split(sep)
      .join("/")
      // Strip Next.js route groups: (main), (auth), etc.
      .replace(/\([^/]+\)\//g, "")
      .replace(/\/route\.ts$/, "")
      .replace(/\/page\.tsx$/, "")
      .replace(/\/page\.ts$/, "")
      .replace(/\[\.\.\.[^\]]+\]/g, ":path*")
      .replace(/\[([^\]]+)\]/g, ":$1");

  // Normalize - remove trailing index
  if (pathname.endsWith("/index")) pathname = pathname.slice(0, -6);
  if (pathname === "") pathname = "/";
  return pathname;
}

/**
 * Walk `appDir` and return one FoundRoute per route file.
 *
 * Deduplicated by file path so that a future scan-root regression cannot
 * silently inflate the counts again.
 */
export function findRouteFiles(appDir: string, projectRoot: string): FoundRoute[] {
  const seen = new Set<string>();
  const routes: FoundRoute[] = [];

  function walk(current: string) {
    const entries = readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(current, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!ROUTE_FILE_PATTERNS.includes(entry.name)) continue;

      const filePath = relative(projectRoot, fullPath).split(sep).join("/");
      if (seen.has(filePath)) continue;
      seen.add(filePath);

      const pathname = derivePathname(relative(appDir, fullPath));
      routes.push({
        pathname,
        filePath,
        fileType: pathname.startsWith("/api") ? "api" : "page",
      });
    }
  }

  walk(appDir);
  routes.sort((a, b) => a.filePath.localeCompare(b.filePath));
  return routes;
}

// -- Coverage ----------------------------------------------------------------

/** True when the pathname is declared public in PUBLIC_ROUTE_MANIFEST. */
export function isDeclaredPublic(
  pathname: string,
  publicManifest: readonly PublicRouteEntry[] = PUBLIC_ROUTE_MANIFEST,
): boolean {
  return publicManifest.some((entry) => matchesPattern(pathname, entry.pattern));
}

/** True when the pathname is a framework-owned path, not an application route. */
export function isFrameworkExempt(pathname: string): boolean {
  return FRAMEWORK_EXEMPT_PATTERNS.some((pattern) => matchesPattern(pathname, pattern));
}

/** The manifest entry that governs `pathname`, or null when undeclared. */
export function findManifestEntry(
  pathname: string,
  manifest: readonly RouteScopeEntry[] = ROUTE_SCOPE_MANIFEST,
): RouteScopeEntry | null {
  for (const entry of manifest) {
    if (matchesPattern(pathname, entry.pattern)) return entry;
  }
  // Parent prefix fallback (e.g. /admin/settings caught by /admin/:path*).
  for (const entry of manifest) {
    if (
      entry.pattern.endsWith("/:path*") &&
      pathname.startsWith(entry.pattern.slice(0, -6))
    ) {
      return entry;
    }
  }
  return null;
}

// -- Role strength -----------------------------------------------------------

const REQUIRE_ROLE_RE = /requireRole\s*\(\s*[^,()]+,\s*["']([a-zA-Z_]+)["']/g;
const WITH_PERMISSION_RE =
  /withPermission\s*\(\s*[^,()]+,\s*["']([^"']+)["'](?:\s*,\s*["']([a-zA-Z_]+)["'])?\s*\)/g;

/** Every AlluraRole a handler source enforces, in source order. */
export function extractEnforcedRoles(source: string): AlluraRole[] {
  const roles: AlluraRole[] = [];
  REQUIRE_ROLE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = REQUIRE_ROLE_RE.exec(source)) !== null) {
    const candidate = match[1];
    if ((ALLURA_ROLES as readonly string[]).includes(candidate)) {
      roles.push(candidate as AlluraRole);
    }
  }

  WITH_PERMISSION_RE.lastIndex = 0;
  while ((match = WITH_PERMISSION_RE.exec(source)) !== null) {
    const actionFloor = minimumRoleForAction(match[1] ?? "");
    const explicitRole = match[2];
    if (explicitRole !== undefined && (ALLURA_ROLES as readonly string[]).includes(explicitRole)) {
      const explicit = explicitRole as AlluraRole;
      roles.push(ROLE_LEVEL[explicit] >= ROLE_LEVEL[actionFloor] ? explicit : actionFloor);
    } else {
      roles.push(actionFloor);
    }
  }
  return roles;
}

/** The least-privileged role in a list — the floor a handler actually enforces. */
export function weakestRole(roles: AlluraRole[]): AlluraRole | null {
  if (roles.length === 0) return null;
  return roles.reduce((lowest, role) =>
    ROLE_LEVEL[role] < ROLE_LEVEL[lowest] ? role : lowest,
  );
}

export interface RoleViolation {
  pathname: string;
  filePath: string;
  declaredRole: AlluraRole;
  enforcedRole: AlluraRole;
}

/**
 * A manifest entry declaring a role weaker than the floor its handler enforces
 * is a lie the proxy will act on: it admits a principal the handler will then
 * reject, and — worse — it understates the route's real authority in the one
 * document that is supposed to be authoritative.
 */
export function checkRoleStrength(
  routes: FoundRoute[],
  readSource: (filePath: string) => string,
  manifest: readonly RouteScopeEntry[] = ROUTE_SCOPE_MANIFEST,
): RoleViolation[] {
  const violations: RoleViolation[] = [];

  for (const route of routes) {
    if (route.fileType !== "api") continue;
    const entry = findManifestEntry(route.pathname, manifest);
    if (!entry) continue;

    const enforced = weakestRole(extractEnforcedRoles(readSource(route.filePath)));
    if (!enforced) continue;

    if (ROLE_LEVEL[entry.requiredRole] < ROLE_LEVEL[enforced]) {
      violations.push({
        pathname: route.pathname,
        filePath: route.filePath,
        declaredRole: entry.requiredRole,
        enforcedRole: enforced,
      });
    }
  }

  return violations;
}

// -- Classification ----------------------------------------------------------

export interface CheckResult {
  covered: FoundRoute[];
  uncovered: FoundRoute[];
  public: FoundRoute[];
  exempt: FoundRoute[];
  roleViolations: RoleViolation[];
}

/**
 * Buckets every discovered route.
 *
 * ROUTE_SCOPE_MANIFEST is checked first, matching resolveRouteAuthority(): a
 * broad public pattern must not be able to silently un-gate a route that is
 * declared protected.
 */
export function classifyRoutes(
  routes: FoundRoute[],
  manifest: readonly RouteScopeEntry[] = ROUTE_SCOPE_MANIFEST,
  publicManifest: readonly PublicRouteEntry[] = PUBLIC_ROUTE_MANIFEST,
): Omit<CheckResult, "roleViolations"> {
  const result = {
    covered: [] as FoundRoute[],
    uncovered: [] as FoundRoute[],
    public: [] as FoundRoute[],
    exempt: [] as FoundRoute[],
  };

  for (const route of routes) {
    if (findManifestEntry(route.pathname, manifest)) {
      result.covered.push(route);
    } else if (isDeclaredPublic(route.pathname, publicManifest)) {
      result.public.push(route);
    } else if (isFrameworkExempt(route.pathname)) {
      result.exempt.push(route);
    } else {
      result.uncovered.push(route);
    }
  }

  return result;
}

// -- Report ------------------------------------------------------------------

function printReport(result: CheckResult, total: number): void {
  console.log(`\nRoute-Scope Manifest Coverage\n`);
  console.log(`Scan root:            ${APP_DIR_RELATIVE}`);
  console.log(`Protected manifest:   ${ROUTE_SCOPE_MANIFEST.length} entries`);
  console.log(`Public manifest:      ${PUBLIC_ROUTE_MANIFEST.length} entries`);
  console.log(`Total routes found:   ${total}`);
  console.log(`Covered by manifest:  ${result.covered.length}`);
  console.log(`Public (declared):    ${result.public.length}`);
  console.log(`Exempt (framework):   ${result.exempt.length}`);
  console.log(`UNCOVERED (FAIL):     ${result.uncovered.length}`);
  console.log(`WEAK ROLE (FAIL):     ${result.roleViolations.length}`);

  if (result.uncovered.length > 0) {
    console.log(`\nFAIL - routes NOT in the manifest:\n`);
    for (const route of result.uncovered) {
      console.log(`   ${route.pathname.padEnd(50)} ${route.filePath}`);
    }
    console.log(
      `\nAdd entries to src/lib/auth/route-scope-manifest.ts for each uncovered route.`,
    );
  }

  if (result.roleViolations.length > 0) {
    console.log(`\nFAIL - manifest declares a weaker role than the handler enforces:\n`);
    for (const violation of result.roleViolations) {
      console.log(
        `   ${violation.pathname.padEnd(46)} manifest=${violation.declaredRole.padEnd(8)} handler=${violation.enforcedRole.padEnd(8)} ${violation.filePath}`,
      );
    }
    console.log(
      `\nRaise requiredRole in src/lib/auth/route-scope-manifest.ts to match the handler.`,
    );
  }

  if (result.public.length > 0) {
    console.log(`\nPublic routes (declared in PUBLIC_ROUTE_MANIFEST with a rationale):\n`);
    for (const route of result.public) {
      console.log(`   ${route.pathname.padEnd(50)} ${route.filePath}`);
    }
  }
}

// -- Artifact ----------------------------------------------------------------

export interface CoverageArtifact {
  schema_version: "1.0.0";
  kind: "route-scope-manifest-coverage";
  generated_at: string;
  commit_sha: string | null;
  scan_root: string;
  manifest_entries: number;
  public_manifest_entries: number;
  routes: {
    total: number;
    covered: number;
    public: number;
    exempt: number;
    uncovered: number;
    api: number;
    page: number;
  };
  uncovered_routes: Array<{ pathname: string; file_path: string }>;
  role_violations: Array<{
    pathname: string;
    file_path: string;
    declared_role: string;
    enforced_role: string;
  }>;
  status: "pass" | "fail";
}

export function buildArtifact(
  routes: FoundRoute[],
  result: CheckResult,
  commitSha: string | null,
  generatedAt: string,
): CoverageArtifact {
  const total =
    result.covered.length +
    result.uncovered.length +
    result.public.length +
    result.exempt.length;

  return {
    schema_version: "1.0.0",
    kind: "route-scope-manifest-coverage",
    generated_at: generatedAt,
    commit_sha: commitSha,
    scan_root: APP_DIR_RELATIVE.split(sep).join("/"),
    manifest_entries: ROUTE_SCOPE_MANIFEST.length,
    public_manifest_entries: PUBLIC_ROUTE_MANIFEST.length,
    routes: {
      total,
      covered: result.covered.length,
      public: result.public.length,
      exempt: result.exempt.length,
      uncovered: result.uncovered.length,
      api: routes.filter((r) => r.fileType === "api").length,
      page: routes.filter((r) => r.fileType === "page").length,
    },
    uncovered_routes: result.uncovered.map((r) => ({
      pathname: r.pathname,
      file_path: r.filePath,
    })),
    role_violations: result.roleViolations.map((v) => ({
      pathname: v.pathname,
      file_path: v.filePath,
      declared_role: v.declaredRole,
      enforced_role: v.enforcedRole,
    })),
    status: result.uncovered.length + result.roleViolations.length > 0 ? "fail" : "pass",
  };
}

// -- Main --------------------------------------------------------------------

export function parseJsonPath(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith("--json=")) return arg.slice("--json=".length);
  }
  return null;
}

function main(argv: string[]): number {
  const projectRoot = repoRoot();
  const appDir = join(projectRoot, APP_DIR_RELATIVE);

  if (!statSync(appDir, { throwIfNoEntry: false })) {
    console.error(`Route scan root not found: ${appDir}`);
    return 1;
  }

  const routes = findRouteFiles(appDir, projectRoot);
  const classified = classifyRoutes(routes);
  const roleViolations = checkRoleStrength(routes, (filePath) =>
    readFileSync(join(projectRoot, filePath), "utf8"),
  );
  const result: CheckResult = { ...classified, roleViolations };
  printReport(result, routes.length);

  const artifact = buildArtifact(
    routes,
    result,
    process.env.GITHUB_SHA ?? null,
    new Date().toISOString(),
  );

  const jsonPath = parseJsonPath(argv);
  if (jsonPath) {
    const absolute = resolve(process.cwd(), jsonPath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, JSON.stringify(artifact, null, 2) + "\n", "utf8");
    console.log(`\nRoute count artifact written: ${jsonPath}`);
  }

  if (artifact.status === "fail") return 1;

  console.log(`\nPASS - every route is explicitly declared and no manifest role is weak.`);
  return 0;
}

// Only self-execute when this file is the process entrypoint, so that the pure
// helpers above can be imported by unit tests without running the scan.
const entrypoint = process.argv[1] ?? "";
if (entrypoint.endsWith("validate-route-scope-manifest.ts")) {
  process.exit(main(process.argv.slice(2)));
}
