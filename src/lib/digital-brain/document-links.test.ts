import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock("./read-service", () => ({ readAuthorizedDocuments: mocks.read }))

import { readSyntheticDocumentLinks } from "./document-links"
import type { AuthorizedDocument } from "./read-service"

const scope = { tenantId: "allura-epic30-local", workspaceId: "epic30-local-workspace", principalId: "owner-user" }
const base: AuthorizedDocument = {
  id: "focus", groupId: scope.tenantId, workspaceId: scope.workspaceId,
  ownerId: scope.principalId, departmentId: null, visibility: "private",
  title: "Focused note", content: "", updatedAt: new Date("2026-09-17T00:00:00Z"),
}
const document = (id: string, title: string, content: string): AuthorizedDocument =>
  ({ ...base, id, title, content })

afterEach(() => vi.clearAllMocks())

describe("Epic 30 synthetic focused text links", () => {
  it("returns only endpoints present in the receipt-gated authorized reader", async () => {
    mocks.read.mockResolvedValue([
      document("focus", "Focused note", "[[allowed]] [[hidden]] [[allowed]] [[focus]] [[allowed|alias]]"),
      document("allowed", "Allowed target", "SYNTHETIC TEST DATA"),
      document("backlink", "Authorized backlink", "See [[focus]] and [[hidden]]"),
    ])
    expect(await readSyntheticDocumentLinks(scope, "focus")).toEqual({
      documentId: "focus", title: "Focused note",
      links: [{ documentId: "allowed", title: "Allowed target" }],
      backlinks: [{ documentId: "backlink", title: "Authorized backlink" }],
    })
    expect(mocks.read).toHaveBeenCalledWith(scope)
  })

  it("does not distinguish missing from unauthorized focus or expose hidden backlinks", async () => {
    mocks.read.mockResolvedValue([document("visible", "Visible", "[[hidden]]")])
    expect(await readSyntheticDocumentLinks(scope, "hidden")).toBeNull()
    expect(await readSyntheticDocumentLinks(scope, "missing")).toBeNull()
  })

  it("rejects malformed focus before reading and fails closed on reader receipt outage", async () => {
    await expect(readSyntheticDocumentLinks(scope, "\n")).rejects.toThrow(/focus refused/)
    expect(mocks.read).not.toHaveBeenCalled()
    mocks.read.mockRejectedValue(new Error("receipt sink unavailable"))
    await expect(readSyntheticDocumentLinks(scope, "focus")).rejects.toThrow("receipt sink unavailable")
  })
})
