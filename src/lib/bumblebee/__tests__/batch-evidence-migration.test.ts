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
    expect(sql).toContain("PRIMARY KEY (group_id, workspace_id, source_id, run_id, record_id)")
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
    expect(sql).toContain("REFERENCES bumblebee_records(group_id, workspace_id, source_id, run_id, record_id)")
    expect(sql).toContain("CHECK ((decision = 'promoted') = (summary_record_id IS NOT NULL))")
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
})