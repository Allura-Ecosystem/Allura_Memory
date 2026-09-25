import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), pool: vi.fn(), principal: vi.fn(), receipt: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: mocks.transaction, withTenantTransaction: mocks.transaction }))
vi.mock("@/lib/postgres/connection", () => ({ getAppPool: mocks.pool }))
vi.mock("@/lib/auth/dashboard-principal", () => ({ getDashboardPrincipal: mocks.principal }))
vi.mock("./read-receipt-writer", () => ({ persistSyntheticReadReceipt: mocks.receipt }))
import { resolveSyntheticAskContext } from "./ask-context"
import { readSyntheticDocumentLinks } from "./document-links"
import { ProductionAuthorizedReadProvider } from "./production-reader"
import { createAuthorizedReadReceipt } from "./read-receipt"
import { readAuthorizedDocuments, readAuthorizedDocumentsPage, readAuthorizedWorkspaceState, searchAuthorizedDocuments, searchAuthorizedDocumentsPage } from "./read-service"
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
const productionScope = { tenantId: "allura-production", workspaceId: "workspace-production", principalId: "production-user" }
const productionPrincipal = { id: productionScope.principalId, groupId: productionScope.tenantId,
  workspaceId: productionScope.workspaceId, role: "viewer" as const, sessionId: "clerk-session-production", email: "" }
const productionRows = [
  { id: "z-record", group_id: productionScope.tenantId, workspace_id: productionScope.workspaceId,
    owner_id: productionScope.principalId, department_id: null, visibility: "private", title: "Production note",
    content: "Authorized production content", updated_at: new Date("2026-09-17T00:00:00Z") },
  { id: "a-record", group_id: productionScope.tenantId, workspace_id: productionScope.workspaceId,
    owner_id: "department-user", department_id: "operations", visibility: "department", title: "Operations runbook",
    content: "Production deployment runbook", updated_at: new Date("2026-09-16T00:00:00Z") },
]
beforeEach(() => {
  vi.clearAllMocks()
  for (const [key,value] of Object.entries({ NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled", POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444", POSTGRES_DB: `allura_epic30_read_${run}`, ALLURA_EPIC30_RUN_ID: run, POSTGRES_APP_USER: "allura_app", POSTGRES_APP_OPTIONS: "", ALLURA_EPIC30_RECEIPT_KEY: Buffer.alloc(32, 1).toString("base64url") })) vi.stubEnv(key,value)
  mocks.pool.mockReturnValue({ options: { host: "127.0.0.1", port: 5444, database: `allura_epic30_read_${run}`, user: "allura_app", options: "" } })
  mocks.principal.mockResolvedValue(principal)
  mocks.receipt.mockImplementation(async receipt => ({ receiptId: receipt.receiptId, witnessHash: receipt.witnessHash }))
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
    .mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
  const documents = await readAuthorizedDocuments(scope)
  expect(documents.map(({ id }) => id)).toEqual([ownerRow.id])
  expect(mocks.query).toHaveBeenCalledTimes(6)
  expect(mocks.receipt).toHaveBeenCalledTimes(1)
  expect(mocks.transaction).toHaveBeenCalledTimes(2)
  expect(mocks.query.mock.calls[1][0]).toContain("brain_workspace_memberships")
  expect(mocks.query.mock.calls[2][1]).toEqual([scope.tenantId, scope.workspaceId, scope.principalId, 7])
})

