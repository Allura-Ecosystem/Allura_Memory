import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const readMigration = (): string =>
  readFileSync(join(process.cwd(), "docker/postgres-init/48-bumblebee-batch-evidence.sql"), "utf8")

describe("Story 26.7 batch evidence relational contract", () => {
  it("defines exact-replay batch receipts bound to a single scan lease", () => {
    const sql = readMigration()
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_batch_receipts")
    expect(sql).toContain("body_sha256 TEXT NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$')")
    expect(sql).toContain("byte_count BIGINT NOT NULL CHECK (byte_count > 0)")
    expect(sql).toContain("line_count BIGINT NOT NULL CHECK (line_count > 0)")
    expect(sql).toContain("record_count BIGINT NOT NULL CHECK (record_count > 0)")
    expect(sql).toContain("sanitized_payload_digest TEXT NOT NULL CHECK (sanitized_payload_digest ~ '^[a-f0-9]{64}$')")
    expect(sql).toContain("accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")
    expect(sql).toContain("PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id)")
    expect(sql).toContain("UNIQUE (group_id, workspace_id, source_id, source_revision_id, lease_id, body_sha256)")
    expect(sql).toContain("REFERENCES bumblebee_scan_leases(group_id, workspace_id, source_id, source_revision_id, lease_id)")
  })

  it("defines sanitized immutable records including pinned-scanner diagnostics", () => {
    const sql = readMigration()
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_records")
    expect(sql).toContain("record_type TEXT NOT NULL CHECK (record_type IN ('package', 'finding', 'scan_summary', 'diagnostic'))")
    expect(sql).toContain("sanitized_payload JSONB NOT NULL")
    expect(sql).toContain("canonical_id_inputs JSONB NOT NULL")
    expect(sql).toContain("line_number BIGINT NOT NULL CHECK (line_number > 0)")
    expect(sql).toContain("line_sha256 TEXT NOT NULL CHECK (line_sha256 ~ '^[a-f0-9]{64}$')")
    expect(sql).toContain("redaction_provenance JSONB NOT NULL")
    // Migration 48 declared the records PK on (group_id, workspace_id,
    // source_id, run_id, record_id) — a scanner-supplied run_id that repeats
    // across leases/generations makes that key ambiguous. The grain is
    // corrected by migration 52 (which re-declares the PK on the full
    // seven-column lease-bound key); migration 48 itself is already applied
    // in every deployed database, so it is never edited.
    expect(sql).toContain("run_id TEXT NOT NULL")
    expect(sql).toContain("REFERENCES bumblebee_batch_receipts(group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id)")
  })

  it("defines append-only run decisions where promotion requires a summary record", () => {
    const sql = readMigration()
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bumblebee_run_decisions")
    expect(sql).toContain("run_id TEXT NOT NULL")
    expect(sql).toContain("summary_record_id TEXT")
    expect(sql).toContain("decision TEXT NOT NULL CHECK (decision IN ('held', 'promoted'))")
    expect(sql).toContain("reason_code TEXT NOT NULL CHECK (LENGTH(TRIM(reason_code)) > 0)")
    expect(sql).toContain("decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")
    expect(sql).toContain("PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, decision_id)")
    // Migration 48 bound the summary reference with the records' OLD ambiguous
    // PK (group_id, workspace_id, source_id, run_id, record_id), so a summary
    // from one lease/generation could satisfy a decision row in another.
    // Migration 52 drops that FK and re-adds it on the full lease-bound grain;
    // migration 48 itself is already applied in every deployed database, so
    // it is never edited.
    expect(sql).toContain("FOREIGN KEY (group_id, workspace_id, source_id, run_id, summary_record_id)")
    expect(sql).toContain("CHECK (decision != 'promoted' OR summary_record_id IS NOT NULL)")
  })

  it("blocks history rewrites with immutability triggers and forced row-level scope", () => {
    const sql = readMigration()
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON bumblebee_batch_receipts")
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON bumblebee_records")
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON bumblebee_run_decisions")
    expect(sql).toContain("EXECUTE FUNCTION app.protect_bumblebee_batch_receipt()")
    expect(sql).toContain("EXECUTE FUNCTION app.protect_bumblebee_record()")
    expect(sql).toContain("EXECUTE FUNCTION app.protect_bumblebee_run_decision()")
    expect(sql).toContain("ALTER TABLE bumblebee_batch_receipts ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE bumblebee_batch_receipts FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE bumblebee_records ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE bumblebee_records FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE bumblebee_run_decisions ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE bumblebee_run_decisions FORCE ROW LEVEL SECURITY")
  })

  it("scopes every table to the app role without rewrite authority and stamps version 048", () => {
    const sql = readMigration()
    expect(sql).toContain("CREATE POLICY bumblebee_batch_receipts_scope ON bumblebee_batch_receipts FOR ALL TO allura_app")
    expect(sql).toContain("CREATE POLICY bumblebee_records_scope ON bumblebee_records FOR ALL TO allura_app")
    expect(sql).toContain("CREATE POLICY bumblebee_run_decisions_scope ON bumblebee_run_decisions FOR ALL TO allura_app")
    expect(sql).toContain("current_setting('app.current_group_id', true)")
    expect(sql).toContain("current_setting('app.current_workspace_id', true)")
    expect(sql).toContain("WITH CHECK (group_id = current_setting('app.current_group_id', true)")
    expect(sql).toContain("GRANT SELECT, INSERT ON bumblebee_batch_receipts TO allura_app")
    expect(sql).toContain("GRANT SELECT, INSERT ON bumblebee_records TO allura_app")
    expect(sql).toContain("GRANT SELECT, INSERT ON bumblebee_run_decisions TO allura_app")
    expect(sql).not.toContain("GRANT UPDATE")
    expect(sql).not.toContain("GRANT DELETE")
    expect(sql).toContain("VALUES ('048', NOW(),")
    expect(sql).toContain("ON CONFLICT (version) DO NOTHING")
  })

  it("corrects the records grain in migration 52 so summary citations cannot cross lease/generation/source-revision", () => {
    const sql = readFileSync(
      join(process.cwd(), "docker/postgres-init/52-bumblebee-records-grain.sql"),
      "utf8",
    )
    expect(sql.trimStart().startsWith("--")).toBe(true)
    expect(sql).toMatch(/\nBEGIN;\n/)
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true)

    // The old FK was declared inline in migration 48 and PostgreSQL
    // auto-named it from the referencing columns (truncated to 63 chars);
    // it must be dropped before the PK it referenced can be replaced.
    expect(sql).toContain("ALTER TABLE bumblebee_run_decisions DROP CONSTRAINT IF EXISTS bumblebee_run_decisions_group_id_workspace_id_source_id_ru_fkey")

    // The records PK moves off the scanner-supplied run_id onto the full
    // lease-bound grain, so the same run_id reused by a later lease or
    // generation can never collide with earlier evidence.
    expect(sql).toContain("ALTER TABLE bumblebee_records DROP CONSTRAINT bumblebee_records_pkey")
    expect(sql).toContain(
      "ADD CONSTRAINT bumblebee_records_pkey PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, record_id)",
    )

    // The run_decisions summary reference is re-bound on the SAME grain as
    // the decision row itself — every column of the FK is present on the
    // referencing row, so a cited summary is always the one from this exact
    // lease + batch, never a lookalike from another run.
    expect(sql).toContain(
      "ADD CONSTRAINT bumblebee_run_decisions_summary_record_id_fkey FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, summary_record_id)",
    )
    expect(sql).toContain(
      "REFERENCES bumblebee_records(group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, record_id)",
    )

    // Scanner lookups by run_id keep a supporting index now the PK no longer
    // leads with it.
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS bumblebee_records_run_id_idx\n  ON bumblebee_records (group_id, workspace_id, source_id, run_id)",
    )

    expect(sql).toContain("INSERT INTO schema_versions (version, applied_at, description)")
    expect(sql).toContain("VALUES ('052',")
    expect(sql).toContain("ON CONFLICT (version) DO NOTHING")
  })
})