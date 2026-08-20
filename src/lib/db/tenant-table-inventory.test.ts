import { describe, expect, it } from "vitest";
import { TENANT_TABLE_INVENTORY, validateTenantTableInventory } from "@/lib/db/tenant-table-inventory";

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

  it("classifies schema_versions as migration-only", () => {
    const entry = TENANT_TABLE_INVENTORY.find((t) => t.table === "schema_versions");
    expect(entry?.class).toBe("migration-only");
  });
});

describeLive("tenant table inventory — live validation", () => {
  it("passes the live schema check (AC-1)", async () => {
    const report = await validateTenantTableInventory();
    expect(report.ok).toBe(true);
    expect(report.unclassifiedTables).toEqual([]);
    expect(report.missingRlsTables).toEqual([]);
  });
});
