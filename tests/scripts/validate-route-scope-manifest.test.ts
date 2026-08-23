/**
 * Story 24.11a AC-5 / AC-6 — route-scope manifest validator.
 *
 * Pins the two behaviours the story buys:
 *   1. One scan root. The historical SCAN_DIRS = [src/app, src/app/api] walked
 *      every API route twice and inflated every count by 2x.
 *   2. A manifest entry may not declare a role weaker than the floor its
 *      handler enforces.
 *
 * Pure static analysis — no database, no network. Unit lane.
 */

import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildArtifact,
  checkRoleStrength,
  classifyRoutes,
  derivePathname,
  extractEnforcedRoles,
  findManifestEntry,
  findRouteFiles,
  type FoundRoute,
  parseJsonPath,

  weakestRole,
} from "../../scripts/validate-route-scope-manifest";
import type {
  PublicRouteEntry,
  RouteScopeEntry,
} from "../../src/lib/auth/route-scope-manifest";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function createFixtureApp(): Promise<{ root: string; appDir: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "route-scope-"));
  createdDirs.push(root);
  const appDir = path.join(root, "src", "app");

  await mkdir(path.join(appDir, "api", "memory"), { recursive: true });
  await mkdir(path.join(appDir, "api", "memory", "[id]"), { recursive: true });
  await mkdir(path.join(appDir, "(main)", "dashboard"), { recursive: true });

  await writeFile(path.join(appDir, "api", "memory", "route.ts"), "export const GET = 1\n");
  await writeFile(path.join(appDir, "api", "memory", "[id]", "route.ts"), "export const GET = 1\n");
  await writeFile(path.join(appDir, "(main)", "dashboard", "page.tsx"), "export default () => null\n");
  // Not a route file — must be ignored.
  await writeFile(path.join(appDir, "api", "memory", "helpers.ts"), "export const x = 1\n");

  return { root, appDir };
}

function countRouteFilesUnder(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += countRouteFilesUnder(full);
    } else if (["route.ts", "page.tsx", "page.ts"].includes(entry.name)) {
      total += 1;
    }
  }
  return total;
}

describe("derivePathname", () => {
  it("strips route groups, handler filenames and dynamic segments", () => {
    expect(derivePathname(path.join("api", "memory", "route.ts"))).toBe("/api/memory");
    expect(derivePathname(path.join("api", "memory", "[id]", "route.ts"))).toBe("/api/memory/:id");
    expect(derivePathname(path.join("(main)", "dashboard", "page.tsx"))).toBe("/dashboard");
    expect(derivePathname(path.join("api", "tenants", "[group_id]", "route.ts"))).toBe(
      "/api/tenants/:group_id",
    );
  });

  it("maps a catch-all segment to the manifest's :path* syntax", () => {
    expect(derivePathname(path.join("api", "proxy", "[...slug]", "route.ts"))).toBe(
      "/api/proxy/:path*",
    );
  });
});

describe("findRouteFiles — single scan root (AC-5 double-scan regression)", () => {
  it("returns each route file exactly once, including nested api routes", async () => {
    const { root, appDir } = await createFixtureApp();
    const routes = findRouteFiles(appDir, root);

    expect(routes).toHaveLength(3);
    const filePaths = routes.map((r) => r.filePath);
    expect(new Set(filePaths).size).toBe(filePaths.length);
    expect(routes.map((r) => r.pathname).sort()).toEqual([
      "/api/memory",
      "/api/memory/:id",
      "/dashboard",
    ]);
  });

  it("classifies api vs page routes", async () => {
    const { root, appDir } = await createFixtureApp();
    const routes = findRouteFiles(appDir, root);
    expect(routes.filter((r) => r.fileType === "api")).toHaveLength(2);
    expect(routes.filter((r) => r.fileType === "page")).toHaveLength(1);
  });

  it("counts the real src/app tree exactly once per route file", () => {
    const appDir = path.join(REPO_ROOT, "src", "app");
    const routes = findRouteFiles(appDir, REPO_ROOT);
    expect(routes).toHaveLength(countRouteFilesUnder(appDir));
  });
});

