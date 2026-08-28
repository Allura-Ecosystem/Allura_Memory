import { createHash } from "node:crypto"
import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { POST as ingest } from "@/app/api/plugins/bumblebee/ingest/route"
import { hashBumblebeeToken } from "@/lib/bumblebee/lease-authority"
import { closePool } from "@/lib/postgres/connection"

const GROUP = "allura-bmb-ingest-e2e"
const WORKSPACE = "ws-bmb-ingest-e2e"
const TOKEN = "bmb_ingest_liveing1_tail"

function pool(user: string, password: string) { return new Pool({ host: process.env.POSTGRES_HOST ?? "127.0.0.1", port: Number(process.env.POSTGRES_PORT ?? 5432), database: process.env.POSTGRES_DB ?? "memory", user, password }) }
async function scoped<T>(client: PoolClient, work: () => Promise<T>) {
  await client.query("BEGIN")
  try {
    await client.query("SELECT set_config('app.current_group_id',$1,true)", [GROUP])
    await client.query("SELECT set_config('app.current_workspace_id',$1,true)", [WORKSPACE])
    const result = await work(); await client.query("COMMIT"); return result
  } catch (error) { await client.query("ROLLBACK"); throw error }
}
function record() {
  const sourceFile = "/secret/CANARY-DO-NOT-PERSIST/package-lock.json"
  const parts = ["baseline", "npm", "safe-package", "1.2.3", "", "", "", "npm", "lockfile", sourceFile, "", "false", "", "high", "", ""]
  const id = `package:${createHash("sha256").update(`package\0${parts.join("\x1e")}`).digest("hex")}`
  return { record_type: "package", record_id: id, schema_version: "0.1.0", scanner_name: "bumblebee", scanner_version: "v0.1.2", run_id: "live-run-1", scan_time: "2026-08-28T12:00:00.000Z", endpoint: { hostname: "CANARY-HOST", os: "linux", arch: "amd64", username: "CANARY-USER", uid: "1000", device_id: "device-live" }, profile: "baseline", ecosystem: "npm", package_name: "safe-package", normalized_name: "safe-package", version: "1.2.3", package_manager: "npm", source_type: "lockfile", source_file: sourceFile, has_lifecycle_scripts: false, confidence: "high" }
}
const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_APP_PASSWORD ? describe : describe.skip

describeLive("Story 26.7 ingest ledger under non-owner allura_app", () => {
  const owner = pool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "")
  const app = pool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "")
  beforeAll(async () => {
    process.env.BUMBLEBEE_TOKEN_SECRET = "live-ingest-secret-26-7"
    await owner.query("INSERT INTO workspaces(workspace_id,group_id,name) VALUES($1,$2,'ingest e2e') ON CONFLICT(workspace_id) DO NOTHING", [WORKSPACE, GROUP])
    const client = await app.connect()
    try { await scoped(client, async () => {
      await client.query("INSERT INTO bumblebee_runner_credentials(credential_id,group_id,workspace_id,token_prefix,token_hash,created_by) VALUES('ingest-runner',$1,$2,'bmb_runner_ingest01',$3,'e2e')", [GROUP, WORKSPACE, "1".repeat(64)])
      await client.query(`INSERT INTO bumblebee_sources(group_id,workspace_id,source_id,source_revision_id,revision_digest,endpoint_device_id,runner_credential_id,scanner_tag,scanner_commit,scanner_tree,scanner_artifact_sha256,record_schema_version,profile,mode,findings_enabled,root_config_digest,ecosystems,all_users,freshness_ttl_seconds,retention_days,classification,redaction_policy) VALUES($1,$2,'ingest-source','ingest-revision',$3,'device-live','ingest-runner','v0.1.2','cc57710eeaf685e7b89924a36c8583cad0a378fe','985f57cf1749c15561c886c4476f10950ffa9cae',$4,'0.1.0','baseline','inventory',false,$5,ARRAY['npm'],false,3600,30,'internal','redaction-v1')`, [GROUP, WORKSPACE, "2".repeat(64), "3".repeat(64), "4".repeat(64)])
    }) } finally { client.release() }
    await owner.query(`INSERT INTO bumblebee_scan_leases(group_id,workspace_id,source_id,source_revision_id,lease_id,generation,revision_digest,runner_credential_id,profile,mode,root_config_digest,ecosystems,all_users,ingest_token_prefix,ingest_token_hash,expires_at) VALUES($1,$2,'ingest-source','ingest-revision','ingest-lease',1,$3,'ingest-runner','baseline','inventory',$4,ARRAY['npm'],false,'bmb_ingest_liveing1',$5,NOW()+INTERVAL '4 minutes')`, [GROUP, WORKSPACE, "2".repeat(64), "4".repeat(64), hashBumblebeeToken(TOKEN)])
  })
  afterAll(async () => { await closePool(); await Promise.all([owner.end(), app.end()]); delete process.env.BUMBLEBEE_TOKEN_SECRET })

  it("atomically accepts, exactly replays, conflicts on reused record identity, and stores no canary", async () => {
    const body = `${JSON.stringify(record())}\n`
    const request = (value: string) => new Request("https://allura.example/api/plugins/bumblebee/ingest", { method: "POST", headers: { authorization: ["Bearer", TOKEN].join(" "), "content-type": "application/x-ndjson" }, body: value })
    const accepted = await ingest(request(body)); expect(accepted.status).toBe(201)
    const receipt = await accepted.json() as { receiptId: string; replayed: boolean }
    const replay = await ingest(request(body)); expect(replay.status).toBe(200); expect(await replay.json()).toEqual({ ...receipt, replayed: true })
    const conflict = await ingest(request(`${JSON.stringify(record(), null, 1)}\n`)); expect(conflict.status).toBe(409); expect(await conflict.json()).toEqual({ error: "BUMBLEBEE_INGEST_RECORD_CONFLICT" })

    const client = await app.connect()
    try { await scoped(client, async () => {
      const rows = await client.query("SELECT sanitized_payload::text AS payload, redaction_provenance::text AS provenance FROM bumblebee_records")
      expect(rows.rows).toHaveLength(1)
      expect(JSON.stringify(rows.rows)).not.toMatch(/CANARY|package-lock\.json/)
      expect(rows.rows[0].provenance).toContain("source_file")
      await expect(client.query("UPDATE bumblebee_records SET run_id='changed'")).rejects.toThrow(/permission denied/)
    }) } finally { client.release() }
  })

  it("proves FORCE RLS, non-ownership, and SELECT+INSERT-only grants", async () => {
    const facts = await app.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) owner, has_table_privilege(current_user,c.oid,'SELECT') can_select, has_table_privilege(current_user,c.oid,'INSERT') can_insert, has_table_privilege(current_user,c.oid,'UPDATE') can_update, has_table_privilege(current_user,c.oid,'DELETE') can_delete FROM pg_class c WHERE c.relname IN ('bumblebee_batch_receipts','bumblebee_records') ORDER BY c.relname`)
    expect(facts.rows).toHaveLength(2)
    for (const row of facts.rows) expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, can_select: true, can_insert: true, can_update: false, can_delete: false })
    expect(facts.rows.every((row) => row.owner !== "allura_app")).toBe(true)
  })
})
