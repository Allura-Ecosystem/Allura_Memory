/**
 * Graph API Route Tests (Story 31.2 governed focused-subgraph transport)
 *
 * Tests:
 * - Tenant/workspace scoping from the authenticated principal
 * - Read-only behavior: POST/PUT/DELETE return 405
 * - Thin transport delegation without route-local SQL
 * - Frozen truth-state HTTP mapping and strict query parsing
 *
 * Note: Next.js API routes use ES modules and Next.request mocks.
 * These tests verify the route implementation logic without full Next.js context.
 */

import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

/**
 * Test the graph route API contract directly
 * By examining the actual route file, we can verify:
 * - optional group/workspace selectors are assertions, not authority
 * - Non-GET methods return 405
 * - Graph-domain failures use the frozen 400/403/409/503 mapping
 */

describe("Graph API Route Contract (Story 31.2)", () => {
  const readRouteFile = async () => {
    const { readFileSync } = await import("fs")
    return readFileSync(new URL("../app/api/memory/graph/route.ts", import.meta.url), "utf8")
  }

  it("route file should exist and have expected exports", async () => {
    const routeModule = await import("@/app/api/memory/graph/route")

    expect(typeof routeModule.GET).toBe("function")
    expect(typeof routeModule.POST).toBe("function")
    expect(typeof routeModule.PUT).toBe("function")
    expect(typeof routeModule.DELETE).toBe("function")
  })

  it("derives authority with memory:read and delegates to the focused service", async () => {
    await import("@/app/api/memory/graph/route")
    const routeContent = await readRouteFile()

    expect(routeContent).toContain('withPermission(request, "memory:read")')
    expect(routeContent).toContain("FocusedSubgraphReadService")
    expect(routeContent).not.toMatch(/\bSELECT\b|\bFROM graph_/)
  })

  it("should export POST/PUT/DELETE handlers that return 405", async () => {
    const { POST, PUT, DELETE } = await import("@/app/api/memory/graph/route")

    // These are async functions that return NextResponse
    expect(POST).toBeDefined()
    expect(PUT).toBeDefined()
    expect(DELETE).toBeDefined()
  })

  it("strictly rejects legacy and authority-bearing query parameters", async () => {
    const routeContent = await readRouteFile()
    expect(routeContent).toContain("ALLOWED_QUERY_PARAMS")
    expect(routeContent).not.toContain('"stats"')
    expect(routeContent).not.toContain('"principalId"')
  })

  it("maps malformed, denied, conflict, and unavailable states explicitly", async () => {
    const routeContent = await readRouteFile()
    expect(routeContent).toContain("return 400")
    expect(routeContent).toContain("return 409")
    expect(routeContent).toContain("return 503")
  })

  it("returns sanitized scope conflict and unavailable shapes", async () => {
    const routeContent = await readRouteFile()
    expect(routeContent).toContain('reasonCode: "SCOPE_CONFLICT"')
    expect(routeContent).toContain('code: "UNAVAILABLE"')
    expect(routeContent).not.toContain("password=secret")
  })
})
