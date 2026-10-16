import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Dashboard principal derivation — provider authority enforcement tests.
 *
 * These tests exercise the REAL `getDashboardPrincipal()` boundary — the sole
 * server-owned principal derivation seam for protected dashboard reads. The
 * Cloudflare Access and DevAuth seams are mocked; the principal derivation
 * code remains real. They prove fail-closed behavior when no provider can
 * establish a principal, that raw x-allura-* headers never create authority,
 * and that nonproduction DevAuth remains the only fallback.
 *
 * The retired provider was fully removed from the active runtime:
 * production authority is Cloudflare Access only, and production with CF
 * Access disabled must yield no principal — never a DevAuth fallback.
 */

const mocks = vi.hoisted(() => ({
  cloudflareAccessUser: vi.fn(),
  isCloudflareAccessEnabled: vi.fn(),
  isDevAuthActive: vi.fn(),
  getDevUserSync: vi.fn(),
  headers: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ headers: mocks.headers }))
vi.mock("@/lib/auth/cloudflare-access", async importOriginal => ({ ...(await importOriginal<object>()), isCloudflareAccessEnabled: mocks.isCloudflareAccessEnabled, cloudflareAccessUser: mocks.cloudflareAccessUser }))
vi.mock("@/lib/auth/config", async importOriginal => ({ ...(await importOriginal<object>()), isDevAuthActive: mocks.isDevAuthActive }))
vi.mock("@/lib/auth/dev-auth", async importOriginal => ({ ...(await importOriginal<object>()), getDevUserSync: mocks.getDevUserSync }))

import { getDashboardPrincipal } from "../dashboard-principal"

const CF_USER = {
  id: "founder-user-example-com", email: "user@example.com", name: "user",
  role: "admin" as const, groupId: "allura-test-tenant",
  workspaceId: "workspace-a", sessionId: "cf-access:founder-user-example-com",
}

const DEV_USER = {
  id: "dev-user-allura", email: "dev@allura.local", name: "Dev User",
  role: "admin" as const, groupId: "allura-system",
  workspaceId: "workspace-allura", sessionId: "dev:dev-user-allura",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  mocks.isCloudflareAccessEnabled.mockReturnValue(false)
  mocks.isDevAuthActive.mockReturnValue(true)
  mocks.getDevUserSync.mockReturnValue(null)
  mocks.cloudflareAccessUser.mockReturnValue(null)
  mocks.headers.mockResolvedValue(new Headers())
})

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("getDashboardPrincipal — Cloudflare Access production authority", () => {
  it("derives the principal from the CF Access identity when enabled", async () => {
    mocks.isCloudflareAccessEnabled.mockReturnValue(true)
    mocks.cloudflareAccessUser.mockReturnValue(CF_USER)
    await expect(getDashboardPrincipal()).resolves.toEqual(CF_USER)
  })

  it("fails closed when CF Access is enabled but the identity is not recognized", async () => {
    mocks.isCloudflareAccessEnabled.mockReturnValue(true)
    mocks.cloudflareAccessUser.mockReturnValue(null)
    await expect(getDashboardPrincipal()).resolves.toBeNull()
    expect(mocks.getDevUserSync).not.toHaveBeenCalled()
  })
})

describe("getDashboardPrincipal — production fail-closed without a provider", () => {
  it("yields no principal and never consults DevAuth in production", async () => {
    mocks.isDevAuthActive.mockReturnValue(false)
    await expect(getDashboardPrincipal()).resolves.toBeNull()
    expect(mocks.getDevUserSync).not.toHaveBeenCalled()
  })
})

describe("getDashboardPrincipal preserves nonproduction DevAuth", () => {
  it("returns the DevAuth principal when CF Access is disabled", async () => {
    mocks.getDevUserSync.mockReturnValue(DEV_USER)
    await expect(getDashboardPrincipal()).resolves.toMatchObject({ sessionId: "dev:dev-user-allura" })
  })

  it("fails closed when DevAuth yields nothing", async () => {
    mocks.getDevUserSync.mockReturnValue(null)
    await expect(getDashboardPrincipal()).resolves.toBeNull()
  })
})