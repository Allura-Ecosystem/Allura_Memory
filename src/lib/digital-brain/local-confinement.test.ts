import { beforeEach, afterEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), pool: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: mocks.transaction, withTenantTransaction: mocks.transaction }))
vi.mock("@/lib/postgres/connection", () => ({ getAppPool: mocks.pool }))
import { readAuthorizedDocuments } from "./read-service"
const scope = { tenantId: "allura-epic30-local", workspaceId: "epic30-local-workspace", principalId: "owner-user" }
const run = "a".repeat(32)
beforeEach(() => {
  vi.clearAllMocks()
  for (const [key,value] of Object.entries({ NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled", POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444", POSTGRES_DB: `allura_epic30_read_${run}`, ALLURA_EPIC30_RUN_ID: run, POSTGRES_APP_USER: "allura_app", POSTGRES_APP_OPTIONS: "" })) vi.stubEnv(key,value)
  mocks.pool.mockReturnValue({ options: { host: "127.0.0.1", port: 5444, database: `allura_epic30_read_${run}`, user: "allura_app", options: "" } })
  mocks.query.mockResolvedValue({ rows: [] })
  mocks.transaction.mockImplementation(async (_scope, callback) => callback({ query: mocks.query }))
})
afterEach(() => vi.unstubAllEnvs())
it.each([
  ["POSTGRES_HOST", "example.com"], ["POSTGRES_HOST", "localhost"], ["POSTGRES_PORT", "5432"],
  ["POSTGRES_PORT", "5444junk"], ["POSTGRES_DB", "allura_epic30_local"], ["POSTGRES_DB", `allura_epic30_read_${"b".repeat(32)}`],
  ["ALLURA_EPIC30_RUN_ID", ""], ["POSTGRES_APP_USER", "postgres"], ["POSTGRES_APP_OPTIONS", "-c role=postgres"],
  ["NODE_ENV", "production"], ["ALLURA_EPIC30_LOCAL_DB", "disabled"],
])("rejects %s=%s before ANY connection/query", async (key,value) => {
  vi.stubEnv(key,value)
  await expect(readAuthorizedDocuments(scope)).rejects.toThrow(/synthetic/i)
  expect(mocks.transaction).not.toHaveBeenCalled()
  expect(mocks.query).not.toHaveBeenCalled()
})
it.each([{ tenantId: "allura-other" }, { workspaceId: "wrong-workspace" }, { principalId: "real-person" }])("rejects nonsynthetic scope without queries: %j", async patch => {
  await expect(readAuthorizedDocuments({ ...scope, ...patch })).resolves.toEqual([])
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it("rejects a stale cached pool targeting another host before connecting", async () => {
  mocks.pool.mockReturnValue({ options: { host: "remote.example", port: 5444, database: `allura_epic30_read_${run}`, user: "allura_app" } })
  await expect(readAuthorizedDocuments(scope)).rejects.toThrow(/Synthetic/)
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it("requires actual session/receipt verification before disclosure", async () => {
  await expect(readAuthorizedDocuments(scope)).rejects.toThrow(/synthetic/i)
  expect(mocks.query).toHaveBeenCalledTimes(1)
  expect(mocks.query.mock.calls[0][0]).toContain("session_user")
})
