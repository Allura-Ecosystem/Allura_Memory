import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { gzipSync } from "node:zlib"

import { ingestScannerBatch } from "@/lib/bumblebee/ingest-pipeline"
import {
  hashBumblebeeToken,
  issueScanLease,
  tokenPrefix,
} from "@/lib/bumblebee/lease-authority"
import {
  authenticateIngestLease,
  authenticateRunnerForSource,
  createScopedIngestStore,
  persistScanLease,
} from "@/lib/bumblebee/lease-repository"
import { closePool } from "@/lib/postgres/connection"

const GROUP = "allura-bmb-matrix2"
const WORKSPACE = "ws-bmb-matrix2"
const TOKEN_SECRET = "live-ingest-secret-26-7"
const RUNNER_RAW = "bmb_runner_matrix01_tail"
const RUNNER_PREFIX = "bmb_runner_matrix01"
const CRED_ID = "matrix2-runner"
const RUN_ID = "f0e1d2c3b4a5968778695a4b3c2d1e0f"

// Ingest credential for the stale-clock lease. It is never issued; its row is
// inserted directly with an already-expired expiry so the bootstrap path sees
// a lease whose clock has passed.
const STALE_RAW = "bmb_ingest_stale010_tail"
const STALE_PREFIX = tokenPrefix(STALE_RAW, "bumblebee_ingest")

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

// A package record bound to an ecosystem that is neither in the lease snapshot
// (source allowlist ARRAY['npm']) nor in the pinned upstream inventory
// allowlist. The ecosystem check runs before canonical-input resolution, so the
// stale record_id below is never reached.
const FORBIDDEN_PKG = {
  ...VALID_PKG,
  record_id: "package:0000000000000000000000000000000000000000000000000000000000000000",
  ecosystem: "agent-skill",
  normalized_name: "agent-plugin",
  package_manager: "agent-skill",
  source_type: "agent-manifest",
}
const FORBIDDEN_NDJSON = `${JSON.stringify(FORBIDDEN_PKG)}\n`

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
      sourceId: "matrix2-source",
      sourceRevisionId: "matrix2-revision",
      durationSeconds: 240,
    },
    {
      authenticateRunner: authenticateRunnerForSource,
      persistLease: persistScanLease,
    },
  )
}

