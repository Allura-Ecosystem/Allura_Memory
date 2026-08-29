import { createHash } from "node:crypto"

import { Pool, type PoolClient, type QueryResultRow } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { hashBumblebeeToken } from "@/lib/bumblebee/lease-authority"
import { closePool } from "@/lib/postgres/connection"

// This suite exists because migration 50's views are a relational contract,
// not a text pattern: a text-shape test (see
// src/lib/bumblebee/__tests__/current-state-views-migration.test.ts) can only
// prove the SQL contains the expected clauses -- it cannot prove the views
// actually return rows under RLS as the app role, that a second, higher-
// generation promoted scan replaces the first in bumblebee_current_inventory,
// or that a deep run is excluded from the routine/inventory views while a
// held run still surfaces in bumblebee_incomplete_runs. Only a live database
// that has run migrations 46-50 in order can prove that. This is the exact
// defect class Knuth found in the superseded 48-bumblebee-ingest-ledger.sql
// attempt: a view with no generation predicate passed its live test only
// because the fixture had a single generation.
const GROUP = "allura-bmb-views-e2e"
const FOREIGN_GROUP = "allura-bmb-views-e2e-foreign-tenant"
const WORKSPACE = "ws-bmb-views-e2e"
const TOKEN_SECRET = "live-views-e2e-token-secret-26-7"

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

