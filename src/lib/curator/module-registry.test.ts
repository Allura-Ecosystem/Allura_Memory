import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthUser, withWorkspaceTransaction, getBumblebeeSummaryInTransaction, transactionClient } = vi.hoisted(() => {
  const transactionClient = { query: vi.fn().mockResolvedValue({ rows: [] }) }
  return {
    getAuthUser: vi.fn(),
    withWorkspaceTransaction: vi.fn(async (_scope, callback) => callback(transactionClient)),
    getBumblebeeSummaryInTransaction: vi.fn().mockResolvedValue({ sources: 1, unpinnedActions: 0, openExposures: 0, incidents: 0, receipts: 0 }),
    transactionClient,
  }
})

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/api-auth", () => ({ getAuthUser }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction }))
vi.mock("@/lib/curator/operator-read-service", () => ({ getBumblebeeSummaryInTransaction }))

import {
  CURATOR_MODULE_CONTRACT_VERSION,
  issueCuratorModules,
  missingCapabilitiesForRole,
  validateModuleManifests,
} from "./module-registry"
import { BUMBLEBEE_ENABLED_ENV_VAR, BUMBLEBEE_MODULE } from "../bumblebee/module"

const user = { id: "curator-1", email: "curator@example.test", role: "curator" as const, groupId: "allura-acme", workspaceId: "workspace-a", sessionId: "session-a" }
const request = { headers: new Headers() }

function manifest(overrides: Record<string, unknown> = {}) {
  return { ...BUMBLEBEE_MODULE, ...overrides }
}

beforeEach(() => {
  getAuthUser.mockReturnValue(user)
})

afterEach(() => {
  delete process.env[BUMBLEBEE_ENABLED_ENV_VAR]
  vi.clearAllMocks()
})

