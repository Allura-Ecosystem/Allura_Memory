import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock("./read-service", () => ({ readAuthorizedDocuments: mocks.read }))

import { resolveSyntheticCitations } from "./document-citations"
import type { AuthorizedDocument } from "./read-service"

const scope = {
  tenantId: "allura-epic30-local",
  workspaceId: "epic30-local-workspace",
  principalId: "owner-user",
}

const document = (overrides: Partial<AuthorizedDocument> = {}): AuthorizedDocument => ({
  id: "owner-private",
  groupId: scope.tenantId,
  workspaceId: scope.workspaceId,
  ownerId: scope.principalId,
  departmentId: null,
  visibility: "private",
  title: "Owner private note",
  content: "SECRET BODY MUST NEVER BE RETURNED",
  updatedAt: new Date("2026-09-17T00:00:00Z"),
  ...overrides,
})

const authorizedDocuments = [
  document(),
  document({
    id: "operations-runbook",
    ownerId: "department-user",
    departmentId: "operations",
    visibility: "department",
    title: "Operations runbook",
    content: "SECRET DEPARTMENT BODY MUST NEVER BE RETURNED",
  }),
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.read.mockResolvedValue(authorizedDocuments)
})

afterEach(() => vi.clearAllMocks())

describe("Epic 30 synthetic citation authority", () => {
  it("resolves owner and authorized department IDs in deterministic input order", async () => {
    await expect(resolveSyntheticCitations(scope, ["operations-runbook", "owner-private"])).resolves.toEqual([
      { documentId: "operations-runbook", title: "Operations runbook" },
      { documentId: "owner-private", title: "Owner private note" },
    ])
    expect(mocks.read).toHaveBeenCalledOnce()
    expect(mocks.read).toHaveBeenCalledWith(scope)
  })

  it("omits missing and unauthorized IDs identically, including hidden private and department records", async () => {
    const requested = ["missing", "other-private", "other-department"]
    await expect(resolveSyntheticCitations(scope, requested)).resolves.toEqual([])
    expect(await resolveSyntheticCitations(scope, ["missing"])).toEqual(
      await resolveSyntheticCitations(scope, ["other-private"]),
    )
  })

  it("deduplicates IDs without changing first-seen order", async () => {
    await expect(resolveSyntheticCitations(scope, [
      "owner-private", "operations-runbook", "owner-private", "operations-runbook",
    ])).resolves.toEqual([
      { documentId: "owner-private", title: "Owner private note" },
      { documentId: "operations-runbook", title: "Operations runbook" },
    ])
  })

  it("returns an empty list without reading for empty input", async () => {
    await expect(resolveSyntheticCitations(scope, [])).resolves.toEqual([])
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["overlong", "x".repeat(201)],
    ["control", "owner-private\nforged"],
    ["alias", "owner-private|Owner private note"],
    ["markup alias", "[[owner-private]]"],
  ])("refuses %s IDs before reading", async (_label, citationId) => {
    await expect(resolveSyntheticCitations(scope, [citationId])).rejects.toThrow(/citation IDs refused/)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it("refuses an overlong batch before reading", async () => {
    await expect(resolveSyntheticCitations(scope, Array.from({ length: 201 }, (_, index) => `doc-${index}`)))
      .rejects.toThrow(/citation IDs refused/)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it("re-reads on every call so revocation is reflected without a cache", async () => {
    mocks.read.mockResolvedValueOnce(authorizedDocuments).mockResolvedValueOnce([authorizedDocuments[1]])
    await expect(resolveSyntheticCitations(scope, ["owner-private", "operations-runbook"])).resolves.toEqual([
      { documentId: "owner-private", title: "Owner private note" },
      { documentId: "operations-runbook", title: "Operations runbook" },
    ])
    await expect(resolveSyntheticCitations(scope, ["owner-private", "operations-runbook"])).resolves.toEqual([
      { documentId: "operations-runbook", title: "Operations runbook" },
    ])
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })

  it("propagates shared-reader failures without substituting content", async () => {
    mocks.read.mockRejectedValue(new Error("receipt sink unavailable"))
    await expect(resolveSyntheticCitations(scope, ["owner-private"])).rejects.toThrow("receipt sink unavailable")
    expect(JSON.stringify(mocks.read.mock.results)).not.toContain("SECRET BODY")
  })

  it("serializes only document IDs and titles", async () => {
    const result = await resolveSyntheticCitations(scope, ["owner-private"])
    expect(JSON.stringify(result)).toBe(JSON.stringify([{ documentId: "owner-private", title: "Owner private note" }]))
    expect(JSON.stringify(result)).not.toContain("SECRET")
    expect(JSON.stringify(result)).not.toContain(scope.tenantId)
    expect(JSON.stringify(result)).not.toContain(scope.workspaceId)
    expect(JSON.stringify(result)).not.toContain(scope.principalId)
  })
})
