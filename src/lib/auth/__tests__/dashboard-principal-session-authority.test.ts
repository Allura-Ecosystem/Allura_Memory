import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Story 30.5 — provider-delegated session authority (Clerk) enforcement tests.
 *
 * These tests exercise the REAL `getDashboardPrincipal()` boundary — the sole
 * server-owned principal derivation seam for protected dashboard reads. The
 * external Clerk SDK plus local auth-mode/DevAuth seams are mocked; the
 * principal derivation and provider-check code remain real. They prove
 * fail-closed behavior for revoked/expired/missing/mismatched sessions and
 * provider outage, with no DevAuth fallback while Clerk is enabled.
 *
 * Contract receipts (Context7 + installed SDK types, verified 2026-09-28):
 *  - `auth()` returns `SignedInAuthObject` with `sessionId: string` and
 *    `sessionStatus: SessionStatusClaim | null` where
 *    `SessionStatusClaim = 'active' | 'pending'`
 *    (@clerk/shared/dist/types/index.d.ts:4445,10123).
 *  - Backend `SessionStatus = 'abandoned' | 'active' | 'ended' | 'expired' |
 *    'removed' | 'replaced' | 'revoked' | 'pending'` (:4009).
 *  - `clerkClient().sessions.getSession(sessionId)` returns a `Session` with
 *    `.status: string` and `.userId` (@clerk/backend Session.d.ts:92).
 *  - Official Clerk docs: JWT claims may be up to 60 seconds stale — no
 *    immediate-revocation guarantee is invented here.
 *  - `sts` is OPTIONAL on the JWT payload
 *    (@clerk/shared/dist/types/index.d.ts:4347 `sts?: SessionStatusClaim`;
 *    jwtPayloadParser `const sessionStatus = claims.sts ?? null`), so a valid
 *    active session can present `sessionStatus: null`. Denying on the absent
 *    claim would lock out every such user while adding nothing: the
 *    authoritative Backend API lookup already proves active status, and
 *    `pending` never arrives here because Clerk's `treatPendingAsSignedOut`
 *    default returns a signed-out object with no `userId`.
 *  - A provider that cannot be consulted is an OUTAGE, not a denial. It raises
 *    `PrincipalProviderUnavailableError` so callers render "degraded" rather
 *    than "forbidden"; reporting an outage as an access denial is untruthful
 *    and, at the dashboard guard, produces a login redirect loop.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  getSession: vi.fn(),
  isClerkEnabled: vi.fn(),
  getDevUserSync: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@clerk/nextjs/server", async importOriginal => ({ ...(await importOriginal<object>()), auth: mocks.auth, clerkClient: mocks.clerkClient }))
vi.mock("@/lib/auth/config", async importOriginal => ({ ...(await importOriginal<object>()), isClerkEnabled: mocks.isClerkEnabled }))
vi.mock("@/lib/auth/dev-auth", async importOriginal => ({ ...(await importOriginal<object>()), getDevUserSync: mocks.getDevUserSync }))

import { getDashboardPrincipal, PrincipalProviderUnavailableError } from "../dashboard-principal"

const CLAIM = { allura: { role: "curator", groupId: "allura-test-tenant", workspaceId: "workspace-a" } }
const SESSION_ID = "sess_clerk_active_001"
const USER_ID = "user_clerk_001"
const AUTH_USER = {
  id: USER_ID, email: "", role: "curator" as const,
  groupId: "allura-test-tenant", workspaceId: "workspace-a", sessionId: SESSION_ID,
}