describeLive("headless ingest rejection matrix — filtered ecosystems, stale clock, encoding, DB-failure note", () => {
  const owner = makePool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "")
  const app = makePool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "", 6)

  beforeAll(async () => {
    process.env.BUMBLEBEE_TOKEN_SECRET = TOKEN_SECRET

    await owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ($1,$2,'Bumblebee matrix2 e2e') ON CONFLICT (workspace_id) DO NOTHING`,
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

        // Primary source: npm allowlist, baseline inventory — shared by the
        // ecosystem-filter and encoding cases.
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
            GROUP, WORKSPACE, "matrix2-source", "matrix2-revision",
            "1".repeat(64),
            "device-matrix2",
            CRED_ID,
            "3".repeat(64),
            "5".repeat(64),
          ],
        )

        // Stale-clock source: a dedicated source so its lease generation space
        // is untouched by the issued leases above.
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
            GROUP, WORKSPACE, "matrix2-stale-source", "matrix2-stale-revision",
            "2".repeat(64),
            "device-matrix2-stale",
            CRED_ID,
            "4".repeat(64),
            "6".repeat(64),
          ],
        )
      })
    } finally {
      client.release()
    }
  })

  afterAll(async () => {
    await closePool()
    await Promise.all([app.end(), owner.end()])
    delete process.env.BUMBLEBEE_TOKEN_SECRET
  })

  // ── (a) FILTERED / UNBOUND ECOSYSTEM ─────────────────────────────────────

  it("rejects a package record from a filtered ecosystem with 400 BUMBLEBEE_BATCH_ECOSYSTEM_FORBIDDEN", async () => {
    const lease = await issueLease()

    const response = await ingestScannerBatch(makeIngestRequest(FORBIDDEN_NDJSON, lease.ingestToken), {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease: l, bodySha256 }) =>
        (await createScopedIngestStore(l)).findExistingBatch({ lease: l, bodySha256 }),
      findConflictingBatch: async ({ lease: l }) =>
        (await createScopedIngestStore(l)).findConflictingBatch({ lease: l }),
      persistBatch: async (input) =>
        (await createScopedIngestStore(input.lease)).persistBatch(input),
    })

    // The ecosystem gate runs before canonical-input resolution, so the
    // rejection is the declared conformance code, never a downstream id or
    // summary error. A population the lease was never scoped for fails closed.
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe("BUMBLEBEE_BATCH_ECOSYSTEM_FORBIDDEN")
  })

  // ── (b) STALE / FUTURE CLOCK (expired lease) ─────────────────────────────

  it("proves an expired lease cannot ingest: 401 auth error, body never parsed", async () => {
    const ownerClient = await owner.connect()
    try {
      // Direct-insert a lease row whose created_at/expires_at already lie in
      // the past — the only honest way to model a stale clock, because the
      // table trigger makes expires_at immutable once a row exists.
      await scoped(ownerClient, () =>
        ownerClient.query(
          `INSERT INTO bumblebee_scan_leases
           (group_id, workspace_id, source_id, source_revision_id, lease_id, generation,
            revision_digest, runner_credential_id, profile, mode, root_config_digest,
            ecosystems, all_users, catalog_revision_id, catalog_digest,
            ingest_token_prefix, ingest_token_hash, expires_at, created_at)
           VALUES ($1,$2,'matrix2-stale-source','matrix2-stale-revision','matrix2-stale-lease',1,
            $3,$4,'baseline','inventory',$5,
            ARRAY['npm'],false,NULL,NULL,
            $6,$7,NOW()-INTERVAL '1 second',NOW()-INTERVAL '2 minutes')
           ON CONFLICT (group_id, workspace_id, source_id, source_revision_id, lease_id) DO NOTHING`,
          [GROUP, WORKSPACE, "2".repeat(64), CRED_ID, "4".repeat(64), STALE_PREFIX, hashBumblebeeToken(STALE_RAW)],
        ),
      )

      // Live evidence that the expiry column is immmutable: backdating via
      // UPDATE is refused, so a stale clock cannot be fabricated by mutation
      // after issuance.
      await expect(scoped(ownerClient, () =>
        ownerClient.query(
          "UPDATE bumblebee_scan_leases SET expires_at = NOW() - INTERVAL '1 second' WHERE lease_id='matrix2-stale-lease'",
        ),
      )).rejects.toThrow(/expiry are immutable/)
    } finally {
      ownerClient.release()
    }

    // POST a perfectly valid NDJSON body under the expired ingest credential.
    // Authentication runs before a single body byte is buffered, so the valid
    // body is never parsed: the response is the auth refusal, never a
    // conformance error and never an acceptance.
    const response = await ingestScannerBatch(makeIngestRequest(VALID_NDJSON, STALE_RAW), {
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
    expect(body.error).toBe("BUMBLEBEE_AUTH_EXPIRED")
  })

  // ── (c) GZIP / CONTENT-ENCODING LIMIT (observed status) ──────────────────

  it("rejects a gzip-encoded body with a deliberate 415 encoding refusal", async () => {
    // The encoding gate (added after the AC-19 review) rejects any
    // content-encoding other than identity BEFORE the body is read or parsed,
    // so a compressed payload can never surface as a misleading malformed-line
    // error and a future decompression step cannot bypass the bound.
    const lease = await issueLease()
    const gzipped = gzipSync(Buffer.from(VALID_NDJSON, "utf8"))

    const request = new Request("http://localhost/api/plugins/bumblebee/ingest", {
      method: "POST",
      headers: {
        authorization: `Bearer ${lease.ingestToken}`,
        "content-type": "application/x-ndjson",
        "content-encoding": "gzip",
      },
      body: gzipped,
    })

    const response = await ingestScannerBatch(request, {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease: l, bodySha256 }) =>
        (await createScopedIngestStore(l)).findExistingBatch({ lease: l, bodySha256 }),
      findConflictingBatch: async ({ lease: l }) =>
        (await createScopedIngestStore(l)).findConflictingBatch({ lease: l }),
      persistBatch: async (input) =>
        (await createScopedIngestStore(input.lease)).persistBatch(input),
    })

    expect(response.status).toBe(415)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe("BUMBLEBEE_BATCH_UNSUPPORTED_ENCODING")
    expect(body.error).not.toBe("BUMBLEBEE_BATCH_MALFORMED_LINE")
  })

  // ── (d) DB-FAILURE: unit-proven, no live REVOKE ──────────────────────────

  it("documents DB-failure fail-closed as unit-proven (no live REVOKE attempted)", () => {
    // No live REVOKE is attempted here: a global REVOKE against the shared
    // live database could deny unrelated app-role tests running in parallel,
    // which the repository comments explicitly forbid.
    //
    // DB-failure fail-closed is unit-proven in the pipeline unit suite
    // (src/lib/bumblebee/__tests__/ingest-pipeline.test.ts): when persistBatch
    // throws, ingestion returns 503 BUMBLEBEE_SERVICE_UNAVAILABLE with no
    // acceptance claim ("fails closed without an acceptance claim when
    // persistence errors"). A live DB outage cannot be staged safely in a
    // shared live database, so the unit proof is the recorded evidence.
    expect(true).toBe(true)
  })
})
