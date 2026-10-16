/**
 * Auth Middleware Tests
 *
 * Tests for the Next.js proxy middleware route protection and RBAC.
 * Uses the nonproduction DevAuth branch to test protected-route behaviour.
 */

import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// ── Mock Environment ────────────────────────────────────────────────────────

// Set dev auth environment before importing modules
process.env.ALLURA_DEV_AUTH_ENABLED = "true"
process.env.ALLURA_DEV_AUTH_ROLE = "admin"
process.env.ALLURA_DEV_AUTH_GROUP_ID = "allura-system"
process.env.ALLURA_DEV_AUTH_USER_ID = "dev-user-allura"
process.env.ALLURA_DEV_AUTH_EMAIL = "dev@allura.local"
// @ts-expect-error — NODE_ENV is read-only in Next.js types but must be set for tests
process.env.NODE_ENV = "test"

// ── Import after env setup ────────────────────────────────────────────────────

import { clearAuthConfig } from "@/lib/auth/config"
import {
  matchesPattern,
  PUBLIC_ROUTE_MANIFEST,
  resolveRouteAuthority,
  ROUTE_SCOPE_MANIFEST,
} from "@/lib/auth/route-scope-manifest"
import proxyDefault from "@/proxy"

// The proxy default export is (req: NextRequest) => Promise<NextResponse>.
type TestMiddleware = (req: NextRequest) => Promise<NextResponse>
const middleware = proxyDefault as unknown as TestMiddleware