describe("extractEnforcedRoles", () => {
  it("uses the stricter action floor for every withPermission call shape", () => {
    const source = [
      'const roleCheck = requireRole(request, "viewer");',
      'const auth = await withPermission(request, "memory:delete", "viewer")',
      'const mutation = await withPermission(request, "memory:delete")',
      'const unknown = await withPermission(request, "unknown:action", "viewer")',
    ].join("\n");
    expect(extractEnforcedRoles(source)).toEqual(["viewer", "admin", "admin", "admin"]);
  });

  it("ignores non-role string arguments", () => {
    expect(extractEnforcedRoles('requireRole(request, "superuser")')).toEqual([]);
    expect(extractEnforcedRoles("export async function GET() {}")).toEqual([]);
  });

  it("is stateless across calls (no sticky regex lastIndex)", () => {
    const source = 'requireRole(request, "curator")';
    expect(extractEnforcedRoles(source)).toEqual(["curator"]);
    expect(extractEnforcedRoles(source)).toEqual(["curator"]);
  });
});

describe("weakestRole", () => {
  it("returns the least-privileged role", () => {
    expect(weakestRole(["admin", "viewer", "curator"])).toBe("viewer");
    expect(weakestRole(["admin", "curator"])).toBe("curator");
    expect(weakestRole([])).toBeNull();
  });
});

describe("checkRoleStrength (AC-6)", () => {
  const manifest: RouteScopeEntry[] = [
    {
      pattern: "/api/memory/:path*",
      requiredRole: "viewer",
      scopeName: "memory:api:routes",
    },
  ];

  const route: FoundRoute = {
    pathname: "/api/memory/restore",
    filePath: "src/app/api/memory/restore/route.ts",
    fileType: "api",
  };

  it("flags a manifest entry weaker than the role the handler enforces", () => {
    const violations = checkRoleStrength(
      [route],
      () => 'const rc = requireRole(request, "admin")',
      manifest,
    );
    expect(violations).toEqual([
      {
        pathname: "/api/memory/restore",
        filePath: "src/app/api/memory/restore/route.ts",
        declaredRole: "viewer",
        enforcedRole: "admin",
      },
    ]);
  });

  it("allows a read/write split — the manifest declares the handler's floor", () => {
    const source = [
      'export async function GET() { requireRole(request, "viewer") }',
      'export async function POST() { requireRole(request, "admin") }',
    ].join("\n");
    expect(checkRoleStrength([route], () => source, manifest)).toEqual([]);
  });

  it("allows a manifest entry stricter than the handler", () => {
    const strict: RouteScopeEntry[] = [
      { pattern: "/api/memory/:path*", requiredRole: "admin", scopeName: "x" },
    ];
    expect(
      checkRoleStrength([route], () => 'requireRole(request, "viewer")', strict),
    ).toEqual([]);
  });

  it("ignores routes with no detectable enforcement and page routes", () => {
    expect(checkRoleStrength([route], () => "export const GET = 1", manifest)).toEqual([]);
    const page: FoundRoute = { ...route, fileType: "page" };
    expect(
      checkRoleStrength([page], () => 'requireRole(request, "admin")', manifest),
    ).toEqual([]);
  });
});

describe("findManifestEntry", () => {
  const manifest: RouteScopeEntry[] = [
    { pattern: "/admin/:path*", requiredRole: "admin", scopeName: "admin:routes" },
    { pattern: "/api/skills", requiredRole: "viewer", scopeName: "skills:api" },
  ];

  it("matches exact and prefix patterns, and returns null when undeclared", () => {
    expect(findManifestEntry("/api/skills", manifest)?.scopeName).toBe("skills:api");
    expect(findManifestEntry("/admin/settings", manifest)?.scopeName).toBe("admin:routes");
    expect(findManifestEntry("/api/brain/search", manifest)).toBeNull();
  });
});

describe("coverage is manifest-only", () => {
  it("has no baseline exception file that can allow an uncovered handler", () => {
    expect(existsSync(path.join(REPO_ROOT, "config", "route-scope-manifest-baseline.json"))).toBe(false);
  });
});

const FIXTURE_MANIFEST: RouteScopeEntry[] = [
  { pattern: "/api/skills", requiredRole: "viewer", scopeName: "skills:api" },
];
const FIXTURE_PUBLIC_MANIFEST: PublicRouteEntry[] = [
  { pattern: "/api/health", scopeName: "public:health", rationale: "probe" },
];

