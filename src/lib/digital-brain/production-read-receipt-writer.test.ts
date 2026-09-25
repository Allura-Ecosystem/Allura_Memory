import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: mocks.transaction }))

import { ProductionReadReceiptWriter } from "./production-read-receipt-writer"

const receipt = {
  receiptId: "00000000-0000-0000-0000-000000000076",
  action: "search_documents" as const,
  decision: "allow_candidate" as const,
  reasonCode: "authorized" as const,
  policyVersion: "epic30-production-v1" as const,
  tenantId: "allura-production",
  workspaceId: "workspace-a",
  principalId: "reader-a",
  actorRole: "viewer" as const,
  sessionHash: "a".repeat(64),
  policyEpoch: 3,
  witnessHash: "b".repeat(64),
  queryHash: "c".repeat(64),
  occurredAt: "2026-09-25T19:00:00.000Z",
}

describe("production read receipt writer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockResolvedValue({ rows: [{ receipt_id: receipt.receiptId, witness_hash: receipt.witnessHash }] })
    mocks.transaction.mockImplementation(async (_scope, callback) => callback({ query: mocks.query }))
  })

  it("uses only the restricted transaction function and returns its exact acknowledgement", async () => {
    await expect(new ProductionReadReceiptWriter().persist(receipt)).resolves.toEqual({ receiptId: receipt.receiptId, witnessHash: receipt.witnessHash })
    expect(mocks.transaction).toHaveBeenCalledWith({ tenantId: receipt.tenantId, workspaceId: receipt.workspaceId, principalId: receipt.principalId }, expect.any(Function))
    expect(mocks.query.mock.calls[0][0]).toContain("app.record_brain_read_receipt")
    expect(mocks.query.mock.calls[0][1]).toEqual([receipt.receiptId, receipt.action, receipt.actorRole, receipt.policyEpoch, receipt.sessionHash, receipt.witnessHash, receipt.queryHash, receipt.occurredAt])
  })

  it("refuses malformed, local-policy, and mismatched acknowledgements without a write fallback", async () => {
    const writer = new ProductionReadReceiptWriter()
    await expect(writer.persist({ ...receipt, policyVersion: "epic30-local-v2" })).rejects.toThrow(/receipt refused/)
    await expect(writer.persist({ ...receipt, action: "read_documents", queryHash: receipt.queryHash })).rejects.toThrow(/receipt refused/)
    expect(mocks.transaction).not.toHaveBeenCalled()
    mocks.query.mockResolvedValueOnce({ rows: [{ receipt_id: receipt.receiptId, witness_hash: "d".repeat(64) }] })
    await expect(writer.persist(receipt)).rejects.toThrow(/acknowledgement refused/)
    expect(mocks.query.mock.calls).toHaveLength(1)
  })
})