it("derives links and backlinks only from receipt-gated authorized endpoints", async () => {
  const focus = { ...ownerRow, id: "focus", title: "Focused note",
    content: "SYNTHETIC TEST DATA: [[visible-target]] [[hidden-target]]" }
  const visible = { ...ownerRow, id: "visible-target", title: "Visible target",
    content: "SYNTHETIC TEST DATA: [[focus]]" }
  const hidden = { ...ownerRow, id: "hidden-target", title: "Hidden target",
    owner_id: "other-user", visibility: "private", content: "SYNTHETIC TEST DATA: [[focus]]" }
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("session_user")) return { rows: [verifiedSession] }
    if (sql.includes("SELECT workspace_membership.policy_epoch")) return { rows: [{ role: "viewer", policy_epoch: "7" }] }
    return { rows: [focus, visible, hidden] }
  })
  expect(await readSyntheticDocumentLinks(scope, "focus")).toEqual({
    documentId: "focus", title: "Focused note",
    links: [{ documentId: "visible-target", title: "Visible target" }],
    backlinks: [{ documentId: "visible-target", title: "Visible target" }],
  })
  expect(mocks.receipt).toHaveBeenCalledTimes(1)
  expect(mocks.transaction).toHaveBeenCalledTimes(2)
})
it("builds Ask context only after the shared receipt-gated authority recheck", async () => {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("session_user")) return { rows: [verifiedSession] }
    if (sql.includes("SELECT workspace_membership.policy_epoch")) return { rows: [{ role: "viewer", policy_epoch: "7" }] }
    return { rows: [ownerRow] }
  })
  await expect(resolveSyntheticAskContext(scope, [ownerRow.id])).resolves.toEqual({
    sources: [{ documentId: ownerRow.id, title: ownerRow.title, excerpt: ownerRow.content }],
  })
  expect(mocks.receipt).toHaveBeenCalledTimes(1)
  expect(mocks.transaction).toHaveBeenCalledTimes(2)
})
it("does not disclose candidates when the separate receipt sink fails", async () => {
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
  mocks.receipt.mockRejectedValue(new Error("sink unavailable"))
  await expect(readAuthorizedDocuments(scope)).rejects.toThrow("sink unavailable")
  expect(mocks.query).toHaveBeenCalledTimes(3)
  expect(mocks.transaction).toHaveBeenCalledTimes(1)
})
it("denies changed policy epoch after the receipt commits", async () => {
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
    .mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "8" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
  await expect(readAuthorizedDocuments(scope)).rejects.toThrow(/authority changed/)
  expect(mocks.receipt).toHaveBeenCalledTimes(1)
})
it("denies changed candidate content after the receipt commits", async () => {
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
    .mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [{ ...ownerRow, content: "SYNTHETIC TEST DATA: changed" }] })
  await expect(readAuthorizedDocuments(scope)).rejects.toThrow(/authority changed/)
  expect(mocks.receipt).toHaveBeenCalledTimes(1)
})
it("denies changed server session before the second restricted read", async () => {
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
  mocks.principal.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, sessionId: "replacement" })
  await expect(readAuthorizedDocuments(scope)).rejects.toThrow(/authority changed/)
  expect(mocks.transaction).toHaveBeenCalledTimes(1)
})
it("refuses a missing receipt witness key before document SQL", async () => {
  vi.stubEnv("ALLURA_EPIC30_RECEIPT_KEY", "")
  await expect(readAuthorizedDocuments(scope)).rejects.toThrow(/receipt key refused/)
  expect(mocks.transaction).not.toHaveBeenCalled()
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

it("maps authorized documents and authorized emptiness to explicit workspace states", async () => {
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
    .mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
  await expect(readAuthorizedWorkspaceState(scope)).resolves.toEqual({ state: "complete", documents: [expect.objectContaining({ id: ownerRow.id })] })

  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [] })
  await expect(readAuthorizedWorkspaceState(scope)).resolves.toEqual({ state: "empty", documents: [] })
})

it("maps absent authority to forbidden without disclosing documents", async () => {
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] }).mockResolvedValueOnce({ rows: [] })
  await expect(readAuthorizedWorkspaceState(scope)).resolves.toEqual({ state: "forbidden", documents: [] })

  mocks.principal.mockResolvedValue(null)
  await expect(readAuthorizedWorkspaceState(scope)).resolves.toEqual({ state: "forbidden", documents: [] })
})

it("maps invalid local fixture configuration to unavailable", async () => {
  vi.stubEnv("POSTGRES_HOST", "example.com")
  await expect(readAuthorizedWorkspaceState(scope)).resolves.toEqual({ state: "unavailable", documents: [] })
  expect(mocks.transaction).not.toHaveBeenCalled()
})

