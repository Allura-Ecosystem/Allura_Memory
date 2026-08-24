/**
 * withPermission — PermissionAction enforcement (Story 24.11a AC-7)
 *
 * withPermission used to accept a PermissionAction and immediately discard it
 * (`void action`). These tests pin the argument to observable behaviour: the
 * effective requirement is the stricter of requiredRole and the action floor,
 * and an unknown action fails closed.
 */

import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it } from "vitest"

// No dev-auth principal: identity comes from explicit headers only.
process.env.ALLURA_DEV_AUTH_ENABLED = "false"
// @ts-expect-error — NODE_ENV is read-only in Next.js types but must be set for tests
process.env.NODE_ENV = "test"
delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
delete process.env.CLERK_SECRET_KEY

import { minimumRoleForAction, withPermission } from "@/lib/auth/api-auth"
import { clearAuthConfig } from "@/lib/auth/config"
import type { AlluraRole } from "@/lib/auth/types"

function requestAs(role: AlluraRole | null, groupId = "allura-testtenant"): NextRequest {
  const headers: Record<string, string> = {}
  if (role) {
    headers["x-allura-user-id"] = "user-under-test"
    headers["x-allura-role"] = role
    headers["x-allura-group-id"] = groupId
  }
  return new NextRequest(new URL("/api/anything", "http://localhost:4100"), { headers })
}

describe("minimumRoleForAction", () => {
  it.each([
    ["memory:read", "viewer"],
    ["audit:read", "viewer"],
    ["policy:evaluate", "viewer"],
    ["memory:write", "curator"],
    ["approval:decide", "curator"],
    ["memory:delete", "admin"],
    ["role:assign", "admin"],
    ["policy:manage", "admin"],
  ])("maps %s to %s", (action, expected) => {
    expect(minimumRoleForAction(action)).toBe(expected)
  })

  it("fails closed to admin for an action it does not know", () => {
    expect(minimumRoleForAction("totally:invented:action")).toBe("admin")
  })
})

describe("withPermission enforces its PermissionAction argument", () => {
  beforeEach(() => {
    clearAuthConfig()
  })

  it("returns 401 when there is no principal", async () => {
    const result = await withPermission(requestAs(null), "memory:read", "viewer")
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it("allows a viewer to perform a viewer-floor action", async () => {
    const result = await withPermission(requestAs("viewer"), "memory:read", "viewer")
    expect(result).not.toBeInstanceOf(NextResponse)
    if (!(result instanceof NextResponse)) {
      expect(result.user.role).toBe("viewer")
      expect(result.groupId).toBe("allura-testtenant")
    }
  })

  it("rejects a viewer performing a destructive action even when requiredRole is viewer", async () => {
    // Before AC-7 this passed: `action` was discarded and only requiredRole counted.
    const result = await withPermission(requestAs("viewer"), "memory:delete", "viewer")
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)

    const body = await (result as NextResponse).json()
    expect(body.required).toBe("admin")
    expect(body.actual).toBe("viewer")
  })

  it("rejects a curator performing an admin-floor action", async () => {
    const result = await withPermission(requestAs("curator"), "memory:delete", "viewer")
    expect((result as NextResponse).status).toBe(403)
  })

  it("allows an admin to perform an admin-floor action", async () => {
    const result = await withPermission(requestAs("admin"), "memory:delete", "viewer")
    expect(result).not.toBeInstanceOf(NextResponse)
  })

  it("still honours a requiredRole stricter than the action floor", async () => {
    const result = await withPermission(requestAs("curator"), "memory:read", "admin")
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)

    const body = await (result as NextResponse).json()
    expect(body.required).toBe("admin")
  })

  it("fails closed on an unknown action", async () => {
    const result = await withPermission(requestAs("curator"), "some:unmapped:action", "viewer")
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })

  it("leaves every existing call site unchanged in outcome", async () => {
    // The nine in-repo call sites, replayed with a principal that satisfies
    // their declared requiredRole. None should regress to 403.
    const cases: Array<[AlluraRole, string, AlluraRole]> = [
      ["viewer", "memory:read", "viewer"],
      ["admin", "memory:delete", "admin"],
      ["admin", "memory:write", "admin"],
    ]
    for (const [actual, action, required] of cases) {
      const result = await withPermission(requestAs(actual), action, required)
      expect(result).not.toBeInstanceOf(NextResponse)
    }
  })
})
