import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { startOwnedProcess } from "../../scripts/epic30/owned-process"
import { launchSyntheticDemo } from "../../scripts/epic30/demo"
import { provisionSyntheticDatabase } from "../../scripts/epic30/synthetic-database"
import { verifySyntheticSession } from "@/lib/digital-brain/local-confinement"
import { readFileSync } from "node:fs"
import path from "node:path"

import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { readAuthorizedDocumentsInRestrictedTransaction } from "@/lib/digital-brain/read-service"

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

  async function readAs(principalId: string, workspaceId = WORKSPACE, tenantId = GROUP) {
    const scope = { tenantId, workspaceId, principalId }
    return withTenantTransaction(
      scope,
      (client) => readAuthorizedDocumentsInRestrictedTransaction(scope, client.query.bind(client)),
      appPool,
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

    expect(Number(documents.rows[0]?.count)).toBe(manifest.expectedDocumentCount)
    expect(Number(memberships.rows[0]?.count)).toBe(manifest.expectedMembershipCount)
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

  async function rawOwnerIds(): Promise<string[]> {
    return withTenantTransaction(
      { tenantId: GROUP, workspaceId: WORKSPACE, principalId: "owner-user" },
      async (client) => (await client.query<{ id: string }>("SELECT id FROM brain_documents ORDER BY id")).rows.map(({ id }) => id),
      appPool,
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

  it("proves exact documents through the real dashboard and getAppPool", async () => {
    const fixtureDocuments = await ownerPool.query<{ id: string; content: string }>("SELECT id, content FROM brain_documents ORDER BY id")
    const scenarios = [
      { principal: "owner-user", tenant: GROUP, workspace: WORKSPACE, role: "viewer", ids: manifest.principals["owner-user"] },
      { principal: "other-user", tenant: GROUP, workspace: WORKSPACE, role: "viewer", ids: manifest.principals["other-user"] },
      { principal: "admin-user", tenant: GROUP, workspace: WORKSPACE, role: "admin", ids: [] },
      { principal: "owner-user", tenant: "allura-wrong", workspace: WORKSPACE, role: "viewer", ids: [] },
      { principal: "owner-user", tenant: GROUP, workspace: "wrong-workspace", role: "viewer", ids: [] },
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
        expect(html.includes("No authorized documents")).toBe(scenario.ids.length === 0)
        console.info("Epic30 HTTP proof", scenario.principal, scenario.tenant, scenario.workspace, JSON.stringify(visibleIds))
      } finally {
        await server.stop()
      }
    }
  }, 240_000)

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
              row_security_active('brain_department_memberships') AS department_rls,
              current_database() AS database
       FROM pg_roles WHERE rolname = current_user`,
    )
    expect(role.rows).toEqual([{
      current_user: "allura_app", session_user: "allura_app", rolbypassrls: false,
      rolsuper: false, document_rls: true, department_rls: true, database: databaseName,
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
