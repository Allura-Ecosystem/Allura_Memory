import { expect, it, vi, afterEach } from "vitest"
const mocks = vi.hoisted(() => ({ pool: vi.fn() }))
vi.mock("pg", () => ({ Pool: mocks.pool }))
import { provisionSyntheticDatabase } from "../../scripts/epic30/synthetic-database"
import { startupCancellation } from "../../scripts/epic30/demo"
import { EventEmitter } from "node:events"
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
function provisionerEnvironment() {
  for (const [key, value] of Object.entries({ POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444", POSTGRES_USER: "test_owner", POSTGRES_PASSWORD: "test-placeholder", POSTGRES_APP_USER: "allura_app", POSTGRES_APP_PASSWORD: "test-placeholder", NODE_ENV: "test" })) vi.stubEnv(key, value)
}

it.each(["SIGTERM", "SIGINT"])("cleans a database acquired while %s interrupts startup", async signal => {
  provisionerEnvironment()
  const source = new EventEmitter()
  const cancellation = startupCancellation(source)
  const root = { query: vi.fn(async (sql: string) => {
    if (sql.startsWith("CREATE DATABASE")) source.emit(signal)
    return { rows: [], rowCount: 0 }
  }), end: vi.fn().mockResolvedValue(undefined) }
  const owner = { query: vi.fn(), end: vi.fn().mockResolvedValue(undefined) }
  const app = { query: vi.fn(), end: vi.fn().mockResolvedValue(undefined) }
  const receipt = { query: vi.fn(), end: vi.fn().mockResolvedValue(undefined) }
  mocks.pool.mockImplementationOnce(() => root).mockImplementationOnce(() => owner)
    .mockImplementationOnce(() => app).mockImplementationOnce(() => receipt)
  try { await expect(provisionSyntheticDatabase(cancellation.signal)).rejects.toThrow(/Synthetic/) }
  finally { cancellation.dispose() }
  expect(owner.query).not.toHaveBeenCalled()
  expect(owner.end).toHaveBeenCalledOnce()
  expect(app.end).toHaveBeenCalledOnce()
  expect(receipt.end).toHaveBeenCalledOnce()
  expect(root.query.mock.calls.some(([sql]) => sql.startsWith("DROP DATABASE \"allura_epic30_read_"))).toBe(true)
  expect(root.query.mock.calls.some(([sql]) => sql.startsWith("DROP ROLE \"allura_epic30_receipt_"))).toBe(true)
  expect(root.end).toHaveBeenCalledOnce()
  expect(source.listenerCount(signal)).toBe(0)
})

it.each(["owner", "drop"])("continues remaining cleanup when %s cleanup fails", async failure => {
  provisionerEnvironment()
  const controller = new AbortController()
  const root = { query: vi.fn(async (sql: string) => {
    if (sql.startsWith("CREATE DATABASE")) controller.abort()
    if (sql.startsWith("DROP DATABASE") && failure === "drop") throw new Error("secret")
    return { rows: [], rowCount: 0 }
  }), end: vi.fn().mockResolvedValue(undefined) }
  const owner = { query: vi.fn(), end: failure === "owner" ? vi.fn().mockRejectedValue(new Error("secret")) : vi.fn().mockResolvedValue(undefined) }
  const app = { query: vi.fn(), end: vi.fn().mockResolvedValue(undefined) }
  const receipt = { query: vi.fn(), end: vi.fn().mockResolvedValue(undefined) }
  mocks.pool.mockImplementationOnce(() => root).mockImplementationOnce(() => owner)
    .mockImplementationOnce(() => app).mockImplementationOnce(() => receipt)
  await expect(provisionSyntheticDatabase(controller.signal)).rejects.toThrow("Synthetic database cleanup failed")
  expect(root.query.mock.calls.some(([sql]) => sql.startsWith("DROP DATABASE"))).toBe(true)
  expect(root.end).toHaveBeenCalledOnce()
  expect(owner.end).toHaveBeenCalledOnce()
  expect(app.end).toHaveBeenCalledOnce()
  expect(receipt.end).toHaveBeenCalledOnce()
})
it("requires explicitly supplied provisioner identity before any pool creation", async () => {
  vi.stubEnv("POSTGRES_HOST","127.0.0.1"); vi.stubEnv("POSTGRES_PORT","5444")
  vi.stubEnv("POSTGRES_USER",undefined); vi.stubEnv("POSTGRES_PASSWORD","test-placeholder")
  vi.stubEnv("POSTGRES_APP_USER","allura_app"); vi.stubEnv("POSTGRES_APP_PASSWORD","test-placeholder")
  await expect(provisionSyntheticDatabase()).rejects.toThrow(/POSTGRES_USER/)
  expect(mocks.pool).not.toHaveBeenCalled()
})