it("maps dependency failure and concurrent authority change without leaking candidates", async () => {
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
  mocks.receipt.mockRejectedValueOnce(new Error("sensitive sink failure"))
  await expect(readAuthorizedWorkspaceState(scope)).resolves.toEqual({ state: "degraded", documents: [] })

  mocks.receipt.mockImplementation(async receipt => ({ receiptId: receipt.receiptId, witnessHash: receipt.witnessHash }))
  mocks.query.mockReset()
  mocks.query.mockResolvedValueOnce({ rows: [verifiedSession] })
    .mockResolvedValueOnce({ rows: [{ role: "viewer", policy_epoch: "7" }] })
    .mockResolvedValueOnce({ rows: [ownerRow] })
  mocks.principal.mockResolvedValueOnce(principal).mockResolvedValueOnce({ ...principal, sessionId: "replacement" })
  await expect(readAuthorizedWorkspaceState(scope)).resolves.toEqual({ state: "conflict", documents: [] })
})

function mockFourAuthorizedSnapshots(finalRow = ownerRow, extraRows: unknown[] = []) {
  let documentReads = 0
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("session_user")) return { rows: [verifiedSession] }
    if (sql.includes("SELECT workspace_membership.policy_epoch")) return { rows: [{ role: "viewer", policy_epoch: "7" }] }
    documentReads += 1
    return { rows: [documentReads >= 3 ? finalRow : ownerRow, ...extraRows] }
  })
}

it("returns synthetic search names, counts and snippets only after read and search receipts", async () => {
  mockFourAuthorizedSnapshots()
  const result = await searchAuthorizedDocuments(scope, "OWNER")
  expect(result).toEqual({ total: 1, hits: [{ documentId: ownerRow.id, title: ownerRow.title,
    snippet: ownerRow.content, updatedAt: ownerRow.updated_at }] })
  expect(mocks.receipt).toHaveBeenCalledTimes(3)
  expect(mocks.receipt.mock.calls.map(([receipt]) => receipt.action)).toEqual([
    "read_documents", "search_documents", "read_documents",
  ])
  const searchReceipt = mocks.receipt.mock.calls[1][0]
  expect(JSON.stringify(searchReceipt)).not.toContain(ownerRow.title)
})

it("does not search or count a matching hidden department document", async () => {
  mockFourAuthorizedSnapshots(ownerRow, [{ ...ownerRow, id: "hidden-match",
    visibility: "department", owner_id: "other-user", department_id: "finance",
    title: "Hidden finance forecast", content: "SYNTHETIC TEST DATA: forecast",
    authorized_department: false }])
  const result = await searchAuthorizedDocuments(scope, "forecast")
  expect(result).toEqual({ total: 0, hits: [] })
  const searchReceipt = mocks.receipt.mock.calls[1][0]
  expect(searchReceipt.action).toBe("search_documents")
  expect(JSON.stringify(searchReceipt)).not.toContain("hidden-match")
  expect(JSON.stringify(searchReceipt)).not.toContain("Hidden finance forecast")
})

it("fails closed when the search receipt sink refuses the candidate", async () => {
  mockFourAuthorizedSnapshots()
  mocks.receipt.mockImplementationOnce(async receipt => ({ receiptId: receipt.receiptId, witnessHash: receipt.witnessHash }))
    .mockRejectedValueOnce(new Error("search sink unavailable"))
  await expect(searchAuthorizedDocuments(scope, "owner")).rejects.toThrow("search sink unavailable")
  expect(mocks.transaction).toHaveBeenCalledTimes(2)
})

it("denies search results changed after the search receipt", async () => {
  mockFourAuthorizedSnapshots({ ...ownerRow, title: "Synthetic changed note", content: "SYNTHETIC TEST DATA: changed" })
  await expect(searchAuthorizedDocuments(scope, "owner")).rejects.toThrow(/search authority changed/)
})

it("rejects malformed search text before connecting", async () => {
  await expect(searchAuthorizedDocuments(scope, "\n")).rejects.toThrow(/query refused/)
  expect(mocks.transaction).not.toHaveBeenCalled()
})

