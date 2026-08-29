-- Migration 48: append-only Bumblebee batch evidence.
BEGIN;

-- Receipts deduplicate by content hash so a replayed scanner batch can never
-- be counted twice under the same lease.
CREATE TABLE IF NOT EXISTS bumblebee_batch_receipts (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  batch_id TEXT NOT NULL CHECK (LENGTH(TRIM(batch_id)) > 0),
  body_sha256 TEXT NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
  byte_count BIGINT NOT NULL CHECK (byte_count > 0),
  line_count BIGINT NOT NULL CHECK (line_count > 0),
  record_count BIGINT NOT NULL CHECK (record_count > 0),
  sanitized_payload_digest TEXT NOT NULL CHECK (sanitized_payload_digest ~ '^[a-f0-9]{64}$'),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id),
  UNIQUE (group_id, workspace_id, source_id, source_revision_id, lease_id, body_sha256),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id)
    REFERENCES bumblebee_scan_leases(group_id, workspace_id, source_id, source_revision_id, lease_id)
);

-- Accepted evidence is the audit trail itself; any rewrite would falsify history.
CREATE OR REPLACE FUNCTION app.protect_bumblebee_batch_receipt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bumblebee batch receipts are append-only evidence; % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS bumblebee_batch_receipts_protected ON bumblebee_batch_receipts;
CREATE TRIGGER bumblebee_batch_receipts_protected
  BEFORE UPDATE OR DELETE ON bumblebee_batch_receipts
  FOR EACH ROW EXECUTE FUNCTION app.protect_bumblebee_batch_receipt();

ALTER TABLE bumblebee_batch_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_batch_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bumblebee_batch_receipts_scope ON bumblebee_batch_receipts;
CREATE POLICY bumblebee_batch_receipts_scope ON bumblebee_batch_receipts FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));
-- Narrow authority: ingest may append and read, never rewrite or withdraw.
REVOKE UPDATE, DELETE ON bumblebee_batch_receipts FROM allura_app;
GRANT SELECT, INSERT ON bumblebee_batch_receipts TO allura_app;

-- 'diagnostic' rows are preserved because the pinned scanner emits them and
-- replay fidelity depends on keeping every emitted record.
CREATE TABLE IF NOT EXISTS bumblebee_records (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  batch_id TEXT NOT NULL CHECK (LENGTH(TRIM(batch_id)) > 0),
  run_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('package', 'finding', 'scan_summary', 'diagnostic')),
  sanitized_payload JSONB NOT NULL,
  canonical_id_inputs JSONB NOT NULL,
  line_number BIGINT NOT NULL CHECK (line_number > 0),
  line_sha256 TEXT NOT NULL CHECK (line_sha256 ~ '^[a-f0-9]{64}$'),
  redaction_provenance JSONB NOT NULL,
  PRIMARY KEY (group_id, workspace_id, source_id, run_id, record_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id)
    REFERENCES bumblebee_batch_receipts(group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id)
);

CREATE OR REPLACE FUNCTION app.protect_bumblebee_record()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bumblebee records are append-only evidence; % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS bumblebee_records_protected ON bumblebee_records;
CREATE TRIGGER bumblebee_records_protected
  BEFORE UPDATE OR DELETE ON bumblebee_records
  FOR EACH ROW EXECUTE FUNCTION app.protect_bumblebee_record();

ALTER TABLE bumblebee_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bumblebee_records_scope ON bumblebee_records;
CREATE POLICY bumblebee_records_scope ON bumblebee_records FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));
REVOKE UPDATE, DELETE ON bumblebee_records FROM allura_app;
GRANT SELECT, INSERT ON bumblebee_records TO allura_app;

-- Promotion must point at the summary record that justified it, so a
-- 'promoted' decision and a missing summary cannot coexist.
CREATE TABLE IF NOT EXISTS bumblebee_run_decisions (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  batch_id TEXT NOT NULL CHECK (LENGTH(TRIM(batch_id)) > 0),
  decision_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  summary_record_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('held', 'promoted')),
  reason_code TEXT NOT NULL CHECK (LENGTH(TRIM(reason_code)) > 0),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, decision_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id)
    REFERENCES bumblebee_batch_receipts(group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id),
  FOREIGN KEY (group_id, workspace_id, source_id, run_id, summary_record_id)
    REFERENCES bumblebee_records(group_id, workspace_id, source_id, run_id, record_id),
  CHECK ((decision = 'promoted') = (summary_record_id IS NOT NULL))
);

CREATE OR REPLACE FUNCTION app.protect_bumblebee_run_decision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bumblebee run decisions are append-only evidence; % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS bumblebee_run_decisions_protected ON bumblebee_run_decisions;
CREATE TRIGGER bumblebee_run_decisions_protected
  BEFORE UPDATE OR DELETE ON bumblebee_run_decisions
  FOR EACH ROW EXECUTE FUNCTION app.protect_bumblebee_run_decision();

ALTER TABLE bumblebee_run_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_run_decisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bumblebee_run_decisions_scope ON bumblebee_run_decisions;
CREATE POLICY bumblebee_run_decisions_scope ON bumblebee_run_decisions FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));
REVOKE UPDATE, DELETE ON bumblebee_run_decisions FROM allura_app;
GRANT SELECT, INSERT ON bumblebee_run_decisions TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('048', NOW(), 'Story 26.7 batch evidence receipts, sanitized records, and append-only run decisions')
ON CONFLICT (version) DO NOTHING;

COMMIT;