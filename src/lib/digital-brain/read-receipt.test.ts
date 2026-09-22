import { describe, expect, it, vi } from "vitest"

import type { AuthorizedDocument } from "./read-service"
import { createAuthorizedReadReceipt, persistAuthorizedReadReceipt, type ReadReceiptInput } from "./read-receipt"

const document: AuthorizedDocument = {
  id: "synthetic-owner-note",
  groupId: "allura-epic30-local",
  workspaceId: "epic30-local-workspace",
  ownerId: "owner-user",
  departmentId: null,
  visibility: "private",
  title: "Synthetic secret title",
  content: "SYNTHETIC TEST DATA: secret body",
  updatedAt: new Date("2026-09-17T00:00:00Z"),
}
const input: ReadReceiptInput = {
  scope: { tenantId: document.groupId, workspaceId: document.workspaceId, principalId: document.ownerId },
  sessionId: "synthetic-private-session",
  actorRole: "viewer",
  policyEpoch: 7,
  documents: [document],
  witnessKey: Buffer.alloc(32, 1),
  receiptId: "01234567-89ab-4cde-8fab-0123456789ab",
  occurredAt: new Date("2026-09-22T00:00:00Z"),
}

describe("Epic 30 required read receipt contract", () => {
  it("persists content-free metadata, not session, document identifiers, names, or bodies", () => {
    const receipt = createAuthorizedReadReceipt(input)
    const serialized = JSON.stringify(receipt)
    expect(receipt.decision).toBe("allow_candidate")
    expect(receipt.policyEpoch).toBe(7)
    expect(receipt.sessionHash).toMatch(/^[a-f0-9]{64}$/)
    expect(receipt.witnessHash).toMatch(/^[a-f0-9]{64}$/)
    for (const protectedValue of [input.sessionId, document.id, document.title, document.content]) {
      expect(serialized).not.toContain(protectedValue)
    }
  })

  it("binds the witness to exact scope, session, epoch and candidate content independent of row order", () => {
    const second = { ...document, id: "synthetic-second-note", content: "SYNTHETIC TEST DATA: second" }
    const base = createAuthorizedReadReceipt({ ...input, documents: [document, second] }).witnessHash
    expect(createAuthorizedReadReceipt({ ...input, documents: [second, document] }).witnessHash).toBe(base)
    for (const patch of [
      { sessionId: "another-session" },
      { policyEpoch: 8 },
      { actorRole: "admin" as const },
      { scope: { ...input.scope, principalId: "other-user" } },
      { documents: [{ ...document, content: "SYNTHETIC TEST DATA: changed" }, second] },
    ]) {
      expect(createAuthorizedReadReceipt({ ...input, ...patch }).witnessHash).not.toBe(base)
    }
  })

  it("rejects cross-scope, duplicate, malformed and unkeyed candidates", () => {
    expect(() => createAuthorizedReadReceipt({ ...input, documents: [{ ...document, workspaceId: "other" }] })).toThrow(/document refused/)
    expect(() => createAuthorizedReadReceipt({ ...input, documents: [document, document] })).toThrow(/document refused/)
    expect(() => createAuthorizedReadReceipt({ ...input, documents: [{ ...document, content: undefined as unknown as string }] })).toThrow(/document refused/)
    expect(() => createAuthorizedReadReceipt({ ...input, policyEpoch: 0 })).toThrow(/input refused/)
    expect(() => createAuthorizedReadReceipt({ ...input, actorRole: "unknown" as "viewer" })).toThrow(/input refused/)
    expect(() => createAuthorizedReadReceipt({ ...input, witnessKey: Buffer.alloc(1) })).toThrow(/input refused/)
    expect(() => createAuthorizedReadReceipt({ ...input, sessionId: "" })).toThrow(/input refused/)
  })

  it("fails closed on sink outage or mismatched acknowledgement", async () => {
    const outage = vi.fn().mockRejectedValue(new Error("sink unavailable"))
    await expect(persistAuthorizedReadReceipt(input, { persist: outage })).rejects.toThrow("sink unavailable")
    const mismatch = vi.fn().mockResolvedValue({ receiptId: input.receiptId, witnessHash: "wrong" })
    await expect(persistAuthorizedReadReceipt(input, { persist: mismatch })).rejects.toThrow(/acknowledgement refused/)
    const exact = vi.fn().mockImplementation(async (receipt) => ({ receiptId: receipt.receiptId, witnessHash: receipt.witnessHash }))
    await expect(persistAuthorizedReadReceipt(input, { persist: exact })).resolves.toMatchObject({ receiptId: input.receiptId })
  })

  it("separates search and read witnesses and never stores the search text", () => {
    const search = createAuthorizedReadReceipt({ ...input, searchQuery: "synthetic secret" })
    expect(search.action).toBe("search_documents")
    expect(search.queryHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(search)).not.toContain("synthetic secret")
    expect(search.witnessHash).not.toBe(createAuthorizedReadReceipt(input).witnessHash)
    expect(createAuthorizedReadReceipt({ ...input, searchQuery: "other query" }).witnessHash).not.toBe(search.witnessHash)
    expect(() => createAuthorizedReadReceipt({ ...input, searchQuery: " unnormalized " })).toThrow(/input refused/)
  })
})