describe("Story 25.3b server-issued curator module registry", () => {
  it("rejects malformed, unknown, duplicate, incompatible, and untrusted manifests atomically", () => {
    for (const manifests of [
      [manifest({ id: "unknown" })],
      [manifest(), manifest()],
      [manifest({ contractVersion: "999.0" })],
      [manifest({ trust: "remote" })],
      [manifest({ hostBindings: ["other-host"] })],
      [manifest({ requiredCapabilities: ["write:everything"] })],
    ]) {
      expect(() => validateModuleManifests(manifests as never)).toThrow()
    }
  })

  it("rejects a forged AuthUser argument and resolves identity only from the server request", async () => {
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"
    const forged = { ...user, id: "attacker", groupId: "allura-attacker", workspaceId: "workspace-forged", role: "admin" }

    const issued = await issueCuratorModules(forged as never)

    expect(issued.state).toBe("complete")
    expect(withWorkspaceTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "allura-acme", workspaceId: "workspace-a", principalId: "curator-1" }),
      expect.any(Function),
    )
  })

  it("fails closed when the request has no server-authenticated principal", async () => {
    getAuthUser.mockReturnValue(null)
    await expect(issueCuratorModules(request as never)).resolves.toMatchObject({ state: "denied", modules: [] })
    expect(withWorkspaceTransaction).not.toHaveBeenCalled()
  })

  it("uses the canonical role authority rather than a module-local role map", async () => {
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"
    getAuthUser.mockReturnValue({ ...user, role: "viewer" })

    await expect(issueCuratorModules(request as never)).resolves.toMatchObject({ state: "denied", modules: [] })
    expect(getBumblebeeSummaryInTransaction).not.toHaveBeenCalled()
  })

  it("denies the module for the specific canonical read capabilities its role lacks", () => {
    expect(missingCapabilitiesForRole("viewer", BUMBLEBEE_MODULE.requiredCapabilities)).toEqual([
      "read:inventory",
      "read:exposures",
      "read:receipts",
    ])
    expect(missingCapabilitiesForRole("curator", BUMBLEBEE_MODULE.requiredCapabilities)).toEqual([])
  })

  it("records a completed scoped issuance snapshot atomically with the read", async () => {
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"
    const issued = await issueCuratorModules(request as never)

    expect(issued).toMatchObject({ state: "complete", modules: [{ id: "bumblebee", state: "available" }] })
    expect(getBumblebeeSummaryInTransaction).toHaveBeenCalledWith(transactionClient, expect.objectContaining({ workspaceId: "workspace-a" }))
    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining("group_id, workspace_id, event_type, agent_id, status, session_id, metadata"),
      expect.arrayContaining(["allura-acme", "workspace-a", "curator-1", "completed", "session-a"]),
    )
    expect(JSON.stringify(transactionClient.query.mock.calls.at(-1)?.[1])).toContain("contract_revision")
    expect(JSON.stringify(transactionClient.query.mock.calls.at(-1)?.[1])).toContain("capability_policy")
    expect(JSON.stringify(transactionClient.query.mock.calls.at(-1)?.[1])).toContain("rollback")
  })

  it("writes failed audit decisions for denied, disabled, and read-failure outcomes", async () => {
    getAuthUser.mockReturnValue({ ...user, role: "viewer" })
    await issueCuratorModules(request as never)
    expect(transactionClient.query.mock.calls.at(-1)?.[1]).toContain("failed")

    vi.clearAllMocks()
    getAuthUser.mockReturnValue(user)
    await issueCuratorModules(request as never)
    expect(transactionClient.query.mock.calls.at(-1)?.[1]).toContain("failed")

    vi.clearAllMocks()
    getAuthUser.mockReturnValue(user)
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"
    getBumblebeeSummaryInTransaction.mockRejectedValueOnce(new Error("read down"))
    await issueCuratorModules(request as never)
    expect(transactionClient.query.mock.calls.at(-1)?.[1]).toContain("failed")
  })

  it("returns an explicit audit-unavailable error when denied-outcome persistence fails", async () => {
    getAuthUser.mockReturnValue({ ...user, role: "viewer" })
    transactionClient.query.mockRejectedValueOnce(new Error("audit unavailable"))

    await expect(issueCuratorModules(request as never)).resolves.toMatchObject({
      state: "error", modules: [], message: "Curator workflow access is unavailable because audit recording failed.",
    })
  })

  it("returns an explicit audit-unavailable error when disabled-outcome persistence fails", async () => {
    transactionClient.query.mockRejectedValueOnce(new Error("audit unavailable"))

    await expect(issueCuratorModules(request as never)).resolves.toMatchObject({
      state: "error", modules: [], message: "Curator workflow access is unavailable because audit recording failed.",
    })
  })

  it("returns an explicit audit-unavailable error when read-failure persistence fails", async () => {
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"
    getBumblebeeSummaryInTransaction.mockRejectedValueOnce(new Error("read down"))
    transactionClient.query.mockRejectedValueOnce(new Error("audit unavailable"))

    await expect(issueCuratorModules(request as never)).resolves.toMatchObject({
      state: "error", modules: [], message: "Curator workflow access is unavailable because audit recording failed.",
    })
  })

  it("keeps the registry snapshot immutable when a caller attempts runtime descriptor mutation", () => {
    expect(Object.isFrozen(BUMBLEBEE_MODULE)).toBe(true)
    expect(Object.isFrozen(BUMBLEBEE_MODULE.requiredCapabilities)).toBe(true)
    expect(() => (BUMBLEBEE_MODULE.requiredCapabilities as string[]).push("write:everything")).toThrow()
    expect(() => validateModuleManifests([manifest({ title: "tampered" })] as never)).toThrow(/untrusted module manifest/)
  })

  it("pins the source-controlled contract version", () => {
    expect(BUMBLEBEE_MODULE.contractVersion).toBe(CURATOR_MODULE_CONTRACT_VERSION)
  })

  it("uses dashboard/curator as the only module host and never restores a direct Bumblebee route", async () => {
    const { existsSync } = await import("node:fs")
    expect(existsSync("src/app/dashboard/curator/page.tsx")).toBe(true)
    expect(existsSync("src/app/dashboard/bumblebee/page.tsx")).toBe(false)
  })

  it("keeps Bumblebee declarative and prevents module authority imports", async () => {
    const { readFile } = await import("node:fs/promises")
    const paths = ["src/lib/bumblebee/module.ts", "src/components/bumblebee/surfaces.tsx"]
    for (const path of paths) {
      const source = await readFile(path, "utf8")
      expect(source).not.toMatch(/from ["'][^"']*(?:db|auth|policy|mutation|connector|receipt)[^"']*["']/i)
    }
  })
})
