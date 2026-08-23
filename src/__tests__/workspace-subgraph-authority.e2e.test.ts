import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { withTenantTransaction } from "@/lib/db/tenant-transaction";
import { getConnectionConfig, getPool } from "@/lib/postgres/connection";
import { getWorkspaceWatchdogCandidates } from "@/curator/watchdog";

const GROUP = "allura-workspace-authority";
const OTHER_GROUP = "allura-workspace-other";
const WORKSPACE_A = "workspace-authority-a";
const WORKSPACE_B = "workspace-authority-b";
const OTHER_WORKSPACE = "workspace-authority-other";
const PRINCIPAL = "workspace-authority-test";
const RUN_ID = randomUUID();
const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip;
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

  beforeAll(async () => {
    await rootOwnerPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);

    ownerPool = new Pool({ ...ownerConfig, database: databaseName });
    appPool = new Pool({
      ...ownerConfig,
      database: databaseName,
      user: process.env.POSTGRES_APP_USER || "allura_app",
      password: process.env.POSTGRES_APP_PASSWORD || "change-me-in-production",
      max: 1,
    });

    for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
      await ownerPool.query(readFileSync(path.join(migrationsDirectory, filename), "utf8"));
    }

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
    await teardownDisposableDatabase({ appPool, ownerPool, rootOwnerPool, databaseName });
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
      table: "governance_receipts",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO governance_receipts (
                group_id, workspace_id, subject_kind, subject_id, action, actor_id, actor_role,
                rationale, policy_reference, policy_version, occurred_at
              ) VALUES ($1, $2, 'test', $3, 'recorded', $4, 'tester',
                        'RLS authority proof', 'policy://test', 'v1', NOW())`,
        values: [GROUP, workspaceId, `${workspaceId}-${RUN_ID}`, PRINCIPAL],
      }),
    },
    {
      table: "semantic_projections",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO semantic_projections (
                group_id, workspace_id, subject_kind, subject_id, projection_version,
                source_revision_hash, source_refs, redaction_policy_version, content_markdown
              ) VALUES ($1, $2, 'test', $3, 'v1', 'hash', $4::jsonb, 'policy-v1', 'proof')`,
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
      table: "governance_receipts",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO governance_receipts (
                group_id, workspace_id, subject_kind, subject_id, action, actor_id, actor_role,
                rationale, policy_reference, policy_version, occurred_at
              ) VALUES ($1, $2, 'test', $3, 'recorded', $4, 'tester',
                        'RLS authority proof', 'policy://test', 'v1', NOW())`,
        values: [GROUP, workspaceId, `${workspaceId}-${RUN_ID}`, PRINCIPAL],
      }),
    },
    {
      table: "semantic_projections",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO semantic_projections (
                group_id, workspace_id, subject_kind, subject_id, projection_version,
                source_revision_hash, source_refs, redaction_policy_version, content_markdown
              ) VALUES ($1, $2, 'test', $3, 'v1', 'hash', $4::jsonb, 'policy-v1', 'proof')`,
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
      table: "governance_receipts",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO governance_receipts (
                group_id, workspace_id, subject_kind, subject_id, action, actor_id, actor_role,
                rationale, policy_reference, policy_version, occurred_at
              ) VALUES ($1, $2, 'test', $3, 'recorded', $4, 'tester',
                        'RLS authority proof', 'policy://test', 'v1', NOW())`,
        values: [GROUP, workspaceId, `${workspaceId}-${RUN_ID}`, PRINCIPAL],
      }),
    },
    {
      table: "semantic_projections",
      insert: (workspaceId: string) => ({
        sql: `INSERT INTO semantic_projections (
                group_id, workspace_id, subject_kind, subject_id, projection_version,
                source_revision_hash, source_refs, redaction_policy_version, content_markdown
              ) VALUES ($1, $2, 'test', $3, 'v1', 'hash', $4::jsonb, 'policy-v1', 'proof')`,
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
           group_id, workspace_id, subject_kind, subject_id, projection_version,
           source_revision_hash, source_refs, redaction_policy_version, content_markdown
         ) VALUES ($1, $2, 'proposal', $3, 'v1', 'hash', $4::jsonb, 'policy-v1', 'proof')`,
        [GROUP, WORKSPACE_A, RUN_ID, JSON.stringify([{ table: 'canonical_proposals', id: RUN_ID }])],
      ),
      appPool,
    );
    expect(first.rowCount).toBe(1);
    await expect(withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(
        `INSERT INTO semantic_projections (
           group_id, workspace_id, subject_kind, subject_id, projection_version,
           source_revision_hash, source_refs, redaction_policy_version, content_markdown
         ) VALUES ($1, $2, 'proposal', $3, 'v1', 'hash', $4::jsonb, 'policy-v1', 'proof')`,
        [GROUP, WORKSPACE_A, RUN_ID, JSON.stringify([{ table: 'events', id: 'different-source' }])],
      ),
      appPool,
    )).resolves.toMatchObject({ rowCount: 1 });

    await expect(withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(
        `INSERT INTO governance_receipts (
           group_id, workspace_id, subject_kind, subject_id, action, actor_id, actor_role,
           rationale, policy_reference, policy_version, memory_id, result_ref, outbox_state, occurred_at
         ) VALUES ($1, $2, 'proposal', $3, 'recorded', $4, 'tester', 'proof', 'policy://test', 'v1',
                   'memory-1', 'result-1', 'not_enqueued', NOW())`,
        [GROUP, WORKSPACE_A, `receipt-contract-${RUN_ID}`, PRINCIPAL],
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
    const workspaceBEvent = await ownerPool.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, metadata)
       VALUES ($1, $2, 'receipt_workspace_b_event', 'authority-owner', '{}'::jsonb)
       RETURNING id`,
      [GROUP, WORKSPACE_B],
    );
    const otherTenantEvent = await ownerPool.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, metadata)
       VALUES ($1, $2, 'receipt_other_tenant_event', 'authority-owner', '{}'::jsonb)
       RETURNING id`,
      [OTHER_GROUP, OTHER_WORKSPACE],
    );
    const insertReceipt = (sourceEventId: number) => ownerPool.query(
      `INSERT INTO governance_receipts (
         group_id, workspace_id, subject_kind, subject_id, action, actor_id, actor_role,
         rationale, policy_reference, policy_version, source_event_id, occurred_at
       ) VALUES ($1, $2, 'test', $3, 'recorded', $4, 'tester',
                 'provenance proof', 'policy://test', 'v1', $5, NOW())`,
      [GROUP, WORKSPACE_A, `cross-event-${sourceEventId}-${RUN_ID}`, PRINCIPAL, sourceEventId],
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

  it("replays migration 39 by tightening every canonical proposal policy in place", async () => {
    await ownerPool.query(
      `CREATE POLICY legacy_group_only_policy ON canonical_proposals
       FOR ALL TO allura_app
       USING (group_id = current_setting('app.current_group_id', true))
       WITH CHECK (group_id = current_setting('app.current_group_id', true))`,
    );

    await ownerPool.query(readFileSync(path.join(migrationsDirectory, "39-workspace-subgraph-foundation.sql"), "utf8"));

    const { rows } = await ownerPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
      `SELECT policyname, qual, with_check
       FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'canonical_proposals'`,
    );
    expect(rows).toHaveLength(2);
    for (const policy of rows) {
      expect(policy.qual).toContain("current_workspace_id");
      expect(policy.with_check).toContain("current_workspace_id");
    }
  });

  it("replays migration 39 by tightening every events policy in place", async () => {
    await ownerPool.query(
      `CREATE POLICY legacy_event_group_only_policy ON events
       FOR ALL TO allura_app
       USING (group_id = current_setting('app.current_group_id', true))
       WITH CHECK (group_id = current_setting('app.current_group_id', true))`,
    );

    await ownerPool.query(readFileSync(path.join(migrationsDirectory, "39-workspace-subgraph-foundation.sql"), "utf8"));

    const { rows } = await ownerPool.query<{ policyname: string; qual: string | null; with_check: string | null }>(
      `SELECT policyname, qual, with_check
       FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'events'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const policy of rows) {
      expect(policy.qual).toContain("current_workspace_id");
      expect(policy.with_check).toContain("current_workspace_id");
    }
  });

  it("rejects governance receipt updates and deletes while retaining the receipt", async () => {
    const inserted = await withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query(
        `INSERT INTO governance_receipts (
           group_id, workspace_id, subject_kind, subject_id, action, actor_id, actor_role,
           rationale, policy_reference, policy_version, occurred_at
         ) VALUES ($1, $2, 'test', $3, 'recorded', $4, 'tester',
                   'TDD proof', 'policy://test', 'v1', NOW()) RETURNING id`,
        [GROUP, WORKSPACE_A, `immutable-receipt-${RUN_ID}`, PRINCIPAL],
      ),
      appPool,
    );
    const receiptId = inserted.rows[0].id;

    await expect(withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query("UPDATE governance_receipts SET rationale = 'changed' WHERE id = $1", [receiptId]),
      appPool,
    )).rejects.toThrow(/immutable/);
    await expect(withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query("DELETE FROM governance_receipts WHERE id = $1", [receiptId]),
      appPool,
    )).rejects.toThrow(/immutable/);

    const retained = await withTenantTransaction(
      workspaceContext(WORKSPACE_A),
      (client) => client.query("SELECT id FROM governance_receipts WHERE id = $1", [receiptId]),
      appPool,
    );
    expect(retained.rows).toHaveLength(1);
  });
});
