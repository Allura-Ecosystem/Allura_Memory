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
      document("focus", "Focused note", "[[allowed]] [[hidden]] [[allowed]] [[focus]] [[allowed|alias]] [[ spaced ]]"),
      document("allowed", "Allowed target", "SYNTHETIC TEST DATA"),
      document("spaced", "Noncanonical target", "SYNTHETIC TEST DATA"),
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

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["trimmed", " focus"],
    ["overlong", "x".repeat(201)],
    ["control", "focus\nforged"],
    ["alias", "focus|Focused note"],
    ["markup", "[[focus]]"],
  ])("rejects %s focus IDs before reading", async (_label, focusId) => {
    await expect(readSyntheticDocumentLinks(scope, focusId)).rejects.toThrow(/focus refused/)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it("re-reads every invocation so focus, links, and backlinks disappear after revocation", async () => {
    const current = [
      document("focus", "Focused note", "[[allowed]]"),
      document("allowed", "Allowed target", "SYNTHETIC TEST DATA"),
      document("backlink", "Authorized backlink", "See [[focus]]"),
    ]
    mocks.read
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce([current[0]])
      .mockResolvedValueOnce([])

    await expect(readSyntheticDocumentLinks(scope, "focus")).resolves.toMatchObject({
      links: [{ documentId: "allowed", title: "Allowed target" }],
      backlinks: [{ documentId: "backlink", title: "Authorized backlink" }],
    })
    await expect(readSyntheticDocumentLinks(scope, "focus")).resolves.toEqual({
      documentId: "focus", title: "Focused note", links: [], backlinks: [],
    })
    await expect(readSyntheticDocumentLinks(scope, "focus")).resolves.toBeNull()
    expect(mocks.read).toHaveBeenCalledTimes(3)
  })

  it("returns only minimal endpoint metadata", async () => {
    mocks.read.mockResolvedValue([
      document("focus", "Focused note", "SECRET FOCUS BODY [[allowed]]"),
      document("allowed", "Allowed target", "SECRET TARGET BODY"),
    ])
    const serialized = JSON.stringify(await readSyntheticDocumentLinks(scope, "focus"))
    expect(serialized).toBe(JSON.stringify({
      documentId: "focus", title: "Focused note",
      links: [{ documentId: "allowed", title: "Allowed target" }], backlinks: [],
    }))
    expect(serialized).not.toContain("SECRET")
    expect(serialized).not.toContain(scope.tenantId)
    expect(serialized).not.toContain(scope.workspaceId)
    expect(serialized).not.toContain(scope.principalId)
  })
})