describe("classifyRoutes", () => {
  const routes: FoundRoute[] = [
    { pathname: "/api/skills", filePath: "a/route.ts", fileType: "api" },
    { pathname: "/api/undeclared", filePath: "b/route.ts", fileType: "api" },
    { pathname: "/api/health", filePath: "c/route.ts", fileType: "api" },
    { pathname: "/favicon.ico", filePath: "d/route.ts", fileType: "page" },
  ];

  it("buckets protected, public, framework-exempt and undeclared routes", () => {
    const result = classifyRoutes(routes, FIXTURE_MANIFEST, FIXTURE_PUBLIC_MANIFEST);
    expect(result.covered.map((r) => r.pathname)).toEqual(["/api/skills"]);
    expect(result.public.map((r) => r.pathname)).toEqual(["/api/health"]);
    expect(result.exempt.map((r) => r.pathname)).toEqual(["/favicon.ico"]);
    expect(result.uncovered.map((r) => r.pathname)).toEqual(["/api/undeclared"]);
  });

  it("lets the protected manifest win over a broad public pattern", () => {
    const overlapping: PublicRouteEntry[] = [
      { pattern: "/api/skills", scopeName: "public:oops", rationale: "n/a" },
    ];
    const result = classifyRoutes(
      [routes[0]],
      FIXTURE_MANIFEST,
      overlapping,
    );
    expect(result.covered).toHaveLength(1);
    expect(result.public).toHaveLength(0);
  });
});

describe("artifact", () => {
  it("parses the --json flag", () => {
    expect(parseJsonPath(["--json=out/route.json"])).toBe("out/route.json");
    expect(parseJsonPath([])).toBeNull();
  });

  it("reports a total that is the sum of every bucket and fails on gaps", () => {
    const routes: FoundRoute[] = [
      { pathname: "/api/skills", filePath: "a/route.ts", fileType: "api" },
      { pathname: "/api/undeclared", filePath: "b/route.ts", fileType: "api" },
      { pathname: "/api/health", filePath: "c/route.ts", fileType: "api" },
    ];
    const classified = classifyRoutes(routes, FIXTURE_MANIFEST, FIXTURE_PUBLIC_MANIFEST);
    const artifact = buildArtifact(
      routes,
      { ...classified, roleViolations: [] },
      "abc123",
      "2026-08-23T00:00:00.000Z",
    );

    expect(artifact.routes.total).toBe(
      artifact.routes.covered +
        artifact.routes.public +
        artifact.routes.exempt +
        artifact.routes.uncovered,
    );
    expect(artifact.routes.total).toBe(routes.length);
    expect(artifact.commit_sha).toBe("abc123");
    expect(artifact.kind).toBe("route-scope-manifest-coverage");
    expect(artifact.routes.uncovered).toBeGreaterThan(0);
    expect(artifact.status).toBe("fail");
    expect(artifact).not.toHaveProperty("baseline_allowed_uncovered");
    expect(artifact).not.toHaveProperty("baseline_violations");
  });

  it("marks a fail status when only role violations are present", () => {
    const routes: FoundRoute[] = [
      { pathname: "/api/health", filePath: "c/route.ts", fileType: "api" },
    ];
    const artifact = buildArtifact(
      routes,
      {
        ...classifyRoutes(routes, FIXTURE_MANIFEST, FIXTURE_PUBLIC_MANIFEST),
        roleViolations: [
          {
            pathname: "/api/x",
            filePath: "x/route.ts",
            declaredRole: "viewer",
            enforcedRole: "admin",
          },
        ],
      },
      null,
      "2026-08-23T00:00:00.000Z",
    );
    expect(artifact.routes.uncovered).toBe(0);
    expect(artifact.status).toBe("fail");
    expect(artifact.role_violations).toHaveLength(1);
  });
});

describe("CLI end to end", () => {
  it("passes only with zero uncovered and zero weak roles", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "route-scope-cli-"));
    createdDirs.push(outDir);
    const outFile = path.join(outDir, "route-scope-manifest.json");

    expect(() =>
      execFileSync(
        "bun",
        ["scripts/validate-route-scope-manifest.ts", `--json=${outFile}`],
        { cwd: REPO_ROOT, encoding: "utf8", env: { ...process.env, GITHUB_SHA: "deadbeef" } },
      ),
    ).not.toThrow();

    const artifact = JSON.parse(await readFile(outFile, "utf8")) as {
      commit_sha: string;
      scan_root: string;
      routes: { total: number; api: number; page: number; uncovered: number };
      role_violations: unknown[];
      status: string;
    };

    expect(artifact.commit_sha).toBe("deadbeef");
    expect(artifact.scan_root).toBe("src/app");
    expect(artifact.routes.total).toBe(
      countRouteFilesUnder(path.join(REPO_ROOT, "src", "app")),
    );
    expect(artifact.routes.api + artifact.routes.page).toBe(artifact.routes.total);
    expect(artifact.routes.uncovered).toBe(0);
    expect(artifact.role_violations).toHaveLength(0);
    expect(artifact.status).toBe("pass");
  }, 60_000);
});
