import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = path.resolve(process.cwd(), "docker/postgres-init/48-bumblebee-ingest-ledger.sql")

describe("Story 26.7 immutable ingest ledger migration", () => {
  it("defines scope-qualified receipt/record ledgers, RLS, immutable guards, and insert-only app grants", () => {
    const sql = readFileSync(migrationPath, "utf8")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_batch_receipts")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_records")
    expect(sql).toMatch(/UNIQUE \(group_id, workspace_id, source_id, source_revision_id, lease_id, body_sha256\)/)
    expect(sql).toMatch(/UNIQUE \(group_id, workspace_id, source_id, run_id, record_id\)/)
    expect(sql).toMatch(/line_count INTEGER NOT NULL/)
    expect(sql).toMatch(/line_number INTEGER NOT NULL/)
    expect(sql).not.toMatch(/raw_body|body_payload|raw_payload/)
    expect(sql).toMatch(/FOREIGN KEY \(group_id, workspace_id, source_id, source_revision_id, lease_id\)/)
    expect(sql).toMatch(/FOREIGN KEY \(group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id\)/)
    for (const table of ["bumblebee_batch_receipts", "bumblebee_records"]) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      expect(sql).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)
    }
    expect(sql).toMatch(/REVOKE ALL ON bumblebee_batch_receipts, bumblebee_records, bumblebee_run_decisions, bumblebee_exposure_evidence FROM allura_app/)
    expect(sql).not.toMatch(/GRANT[^;]*INSERT[^;]*bumblebee_(batch_receipts|records|run_decisions|exposure_evidence)/)
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.accept_bumblebee_ingest")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.accept_bumblebee_ingest")
    expect(sql).toContain("prevent_bumblebee_immutable_mutation")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_run_decisions")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_exposure_evidence")
    expect(sql).toMatch(/UNIQUE \(group_id, workspace_id, source_id, source_revision_id, lease_id\)/)
    expect(sql).toContain("CREATE VIEW bumblebee_current_routine_runs")
    expect(sql).toContain("CREATE VIEW bumblebee_current_inventory")
    expect(sql).toContain("CREATE VIEW bumblebee_incomplete_runs")
    expect(sql).toContain("CREATE VIEW bumblebee_trusted_exposures")
    for (const table of ["bumblebee_run_decisions", "bumblebee_exposure_evidence"]) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      expect(sql).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)
    }
    expect(sql).toContain("'048'")
  })
})
