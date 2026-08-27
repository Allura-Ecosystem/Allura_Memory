import { afterEach, describe, expect, it, vi } from "vitest"

const { withWorkspaceTransaction, getBumblebeeSummary } = vi.hoisted(() => ({
  withWorkspaceTransaction: vi.fn(async (_scope, callback) => callback({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
  getBumblebeeSummary: vi.fn().mockResolvedValue({ sources: 1, unpinnedActions: 0, openExposures: 0, incidents: 0, receipts: 0 }),
}))

vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction }))
vi.mock("@/lib/curator/operator-read-service", () => ({ getBumblebeeSummary }))

import {
  CURATOR_MODULE_CONTRACT_VERSION,
  issueCuratorModules,
  validateModuleManifests,
} from "./module-registry"
import { BUMBLEBEE_ENABLED_ENV_VAR, BUMBLEBEE_MODULE } from "../bumblebee/module"

const user = { id: "curator-1", email: "curator@example.test", role: "curator" as const, groupId: "allura-acme", workspaceId: "workspace-a", sessionId: "session-a" }

function manifest(overrides: Record<string, unknown> = {}) {
  return { ...BUMBLEBEE_MODULE, ...overrides }
}

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

  it("derives scope and capabilities from the authenticated principal and ignores forged caller authority", async () => {
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"
    const issued = await issueCuratorModules(user, { capabilities: ["admin:all"], workspaceId: "workspace-forged" } as never)

    expect(issued.state).toBe("complete")
    expect(issued.modules).toHaveLength(1)
    expect(withWorkspaceTransaction).toHaveBeenCalledWith(
      { tenantId: "allura-acme", workspaceId: "workspace-a", principalId: "curator-1" },
      expect.any(Function),
    )
    expect(issued.modules[0]).toMatchObject({ id: "bumblebee", summary: { sources: 1 } })
    expect(issued).not.toHaveProperty("principal")
    expect(issued).not.toHaveProperty("capabilities")
  })

  it("fails closed and emits a scoped denial when capability is missing", async () => {
    process.env[BUMBLEBEE_ENABLED_ENV_VAR] = "true"
    const viewer = { ...user, role: "viewer" as const }
    const issued = await issueCuratorModules(viewer)

    expect(issued).toMatchObject({ state: "denied", modules: [] })
    expect(getBumblebeeSummary).not.toHaveBeenCalled()
    expect(withWorkspaceTransaction).toHaveBeenCalled()
  })

  it("returns a truthful unavailable module when a server feature flag rolls it back", async () => {
    const issued = await issueCuratorModules(user)

    expect(issued).toMatchObject({ state: "complete" })
    expect(issued.modules).toEqual([{ id: "bumblebee", state: "unavailable", title: BUMBLEBEE_MODULE.title }])
    expect(getBumblebeeSummary).not.toHaveBeenCalled()
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
