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
    expect(sql).not.toContain("SET search_path = pg_catalog, public, app")
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.bumblebee_bootstrap_runner(TEXT) FROM PUBLIC")
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.bumblebee_bootstrap_ingest(TEXT) FROM PUBLIC")
    expect(sql).toContain("REVOKE INSERT ON bumblebee_scan_leases FROM allura_app")
    expect(sql).not.toContain("GRANT SELECT, INSERT, UPDATE (revoked_at) ON bumblebee_scan_leases")
    expect(sql).toContain("LANGUAGE plpgsql SECURITY DEFINER")
    expect(sql).toContain("SET search_path = pg_catalog")
    expect(sql).toContain("ALTER FUNCTION app.issue_bumblebee_scan_lease")
    expect(sql).toContain("OWNER TO CURRENT_USER")
    expect(sql).not.toContain("OWNER TO allura")
    expect(sql).toContain("c.audience = 'bumblebee_runner'")
    expect(sql).toContain("c.revoked_at IS NULL")
    expect(sql).toContain("c.expires_at > statement_timestamp()")
    expect(sql).toContain("ALTER TABLE bumblebee_scan_leases FORCE ROW LEVEL SECURITY")
    expect(sql).not.toContain("GRANT DELETE")
  })
})
