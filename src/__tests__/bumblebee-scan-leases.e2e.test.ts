import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { POST as issueRun } from "@/app/api/plugins/bumblebee/runs/route"
import { hashBumblebeeToken } from "@/lib/bumblebee/lease-authority"
import { closePool } from "@/lib/postgres/connection"

const GROUP = "allura-bmb-lease-e2e"
const WORKSPACE = "ws-bmb-lease-e2e"
const TOKEN_SECRET = "live-scan-lease-secret-26-7"

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
    process.env.BUMBLEBEE_TOKEN_SECRET = TOKEN_SECRET
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

        await client.query(`INSERT INTO bumblebee_catalog_revisions
          (group_id,workspace_id,catalog_revision_id,catalog_digest,canonical_catalog,provenance,
           catalog_schema_version,reviewed_by,approval_receipt_id,classification,redaction_policy)
          VALUES ($1,$2,'catalog-live',$3,'{"packages":["exact"]}','{"source":"reviewed"}',
            '1','reviewer','receipt-live','confidential','catalog-redaction')`,
        [GROUP, WORKSPACE, "9".repeat(64)])

        const credentials = [
          ["live-runner", "bmb_runner_live0001", hashBumblebeeToken("bmb_runner_live0001_tail"), null, null],
          ["expired-runner", "bmb_runner_expired1", hashBumblebeeToken("bmb_runner_expired1_tail"), "NOW()-INTERVAL '1 minute'", null],
          ["revoked-runner", "bmb_runner_revoked1", hashBumblebeeToken("bmb_runner_revoked1_tail"), null, "NOW()"],
          ["race-runner", "bmb_runner_race0001", "4".repeat(64), null, null],
          ["rollback-runner", "bmb_runner_roll0001", "5".repeat(64), null, null],
        ] as const
        for (const [id, prefix, hash, expiry, revoked] of credentials) {
          await client.query(`INSERT INTO bumblebee_runner_credentials
            (credential_id,group_id,workspace_id,token_prefix,token_hash,expires_at,revoked_at,created_by)
            VALUES ($1,$2,$3,$4,$5,${expiry ?? "NULL"},${revoked ?? "NULL"},'e2e')`,
          [id, GROUP, WORKSPACE, prefix, hash])
        }

        await client.query(`INSERT INTO bumblebee_sources
          (group_id,workspace_id,source_id,source_revision_id,revision_digest,endpoint_device_id,
           runner_credential_id,scanner_tag,scanner_commit,scanner_tree,scanner_artifact_sha256,
           record_schema_version,profile,mode,findings_enabled,root_config_digest,ecosystems,all_users,
           freshness_ttl_seconds,retention_days,classification,redaction_policy,catalog_revision_id,catalog_digest)
          VALUES
          ($1,$2,'live-source','live-revision',$3,'live-device','live-runner','v0.1.2',$4,$5,$6,
           '0.1.0','deep','findings-only',true,$7,ARRAY['npm','pypi'],true,900,7,'confidential',
           'exact-redaction','catalog-live',$8),
          ($1,$2,'race-source','race-revision',$9,'race-device','race-runner','v0.1.2',$4,$5,$6,
           '0.1.0','baseline','inventory',false,$10,ARRAY['go'],false,900,7,'internal','exact-redaction',NULL,NULL),
          ($1,$2,'rollback-source','rollback-revision',$11,'rollback-device','rollback-runner','v0.1.2',$4,$5,$6,
           '0.1.0','project','inventory',false,$12,ARRAY['rubygems'],false,900,7,'internal','exact-redaction',NULL,NULL)`,
        [GROUP, WORKSPACE, "1".repeat(64),
          "cc57710eeaf685e7b89924a36c8583cad0a378fe", "985f57cf1749c15561c886c4476f10950ffa9cae",
          "2".repeat(64), "3".repeat(64), "9".repeat(64), "6".repeat(64), "7".repeat(64),
          "8".repeat(64), "a".repeat(64)])
      })
    } finally { client.release() }
  })

  afterAll(async () => {
    await closePool()
    await Promise.all([app.end(), owner.end()])
    delete process.env.BUMBLEBEE_TOKEN_SECRET
  })

  it("attests the restricted role, ownership, RLS, FK and least privilege", async () => {
    const role = await app.query(`SELECT current_user, r.rolsuper, r.rolbypassrls,
      c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner,
      has_table_privilege(current_user,'bumblebee_scan_leases','INSERT') AS can_insert,
      has_table_privilege(current_user,'bumblebee_scan_leases','DELETE') AS can_delete,
      has_schema_privilege(current_user,'public','CREATE') AS can_create_public
      FROM pg_roles r JOIN pg_class c ON c.relname='bumblebee_scan_leases'
      WHERE r.rolname=current_user`)
    expect(role.rows[0]).toMatchObject({
      current_user: "allura_app", rolsuper: false, rolbypassrls: false,
      relrowsecurity: true, relforcerowsecurity: true, can_insert: false,
      can_delete: false, can_create_public: false,
    })
    expect(role.rows[0].owner).not.toBe("allura_app")

    const functions = await app.query<{ owner: string; proconfig: string[]; prosecdef: boolean }>(`SELECT
      pg_get_userbyid(p.proowner) AS owner, p.proconfig, p.prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='app' AND p.proname IN (
        'bumblebee_bootstrap_runner','bumblebee_bootstrap_ingest','issue_bumblebee_scan_lease'
      ) ORDER BY p.proname`)
    expect(functions.rows).toHaveLength(3)
    for (const fn of functions.rows) {
      expect(fn.owner).not.toBe("allura_app")
      expect(fn.prosecdef).toBe(true)
      expect(fn.proconfig).toContain("search_path=pg_catalog")
    }

    const constraints = await app.query<{ definition: string }>(`SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid='bumblebee_scan_leases'::regclass AND contype='f'`)
    expect(constraints.rows.some(({ definition }) =>
      definition.includes("source_id") && definition.includes("source_revision_id") &&
      definition.includes("runner_credential_id") && definition.includes("runner_audience"),
    )).toBe(true)

    const client = await app.connect()
    try {
      await expect(scoped(client, () => client.query(`INSERT INTO bumblebee_scan_leases
        (group_id,workspace_id,source_id,source_revision_id,lease_id,generation,revision_digest,
         runner_credential_id,profile,mode,root_config_digest,ecosystems,all_users,
         ingest_token_prefix,ingest_token_hash,expires_at)
        VALUES ($1,$2,'missing','missing','bad-fk',1,$3,'lease-runner','baseline','inventory',$4,
          ARRAY['npm'],false,'bmb_ingest_badfk001',$5,NOW()+INTERVAL '2 minutes')`,
      [GROUP, WORKSPACE, "e".repeat(64), "f".repeat(64), "1".repeat(64)]))).rejects.toMatchObject({ code: "42501" })
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

  it("exercises the exported runs route with real HMAC bootstrap and copies only the locked canonical population/catalog", async () => {
    const response = await issueRun(new Request("http://localhost/api/plugins/bumblebee/runs", {
      method: "POST",
      headers: { authorization: "Bearer bmb_runner_live0001_tail", "content-type": "application/json" },
      body: JSON.stringify({ sourceId: "live-source", sourceRevisionId: "live-revision", durationSeconds: 120 }),
    }))
    expect(response.status).toBe(201)
    const body = await response.json() as { leaseId: string; generation: number; ingestToken: string }
    expect(body.generation).toBe(1)
    expect(body.ingestToken).toMatch(/^bmb_ingest_/)

    const client = await app.connect()
    try {
      const snapshot = await scoped(client, () => client.query(`SELECT revision_digest,
        runner_credential_id,profile,mode,root_config_digest,ecosystems,all_users,
        catalog_revision_id,catalog_digest FROM bumblebee_scan_leases WHERE lease_id=$1`, [body.leaseId]))
      expect(snapshot.rows[0]).toEqual({
        revision_digest: "1".repeat(64), runner_credential_id: "live-runner", profile: "deep",
        mode: "findings-only", root_config_digest: "3".repeat(64), ecosystems: ["npm", "pypi"],
        all_users: true, catalog_revision_id: "catalog-live", catalog_digest: "9".repeat(64),
      })
    } finally { client.release() }
  })

  it.each([
    ["bmb_runner_expired1_tail", "BUMBLEBEE_AUTH_EXPIRED"],
    ["bmb_runner_revoked1_tail", "BUMBLEBEE_AUTH_REVOKED"],
  ])("rejects real expired/revoked runner bootstrap before parsing a body", async (rawToken, code) => {
    const response = await issueRun({
      headers: new Headers({ authorization: `Bearer ${rawToken}` }),
      json: () => { throw new Error("body must not be parsed") },
    } as unknown as Request)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: code })
  })

  it("rolls back failed issuance without consuming the next generation", async () => {
    const client = await app.connect()
    try {
      await expect(scoped(client, () => client.query(
        `SELECT app.issue_bumblebee_scan_lease('rollback-source','rollback-revision','rollback-runner',
          'rollback-failed','bmb_ingest_fail0001',$1,NOW()+INTERVAL '10 minutes')`, ["b".repeat(64)],
      ))).rejects.toMatchObject({ code: "23514" })
      const generation = await scoped(client, () => client.query<{ generation: string }>(
        `SELECT app.issue_bumblebee_scan_lease('rollback-source','rollback-revision','rollback-runner',
          'rollback-success','bmb_ingest_pass0001',$1,NOW()+INTERVAL '2 minutes') AS generation`, ["c".repeat(64)],
      ))
      expect(Number(generation.rows[0].generation)).toBe(1)
    } finally { client.release() }
  })

  it("proves revocation that holds the credential lock wins before issuance and leaves no lease", async () => {
    const revoker = await app.connect()
    const issuer = await app.connect()
    try {
      await revoker.query("BEGIN")
      await revoker.query("SELECT set_config('app.current_group_id',$1,true)", [GROUP])
      await revoker.query("SELECT set_config('app.current_workspace_id',$1,true)", [WORKSPACE])
      await revoker.query("UPDATE bumblebee_runner_credentials SET revoked_at=NOW() WHERE credential_id='race-runner'")

      const issuance = scoped(issuer, () => issuer.query(
        `SELECT app.issue_bumblebee_scan_lease('race-source','race-revision','race-runner',
          'race-loser','bmb_ingest_race0001',$1,NOW()+INTERVAL '2 minutes')`, ["d".repeat(64)],
      ))
      let waiting = false
      for (let attempt = 0; attempt < 100 && !waiting; attempt += 1) {
        const activity = await owner.query(`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE query LIKE '%race-loser%'
            AND wait_event_type='Lock') AS waiting`)
        waiting = activity.rows[0].waiting
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(waiting).toBe(true)
      await revoker.query("COMMIT")
      await expect(issuance).rejects.toMatchObject({ code: "P0002" })

      const count = await scoped(issuer, () => issuer.query(
        "SELECT count(*)::int AS count FROM bumblebee_scan_leases WHERE source_revision_id='race-revision'",
      ))
      expect(count.rows[0].count).toBe(0)
    } finally {
      await revoker.query("ROLLBACK").catch(() => undefined)
      revoker.release()
      issuer.release()
    }
  })
})