it("paginates synthetic reads with a receipt-bound keyset cursor and reauthorizes each page", async () => {
  const secondRow = { ...ownerRow, id: "epic30-owner-private-2", title: "Synthetic second note",
    content: "SYNTHETIC TEST DATA: second", updated_at: new Date("2026-09-16T00:00:00Z") }
  let documentReads = 0
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("session_user")) return { rows: [verifiedSession] }
    if (sql.includes("SELECT workspace_membership.policy_epoch")) return { rows: [{ role: "viewer", policy_epoch: "7" }] }
    documentReads += 1
    return { rows: documentReads <= 2 ? [ownerRow, secondRow] : [secondRow] }
  })
  const first = await readAuthorizedDocumentsPage(scope, { pageSize: 1 })
  expect(first.documents.map(({ id }) => id)).toEqual([ownerRow.id])
  expect(first.hasMore).toBe(true)
  expect(first.nextCursor).toBeTruthy()
  expect(first.nextCursor).not.toContain(ownerRow.id)
  const second = await readAuthorizedDocumentsPage(scope, { pageSize: 1, cursor: first.nextCursor! })
  expect(second.documents.map(({ id }) => id)).toEqual([secondRow.id])
  expect(second.hasMore).toBe(false)
  expect(second.nextCursor).toBeNull()
  expect(mocks.receipt).toHaveBeenCalledTimes(2)
  expect(mocks.query.mock.calls.some(([, params]) => (params as unknown[]).includes(ownerRow.id))).toBe(true)
})

it("does not skip mixed-case IDs across same-timestamp search pages", async () => {
  const sameTimestamp = new Date("2026-09-17T00:00:00Z")
  const upper = { ...ownerRow, id: "Z-record", title: "Owner uppercase", updated_at: sameTimestamp }
  const lower = { ...ownerRow, id: "a-record", title: "Owner lowercase", updated_at: sameTimestamp }
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("session_user")) return { rows: [verifiedSession] }
    if (sql.includes("SELECT workspace_membership.policy_epoch")) return { rows: [{ role: "viewer", policy_epoch: "7" }] }
    return { rows: [lower, upper] }
  })

  const first = await searchAuthorizedDocumentsPage(scope, "owner", { pageSize: 1 })
  expect(first.hits.map(({ documentId }) => documentId)).toEqual([upper.id])
  expect(first.hasMore).toBe(true)
  expect(first.nextCursor).toBeTruthy()

  const second = await searchAuthorizedDocumentsPage(scope, "owner", { pageSize: 1, cursor: first.nextCursor! })
  expect(second.hits.map(({ documentId }) => documentId)).toEqual([lower.id])
  expect(second.hasMore).toBe(false)
  expect(second.nextCursor).toBeNull()
})

it("rejects a read cursor replayed as a search cursor before document disclosure", async () => {
  const secondRow = { ...ownerRow, id: "epic30-owner-private-2", updated_at: new Date("2026-09-16T00:00:00Z") }
  let documentReads = 0
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("session_user")) return { rows: [verifiedSession] }
    if (sql.includes("SELECT workspace_membership.policy_epoch")) return { rows: [{ role: "viewer", policy_epoch: "7" }] }
    documentReads += 1
    return { rows: documentReads <= 2 ? [ownerRow, secondRow] : [secondRow] }
  })
  const first = await readAuthorizedDocumentsPage(scope, { pageSize: 1 })
  const queryCountBeforeReplay = mocks.query.mock.calls.length
  await expect(searchAuthorizedDocumentsPage(scope, "owner", { pageSize: 1, cursor: first.nextCursor! }))
    .rejects.toThrow(/cursor authority refused/)
  expect(mocks.query.mock.calls.length).toBe(queryCountBeforeReplay)
})

it("rejects an explicitly empty page cursor before any restricted transaction", async () => {
  await expect(readAuthorizedDocumentsPage(scope, { pageSize: 1, cursor: "" }))
    .rejects.toThrow(/cursor refused/)
  expect(mocks.transaction).not.toHaveBeenCalled()
})

