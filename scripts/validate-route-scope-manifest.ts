/**
 * CI validation: Route-Scope Manifest Coverage (AD-42)
 *
 * Validates that all API routes and page routes in the source tree
 * are declared in the route-scope-manifest. Unlisted routes are a CI failure.
 *
 * Usage:
 *   bun scripts/validate-route-scope-manifest.ts
 *   # Exit code 0 = all routes covered. Non-zero = missing routes.
 *
 * Runs in CI as part of the typecheck/build gate.
 * Does NOT require PostgreSQL or Neo4j — purely static analysis.
 */

import { readdirSync, statSync } from "fs";
import { join, relative } from "path";

import {
  matchesPattern,
  ROUTE_SCOPE_MANIFEST,
} from "../src/lib/auth/route-scope-manifest";

// ── Configuration ────────────────────────────────────────────────────────────

const PROJECT_ROOT = join(__dirname, "..");

/** Directories to scan for routes. */
const SCAN_DIRS = [
  join(PROJECT_ROOT, "src/app"),
  join(PROJECT_ROOT, "src/app/api"),
];

/** File patterns that indicate a route handler. */
const ROUTE_FILE_PATTERNS = ["route.ts", "page.tsx", "page.ts"];

/** Known public routes (exempt from manifest requirement). */
const PUBLIC_ROUTE_PATTERNS = [
  "/api/health",
  "/api/health/:path*",
  "/api/live",
  "/api/ready",
  "/api/mcp",
  "/api/mcp/:path*",
  "/api/trace",
  "/auth/:path*",
  "/_next/:path*",
  "/favicon.ico",
  "/favicon/:path*",
  "/healthz",
  "/ping",
  "/",
];

/** Generated / catch-all routes exempt from manifest (Next.js internals). */
const EXEMPT_PATTERNS = [
  "/api/auth/:path*", // Clerk auth routes
];

// ── Route Discovery ──────────────────────────────────────────────────────────

interface FoundRoute {
  pathname: string;
  filePath: string;
  fileType: "api" | "page";
}

function findRouteFiles(dir: string): FoundRoute[] {
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

      // Derive route pathname from file path relative to src/app
      const relPath = relative(SCAN_DIRS[0], fullPath);
      let pathname = "/" + relPath
        // Strip Next.js route groups: (main), (auth), etc.
        .replace(/\([^/]+\)\//g, "")
        .replace(/\/route\.ts$/, "")
        .replace(/\/page\.tsx$/, "")
        .replace(/\/page\.ts$/, "")
        .replace(/\[\.\.\.([^\]]+)\]/g, ":$path*")
        .replace(/\[([^\]]+)\]/g, ":$1");

      // Normalize — remove trailing index
      if (pathname.endsWith("/index")) pathname = pathname.slice(0, -6);
      if (pathname === "") pathname = "/";

      const isApi = pathname.startsWith("/api/") || pathname.startsWith("/api");
      routes.push({
        pathname,
        filePath: relative(PROJECT_ROOT, fullPath),
        fileType: isApi ? "api" : "page",
      });
    }
  }

  walk(dir);
  return routes;
}

// ── Checking ─────────────────────────────────────────────────────────────────

function isPublicOrExempt(pathname: string): boolean {
  for (const pattern of [...PUBLIC_ROUTE_PATTERNS, ...EXEMPT_PATTERNS]) {
    if (matchesPattern(pathname, pattern)) return true;
  }
  return false;
}

function isInManifest(pathname: string): boolean {
  for (const entry of ROUTE_SCOPE_MANIFEST) {
    if (matchesPattern(pathname, entry.pattern)) return true;
  }
  return false;
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface CheckResult {
  covered: FoundRoute[];
  uncovered: FoundRoute[];
  public: FoundRoute[];
  exempt: FoundRoute[];
}

function main(): CheckResult {
  const allRoutes: FoundRoute[] = [];
  for (const dir of SCAN_DIRS) {
    if (statSync(dir, { throwIfNoEntry: false })) {
      allRoutes.push(...findRouteFiles(dir));
    }
  }

  const result: CheckResult = {
    covered: [],
    uncovered: [],
    public: [],
    exempt: [],
  };

  for (const route of allRoutes) {
    if (isPublicOrExempt(route.pathname)) {
      result.public.push(route);
    } else if (isInManifest(route.pathname)) {
      result.covered.push(route);
    } else {
      // Check if any parent route in manifest covers this (e.g., /admin/settings caught by /admin/:path*)
      let coveredByParent = false;
      for (const entry of ROUTE_SCOPE_MANIFEST) {
        if (entry.pattern.endsWith("/:path*") && route.pathname.startsWith(entry.pattern.slice(0, -6))) {
          coveredByParent = true;
          break;
        }
      }
      if (coveredByParent) {
        result.covered.push(route);
      } else {
        result.uncovered.push(route);
      }
    }
  }

  return result;
}

// ── Report ───────────────────────────────────────────────────────────────────

function printReport(result: CheckResult): void {
  console.log(`\n📋 Route-Scope Manifest Coverage\n`);
  console.log(`Total routes found:   ${result.covered.length + result.uncovered.length + result.public.length + result.exempt.length}`);
  console.log(`Covered by manifest:  ${result.covered.length}`);
  console.log(`Public (exempt):      ${result.public.length}`);
  console.log(`Exempt (framework):   ${result.exempt.length}`);
  console.log(`UNCOVERED (FAIL):     ${result.uncovered.length}`);

  if (result.uncovered.length > 0) {
    console.log(`\n❌ Routes NOT in the manifest:\n`);
    for (const route of result.uncovered) {
      console.log(`   ${route.pathname.padEnd(50)} ${route.filePath}`);
    }
    console.log(`\nAdd entries to src/lib/auth/route-scope-manifest.ts for each uncovered route.`);
  }

  if (result.public.length > 0) {
    console.log(`\nℹ️  Public routes (intentionally unprotected):\n`);
    for (const route of result.public) {
      console.log(`   ${route.pathname.padEnd(50)} ${route.filePath}`);
    }
  }
}

const result = main();
printReport(result);

if (result.uncovered.length > 0) {
  process.exit(1);
} else {
  console.log(`\n✅ All routes covered by the route-scope manifest.`);
  process.exit(0);
}