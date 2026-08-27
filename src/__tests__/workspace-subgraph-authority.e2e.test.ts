import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { withTenantTransaction } from "@/lib/db/tenant-transaction";
import { closePool, getAppPool, getConnectionConfig } from "@/lib/postgres/connection";
import { getWorkspaceWatchdogCandidates } from "@/curator/watchdog";
import { POST as approveProposalRoute } from "@/app/api/curator/approve/route";
import { retrieveKnowledge } from "@/lib/memory/retrieval-layer";
import { linkInsightToAgent, promoteToNeo4j } from "@/lib/memory/knowledge-promotion";
import { RuVectorGraphAdapter } from "@/lib/graph-adapter/ruvector-adapter";

const GROUP = "allura-workspace-authority";
const OTHER_GROUP = "allura-workspace-other";
const WORKSPACE_A = "workspace-authority-a";
const WORKSPACE_B = "workspace-authority-b";
const OTHER_WORKSPACE = "workspace-authority-other";
const PRINCIPAL = "workspace-authority-test";
const RUN_ID = randomUUID();
const describeLive = process.env.POSTGRES_PASSWORD && process.env.POSTGRES_APP_USER && process.env.POSTGRES_APP_PASSWORD ? describe : describe.skip;
const migrationsDirectory = path.resolve(process.cwd(), "docker/postgres-init");

const workspaceContext = (workspaceId?: string) => ({
  tenantId: GROUP,
  principalId: PRINCIPAL,
  ...(workspaceId === undefined ? {} : { workspaceId }),
});

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function teardownDisposableDatabase({
  appPool,
  ownerPool,
  rootOwnerPool,
  databaseName,
}: {
  appPool?: Pool;
  ownerPool?: Pool;
  rootOwnerPool: Pool;
  databaseName: string;
}): Promise<void> {
  let failure: unknown;
  const poolResults = await Promise.allSettled([appPool?.end(), ownerPool?.end()]);
  failure = poolResults.find((result) => result.status === "rejected")?.reason;

  try {
    await rootOwnerPool.query(`DROP DATABASE ${quoteIdentifier(databaseName)} WITH (FORCE)`);
  } catch (error) {
    failure ??= error;
  }

  try {
    const { rows } = await rootOwnerPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    expect(rows).toEqual([]);
  } catch (error) {
    failure ??= error;
  } finally {
    try {
      await rootOwnerPool.end();
    } catch (error) {
      failure ??= error;
    }
  }

  if (failure) {
    throw failure;
  }
}

describe("workspace subgraph authority teardown", () => {
  it("drops and checks the disposable database before closing rootOwnerPool when child cleanup fails", async () => {
    const calls: string[] = [];
    const appPool = {
      end: vi.fn(async () => {
        calls.push("app-end");
        throw new Error("app pool close failed");
      }),
    } as unknown as Pool;
    const ownerPool = {
      end: vi.fn(async () => {
        calls.push("owner-end");
      }),
    } as unknown as Pool;
    const rootOwnerPool = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql.startsWith("DROP DATABASE") ? "drop" : "check");
        return { rows: [] };
      }),
      end: vi.fn(async () => {
        calls.push("root-end");
      }),
    } as unknown as Pool;

    await expect(teardownDisposableDatabase({ appPool, ownerPool, rootOwnerPool, databaseName: "authority_test" }))
      .rejects.toThrow("app pool close failed");
    expect(calls).toEqual(["app-end", "owner-end", "drop", "check", "root-end"]);
  });
});

/**
 * This suite never writes authority fixtures into the live-lane database. It
 * creates a UUID-named disposable database, applies the same ordered migration
 * files the live harness uses, then drops that database with FORCE after every
 * suite. Immutable receipts therefore cannot survive a run or affect a shared
 * database, and fixed workspace identifiers cannot repurpose another fixture.
 */
