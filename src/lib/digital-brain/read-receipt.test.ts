import { describe, expect, it, vi } from "vitest"

import type { AuthorizedDocument } from "./read-service"
import {
  assertAuthorizedReadCursorMatches,
  createAuthorizedReadCursor,
  createAuthorizedReadReceipt,
  decodeAuthorizedReadCursor,
  hashAuthorizedSearchQuery,
  persistAuthorizedReadReceipt,
  type ReadReceiptInput,
} from "./read-receipt"

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

  it("creates an opaque receipt-bound keyset cursor without serializing protected values", () => {
    const priorReceipt = createAuthorizedReadReceipt(input)
    const cursor = createAuthorizedReadCursor({
      scope: input.scope,
      sessionId: input.sessionId,
      actorRole: input.actorRole,
      policyEpoch: input.policyEpoch,
      operation: "read_documents",
      pageSize: 2,
      boundary: { updatedAt: document.updatedAt.toISOString(), id: document.id },
      witnessHash: priorReceipt.witnessHash,
      witnessKey: input.witnessKey,
    })
    expect(cursor.length).toBeLessThanOrEqual(4096)
    for (const protectedValue of [input.sessionId, document.id, document.title, document.content]) {
      expect(cursor).not.toContain(protectedValue)
    }
    const claims = decodeAuthorizedReadCursor(cursor, input.witnessKey)
    expect(claims).toMatchObject({
      operation: "read_documents", pageSize: 2, policyEpoch: input.policyEpoch,
      boundary: { updatedAt: document.updatedAt.toISOString(), id: document.id },
      witnessHash: priorReceipt.witnessHash,
    })
    const continued = createAuthorizedReadReceipt({ ...input, priorWitnessHash: claims.witnessHash })
    expect(continued.witnessHash).not.toBe(priorReceipt.witnessHash)
    expect(createAuthorizedReadReceipt({ ...input, priorWitnessHash: claims.witnessHash }).witnessHash)
      .toBe(continued.witnessHash)
    expect(() => createAuthorizedReadReceipt({ ...input, priorWitnessHash: "not-a-digest" }))
      .toThrow(/input refused/)
  })

  it("rejects malformed, tampered, expired, cross-operation and cross-scope cursors", () => {
    const witnessHash = createAuthorizedReadReceipt(input).witnessHash
    const cursor = createAuthorizedReadCursor({
      scope: input.scope, sessionId: input.sessionId, actorRole: input.actorRole,
      policyEpoch: input.policyEpoch, operation: "search_documents", pageSize: 2,
      boundary: { updatedAt: document.updatedAt.toISOString(), id: document.id }, witnessHash,
      witnessKey: input.witnessKey, queryHash: hashAuthorizedSearchQuery(input.witnessKey, "secret"),
      issuedAt: new Date("2026-09-22T00:00:00.000Z"),
    })
    expect(() => decodeAuthorizedReadCursor("bad", input.witnessKey)).toThrow(/cursor refused/)
    expect(() => decodeAuthorizedReadCursor(`${cursor.slice(0, -1)}x`, input.witnessKey)).toThrow(/cursor refused/)
    expect(() => decodeAuthorizedReadCursor(cursor, Buffer.alloc(32, 2))).toThrow(/cursor refused/)
    expect(() => decodeAuthorizedReadCursor(cursor, input.witnessKey, new Date("2026-09-22T00:01:01.000Z"))).toThrow(/cursor refused/)
    const claims = decodeAuthorizedReadCursor(cursor, input.witnessKey, new Date("2026-09-22T00:00:01.000Z"))
    expect(() => assertAuthorizedReadCursorMatches(claims, {
      scope: input.scope, sessionId: input.sessionId, witnessKey: input.witnessKey,
      actorRole: input.actorRole, policyEpoch: input.policyEpoch, operation: "read_documents",
      pageSize: 2, queryHash: null,
    })).toThrow(/authority refused/)
    expect(() => assertAuthorizedReadCursorMatches(claims, {
      scope: { ...input.scope, workspaceId: "other-workspace" }, sessionId: input.sessionId,
      witnessKey: input.witnessKey, actorRole: input.actorRole, policyEpoch: input.policyEpoch,
      operation: "search_documents", pageSize: 2, queryHash: claims.queryHash,
    })).toThrow(/authority refused/)
  })
})
