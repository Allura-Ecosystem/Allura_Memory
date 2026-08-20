/**
 * Proxy middleware tests.
 *
 * The request proxy now owns auth/RBAC header forwarding. Legacy request
 * tracing lives in MCP/controlPlane wrappers and is not emitted from `src/proxy.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import proxy, { config } from "../proxy"
import { clearAuthConfig } from "@/lib/auth/config"

function createMockRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: new Headers(headers),
    method: "GET",
  })
}

describe("ProxyMiddleware", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("ALLURA_DEV_AUTH_ENABLED", "true")
    vi.stubEnv("ALLURA_DEV_AUTH_ROLE", "admin")
    vi.stubEnv("ALLURA_DEV_AUTH_GROUP_ID", "allura-system")
    vi.stubEnv("ALLURA_DEV_AUTH_USER_ID", "dev-user-allura")
    vi.stubEnv("ALLURA_DEV_AUTH_EMAIL", "dev@allura.local")
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", undefined)
    vi.stubEnv("CLERK_SECRET_KEY", undefined)
    clearAuthConfig()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    clearAuthConfig()
  })

  it("forwards dev auth context on protected memory routes", async () => {
    const request = createMockRequest("/api/memory")

    const response = await proxy(request)
    const forwardedHeaders = response.headers.get("x-middleware-request-x-allura-group-id")

    expect(response.status).toBe(200)
    expect(forwardedHeaders).toBe("allura-system")
    expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBe("dev-user-allura")
    expect(response.headers.get("x-middleware-request-x-allura-role")).toBe("admin")
  })

  it("removes inbound auth headers on public routes", async () => {
    const request = createMockRequest("/api/health/live", {
      "x-allura-user-id": "spoofed-user",
      "x-allura-role": "admin",
      "x-allura-group-id": "allura-system",
    })

    const response = await proxy(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("x-middleware-request-x-allura-user-id")).toBeNull()
    expect(response.headers.get("x-middleware-request-x-allura-role")).toBeNull()
    expect(response.headers.get("x-middleware-request-x-allura-group-id")).toBeNull()
  })

  it("returns 403 when the dev user lacks the required role", async () => {
    vi.stubEnv("ALLURA_DEV_AUTH_ROLE", "viewer")
    clearAuthConfig()

    const request = createMockRequest("/api/curator/approve")

    const response = await proxy(request)
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.required).toBe("curator")
    expect(body.actual).toBe("viewer")
  })

  it("returns 401 on protected API routes when dev auth is disabled", async () => {
    vi.stubEnv("ALLURA_DEV_AUTH_ENABLED", "false")
    clearAuthConfig()

    const request = createMockRequest("/api/memory")

    const response = await proxy(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe("Authentication required")
  })

  it("has matcher coverage for app pages plus API routes", () => {
    expect(config.matcher).toEqual([
      "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
      "/(api|trpc)(.*)",
    ])
  })
})
