import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { type ConformedRecord, parseNdjsonBatch, recomputeRecordId } from "@/lib/bumblebee/batch-conformance";
import { loadAuthoritativeExposures, projectBatchExposures } from "@/lib/bumblebee/exposure-store";
import { type IngestLease, ingestScannerBatch, type PersistBatchInput } from "@/lib/bumblebee/ingest-pipeline";
import { hashBumblebeeToken, issueScanLease, tokenPrefix } from "@/lib/bumblebee/lease-authority";
import {
  authenticateIngestLease,
  authenticateRunnerForSource,
  createScopedIngestStore,
  persistScanLease,
} from "@/lib/bumblebee/lease-repository";
import { createPromotionStore } from "@/lib/bumblebee/promotion-engine";
import { closePool } from "@/lib/postgres/connection";

const GROUP = "allura-bumblebee-provenance";
const WORKSPACE = "ws-bumblebee-provenance";
const OTHER_WORKSPACE = "ws-bumblebee-provenance-other";
const CATALOG_ID = "catalog-provenance";
const ENTRY_ID = "catalog-entry-provenance";
const PROFILE = "baseline" as const;
const TOKEN_SECRET = "live-provenance-secret-26-7";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pool(user: string, password: string): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: process.env.POSTGRES_DB ?? "memory",
    user,
    password,
    max: 6,
  });
}

async function scoped<T>(client: PoolClient, group: string, workspace: string, work: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.current_group_id',$1,true)", [group]);
    await client.query("SELECT set_config('app.current_workspace_id',$1,true)", [workspace]);
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function withId(record: Record<string, unknown>): Record<string, unknown> {
  return { ...record, record_id: recomputeRecordId(record) };
}

function scannerBatch(runId: string, profile: "baseline" | "project", kind: "inventory" | "finding"): string {
  const common = {
    schema_version: "0.1.0", scanner_name: "bumblebee", scanner_version: "v0.1.2", run_id: runId,
    scan_time: "2026-08-31T12:00:00.000Z",
    endpoint: { hostname: "provenance-host", os: "linux", arch: "amd64", username: "runner", uid: "1000" },
    profile,
  };
  const data = kind === "inventory"
    ? withId({
        ...common, record_type: "package", ecosystem: "npm", package_name: "left-pad",
        normalized_name: "left-pad", version: "1.3.0", project_path: "/srv/app",
        root_kind: "user_package_root", package_manager: "npm", source_type: "npm-node_modules",
        source_file: "/srv/app/node_modules/left-pad/package.json", has_lifecycle_scripts: false,
        confidence: "medium",
      })
    : withId({
        ...common, record_type: "finding", ecosystem: "npm", finding_type: "advisory",
        catalog_id: ENTRY_ID, advisory_id: "ADV-PROVENANCE-1", normalized_name: "left-pad",
        version: "1.3.0", root_kind: "user_package_root", project_path: "/srv/app",
        source_type: "npm-node_modules", source_file: "/srv/app/node_modules/left-pad/package.json",
        confidence: "medium",
      });
  const summary = withId({
    ...common, record_type: "scan_summary", end_time: "2026-08-31T12:00:01.000Z", status: "complete",
    roots: [], counts: { npm: kind === "inventory" ? 1 : 0 },
    package_records_emitted: kind === "inventory" ? 1 : 0, findings_emitted: kind === "finding" ? 1 : 0,
    duplicates: 0, diagnostics_count: 0, files_considered: 1, timed_out: false, duration_ms: 1,
  });
  return `${JSON.stringify(data)}\n${JSON.stringify(summary)}\n`;
}

function request(body: string, token: string): Request {
  return new Request("http://localhost/api/plugins/bumblebee/ingest", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/x-ndjson" },
    body,
  });
}

const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_APP_PASSWORD
  ? describe
  : describe.skip;

