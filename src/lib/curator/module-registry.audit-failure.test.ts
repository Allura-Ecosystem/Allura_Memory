import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthUser, withWorkspaceTransaction, transactionClient } = vi.hoisted(() => {
  const transactionClient = { query: vi.fn().mockRejectedValue(new Error("audit unavailable")) }
  return {
    getAuthUser: vi.fn(),
    withWorkspaceTransaction: vi.fn(async (_scope, callback) => callback(transactionClient)),
    transactionClient,
  }
})

const { createHash } = vi.hoisted(() => {
  let call = 0
  return {
    createHash: vi.fn(() => ({
      update: () => ({ digest: () => `manifest-hash-${++call}` }),
    })),
  }
})

vi.mock("server-only", () => ({}))
vi.mock("node:crypto", () => ({ createHash }))
vi.mock("@/lib/auth/api-auth", () => ({ getAuthUser }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction }))

import { issueCuratorModules } from "./module-registry"

const user = {
  id: "curator-1", email: "curator@example.test", role: "curator" as const,
  groupId: "allura-acme", workspaceId: "workspace-a", sessionId: "session-a",
}

beforeEach(() => {
  getAuthUser.mockReturnValue(user)
  vi.clearAllMocks()
})

describe("Story 25.3b audit persistence failures", () => {
  it("returns an explicit audit-unavailable error when manifest-invalid persistence fails", async () => {
    await expect(issueCuratorModules({ headers: new Headers() } as never)).resolves.toMatchObject({
      state: "error", modules: [], message: "Curator workflow access is unavailable because audit recording failed.",
    })
    expect(transactionClient.query).toHaveBeenCalledOnce()
  })
})
