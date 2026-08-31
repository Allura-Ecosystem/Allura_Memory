import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ConformedRecord } from "@/lib/bumblebee/batch-conformance";
import { loadAuthoritativeExposures, projectBatchExposures } from "@/lib/bumblebee/exposure-store";

const GROUP = "allura-bumblebee-provenance";
const WORKSPACE = "ws-bumblebee-provenance";
const CATALOG_ID = "catalog-provenance";
const ENTRY_ID = "catalog-entry-provenance";
const PROFILE = "baseline" as const;

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
    max: 3,
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

const findingPayload = {
  ecosystem: "npm",
  normalized_name: "left-pad",
  version: "1.3.0",
  finding_type: "advisory",
  catalog_id: ENTRY_ID,
  advisory_id: "ADV-PROVENANCE-1",
};
const packagePayload = {
  ecosystem: "npm",
  normalized_name: "left-pad",
  version: "1.3.0",
  source_file: "/srv/app/node_modules/left-pad/package.json",
};

function findingRecord(source: string): ConformedRecord {
  return {
    record_type: "finding",
    record_id: `finding-${source}`,
    run_id: `run-find-${source}`,
    sanitized_payload: findingPayload,
    canonical_id_inputs: JSON.stringify({ source }),
    line_number: 1,
    line_sha256: digest(`finding-line-${source}`),
    redaction_provenance: { endpoint: "stripped" },
  };
}

const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_APP_PASSWORD
  ? describe
  : describe.skip;