describe("production authorized read provider", () => {
  const productionReceiptWriter = { persist: mocks.receipt }

  function useProductionRows(): void {
    mocks.principal.mockResolvedValue(productionPrincipal)
    mocks.query.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes("brain_workspace_memberships")) return { rows: [{ role: "viewer", policy_epoch: "9" }] }
      if (sql.includes("COUNT(*)")) return { rows: [{ total: 2 }] }
      if (sql.includes("FROM brain_documents")) {
        const hasBoundary = params?.some((value) => value === productionRows[0].updated_at.toISOString())
        const rows = productionRows.map((row) => row.id === "z-record" ? { ...row, content: "[[a-record]]" } : row)
        return { rows: hasBoundary ? [rows[1]] : rows }
      }
      return { rows: [] }
    })
  }

  it("uses server-derived scope and an opaque keyset cursor", async () => {
    useProductionRows()
    const provider = new ProductionAuthorizedReadProvider(Buffer.alloc(32, 7), productionReceiptWriter)
    const first = await provider.readDocumentsPage({ pageSize: 1 })
    expect(first.documents.map(({ id }) => id)).toEqual(["z-record"])
    expect(first.hasMore).toBe(true)
    expect(first.nextCursor).toBeTruthy()
    expect(first.nextCursor).not.toContain("production")
    expect(first.nextCursor).not.toContain("clerk-session-production")
    expect(mocks.transaction).toHaveBeenCalledWith(productionScope, expect.any(Function))

    const second = await provider.readDocumentsPage({ pageSize: 1, cursor: first.nextCursor! })
    expect(second.documents.map(({ id }) => id)).toEqual(["a-record"])
    expect(second.hasMore).toBe(false)
    expect(second.nextCursor).toBeNull()
    expect(mocks.receipt).toHaveBeenCalledTimes(2)
    expect(mocks.receipt.mock.calls.every(([receipt]) => receipt.policyVersion === "epic30-production-v1")).toBe(true)
    expect(mocks.receipt.mock.calls[1][0].witnessHash).not.toBe(mocks.receipt.mock.calls[0][0].witnessHash)
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("brain_membership_approvals"))).toBe(true)
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("approval.policy_epoch = workspace_membership.policy_epoch"))).toBe(true)
  })

  it("binds the Ask snapshot to server authority and a verified receipt-chain witness", async () => {
    useProductionRows()
    const provider = new ProductionAuthorizedReadProvider(Buffer.alloc(32, 14), productionReceiptWriter)
    const result = await provider.readAuthorizedSnapshot(productionScope)
    expect(result.documents.map(({ id }) => id)).toEqual(["z-record", "a-record"])
    expect(result.authority).toEqual({
      tenantId: productionScope.tenantId,
      workspaceId: productionScope.workspaceId,
      principalId: productionScope.principalId,
      sessionId: productionPrincipal.sessionId,
      actorRole: "viewer",
      policyEpoch: 9,
      receiptWitnessHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      priorReceiptWitnessHash: null,
      decision: "authorized",
    })
    const chained = await provider.readAuthorizedSnapshot(productionScope, result.authority.receiptWitnessHash)
    expect(chained.authority.priorReceiptWitnessHash).toBe(result.authority.receiptWitnessHash)
    expect(chained.authority.receiptWitnessHash).toBe(createAuthorizedReadReceipt({
      scope: productionScope,
      sessionId: productionPrincipal.sessionId,
      actorRole: "viewer",
      policyEpoch: 9,
      documents: chained.documents,
      witnessKey: Buffer.alloc(32, 14),
      priorWitnessHash: result.authority.receiptWitnessHash,
      policyVersion: "epic30-production-v1",
    }).witnessHash)
    const transactionsBeforeMismatch = mocks.transaction.mock.calls.length
    await expect(provider.readAuthorizedSnapshot({ ...productionScope, principalId: "other" }))
      .rejects.toThrow(/Ask authority refused/)
    expect(mocks.transaction).toHaveBeenCalledTimes(transactionsBeforeMismatch)
  })

  it("searches and paginates only rows returned by the restricted transaction", async () => {
    useProductionRows()
    const provider = new ProductionAuthorizedReadProvider(Buffer.alloc(32, 8), productionReceiptWriter)
    const first = await provider.searchDocumentsPage("production", { pageSize: 1 })
    expect(first.total).toBe(2)
    expect(first.hits.map(({ documentId }) => documentId)).toEqual(["z-record"])
    expect(first.nextCursor).toBeTruthy()

    const second = await provider.searchDocumentsPage("production", { pageSize: 1, cursor: first.nextCursor! })
    expect(second.hits.map(({ documentId }) => documentId)).toEqual(["a-record"])
    expect(second.hasMore).toBe(false)
    expect(second.nextCursor).toBeNull()
    expect(JSON.stringify(first)).not.toContain("clerk-session-production")
  })

  it("escapes SQL wildcard characters so production search remains literal", async () => {
    useProductionRows()
    const provider = new ProductionAuthorizedReadProvider(Buffer.alloc(32, 12), productionReceiptWriter)
    await provider.searchDocumentsPage("%_", { pageSize: 1 })

    const searchCalls = mocks.query.mock.calls.filter(([sql]) => String(sql).includes("LIKE $3"))
    expect(searchCalls.length).toBeGreaterThan(0)
    expect(searchCalls.every(([, params]) => (params as readonly unknown[]).includes("%\\%\\_%"))).toBe(true)
    expect(searchCalls.every(([sql]) => String(sql).includes("ESCAPE E'\\\\'"))).toBe(true)
  })

  it.each([
    ["sink outage", async () => { throw new Error("protected backend detail") }],
    ["mismatched acknowledgement", async () => ({ receiptId: "wrong", witnessHash: "0".repeat(64) })],
  ])("fails closed before disclosure on %s", async (_label, persist) => {
    useProductionRows()
    const provider = new ProductionAuthorizedReadProvider(Buffer.alloc(32, 13), { persist })
    await expect(provider.readDocumentsPage({ pageSize: 1 })).rejects.toThrow()
  })

  it("rejects an operation-mismatched cursor before querying document rows", async () => {
    useProductionRows()
    const provider = new ProductionAuthorizedReadProvider(Buffer.alloc(32, 11), productionReceiptWriter)
    const first = await provider.readDocumentsPage({ pageSize: 1 })
    const documentQueriesBeforeReplay = mocks.query.mock.calls.filter(([sql]) => String(sql).includes("FROM brain_documents")).length
    await expect(provider.searchDocumentsPage("production", { pageSize: 1, cursor: first.nextCursor! }))
      .rejects.toThrow(/cursor authority refused/)
    expect(mocks.query.mock.calls.filter(([sql]) => String(sql).includes("FROM brain_documents")).length)
      .toBe(documentQueriesBeforeReplay)
  })

  it("derives links, citations, and derivatives only from the current authorized snapshot", async () => {
    useProductionRows()
    const provider = new ProductionAuthorizedReadProvider(Buffer.alloc(32, 9), productionReceiptWriter)
    await expect(provider.documentLinks("z-record")).resolves.toEqual({
      documentId: "z-record", title: "Production note",
      links: [{ documentId: "a-record", title: "Operations runbook" }], backlinks: [],
    })
    await expect(provider.citations(["z-record", "missing-record"])).resolves.toEqual([
      { documentId: "z-record", title: "Production note" },
    ])
    await expect(provider.derivativeSources(["z-record", "missing-record"])).resolves.toBeNull()
    const transactionsBeforeMalformedId = mocks.transaction.mock.calls.length
    await expect(provider.citations([" z-record "])).rejects.toThrow(/citation IDs refused/)
    expect(mocks.transaction).toHaveBeenCalledTimes(transactionsBeforeMalformedId)
  })

  it("fails closed without a server principal or a cursor key", async () => {
    mocks.principal.mockResolvedValue(null)
    const provider = new ProductionAuthorizedReadProvider(Buffer.alloc(32, 10), productionReceiptWriter)
    await expect(provider.readDocumentsPage()).rejects.toThrow(/authority refused/)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(() => new ProductionAuthorizedReadProvider(Buffer.alloc(16), productionReceiptWriter)).toThrow(/cursor key refused/)
  })
})
