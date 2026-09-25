import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { startOwnedProcess } from "../../scripts/epic30/owned-process"
import { launchSyntheticDemo } from "../../scripts/epic30/demo"
import { provisionSyntheticDatabase } from "../../scripts/epic30/synthetic-database"
import { verifySyntheticSession } from "@/lib/digital-brain/local-confinement"
import { readFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { epic30ReadTestOnly, readAuthorizedDocumentsInRestrictedTransaction } from "@/lib/digital-brain/read-service"
import { createAuthorizedReadReceipt } from "@/lib/digital-brain/read-receipt"
import { persistSyntheticReadReceipt } from "@/lib/digital-brain/read-receipt-writer"
import { closePool } from "@/lib/postgres/connection"

const GROUP = "allura-epic30-local"
const WORKSPACE = "epic30-local-workspace"
const fixturePath = path.resolve(process.cwd(), "docker/epic30-postgres/99-epic30-synthetic-fixtures.sql")
const manifestPath = path.resolve(process.cwd(), "docker/epic30-postgres/epic30-synthetic-visibility-manifest.json")
const describeLive = describe

interface VisibilityManifest {
  dataset: string
  groupId: string
  workspaceId: string
  expectedDocumentCount: number
  expectedMembershipCount: number
  expectedWorkspaceMembershipCount: number
  principals: Record<string, string[]>
  sentinels: Record<string, {
    id: string
    tenantId: string
    workspaceId: string
    ownerId: string
  }>
  scopeScenarios: Array<{
    name: string
    principalId: string
    tenantId: string
    workspaceId: string
    expectedDocumentIds: string[]
  }>
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as VisibilityManifest

describeLive("Epic 30 restricted-role synthetic read isolation", () => {
  let database: Awaited<ReturnType<typeof provisionSyntheticDatabase>>
  let databaseName: string
  let ownerPool: Pool
  let appPool: Pool

  beforeAll(async () => {
    database = await provisionSyntheticDatabase()
    databaseName = database.databaseName
    ownerPool = database.ownerPool
    appPool = database.appPool
  }, 90_000)

  afterAll(async () => { if (database) await database.close(true) }, 30_000)

  async function readAs(principalId: string, workspaceId = WORKSPACE, tenantId = GROUP, pool = appPool) {
    const scope = { tenantId, workspaceId, principalId }
    const role = principalId === "admin-user" ? "admin" as const : "viewer" as const
    const authority = epic30ReadTestOnly!.issueReadEnvelope(scope,
      { id: principalId, groupId: tenantId, workspaceId, role,
        sessionId: `synthetic-e2e:${principalId}`, email: "synthetic@example.invalid" },
      { role, policy_epoch: "1" })
    return withTenantTransaction(
      scope,
      (client) => readAuthorizedDocumentsInRestrictedTransaction(authority, client.query.bind(client)),
      pool,
    )
  }

  it("loads the complete deterministic synthetic dataset declared by the manifest", async () => {
    expect(manifest.dataset).toBe("EPIC 30 SYNTHETIC TEST DATA ONLY")
    expect(manifest.groupId).toBe(GROUP)
    expect(manifest.workspaceId).toBe(WORKSPACE)

    const documents = await ownerPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM brain_documents WHERE id LIKE 'epic30-%'",
    )
    const memberships = await ownerPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM memberships WHERE group_id IN ($1, 'allura-epic30-sentinel')",
      [GROUP],
    )
    const workspaceMemberships = await ownerPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM brain_workspace_memberships WHERE group_id IN ($1, 'allura-epic30-sentinel')",
      [GROUP],
    )

    expect(Number(documents.rows[0]?.count)).toBe(manifest.expectedDocumentCount)
    expect(Number(memberships.rows[0]?.count)).toBe(manifest.expectedMembershipCount)
    expect(Number(workspaceMemberships.rows[0]?.count)).toBe(manifest.expectedWorkspaceMembershipCount)
  })

  it("keeps the document reader SELECT-only and commits an immutable content-free receipt via a separate role", async () => {
    await expect(appPool.query("INSERT INTO epic30_local.read_receipts DEFAULT VALUES")).rejects.toMatchObject({ code: "42501" })
    await expect(database.receiptPool.query("SELECT id FROM brain_documents LIMIT 1")).rejects.toMatchObject({ code: "42501" })
    await expect(database.receiptPool.query("SELECT * FROM epic30_local.read_receipts LIMIT 1")).rejects.toMatchObject({ code: "42501" })

    const sessionId = "synthetic-e2e-receipt-session"
    const receipt = createAuthorizedReadReceipt({
      scope: { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "owner-user" },
      sessionId, actorRole: "viewer", policyEpoch: 1, documents: [],
      witnessKey: Buffer.from(database.appEnvironment.ALLURA_EPIC30_RECEIPT_KEY, "base64url"),
    })
    const old = new Map<string, string | undefined>()
    const injected = { ...database.appEnvironment, NODE_ENV: "test", ALLURA_EPIC30_LOCAL_DB: "enabled" }
    for (const [key, value] of Object.entries(injected)) { old.set(key, process.env[key]); process.env[key] = value }
    try {
      await expect(persistSyntheticReadReceipt(receipt)).resolves.toEqual({
        receiptId: receipt.receiptId, witnessHash: receipt.witnessHash,
      })
    } finally {
      await closePool()
      for (const [key, value] of old) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    }
    const stored = await ownerPool.query("SELECT * FROM epic30_local.read_receipts WHERE receipt_id = $1", [receipt.receiptId])
    expect(stored.rows).toHaveLength(1)
    expect(stored.rows[0].witness_hash).toBe(receipt.witnessHash)
    expect(JSON.stringify(stored.rows[0])).not.toContain(sessionId)
    await expect(ownerPool.query("UPDATE epic30_local.read_receipts SET reason_code = 'changed' WHERE receipt_id = $1", [receipt.receiptId])).rejects.toThrow()
  })

  it.each([null, "", "   "])("rejects malformed department ID %s at the database boundary", async departmentId => {
    await expect(ownerPool.query(`INSERT INTO brain_documents
      (id, group_id, workspace_id, owner_id, department_id, visibility, title, content)
      VALUES ('invalid-department', $1, $2, 'owner-user', $3, 'department', 'Invalid', 'SYNTHETIC TEST DATA: invalid')`,
    [GROUP, WORKSPACE, departmentId])).rejects.toMatchObject({ code: "23514" })
  })

  it.each(Object.entries(manifest.principals))(
    "discloses only manifest-authorized documents to %s",
    async (principalId, expectedIds) => {
    const documents = await readAs(principalId)
      expect(documents.map(({ id }) => id).sort()).toEqual([...expectedIds].sort())
    },
  )

  it.each(manifest.scopeScenarios)("enforces manifest boundary scenario: $name", async (scenario) => {
    const documents = await readAs(scenario.principalId, scenario.workspaceId, scenario.tenantId)
    expect(documents.map(({ id }) => id).sort()).toEqual([...scenario.expectedDocumentIds].sort())
  })

  async function snapshot() {
    const result = await ownerPool.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM brain_documents d) AS documents,
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY group_id,user_id) FROM memberships m) AS memberships,
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY group_id,workspace_id,user_id) FROM brain_workspace_memberships m) AS workspaces,
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY group_id,workspace_id,department_id,user_id) FROM brain_department_memberships m) AS departments`)
    return result.rows
  }

  it("checks actual session, exact receipt and dataset, rejecting tampered content", async () => {
    await expect(verifySyntheticSession(appPool.query.bind(appPool), database.runId)).resolves.toBeUndefined()
    await expect(verifySyntheticSession(ownerPool.query.bind(ownerPool), database.runId)).rejects.toThrow(/Synthetic/)
    await expect(verifySyntheticSession(appPool.query.bind(appPool), "0".repeat(32))).rejects.toThrow(/Synthetic/)
    await ownerPool.query("BEGIN")
    await ownerPool.query("UPDATE brain_documents SET content='not the sealed synthetic content' WHERE id='epic30-owner-private'")
    // Commit the reversible test edit so the restricted session actually observes it.
    await ownerPool.query("COMMIT")
    try {
      await expect(verifySyntheticSession(appPool.query.bind(appPool), database.runId)).rejects.toThrow(/Synthetic/)
    } finally { await ownerPool.query(readFileSync(fixturePath,"utf8")) }
    await expect(verifySyntheticSession(appPool.query.bind(appPool), database.runId)).resolves.toBeUndefined()
  })

  it("rejects fixture replay without its ownership receipt and rolls back", async () => {
    const before = await snapshot()
    const receipt = await ownerPool.query("DELETE FROM epic30_local.ownership RETURNING *")
    try {
      await expect(ownerPool.query(readFileSync(fixturePath,"utf8"))).rejects.toThrow(/ownership receipt missing/)
      await ownerPool.query("ROLLBACK")
      expect(await snapshot()).toEqual(before)
    } finally {
      const row = receipt.rows[0]
      await ownerPool.query("INSERT INTO epic30_local.ownership VALUES ($1,$2,$3,$4)",[row.run_id,row.database_name,row.provisioner,JSON.stringify(row.document_snapshot)])
    }
  })

  it("explicitly converges revoked synthetic memberships and exact fixture replay", async () => {
    const before = await snapshot()
    await ownerPool.query("UPDATE memberships SET removed_at=now() WHERE user_id='owner-user'")
    await ownerPool.query("UPDATE brain_workspace_memberships SET revoked_at=now(), policy_epoch=2 WHERE user_id='owner-user'")
    await ownerPool.query("UPDATE brain_department_memberships SET revoked_at=now() WHERE user_id='owner-user'")
    await ownerPool.query(readFileSync(fixturePath,"utf8"))
    expect(await snapshot()).toEqual(before)
  })

  it("reapplies cleanly but rejects a conflicting synthetic document authority", async () => {
    const fixture = readFileSync(fixturePath, "utf8")
    await expect(ownerPool.query(fixture)).resolves.toBeDefined()

    const sentinel = manifest.sentinels.crossWorkspace
    await ownerPool.query("UPDATE brain_documents SET owner_id = 'conflicting-owner' WHERE id = $1", [sentinel.id])
    await ownerPool.query("UPDATE memberships SET removed_at=now() WHERE user_id='owner-user'")
    const beforeConflictReplay = await snapshot()
    try {
      await expect(ownerPool.query(fixture)).rejects.toThrow(/synthetic document scope conflicts/i)
      await ownerPool.query("ROLLBACK")
      expect(await snapshot()).toEqual(beforeConflictReplay)
    } finally {
      await ownerPool.query("UPDATE brain_documents SET owner_id = $1 WHERE id = $2", [sentinel.ownerId, sentinel.id])
      await ownerPool.query(fixture)
    }
  })

  async function rawOwnerIds(pool = appPool): Promise<string[]> {
    return withTenantTransaction(
      { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "owner-user" },
      async (client) => (await client.query<{ id: string }>("SELECT id FROM brain_documents ORDER BY id")).rows.map(({ id }) => id),
      pool,
    )
  }

  async function restrictedBackendPid(pool = appPool): Promise<number> {
    return withTenantTransaction(
      { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "owner-user" },
      async (client) => Number((await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid),
      pool,
    )
  }

  it("denies tenant removal while department membership remains active, including raw RLS", async () => {
    expect((await readAs("owner-user")).map(({ id }) => id).sort()).toEqual([...manifest.principals["owner-user"]].sort())
    await ownerPool.query("UPDATE memberships SET removed_at = now() WHERE group_id = $1 AND user_id = 'owner-user'", [GROUP])
    try {
      const department = await ownerPool.query("SELECT revoked_at FROM brain_department_memberships WHERE group_id = $1 AND workspace_id = $2 AND user_id = 'owner-user'", [GROUP, WORKSPACE])
      expect(department.rows).toEqual([{ revoked_at: null }])
      await expect(readAs("owner-user")).resolves.toEqual([])
      await expect(rawOwnerIds()).resolves.toEqual([])
    } finally {
      await ownerPool.query("UPDATE memberships SET removed_at = NULL WHERE group_id = $1 AND user_id = 'owner-user'", [GROUP])
    }
  })

  it("revokes department access independently while preserving active tenant private ownership", async () => {
    await ownerPool.query("UPDATE brain_department_memberships SET revoked_at = now() WHERE group_id = $1 AND workspace_id = $2 AND user_id = 'owner-user'", [GROUP, WORKSPACE])
    try {
      const tenant = await ownerPool.query("SELECT removed_at FROM memberships WHERE group_id = $1 AND user_id = 'owner-user'", [GROUP])
      expect(tenant.rows).toEqual([{ removed_at: null }])
      const privateIds = ["epic30-owner-private", "epic30-owner-private-planning"]
      expect((await readAs("owner-user")).map(({ id }) => id).sort()).toEqual(privateIds)
      await expect(rawOwnerIds()).resolves.toEqual(privateIds)
    } finally {
      await ownerPool.query("UPDATE brain_department_memberships SET revoked_at = NULL WHERE group_id = $1 AND workspace_id = $2 AND user_id = 'owner-user'", [GROUP, WORKSPACE])
    }
  })

  it("revokes independent workspace membership for both private and department reads", async () => {
    await ownerPool.query("UPDATE brain_workspace_memberships SET revoked_at=now(), policy_epoch=policy_epoch+1 WHERE group_id=$1 AND workspace_id=$2 AND user_id='owner-user'", [GROUP, WORKSPACE])
    try {
      const tenant = await ownerPool.query("SELECT removed_at FROM memberships WHERE group_id=$1 AND user_id='owner-user'", [GROUP])
      const department = await ownerPool.query("SELECT revoked_at FROM brain_department_memberships WHERE group_id=$1 AND workspace_id=$2 AND user_id='owner-user'", [GROUP, WORKSPACE])
      expect(tenant.rows).toEqual([{ removed_at: null }])
      expect(department.rows).toEqual([{ revoked_at: null }])
      await expect(readAs("owner-user")).resolves.toEqual([])
      await expect(rawOwnerIds()).resolves.toEqual([])
    } finally {
      await ownerPool.query("UPDATE brain_workspace_memberships SET revoked_at=NULL, policy_epoch=1 WHERE group_id=$1 AND workspace_id=$2 AND user_id='owner-user'", [GROUP, WORKSPACE])
    }
  })

  it("measures workspace revocation on a reused and fresh restricted connection", async () => {
    expect((await readAs("owner-user")).map(({ id }) => id).sort()).toEqual([...manifest.principals["owner-user"]].sort())
    const reusedBefore = await restrictedBackendPid()
    const startedAt = performance.now()
    await ownerPool.query("UPDATE brain_workspace_memberships SET revoked_at=now(), policy_epoch=policy_epoch+1 WHERE group_id=$1 AND workspace_id=$2 AND user_id='owner-user'", [GROUP, WORKSPACE])
    const reusedDocuments = await readAs("owner-user")
    const reusedRawIds = await rawOwnerIds()
    const reusedAfter = await restrictedBackendPid()
    const reusedElapsedMs = performance.now() - startedAt
    const freshPool = new Pool({
      host: database.appEnvironment.POSTGRES_HOST,
      port: Number(database.appEnvironment.POSTGRES_PORT),
      database: databaseName,
      user: database.appEnvironment.POSTGRES_APP_USER,
      password: database.appEnvironment.POSTGRES_APP_PASSWORD,
      max: 1,
      query_timeout: 15_000,
    })
    try {
      const freshDocuments = await readAs("owner-user", WORKSPACE, GROUP, freshPool)
      const freshRawIds = await rawOwnerIds(freshPool)
      const freshElapsedMs = performance.now() - startedAt
      expect(reusedAfter).toBe(reusedBefore)
      expect(reusedDocuments).toEqual([])
      expect(reusedRawIds).toEqual([])
      expect(freshDocuments).toEqual([])
      expect(freshRawIds).toEqual([])
      expect(reusedElapsedMs).toBeLessThanOrEqual(60_000)
      expect(freshElapsedMs).toBeLessThanOrEqual(60_000)
      console.info("Epic30 measured workspace revocation", JSON.stringify({ reusedBackendPid: reusedAfter, reusedElapsedMs, freshElapsedMs }))
    } finally {
      await freshPool.end()
      await ownerPool.query("UPDATE brain_workspace_memberships SET revoked_at=NULL, policy_epoch=1 WHERE group_id=$1 AND workspace_id=$2 AND user_id='owner-user'", [GROUP, WORKSPACE])
    }
  })

  it("denies missing workspace membership even while tenant and department records stay current", async () => {
    await ownerPool.query("DELETE FROM brain_workspace_memberships WHERE group_id=$1 AND workspace_id=$2 AND user_id='owner-user'", [GROUP, WORKSPACE])
    try {
      await expect(readAs("owner-user")).resolves.toEqual([])
      await expect(rawOwnerIds()).resolves.toEqual([])
    } finally {
      await ownerPool.query(readFileSync(fixturePath, "utf8"))
    }
  })

  it("denies a stale read envelope after a membership epoch change without revocation", async () => {
    await ownerPool.query("UPDATE brain_workspace_memberships SET policy_epoch=2 WHERE group_id=$1 AND workspace_id=$2 AND user_id='owner-user'", [GROUP, WORKSPACE])
    try {
      const current = await ownerPool.query("SELECT revoked_at FROM brain_workspace_memberships WHERE group_id=$1 AND workspace_id=$2 AND user_id='owner-user'", [GROUP, WORKSPACE])
      expect(current.rows).toEqual([{ revoked_at: null }])
      await expect(readAs("owner-user")).resolves.toEqual([])
      await expect(rawOwnerIds()).resolves.not.toEqual([])
    } finally {
      await ownerPool.query("UPDATE brain_workspace_memberships SET policy_epoch=1 WHERE group_id=$1 AND workspace_id=$2 AND user_id='owner-user'", [GROUP, WORKSPACE])
    }
  })

  it("commits only receipt-bound verified workspace membership transitions", async () => {
    const actorApprovalId = randomUUID()
    const grantApprovalId = randomUUID()
    const revokeApprovalId = randomUUID()
    const grantReceiptId = randomUUID()
    const revokeReceiptId = randomUUID()
    const subject = "governed-member"
    try {
      await ownerPool.query("INSERT INTO memberships (group_id,user_id,email,role,created_at,updated_at,removed_at) VALUES ($1,$2,$3,'viewer',now(),now(),NULL)", [GROUP, subject, "governed-member@example.invalid"])
      await ownerPool.query(`INSERT INTO brain_membership_approvals
        (approval_id,group_id,workspace_id,subject_user_id,approver_id,approver_role,action,provenance_ref,policy_epoch,verified_at,consumed_at)
        VALUES ($1,$2,$3,'admin-user','trusted-control-plane','workspace_membership_admin','grant','seed-admin',1,now(),now())`, [actorApprovalId, GROUP, WORKSPACE])
      await ownerPool.query("UPDATE brain_workspace_memberships SET approval_id=$1 WHERE group_id=$2 AND workspace_id=$3 AND user_id='admin-user'", [actorApprovalId, GROUP, WORKSPACE])
      await ownerPool.query(`INSERT INTO brain_membership_approvals
        (approval_id,group_id,workspace_id,subject_user_id,approver_id,approver_role,action,provenance_ref,policy_epoch,verified_at)
        VALUES ($1,$2,$3,$4,'trusted-control-plane','workspace_membership_admin','grant','grant-governed-member',1,now())`, [grantApprovalId, GROUP, WORKSPACE, subject])
      await ownerPool.query(`INSERT INTO brain_membership_receipts
        (receipt_id,action,decision,group_id,workspace_id,actor_id,subject_user_id,approval_id,authority_epoch,target_epoch,witness_hash)
        VALUES ($1,'membership_grant','allow_candidate',$2,$3,'admin-user',$4,$5,1,1,repeat('a',64))`, [grantReceiptId, GROUP, WORKSPACE, subject, grantApprovalId])
      const grant = await withTenantTransaction(
        { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "admin-user" },
        client => client.query<{ user_id: string; policy_epoch: string; revoked_at: string | null }>("SELECT user_id,policy_epoch,revoked_at FROM app.commit_brain_workspace_membership($1::uuid,'grant',1,0,1)", [grantApprovalId]),
        appPool,
      )
      expect(grant.rows).toEqual([{ user_id: subject, policy_epoch: "1", revoked_at: null }])
      await expect(withTenantTransaction(
        { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "admin-user" },
        client => client.query("SELECT * FROM app.commit_brain_workspace_membership($1::uuid,'grant',1,0,1)", [grantApprovalId]),
        appPool,
      )).rejects.toMatchObject({ code: "42501" })

      await ownerPool.query(`INSERT INTO brain_membership_approvals
        (approval_id,group_id,workspace_id,subject_user_id,approver_id,approver_role,action,provenance_ref,policy_epoch,verified_at)
        VALUES ($1,$2,$3,$4,'trusted-control-plane','workspace_membership_admin','revoke','revoke-governed-member',1,now())`, [revokeApprovalId, GROUP, WORKSPACE, subject])
      await ownerPool.query(`INSERT INTO brain_membership_receipts
        (receipt_id,action,decision,group_id,workspace_id,actor_id,subject_user_id,approval_id,authority_epoch,target_epoch,witness_hash)
        VALUES ($1,'membership_revoke','allow_candidate',$2,$3,'admin-user',$4,$5,1,2,repeat('b',64))`, [revokeReceiptId, GROUP, WORKSPACE, subject, revokeApprovalId])
      const revoke = await withTenantTransaction(
        { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "admin-user" },
        client => client.query<{ user_id: string; policy_epoch: string; revoked_at: string | null }>("SELECT user_id,policy_epoch,revoked_at FROM app.commit_brain_workspace_membership($1::uuid,'revoke',1,1,2)", [revokeApprovalId]),
        appPool,
      )
      expect(revoke.rows).toHaveLength(1)
      expect(revoke.rows[0]).toMatchObject({ user_id: subject, policy_epoch: "2" })
      expect(revoke.rows[0]?.revoked_at).not.toBeNull()
      const approvals = await ownerPool.query("SELECT approval_id,consumed_at FROM brain_membership_approvals WHERE approval_id IN ($1,$2) ORDER BY approval_id", [grantApprovalId, revokeApprovalId])
      expect(approvals.rows).toHaveLength(2)
      expect(approvals.rows.every(row => row.consumed_at !== null)).toBe(true)
    } finally {
      await ownerPool.query("DELETE FROM brain_membership_receipts WHERE receipt_id IN ($1,$2)", [grantReceiptId, revokeReceiptId])
      await ownerPool.query("DELETE FROM brain_workspace_memberships WHERE group_id=$1 AND workspace_id=$2 AND user_id=$3", [GROUP, WORKSPACE, subject])
      await ownerPool.query("DELETE FROM brain_membership_approvals WHERE approval_id IN ($1,$2,$3)", [actorApprovalId, grantApprovalId, revokeApprovalId])
      await ownerPool.query("UPDATE brain_workspace_memberships SET approval_id=NULL WHERE group_id=$1 AND workspace_id=$2 AND user_id='admin-user'", [GROUP, WORKSPACE])
      await ownerPool.query("DELETE FROM memberships WHERE group_id=$1 AND user_id=$2", [GROUP, subject])
    }
  })

  it("records production-candidate read receipts only through current scoped authority", async () => {
    const actorApprovalId = randomUUID()
    const receiptId = randomUUID()
    const sessionHash = "a".repeat(64)
    const witnessHash = "b".repeat(64)
    try {
      await ownerPool.query(`INSERT INTO brain_membership_approvals
        (approval_id,group_id,workspace_id,subject_user_id,approver_id,approver_role,action,provenance_ref,policy_epoch,verified_at,consumed_at)
        VALUES ($1,$2,$3,'admin-user','trusted-control-plane','workspace_membership_admin','grant','seed-read-receipt-admin',1,now(),now())`, [actorApprovalId, GROUP, WORKSPACE])
      await ownerPool.query("UPDATE brain_workspace_memberships SET approval_id=$1 WHERE group_id=$2 AND workspace_id=$3 AND user_id='admin-user'", [actorApprovalId, GROUP, WORKSPACE])
      await expect(appPool.query("INSERT INTO brain_read_receipts DEFAULT VALUES")).rejects.toMatchObject({ code: "42501" })
      const stored = await withTenantTransaction(
        { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "admin-user" },
        client => client.query<{ receipt_id: string; witness_hash: string }>("SELECT receipt_id,witness_hash FROM app.record_brain_read_receipt($1::uuid,'read_documents','admin',1,$2,$3,NULL,now())", [receiptId, sessionHash, witnessHash]),
        appPool,
      )
      expect(stored.rows).toEqual([{ receipt_id: receiptId, witness_hash: witnessHash }])
      await expect(withTenantTransaction(
        { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "admin-user" },
        client => client.query("SELECT * FROM app.record_brain_read_receipt($1::uuid,'read_documents','viewer',1,$2,$3,NULL,now())", [randomUUID(), sessionHash, "c".repeat(64)]),
        appPool,
      )).rejects.toMatchObject({ code: "42501" })
      const receipt = await ownerPool.query("SELECT group_id,workspace_id,principal_id,actor_role,session_hash,witness_hash,query_hash FROM brain_read_receipts WHERE receipt_id=$1", [receiptId])
      expect(receipt.rows).toEqual([{ group_id: GROUP, workspace_id: WORKSPACE, principal_id: "admin-user", actor_role: "admin", session_hash: sessionHash, witness_hash: witnessHash, query_hash: null }])
      await expect(ownerPool.query("UPDATE brain_read_receipts SET witness_hash='d' WHERE receipt_id=$1", [receiptId])).rejects.toMatchObject({ code: "42501" })
    } finally {
      await ownerPool.query("UPDATE brain_workspace_memberships SET approval_id=NULL WHERE group_id=$1 AND workspace_id=$2 AND user_id='admin-user'", [GROUP, WORKSPACE])
      await ownerPool.query("DELETE FROM brain_membership_approvals WHERE approval_id=$1", [actorApprovalId])
    }
  })

  it("commits a dual-approved channel invitation and receipt-bound contractor message", async () => {
    const adminMembershipApprovalId = randomUUID()
    const contractorMembershipApprovalId = randomUUID()
    const ownerApprovalId = randomUUID()
    const membershipAdminApprovalId = randomUUID()
    const invitationReceiptId = randomUUID()
    const messageReceiptId = randomUUID()
    const messageId = randomUUID()
    const projectId = "project-governed"
    const channelId = "channel-ops"
    try {
      for (const [approvalId, subject, ref] of [[adminMembershipApprovalId, "admin-user", "seed-messaging-admin"], [contractorMembershipApprovalId, "contractor-user", "seed-messaging-contractor"]] as const) {
        await ownerPool.query(`INSERT INTO brain_membership_approvals
          (approval_id,group_id,workspace_id,subject_user_id,approver_id,approver_role,action,provenance_ref,policy_epoch,verified_at,consumed_at)
          VALUES ($1,$2,$3,$4,'trusted-control-plane','workspace_membership_admin','grant',$5,1,now(),now())`, [approvalId, GROUP, WORKSPACE, subject, ref])
        await ownerPool.query("UPDATE brain_workspace_memberships SET approval_id=$1 WHERE group_id=$2 AND workspace_id=$3 AND user_id=$4", [approvalId, GROUP, WORKSPACE, subject])
      }
      await ownerPool.query(`INSERT INTO brain_messaging_approvals
        (approval_id,group_id,workspace_id,project_id,channel_id,invitee_id,approver_id,approver_role,provenance_ref,verification_source,policy_epoch,verified_at)
        VALUES
        ($1,$2,$3,$4,$5,'contractor-user','project-owner','project_owner','owner-approved','trusted_approval_adapter',1,now()),
        ($6,$2,$3,$4,$5,'contractor-user','membership-admin','workspace_membership_admin','admin-approved','trusted_approval_adapter',1,now())`,
      [ownerApprovalId, GROUP, WORKSPACE, projectId, channelId, membershipAdminApprovalId])
      await expect(appPool.query("INSERT INTO brain_messaging_receipts DEFAULT VALUES")).rejects.toMatchObject({ code: "42501" })
      await withTenantTransaction(
        { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "admin-user" },
        async client => {
          const receipt = await client.query("SELECT * FROM app.record_brain_messaging_receipt($1::uuid,'invite_channel',$2,1,$3)", [invitationReceiptId, `${projectId}:${channelId}:contractor-user`, "a".repeat(64)])
          expect(receipt.rows).toHaveLength(1)
          const invitation = await client.query<{ committed: boolean }>("SELECT app.commit_brain_channel_invitation($1::uuid,$2::uuid,$3,$4,$5,1) AS committed", [ownerApprovalId, membershipAdminApprovalId, projectId, channelId, "contractor-user"])
          expect(invitation.rows).toEqual([{ committed: true }])
        }, appPool,
      )
      await expect(withTenantTransaction(
        { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "admin-user" },
        client => client.query("SELECT app.commit_brain_channel_invitation($1::uuid,$2::uuid,$3,$4,$5,1)", [ownerApprovalId, membershipAdminApprovalId, projectId, channelId, "contractor-user"]),
        appPool,
      )).rejects.toMatchObject({ code: "42501" })
      await withTenantTransaction(
        { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "contractor-user" },
        async client => {
          const receipt = await client.query("SELECT * FROM app.record_brain_messaging_receipt($1::uuid,'send_message',$2,1,$3)", [messageReceiptId, messageId, "b".repeat(64)])
          expect(receipt.rows).toHaveLength(1)
          const message = await client.query<{ committed: boolean }>("SELECT app.commit_brain_restricted_message($1::uuid,$2,$3,NULL,$4,1) AS committed", [messageId, projectId, channelId, "Approved test message"])
          expect(message.rows).toEqual([{ committed: true }])
        }, appPool,
      )
      const stored = await ownerPool.query("SELECT invitation.policy_epoch, message.sender_id, message.channel_id, message.recipient_id, message.body FROM brain_channel_invitations invitation JOIN brain_restricted_messages message ON message.project_id=invitation.project_id AND message.channel_id=invitation.channel_id WHERE invitation.group_id=$1 AND invitation.workspace_id=$2 AND message.message_id=$3", [GROUP, WORKSPACE, messageId])
      expect(stored.rows).toEqual([{ policy_epoch: "1", sender_id: "contractor-user", channel_id: channelId, recipient_id: null, body: "Approved test message" }])
      await expect(ownerPool.query("UPDATE brain_messaging_receipts SET witness_hash='c' WHERE receipt_id=$1", [invitationReceiptId])).rejects.toMatchObject({ code: "42501" })
    } finally {
      await ownerPool.query("DELETE FROM brain_restricted_messages WHERE message_id=$1", [messageId])
      await ownerPool.query("DELETE FROM brain_channel_invitations WHERE group_id=$1 AND workspace_id=$2 AND project_id=$3 AND channel_id=$4", [GROUP, WORKSPACE, projectId, channelId])
      await ownerPool.query("DELETE FROM brain_messaging_receipt_consumptions WHERE receipt_id IN ($1,$2)", [invitationReceiptId, messageReceiptId])
      await ownerPool.query("DELETE FROM brain_messaging_approvals WHERE approval_id IN ($1,$2)", [ownerApprovalId, membershipAdminApprovalId])
      await ownerPool.query("UPDATE brain_workspace_memberships SET approval_id=NULL WHERE group_id=$1 AND workspace_id=$2 AND user_id IN ('admin-user','contractor-user')", [GROUP, WORKSPACE])
      await ownerPool.query("DELETE FROM brain_membership_approvals WHERE approval_id IN ($1,$2)", [adminMembershipApprovalId, contractorMembershipApprovalId])
    }
  })

  it("proves exact documents through the real dashboard and getAppPool", async () => {
    const fixtureDocuments = await ownerPool.query<{ id: string; content: string }>("SELECT id, content FROM brain_documents ORDER BY id")
    const scenarios = [
      { principal: "owner-user", tenant: GROUP, workspace: WORKSPACE, role: "viewer", ids: manifest.principals["owner-user"], state: "complete" },
      { principal: "other-user", tenant: GROUP, workspace: WORKSPACE, role: "viewer", ids: manifest.principals["other-user"], state: "complete" },
      { principal: "admin-user", tenant: GROUP, workspace: WORKSPACE, role: "admin", ids: [], state: "empty" },
      { principal: "owner-user", tenant: "allura-wrong", workspace: WORKSPACE, role: "viewer", ids: [], state: "forbidden" },
      { principal: "owner-user", tenant: GROUP, workspace: "wrong-workspace", role: "viewer", ids: [], state: "forbidden" },
    ]
    for (const scenario of scenarios) {
      const server = await startOwnedProcess({
        command: "node", args: ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "4100"],
        cwd: process.cwd(), port: 4100,
        env: {
          ...process.env, ...database.appEnvironment,
          NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled",
          ALLURA_DEV_AUTH_ENABLED: "true", ALLURA_DEMO_DEV_AUTH_FORCE: "true",
          ALLURA_DEV_AUTH_GROUP_ID: scenario.tenant, ALLURA_DEV_AUTH_WORKSPACE_ID: scenario.workspace,
          ALLURA_DEV_AUTH_USER_ID: scenario.principal, ALLURA_DEV_AUTH_ROLE: scenario.role,
        },
      })
      try {
        const response = await fetch(server.url + "/dashboard", { signal: AbortSignal.timeout(30_000), headers: {
          "x-allura-user-id": scenario.principal === "owner-user" ? "other-user" : "owner-user",
          "x-allura-group-id": GROUP, "x-allura-workspace-id": WORKSPACE,
          "x-allura-role": "superadmin", "x-allura-session-id": "forged-session",
        } })
        expect(response?.status).toBe(200)
        const html = await response!.text()
        expect(html).not.toContain("Local data unavailable")
        const visibleIds = fixtureDocuments.rows.filter(({ id }) => html.includes(id)).map(({ id }) => id)
        expect(visibleIds).toEqual([...scenario.ids].sort())
        for (const document of fixtureDocuments.rows) {
          expect(html.includes(document.content), document.id).toBe(scenario.ids.includes(document.id))
        }
        if (scenario.state === "complete") {
          expect(html).toContain('aria-label="My Work synthetic local workspace"')
        } else {
          expect(html).toContain(`data-surface-state="${scenario.state}"`)
        }
        expect(html.includes("No authorized documents")).toBe(scenario.state === "empty")
        console.info("Epic30 HTTP proof", scenario.principal, scenario.tenant, scenario.workspace, JSON.stringify(visibleIds))
      } finally {
        await server.stop()
      }
    }
  }, 240_000)

  it("fails the real dashboard closed when the receipt sink loses INSERT authority", async () => {
    const receiptRole = database.appEnvironment.POSTGRES_RECEIPT_USER
    expect(receiptRole).toMatch(/^allura_epic30_receipt_[a-f0-9]{32}$/)
    const safeRole = `"${receiptRole}"`
    const before = await ownerPool.query("SELECT count(*)::int AS count FROM epic30_local.read_receipts")
    const documents = await ownerPool.query<{ id: string; title: string; content: string }>(
      "SELECT id, title, content FROM brain_documents ORDER BY id",
    )
    await ownerPool.query(`REVOKE INSERT ON epic30_local.read_receipts FROM ${safeRole}`)
    let server: Awaited<ReturnType<typeof startOwnedProcess>> | undefined
    try {
      server = await startOwnedProcess({
        command: "node", args: ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "4100"],
        cwd: process.cwd(), port: 4100,
        env: { ...process.env, ...database.appEnvironment,
          NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled",
          ALLURA_DEV_AUTH_ENABLED: "true", ALLURA_DEMO_DEV_AUTH_FORCE: "true",
          ALLURA_DEV_AUTH_GROUP_ID: GROUP, ALLURA_DEV_AUTH_WORKSPACE_ID: WORKSPACE,
          ALLURA_DEV_AUTH_USER_ID: "owner-user", ALLURA_DEV_AUTH_ROLE: "viewer",
        },
      })
      const response = await fetch(server.url + "/dashboard", { signal: AbortSignal.timeout(30_000) })
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('data-surface-state="degraded"')
      expect(html).toContain("Workspace temporarily unavailable")
      for (const document of documents.rows) {
        expect(html).not.toContain(document.id)
        expect(html).not.toContain(document.title)
        expect(html).not.toContain(document.content)
      }
      const after = await ownerPool.query("SELECT count(*)::int AS count FROM epic30_local.read_receipts")
      expect(after.rows[0].count).toBe(before.rows[0].count)
    } finally {
      try { await server?.stop() }
      finally { await ownerPool.query(`GRANT INSERT ON epic30_local.read_receipts TO ${safeRole}`) }
    }
  }, 90_000)

  it("launches the same demo command service with verified content and owned cleanup", async () => {
    const demo = await launchSyntheticDemo(false)
    const name = demo.receipt.databaseName
    try {
      expect(demo.receipt.visibleDocumentIds).toEqual([...manifest.principals["owner-user"]].sort())
      expect(demo.receipt.httpStatus).toBe(200)
      expect(demo.receipt.retainDatabase).toBe(false)
    } finally { await demo.stop() }
    expect((await database.rootPool.query("SELECT datname FROM pg_database WHERE datname=$1",[name])).rows).toEqual([])
  }, 90_000)

  it("keeps the application role read-only and non-bypass", async () => {
    const role = await appPool.query(
      `SELECT current_user, session_user, rolbypassrls, rolsuper,
              row_security_active('brain_documents') AS document_rls,
              row_security_active('brain_workspace_memberships') AS workspace_rls,
              row_security_active('brain_department_memberships') AS department_rls,
              current_database() AS database
       FROM pg_roles WHERE rolname = current_user`,
    )
    expect(role.rows).toEqual([{
      current_user: "allura_app", session_user: "allura_app", rolbypassrls: false,
      rolsuper: false, document_rls: true, workspace_rls: true, department_rls: true, database: databaseName,
    }])

    await expect(
      withTenantTransaction(
        { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "admin-user" },
        (client) => client.query("DELETE FROM brain_documents"),
        appPool,
      ),
    ).rejects.toThrow(/permission denied/i)
  })
})
