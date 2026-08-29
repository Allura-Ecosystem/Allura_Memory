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
const RUN_ID = "0123456789abcdef0123456789abcdef"

function record(version = "1.2.3", sourceFile = "/secret/CANARY-DO-NOT-PERSIST/package-lock.json") {
  const parts = ["baseline", "npm", "safe-package", version, "", "", "", "npm", "lockfile", sourceFile, "", "false", "", "high", "", ""]
  const id = `package:${createHash("sha256").update(`package\0${parts.join("\x1e")}`).digest("hex")}`
  return { record_type: "package", record_id: id, schema_version: "0.1.0", scanner_name: "bumblebee", scanner_version: "v0.1.2", run_id: RUN_ID, scan_time: "2026-08-28T12:00:00.000Z", endpoint: { hostname: "CANARY-HOST", os: "linux", arch: "amd64", username: "CANARY-USER", uid: "1000", device_id: "device-live" }, profile: "baseline", ecosystem: "npm", package_name: "safe-package", normalized_name: "safe-package", version, package_manager: "npm", source_type: "lockfile", source_file: sourceFile, has_lifecycle_scripts: false, confidence: "high" }
}

function scanSummaryRecord(packageRecordsEmitted: number, findingsEmitted: number) {
  const now = new Date()
  const scanTime = new Date(now.getTime() - 5_000).toISOString()
  const endTime = now.toISOString()
  const parts = ["baseline", "complete", scanTime, endTime, "", "", String(packageRecordsEmitted), "0", String(findingsEmitted), "0", "0", "1", "false", "5", "0", "0", "0", "0", ""]
  const id = `scan_summary:${createHash("sha256").update(`scan_summary\0${parts.join("\x1e")}`).digest("hex")}`
  return { record_type: "scan_summary", record_id: id, schema_version: "0.1.0", scanner_name: "bumblebee", scanner_version: "v0.1.2", run_id: RUN_ID, scan_time: scanTime, endpoint: { hostname: "CANARY-HOST", os: "linux", arch: "amd64", username: "CANARY-USER", uid: "1000", device_id: "device-live" }, profile: "baseline", end_time: endTime, status: "complete", package_records_emitted: packageRecordsEmitted, findings_emitted: findingsEmitted, duplicates: 0, diagnostics_count: 0, files_considered: 1, timed_out: false, duration_ms: 5 }
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
    // Byte-different resubmission with the SAME record_id: reorder the top-level keys onto one
    // physical line (NDJSON requires exactly one JSON object per line). sanitizeRecord() extracts
    // named fields via object property access and exactKeys() checks membership, not order, and
    // canonicalId() is computed from those extracted field values (ingest.ts:87-89, 133, 159) --
    // never from serialized key order -- so record_id is unaffected by this reordering.
    const reordered = Object.fromEntries(Object.entries(record()).reverse())
    const conflictBody = `${JSON.stringify(reordered)}\n`
    expect(conflictBody).not.toBe(body)
    expect(conflictBody.split("\n").filter((line) => line.length > 0)).toHaveLength(1)
    const conflict = await ingest(request(conflictBody)); expect(conflict.status).toBe(409); expect(await conflict.json()).toEqual({ error: "BUMBLEBEE_INGEST_RECORD_CONFLICT" })

    const client = await app.connect()
    try { await scoped(client, async () => {
      const rows = await client.query("SELECT sanitized_payload::text AS payload, redaction_provenance::text AS provenance FROM bumblebee_records")
      expect(rows.rows).toHaveLength(1)
      expect(JSON.stringify(rows.rows)).not.toMatch(/CANARY|package-lock\.json/)
      expect(rows.rows[0].provenance).toContain("source_file")
      await expect(client.query("UPDATE bumblebee_records SET run_id='changed'")).rejects.toThrow(/permission denied/)
    }) } finally { client.release() }
  })

  it("promotes a batch with a matching trailing scan_summary and records the composite-FK decision fact", async () => {
    const packageLine = JSON.stringify(record("9.9.9", "/secret/CANARY-DO-NOT-PERSIST/package-lock-2.json"))
    const summary = scanSummaryRecord(1, 0)
    const body = `${packageLine}\n${JSON.stringify(summary)}\n`
    const request = new Request("https://allura.example/api/plugins/bumblebee/ingest", { method: "POST", headers: { authorization: ["Bearer", TOKEN].join(" "), "content-type": "application/x-ndjson" }, body })
    const accepted = await ingest(request); expect(accepted.status).toBe(201)

    const client = await app.connect()
    try { await scoped(client, async () => {
      const rows = await client.query<{ decision: string; reason_code: string; summary_record_id: string }>(
        "SELECT decision, reason_code, summary_record_id FROM bumblebee_run_decisions WHERE summary_record_id=$1", [summary.record_id])
      expect(rows.rows).toHaveLength(1)
      expect(rows.rows[0]).toMatchObject({ decision: "promoted", reason_code: "PROMOTED_COMPLETE", summary_record_id: summary.record_id })

      // AC-11 (snapshot truth): the promoted package must surface through the
      // current-inventory view, scoped to this workspace/source/run via RLS on
      // the underlying tables (exercised here through the allura_app role).
      const inventoryRows = await client.query<{ record_id: string; record_type: string; run_id: string }>(
        "SELECT record_id, record_type, run_id FROM bumblebee_current_inventory WHERE run_id=$1", [RUN_ID])
      expect(inventoryRows.rows).toHaveLength(1)
      expect(inventoryRows.rows[0]).toMatchObject({ record_type: "package", run_id: RUN_ID })

      // AC-18 (retrieval half): the promoted run must surface through the
      // current-routine-runs view.
      const routineRunRows = await client.query<{ run_id: string; decision: string; reason_code: string }>(
        "SELECT run_id, decision, reason_code FROM bumblebee_current_routine_runs WHERE run_id=$1 AND decision='promoted'", [RUN_ID])
      expect(routineRunRows.rows.length).toBeGreaterThanOrEqual(1)
      expect(routineRunRows.rows[0]).toMatchObject({ run_id: RUN_ID, decision: "promoted", reason_code: "PROMOTED_COMPLETE" })
    }) } finally { client.release() }
  })

  it("proves FORCE RLS, non-ownership, and SELECT+INSERT-only grants", async () => {
    const facts = await app.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) owner, has_table_privilege(current_user,c.oid,'SELECT') can_select, has_table_privilege(current_user,c.oid,'INSERT') can_insert, has_table_privilege(current_user,c.oid,'UPDATE') can_update, has_table_privilege(current_user,c.oid,'DELETE') can_delete FROM pg_class c WHERE c.relname IN ('bumblebee_batch_receipts','bumblebee_records') ORDER BY c.relname`)
    expect(facts.rows).toHaveLength(2)
    for (const row of facts.rows) expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, can_select: true, can_insert: true, can_update: false, can_delete: false })
    expect(facts.rows.every((row) => row.owner !== "allura_app")).toBe(true)
  })
})
