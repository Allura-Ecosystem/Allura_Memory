import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TENANT_TABLE_INVENTORY, validateTenantTableInventory } from "@/lib/db/tenant-table-inventory";
import { getPool } from "@/lib/postgres/connection";

const workspaceFoundationMigration = path.resolve(
  process.cwd(),
  "docker/postgres-init/39-workspace-subgraph-foundation.sql",
);
const workspaceUpgradeMigration = path.resolve(
  process.cwd(),
  "docker/postgres-init/40-workspace-subgraph-forward-upgrade.sql",
);

const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_PASSWORD && process.env.POSTGRES_APP_USER && process.env.POSTGRES_APP_PASSWORD
  ? describe
  : describe.skip;

describe("tenant table inventory — unit checks", () => {
  it("has no duplicate table entries", () => {
    const names = TENANT_TABLE_INVENTORY.map((t) => t.table);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("includes the canonical tenant-scoped tables", () => {
    const names = new Set(TENANT_TABLE_INVENTORY.map((t) => t.table));
    expect(names.has("allura_memories")).toBe(true);
    expect(names.has("events")).toBe(true);
    expect(names.has("workspaces")).toBe(true);
    expect(names.has("mcp_tokens")).toBe(true);
  });

  it("classifies workspace evidence lifecycle foundations as tenant-scoped", () => {
    const classifications = new Map(
      TENANT_TABLE_INVENTORY.map((entry) => [entry.table, entry.class]),
    );
    expect(classifications.get("evidence_requests")).toBe("tenant-scoped");
    expect(classifications.get("governance_receipts")).toBe("tenant-scoped");
    expect(classifications.get("semantic_projections")).toBe("tenant-scoped");
  });

  it("assigns migration 40 ownership to retained and promotion families while quarantining legacy rows", () => {
    const treatments = new Map(TENANT_TABLE_INVENTORY.map((entry) => [entry.table, entry.workspaceTreatment]));
    expect(treatments.get("allura_memories")).toBe("workspace-scoped-new-writes");
    expect(treatments.get("promotion_outbox")).toBe("workspace-scoped-new-writes");
    expect(treatments.get("promotion_idempotency")).toBe("workspace-scoped-new-writes");
    expect(treatments.get("canonical_proposals")).toBe("workspace-scoped-new-writes");
  });

  it("requires an explicit workspace treatment for every Story 25.2a named record family", () => {
    const namedFamilies = ["allura_memories", "canonical_proposals", "events", "evidence_requests", "governance_receipts", "semantic_projections", "promotion_outbox", "promotion_idempotency"];
    for (const table of namedFamilies) {
      expect(TENANT_TABLE_INVENTORY.find((entry) => entry.table === table)?.workspaceTreatment, table).toBeDefined();
    }
  });

  it("has a numbered forward migration that upgrades old migration-39 table contracts", () => {
    const migration = readFileSync(workspaceUpgradeMigration, "utf8");
    expect(migration).toMatch(/ALTER TABLE governance_receipts/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS proposal_id/);
    expect(migration).toMatch(/RENAME COLUMN subject_id TO source_id/);
    expect(migration).toMatch(/ALTER TABLE semantic_projections/);
    expect(migration).toMatch(/RENAME COLUMN content_markdown TO markdown/);
    expect(migration).toContain("evidence_identity_hash");
    expect(migration).toMatch(/ALTER COLUMN proposal_version SET NOT NULL/);
    expect(migration).toMatch(/ALTER TABLE promotion_outbox[\s\S]*workspace_id/);
    expect(migration).toMatch(/ALTER TABLE promotion_idempotency[\s\S]*workspace_id/);
    expect(migration).toMatch(/ALTER TABLE allura_memories[\s\S]*workspace_id/);
    expect(migration).toContain("'040'");
  });

  it("retains legacy token integrity and guards every replayed named object", () => {
    const migration = readFileSync(workspaceFoundationMigration, "utf8");

    expect(migration).toContain("FOREIGN KEY (group_id, workspace_id)");
    expect(migration).not.toContain("DROP CONSTRAINT IF EXISTS mcp_tokens_workspace_id_fkey");
    expect(migration).toMatch(/pg_constraint[\s\S]*workspaces_group_workspace_key/);
    expect(migration).toMatch(/pg_constraint[\s\S]*mcp_tokens_group_workspace_fkey/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS evidence_requests_workspace_isolation_policy/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS governance_receipts_workspace_isolation_policy/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS semantic_projections_workspace_isolation_policy/);
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS governance_receipts_immutable_trigger/);
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS canonical_proposals_version_trigger/);
    expect(migration).toMatch(/NEW\.proposal_version := OLD\.proposal_version \+ 1/);
  });

  it("archives incomplete legacy receipts before validating the current contract", () => {
    const migration = readFileSync(workspaceUpgradeMigration, "utf8");
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    const archive = migration.indexOf("INSERT INTO governance_receipts_legacy_archive");
    const destructiveTriggerDdl = migration.indexOf("DROP TRIGGER IF EXISTS governance_receipts_immutable_trigger");
    const validation = migration.indexOf("VALIDATE CONSTRAINT governance_receipts_current_contract_check");
    expect(archive).toBeGreaterThan(destructiveTriggerDdl);
    expect(validation).toBeGreaterThan(archive);
    expect(migration).not.toMatch(/governance_receipts_current_contract_check[\s\S]{0,500}NOT VALID/);
  });

  it("preserves heterogeneous policies and adds a restrictive workspace boundary", () => {
    const migration = readFileSync(workspaceFoundationMigration, "utf8");

    expect(migration).not.toMatch(/DROP INDEX IF EXISTS idx_canonical_proposals_trace_ref_unique/i);
    expect(migration).not.toMatch(/idx_canonical_proposals_workspace_trace_ref_unique/i);
    expect(migration).not.toMatch(/DROP POLICY IF EXISTS tenant_isolation_policy ON canonical_proposals/i);
    expect(migration).not.toMatch(/FOR policy_name IN/);
    expect(migration).toMatch(/CREATE POLICY workspace_scope_restrictive_policy ON canonical_proposals AS RESTRICTIVE/);
    expect(migration).toMatch(/CREATE POLICY workspace_scope_restrictive_policy ON events AS RESTRICTIVE/);
  });

  it("classifies schema_versions as migration-only", () => {
    const entry = TENANT_TABLE_INVENTORY.find((t) => t.table === "schema_versions");
    expect(entry?.class).toBe("migration-only");
  });

  it("classifies every table migration 48 creates so the inventory gate does not fail against a live database", () => {
    const classifications = new Map(TENANT_TABLE_INVENTORY.map((entry) => [entry.table, entry.class]));
    const treatments = new Map(TENANT_TABLE_INVENTORY.map((entry) => [entry.table, entry.workspaceTreatment]));
    for (const table of ["bumblebee_batch_receipts", "bumblebee_records", "bumblebee_run_decisions"]) {
      expect(classifications.get(table), table).toBe("tenant-scoped");
      expect(treatments.get(table), table).toBe("workspace-scoped-new-writes");
    }
  });
});

describeLive("tenant table inventory — live validation", () => {
  it("reports workspace foundations as scoped, classified RLS tables", async () => {
    const expectedTables = ["evidence_requests", "governance_receipts", "semantic_projections"];
    const { rows } = await getPool().query<{
      tablename: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      workspace_column: boolean;
    }>(
      `SELECT c.relname AS tablename,
              c.relrowsecurity,
              c.relforcerowsecurity,
              EXISTS (
                SELECT 1 FROM information_schema.columns cols
                WHERE cols.table_schema = 'public'
                  AND cols.table_name = c.relname
                  AND cols.column_name = 'workspace_id'
              ) AS workspace_column
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = ANY($1::text[])
       ORDER BY c.relname`,
      [expectedTables],
    );

    expect(rows).toHaveLength(expectedTables.length);
    expect(rows).toEqual(
      expectedTables.map((tablename) => ({
        tablename,
        relrowsecurity: true,
        relforcerowsecurity: true,
        workspace_column: true,
      })),
    );
  });

  it("passes the live schema check (AC-1)", async () => {
    const report = await validateTenantTableInventory();
    expect(report.ok).toBe(true);
    expect(report.unclassifiedTables).toEqual([]);
    expect(report.missingRlsTables).toEqual([]);
  });
});
