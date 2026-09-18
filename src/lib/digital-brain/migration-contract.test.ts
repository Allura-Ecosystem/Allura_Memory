import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

import { TENANT_TABLE_INVENTORY } from "@/lib/db/tenant-table-inventory"

const migrationPath = path.resolve(process.cwd(), "docker/postgres-init/71-digital-brain-read-foundation.sql")

describe("Epic 30 digital Brain read migration contract", () => {
  it("rejects null and blank department identifiers explicitly", () => {
    const sql = readFileSync(migrationPath, "utf8")
    expect(sql).toContain("visibility = 'department' AND department_id IS NOT NULL AND length(btrim(department_id)) > 0")
  })
  it("forces exact tenant/workspace/owner or department authority under the app role", () => {
    const sql = readFileSync(migrationPath, "utf8")

    expect(sql).toContain("ALTER TABLE brain_documents FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE brain_department_memberships FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("current_setting('app.current_group_id', true)")
    expect(sql).toContain("current_setting('app.current_workspace_id', true)")
    expect(sql).toContain("current_setting('app.current_principal', true)")
    expect(sql).toContain("brain_documents.owner_id = current_setting('app.current_principal', true)")
    expect(sql).not.toMatch(/admin.*private|private.*admin/i)
    expect(sql).toContain("GRANT SELECT ON brain_documents, brain_department_memberships TO allura_app")
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON brain_documents, brain_department_memberships FROM allura_app")
  })

  it("requires active tenant membership in each disclosure policy", () => {
    const sql = readFileSync(migrationPath, "utf8")
    for (const table of ["brain_documents", "brain_department_memberships"]) {
      expect(sql).toContain(`tenant_membership.group_id = ${table}.group_id`)
    }
    expect(sql.match(/tenant_membership.removed_at IS NULL/g)).toHaveLength(2)
    expect(sql.match(/tenant_membership.user_id = current_setting\('app.current_principal', true\)/g)).toHaveLength(2)
  })

  it("classifies every new table in the machine-checked tenant inventory", () => {
    const classified = new Set(TENANT_TABLE_INVENTORY.map(({ table }) => table))

    expect(classified.has("brain_documents")).toBe(true)
    expect(classified.has("brain_department_memberships")).toBe(true)
  })
})