async function scoped<T>(client: PoolClient, work: (client: PoolClient) => Promise<T>): Promise<T> {
  await client.query("BEGIN")
  try {
    await client.query("SELECT set_config('app.current_group_id', $1, true)", [GROUP])
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [WORKSPACE])
    const result = await work(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}

const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_APP_PASSWORD ? describe : describe.skip

function sha(seed: string): string {
  return createHash("sha256").update(seed).digest("hex")
}

interface SourceFixture {
  sourceId: string
  sourceRevisionId: string
  profile: "baseline" | "project" | "deep"
  freshnessTtlSeconds: number
}

describeLive("Story 26.7 migration 50 Bumblebee current-state views against fresh allura_app PostgreSQL", () => {
  const owner = makePool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "")
  const app = makePool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "", 8)

  const RUNNER_CREDENTIAL_ID = "views-e2e-runner"

  async function createSource(client: PoolClient, fixture: SourceFixture): Promise<void> {
    await client.query(
      `INSERT INTO bumblebee_sources
         (group_id, workspace_id, source_id, source_revision_id, revision_digest, endpoint_device_id,
          runner_credential_id, scanner_tag, scanner_commit, scanner_tree, scanner_artifact_sha256,
          record_schema_version, profile, mode, findings_enabled, root_config_digest, ecosystems, all_users,
          freshness_ttl_seconds, retention_days, classification, redaction_policy)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,'v0.1.2','cc57710eeaf685e7b89924a36c8583cad0a378fe',
          '985f57cf1749c15561c886c4476f10950ffa9cae',$8,'0.1.0',$9,'inventory',false,$10,ARRAY['npm'],false,$11,30,'internal','redaction-v1')`,
      [
        GROUP, WORKSPACE, fixture.sourceId, fixture.sourceRevisionId,
        sha(`revision-digest:${fixture.sourceRevisionId}`), `device-${fixture.sourceId}`,
        RUNNER_CREDENTIAL_ID, sha(`artifact:${fixture.sourceId}`), fixture.profile,
        sha(`root-config:${fixture.sourceId}`), fixture.freshnessTtlSeconds,
      ],
    )
  }

  // bmb_ingest_<8 chars> is globally unique at the DB level
  // (bumblebee_scan_leases_ingest_token_prefix_key). leaseId.slice(0, 8) is
  // NOT safe for that: "routine-lease-1" and "routine-lease-2" both slice to
  // "routine-", so a second generation on the same partition would collide on
  // insert and the multi-generation scenario could never run. Derive the body
  // from a hash of the FULL leaseId instead, so distinct lease ids reliably
  // produce distinct prefixes, and track every body issued so a future
  // collision (e.g. a copy-pasted fixture id) fails the suite immediately
  // instead of surfacing as an opaque unique-constraint error deep in a query.
  const issuedTokenBodies = new Set<string>()

  async function issueLease(client: PoolClient, fixture: SourceFixture, leaseId: string): Promise<number> {
    const body = sha(`ingest-token-body:${leaseId}`).slice(0, 8)
    if (issuedTokenBodies.has(body)) {
      throw new Error(
        `Fixture bug: lease id "${leaseId}" hashes to ingest-token body "${body}", which was already ` +
          `issued by another lease in this suite. Rename one of the lease ids -- this would silently ` +
          `collide on bumblebee_scan_leases_ingest_token_prefix_key instead of failing loudly here.`,
      )
    }
    issuedTokenBodies.add(body)
    const token = `bmb_ingest_${body}`
    const prefix = token.slice(0, "bmb_ingest_".length + 8)
    const result = await client.query<{ issue_bumblebee_scan_lease: string }>(
      `SELECT app.issue_bumblebee_scan_lease($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '2 minutes')`,
      [fixture.sourceId, fixture.sourceRevisionId, RUNNER_CREDENTIAL_ID, leaseId, prefix, hashBumblebeeToken(token)],
    )
    return Number(result.rows[0].issue_bumblebee_scan_lease)
  }

  async function insertBatch(
    client: PoolClient,
    fixture: SourceFixture,
    leaseId: string,
    batchId: string,
    recordCount: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO bumblebee_batch_receipts
         (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, body_sha256,
          byte_count, line_count, record_count, sanitized_payload_digest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,100,$8,$8,$9)`,
      [
        GROUP, WORKSPACE, fixture.sourceId, fixture.sourceRevisionId, leaseId, batchId,
        sha(`body:${leaseId}:${batchId}`), recordCount, sha(`payload:${leaseId}:${batchId}`),
      ],
    )
  }

  async function insertRecord(
    client: PoolClient,
    fixture: SourceFixture,
    leaseId: string,
    batchId: string,
    runId: string,
    recordId: string,
    recordType: "package" | "scan_summary",
  ): Promise<void> {
    await client.query(
      `INSERT INTO bumblebee_records
         (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, run_id, record_id,
          record_type, sanitized_payload, canonical_id_inputs, line_number, line_sha256, redaction_provenance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,$13)`,
      [
        GROUP, WORKSPACE, fixture.sourceId, fixture.sourceRevisionId, leaseId, batchId, runId, recordId,
        recordType, JSON.stringify({ recordId }), JSON.stringify({ recordId }),
        sha(`line:${leaseId}:${batchId}:${recordId}`), JSON.stringify({}),
      ],
    )
  }

  async function insertDecision(
    client: PoolClient,
    fixture: SourceFixture,
    leaseId: string,
    batchId: string,
    decisionId: string,
    runId: string,
    decision: "promoted" | "held",
    summaryRecordId: string | null,
  ): Promise<void> {
    await client.query(
      `INSERT INTO bumblebee_run_decisions
         (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, decision_id, run_id,
          summary_record_id, decision, reason_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        GROUP, WORKSPACE, fixture.sourceId, fixture.sourceRevisionId, leaseId, batchId, decisionId, runId,
        summaryRecordId, decision, decision === "promoted" ? "PROMOTED_COMPLETE" : "HELD_PARTIAL",
      ],
    )
  }

  /** One lease + one batch + (packageCount packages, one scan_summary) + one decision. */
  async function scanAndDecide(
    client: PoolClient,
    fixture: SourceFixture,
    leaseId: string,
    packageCount: number,
    decision: "promoted" | "held",
  ): Promise<void> {
    await issueLease(client, fixture, leaseId)
    const batchId = `batch-${leaseId}`
    const runId = `run-${leaseId}`
    await insertBatch(client, fixture, leaseId, batchId, packageCount + 1)
    for (let i = 0; i < packageCount; i += 1) {
      await insertRecord(client, fixture, leaseId, batchId, runId, `package:${leaseId}:${i}`, "package")
    }
    const summaryRecordId = `scan_summary:${leaseId}`
    await insertRecord(client, fixture, leaseId, batchId, runId, summaryRecordId, "scan_summary")
    await insertDecision(
      client, fixture, leaseId, batchId, `decision-${leaseId}`, runId, decision,
      decision === "promoted" ? summaryRecordId : null,
    )
  }

  const routineSource: SourceFixture = { sourceId: "routine-source", sourceRevisionId: "routine-rev", profile: "baseline", freshnessTtlSeconds: 3600 }
  const deepSource: SourceFixture = { sourceId: "deep-source", sourceRevisionId: "deep-rev", profile: "deep", freshnessTtlSeconds: 3600 }
  const emptySource: SourceFixture = { sourceId: "empty-source", sourceRevisionId: "empty-rev", profile: "project", freshnessTtlSeconds: 3600 }
  const neverScannedSource: SourceFixture = { sourceId: "never-source", sourceRevisionId: "never-rev", profile: "baseline", freshnessTtlSeconds: 3600 }
  const heldSource: SourceFixture = { sourceId: "held-source", sourceRevisionId: "held-rev", profile: "baseline", freshnessTtlSeconds: 3600 }

  beforeAll(async () => {
    // hashBumblebeeToken() (via issueLease() above) and the app-role RLS
    // helpers below all route through lease-authority.ts's secret(), which
    // throws unless BUMBLEBEE_TOKEN_SECRET is set (>=16 chars). The sibling
    // suites (bumblebee-scan-leases.e2e.test.ts,
    // bumblebee-ingest-bootstrap-contract.e2e.test.ts) each set this in their
    // own beforeAll; this suite must too, or every test here fails before a
    // single assertion runs.
    process.env.BUMBLEBEE_TOKEN_SECRET = TOKEN_SECRET

    await owner.query(`INSERT INTO workspaces (workspace_id, group_id, name)
      VALUES ($1,$2,'Bumblebee current-state views e2e') ON CONFLICT (workspace_id) DO NOTHING`, [WORKSPACE, GROUP])

    const client = await app.connect()
    try {
      await scoped(client, async () => {
        await client.query(
          `INSERT INTO bumblebee_runner_credentials
             (credential_id,group_id,workspace_id,token_prefix,token_hash,created_by)
           VALUES ($1,$2,$3,'bmb_runner_viewse2e','${"a".repeat(64)}','e2e')`,
          [RUNNER_CREDENTIAL_ID, GROUP, WORKSPACE],
        )

        for (const fixture of [routineSource, deepSource, emptySource, neverScannedSource, heldSource]) {
          await createSource(client, fixture)
        }

        // Scenario A: two generations of promoted scans on the same routine
        // partition. Generation 2 must REPLACE generation 1 in the inventory.
        await scanAndDecide(client, routineSource, "routine-lease-1", 2, "promoted")
        await scanAndDecide(client, routineSource, "routine-lease-2", 3, "promoted")

        // Scenario B: a promoted deep scan must never surface in the routine
        // views, only (if anywhere) a dedicated campaign-evidence view.
        await scanAndDecide(client, deepSource, "deep-lease-1", 5, "promoted")

        // Scenario C: a promoted scan with zero packages is a known-empty
        // state (a real row with count 0), never coalesced with "never
        // scanned" (no row at all -- neverScannedSource gets no lease).
        await scanAndDecide(client, emptySource, "empty-lease-1", 0, "promoted")

        // Scenario D: a held decision must appear in incomplete_runs and must
        // never appear in current_inventory.
        await scanAndDecide(client, heldSource, "held-lease-1", 2, "held")
      })
    } finally { client.release() }
  })

  afterAll(async () => {
    await closePool()
    await Promise.all([app.end(), owner.end()])
  })

  async function queryScoped<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await app.connect()
    try {
      return await scoped(client, async () => {
        const result = await client.query<T>(sql, params)
        return result.rows
      })
    } finally { client.release() }
  }

  /** Same query, but scoped to a DIFFERENT tenant than the one that owns the fixture rows. */
  async function queryAsForeignTenant<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await app.connect()
    try {
      await client.query("BEGIN")
      try {
        await client.query("SELECT set_config('app.current_group_id', $1, true)", [FOREIGN_GROUP])
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [WORKSPACE])
        const result = await client.query<T>(sql, params)
        await client.query("COMMIT")
        return result.rows
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    } finally { client.release() }
  }

  /** Same query, but with NO tenant context set at all -- must fail closed. */
  async function queryWithNoTenantContext<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await app.connect()
    try {
      // Deliberately do not set app.current_group_id / app.current_workspace_id.
      const result = await client.query<T>(sql, params)
      return result.rows
    } finally { client.release() }
  }

  it("shows a promoted scan in current_inventory with its packages", async () => {
    const rows = await queryScoped(
      `SELECT * FROM bumblebee_current_inventory WHERE source_id = $1`, [routineSource.sourceId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ generation: "2", package_count: "3" })
  })

  it("replaces generation 1 with generation 2 for the same routine partition -- not a union of both", async () => {
    const rows = await queryScoped<{ packages: { recordId: string }[] }>(
      `SELECT packages FROM bumblebee_current_inventory WHERE source_id = $1`, [routineSource.sourceId],
    )
    expect(rows).toHaveLength(1)
    const recordIds = rows[0].packages.map((p) => p.recordId).sort()
    expect(recordIds).toEqual([
      "package:routine-lease-2:0", "package:routine-lease-2:1", "package:routine-lease-2:2",
    ])
    expect(recordIds.some((id) => id.includes("routine-lease-1"))).toBe(false)
  })

  it("excludes a promoted deep run from current_inventory and current_routine_runs", async () => {
    const inventoryRows = await queryScoped(
      `SELECT * FROM bumblebee_current_inventory WHERE source_id = $1`, [deepSource.sourceId],
    )
    expect(inventoryRows).toHaveLength(0)

    const routineRows = await queryScoped(
      `SELECT * FROM bumblebee_current_routine_runs WHERE source_id = $1`, [deepSource.sourceId],
    )
    expect(routineRows).toHaveLength(0)
  })

  it("distinguishes a known-empty promoted scan (real row, zero packages) from a never-scanned revision (no row)", async () => {
    const emptyRows = await queryScoped(
      `SELECT * FROM bumblebee_current_inventory WHERE source_id = $1`, [emptySource.sourceId],
    )
    expect(emptyRows).toHaveLength(1)
    expect(emptyRows[0]).toMatchObject({ package_count: "0", packages: [] })

    const neverScannedRows = await queryScoped(
      `SELECT * FROM bumblebee_current_inventory WHERE source_id = $1`, [neverScannedSource.sourceId],
    )
    expect(neverScannedRows).toHaveLength(0)
  })

  it("surfaces a held run in incomplete_runs and keeps it out of current_inventory", async () => {
    const incompleteRows = await queryScoped(
      `SELECT * FROM bumblebee_incomplete_runs WHERE source_id = $1`, [heldSource.sourceId],
    )
    expect(incompleteRows).toHaveLength(1)
    expect(incompleteRows[0]).toMatchObject({ decision: "held", reason_code: "HELD_PARTIAL" })

    const inventoryRows = await queryScoped(
      `SELECT * FROM bumblebee_current_inventory WHERE source_id = $1`, [heldSource.sourceId],
    )
    expect(inventoryRows).toHaveLength(0)
  })

  it("exposes generation, decided_at, and freshness_ttl_seconds on current_routine_runs for caller-computed staleness", async () => {
    const rows = await queryScoped<{ generation: string; decided_at: Date; freshness_ttl_seconds: number }>(
      `SELECT * FROM bumblebee_current_routine_runs WHERE source_id = $1`, [routineSource.sourceId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].generation).toBe("2")
    expect(rows[0].decided_at).toBeTruthy()
    expect(rows[0].freshness_ttl_seconds).toBe(routineSource.freshnessTtlSeconds)
  })

  // Regression coverage for the CRITICAL cross-tenant leak Hightower proved
  // live: these views were created without security_invoker = true, so they
  // executed with the (BYPASSRLS) owner's privileges instead of the querying
  // role's, and FORCE ROW LEVEL SECURITY on the base tables was silently
  // bypassed. This is the exact assertion whose absence let that leak reach a
  // live database -- if migration 50 ever regresses to a default-owner view,
  // these must fail.
  describe("tenant isolation (the assertion that would have caught the CRITICAL view leak)", () => {
    it("returns zero rows from all three views for a foreign tenant's group_id, even for a source_id that exists under the real tenant", async () => {
      const foreignInventory = await queryAsForeignTenant(
        `SELECT * FROM bumblebee_current_inventory WHERE source_id = $1`, [routineSource.sourceId],
      )
      expect(foreignInventory).toHaveLength(0)

      const foreignRoutineRuns = await queryAsForeignTenant(
        `SELECT * FROM bumblebee_current_routine_runs WHERE source_id = $1`, [routineSource.sourceId],
      )
      expect(foreignRoutineRuns).toHaveLength(0)

      const foreignIncompleteRuns = await queryAsForeignTenant(
        `SELECT * FROM bumblebee_incomplete_runs WHERE source_id = $1`, [heldSource.sourceId],
      )
      expect(foreignIncompleteRuns).toHaveLength(0)
    })

    it("fails closed -- returns zero rows from all three views when no tenant context is set at all", async () => {
      const noContextInventory = await queryWithNoTenantContext(
        `SELECT count(*)::int AS n FROM bumblebee_current_inventory`,
      )
      expect(noContextInventory[0].n).toBe(0)

      const noContextRoutineRuns = await queryWithNoTenantContext(
        `SELECT count(*)::int AS n FROM bumblebee_current_routine_runs`,
      )
      expect(noContextRoutineRuns[0].n).toBe(0)

      const noContextIncompleteRuns = await queryWithNoTenantContext(
        `SELECT count(*)::int AS n FROM bumblebee_incomplete_runs`,
      )
      expect(noContextIncompleteRuns[0].n).toBe(0)
    })
  })
})