describeLive("Bumblebee promoted N-1 provenance for held findings N", () => {
  const owner = pool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "");
  const app = pool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "");
  let catalogDigest = "";

  async function stageSource(source: string, stale: boolean): Promise<void> {
    const revision = `revision-${source}`;
    const inventoryLease = `lease-inventory-${source}`;
    const findingLease = `lease-finding-${source}`;
    const inventoryBatch = `batch-inventory-${source}`;
    const findingBatch = `batch-finding-${source}`;
    const packageRecordId = `package-${source}`;
    const inventorySummary = `summary-inventory-${source}`;
    const finding = findingRecord(source);
    const findingSummary = `summary-finding-${source}`;

    await owner.query(
      `INSERT INTO bumblebee_sources
         (group_id,workspace_id,source_id,source_revision_id,revision_digest,endpoint_device_id,
          runner_credential_id,scanner_tag,scanner_commit,scanner_tree,scanner_artifact_sha256,
          record_schema_version,profile,mode,findings_enabled,root_config_digest,ecosystems,all_users,
          freshness_ttl_seconds,retention_days,classification,redaction_policy,catalog_revision_id,catalog_digest)
       VALUES ($1,$2,$3,$4,$5,$6,'provenance-runner','v0.1.2',
         'cc57710eeaf685e7b89924a36c8583cad0a378fe','985f57cf1749c15561c886c4476f10950ffa9cae',
         $7,'0.1.0','baseline','inventory',true,$8,ARRAY['npm'],false,3600,30,'internal','redaction-v1',$9,$10)`,
      [GROUP, WORKSPACE, source, revision, digest(`revision-${source}`), `device-${source}`, digest(`artifact-${source}`), digest(`root-${source}`), CATALOG_ID, catalogDigest],
    );

    for (const [leaseId, generation] of [[inventoryLease, 1], [findingLease, 2]] as const) {
      await owner.query(
        `INSERT INTO bumblebee_scan_leases
           (group_id,workspace_id,source_id,source_revision_id,lease_id,generation,revision_digest,
            runner_credential_id,profile,mode,root_config_digest,ecosystems,all_users,
            catalog_revision_id,catalog_digest,ingest_token_prefix,ingest_token_hash,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'provenance-runner','baseline','inventory',$8,ARRAY['npm'],false,
           $9,$10,$11,$12,NOW()+INTERVAL '4 minutes')`,
        [GROUP, WORKSPACE, source, revision, leaseId, generation, digest(`revision-${source}`), digest(`root-${source}`), CATALOG_ID, catalogDigest, `bmb_ingest_${digest(`${source}-${generation}`).slice(0, 8)}`, digest(`token-${source}-${generation}`)],
      );
    }

    for (const [leaseId, batchId] of [[inventoryLease, inventoryBatch], [findingLease, findingBatch]]) {
      await owner.query(
        `INSERT INTO bumblebee_batch_receipts
           (group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,body_sha256,
            byte_count,line_count,record_count,sanitized_payload_digest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,100,2,2,$8)`,
        [GROUP, WORKSPACE, source, revision, leaseId, batchId, digest(`body-${batchId}`), digest(`payload-${batchId}`)],
      );
    }

    const insertRecord = async (leaseId: string, batchId: string, runId: string, recordId: string, recordType: string, payload: object, line: number) => {
      await owner.query(
        `INSERT INTO bumblebee_records
           (group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,run_id,record_id,
            record_type,sanitized_payload,canonical_id_inputs,line_number,line_sha256,redaction_provenance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'{}'::jsonb,$11,$12,'{}'::jsonb)`,
        [GROUP, WORKSPACE, source, revision, leaseId, batchId, runId, recordId, recordType, JSON.stringify(payload), line, digest(`${recordId}-line`)],
      );
    };
    await insertRecord(inventoryLease, inventoryBatch, `run-inventory-${source}`, packageRecordId, "package", packagePayload, 1);
    await insertRecord(inventoryLease, inventoryBatch, `run-inventory-${source}`, inventorySummary, "scan_summary", { status: "complete" }, 2);
    await insertRecord(findingLease, findingBatch, finding.run_id, finding.record_id, "finding", findingPayload, 1);
    await insertRecord(findingLease, findingBatch, finding.run_id, findingSummary, "scan_summary", { status: "complete" }, 2);

    await owner.query(
      `INSERT INTO bumblebee_run_decisions
         (group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,decision_id,run_id,
          summary_record_id,decision,reason_code,decided_at)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,'promoted','PROMOTED_FOR_TEST',
          CASE WHEN $14::boolean THEN NOW()-INTERVAL '2 hours' ELSE NOW() END),
         ($1,$2,$3,$4,$10,$11,$12,$13,$15,'held','HELD_PENDING_PROMOTION',NOW())`,
      [GROUP, WORKSPACE, source, revision, inventoryLease, inventoryBatch, `decision-promoted-${source}`, `run-inventory-${source}`, inventorySummary,
        findingLease, findingBatch, `decision-held-${source}`, finding.run_id, stale, findingSummary],
    );
  }

  beforeAll(async () => {
    await owner.query("INSERT INTO workspaces(workspace_id,group_id,name) VALUES ($1,$2,'Bumblebee provenance')", [WORKSPACE, GROUP]);
    await owner.query(
      `INSERT INTO bumblebee_runner_credentials
         (credential_id,group_id,workspace_id,token_prefix,token_hash,created_by)
       VALUES ('provenance-runner',$1,$2,'bmb_runner_prov1234',$3,'e2e')`,
      [GROUP, WORKSPACE, digest("runner-token")],
    );
    const canonicalCatalog = { entries: [ENTRY_ID] };
    const normalizedEntry = {
      ecosystem: "npm",
      normalized_name: "left-pad",
      finding_type: "advisory",
      advisory_id: "ADV-PROVENANCE-1",
      affected_versions: ["1.3.0"],
    };
    catalogDigest = (await owner.query<{ digest: string }>(
      "SELECT encode(digest($1::jsonb::text,'sha256'),'hex') AS digest",
      [JSON.stringify(canonicalCatalog)],
    )).rows[0]!.digest;
    const entryDigest = (await owner.query<{ digest: string }>(
      "SELECT encode(digest($1::jsonb::text,'sha256'),'hex') AS digest",
      [JSON.stringify(normalizedEntry)],
    )).rows[0]!.digest;
    await owner.query(
      `INSERT INTO bumblebee_catalog_revisions
         (group_id,workspace_id,catalog_revision_id,catalog_digest,canonical_catalog,provenance,
          catalog_schema_version,reviewed_by,approval_receipt_id,classification,redaction_policy)
       VALUES ($1,$2,$3,$4,$5::jsonb,'{"source":"e2e"}'::jsonb,'1','pike','receipt-provenance','internal','redaction-v1')`,
      [GROUP, WORKSPACE, CATALOG_ID, catalogDigest, JSON.stringify(canonicalCatalog)],
    );
    await owner.query(
      `INSERT INTO bumblebee_catalog_entries
         (group_id,workspace_id,catalog_revision_id,catalog_entry_id,normalized_entry,entry_digest)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [GROUP, WORKSPACE, CATALOG_ID, ENTRY_ID, JSON.stringify(normalizedEntry), entryDigest],
    );
    await stageSource("main", false);
    await stageSource("stale", true);
  }, 30_000);

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("persists held generation N findings with exact promoted generation N-1 provenance and reads it as trusted", async () => {
    const client = await app.connect();
    const lease = {
      groupId: GROUP,
      workspaceId: WORKSPACE,
      sourceId: "main",
      sourceRevisionId: "revision-main",
      leaseId: "lease-finding-main",
      profile: PROFILE,
      mode: "inventory" as const,
      generation: 2,
      catalogRevisionId: CATALOG_ID,
      catalogDigest,
    };
    try {
      await scoped(client, GROUP, WORKSPACE, async () => {
        await projectBatchExposures({ pool: client, transactional: false }, {
          lease,
          batchId: "batch-finding-main",
          bodySha256: digest("finding-body-main"),
          byteCount: 100,
          lineCount: 2,
          recordCount: 2,
          records: [findingRecord("main")],
          summaryRecordId: "summary-finding-main",
          promotion: { decision: "held" },
        });
      });

      const row = await scoped(client, GROUP, WORKSPACE, async () =>
        client.query(
          `SELECT is_trusted,inventory_lease_id,inventory_batch_id,inventory_generation
           FROM bumblebee_exposure_evidence WHERE lease_id='lease-finding-main'`,
        ),
      );
      expect(row.rows).toEqual([{
        is_trusted: true,
        inventory_lease_id: "lease-inventory-main",
        inventory_batch_id: "batch-inventory-main",
        inventory_generation: "1",
      }]);

      const loaded = await scoped(client, GROUP, WORKSPACE, () =>
        loadAuthoritativeExposures({ pool: client, transactional: false }, lease),
      );
      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toMatchObject({ isTrusted: true, evidenceState: "inventory_bound" });
    } finally {
      client.release();
    }
  });

  it("rejects held-only, mismatched, cross-scope, and stale promoted provenance", async () => {
    const client = await app.connect();
    try {
      const persisted = await scoped(client, GROUP, WORKSPACE, () =>
        client.query("SELECT exposure_key,exposure FROM bumblebee_exposure_evidence WHERE lease_id='lease-finding-main'"),
      );
      const { exposure_key: exposureKey, exposure } = persisted.rows[0]!;
      const invoke = (source: string, inventoryLease: string, inventoryBatch: string, generation: number) =>
        client.query(
          `SELECT app.insert_bumblebee_exposure_evidence(
             $1,$2,$3,$4,'baseline',$5,$6,$7,$8,$9,true,$10,$11,$12,$13,$14,$15::jsonb)`,
          [GROUP, WORKSPACE, source, `revision-${source}`, `lease-finding-${source}`, `batch-finding-${source}`,
            `run-find-${source}`, `finding-${source}`, exposureKey, CATALOG_ID, catalogDigest,
            inventoryLease, inventoryBatch, generation, JSON.stringify(exposure)],
        );

      await expect(scoped(client, GROUP, WORKSPACE, () =>
        invoke("main", "lease-finding-main", "batch-finding-main", 2),
      )).rejects.toThrow(/trusted exposure authority mismatch/);

      await expect(scoped(client, GROUP, WORKSPACE, () =>
        invoke("main", "lease-inventory-main", "batch-inventory-main", 999),
      )).rejects.toThrow(/trusted exposure authority mismatch/);

      await expect(scoped(client, GROUP, "ws-other", () =>
        invoke("main", "lease-inventory-main", "batch-inventory-main", 1),
      )).rejects.toThrow(/scope mismatch/);

      await expect(scoped(client, GROUP, WORKSPACE, () =>
        invoke("stale", "lease-inventory-stale", "batch-inventory-stale", 1),
      )).rejects.toThrow(/trusted exposure authority mismatch/);
    } finally {
      client.release();
    }
  });
});
