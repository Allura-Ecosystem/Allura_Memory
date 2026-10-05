/**
 * Audit Events Auth Guard Tests
 *
 * Verifies that GET /api/audit/events enforces authentication
 * and authorization via requireRole("viewer"), matching the
 * pattern used by /api/memory and /api/curator/proposals.
 */

import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Mock environment: dev auth enabled for test mode ─────────────────────────

process.env.ALLURA_DEV_AUTH_ENABLED = "true"
// @ts-expect-error — NODE_ENV is read-only in Next.js types but must be set for tests
process.env.NODE_ENV = "test"

// ── Mutable mock state — must be declared before vi.mock due to hoisting ──────

let mockAuthResult: {
  allowed: boolean
  reason?: string
  requiredRole: string
  actualRole: string
  user: {
    id: string
    email: string
    role: string
    groupId: string
  } | null
}

// ── Mock api-auth module ──────────────────────────────────────────────────────

vi.mock("@/lib/auth/api-auth", () => ({
  requireRole: vi.fn(() => mockAuthResult),
  unauthorizedResponse: vi.fn(() =>
    NextResponse.json({ error: "Authentication required", statusCode: 401 }, { status: 401 })
  ),
  forbiddenResponse: vi.fn((result: { requiredRole: string; actualRole: string; reason: string }) =>
    NextResponse.json(
      {
        error: "Insufficient permissions",
        statusCode: 403,
        required: result.requiredRole,
        actual: result.actualRole,
        message: result.reason,
      },
      { status: 403 }
    )
  ),
}))

// ── Mock the audit query so we don't need a real DB ───────────────────────────

vi.mock("@/lib/audit/query-builder", () => ({
  auditQuerySchema: {
    safeParse: vi.fn().mockReturnValue({
      success: true,
      data: {
        group_id: "allura-test",
        limit: 1000,
        offset: 0,
      },
    }),
  },
  queryAuditEvents: vi.fn().mockResolvedValue({
    events: [],
    total: 0,
    limit: 1000,
    offset: 0,
    has_more: false,
  }),
  streamAuditEvents: vi.fn(),
}))

// ── Import after env setup and mocks ──────────────────────────────────────────

import { GET } from "@/app/api/audit/events/route"
import { requireRole } from "@/lib/auth/api-auth"
// requireRole is mocked — the cast lets us access mock properties
const mockedRequireRole = requireRole as unknown as ReturnType<typeof vi.fn>

// ── Helper ────────────────────────────────────────────────────────────────────

function makeRequest(): NextRequest {
  const url = new URL("/api/audit/events?group_id=allura-test", "http://localhost:3100")
  return new NextRequest(url)
}

// ────────────────────────────────────────────────────────────────────────────────

describe("GET /api/audit/events — auth guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return 401 for unauthenticated requests", async () => {
    // requireRole returns no user → route calls unauthorizedResponse()
    mockAuthResult = {
      allowed: false,
      reason: "Authentication required",
      requiredRole: "viewer",
      actualRole: "viewer",
      user: null,
    }

    const response = await GET(makeRequest())

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.statusCode).toBe(401)
  })

  it("should allow requests with viewer role", async () => {
    // requireRole returns allowed viewer → passes guard, reaches query logic
    mockAuthResult = {
      allowed: true,
      reason: undefined,
      requiredRole: "viewer",
      actualRole: "viewer",
      user: {
        id: "user-viewer-001",
        email: "viewer@test.local",
        role: "viewer",
        groupId: "allura-test",
      },
    }

    const response = await GET(makeRequest())

    expect(response.status).not.toBe(401)
    expect(response.status).not.toBe(403)

    // The route should have called requireRole with "viewer"
    expect(mockedRequireRole).toHaveBeenCalledWith(expect.any(NextRequest), "viewer")
  })

  it("should return 403 for authenticated requests with insufficient role", async () => {
    // requireRole returns authenticated user but not allowed → forbiddenResponse()
    mockAuthResult = {
      allowed: false,
      reason: "Role 'viewer' does not have 'curator' permission. Required: curator or above.",
      requiredRole: "curator",
      actualRole: "viewer",
      user: {
        id: "user-viewer-001",
        email: "viewer@test.local",
        role: "viewer",
        groupId: "allura-test",
      },
    }

    const response = await GET(makeRequest())

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toBe("Insufficient permissions")
    expect(body.statusCode).toBe(403)
    expect(body.required).toBeDefined()
    expect(body.actual).toBeDefined()
  })
})
