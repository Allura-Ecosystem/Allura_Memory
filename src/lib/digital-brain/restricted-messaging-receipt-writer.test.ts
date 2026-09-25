import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: mocks.transaction }))

import { RestrictedMessagingReceiptWriter } from "./restricted-messaging-receipt-writer"

const receipt = {
  receiptId: "00000000-0000-0000-0000-000000000077",
  action: "send_message" as const,
  decision: "allow" as const,
  tenantId: "allura-production",
  workspaceId: "workspace-a",
  actorId: "contractor-a",
  resourceId: "00000000-0000-0000-0000-000000000078",
  policyEpoch: 4,
  witnessHash: "a".repeat(64),
}

describe("restricted messaging receipt writer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockResolvedValue({ rows: [{ receipt_id: receipt.receiptId, witness_hash: receipt.witnessHash }] })
    mocks.transaction.mockImplementation(async (_scope, callback) => callback({ query: mocks.query }))
  })

  it("persists only through the server-scoped receipt procedure", async () => {
    await expect(new RestrictedMessagingReceiptWriter().persist(receipt)).resolves.toEqual({ receiptId: receipt.receiptId, witnessHash: receipt.witnessHash })
    expect(mocks.transaction).toHaveBeenCalledWith({ tenantId: receipt.tenantId, workspaceId: receipt.workspaceId, principalId: receipt.actorId }, expect.any(Function))
    expect(mocks.query.mock.calls[0][0]).toContain("app.record_brain_messaging_receipt")
    expect(mocks.query.mock.calls[0][1]).toEqual([receipt.receiptId, receipt.action, receipt.resourceId, receipt.policyEpoch, receipt.witnessHash])
  })

  it("rejects denied, malformed, and mismatched acknowledgements without fallback DML", async () => {
    const writer = new RestrictedMessagingReceiptWriter()
    await expect(writer.persist({ ...receipt, decision: "deny" })).rejects.toThrow(/receipt refused/)
    await expect(writer.persist({ ...receipt, witnessHash: "not-a-hash" })).rejects.toThrow(/receipt refused/)
    expect(mocks.transaction).not.toHaveBeenCalled()
    mocks.query.mockResolvedValueOnce({ rows: [{ receipt_id: receipt.receiptId, witness_hash: "b".repeat(64) }] })
    await expect(writer.persist(receipt)).rejects.toThrow(/acknowledgement refused/)
  })
})
