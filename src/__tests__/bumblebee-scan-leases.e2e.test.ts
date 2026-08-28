import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const GROUP = "allura-bmb-lease-e2e"
const WORKSPACE = "ws-bmb-lease-e2e"

function makePool(user: string, password: string, max = 4) {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: process.env.POSTGRES_DB ?? "memory",
    user,
    password,
    max,
  })
}

async function scoped<T>(client: PoolClient, work: () => Promise<T>): Promise<T> {
  await client.query("BEGIN")
  try {
    await client.query("SELECT set_config('app.current_group_id', $1, true)", [GROUP])
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [WORKSPACE])
    const result = await work()
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}

const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_APP_PASSWORD ? describe : describe.skip

describeLive("Story 26.7 scan leases under fresh allura_app PostgreSQL", () => {
  const owner = makePool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "")
  const app = makePool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "", 6)

  beforeAll(async () => {
    await owner.query(`INSERT INTO workspaces (workspace_id, group_id, name)
      VALUES ($1,$2,'Bumblebee lease e2e') ON CONFLICT (workspace_id) DO NOTHING`, [WORKSPACE, GROUP])
    const client = await app.connect()
    try {
      await scoped(client, async () => {
        await client.query(`INSERT INTO bumblebee_runner_credentials
          (credential_id,group_id,workspace_id,token_prefix,token_hash,created_by)
          VALUES ('lease-runner',$1,$2,'bmb_runner_lease010',$3,'e2e')`, [GROUP, WORKSPACE, "a".repeat(64)])
        await client.query(`INSERT INTO bumblebee_sources
          (group_id,workspace_id,source_id,source_revision_id,revision_digest,endpoint_device_id,
           runner_credential_id,scanner_tag,scanner_commit,scanner_tree,scanner_artifact_sha256,
           record_schema_version,profile,mode,findings_enabled,root_config_digest,ecosystems,all_users,
           freshness_ttl_seconds,retention_days,classification,redaction_policy)
          VALUES ($1,$2,'lease-source','lease-revision',$3,'device-lease','lease-runner','v0.1.2',
           'cc57710eeaf685e7b89924a36c8583cad0a378fe','985f57cf1749c15561c886c4476f10950ffa9cae',
           $4,'0.1.0','baseline','inventory',false,$5,ARRAY['npm'],false,3600,30,'internal','redaction-v1')`,
        [GROUP, WORKSPACE, "b".repeat(64), "c".repeat(64), "d".repeat(64)])
      })
    } finally { client.release() }
  })

  afterAll(async () => { await Promise.all([app.end(), owner.end()]) })

  it("attests the restricted role, ownership, RLS, FK and least privilege", async () => {
    const role = await app.query(`SELECT current_user, r.rolsuper, r.rolbypassrls,
      c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner,
      has_table_privilege(current_user,'bumblebee_scan_leases','DELETE') AS can_delete
      FROM pg_roles r JOIN pg_class c ON c.relname='bumblebee_scan_leases'
      WHERE r.rolname=current_user`)
    expect(role.rows[0]).toMatchObject({
      current_user: "allura_app", rolsuper: false, rolbypassrls: false,
      relrowsecurity: true, relforcerowsecurity: true, can_delete: false,
    })
    expect(role.rows[0].owner).not.toBe("allura_app")

    const client = await app.connect()
    try {
      await expect(scoped(client, () => client.query(`INSERT INTO bumblebee_scan_leases
        (group_id,workspace_id,source_id,source_revision_id,lease_id,generation,revision_digest,
         runner_credential_id,profile,mode,root_config_digest,ecosystems,all_users,
         ingest_token_prefix,ingest_token_hash,expires_at)
        VALUES ($1,$2,'missing','missing','bad-fk',1,$3,'lease-runner','baseline','inventory',$4,
          ARRAY['npm'],false,'bmb_ingest_badfk001',$5,NOW()+INTERVAL '2 minutes')`,
      [GROUP, WORKSPACE, "e".repeat(64), "f".repeat(64), "1".repeat(64)]))).rejects.toMatchObject({ code: "23503" })
    } finally { client.release() }
  })

  it("serializes concurrent issuance into unique contiguous server generations", async () => {
    const issue = async (suffix: number) => {
      const client = await app.connect()
      try {
        return await scoped(client, async () => {
          const result = await client.query<{ generation: string }>(
            `SELECT app.issue_bumblebee_scan_lease('lease-source','lease-revision','lease-runner',$1,$2,$3,NOW()+INTERVAL '2 minutes') AS generation`,
            [`lease-${suffix}`, `bmb_ingest_${String(suffix).padStart(8, "0")}`, String(suffix).repeat(64).slice(0, 64)],
          )
          return Number(result.rows[0].generation)
        })
      } finally { client.release() }
    }
    const generations = (await Promise.all([issue(2), issue(3)])).sort((a, b) => a - b)
    expect(generations).toEqual([1, 2])
  })

  it("denies app-role mutation of immutable generation/expiry, enforces one-way revocation, and applies cross-scope RLS", async () => {
    const client = await app.connect()
    try {
      await expect(scoped(client, () => client.query(
        "UPDATE bumblebee_scan_leases SET generation=99 WHERE lease_id='lease-2'",
      ))).rejects.toThrow(/permission denied/)
      const immutablePrivileges = await app.query(`SELECT
        has_column_privilege(current_user,'bumblebee_scan_leases','generation','UPDATE') AS generation,
        has_column_privilege(current_user,'bumblebee_scan_leases','expires_at','UPDATE') AS expiry`)
      expect(immutablePrivileges.rows[0]).toEqual({ generation: false, expiry: false })
      await scoped(client, () => client.query(
        "UPDATE bumblebee_scan_leases SET revoked_at=NOW() WHERE lease_id='lease-2'",
      ))
      await expect(scoped(client, () => client.query(
        "UPDATE bumblebee_scan_leases SET revoked_at=NULL WHERE lease_id='lease-2'",
      ))).rejects.toThrow(/revocation is immutable once set/)
      await client.query("BEGIN")
      await client.query("SELECT set_config('app.current_group_id','allura-other',true)")
      await client.query("SELECT set_config('app.current_workspace_id','ws-other',true)")
      const hidden = await client.query("SELECT count(*)::int AS count FROM bumblebee_scan_leases")
      await client.query("ROLLBACK")
      expect(hidden.rows[0].count).toBe(0)
    } finally { client.release() }
  })
})
