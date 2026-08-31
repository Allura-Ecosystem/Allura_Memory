import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const migration55 = readFileSync(join(process.cwd(), "docker/postgres-init/55-bumblebee-production-hardening.sql"), "utf8")
const migration56 = readFileSync(join(process.cwd(), "docker/postgres-init/56-bumblebee-forward-upgrade.sql"), "utf8")

describe("Bumblebee production hardening forward migration", () => {
  it("preserves the shipped 055 contract and moves remediation to 056", () => {
    expect(migration55).toContain("CREATE UNIQUE INDEX IF NOT EXISTS bumblebee_batch_receipts_one_body_per_lease")
    expect(migration55).toContain("'055'")
    expect(migration56).toContain("DROP INDEX IF EXISTS bumblebee_batch_receipts_one_body_per_lease")
    expect(migration56).toContain("CREATE TABLE IF NOT EXISTS bumblebee_lease_body_authority")
    expect(migration56).toContain("CREATE TABLE IF NOT EXISTS bumblebee_batch_receipt_quarantine")
    expect(migration56).toContain("legacy_multiple_bodies")
    expect(migration56).toContain("'056'")
  })

  it("makes reconciliation observable, immutable, and workspace-RLS scoped", () => {
    for (const table of ["bumblebee_lease_body_authority", "bumblebee_batch_receipt_quarantine"]) {
      expect(migration56).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration56).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)
    }
    expect(migration56).toContain("app.prevent_bumblebee_reconciliation_mutation")
    expect(migration56).toContain("bumblebee_exposure_evidence_reader")
    expect(migration56).toContain("quarantined_receipts")
    expect(migration56).toContain("WITH (security_invoker = true)")
    expect(migration56).toContain("GRANT SELECT ON bumblebee_lease_body_reconciliation TO allura_app")
    expect(migration56).toContain("current_setting('app.current_group_id', true)")
    expect(migration56).toContain("current_setting('app.current_workspace_id', true)")
  })

  it("binds trusted evidence to the latest fresh promoted inventory, never merely the newest lease", () => {
    expect(migration56).toContain("inventory_lease_id")
    expect(migration56).toContain("inventory_batch_id")
    expect(migration56).toContain("inventory_generation")
    expect(migration56).toContain("newer_decision.decision='promoted'")
    expect(migration56).toContain("newer_source.freshness_ttl_seconds")
    expect(migration56).toContain("FOR UPDATE")
    expect(migration56).toContain("bumblebee_batch_receipts_exact_body_identity")
    expect(migration56).toContain("bumblebee_lease_body_authority_active_receipt_fkey")
    expect(migration56).toContain("VALIDATE CONSTRAINT bumblebee_lease_body_authority_active_receipt_fkey")
    expect(migration56).toContain("bumblebee_exposure_inventory_provenance_check")
    expect(migration56).toContain("app.insert_bumblebee_exposure_evidence")
  })
})
