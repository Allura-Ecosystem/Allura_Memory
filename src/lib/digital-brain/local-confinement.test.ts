import { beforeEach, afterEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), pool: vi.fn(), principal: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: mocks.transaction, withTenantTransaction: mocks.transaction }))
vi.mock("@/lib/postgres/connection", () => ({ getAppPool: mocks.pool }))
vi.mock("@/lib/auth/dashboard-principal", () => ({ getDashboardPrincipal: mocks.principal }))
import { readAuthorizedDocuments } from "./read-service"
const scope = { tenantId: "allura-epic30-local", workspaceId: "epic30-local-workspace", principalId: "owner-user" }
const principal = { id: scope.principalId, groupId: scope.tenantId, workspaceId: scope.workspaceId,
  role: "viewer" as const, sessionId: "dev:owner-user", email: "owner@example.invalid" }
const run = "a".repeat(32)
const verifiedSession = { current_user: "allura_app", session_user: "allura_app", restricted: true,
  rls: true, database_ok: true, dataset_ok: true }
const ownerRow = { id: "epic30-owner-private", group_id: scope.tenantId, workspace_id: scope.workspaceId,
  owner_id: scope.principalId, department_id: null, visibility: "private", title: "Synthetic owner note",
  content: "SYNTHETIC TEST DATA: owner note", updated_at: new Date("2026-09-17T00:00:00Z"),
  authorized_tenant: true, authorized_workspace: true, authorized_department: false }
beforeEach(() => {
  vi.clearAllMocks()
  for (const [key,value] of Object.entries({ NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled", POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444", POSTGRES_DB: `allura_epic30_read_${run}`, ALLURA_EPIC30_RUN_ID: run, POSTGRES_APP_USER: "allura_app", POSTGRES_APP_OPTIONS: "" })) vi.stubEnv(key,value)
  mocks.pool.mockReturnValue({ options: { host: "127.0.0.1", port: 5444, database: `allura_epic30_read_${run}`, user: "allura_app", options: "" } })
  mocks.principal.mockResolvedValue(principal)
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
it.each([{ tenantId: "allura-other" }, { workspaceId: "wrong-workspace" }, { principalId: "real-person" }])("refuses scope/principal mismatch without queries: %j", async patch => {
  await expect(readAuthorizedDocuments({ ...scope, ...patch })).rejects.toThrow(/authority/i)
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
it.each(["", " "])('refuses missing verified session before any connection: %j', async sessionId => {
  mocks.principal.mockResolvedValue({ ...principal, sessionId })
  await expect(readAuthorizedDocuments(scope)).rejects.toThrow(/authority/i)
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it("issues an exact read envelope from current membership role and epoch", async () => {
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
  const documents = await readAuthorizedDocuments(scope)
  expect(documents.map(({ id }) => id)).toEqual([ownerRow.id])
  expect(mocks.query).toHaveBeenCalledTimes(3)
  expect(mocks.query.mock.calls[1][0]).toContain("brain_workspace_memberships")
  expect(mocks.query.mock.calls[2][1]).toEqual([scope.tenantId, scope.workspaceId, scope.principalId, 7])
})
it.each([
  { role: "admin", policy_epoch: "7" }, { role: "viewer", policy_epoch: "0" },
  { role: "viewer", policy_epoch: "not-an-epoch" },
])("denies mismatched role or invalid epoch before document SQL: %j", async membership => {
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [membership] })
  await expect(readAuthorizedDocuments(scope)).rejects.toThrow(/authority/i)
  expect(mocks.query).toHaveBeenCalledTimes(2)
})
it("denies missing current workspace membership without document SQL", async () => {
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] }).mockResolvedValueOnce({ rows: [] })
  await expect(readAuthorizedDocuments(scope)).resolves.toEqual([])
  expect(mocks.query).toHaveBeenCalledTimes(2)
})