describeLive("workspace subgraph authority", () => {
  const ownerConfig = getConnectionConfig({ role: "owner" });
  const rootOwnerPool = new Pool(ownerConfig);
  const databaseName = `allura_252a_authority_${RUN_ID.replaceAll("-", "")}`;
  let ownerPool: Pool;
  let appPool: Pool;
  // Captured so afterAll can put POSTGRES_DB back. Without this restore, every
  // test file that shares this process afterwards builds its pool against a
  // database this suite has already dropped, and fails with
  // `database "allura_252a_authority_..." does not exist`. Whether that happens
  // depends purely on how vitest's fork pool groups files across available
  // CPUs, so the bug stays invisible on a many-core dev machine and appears on
  // a 2-core CI runner -- or the moment a tenth file joins this lane.
  const originalPostgresDb = process.env.POSTGRES_DB;

  beforeAll(async () => {
    await rootOwnerPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);

    ownerPool = new Pool({ ...ownerConfig, database: databaseName });
    for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
      await ownerPool.query(readFileSync(path.join(migrationsDirectory, filename), "utf8"));
    }
    process.env.POSTGRES_DB = databaseName;
    appPool = getAppPool();

    await ownerPool.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES
         ($1, $2, 'Workspace authority A'),
         ($3, $2, 'Workspace authority B'),
         ($4, $5, 'Workspace authority other')`,
      [WORKSPACE_A, GROUP, WORKSPACE_B, OTHER_WORKSPACE, OTHER_GROUP],
    );
    await ownerPool.query(
      `INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, tier)
       VALUES ($1, $2, $3, 'Authority fixture proposal', 0.9, 'mainstream')`,
      [RUN_ID, GROUP, WORKSPACE_A],
    );
  }, 60_000);

  afterAll(async () => {
    await closePool();
    await teardownDisposableDatabase({ ownerPool, rootOwnerPool, databaseName });
    // Restore BEFORE any later file can lazily rebuild the pool singleton.
    // closePool() nulls the singletons, so the next getAppPool() re-reads
    // POSTGRES_DB -- it must point at the real database again by then.
    if (originalPostgresDb === undefined) {
      delete process.env.POSTGRES_DB;
    } else {
      process.env.POSTGRES_DB = originalPostgresDb;
    }
  }, 30_000);

  it.each([
    {
      table: "evidence_requests",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO evidence_requests (group_id, workspace_id, proposal_id, requested_by, reason)
              VALUES ($1, $2, $3, $4, 'RLS authority proof')`,
        values: [GROUP, workspaceId, RUN_ID, PRINCIPAL],
      }),
    },
    {
      table: "semantic_projections",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO semantic_projections (
                group_id, workspace_id, source_kind, source_id, projection_version,
                source_revision_hash, content_hash, source_refs, redaction_policy_version, markdown
              ) VALUES ($1, $2, 'test', $3, 'v1', repeat('0',64), repeat('1',64), $4::jsonb, 'policy-v1', 'proof')`,
        values: [GROUP, workspaceId, `${workspaceId}-${RUN_ID}`, JSON.stringify([{ table: 'test', id: workspaceId }])],
      }),
    },
  ])("allows an app write only in its workspace for $table", async ({ insert }) => {
    const statement = insert(WORKSPACE_A);
    await expect(withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(statement.sql, statement.values),
      appPool,
    )).resolves.toMatchObject({ rowCount: 1 });
  });

  it.each([
    {
      table: "evidence_requests",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO evidence_requests (group_id, workspace_id, proposal_id, requested_by, reason)
              VALUES ($1, $2, $3, $4, 'RLS authority proof')`,
        values: [GROUP, workspaceId, RUN_ID, PRINCIPAL],
      }),
    },
    {
      table: "semantic_projections",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO semantic_projections (
                group_id, workspace_id, source_kind, source_id, projection_version,
                source_revision_hash, content_hash, source_refs, redaction_policy_version, markdown
              ) VALUES ($1, $2, 'test', $3, 'v1', repeat('0',64), repeat('1',64), $4::jsonb, 'policy-v1', 'proof')`,
        values: [GROUP, workspaceId, `${workspaceId}-${RUN_ID}`, JSON.stringify([{ table: 'test', id: workspaceId }])],
      }),
    },
  ])("denies cross-workspace reads for $table", async ({ table, insert }) => {
    if (table === "evidence_requests") {
      await ownerPool.query(
        `INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, tier)
         VALUES ($1, $2, $3, 'Workspace B evidence fixture', 0.9, 'mainstream')
         RETURNING id`,
        [randomUUID(), GROUP, WORKSPACE_B],
      ).then((proposal) => {
        const statement = insert(WORKSPACE_B);
        statement.values[2] = proposal.rows[0]?.id;
        return ownerPool.query(statement.sql, statement.values);
      });
    } else {
      const statement = insert(WORKSPACE_B);
      await ownerPool.query(statement.sql, statement.values);
    }

    const result = await withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(`SELECT 1 FROM ${table} WHERE workspace_id = $1`, [WORKSPACE_B]),
      appPool,
    );
    expect(result.rows).toEqual([]);
  });

  it.each([
    {
      table: "evidence_requests",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO evidence_requests (group_id, workspace_id, proposal_id, requested_by, reason)
              VALUES ($1, $2, $3, $4, 'RLS authority proof')`,
        values: [GROUP, workspaceId, RUN_ID, PRINCIPAL],
      }),
    },
    {
      table: "semantic_projections",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO semantic_projections (
                group_id, workspace_id, source_kind, source_id, projection_version,
                source_revision_hash, content_hash, source_refs, redaction_policy_version, markdown
              ) VALUES ($1, $2, 'test', $3, 'v1', repeat('0',64), repeat('1',64), $4::jsonb, 'policy-v1', 'proof')`,
        values: [GROUP, workspaceId, `${workspaceId}-${RUN_ID}`, JSON.stringify([{ table: 'test', id: workspaceId }])],
      }),
    },
  ])("denies cross-workspace writes for $table", async ({ insert }) => {
    const statement = insert(WORKSPACE_B);
    await expect(withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(statement.sql, statement.values),
      appPool,
    )).rejects.toThrow(/row-level security/i);
  });

  it("denies an app proposal write whose workspace differs from its authenticated workspace", async () => {
    await expect(withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(
        `INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, tier)
         VALUES ($1, $2, $3, 'Forged workspace proposal', 0.9, 'mainstream')`,
        [randomUUID(), GROUP, WORKSPACE_B],
      ),
      appPool,
    )).rejects.toThrow(/row-level security/i);
  });

  it("rejects evidence for a proposal in a different workspace", async () => {
    await expect(ownerPool.query(
      `INSERT INTO evidence_requests (group_id, workspace_id, proposal_id, requested_by, reason)
       VALUES ($1, $2, $3, $4, 'cross-workspace integrity proof')`,
      [GROUP, WORKSPACE_B, RUN_ID, PRINCIPAL],
    )).rejects.toThrow(/evidence_requests_proposal_scope_fkey/);
  });

  it("retains source references in projection identity and required receipt result state", async () => {
    const first = await withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(
        `INSERT INTO semantic_projections (
           group_id, workspace_id, source_kind, source_id, projection_version,
           source_revision_hash, content_hash, source_refs, redaction_policy_version, markdown
         ) VALUES ($1, $2, 'proposal', $3, 'v1', repeat('0',64), repeat('1',64), $4::jsonb, 'policy-v1', 'proof')`,
        [GROUP, WORKSPACE_A, RUN_ID, JSON.stringify([{ table: 'canonical_proposals', id: RUN_ID }])],
      ),
      appPool,
    );
    expect(first.rowCount).toBe(1);
    await expect(withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(
        `INSERT INTO semantic_projections (
           group_id, workspace_id, source_kind, source_id, projection_version,
           source_revision_hash, content_hash, source_refs, redaction_policy_version, markdown
         ) VALUES ($1, $2, 'proposal', $3, 'v1', repeat('0',64), repeat('1',64), $4::jsonb, 'policy-v1', 'proof')`,
        [GROUP, WORKSPACE_A, RUN_ID, JSON.stringify([{ table: 'events', id: 'different-source' }])],
      ),
      appPool,
    )).resolves.toMatchObject({ rowCount: 1 });

  });

  it("does not leak a workspace GUC to the next transaction on the same pooled connection", async () => {
    const previousWorkspaceRows = await withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query("SELECT id FROM semantic_projections WHERE workspace_id = $1", [WORKSPACE_A]),
      appPool,
    );
    expect(previousWorkspaceRows.rows.length).toBeGreaterThan(0);

    const noWorkspaceResult = await withTenantTransaction(
      workspaceContext(),
      async (client) => ({
        workspaceGuc: (await client.query(
          "SELECT NULLIF(current_setting('app.current_workspace_id', true), '') AS workspace_guc",
        )).rows[0].workspace_guc,
        rows: (await client.query("SELECT id FROM semantic_projections WHERE workspace_id = $1", [WORKSPACE_A])).rows,
      }),
      appPool,
    );

    expect(noWorkspaceResult.workspaceGuc).toBeNull();
    expect(noWorkspaceResult.rows).toEqual([]);
  });

  it("rejects a token whose group and workspace are forged across groups", async () => {
    await expect(
      ownerPool.query(
        `INSERT INTO mcp_tokens (id, group_id, workspace_id, agent_name, token_prefix, token_hash)
         VALUES ($1, $2, $3, 'test-agent', 'wa-forged', 'hash')`,
        [`workspace-authority-forged-token-${RUN_ID}`, GROUP, OTHER_WORKSPACE],
      ),
    ).rejects.toThrow(/mcp_tokens_group_workspace_fkey/);
  });

  it("denies app event reads and writes across workspaces in the same group", async () => {
    const workspaceBEvent = await ownerPool.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, metadata)
       VALUES ($1, $2, 'workspace_b_event', 'authority-owner', '{}'::jsonb)
       RETURNING id`,
      [GROUP, WORKSPACE_B],
    );
    await ownerPool.query(
      `INSERT INTO events (group_id, event_type, agent_id, metadata)
       VALUES ($1, 'legacy_event', 'authority-owner', '{}'::jsonb)`,
      [GROUP],
    );

    const hidden = await withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(
        "SELECT id FROM events WHERE id = $1 OR (group_id = $2 AND workspace_id IS NULL)",
        [workspaceBEvent.rows[0].id, GROUP],
      ),
      appPool,
    );
    expect(hidden.rows).toEqual([]);

    await expect(withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(
        `INSERT INTO events (group_id, workspace_id, event_type, agent_id, metadata)
         VALUES ($1, $2, 'forged_workspace_event', 'authority-app', '{}'::jsonb)`,
        [GROUP, WORKSPACE_B],
      ),
      appPool,
    )).rejects.toThrow(/row-level security/i);
  });

  it("rejects a receipt that cites an event from another workspace or tenant", async () => {
    const evidence = await ownerPool.query("SELECT id FROM evidence_requests WHERE proposal_id=$1 ORDER BY created_at LIMIT 1", [RUN_ID]);
    const evidenceId = evidence.rows[0].id;
    const evidenceJson = JSON.stringify([evidenceId]);
    const evidenceHash = createHash("sha256").update(evidenceJson).digest("hex");
    const workspaceBEvent = await ownerPool.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, metadata)
       VALUES ($1, $2, 'receipt_workspace_b_event', 'authority-owner', '{}'::jsonb) RETURNING id`,
      [GROUP, WORKSPACE_B],
    );
    const otherTenantEvent = await ownerPool.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, metadata)
       VALUES ($1, $2, 'receipt_other_tenant_event', 'authority-owner', '{}'::jsonb) RETURNING id`,
      [OTHER_GROUP, OTHER_WORKSPACE],
    );
    const insertReceipt = (sourceEventId: number) => ownerPool.query(
      `INSERT INTO governance_receipts (
         group_id, workspace_id, proposal_id, proposal_version, evidence_request_id, evidence_identity_hash, action,
         actor_id, actor_role, rationale, policy_reference, policy_version, outbox_state,
         evidence_references, source_event_id
       ) VALUES ($1,$2,$3,'1',$4,$5,'reject',$6,'curator','provenance proof','policy://test','v1',
                 'not_applicable',$7::jsonb,$8)`,
      [GROUP, WORKSPACE_A, RUN_ID, evidenceId, evidenceHash, PRINCIPAL, evidenceJson, sourceEventId],
    );
    await expect(insertReceipt(workspaceBEvent.rows[0].id)).rejects.toThrow(/governance_receipts_source_event_scope_fkey/);
    await expect(insertReceipt(otherTenantEvent.rows[0].id)).rejects.toThrow(/governance_receipts_source_event_scope_fkey/);
  });

  it("preserves global durable-event trace uniqueness for workspace proposals", async () => {
    const event = await ownerPool.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, metadata)
       VALUES ($1, $2, 'memory_add', 'workspace-watchdog-test', '{}'::jsonb)
       RETURNING id`,
      [GROUP, WORKSPACE_B],
    );
    const eventId = event.rows[0]?.id;
    await ownerPool.query(
      `INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, tier, trace_ref)
       VALUES ($1, $2, $3, 'Durable trace fixture', 0.9, 'mainstream', $4)`,
      [randomUUID(), GROUP, WORKSPACE_B, eventId],
    );

    await expect(ownerPool.query(
      `INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, tier, trace_ref)
       VALUES ($1, $2, $3, 'Duplicate durable trace fixture', 0.9, 'mainstream', $4)`,
      [randomUUID(), GROUP, WORKSPACE_A, eventId],
    )).rejects.toThrow(/idx_canonical_proposals_trace_ref_unique/);
  });

  it("preserves heterogeneous policies through apply rollback and reapply", async () => {
    await ownerPool.query(
      `CREATE POLICY heterogeneous_proposal_policy ON canonical_proposals
       FOR SELECT TO allura_app USING (score >= 0.42)`,
    );
    await ownerPool.query(
      `CREATE POLICY heterogeneous_event_policy ON events
       FOR SELECT TO allura_app USING (event_type <> 'private')`,
    );
    const snapshot = async () => ownerPool.query<{ tablename: string; policyname: string; permissive: string; qual: string | null }>(
      `SELECT tablename, policyname, permissive, qual FROM pg_policies
       WHERE schemaname='public' AND policyname LIKE 'heterogeneous_%' ORDER BY tablename`,
    ).then((result) => result.rows);
    const before = await snapshot();
    const migration = readFileSync(path.join(migrationsDirectory, "39-workspace-subgraph-foundation.sql"), "utf8");
    const rollback = readFileSync(path.resolve(process.cwd(), "docker/postgres-rollback/39-workspace-policy-remediation.sql"), "utf8");

    await ownerPool.query(migration);
    expect(await snapshot()).toEqual(before);
    await ownerPool.query(rollback);
    expect(await snapshot()).toEqual(before);
    await ownerPool.query(migration);
    expect(await snapshot()).toEqual(before);

    const restrictive = await ownerPool.query(
      `SELECT tablename, permissive FROM pg_policies WHERE schemaname='public'
       AND policyname='workspace_scope_restrictive_policy' ORDER BY tablename`,
    );
    expect(restrictive.rows).toEqual([
      { tablename: "allura_memories", permissive: "RESTRICTIVE" },
      { tablename: "canonical_proposals", permissive: "RESTRICTIVE" },
      { tablename: "events", permissive: "RESTRICTIVE" },
      { tablename: "graph_memories", permissive: "RESTRICTIVE" },
      { tablename: "graph_structural_edges", permissive: "RESTRICTIVE" },
      { tablename: "graph_structural_nodes", permissive: "RESTRICTIVE" },
      { tablename: "graph_supersedes", permissive: "RESTRICTIVE" },
      { tablename: "promotion_idempotency", permissive: "RESTRICTIVE" },
      { tablename: "promotion_outbox", permissive: "RESTRICTIVE" },
    ]);
  });

  it("governed receipt replay is idempotent and the retained row is immutable", async () => {
    const evidence = await ownerPool.query("SELECT id FROM evidence_requests WHERE proposal_id=$1 ORDER BY created_at LIMIT 1", [RUN_ID]);
    const evidenceId = evidence.rows[0].id;
    const source = await ownerPool.query(
      `INSERT INTO events(group_id,workspace_id,event_type,agent_id,status,metadata)
       VALUES($1,$2,'receipt_replay_source','requester-replay','completed','{}') RETURNING id`,
      [GROUP, WORKSPACE_A],
    );
    const proposal = await ownerPool.query(
      "UPDATE canonical_proposals SET trace_ref=$2 WHERE id=$1 RETURNING proposal_version",
      [RUN_ID, source.rows[0].id],
    );
    const sourceEventId = source.rows[0].id;
    const proposalVersion = String(proposal.rows[0].proposal_version);
    const evidenceJson = JSON.stringify([`event:${sourceEventId}`, `evidence-request:${evidenceId}`]);
    const evidenceHash = createHash("sha256").update(evidenceJson).digest("hex");
    const insert = () => withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(
        `INSERT INTO governance_receipts (
           group_id, workspace_id, proposal_id, proposal_version, evidence_request_id, evidence_identity_hash, action,
           actor_id, actor_role, rationale, policy_reference, policy_version, outbox_state, evidence_references, source_event_id
         ) VALUES ($1,$2,$3,$9,$4,$5,'reject',$6,'curator','TDD proof','policy://test','v1','not_applicable',$7::jsonb,$8)
         ON CONFLICT ON CONSTRAINT governance_receipts_replay_key DO NOTHING RETURNING id`,
        [GROUP, WORKSPACE_A, RUN_ID, evidenceId, evidenceHash, PRINCIPAL, evidenceJson, sourceEventId, proposalVersion],
      ), appPool,
    );
    const inserted = await insert();
    expect((await insert()).rowCount).toBe(0);
    const receiptId = inserted.rows[0].id;
    await expect(withTenantTransaction(workspaceContext(WORKSPACE_A),
      (client) => client.query("UPDATE governance_receipts SET rationale='changed' WHERE id=$1", [receiptId]), appPool,
    )).rejects.toThrow(/immutable/);
    await expect(withTenantTransaction(workspaceContext(WORKSPACE_A),
      (client) => client.query("DELETE FROM governance_receipts WHERE id=$1", [receiptId]), appPool,
    )).rejects.toThrow(/immutable/);
    const retained = await withTenantTransaction(workspaceContext(WORKSPACE_A),
      (client) => client.query("SELECT id FROM governance_receipts WHERE id=$1", [receiptId]), appPool,
    );
    expect(retained.rows).toHaveLength(1);
  });

  it("makes a same-group cross-workspace governance receipt read impossible", async () => {
    const source = await ownerPool.query(
      `INSERT INTO events(group_id,workspace_id,event_type,agent_id,status,metadata)
       VALUES($1,$2,'workspace_b_receipt_source','requester-b','completed','{}') RETURNING id`,
      [GROUP, WORKSPACE_B],
    );
    const proposal = await ownerPool.query(
      `INSERT INTO canonical_proposals(id,group_id,workspace_id,content,score,tier,status,trace_ref)
       VALUES($1,$2,$3,'Workspace B receipt',0.5,'emerging','rejected',$4) RETURNING id,proposal_version`,
      [randomUUID(), GROUP, WORKSPACE_B, source.rows[0].id],
    );
    const refs = JSON.stringify([`event:${source.rows[0].id}`]);
    const hash = createHash("sha256").update(refs).digest("hex");
    const receipt = await ownerPool.query(
      `INSERT INTO governance_receipts(
         group_id,workspace_id,proposal_id,proposal_version,evidence_identity_hash,action,actor_id,actor_role,
         rationale,policy_reference,policy_version,outbox_state,source_event_id,evidence_references)
       VALUES($1,$2,$3,$4,$5,'reject',$6,'curator','Workspace B decision','policy://test','v1','not_applicable',$7,$8::jsonb)
       RETURNING id`,
      [GROUP, WORKSPACE_B, proposal.rows[0].id, String(proposal.rows[0].proposal_version), hash, PRINCIPAL, source.rows[0].id, refs],
    );
    const invisible = await withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query("SELECT id FROM governance_receipts WHERE id=$1", [receipt.rows[0].id]),
      appPool,
    );
    expect(invisible.rows).toEqual([]);
  });

  it("quarantines legacy graph memories and denies same-tenant cross-workspace retrieval", async () => {
    const workspaceBMemory = randomUUID();
    const legacyMemory = randomUUID();
    await ownerPool.query(
      `INSERT INTO graph_memories(id,group_id,workspace_id,workspace_scope_state,content,score,provenance)
       VALUES($1,$2,$3,'workspace_scoped','workspace B secret',0.9,'manual'),
             ($4,$2,NULL,'legacy_quarantined','legacy secret',0.9,'manual')`,
      [workspaceBMemory, GROUP, WORKSPACE_B, legacyMemory],
    );
    const rows = await withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query("SELECT id FROM graph_memories WHERE id=ANY($1::text[])", [[workspaceBMemory, legacyMemory]]),
      appPool,
    );
    expect(rows.rows).toEqual([]);
    const controlled = await retrieveKnowledge({
      group_id:GROUP, workspace_id:WORKSPACE_A, agent_id:PRINCIPAL,
      query:"secret", mode:"semantic", limit:10,
    });
    expect(controlled.results).toEqual([]);
    const audit = await ownerPool.query(
      "SELECT workspace_id FROM events WHERE group_id=$1 AND event_type='retrieval_query' ORDER BY id DESC LIMIT 1",[GROUP],
    );
    expect(audit.rows).toEqual([{workspace_id:WORKSPACE_A}]);
  });

  it("promotes and supersedes knowledge through the app-role workspace boundary", async () => {
    const firstId = `promotion-${RUN_ID}`;
    const secondId = `promotion-v2-${RUN_ID}`;
    await ownerPool.query(
      `INSERT INTO events(group_id,workspace_id,event_type,agent_id,status,metadata)
       VALUES($1,$2,'proposal_approved',$3,'completed',$4::jsonb)`,
      [GROUP, WORKSPACE_A, PRINCIPAL, JSON.stringify({ proposal_id: RUN_ID })],
    );

    const baseInsight = {
      proposal_id: RUN_ID,
      topic: "Workspace promotion authority",
      category: "Decision" as const,
      content: "Workspace-scoped promotion proof",
      source: PRINCIPAL,
      confidence: 0.94,
      group_id: GROUP,
      workspace_id: WORKSPACE_A,
      notion_page_id: `notion-${RUN_ID}`,
      postgres_trace_id: `trace-${RUN_ID}`,
    };
    await expect(promoteToNeo4j({ ...baseInsight, id: firstId })).resolves.toBe(firstId);
    await expect(promoteToNeo4j({ ...baseInsight, id: secondId, supersedes_id: firstId })).resolves.toBe(secondId);

    const memories = await ownerPool.query(
      `SELECT id,group_id,workspace_id,workspace_scope_state,version
       FROM graph_memories WHERE id=ANY($1::text[]) ORDER BY version`,
      [[firstId, secondId]],
    );
    expect(memories.rows).toEqual([
      { id:firstId, group_id:GROUP, workspace_id:WORKSPACE_A, workspace_scope_state:"workspace_scoped", version:1 },
      { id:secondId, group_id:GROUP, workspace_id:WORKSPACE_A, workspace_scope_state:"workspace_scoped", version:2 },
    ]);
    const supersedes = await ownerPool.query(
      `SELECT newer_id,superseded_id,group_id,workspace_id,workspace_scope_state
       FROM graph_supersedes WHERE newer_id=$1`,
      [secondId],
    );
    expect(supersedes.rows).toEqual([{
      newer_id:secondId,
      superseded_id:firstId,
      group_id:GROUP,
      workspace_id:WORKSPACE_A,
      workspace_scope_state:"workspace_scoped",
    }]);

    const agentNodeId = `agent-${RUN_ID}`;
    await ownerPool.query(
      `INSERT INTO graph_structural_nodes(node_id,label,group_id,workspace_id,workspace_scope_state,props)
       VALUES($1,'Agent',$2,$3,'workspace_scoped',$4::jsonb)`,
      [agentNodeId, GROUP, WORKSPACE_A, JSON.stringify({ id: PRINCIPAL })],
    );
    await linkInsightToAgent(PRINCIPAL, secondId, 0.94, GROUP, WORKSPACE_A);
    expect((await ownerPool.query(
      `SELECT from_id,to_id,rel_type,group_id,workspace_id,workspace_scope_state FROM graph_structural_edges
       WHERE from_id=$1 AND to_id=$2`,
      [agentNodeId, secondId],
    )).rows).toEqual([{
      from_id:agentNodeId, to_id:secondId, rel_type:"CONTRIBUTED", group_id:GROUP,
      workspace_id:WORKSPACE_A, workspace_scope_state:"workspace_scoped",
    }]);
    const crossWorkspaceEdges = await withTenantTransaction(
      workspaceContext(WORKSPACE_B),
      (client) => client.query(
        "SELECT from_id FROM graph_structural_edges WHERE from_id=$1 AND to_id=$2",
        [agentNodeId, secondId],
      ),
      appPool,
    );
    expect(crossWorkspaceEdges.rows).toEqual([]);
  });

  it("uses the workspace authority boundary for operative RuVector adapter writes", async () => {
    const adapter = new RuVectorGraphAdapter(ownerPool);
    const firstId = `adapter-${RUN_ID}` as never;
    const secondId = `adapter-v2-${RUN_ID}` as never;
    const scope = {
      group_id: GROUP as never,
      workspace_id: WORKSPACE_A,
      principal_id: PRINCIPAL,
      user_id: PRINCIPAL,
      created_at: new Date().toISOString(),
    };
    await adapter.createMemory({
      ...scope, id:firstId, content:"adapter workspace proof", score:0.9 as never, provenance:"manual",
    });
    await expect(adapter.supersedesMemory({
      ...scope, prev_id:firstId, new_id:secondId, content:"adapter workspace proof v2", version:2,
    })).resolves.toMatchObject({ success:true, newId:secondId, newVersion:2 });
    expect((await ownerPool.query(
      `SELECT id,workspace_id,workspace_scope_state,deprecated FROM graph_memories
       WHERE id=ANY($1::text[]) ORDER BY version`,
      [[firstId, secondId]],
    )).rows).toEqual([
      { id:firstId, workspace_id:WORKSPACE_A, workspace_scope_state:"workspace_scoped", deprecated:true },
      { id:secondId, workspace_id:WORKSPACE_A, workspace_scope_state:"workspace_scoped", deprecated:false },
    ]);
  });

  it("upgrades valid shipped-39 receipts before archiving invalid rows and restores both losslessly", async () => {
    const dbName = `allura_252a_upgrade_${randomUUID().replaceAll("-", "")}`;
    await rootOwnerPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
    const upgradePool = new Pool({ ...ownerConfig, database: dbName });
    try {
      for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql") && name < "40-").sort()) {
        await upgradePool.query(readFileSync(path.join(migrationsDirectory, filename), "utf8"));
      }
      const proposalId = randomUUID();
      const validId = randomUUID();
      const invalidId = randomUUID();
      const legacyShapeId = randomUUID();
      await upgradePool.query("INSERT INTO workspaces(workspace_id,group_id,name) VALUES($1,$2,'upgrade fixture')", [WORKSPACE_A,GROUP]);
      const event = await upgradePool.query("INSERT INTO events(group_id,workspace_id,event_type,agent_id,metadata) VALUES($1,$2,'old39','requester','{}') RETURNING id", [GROUP,WORKSPACE_A]);
      await upgradePool.query("INSERT INTO canonical_proposals(id,group_id,workspace_id,content,score,tier,trace_ref) VALUES($1,$2,$3,'old39 proposal',0.8,'mainstream',$4)", [proposalId,GROUP,WORKSPACE_A,event.rows[0].id]);
      await upgradePool.query(`
        DROP TRIGGER governance_receipts_immutable_trigger ON governance_receipts;
        ALTER TABLE governance_receipts DROP CONSTRAINT governance_receipts_proposal_scope_fkey;
        ALTER TABLE governance_receipts DROP CONSTRAINT governance_receipts_evidence_scope_fkey;
        ALTER TABLE governance_receipts DROP CONSTRAINT governance_receipts_replay_key;
        ALTER TABLE governance_receipts DROP CONSTRAINT governance_receipts_action_check;
        ALTER TABLE governance_receipts DROP CONSTRAINT governance_receipts_actor_role_check;
        ALTER TABLE governance_receipts DROP CONSTRAINT governance_receipts_evidence_references_check;
        ALTER TABLE governance_receipts ALTER COLUMN proposal_id DROP NOT NULL;
        ALTER TABLE governance_receipts ALTER COLUMN proposal_version DROP NOT NULL;
        ALTER TABLE governance_receipts ALTER COLUMN evidence_request_id DROP NOT NULL;
        ALTER TABLE governance_receipts ALTER COLUMN evidence_identity_hash DROP NOT NULL;
        ALTER TABLE governance_receipts ADD COLUMN subject_kind TEXT;
        ALTER TABLE governance_receipts ADD COLUMN subject_id TEXT;
      `);
      await upgradePool.query(
        `INSERT INTO governance_receipts(id,group_id,workspace_id,subject_kind,subject_id,action,actor_id,actor_role,rationale,policy_reference,policy_version,outbox_state,source_event_id,evidence_references)
         VALUES($1,$3,$4,'proposal',$5,'reject','old-curator','curator','valid','policy://old39','39','not_applicable',$6,$7::jsonb),
               ($2,$3,$4,'proposal',$8,'reject','old-curator','curator','invalid','policy://old39','39','not_applicable',NULL,$7::jsonb),
               ($9,$3,$4,'proposal',$5,'recorded','old-reviewer','reviewer','legacy shape','policy://old39','39','not_enqueued',$6,'[]'::jsonb)`,
        [validId,invalidId,GROUP,WORKSPACE_A,proposalId,event.rows[0].id,JSON.stringify([`event:${event.rows[0].id}`]),randomUUID(),legacyShapeId],
      );
      await upgradePool.query(readFileSync(path.join(migrationsDirectory,"40-workspace-subgraph-forward-upgrade.sql"),"utf8"));
      expect((await upgradePool.query("SELECT id,proposal_id FROM governance_receipts ORDER BY id")).rows).toEqual([{ id: validId, proposal_id: proposalId }]);
      expect((await upgradePool.query("SELECT id FROM governance_receipts_legacy_archive ORDER BY id")).rows)
        .toEqual([invalidId,legacyShapeId].sort().map((id)=>({id})));
      const validated = await upgradePool.query(
        `SELECT conname,convalidated FROM pg_constraint WHERE conname=ANY($1::text[]) ORDER BY conname`,
        [["graph_memories_workspace_scope_state_check","graph_memories_group_workspace_fkey","allura_memories_workspace_scope_state_check","promotion_outbox_workspace_scope_state_check","promotion_idempotency_workspace_scope_state_check"]],
      );
      expect(validated.rows).toHaveLength(5);
      expect(validated.rows.every((row)=>row.convalidated)).toBe(true);

      await upgradePool.query(
        `INSERT INTO graph_structural_edges(from_id,to_id,rel_type,group_id,workspace_id,workspace_scope_state)
         VALUES('rollback-agent','rollback-memory','CONTRIBUTED',$1,$2,'workspace_scoped')`,
        [GROUP,WORKSPACE_A],
      );
      const recoverySql = readFileSync(path.resolve(process.cwd(),"docker/postgres-rollback/40-workspace-subgraph-forward-upgrade-recovery.sql"),"utf8");
      await expect(upgradePool.query(recoverySql)).rejects.toThrow(/workspace-scoped rows exist/);
      expect((await upgradePool.query(
        "SELECT workspace_id,workspace_scope_state FROM graph_structural_edges WHERE from_id='rollback-agent'",
      )).rows).toEqual([{workspace_id:WORKSPACE_A,workspace_scope_state:"workspace_scoped"}]);
      await upgradePool.query("DELETE FROM graph_structural_edges WHERE from_id='rollback-agent'");

      await upgradePool.query("UPDATE canonical_proposals SET proposal_version=2 WHERE id=$1",[proposalId]);
      await expect(upgradePool.query(recoverySql))
        .rejects.toThrow(/proposal_version differs from baseline 1/);
      expect((await upgradePool.query("SELECT proposal_version FROM canonical_proposals WHERE id=$1",[proposalId])).rows).toEqual([{proposal_version:"2"}]);
      await upgradePool.query("UPDATE canonical_proposals SET proposal_version=1 WHERE id=$1",[proposalId]);
      await upgradePool.query(recoverySql);
      expect((await upgradePool.query("SELECT id,subject_kind,subject_id FROM governance_receipts ORDER BY id")).rows)
        .toEqual([validId,invalidId,legacyShapeId].sort().map((id) => ({ id, subject_kind: "proposal", subject_id: id === invalidId ? expect.any(String) : proposalId })));
      const currentColumns = await upgradePool.query("SELECT column_name FROM information_schema.columns WHERE table_name='governance_receipts' AND column_name IN('proposal_id','evidence_request_id','evidence_identity_hash','proposal_version_origin')");
      expect(currentColumns.rows).toEqual([]);
      expect((await upgradePool.query("SELECT 1 FROM pg_trigger WHERE tgrelid='governance_receipts'::regclass AND tgname='governance_receipts_immutable_trigger'")).rows).toHaveLength(1);
    } finally {
      await upgradePool.end();
      await rootOwnerPool.query(`DROP DATABASE ${quoteIdentifier(dbName)} WITH (FORCE)`);
    }
  }, 60_000);

  it("approves without an evidence-request lifecycle row and persists scoped outbox/receipt truth", async () => {
    const proposalId = randomUUID();
    const trace = await ownerPool.query(
      `INSERT INTO events(group_id,workspace_id,event_type,agent_id,status,metadata)
       VALUES($1,$2,'memory_add','requester-real-rls','completed','{}') RETURNING id`,
      [GROUP, WORKSPACE_A],
    );
    await ownerPool.query(
      `INSERT INTO canonical_proposals(id,group_id,workspace_id,content,score,tier,status,trace_ref)
       VALUES($1,$2,$3,'Real approval RLS proof',0.93,'mainstream','pending',$4)`,
      [proposalId, GROUP, WORKSPACE_A, trace.rows[0].id],
    );

    const request = new NextRequest("http://localhost/api/curator/approve", {
      method: "POST",
      headers: {
        "x-allura-user-id": "curator-real-rls",
        "x-allura-session-id": "session-real-rls",
        "x-allura-role": "curator",
        "x-allura-group-id": GROUP,
        "x-allura-workspace-id": WORKSPACE_A,
      },
      body: JSON.stringify({ proposal_id: proposalId, group_id: GROUP, decision: "approve", rationale: "Disposable RLS approval proof" }),
    });

    const response = await approveProposalRoute(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ action: "approve", outbox_state: "queued", memory_id: expect.any(String), source_event_id: trace.rows[0].id });
    const durable = await ownerPool.query(
      `SELECT p.approved_memory_id,
              (SELECT count(*)::int FROM events e WHERE e.workspace_id=p.workspace_id AND e.metadata->>'proposal_id'=p.id::text AND e.event_type='proposal_approved') AS promotion_events,
              (SELECT count(*)::int FROM promotion_outbox o WHERE o.group_id=p.group_id AND o.workspace_id=p.workspace_id AND o.proposal_id=p.id AND o.status='pending') AS outbox_rows,
              (SELECT outbox_state FROM governance_receipts r WHERE r.group_id=p.group_id AND r.workspace_id=p.workspace_id AND r.proposal_id=p.id ORDER BY occurred_at DESC LIMIT 1) AS receipt_outbox,
              (SELECT evidence_request_id FROM governance_receipts r WHERE r.group_id=p.group_id AND r.workspace_id=p.workspace_id AND r.proposal_id=p.id ORDER BY occurred_at DESC LIMIT 1) AS receipt_evidence_request_id,
              (SELECT count(*)::int FROM evidence_requests er WHERE er.group_id=p.group_id AND er.workspace_id=p.workspace_id AND er.proposal_id=p.id) AS evidence_request_rows
       FROM canonical_proposals p WHERE p.id=$1`,
      [proposalId],
    );
    expect(durable.rows[0]).toMatchObject({
      approved_memory_id: body.memory_id, promotion_events: 1, outbox_rows: 1,
      receipt_outbox: "queued", receipt_evidence_request_id: null, evidence_request_rows: 0,
    });
  });
});
