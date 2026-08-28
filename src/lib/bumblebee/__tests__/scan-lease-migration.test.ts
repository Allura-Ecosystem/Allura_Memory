import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("Story 26.7 scan lease relational contract", () => {
  it("defines scoped immutable leases and narrow credential bootstrap functions", () => {
    const sql = readFileSync(join(process.cwd(), "docker/postgres-init/47-bumblebee-scan-leases.sql"), "utf8")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_scan_leases")
    expect(sql).toContain("FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id)")
    expect(sql).toContain("UNIQUE (group_id, workspace_id, source_id, source_revision_id, generation)")
    expect(sql).toContain("FOR UPDATE")
    expect(sql).toContain("COALESCE(MAX(generation), 0) + 1")
    expect(sql).toContain("SECURITY DEFINER")
    expect(sql).toContain("SET search_path = pg_catalog, public, app")
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.bumblebee_bootstrap_runner(TEXT) FROM PUBLIC")
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.bumblebee_bootstrap_ingest(TEXT) FROM PUBLIC")
    expect(sql).toContain("ALTER TABLE bumblebee_scan_leases FORCE ROW LEVEL SECURITY")
    expect(sql).not.toContain("GRANT DELETE")
  })
})