describe("Auth Middleware", () => {
  beforeEach(() => {
    clearAuthConfig()
  })

  // ── Public Routes ────────────────────────────────────────────────────────

  describe("public routes", () => {
    it.each([
      "/api/health",
      "/api/health/ready",
      "/api/health/live",
      "/api/health/detailed",
      "/api/mcp",
      "/api/mcp/messages",
      "/auth/v1/login",
      "/auth/v2/login",
      "/auth/v1/register",
      "/auth/v2/register",
      "/",
    ])("should allow access to public route %s", async (path) => {
      const request = new NextRequest(new URL(path, "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.status).toBe(200)
    })
  })

  // ── Protected Routes (Dev Auth — admin role) ──────────────────────────────

  describe("protected routes with dev auth (admin role)", () => {
    it("should allow admin access to /admin routes", async () => {
      const request = new NextRequest(new URL("/admin/approvals", "http://localhost:3100"))
      const response = await middleware(request)
      // Dev auth defaults to admin, so should pass
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it("should allow admin access to /api/curator/approve", async () => {
      const request = new NextRequest(new URL("/api/curator/approve", "http://localhost:3100"), {
        method: "POST",
      })
      const response = await middleware(request)
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it("should allow admin access to /api/memory", async () => {
      const request = new NextRequest(new URL("/api/memory?group_id=allura-test", "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it("should allow admin access to /memory UI", async () => {
      const request = new NextRequest(new URL("/memory", "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it("should allow admin access to /curator UI", async () => {
      const request = new NextRequest(new URL("/curator", "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })
  })

  // ── Static Assets ─────────────────────────────────────────────────────────

  describe("static assets", () => {
    it.each([
      "/_next/static/chunks/main.js",
      "/_next/image?url=%2Flogo.png",
      "/favicon.ico",
      "/logo.svg",
      "/styles.css",
    ])("should allow access to static asset %s", async (path) => {
      const request = new NextRequest(new URL(path, "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.status).toBe(200)
    })
  })

  // ── Route Matching ───────────────────────────────────────────────────────

  describe("route matching", () => {
    it("should match nested admin paths", async () => {
      const request = new NextRequest(new URL("/admin/settings/roles", "http://localhost:3100"))
      const response = await middleware(request)
      // Dev auth is admin, so should pass
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it("should match nested memory API paths", async () => {
      const request = new NextRequest(new URL("/api/memory/traces?group_id=allura-test", "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })

    it("should match nested memory UI paths", async () => {
      const request = new NextRequest(new URL("/memory/search", "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(403)
    })
  })

  // ── Auth Headers ──────────────────────────────────────────────────────────

  describe("auth header injection", () => {
    it("should forward x-allura-user-id header upstream for authenticated requests", async () => {
      const request = new NextRequest(new URL("/memory", "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBe("dev-user-allura")
    })

    it("should forward x-allura-role header upstream for authenticated requests", async () => {
      const request = new NextRequest(new URL("/memory", "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.headers.get("x-middleware-request-x-allura-role")).toBe("admin")
    })

    it("should forward x-allura-group-id header upstream for authenticated requests", async () => {
      const request = new NextRequest(new URL("/memory", "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.headers.get("x-middleware-request-x-allura-group-id")).toBe("allura-system")
    })

    it("should overwrite spoofed incoming x-allura headers before forwarding upstream", async () => {
      const request = new NextRequest(new URL("/memory", "http://localhost:3100"), {
        headers: {
          "x-allura-user-id": "spoofed-user",
          "x-allura-role": "viewer",
          "x-allura-group-id": "allura-attacker",
          "x-allura-workspace-id": "workspace-attacker",
          "x-allura-session-id": "session-attacker",
          "x-allura-email": "spoof@example.test",
          "x-allura-name": "Spoofed User",
          "x-allura-image-url": "https://example.test/spoof.png",
        },
      })
      const response = await middleware(request)

      expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBe("dev-user-allura")
      expect(response.headers.get("x-middleware-request-x-allura-role")).toBe("admin")
      expect(response.headers.get("x-middleware-request-x-allura-group-id")).toBe("allura-system")
      expect(response.headers.get("x-middleware-request-x-allura-workspace-id")).toBe("workspace-allura")
      expect(response.headers.get("x-middleware-request-x-allura-session-id")).toBe("dev:dev-user-allura")
      expect(response.headers.get("x-middleware-request-x-allura-email")).toBe("dev@allura.local")
      expect(response.headers.get("x-middleware-request-x-allura-name")).toBe("Dev User")
      expect(response.headers.get("x-middleware-request-x-allura-image-url")).toBeNull()
      expect(response.headers.get("x-allura-user-id")).toBeNull()
    })

    it("should strip spoofed x-allura headers on public routes", async () => {
      const request = new NextRequest(new URL("/api/health", "http://localhost:3100"), {
        headers: {
          "x-allura-user-id": "spoofed-user",
          "x-allura-role": "admin",
          "x-allura-group-id": "allura-attacker",
          "x-allura-workspace-id": "workspace-attacker",
          "x-allura-session-id": "session-attacker",
          "x-allura-email": "spoof@example.test",
          "x-allura-name": "Spoofed User",
          "x-allura-image-url": "https://example.test/spoof.png",
        },
      })
      const response = await middleware(request)

      expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBeNull()
      expect(response.headers.get("x-middleware-request-x-allura-role")).toBeNull()
      expect(response.headers.get("x-middleware-request-x-allura-group-id")).toBeNull()
      expect(response.headers.get("x-middleware-request-x-allura-workspace-id")).toBeNull()
      expect(response.headers.get("x-middleware-request-x-allura-session-id")).toBeNull()
      expect(response.headers.get("x-middleware-request-x-allura-email")).toBeNull()
      expect(response.headers.get("x-middleware-request-x-allura-name")).toBeNull()
      expect(response.headers.get("x-middleware-request-x-allura-image-url")).toBeNull()
    })
  })

  // ── Role-Based Access (with different dev roles) ──────────────────────────

  describe("role-based access control", () => {
    it("should define correct protected routes", () => {
      expect(ROUTE_SCOPE_MANIFEST).toBeDefined()
      expect(ROUTE_SCOPE_MANIFEST.length).toBeGreaterThan(0)

      // Check admin routes
      const adminRoutes = ROUTE_SCOPE_MANIFEST.filter((r) => r.requiredRole === "admin")
      expect(adminRoutes.some((r) => r.pattern.includes("/admin"))).toBe(true)

      // Check curator routes
      const curatorRoutes = ROUTE_SCOPE_MANIFEST.filter((r) => r.requiredRole === "curator")
      expect(curatorRoutes.some((r) => r.pattern.includes("/curator"))).toBe(true)

      // Check viewer routes
      const viewerRoutes = ROUTE_SCOPE_MANIFEST.filter((r) => r.requiredRole === "viewer")
      expect(viewerRoutes.some((r) => r.pattern.includes("/memory"))).toBe(true)
      expect(viewerRoutes.some((r) => r.pattern.includes("/api/permission-profiles"))).toBe(true)
    })

    it("should define correct public routes", () => {
      const publicPatterns = PUBLIC_ROUTE_MANIFEST.map((entry) => entry.pattern)
      expect(publicPatterns).toContain("/api/health")
      expect(publicPatterns).toContain("/api/mcp")
      expect(publicPatterns).toContain("/")
    })
  })

  // ── Fail Closed (Story 24.11a AC-1 / AC-2 / AC-4) ─────────────────────────

  describe("fail closed — undeclared routes are denied", () => {
    const ORIGINAL_ENABLED = process.env.ALLURA_DEV_AUTH_ENABLED
    const ORIGINAL_ROLE = process.env.ALLURA_DEV_AUTH_ROLE

    afterEach(() => {
      process.env.ALLURA_DEV_AUTH_ENABLED = ORIGINAL_ENABLED
      process.env.ALLURA_DEV_AUTH_ROLE = ORIGINAL_ROLE
      clearAuthConfig()
    })

    it("resolves a path absent from both manifests as undeclared, requiring admin", () => {
      const authority = resolveRouteAuthority("/api/no-such-route-declared-anywhere")
      expect(authority.kind).toBe("undeclared")
      if (authority.kind !== "public") {
        expect(authority.requiredRole).toBe("admin")
      }
    })

    it.each([
      "/api/no-such-route-declared-anywhere",
      "/api/handoffs",
      "/api/runs",
      "/api/tenants",
    ])(
      "returns 401 and no tenant data for undeclared route %s when unauthenticated",
      async (path) => {
        // No principal at all: dev auth off, no provider configured.
        process.env.ALLURA_DEV_AUTH_ENABLED = "false"
        clearAuthConfig()

        const request = new NextRequest(new URL(path, "http://localhost:3100"))
        const response = await middleware(request)

        expect(response.status).toBe(401)

        // Renders no tenant data: the body is the denial envelope and nothing else.
        const body = await response.json()
        expect(body).toEqual({ error: "Authentication required", statusCode: 401 })
        expect(JSON.stringify(body)).not.toContain("group_id")
        expect(JSON.stringify(body)).not.toContain("allura-")

        // And no auth context is forwarded upstream.
        expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBeNull()
        expect(response.headers.get("x-middleware-request-x-allura-group-id")).toBeNull()
        expect(response.headers.get("x-middleware-request-x-allura-role")).toBeNull()
      }
    )

    it("returns 403 for an undeclared route when the principal is below admin", async () => {
      process.env.ALLURA_DEV_AUTH_ENABLED = "true"
      process.env.ALLURA_DEV_AUTH_ROLE = "viewer"
      clearAuthConfig()

      const request = new NextRequest(
        new URL("/api/no-such-route-declared-anywhere", "http://localhost:3100")
      )
      const response = await middleware(request)

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.statusCode).toBe(403)
      expect(body.required).toBe("admin")
      expect(response.headers.get("x-middleware-request-x-allura-group-id")).toBeNull()
    })

    it("denies an undeclared page route by redirecting to login, not passing it through", async () => {
      process.env.ALLURA_DEV_AUTH_ENABLED = "false"
      clearAuthConfig()

      const request = new NextRequest(new URL("/some-undeclared-page", "http://localhost:3100"))
      const response = await middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/auth/v2/login")
    })

    it("does not let a dotted /api path escape the gate as a static asset", async () => {
      process.env.ALLURA_DEV_AUTH_ENABLED = "false"
      clearAuthConfig()

      const request = new NextRequest(
        new URL("/api/memory/report.json", "http://localhost:3100")
      )
      const response = await middleware(request)

      expect(response.status).toBe(401)
    })

    it.each([
      ["/api/plugins/bumblebee/runs", "bmb_runner_abcdefgh_body"],
      ["/api/plugins/bumblebee/ingest", "bmb_ingest_abcdefgh_body"],
    ])("forwards only POST %s to its route-owned plugin-token gate", async (path, token) => {
      process.env.ALLURA_DEV_AUTH_ENABLED = "false"
      clearAuthConfig()

      const forwarded = await middleware(new NextRequest(new URL(path, "http://localhost:3100"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "x-allura-user-id": "spoofed-user",
          "x-allura-role": "admin",
          "x-allura-group-id": "allura-attacker",
        },
      }))

      expect(forwarded.status).toBe(200)
      expect(forwarded.headers.get("x-middleware-request-authorization")).toBe(`Bearer ${token}`)
      expect(forwarded.headers.get("x-middleware-request-x-allura-user-id")).toBeNull()
      expect(forwarded.headers.get("x-middleware-request-x-allura-role")).toBeNull()
      expect(forwarded.headers.get("x-middleware-request-x-allura-group-id")).toBeNull()

      const wrongMethod = await middleware(new NextRequest(new URL(path, "http://localhost:3100")))
      expect(wrongMethod.status).toBe(401)
    })

    it("does not extend plugin-token authority to neighboring routes", async () => {
      process.env.ALLURA_DEV_AUTH_ENABLED = "false"
      clearAuthConfig()

      const response = await middleware(new NextRequest(
        new URL("/api/plugins/bumblebee/runs/neighbor", "http://localhost:3100"),
        { method: "POST", headers: { authorization: "Bearer bmb_runner_abcdefgh_body" } },
      ))

      expect(response.status).toBe(401)
    })

    it.each([
      "/api/tokens",
      "/api/members",
      "/api/workspaces",
      "/api/agents",
      "/api/projects",
      "/api/teams",
      "/api/settings",
      "/api/dreams",
      "/api/scheduled-tasks",
      "/api/audit/events",
      "/api/mcp-catalog/import",
    ])("enforces auth on manifest-declared route %s (AC-2)", async (path) => {
      process.env.ALLURA_DEV_AUTH_ENABLED = "false"
      clearAuthConfig()

      const request = new NextRequest(new URL(path, "http://localhost:3100"))
      const response = await middleware(request)

      expect(response.status).toBe(401)
    })

    it.each(["/api/brain/memories", "/api/brain/search"])(
      "requires an authenticated principal on %s (AC-4)",
      async (path) => {
        process.env.ALLURA_DEV_AUTH_ENABLED = "false"
        clearAuthConfig()

        const request = new NextRequest(new URL(path, "http://localhost:3100"))
        const response = await middleware(request)

        expect(response.status).toBe(401)
      }
    )

    it("keeps /api/brain/health public with a recorded rationale (AC-4)", async () => {
      const entry = PUBLIC_ROUTE_MANIFEST.find((e) => e.pattern === "/api/brain/health")
      expect(entry).toBeDefined()
      expect(entry?.rationale.length).toBeGreaterThan(20)

      process.env.ALLURA_DEV_AUTH_ENABLED = "false"
      clearAuthConfig()

      const request = new NextRequest(new URL("/api/brain/health", "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.status).toBe(200)
    })

    it("keeps the internal trace sink and liveness probes public", async () => {
      process.env.ALLURA_DEV_AUTH_ENABLED = "false"
      clearAuthConfig()

      for (const path of ["/api/trace", "/api/live", "/api/ready", "/api/mcp", "/mcp"]) {
        const request = new NextRequest(new URL(path, "http://localhost:3100"))
        const response = await middleware(request)
        expect(response.status).toBe(200)
      }
    })

    it.each([
      ["/auth/v2/login", "/auth/:path*"],
      ["/auth/v1/register", "/auth/:path*"],
      ["/api/audit/events", "/api/audit/:path*"],
      ["/api/audit", "/api/audit/:path*"],
      ["/admin/settings/roles", "/admin/:path*"],
      ["/api/mcp-catalog/import", "/api/mcp-catalog/:path*"],
    ])("matches %s against %s (:path* regression)", (pathname, pattern) => {
      // The wildcard branch used to require a double slash, so every ":path*"
      // entry in both manifests was dead. With fail-closed resolution that
      // would have gated the login page itself.
      expect(matchesPattern(pathname, pattern)).toBe(true)
    })

    it("keeps exact manifest patterns exact; only :path* patterns include descendants", () => {
      expect(matchesPattern("/api/brain/memories", "/api/brain/memories")).toBe(true)
      expect(matchesPattern("/api/brain/memories/export", "/api/brain/memories")).toBe(false)
      expect(matchesPattern("/api/brain/memories/export", "/api/brain/memories/:path*")).toBe(true)
      expect(resolveRouteAuthority("/api/brain/memories/export").kind).toBe("undeclared")
    })

    it("matches ordinary dynamic segments before the memory viewer wildcard", () => {
      expect(matchesPattern("/api/memory/abc/restore", "/api/memory/:id/restore")).toBe(true)
      expect(matchesPattern("/api/memory/abc/restore", "/api/memory/:id")).toBe(false)
      expect(matchesPattern("/api/memory/a/b/restore", "/api/memory/:id/restore")).toBe(false)
      expect(resolveRouteAuthority("/api/memory/abc/restore")).toMatchObject({
        kind: "declared",
        requiredRole: "admin",
        scopeName: "memory:restore",
      })
      expect(resolveRouteAuthority("/api/memory/user/abc")).toMatchObject({
        kind: "declared",
        requiredRole: "admin",
        scopeName: "memory:user:delete",
      })
    })

    it("keeps the unreviewed project detail route admin pending Story 24.11b", () => {
      expect(resolveRouteAuthority("/api/projects/abc")).toMatchObject({
        kind: "declared",
        requiredRole: "admin",
        scopeName: "pending-review:projects:id",
      })
    })

    it("keeps the login surface public so denial redirects can terminate", async () => {
      process.env.ALLURA_DEV_AUTH_ENABLED = "false"
      clearAuthConfig()

      const request = new NextRequest(new URL("/auth/v2/login", "http://localhost:3100"))
      const response = await middleware(request)
      expect(response.status).toBe(200)
      expect(resolveRouteAuthority("/auth/v2/login").kind).toBe("public")
    })

    it("records a rationale for every public route entry", () => {
      for (const entry of PUBLIC_ROUTE_MANIFEST) {
        expect(entry.rationale.trim().length).toBeGreaterThan(0)
      }
    })
  })

  // ── Production keyless branch fails closed too (AC-1 / AC-2) ───────────────

  describe("production keyless branch", () => {
    beforeEach(() => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV = "production"
      process.env.ALLURA_DEV_AUTH_ENABLED = "true"
      clearAuthConfig()
    })

    afterEach(() => {
      ;(process.env as Record<string, string | undefined>).NODE_ENV = "test"
      process.env.ALLURA_DEV_AUTH_ENABLED = "true"
      clearAuthConfig()
    })

    it.each([
      "/api/no-such-route-declared-anywhere",
      "/api/handoffs",
      "/api/tokens",
      "/api/brain/memories",
      "/api/brain/search",
    ])("denies %s with 401 when no provider can establish a principal", async (path) => {
      const request = new NextRequest(new URL(path, "http://localhost:3100"))
      const response = await middleware(request)

      expect(response.status).toBe(401)
      expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBeNull()
    })

    it("denies instead of falling back to the dev-admin principal in production", async () => {
      const request = new NextRequest(new URL("/api/curator/proposals", "http://localhost:3100"))
      const response = await middleware(request)

      expect(response.status).toBe(401)
      expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBeNull()
    })

    it("still serves declared public routes", async () => {
      for (const path of ["/api/health", "/api/brain/health", "/api/trace"]) {
        const request = new NextRequest(new URL(path, "http://localhost:3100"))
        const response = await middleware(request)
        expect(response.status).toBe(200)
      }
    })
  })
})