describeLive("Bumblebee promoted N-1 provenance for held findings N", () => {
  const owner = pool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "");
  const app = pool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "");
  let catalogDigest = "";
  let primaryInventory!: PersistedRun;
  let primaryFinding!: PersistedRun;
  const negativeInventory = new Map<string, PersistedRun>();

  interface SourceFixture {
    workspace: string;
    source: string;
    revision: string;
    profile: "baseline" | "project";
    freshness: number;
    rawRunner: string;
    credential: string;
  }
  interface PersistedRun {
    lease: IngestLease;
    batchId: string;
    runId: string;
    summaryRecordId: string;
    input: PersistBatchInput;
  }

  async function installCatalog(client: PoolClient, workspace: string): Promise<void> {
    const canonicalCatalog = { entries: [ENTRY_ID] };
    const normalizedEntry = {
      ecosystem: "npm", normalized_name: "left-pad", finding_type: "advisory",
      advisory_id: "ADV-PROVENANCE-1", affected_versions: ["1.3.0"],
    };
    const catalog = await client.query<{ digest: string }>(
      "SELECT encode(digest($1::jsonb::text,'sha256'),'hex') AS digest", [JSON.stringify(canonicalCatalog)]);
    catalogDigest = catalog.rows[0]!.digest;
    const entry = await client.query<{ digest: string }>(
      "SELECT encode(digest($1::jsonb::text,'sha256'),'hex') AS digest", [JSON.stringify(normalizedEntry)]);
    await client.query(
      `INSERT INTO bumblebee_catalog_revisions
       (group_id,workspace_id,catalog_revision_id,catalog_digest,canonical_catalog,provenance,
        catalog_schema_version,reviewed_by,approval_receipt_id,classification,redaction_policy)
       VALUES ($1,$2,$3,$4,$5::jsonb,'{"source":"provenance-e2e"}'::jsonb,'1','pike',$6,'internal','redaction-v1')`,
      [GROUP, workspace, CATALOG_ID, catalogDigest, JSON.stringify(canonicalCatalog), `receipt-${workspace}`]);
    await client.query(
      `INSERT INTO bumblebee_catalog_entries
       (group_id,workspace_id,catalog_revision_id,catalog_entry_id,normalized_entry,entry_digest)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [GROUP, workspace, CATALOG_ID, ENTRY_ID, JSON.stringify(normalizedEntry), entry.rows[0]!.digest]);
  }

  async function enrollSource(fixture: SourceFixture): Promise<void> {
    const client = await app.connect();
    try {
      await scoped(client, GROUP, fixture.workspace, async () => {
        await client.query(
          `INSERT INTO bumblebee_runner_credentials
           (credential_id,group_id,workspace_id,token_prefix,token_hash,created_by)
           VALUES ($1,$2,$3,$4,$5,'provenance-e2e')`,
          [fixture.credential, GROUP, fixture.workspace, tokenPrefix(fixture.rawRunner, "bumblebee_runner"), hashBumblebeeToken(fixture.rawRunner)]);
        await client.query(
          `INSERT INTO bumblebee_sources
           (group_id,workspace_id,source_id,source_revision_id,revision_digest,endpoint_device_id,
            runner_credential_id,scanner_tag,scanner_commit,scanner_tree,scanner_artifact_sha256,
            record_schema_version,profile,mode,findings_enabled,root_config_digest,ecosystems,all_users,
            freshness_ttl_seconds,retention_days,classification,redaction_policy,catalog_revision_id,catalog_digest)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'v0.1.2','cc57710eeaf685e7b89924a36c8583cad0a378fe',
             '985f57cf1749c15561c886c4476f10950ffa9cae',$8,'0.1.0',$9,'inventory',true,$10,
             ARRAY['npm'],false,$11,30,'internal','redaction-v1',$12,$13)`,
          [GROUP, fixture.workspace, fixture.source, fixture.revision, digest(`revision-${fixture.revision}`),
            `device-${fixture.revision}`, fixture.credential, digest(`artifact-${fixture.revision}`), fixture.profile,
            digest(`root-${fixture.revision}`), fixture.freshness, CATALOG_ID, catalogDigest]);
      });
    } finally {
      client.release();
    }
  }

  async function recoverLease(workspace: string, leaseId: string): Promise<IngestLease> {
    const client = await app.connect();
    try {
      return await scoped(client, GROUP, workspace, async () => {
        const result = await client.query(
          `SELECT group_id,workspace_id,source_id,source_revision_id,lease_id,profile,mode,ecosystems,
                  catalog_revision_id,catalog_digest,generation
           FROM bumblebee_scan_leases WHERE lease_id=$1`, [leaseId]);
        const row = result.rows[0]!;
        return {
          groupId: row.group_id, workspaceId: row.workspace_id, sourceId: row.source_id,
          sourceRevisionId: row.source_revision_id, leaseId: row.lease_id, profile: row.profile,
          mode: row.mode, ecosystems: row.ecosystems, catalogRevisionId: row.catalog_revision_id,
          catalogDigest: row.catalog_digest, generation: Number(row.generation),
        } as IngestLease;
      });
    } finally {
      client.release();
    }
  }

  async function applicationRun(fixture: SourceFixture, kind: "inventory" | "finding", promote: boolean): Promise<PersistedRun> {
    const issued = await issueScanLease({
      runnerToken: fixture.rawRunner, sourceId: fixture.source,
      sourceRevisionId: fixture.revision, durationSeconds: 240,
    }, { authenticateRunner: authenticateRunnerForSource, persistLease: persistScanLease });
    const lease = await recoverLease(fixture.workspace, issued.leaseId);
    const runId = digest(`${fixture.revision}-${kind}-${issued.generation}`).slice(0, 32);
    const body = scannerBatch(runId, fixture.profile, kind);
    const response = await ingestScannerBatch(request(body, issued.ingestToken), {
      authenticate: authenticateIngestLease,
      findExistingBatch: async ({ lease: authenticated, bodySha256 }) =>
        (await createScopedIngestStore(authenticated)).findExistingBatch({ lease: authenticated, bodySha256 }),
      findConflictingBatch: async ({ lease: authenticated }) =>
        (await createScopedIngestStore(authenticated)).findConflictingBatch({ lease: authenticated }),
      persistBatch: async (input) => (await createScopedIngestStore(input.lease)).persistBatch(input),
    });
    expect(response.status).toBe(201);
    const accepted = await response.json() as { batchId: string };
    const parsed = parseNdjsonBatch(body, { mode: "inventory", profile: fixture.profile, ecosystems: ["npm"] });
    const records = [...parsed.records, parsed.summary!];
    const input: PersistBatchInput = {
      lease, batchId: accepted.batchId, bodySha256: digest(body), byteCount: Buffer.byteLength(body),
      lineCount: records.length, recordCount: records.length, records,
      summaryRecordId: parsed.summary!.record_id,
    };
    if (promote) {
      const promotion = await (await createPromotionStore(lease)).promote({
        batchId: accepted.batchId, runId, summaryRecordId: parsed.summary!.record_id,
      });
      expect(promotion).toEqual({ decision: "promoted", reasonCode: "PROMOTED_COMPLETE" });
    }
    return { lease, batchId: accepted.batchId, runId, summaryRecordId: parsed.summary!.record_id, input };
  }

  beforeAll(async () => {
    process.env.BUMBLEBEE_TOKEN_SECRET = TOKEN_SECRET;
    await owner.query("INSERT INTO workspaces(workspace_id,group_id,name) VALUES ($1,$2,'Bumblebee provenance'),($3,$2,'Bumblebee provenance other')",
      [WORKSPACE, GROUP, OTHER_WORKSPACE]);
    const catalogClient = await app.connect();
    try {
      await scoped(catalogClient, GROUP, WORKSPACE, () => installCatalog(catalogClient, WORKSPACE));
      await scoped(catalogClient, GROUP, OTHER_WORKSPACE, () => installCatalog(catalogClient, OTHER_WORKSPACE));
    } finally { catalogClient.release(); }

    const primary: SourceFixture = {
      workspace: WORKSPACE, source: "main", revision: "revision-main", profile: PROFILE,
      freshness: 3600, rawRunner: "bmb_runner_provmain_tail", credential: "runner-main",
    };
    await enrollSource(primary);
    primaryInventory = await applicationRun(primary, "inventory", true);
    primaryFinding = await applicationRun(primary, "finding", false);

    const fixtures: Array<[string, SourceFixture, boolean]> = [
      ["second-scope", { ...primary, workspace: OTHER_WORKSPACE, source: "scope", revision: "revision-scope", rawRunner: "bmb_runner_provscope_tail", credential: "runner-scope" }, true],
      ["wrong-revision", { ...primary, source: "main", revision: "revision-other", rawRunner: "bmb_runner_provrevis_tail", credential: "runner-revision" }, true],
      ["wrong-profile", { ...primary, source: "profile", revision: "revision-profile", profile: "project", rawRunner: "bmb_runner_provprof_tail", credential: "runner-profile" }, true],
      ["held-only", { ...primary, source: "held", revision: "revision-held", rawRunner: "bmb_runner_provheld_tail", credential: "runner-held" }, false],
      ["stale", { ...primary, source: "stale", revision: "revision-stale", freshness: 1, rawRunner: "bmb_runner_provstale_tail", credential: "runner-stale" }, true],
    ];
    for (const [name, fixture, promote] of fixtures) {
      await enrollSource(fixture);
      negativeInventory.set(name, await applicationRun(fixture, "inventory", promote));
    }
    await new Promise((resolve) => setTimeout(resolve, 1_100));
  }, 60_000);

  afterAll(async () => {
    await closePool();
    await Promise.all([owner.end(), app.end()]);
    delete process.env.BUMBLEBEE_TOKEN_SECRET;
  });

  it("persists held generation N with exact promoted generation N-1 provenance through the application path", async () => {
    const client = await app.connect();
    try {
      await scoped(client, GROUP, WORKSPACE, () => projectBatchExposures(
        { pool: client, transactional: false }, { ...primaryFinding.input, promotion: { decision: "held" } }));
      const row = await scoped(client, GROUP, WORKSPACE, () => client.query(
        `SELECT is_trusted,inventory_lease_id,inventory_batch_id,inventory_generation
         FROM bumblebee_exposure_evidence WHERE lease_id=$1`, [primaryFinding.lease.leaseId]));
      expect(row.rows).toEqual([{
        is_trusted: true,
        inventory_lease_id: primaryInventory.lease.leaseId,
        inventory_batch_id: primaryInventory.batchId,
        inventory_generation: String(primaryInventory.lease.generation),
      }]);
      expect(primaryFinding.lease.generation).toBe((primaryInventory.lease.generation ?? 0) + 1);
      const loaded = await scoped(client, GROUP, WORKSPACE, () =>
        loadAuthoritativeExposures({ pool: client, transactional: false }, primaryFinding.lease));
      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toMatchObject({ isTrusted: true, evidenceState: "inventory_bound" });
    } finally { client.release(); }
  });

  it("independently rejects actual second-scope, wrong-batch, wrong-revision, wrong-profile, non-promoted, stale, and held-only provenance", async () => {
    const client = await app.connect();
    try {
      const persisted = await scoped(client, GROUP, WORKSPACE, () => client.query(
        "SELECT exposure_key,exposure FROM bumblebee_exposure_evidence WHERE lease_id=$1", [primaryFinding.lease.leaseId]));
      const { exposure_key: exposureKey, exposure } = persisted.rows[0]!;
      const invoke = (inventory: PersistedRun, overrides: { workspace?: string; revision?: string; profile?: string; batch?: string } = {}) =>
        client.query(
          `SELECT app.insert_bumblebee_exposure_evidence(
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13,$14,$15,$16::jsonb)`,
          [GROUP, WORKSPACE, primaryFinding.lease.sourceId, overrides.revision ?? primaryFinding.lease.sourceRevisionId,
            overrides.profile ?? PROFILE, primaryFinding.lease.leaseId, primaryFinding.batchId, primaryFinding.runId,
            primaryFinding.input.records.find((record: ConformedRecord) => record.record_type === "finding")!.record_id,
            exposureKey, CATALOG_ID, catalogDigest, inventory.lease.leaseId,
            overrides.batch ?? inventory.batchId, inventory.lease.generation, JSON.stringify(exposure)]);

      const cases: Array<[string, PersistedRun, Parameters<typeof invoke>[1], string, string]> = [
        ["actual second-scope inventory", negativeInventory.get("second-scope")!, {}, GROUP, OTHER_WORKSPACE],
        ["wrong batch", primaryInventory, { batch: primaryFinding.batchId }, GROUP, WORKSPACE],
        ["wrong revision", negativeInventory.get("wrong-revision")!, {}, GROUP, WORKSPACE],
        ["wrong profile", negativeInventory.get("wrong-profile")!, { profile: "baseline" }, GROUP, WORKSPACE],
        ["non-promoted inventory", negativeInventory.get("held-only")!, {}, GROUP, WORKSPACE],
        ["stale promoted inventory", negativeInventory.get("stale")!, {}, GROUP, WORKSPACE],
        ["held-only generation as inventory", primaryFinding, {}, GROUP, WORKSPACE],
      ];
      for (const [label, inventory, overrides, group, workspace] of cases) {
        await expect(scoped(client, group, workspace, () => invoke(inventory, overrides)), label)
          .rejects.toThrow(/scope mismatch|trusted exposure authority mismatch/);
      }
    } finally { client.release(); }
  });
});
