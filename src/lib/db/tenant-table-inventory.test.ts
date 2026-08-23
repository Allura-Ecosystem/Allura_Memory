import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TENANT_TABLE_INVENTORY, validateTenantTableInventory } from "@/lib/db/tenant-table-inventory";
import { getPool } from "@/lib/postgres/connection";

const workspaceFoundationMigration = path.resolve(
  process.cwd(),
  "docker/postgres-init/39-workspace-subgraph-foundation.sql",
);

const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip;

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
  });

  it("preserves durable trace uniqueness and upgrades canonical proposal RLS without destructive replacement", () => {
    const migration = readFileSync(workspaceFoundationMigration, "utf8");

    expect(migration).not.toMatch(/DROP INDEX IF EXISTS idx_canonical_proposals_trace_ref_unique/i);
    expect(migration).not.toMatch(/idx_canonical_proposals_workspace_trace_ref_unique/i);
    expect(migration).not.toMatch(/DROP POLICY IF EXISTS tenant_isolation_policy ON canonical_proposals/i);
    expect(migration).toMatch(/pg_policy[\s\S]*tenant_isolation_policy/);
    expect(migration).toMatch(/ALTER POLICY %I ON canonical_proposals[\s\S]*current_workspace_id/);
  });

  it("classifies schema_versions as migration-only", () => {
    const entry = TENANT_TABLE_INVENTORY.find((t) => t.table === "schema_versions");
    expect(entry?.class).toBe("migration-only");
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
