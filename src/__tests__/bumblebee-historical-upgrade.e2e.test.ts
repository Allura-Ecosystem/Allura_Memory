import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { loadAuthoritativeExposures } from "@/lib/bumblebee/exposure-store"
import { gitExec } from "@/lib/git/exec"

const GROUP_ID = "allura-bumblebee-upgrade-e2e"
const WORKSPACE_ID = "ws-bumblebee-upgrade-e2e"
const SOURCE_ID = "historical-source"
const SOURCE_REVISION_ID = "historical-revision"
const LEASE_ID = "historical-lease"
const REPOSITORY_ROOT = process.cwd()
// dcd2bb25 is an immutable, committed pre-056/pre-057 schema baseline. Do not
// replace this with HEAD: this fixture must fail if its historical source is
// rewritten or if a current migration accidentally leaks into the baseline.
const HISTORICAL_SCHEMA_COMMIT = "dcd2bb25c8b56678451aa7846f2ead1328d3d4b5"
const HISTORICAL_055_BLOB = "c154a431fd3a7a3968461705725181d1b268ce5c"
const POSTGRES_INIT = "docker/postgres-init"

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function ownerPool(): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: process.env.POSTGRES_DB ?? "memory",
    user: process.env.POSTGRES_USER ?? "allura",
    password: process.env.POSTGRES_PASSWORD ?? "",
    max: 1,
  })
}

function appPool(): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: process.env.POSTGRES_DB ?? "memory",
    user: process.env.POSTGRES_APP_USER ?? "allura_app",
    password: process.env.POSTGRES_APP_PASSWORD ?? "",
    max: 1,
  })
}

async function applySql(pool: Pool, sql: string, label: string): Promise<void> {
  try {
    await pool.query(sql)
  } catch (error) {
    throw new Error(`Failed to apply ${label}: ${(error as Error).message}`)
  }
}

async function historicalMigrationsThrough54(): Promise<string[]> {
  const entries = gitExec(["ls-tree", "-r", "--name-only", HISTORICAL_SCHEMA_COMMIT, POSTGRES_INIT], { cwd: REPOSITORY_ROOT }).trim().split("\n")
  return entries
    .filter((entry) => /^\d+-.*\.sql$/.test(path.basename(entry)))
    .filter((entry) => Number(path.basename(entry).slice(0, path.basename(entry).indexOf("-"))) <= 54)
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => `${HISTORICAL_SCHEMA_COMMIT}:${entry}`)
}

const describeLive = process.env.RUN_HISTORICAL_UPGRADE_E2E === "true" && process.env.POSTGRES_PASSWORD && process.env.POSTGRES_APP_PASSWORD
  ? describe
  : describe.skip

