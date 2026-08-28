import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = path.resolve(process.cwd(), "docker/postgres-init/48-bumblebee-ingest-ledger.sql")

describe("Story 26.7 immutable ingest ledger migration", () => {
  it("defines scope-qualified receipt/record ledgers, RLS, immutable guards, and insert-only app grants", () => {
    const sql = readFileSync(migrationPath, "utf8")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_batch_receipts")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_records")
    expect((sql.match(/group_id TEXT NOT NULL CHECK \(group_id ~ '\^allura-/g) ?? []).length).toBe(4)
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
    // Append-only least privilege, matching every sibling bumblebee table: the app
    // role inserts directly; UPDATE/DELETE stay withheld so the immutability
    // triggers keep a second line of defence.
    expect(sql).toMatch(/GRANT SELECT, INSERT ON bumblebee_batch_receipts, bumblebee_records, bumblebee_run_decisions, bumblebee_exposure_evidence TO allura_app/)
    expect(sql).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*bumblebee_(batch_receipts|records|run_decisions|exposure_evidence)/)
    // No security-definer write gateway: a dead SECURITY DEFINER function with a
    // live GRANT EXECUTE is a standing privilege-escalation surface.
    expect(sql).not.toMatch(/SECURITY DEFINER/)
    expect(sql).not.toMatch(/accept_bumblebee_ingest/)
    for (const table of ["bumblebee_run_decisions", "bumblebee_exposure_evidence"]) {
      expect(sql).toContain(`CREATE POLICY ${table}_insert_scope ON ${table} FOR INSERT TO allura_app`)
    }
    expect(sql).toContain("prevent_bumblebee_immutable_mutation")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_run_decisions")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_exposure_evidence")
    // Epic contract item 8: one decision per BATCH, many per lease. A per-lease
    // UNIQUE would make held-then-promoted impossible and abort the second batch.
    expect(sql).not.toMatch(/UNIQUE \(group_id, workspace_id, source_id, source_revision_id, lease_id\)/)
    expect(sql).toMatch(/summary_record_id TEXT CHECK \(summary_record_id ~ '\^scan_summary:\[a-f0-9\]\{64\}\$'\)/)
    expect(sql).toMatch(/CHECK \(decision = 'held' OR summary_record_id IS NOT NULL\)/)
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
