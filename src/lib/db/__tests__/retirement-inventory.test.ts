import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"

const archived = ["design_sync_status", "sync_drift_log", "ruvector_memory_fallback"]
let missingActive = ""
vi.mock("@/lib/postgres/connection", () => ({ getPool: () => ({ query: async (sql: string) => {
  const live = TENANT_TABLE_INVENTORY.filter((entry) => !archived.includes(entry.table) && entry.table !== missingActive)
  return { rows: sql.includes("information_schema.tables")
    ? live.map((entry) => ({ table_name: entry.table }))
    : live.map((entry) => ({ tablename: entry.table, relrowsecurity: true, relforcerowsecurity: true })) }
} }) }))
import { TABLES_REQUIRING_RLS, TENANT_TABLE_INVENTORY, validateTenantTableInventory } from "../tenant-table-inventory"

describe("post-quarantine public inventory", () => {
  it("excludes exactly migration 71's archived tables from active inventory", () => {
    const sql = readFileSync("docker/postgres-init/71-retired-storage-quarantine.sql", "utf8")
    const declared = sql.match(/ARRAY\['([^\]]+)'\]/)?.[1]?.split("','")
    expect(declared).toEqual(archived)
    for (const name of archived) expect(TENANT_TABLE_INVENTORY.map((entry) => entry.table)).not.toContain(name)
    expect(TABLES_REQUIRING_RLS).toEqual(expect.arrayContaining(["events", "graph_memories", "graph_supersedes", "canonical_proposals"]))
  })
  it("accepts the post-bootstrap public inventory fixture", async () => {
    expect(await validateTenantTableInventory()).toEqual({ ok: true, missingRlsTables: [], unclassifiedTables: [] })
  })
  it("still fails if an active tenant table is absent", async () => {
    missingActive = "graph_memories"
    try {
      expect((await validateTenantTableInventory()).missingRlsTables).toContain("graph_memories")
      expect((await validateTenantTableInventory()).ok).toBe(false)
    } finally { missingActive = "" }
  })
})