describeLive("Bumblebee v055 through v057 historical upgrade", () => {
  const owner = ownerPool()
  const app = appPool()

  beforeAll(async () => {
    const existing = await owner.query("SELECT to_regclass('public.schema_versions') AS schema_versions")
    if (existing.rows[0]?.schema_versions !== null) {
      throw new Error("Historical upgrade E2E requires a disposable empty PostgreSQL database")
    }

    await applySql(owner, "CREATE EXTENSION IF NOT EXISTS vector", "pgvector extension")
    gitExec(["cat-file", "-e", `${HISTORICAL_SCHEMA_COMMIT}^{commit}`], { cwd: REPOSITORY_ROOT })
    const actual055Blob = gitExec(["rev-parse", `${HISTORICAL_SCHEMA_COMMIT}:${POSTGRES_INIT}/55-bumblebee-production-hardening.sql`], { cwd: REPOSITORY_ROOT }).trim()
    expect(actual055Blob).toBe(HISTORICAL_055_BLOB)
    for (const migration of await historicalMigrationsThrough54()) {
      await applySql(owner, gitExec(["show", migration], { cwd: REPOSITORY_ROOT }), migration)
    }

    const v055 = gitExec([
      "show",
      `${HISTORICAL_SCHEMA_COMMIT}:${POSTGRES_INIT}/55-bumblebee-production-hardening.sql`,
    ], { cwd: REPOSITORY_ROOT })
    await applySql(owner, v055, `${HISTORICAL_SCHEMA_COMMIT}:${POSTGRES_INIT}/55-bumblebee-production-hardening.sql [${HISTORICAL_055_BLOB}]`)
    const appPassword = process.env.POSTGRES_APP_PASSWORD!
    await owner.query(`ALTER ROLE allura_app WITH PASSWORD '${appPassword.replaceAll("'", "''")}'`)

    await owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ($1, $2, 'Historical upgrade E2E')`,
      [WORKSPACE_ID, GROUP_ID],
    )
    await owner.query(
      `INSERT INTO bumblebee_runner_credentials
         (credential_id, group_id, workspace_id, token_prefix, token_hash, created_by)
       VALUES ('historical-runner', $1, $2, 'bmb_runner_histupg1', $3, 'e2e')`,
      [GROUP_ID, WORKSPACE_ID, sha("historical-runner")],
    )
    await owner.query(
      `INSERT INTO bumblebee_sources
         (group_id, workspace_id, source_id, source_revision_id, revision_digest, endpoint_device_id,
          runner_credential_id, scanner_tag, scanner_commit, scanner_tree, scanner_artifact_sha256,
          record_schema_version, profile, mode, findings_enabled, root_config_digest, ecosystems,
          all_users, freshness_ttl_seconds, retention_days, classification, redaction_policy)
       VALUES ($1,$2,$3,$4,$5,'historical-device','historical-runner','v0.1.2',
         'cc57710eeaf685e7b89924a36c8583cad0a378fe','985f57cf1749c15561c886c4476f10950ffa9cae',
         $6,'0.1.0','baseline','inventory',false,$7,ARRAY['npm'],false,3600,30,'internal','redaction-v1')`,
      [GROUP_ID, WORKSPACE_ID, SOURCE_ID, SOURCE_REVISION_ID, sha("historical-revision"), sha("historical-artifact"), sha("historical-root")],
    )
    await owner.query(
      `INSERT INTO bumblebee_scan_leases
         (group_id,workspace_id,source_id,source_revision_id,lease_id,generation,revision_digest,
          runner_credential_id,profile,mode,root_config_digest,ecosystems,all_users,
          ingest_token_prefix,ingest_token_hash,expires_at)
       VALUES ($1,$2,$3,$4,$5,1,$6,'historical-runner','baseline','inventory',$7,ARRAY['npm'],false,
         'bmb_ingest_histupg1',$8,NOW()+INTERVAL '4 minutes')`,
      [GROUP_ID, WORKSPACE_ID, SOURCE_ID, SOURCE_REVISION_ID, LEASE_ID, sha("historical-revision"), sha("historical-root"), sha("historical-ingest")],
    )

    for (const [batchId, body, acceptedAt] of [
      ["batch-oldest", sha("historical-body-oldest"), "2026-01-01T00:00:00.000Z"],
    ]) {
      await owner.query(
        `INSERT INTO bumblebee_batch_receipts
           (group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,body_sha256,
            byte_count,line_count,record_count,sanitized_payload_digest,accepted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,100,1,1,$8,$9)`,
        [GROUP_ID, WORKSPACE_ID, SOURCE_ID, SOURCE_REVISION_ID, LEASE_ID, batchId, body, sha(`payload:${batchId}`), acceptedAt],
      )
    }
    await owner.query(
      `INSERT INTO bumblebee_records
         (group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,run_id,record_id,
          record_type,sanitized_payload,canonical_id_inputs,line_number,line_sha256,redaction_provenance)
       VALUES ($1,$2,$3,$4,$5,'batch-oldest','historical-run','historical-finding','finding',
         '{"ecosystem":"npm","normalized_name":"historical-package","finding_type":"advisory"}'::jsonb,
         '{}'::jsonb,1,$6,'{}'::jsonb)`,
      [GROUP_ID, WORKSPACE_ID, SOURCE_ID, SOURCE_REVISION_ID, LEASE_ID, sha("historical-line")],
    )
    await owner.query(
      `INSERT INTO bumblebee_exposure_evidence
         (group_id,workspace_id,source_id,source_revision_id,profile,lease_id,batch_id,run_id,
          finding_record_id,exposure_key,is_trusted,catalog_revision_id,catalog_digest,exposure)
       VALUES ($1,$2,$3,$4,'baseline',$5,'batch-oldest','historical-run','historical-finding',$6,
         false,NULL,NULL,'{"ecosystem":"npm","package_name":"historical-package","version":null,"finding_type":"advisory","catalog_id":null,"advisory_id":null,"is_trusted":false,"matched_package":null,"evidence_source":"endpoint-asserted"}'::jsonb)`,
      [GROUP_ID, WORKSPACE_ID, SOURCE_ID, SOURCE_REVISION_ID, LEASE_ID, sha("historical-exposure")],
    )

    await applySql(
      owner,
      await readFile(path.join(REPOSITORY_ROOT, "docker/postgres-init/56-bumblebee-forward-upgrade.sql"), "utf8"),
      "056-bumblebee-forward-upgrade.sql",
    )
    await applySql(
      owner,
      await readFile(path.join(REPOSITORY_ROOT, "docker/postgres-init/57-governed-lane-review-boundary.sql"), "utf8"),
      "057-governed-lane-review-boundary.sql",
    )
  }, 120_000)

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()])
  })

  it("preserves the actual v055 receipt state and carries it through 056 reconciliation", async () => {
    const receipts = await owner.query(
      `SELECT batch_id, body_sha256 FROM bumblebee_batch_receipts
       WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3 AND source_revision_id=$4 AND lease_id=$5
       ORDER BY accepted_at,batch_id,body_sha256`,
      [GROUP_ID, WORKSPACE_ID, SOURCE_ID, SOURCE_REVISION_ID, LEASE_ID],
    )
    expect(receipts.rows).toHaveLength(1)
    expect(receipts.rows.map((row) => row.batch_id)).toEqual(["batch-oldest"])

    const authority = await owner.query(
      `SELECT active_batch_id, active_body_sha256, reconciliation_state, observed_receipt_count
       FROM bumblebee_lease_body_authority
       WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3 AND source_revision_id=$4 AND lease_id=$5`,
      [GROUP_ID, WORKSPACE_ID, SOURCE_ID, SOURCE_REVISION_ID, LEASE_ID],
    )
    expect(authority.rows).toEqual([{
      active_batch_id: "batch-oldest",
      active_body_sha256: sha("historical-body-oldest"),
      reconciliation_state: "accepted",
      observed_receipt_count: 1,
    }])

    const quarantine = await owner.query(
      `SELECT batch_id, body_sha256, selected_batch_id, selected_body_sha256, reason
       FROM bumblebee_batch_receipt_quarantine
       WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3 AND source_revision_id=$4 AND lease_id=$5`,
      [GROUP_ID, WORKSPACE_ID, SOURCE_ID, SOURCE_REVISION_ID, LEASE_ID],
    )
    expect(quarantine.rows).toEqual([])

    const fk = await owner.query(
      `SELECT convalidated FROM pg_constraint
       WHERE conrelid='public.bumblebee_lease_body_authority'::regclass
         AND conname='bumblebee_lease_body_authority_active_receipt_fkey'`,
    )
    expect(fk.rows).toEqual([{ convalidated: true }])
  })

  it("keeps v055 exposure evidence readable as legacy_unverified and never trusted", async () => {
    await app.query("SELECT set_config('app.current_group_id', $1, false)", [GROUP_ID])
    await app.query("SELECT set_config('app.current_workspace_id', $1, false)", [WORKSPACE_ID])
    const exposures = await loadAuthoritativeExposures(
      { pool: app } as never,
      {
        groupId: GROUP_ID,
        workspaceId: WORKSPACE_ID,
        sourceId: SOURCE_ID,
        sourceRevisionId: SOURCE_REVISION_ID,
        leaseId: LEASE_ID,
        profile: "baseline",
        generation: 1,
        catalogRevisionId: undefined,
        catalogDigest: undefined,
      },
    )
    expect(exposures).toHaveLength(1)
    expect(exposures[0]).toMatchObject({ evidenceState: "legacy_unverified", isTrusted: false })
  })

  it("applies the complete forward path and exposes the branch-bound v057 loader to allura_app", async () => {
    const versions = await owner.query(
      "SELECT version FROM schema_versions WHERE version IN ('056','057') ORDER BY version",
    )
    expect(versions.rows).toEqual([{ version: "056" }, { version: "057" }])

    await app.query("BEGIN")
    try {
      await app.query("SELECT set_config('app.current_group_id',$1,true)", [GROUP_ID])
      await app.query("SELECT set_config('app.current_workspace_id',$1,true)", [WORKSPACE_ID])
      await app.query("SELECT set_config('app.current_principal','woz',true)")
      await app.query("SELECT * FROM app.open_governed_lane($1,$2,'agent-lane-woz','historical-v057-base')", [GROUP_ID, WORKSPACE_ID])
      const persisted = await app.query<{ id: string }>(
        `SELECT id FROM app.persist_governed_lane_snapshot(
           $1,$2,'agent-lane-woz','historical-v057-base',
           '{"added":[{"id":"historical-v057","content":"upgrade proof","score":0.9,"provenance":"manual","tags":[]}],"overridden":[],"deleted":[]}'::jsonb,
           '["historical:v057"]'::jsonb,$3)`,
        [GROUP_ID, WORKSPACE_ID, sha("historical-v057-snapshot")],
      )
      await app.query("SELECT set_config('app.current_principal','pike',true)")
      const loaded = await app.query(
        "SELECT writer_id FROM app.load_governed_lane_snapshot_for_review($1,$2,'agent-lane-woz','ram/agent/woz',$3)",
        [GROUP_ID, WORKSPACE_ID, persisted.rows[0]!.id],
      )
      expect(loaded.rows).toEqual([{ writer_id: "woz" }])
    } finally {
      await app.query("ROLLBACK")
    }
  })
})
