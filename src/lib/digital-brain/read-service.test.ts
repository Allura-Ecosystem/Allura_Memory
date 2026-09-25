import { describe, expect, it, vi } from "vitest"

import { type DigitalBrainReadScope, epic30ReadTestOnly, readAuthorizedDocumentsInRestrictedTransaction } from "./read-service"

const OWNER_SCOPE: DigitalBrainReadScope = {
  tenantId: "allura-epic30-local",
  workspaceId: "workspace-owner",
  principalId: "owner-user",
}
const OWNER_ENVELOPE = epic30ReadTestOnly!.issueReadEnvelope(
  OWNER_SCOPE,
  { id: OWNER_SCOPE.principalId, groupId: OWNER_SCOPE.tenantId, workspaceId: OWNER_SCOPE.workspaceId,
    sessionId: "dev:owner-user", role: "viewer", email: "owner@example.invalid" },
  { role: "viewer", policy_epoch: "1" },
)

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "private-owner-note",
    group_id: OWNER_SCOPE.tenantId,
    workspace_id: OWNER_SCOPE.workspaceId,
    owner_id: OWNER_SCOPE.principalId,
    department_id: null,
    visibility: "private",
    title: "Owner note",
    content: "Synthetic owner-only content",
    updated_at: new Date("2026-09-17T00:00:00.000Z"),
    authorized_tenant: true,
    authorized_workspace: true,
    ...overrides,
  }
}

