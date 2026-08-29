import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { hashBumblebeeToken } from "@/lib/bumblebee/lease-authority"
import { closePool } from "@/lib/postgres/connection"

// This suite exists because migration 49 is an apply-time contract, not a
// text pattern: `DROP FUNCTION IF EXISTS app.bumblebee_bootstrap_ingest(TEXT)`
// silently no-ops if the deployed signature does not match `(TEXT)` exactly,
// and the subsequent `CREATE OR REPLACE` then fails at apply time with
// "cannot change return type of existing function" in precisely the way this
// migration claims to prevent. A regex over the .sql source (see
// src/lib/bumblebee/__tests__/ingest-runtime.test.ts) can only prove the DROP
// statement text precedes the CREATE statement text — it cannot prove the
// migration actually applies cleanly against a real, previously-migrated
// PostgreSQL instance, nor that the widened 11-column OUT row and the
// allura_app EXECUTE grant survived the drop/recreate. Only a live database
// that has run migrations 46, 47, 48, and 49 in order can prove that.

const GROUP = "allura-bmb-ingest-bootstrap-e2e"
const WORKSPACE = "ws-bmb-ingest-bootstrap-e2e"
const TOKEN_SECRET = "live-ingest-bootstrap-secret-26-7"

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

describeLive("Story 26.7 migration 49 ingest bootstrap contract against fresh allura_app PostgreSQL", () => {
  const owner = makePool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "")
  const app = makePool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "", 6)

  let activePrefix: string
  let disabledPrefix: string

  beforeAll(async () => {
    process.env.BUMBLEBEE_TOKEN_SECRET = TOKEN_SECRET
    await owner.query(`INSERT INTO workspaces (workspace_id, group_id, name)
      VALUES ($1,$2,'Bumblebee ingest bootstrap e2e') ON CONFLICT (workspace_id) DO NOTHING`, [WORKSPACE, GROUP])

    const client = await app.connect()
    try {
      await scoped(client, async () => {
        await client.query(`INSERT INTO bumblebee_runner_credentials
          (credential_id,group_id,workspace_id,token_prefix,token_hash,created_by)
          VALUES ('bootstrap-runner',$1,$2,'bmb_runner_bootrap1',$3,'e2e')`, [GROUP, WORKSPACE, "a".repeat(64)])

        // Two sources sharing the same runner credential: one stays active for
        // the entire suite, the other is soft-disabled AFTER its lease is issued
        // to prove the join predicate added in migration 49 actually revokes
        // ingest capability retroactively — not just for newly-issued leases.
        await client.query(`INSERT INTO bumblebee_sources
          (group_id,workspace_id,source_id,source_revision_id,revision_digest,endpoint_device_id,
           runner_credential_id,scanner_tag,scanner_commit,scanner_tree,scanner_artifact_sha256,
           record_schema_version,profile,mode,findings_enabled,root_config_digest,ecosystems,all_users,
           freshness_ttl_seconds,retention_days,classification,redaction_policy)
          VALUES
          ($1,$2,'active-source','active-revision',$3,'device-active','bootstrap-runner','v0.1.2',
           'cc57710eeaf685e7b89924a36c8583cad0a378fe','985f57cf1749c15561c886c4476f10950ffa9cae',
           $4,'0.1.0','deep','inventory',false,$5,ARRAY['npm','pypi'],true,3600,30,'confidential','redaction-v1'),
          ($1,$2,'disabled-source','disabled-revision',$6,'device-disabled','bootstrap-runner','v0.1.2',
           'cc57710eeaf685e7b89924a36c8583cad0a378fe','985f57cf1749c15561c886c4476f10950ffa9cae',
           $4,'0.1.0','baseline','inventory',false,$7,ARRAY['go'],false,3600,30,'internal','redaction-v1')`,
        [GROUP, WORKSPACE, "b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64)])

        const activeToken = "bmb_ingest_activeXX"
        const disabledToken = "bmb_ingest_disableX"
        activePrefix = activeToken.slice(0, "bmb_ingest_".length + 8)
        disabledPrefix = disabledToken.slice(0, "bmb_ingest_".length + 8)

        await client.query(
          `SELECT app.issue_bumblebee_scan_lease('active-source','active-revision','bootstrap-runner',
            'active-lease',$1,$2,NOW()+INTERVAL '2 minutes')`,
          [activePrefix, hashBumblebeeToken(activeToken)],
        )
        await client.query(
          `SELECT app.issue_bumblebee_scan_lease('disabled-source','disabled-revision','bootstrap-runner',
            'disabled-lease',$1,$2,NOW()+INTERVAL '2 minutes')`,
          [disabledPrefix, hashBumblebeeToken(disabledToken)],
        )

        // Soft-disable AFTER lease issuance: one-way transition, permitted by the
        // migration-46 trigger because it moves disabled_at from NULL to non-NULL.
        await client.query(`UPDATE bumblebee_sources
          SET disabled_at = NOW(), disabled_by = 'e2e-operator', disable_reason = 'contract test'
          WHERE source_id = 'disabled-source' AND source_revision_id = 'disabled-revision'`)
      })
    } finally { client.release() }
  })

  afterAll(async () => {
    await closePool()
    await Promise.all([app.end(), owner.end()])
    delete process.env.BUMBLEBEE_TOKEN_SECRET
  })

  it("exposes the migration-49 widened 11-column OUT row as SECURITY DEFINER with allura_app EXECUTE intact", async () => {
    // pg_get_function_result proves the deployed signature — not the .sql text —
    // actually carries all 11 OUT columns (the original 8 from migration 47 plus
    // profile, mode, ecosystems added by migration 49). If the DROP in migration
    // 49 had no-oped against a mismatched signature, CREATE OR REPLACE would have
    // failed at apply time and this function would either not exist or would
    // still report the narrower 8-column result type.
    const signature = await owner.query<{ result_type: string; prosecdef: boolean }>(`SELECT
      pg_get_function_result(p.oid) AS result_type, p.prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'bumblebee_bootstrap_ingest'`)
    expect(signature.rows).toHaveLength(1)
    const { result_type: resultType, prosecdef: isSecurityDefiner } = signature.rows[0]
    expect(isSecurityDefiner).toBe(true)
    for (const column of [
      "lease_id", "group_id", "workspace_id", "source_id", "source_revision_id",
      "token_hash", "expires_at", "revoked_at", "profile", "mode", "ecosystems",
    ]) {
      expect(resultType, resultType).toContain(column)
    }

    // A DROP FUNCTION discards all grants on the dropped object. Proving
    // allura_app still holds EXECUTE proves the migration re-granted it after
    // the drop/recreate — not merely that the grant statement's text exists.
    const privilege = await owner.query<{ has_execute: boolean }>(
      `SELECT has_function_privilege('allura_app', 'app.bumblebee_bootstrap_ingest(text)', 'EXECUTE') AS has_execute`,
    )
    expect(privilege.rows[0].has_execute).toBe(true)

    // Exercise the grant end-to-end: allura_app actually calling the function
    // (rather than merely being checked for the privilege) is what would fail
    // with "permission denied for function" if the regrant had not landed.
    const result = await app.query(`SELECT * FROM app.bumblebee_bootstrap_ingest($1)`, [activePrefix])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      lease_id: "active-lease",
      group_id: GROUP,
      workspace_id: WORKSPACE,
      source_id: "active-source",
      source_revision_id: "active-revision",
      profile: "deep",
      mode: "inventory",
      ecosystems: ["npm", "pypi"],
    })
  })

  it("refuses to authenticate an ingest lease whose source revision was soft-disabled after issuance", async () => {
    // Behavioral proof of the deliberate security posture added alongside the
    // migration portability fix: a lease issued while the source was active
    // must stop authenticating the moment the source is soft-disabled, even
    // though the lease row itself was never touched (leases are immutable).
    const result = await app.query(`SELECT * FROM app.bumblebee_bootstrap_ingest($1)`, [disabledPrefix])
    expect(result.rows).toHaveLength(0)
  })
})