function clerkAuth(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    sessionClaims: CLAIM,
    sessionStatus: "active",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  mocks.isClerkEnabled.mockReturnValue(true)
  mocks.auth.mockResolvedValue(clerkAuth())
  mocks.getSession.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, status: "active" })
  mocks.clerkClient.mockResolvedValue({ sessions: { getSession: mocks.getSession } })
  mocks.getDevUserSync.mockReturnValue(null)
})

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("getDashboardPrincipal enforces Clerk session authority (fail closed)", () => {
  it("derives the principal for an active session", async () => {
    await expect(getDashboardPrincipal()).resolves.toEqual(AUTH_USER)
  })

  it("denies a revoked backend session even when the JWT status is still active", async () => {
    mocks.getSession.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, status: "revoked" })
    await expect(getDashboardPrincipal()).resolves.toBeNull()
    expect(mocks.getSession).toHaveBeenCalledWith(SESSION_ID)
  })

  it("denies a backend session owned by a different user", async () => {
    mocks.getSession.mockResolvedValue({ id: SESSION_ID, userId: "user_other", status: "active" })
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })

  it("denies a backend session mismatch", async () => {
    mocks.getSession.mockResolvedValue({ id: "sess_other", userId: USER_ID, status: "active" })
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })

  it("raises an outage, not a denial, when the backend session lookup is unavailable", async () => {
    mocks.getSession.mockRejectedValue(new Error("Clerk Backend API unavailable"))
    await expect(getDashboardPrincipal()).rejects.toBeInstanceOf(PrincipalProviderUnavailableError)
    expect(mocks.getDevUserSync).not.toHaveBeenCalled()
  })

  it("raises an outage when the backend rate-limits the session lookup", async () => {
    mocks.getSession.mockRejectedValue(Object.assign(new Error("Too Many Requests"), { status: 429 }))
    await expect(getDashboardPrincipal()).rejects.toBeInstanceOf(PrincipalProviderUnavailableError)
    expect(mocks.getDevUserSync).not.toHaveBeenCalled()
  })

  it("raises an outage when Clerk returns a client without a session lookup", async () => {
    mocks.clerkClient.mockResolvedValue({ sessions: {} })
    await expect(getDashboardPrincipal()).rejects.toBeInstanceOf(PrincipalProviderUnavailableError)
  })

  it("fails closed on an unexpected JWT session status", async () => {
    mocks.auth.mockResolvedValue(clerkAuth({ sessionStatus: "revoked" }))
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })

  it("defers to the authoritative lookup when the sts claim is absent (null)", async () => {
    mocks.auth.mockResolvedValue(clerkAuth({ sessionStatus: null }))
    await expect(getDashboardPrincipal()).resolves.toEqual(AUTH_USER)
    expect(mocks.getSession).toHaveBeenCalledWith(SESSION_ID)
  })

  it("defers to the authoritative lookup when the sts claim is absent (undefined)", async () => {
    mocks.auth.mockResolvedValue(clerkAuth({ sessionStatus: undefined }))
    await expect(getDashboardPrincipal()).resolves.toEqual(AUTH_USER)
    expect(mocks.getSession).toHaveBeenCalledWith(SESSION_ID)
  })

  it("still denies an absent sts claim when the backend session is revoked", async () => {
    mocks.auth.mockResolvedValue(clerkAuth({ sessionStatus: null }))
    mocks.getSession.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, status: "revoked" })
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })

  it("fails closed when sessionStatus is pending", async () => {
    mocks.auth.mockResolvedValue(clerkAuth({ sessionStatus: "pending" }))
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })

  it("fails closed when the session id is absent", async () => {
    mocks.auth.mockResolvedValue(clerkAuth({ sessionId: null }))
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })

  it("fails closed when the user id is absent", async () => {
    mocks.auth.mockResolvedValue(clerkAuth({ userId: null }))
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })

  it("fails closed when the Allura authority claim is absent", async () => {
    mocks.auth.mockResolvedValue(clerkAuth({ sessionClaims: {} }))
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })

  it("raises an outage, not a denial, when the Clerk provider throws", async () => {
    mocks.auth.mockRejectedValue(new Error("Clerk unavailable"))
    await expect(getDashboardPrincipal()).rejects.toBeInstanceOf(PrincipalProviderUnavailableError)
    expect(mocks.getDevUserSync).not.toHaveBeenCalled()
  })

  it("keeps an outage distinguishable from a denial so callers can report degraded", async () => {
    mocks.getSession.mockResolvedValue({ id: SESSION_ID, userId: USER_ID, status: "revoked" })
    const denial = await getDashboardPrincipal()
    expect(denial).toBeNull()
    mocks.auth.mockRejectedValue(new Error("Clerk unavailable"))
    await expect(getDashboardPrincipal()).rejects.toBeInstanceOf(PrincipalProviderUnavailableError)
  })

  it("fails closed when auth() resolves to a signed-out object", async () => {
    mocks.auth.mockResolvedValue({ userId: null, sessionId: null, sessionClaims: {}, sessionStatus: null })
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })
})

describe("getDashboardPrincipal preserves nonproduction DevAuth", () => {
  it("returns the DevAuth principal only when Clerk is disabled", async () => {
    mocks.isClerkEnabled.mockReturnValue(false)
    mocks.getDevUserSync.mockReturnValue({ ...AUTH_USER, sessionId: "dev:owner-user" })
    await expect(getDashboardPrincipal()).resolves.toMatchObject({ sessionId: "dev:owner-user" })
    expect(mocks.auth).not.toHaveBeenCalled()
  })

  it("never consults DevAuth while Clerk is enabled", async () => {
    await getDashboardPrincipal()
    expect(mocks.getDevUserSync).not.toHaveBeenCalled()
  })

  it("fails closed when Clerk is disabled and DevAuth yields nothing", async () => {
    mocks.isClerkEnabled.mockReturnValue(false)
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })
})