describe("readAuthorizedDocuments", () => {
  it("rejects a caller-forged envelope even if its fields look valid", async () => {
    const query = vi.fn(async () => ({ rows: [row()] }))
    const forged = { ...OWNER_SCOPE, sessionId: "forged", role: "viewer", policyEpoch: 1 }
    await expect(readAuthorizedDocumentsInRestrictedTransaction(forged as typeof OWNER_ENVELOPE, query)).resolves.toEqual([])
    expect(query).not.toHaveBeenCalled()
  })
  it.each([
    { sessionId: "" }, { role: "unknown" }, { policyEpoch: 0 }, { policyEpoch: Number.NaN },
  ])("refuses incomplete or stale read envelope before querying: %j", async patch => {
    const query = vi.fn(async () => ({ rows: [row()] }))
    await expect(readAuthorizedDocumentsInRestrictedTransaction({ ...OWNER_ENVELOPE, ...patch } as typeof OWNER_ENVELOPE, query)).resolves.toEqual([])
    expect(query).not.toHaveBeenCalled()
  })
  it.each([true, false, undefined, "true"])("uses strict database department boolean: %s", async authority => {
    const query = vi.fn(async () => ({ rows: [row({ visibility: "department", department_id: "operations", authorized_department: authority })] }))
    expect(await readAuthorizedDocumentsInRestrictedTransaction(OWNER_ENVELOPE, query)).toHaveLength(authority === true ? 1 : 0)
  })
  it("denies a removed tenant member even with active department authority", async () => {
    const query = vi.fn(async () => ({ rows: [row({
      visibility: "department", department_id: "operations",
      authorized_department: true, authorized_tenant: false,
    })] }))
    await expect(readAuthorizedDocumentsInRestrictedTransaction(OWNER_ENVELOPE, query)).resolves.toEqual([])
  })

  it.each([false, undefined, "true"])('denies without current independent workspace membership: %s', async authority => {
    const query = vi.fn(async () => ({ rows: [row({ authorized_workspace: authority })] }))
    await expect(readAuthorizedDocumentsInRestrictedTransaction(OWNER_ENVELOPE, query)).resolves.toEqual([])
  })

  it('denies department reads when workspace membership is revoked', async () => {
    const query = vi.fn(async () => ({ rows: [row({
      visibility: 'department', department_id: 'operations', authorized_department: true,
      authorized_workspace: false,
    })] }))
    await expect(readAuthorizedDocumentsInRestrictedTransaction(OWNER_ENVELOPE, query)).resolves.toEqual([])
  })

  it("denies revoked department authority while tenant membership remains active", async () => {
    const query = vi.fn(async () => ({ rows: [row({
      visibility: "department", department_id: "operations",
      authorized_department: false, authorized_tenant: true,
    })] }))
    await expect(readAuthorizedDocumentsInRestrictedTransaction(OWNER_ENVELOPE, query)).resolves.toEqual([])
  })

  it.each([false, undefined, "true"])("denies private ownership without verified tenant membership: %s", async (authority) => {
    const query = vi.fn(async () => ({ rows: [row({ authorized_tenant: authority })] }))
    await expect(readAuthorizedDocumentsInRestrictedTransaction(OWNER_ENVELOPE, query)).resolves.toEqual([])
  })

  it("binds tenant, workspace, and principal as server-derived query parameters", async () => {
    const query = vi.fn(async () => ({ rows: [row()] }))

    const documents = await readAuthorizedDocumentsInRestrictedTransaction(OWNER_ENVELOPE, query)

    expect(documents).toHaveLength(1)
    expect(query).toHaveBeenCalledOnce()
    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(params).toEqual([
      OWNER_SCOPE.tenantId,
      OWNER_SCOPE.workspaceId,
      OWNER_SCOPE.principalId,
      OWNER_ENVELOPE.policyEpoch,
    ])
  })

  it("does not treat an admin role as private-content authority", async () => {
    const query = vi.fn(async () => ({
      rows: [row({ owner_id: "other-user", title: "Other user private note" })],
    }))

    const documents = await readAuthorizedDocumentsInRestrictedTransaction(
      { ...OWNER_ENVELOPE, principalId: "admin-user", role: "admin", roles: ["admin"] },
      query,
    )

    expect(documents).toEqual([])
  })

  it("returns department content only with a current matching membership", async () => {
    const departmentRow = row({
      id: "department-runbook",
      owner_id: "department-curator",
      department_id: "operations",
      visibility: "department",
      authorized_department: true,
      title: "Operations runbook",
    })
    const query = vi.fn(async () => ({ rows: [departmentRow] }))

    await expect(
      readAuthorizedDocumentsInRestrictedTransaction(OWNER_ENVELOPE, query),
    ).resolves.toHaveLength(1)
    query.mockResolvedValueOnce({ rows: [{ ...departmentRow, authorized_department: false }] })
    await expect(
      readAuthorizedDocumentsInRestrictedTransaction(OWNER_ENVELOPE, query),
    ).resolves.toEqual([])
  })

  it("fails closed when the database returns malformed or cross-scope rows", async () => {
    const query = vi.fn(async () => ({
      rows: [
        row({ id: "cross-tenant", group_id: "allura-other" }),
        row({ id: "cross-workspace", workspace_id: "workspace-other" }),
        row({ id: "unknown-policy", visibility: "organization" }),
      ],
    }))

    await expect(readAuthorizedDocumentsInRestrictedTransaction(OWNER_ENVELOPE, query)).resolves.toEqual([])
  })

  it("uses one bytewise ID order for same-timestamp keyset rows and SQL boundaries", async () => {
    const sameTimestamp = new Date("2026-09-17T00:00:00.000Z")
    const query = vi.fn(async () => ({ rows: [
      row({ id: "a-record", updated_at: sameTimestamp }),
      row({ id: "Z-record", updated_at: sameTimestamp }),
      row({ id: "é-record", updated_at: sameTimestamp }),
    ] }))
    const claims = {
      version: 1 as const,
      operation: "read_documents" as const,
      tenantId: OWNER_SCOPE.tenantId,
      workspaceId: OWNER_SCOPE.workspaceId,
      principalId: OWNER_SCOPE.principalId,
      sessionHash: "0".repeat(64), actorRole: "viewer" as const, policyEpoch: 1, pageSize: 3,
      boundary: { updatedAt: sameTimestamp.toISOString(), id: "A-record" },
      witnessHash: "1".repeat(64), queryHash: null, issuedAt: sameTimestamp.toISOString(),
    }

    const documents = await readAuthorizedDocumentsInRestrictedTransaction(
      OWNER_ENVELOPE, query, { pageSize: 3, claims },
    )

    expect(documents.map(({ id }) => id)).toEqual(["Z-record", "a-record", "é-record"])
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('document.id COLLATE "C"')
    expect(sql).toContain('(document.id COLLATE "C") > ($6::text COLLATE "C")')
    expect(params).toEqual([
      OWNER_SCOPE.tenantId, OWNER_SCOPE.workspaceId, OWNER_SCOPE.principalId, 1,
      sameTimestamp.toISOString(), "A-record", 4,
    ])
  })
})
