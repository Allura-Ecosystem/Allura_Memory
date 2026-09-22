import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), pool: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withTenantTransaction: mocks.transaction }))
vi.mock("@/lib/postgres/connection", () => ({ getEpic30ReceiptPool: mocks.pool }))

import { persistSyntheticReadReceipt } from "./read-receipt-writer"
import { createAuthorizedReadReceipt } from "./read-receipt"

const run = "a".repeat(32)
const role = `allura_epic30_receipt_${run}`
const scope = { tenantId: "allura-epic30-local", workspaceId: "epic30-local-workspace", principalId: "owner-user" }
const receipt = createAuthorizedReadReceipt({
  scope, sessionId: "synthetic-session", policyEpoch: 1, witnessKey: Buffer.alloc(32, 1),
  documents: [], receiptId: "01234567-89ab-4cde-8fab-0123456789ab",
  occurredAt: new Date("2026-09-22T00:00:00Z"),
})

beforeEach(() => {
  vi.clearAllMocks()
  for (const [key, value] of Object.entries({
    NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled", ALLURA_EPIC30_RUN_ID: run,
    POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444", POSTGRES_DB: `allura_epic30_read_${run}`,
    POSTGRES_APP_USER: "allura_app", POSTGRES_APP_OPTIONS: "",
  })) vi.stubEnv(key, value)
  mocks.pool.mockReturnValue({ options: { host: "127.0.0.1", port: 5444, database: `allura_epic30_read_${run}`, user: role } })
  mocks.query.mockResolvedValue({ rows: [{ current_user: role, session_user: role, restricted: true, database_ok: true }] })
  mocks.transaction.mockImplementation(async (_scope, callback) => callback({ query: mocks.query }))
})
afterEach(() => vi.unstubAllEnvs())

describe("Epic 30 separate receipt writer", () => {
  it("inserts only content-free receipt fields under the separate role", async () => {
    const ack = await persistSyntheticReadReceipt(receipt)
    expect(ack).toEqual({ receiptId: receipt.receiptId, witnessHash: receipt.witnessHash })
    expect(mocks.transaction).toHaveBeenCalledWith(scope, expect.any(Function), mocks.pool.mock.results[0].value)
    const [sql, values] = mocks.query.mock.calls[1] as [string, unknown[]]
    expect(sql).toContain("INSERT INTO epic30_local.read_receipts")
    expect(values).toEqual([
      receipt.receiptId, run, scope.tenantId, scope.workspaceId, scope.principalId,
      receipt.sessionHash, receipt.policyEpoch, receipt.action, receipt.decision,
      receipt.reasonCode, receipt.policyVersion, receipt.witnessHash, receipt.occurredAt,
    ])
    expect(JSON.stringify(values)).not.toContain("synthetic-session")
  })

  it("refuses an owner or stale cached pool before connecting", async () => {
    mocks.pool.mockReturnValue({ options: { host: "127.0.0.1", port: 5444, database: `allura_epic30_read_${run}`, user: "postgres" } })
    await expect(persistSyntheticReadReceipt(receipt)).rejects.toThrow(/cached receipt pool refused/)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("refuses a forged session identity and never inserts", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ current_user: "postgres", session_user: "postgres", restricted: false, database_ok: true }] })
    await expect(persistSyntheticReadReceipt(receipt)).rejects.toThrow(/writer session refused/)
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })

  it("propagates a database insert outage without an acknowledgement", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ current_user: role, session_user: role, restricted: true, database_ok: true }] })
      .mockRejectedValueOnce(new Error("sink unavailable"))
    await expect(persistSyntheticReadReceipt(receipt)).rejects.toThrow("sink unavailable")
  })
})
