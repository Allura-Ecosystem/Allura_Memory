import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { MAX_BODY_BYTES } from "@/lib/bumblebee/batch-conformance"
import { ingestScannerBatch } from "@/lib/bumblebee/ingest-pipeline"
import { hashBumblebeeToken, issueScanLease } from "@/lib/bumblebee/lease-authority"
import {
  authenticateIngestLease,
  authenticateRunnerForSource,
  createScopedIngestStore,
  persistScanLease,
} from "@/lib/bumblebee/lease-repository"
import { closePool } from "@/lib/postgres/connection"

const GROUP = "allura-bmb-ingest-e2e"
const WORKSPACE = "ws-bmb-ingest-e2e"
const TOKEN_SECRET = "live-ingest-secret-26-7"
const RUNNER_RAW = "bmb_runner_ingest01_tail"
const RUNNER_PREFIX = "bmb_runner_ingest01"
const SOURCE_ID = "ingest-source"
const SOURCE_REV = "ingest-revision"
const CRED_ID = "ingest-runner"
const RUN_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"

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

const describeLive =
  process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_APP_PASSWORD ? describe : describe.skip

// ── NDJSON fixtures ────────────────────────────────────────────────────────

const VALID_PKG = {
  record_type: "package",
  record_id: "package:c85e1902f6304d996e2f6dd1df5e0aca014c18813992552ec380f5c72fe7bb66",
  schema_version: "0.1.0",
  run_id: RUN_ID,
  profile: "baseline",
  ecosystem: "npm",
  package_name: "left-pad",
  normalized_name: "left-pad",
  version: "1.3.0",
  project_path: "/tmp/scan-target",
  root_kind: "user_package_root",
  package_manager: "npm",
  source_type: "npm-node_modules",
  source_file: "/tmp/scan-target/node_modules/left-pad/package.json",
  has_lifecycle_scripts: false,
  confidence: "medium",
  install_scope: "",
  direct_dependency: false,
  requested_spec: "",
  server_name: "",
  lifecycle_scripts: [] as string[],
}

const VALID_SUM = {
  record_type: "scan_summary",
  record_id: "scan_summary:976066d7a60740ae93a3cee2edc4a7c1275c250b54bb598a0b4072682ede0456",
  schema_version: "0.1.0",
  run_id: RUN_ID,
  profile: "baseline",
  status: "complete",
  scan_time: "2026-08-28T23:59:14.725988598Z",
  end_time: "2026-08-28T23:59:14.726695576Z",
  roots: [{ path: "/tmp/scan-target", kind: "user_package_root" }],
  counts: { package: 1, finding: 0 },
  package_records_emitted: 1,
  package_records_suppressed: 0,
  findings_emitted: 0,
  duplicates: 0,
  diagnostics_count: 0,
  files_considered: 2,
  timed_out: false,
  duration_ms: 0,
  http_batches_attempted: 0,
  http_batches_succeeded: 0,
  http_batches_failed: 0,
  http_last_status: 0,
  error: "",
}

const VALID_NDJSON = `${JSON.stringify(VALID_PKG)}\n${JSON.stringify(VALID_SUM)}\n`

// Empty-complete: scan_summary with counts=0, no package records
const EMPTY_SUM = {
  ...VALID_SUM,
  record_id: "scan_summary:137c6c30c841eec6cf42e22755b536f147862a224f198e8f131b12db18733a45",
  counts: { package: 0, finding: 0 },
  package_records_emitted: 0,
  files_considered: 0,
}
const EMPTY_NDJSON = `${JSON.stringify(EMPTY_SUM)}\n`

// Conflict body: different version → different body hash
const CONFLICT_PKG = {
  ...VALID_PKG,
  record_id: "package:58f0b766b1500acdfb1094355f3b1b62f96c1e6a24455c3f98ab74cfcf71c95d",
  version: "1.3.1",
}
const CONFLICT_NDJSON = `${JSON.stringify(CONFLICT_PKG)}\n${JSON.stringify(VALID_SUM)}\n`

