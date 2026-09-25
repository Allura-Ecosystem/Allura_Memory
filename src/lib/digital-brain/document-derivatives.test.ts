import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock("./read-service", () => ({ readAuthorizedDocuments: mocks.read }))

import { resolveSyntheticDerivativeSources } from "./document-derivatives"
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

describe("Epic 30 synthetic derivative source authority", () => {
  it("returns only minimal owner and authorized department sources in first-seen order", async () => {
    await expect(resolveSyntheticDerivativeSources(scope, ["operations-runbook", "owner-private"])).resolves.toEqual({
      sources: [
        { documentId: "operations-runbook", title: "Operations runbook" },
        { documentId: "owner-private", title: "Owner private note" },
      ],
    })
    expect(mocks.read).toHaveBeenCalledOnce()
    expect(mocks.read).toHaveBeenCalledWith(scope)
  })

  it("returns null for a mixed authorized and hidden source without a partial result", async () => {
    await expect(resolveSyntheticDerivativeSources(scope, ["owner-private", "other-private"])).resolves.toBeNull()
    await expect(resolveSyntheticDerivativeSources(scope, ["other-private", "owner-private"])).resolves.toBeNull()
  })

  it("does not distinguish missing from unauthorized source IDs", async () => {
    await expect(resolveSyntheticDerivativeSources(scope, ["missing"])).resolves.toBeNull()
    await expect(resolveSyntheticDerivativeSources(scope, ["other-private"])).resolves.toBeNull()
  })

  it("deduplicates sources while preserving first-seen order", async () => {
    await expect(
      resolveSyntheticDerivativeSources(scope, [
        "owner-private",
        "operations-runbook",
        "owner-private",
        "operations-runbook",
      ])
    ).resolves.toEqual({
      sources: [
        { documentId: "owner-private", title: "Owner private note" },
        { documentId: "operations-runbook", title: "Operations runbook" },
      ],
    })
  })

  it.each([
    ["empty array", []],
    ["empty ID", [""]],
    ["whitespace ID", ["   "]],
    ["trimmed ID", [" owner-private"]],
    ["overlong ID", ["x".repeat(201)]],
    ["control character", ["owner-private\nforged"]],
    ["alias", ["owner-private|Owner private note"]],
    ["markup alias", ["[[owner-private]]"]],
  ])("rejects %s before reading", async (_label, sourceIds) => {
    await expect(resolveSyntheticDerivativeSources(scope, sourceIds)).rejects.toThrow(/derivative source IDs refused/)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it("rejects a non-array and overlong batch before reading", async () => {
    await expect(resolveSyntheticDerivativeSources(scope, null as unknown as string[])).rejects.toThrow(
      /derivative source IDs refused/
    )
    await expect(
      resolveSyntheticDerivativeSources(
        scope,
        Array.from({ length: 201 }, (_, index) => `doc-${index}`)
      )
    ).rejects.toThrow(/derivative source IDs refused/)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it("re-reads each call so revocation is reflected without a cache", async () => {
    mocks.read.mockResolvedValueOnce(authorizedDocuments).mockResolvedValueOnce([authorizedDocuments[1]])
    await expect(resolveSyntheticDerivativeSources(scope, ["owner-private", "operations-runbook"])).resolves.toEqual({
      sources: [
        { documentId: "owner-private", title: "Owner private note" },
        { documentId: "operations-runbook", title: "Operations runbook" },
      ],
    })
    await expect(resolveSyntheticDerivativeSources(scope, ["owner-private", "operations-runbook"])).resolves.toBeNull()
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })

  it("propagates reader failures without substituting content", async () => {
    mocks.read.mockRejectedValue(new Error("receipt sink unavailable"))
    await expect(resolveSyntheticDerivativeSources(scope, ["owner-private"])).rejects.toThrow(
      "receipt sink unavailable"
    )
    expect(JSON.stringify(mocks.read.mock.results)).not.toContain("SECRET BODY")
  })

  it("serializes only source IDs and titles", async () => {
    const result = await resolveSyntheticDerivativeSources(scope, ["owner-private"])
    expect(JSON.stringify(result)).toBe(
      JSON.stringify({
        sources: [{ documentId: "owner-private", title: "Owner private note" }],
      })
    )
    expect(JSON.stringify(result)).not.toContain("SECRET")
    expect(JSON.stringify(result)).not.toContain(scope.tenantId)
    expect(JSON.stringify(result)).not.toContain(scope.workspaceId)
    expect(JSON.stringify(result)).not.toContain(scope.principalId)
  })
})