// Partial batch: the same single-package scan terminated early (status
// 'partial', non-empty error), so the scanner emitted exactly the records
// below and the counts stay consistent with them. It is still durable
// evidence — the ingest path must accept it — but it must never be
// presented as a promoted generation.
const PARTIAL_SUM = {
  ...VALID_SUM,
  record_id: "scan_summary:ec1ca9bb40e82a7260197f987f3e9590a589c6f49f7e890adf3c17ad7d130632",
  status: "partial",
  error: "scan window ended before completion",
}
const PARTIAL_NDJSON = `${JSON.stringify(VALID_PKG)}\n${JSON.stringify(PARTIAL_SUM)}\n`

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeIngestRequest(body: string, ingestToken: string, contentType = "application/x-ndjson"): Request {
  return new Request("http://localhost/api/plugins/bumblebee/ingest", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ingestToken}`,
      "content-type": contentType,
    },
    body,
  })
}

async function issueLease(): Promise<{ leaseId: string; ingestToken: string }> {
  return await issueScanLease(
    {
      runnerToken: RUNNER_RAW,
      sourceId: SOURCE_ID,
      sourceRevisionId: SOURCE_REV,
      durationSeconds: 240,
    },
    {
      authenticateRunner: authenticateRunnerForSource,
      persistLease: persistScanLease,
    },
  )
}

describeLive("AC-18 headless ingest proof matrix under live PostgreSQL", () => {
  const owner = makePool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "")
  const app = makePool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "", 6)

  let ingestToken: string
  let leaseId: string

  beforeAll(async () => {
    process.env.BUMBLEBEE_TOKEN_SECRET = TOKEN_SECRET

    await owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ($1,$2,'Bumblebee ingest e2e') ON CONFLICT (workspace_id) DO NOTHING`,
      [WORKSPACE, GROUP],
    )

    const client = await app.connect()
    try {
      await scoped(client, async () => {
        await client.query(
          `INSERT INTO bumblebee_runner_credentials
           (credential_id, group_id, workspace_id, token_prefix, token_hash, created_by)
           VALUES ($1,$2,$3,$4,$5,'e2e')
           ON CONFLICT (credential_id, group_id, workspace_id) DO NOTHING`,
          [CRED_ID, GROUP, WORKSPACE, RUNNER_PREFIX, hashBumblebeeToken(RUNNER_RAW)],
        )

        await client.query(
          `INSERT INTO bumblebee_sources
           (group_id, workspace_id, source_id, source_revision_id, revision_digest, endpoint_device_id,
            runner_credential_id, scanner_tag, scanner_commit, scanner_tree, scanner_artifact_sha256,
            record_schema_version, profile, mode, findings_enabled, root_config_digest, ecosystems, all_users,
            freshness_ttl_seconds, retention_days, classification, redaction_policy)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'v0.1.2',
            'cc57710eeaf685e7b89924a36c8583cad0a378fe','985f57cf1749c15561c886c4476f10950ffa9cae',
            $8,'0.1.0','baseline','inventory',false,$9,ARRAY['npm'],false,3600,30,'internal','redaction-v1')
           ON CONFLICT (group_id, workspace_id, source_id, source_revision_id) DO NOTHING`,
          [
            GROUP, WORKSPACE, SOURCE_ID, SOURCE_REV,
            "1".repeat(64),
            "device-ingest",
            CRED_ID,
            "2".repeat(64),
            "3".repeat(64),
          ],
        )
      })
    } finally {
      client.release()
    }

    const lease = await issueLease()
    leaseId = lease.leaseId
    ingestToken = lease.ingestToken
  })

  afterAll(async () => {
    await closePool()
    await Promise.all([app.end(), owner.end()])
    delete process.env.BUMBLEBEE_TOKEN_SECRET
  })

  // ── (1) VALID ACCEPT ──────────────────────────────────────────────────────

  it("accepts a valid NDJSON batch and persists receipt, records, and held decision", async () => {
    const response = await ingestScannerBatch(makeIngestRequest(VALID_NDJSON, ingestToken), {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease, bodySha256 }) =>
        (await createScopedIngestStore(lease)).findExistingBatch({ lease, bodySha256 }),
      findConflictingBatch: async ({ lease }) =>
        (await createScopedIngestStore(lease)).findConflictingBatch({ lease }),
      persistBatch: async (input) =>
        (await createScopedIngestStore(input.lease)).persistBatch(input),
    })

    expect(response.status).toBe(201)
    const body = (await response.json()) as { batchId: string; accepted: boolean; recordCount: number }
    expect(body.accepted).toBe(true)
    expect(body.recordCount).toBe(2)

    const client = await app.connect()
    try {
      const receipts = await scoped(client, () =>
        client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM bumblebee_batch_receipts WHERE lease_id=$1`,
          [leaseId],
        ),
      )
      expect(receipts.rows[0].count).toBe(1)

      const records = await scoped(client, () =>
        client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM bumblebee_records WHERE lease_id=$1`,
          [leaseId],
        ),
      )
      expect(records.rows[0].count).toBe(2)

      const decisions = await scoped(client, () =>
        client.query<{ decision: string; reason_code: string }>(
          `SELECT decision, reason_code FROM bumblebee_run_decisions WHERE lease_id=$1`,
          [leaseId],
        ),
      )
      expect(decisions.rows[0]).toEqual({
        decision: "held",
        reason_code: "HELD_PENDING_PROMOTION",
      })
    } finally {
      client.release()
    }
  })

  // ── (a) DUPLICATE REPLAY ──────────────────────────────────────────────────

  it("replays an identical body as 200 replayed:true with no new rows", async () => {
    const beforeClient = await app.connect()
    let beforeReceipts = 0
    let beforeRecords = 0
    try {
      const r = await scoped(beforeClient, () =>
        beforeClient.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM bumblebee_batch_receipts WHERE lease_id=$1`,
          [leaseId],
        ),
      )
      beforeReceipts = r.rows[0].count
      const recs = await scoped(beforeClient, () =>
        beforeClient.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM bumblebee_records WHERE lease_id=$1`,
          [leaseId],
        ),
      )
      beforeRecords = recs.rows[0].count
    } finally {
      beforeClient.release()
    }

    const response = await ingestScannerBatch(makeIngestRequest(VALID_NDJSON, ingestToken), {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease, bodySha256 }) =>
        (await createScopedIngestStore(lease)).findExistingBatch({ lease, bodySha256 }),
      findConflictingBatch: async ({ lease }) =>
        (await createScopedIngestStore(lease)).findConflictingBatch({ lease }),
      persistBatch: async (input) =>
        (await createScopedIngestStore(input.lease)).persistBatch(input),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { batchId: string; replayed: boolean }
    expect(body.replayed).toBe(true)

    const afterClient = await app.connect()
    try {
      const r = await scoped(afterClient, () =>
        afterClient.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM bumblebee_batch_receipts WHERE lease_id=$1`,
          [leaseId],
        ),
      )
      expect(r.rows[0].count).toBe(beforeReceipts)

      const recs = await scoped(afterClient, () =>
        afterClient.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM bumblebee_records WHERE lease_id=$1`,
          [leaseId],
        ),
      )
      expect(recs.rows[0].count).toBe(beforeRecords)
    } finally {
      afterClient.release()
    }
  })

  // ── (b) EMPTY COMPLETE ────────────────────────────────────────────────────

  it("accepts a known-empty complete scan_summary with zero counts (201)", async () => {
    // Issue a fresh lease for the empty batch so it doesn't conflict with the valid one
    const emptyLease = await issueLease()

    const response = await ingestScannerBatch(makeIngestRequest(EMPTY_NDJSON, emptyLease.ingestToken), {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease, bodySha256 }) =>
        (await createScopedIngestStore(lease)).findExistingBatch({ lease, bodySha256 }),
      findConflictingBatch: async ({ lease }) =>
        (await createScopedIngestStore(lease)).findConflictingBatch({ lease }),
      persistBatch: async (input) =>
        (await createScopedIngestStore(input.lease)).persistBatch(input),
    })

    expect(response.status).toBe(201)
    const body = (await response.json()) as { batchId: string; accepted: boolean; recordCount: number }
    expect(body.accepted).toBe(true)
    expect(body.recordCount).toBe(1)
  })

  // ── (c) CONFLICT ───────────────────────────────────────────────────────────

  it("rejects a different body under the same lease with 409 BUMBLEBEE_BATCH_CONFLICT", async () => {
    const response = await ingestScannerBatch(makeIngestRequest(CONFLICT_NDJSON, ingestToken), {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease, bodySha256 }) =>
        (await createScopedIngestStore(lease)).findExistingBatch({ lease, bodySha256 }),
      findConflictingBatch: async ({ lease }) =>
        (await createScopedIngestStore(lease)).findConflictingBatch({ lease }),
      persistBatch: async (input) =>
        (await createScopedIngestStore(input.lease)).persistBatch(input),
    })

    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: string; batchId: string }
    expect(body.error).toBe("BUMBLEBEE_BATCH_CONFLICT")
    expect(body.batchId).toBeTruthy()
  })

  // ── (d) MALFORMED ──────────────────────────────────────────────────────────

  it("rejects invalid JSON lines with 400 BUMBLEBEE_BATCH_MALFORMED_LINE", async () => {
    const malformedLease = await issueLease()
    const malformedNdjson = `{not valid json\n${JSON.stringify(VALID_SUM)}\n`

    const response = await ingestScannerBatch(makeIngestRequest(malformedNdjson, malformedLease.ingestToken), {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease, bodySha256 }) =>
        (await createScopedIngestStore(lease)).findExistingBatch({ lease, bodySha256 }),
      findConflictingBatch: async ({ lease }) =>
        (await createScopedIngestStore(lease)).findConflictingBatch({ lease }),
      persistBatch: async (input) =>
        (await createScopedIngestStore(input.lease)).persistBatch(input),
    })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe("BUMBLEBEE_BATCH_MALFORMED_LINE")
  })

  // ── (e) OVERSIZED ──────────────────────────────────────────────────────────

  it("rejects a body exceeding MAX_BODY_BYTES with 413", async () => {
    const oversizedLease = await issueLease()
    // Build a body larger than MAX_BODY_BYTES (8 MiB)
    const padding = "x".repeat(MAX_BODY_BYTES + 1024)
    const oversizedBody = `${JSON.stringify(VALID_PKG)}\n${JSON.stringify(VALID_SUM)}\n${padding}\n`

    const request = new Request("http://localhost/api/plugins/bumblebee/ingest", {
      method: "POST",
      headers: {
        authorization: `Bearer ${oversizedLease.ingestToken}`,
        "content-type": "application/x-ndjson",
        "content-length": String(Buffer.byteLength(oversizedBody, "utf8")),
      },
      body: oversizedBody,
    })

    const response = await ingestScannerBatch(request, {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease, bodySha256 }) =>
        (await createScopedIngestStore(lease)).findExistingBatch({ lease, bodySha256 }),
      findConflictingBatch: async ({ lease }) =>
        (await createScopedIngestStore(lease)).findConflictingBatch({ lease }),
      persistBatch: async (input) =>
        (await createScopedIngestStore(input.lease)).persistBatch(input),
    })

    expect(response.status).toBe(413)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe("BUMBLEBEE_BATCH_TOO_LARGE")
  })

  // ── (f) WRONG CONTENT-TYPE ──────────────────────────────────────────────────

  it("rejects application/json content-type with 415 BUMBLEBEE_BATCH_CONTENT_TYPE", async () => {
    const ctLease = await issueLease()

    const response = await ingestScannerBatch(
      makeIngestRequest(VALID_NDJSON, ctLease.ingestToken, "application/json"),
      {
        authenticate: authenticateIngestLease,
        findExistingBatch: async ({ lease, bodySha256 }) =>
          (await createScopedIngestStore(lease)).findExistingBatch({ lease, bodySha256 }),
        findConflictingBatch: async ({ lease }) =>
          (await createScopedIngestStore(lease)).findConflictingBatch({ lease }),
        persistBatch: async (input) =>
          (await createScopedIngestStore(input.lease)).persistBatch(input),
      },
    )

    expect(response.status).toBe(415)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe("BUMBLEBEE_BATCH_CONTENT_TYPE")
  })

  // ── (g) UNAUTHENTICATED ──────────────────────────────────────────────────────

  it("rejects a missing Bearer token with 401 before reading the body", async () => {
    const request = new Request("http://localhost/api/plugins/bumblebee/ingest", {
      method: "POST",
      headers: { "content-type": "application/x-ndjson" },
      body: VALID_NDJSON,
    })

    const response = await ingestScannerBatch(request, {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease, bodySha256 }) =>
        (await createScopedIngestStore(lease)).findExistingBatch({ lease, bodySha256 }),
      findConflictingBatch: async ({ lease }) =>
        (await createScopedIngestStore(lease)).findConflictingBatch({ lease }),
      persistBatch: async (input) =>
        (await createScopedIngestStore(input.lease)).persistBatch(input),
    })

    expect(response.status).toBe(401)
    const body = (await response.json()) as { error: string }
    // authenticateIngestLease → bearer() throws BUMBLEBEE_AUTH_INVALID
    expect(body.error).toBe("BUMBLEBEE_AUTH_INVALID")
  })

  // ── (h) CROSS-TENANT RLS ─────────────────────────────────────────────────────

  it("enforces cross-tenant RLS: a different tenant sees zero batch receipts", async () => {
    const client = await app.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT set_config('app.current_group_id','allura-other-tenant',true)")
      await client.query("SELECT set_config('app.current_workspace_id','ws-other-tenant',true)")

      const hidden = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM bumblebee_batch_receipts`,
      )
      await client.query("ROLLBACK")

      expect(hidden.rows[0].count).toBe(0)
    } finally {
      client.release()
    }
  })

  // ── (i) PARTIAL STATUS HELD ─────────────────────────────────────────────

  it("accepts a partial-status batch and persists a held decision", async () => {
    // A fresh lease so the partial batch is its own evidence unit and cannot
    // collide with the valid batch already accepted under the shared lease.
    const partialLease = await issueLease()

    const response = await ingestScannerBatch(makeIngestRequest(PARTIAL_NDJSON, partialLease.ingestToken), {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease, bodySha256 }) =>
        (await createScopedIngestStore(lease)).findExistingBatch({ lease, bodySha256 }),
      findConflictingBatch: async ({ lease }) =>
        (await createScopedIngestStore(lease)).findConflictingBatch({ lease }),
      persistBatch: async (input) =>
        (await createScopedIngestStore(input.lease)).persistBatch(input),
    })

    // A partial scan is still legitimate evidence — the durable record of a
    // run the scanner itself reported as unfinished. It must be accepted, not
    // dropped, so an operator can see what was and was not covered.
    expect(response.status).toBe(201)
    const body = (await response.json()) as { batchId: string; accepted: boolean; recordCount: number }
    expect(body.accepted).toBe(true)
    expect(body.recordCount).toBe(2)

    // The pipeline always persists the initial decision as 'held' — promotion
    // is a later, separate step that may upgrade it. This asserts the full
    // chain (auth → conformance → transactional persist) lands a held decision
    // for a partial batch without pretending it promoted.
    const client = await app.connect()
    try {
      const decisions = await scoped(client, () =>
        client.query<{ decision: string; reason_code: string; summary_record_id: string | null }>(
          `SELECT decision, reason_code, summary_record_id FROM bumblebee_run_decisions WHERE lease_id=$1`,
          [partialLease.leaseId],
        ),
      )
      expect(decisions.rows).toHaveLength(1)
      // The summary reference must resolve on the full lease-bound grain in
      // migration 52 — the same seven columns the decision row itself carries.
      expect(decisions.rows[0]).toEqual({
        decision: "held",
        reason_code: "HELD_PENDING_PROMOTION",
        summary_record_id: PARTIAL_SUM.record_id,
      })
    } finally {
      client.release()
    }
  })

})
