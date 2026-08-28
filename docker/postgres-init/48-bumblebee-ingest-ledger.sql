-- Migration 48: immutable, scope-qualified Bumblebee ingest receipts, records,
-- decisions, exposure evidence, views, and security-definer accept function.
BEGIN;

-- ── Batch receipts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bumblebee_batch_receipts (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  batch_id TEXT NOT NULL CHECK (LENGTH(TRIM(batch_id)) > 0),
  body_sha256 TEXT NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
  expanded_sha256 TEXT NOT NULL CHECK (expanded_sha256 ~ '^[a-f0-9]{64}$'),
  sanitized_payload_digest TEXT NOT NULL CHECK (sanitized_payload_digest ~ '^[a-f0-9]{64}$'),
  compressed_bytes INTEGER NOT NULL CHECK (compressed_bytes > 0 AND compressed_bytes <= 1048576),
  expanded_bytes INTEGER NOT NULL CHECK (expanded_bytes > 0 AND expanded_bytes <= 4194304),
  line_count INTEGER NOT NULL CHECK (line_count > 0 AND line_count <= 500),
  record_count INTEGER NOT NULL CHECK (record_count > 0 AND record_count <= 500),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id),
  UNIQUE (group_id, workspace_id, source_id, source_revision_id, lease_id, body_sha256),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id)
    REFERENCES bumblebee_sources(group_id, workspace_id, source_id, source_revision_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id)
    REFERENCES bumblebee_scan_leases(group_id, workspace_id, source_id, source_revision_id, lease_id)
);

-- ── Sanitized records ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bumblebee_records (
  group_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL CHECK (LENGTH(TRIM(run_id)) > 0),
  record_id TEXT NOT NULL CHECK (record_id ~ '^(package|finding|scan_summary):[a-f0-9]{64}$'),
  record_type TEXT NOT NULL CHECK (record_type IN ('package','finding','scan_summary')),
  line_number INTEGER NOT NULL CHECK (line_number > 0 AND line_number <= 500),
  line_sha256 TEXT NOT NULL CHECK (line_sha256 ~ '^[a-f0-9]{64}$'),
  verification_digest TEXT NOT NULL CHECK (verification_digest ~ '^[a-f0-9]{64}$'),
  sanitized_payload JSONB NOT NULL CHECK (jsonb_typeof(sanitized_payload) = 'object'),
  redaction_provenance JSONB NOT NULL CHECK (jsonb_typeof(redaction_provenance) = 'object'),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, record_id),
  UNIQUE (group_id, workspace_id, source_id, run_id, record_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id)
    REFERENCES bumblebee_sources(group_id, workspace_id, source_id, source_revision_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id)
    REFERENCES bumblebee_scan_leases(group_id, workspace_id, source_id, source_revision_id, lease_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id)
    REFERENCES bumblebee_batch_receipts(group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id)
);

CREATE INDEX IF NOT EXISTS bumblebee_records_run_idx
  ON bumblebee_records (group_id, workspace_id, source_id, run_id, accepted_at);

-- ── Run decisions (append-only) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bumblebee_run_decisions (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  batch_id TEXT NOT NULL CHECK (LENGTH(TRIM(batch_id)) > 0),
  decision TEXT NOT NULL CHECK (decision IN ('promoted','held')),
  reason_code TEXT NOT NULL CHECK (LENGTH(TRIM(reason_code)) > 0),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id),
  UNIQUE (group_id, workspace_id, source_id, source_revision_id, lease_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id)
    REFERENCES bumblebee_sources(group_id, workspace_id, source_id, source_revision_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id)
    REFERENCES bumblebee_scan_leases(group_id, workspace_id, source_id, source_revision_id, lease_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id)
    REFERENCES bumblebee_batch_receipts(group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id)
);

-- ── Exposure evidence (provisional findings linked to accepted packages) ──
CREATE TABLE IF NOT EXISTS bumblebee_exposure_evidence (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  record_id TEXT NOT NULL CHECK (record_id ~ '^finding:[a-f0-9]{64}$'),
  evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  is_trusted BOOLEAN NOT NULL DEFAULT false,
  trusted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, record_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, record_id)
    REFERENCES bumblebee_records(group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, record_id)
);

-- ── Immutability triggers ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS bumblebee_batch_receipts_immutable ON bumblebee_batch_receipts;
CREATE TRIGGER bumblebee_batch_receipts_immutable
  BEFORE UPDATE OR DELETE ON bumblebee_batch_receipts
  FOR EACH ROW EXECUTE FUNCTION app.prevent_bumblebee_immutable_mutation();
DROP TRIGGER IF EXISTS bumblebee_records_immutable ON bumblebee_records;
CREATE TRIGGER bumblebee_records_immutable
  BEFORE UPDATE OR DELETE ON bumblebee_records
  FOR EACH ROW EXECUTE FUNCTION app.prevent_bumblebee_immutable_mutation();
DROP TRIGGER IF EXISTS bumblebee_run_decisions_immutable ON bumblebee_run_decisions;
CREATE TRIGGER bumblebee_run_decisions_immutable
  BEFORE UPDATE OR DELETE ON bumblebee_run_decisions
  FOR EACH ROW EXECUTE FUNCTION app.prevent_bumblebee_immutable_mutation();
DROP TRIGGER IF EXISTS bumblebee_exposure_evidence_immutable ON bumblebee_exposure_evidence;
CREATE TRIGGER bumblebee_exposure_evidence_immutable
  BEFORE UPDATE OR DELETE ON bumblebee_exposure_evidence
  FOR EACH ROW EXECUTE FUNCTION app.prevent_bumblebee_immutable_mutation();

-- ── RLS + policies ───────────────────────────────────────────────────────
ALTER TABLE bumblebee_batch_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_batch_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_records FORCE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_run_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_run_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_exposure_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_exposure_evidence FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bumblebee_batch_receipts_select_scope ON bumblebee_batch_receipts;
CREATE POLICY bumblebee_batch_receipts_select_scope ON bumblebee_batch_receipts FOR SELECT TO allura_app
  USING (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));
DROP POLICY IF EXISTS bumblebee_batch_receipts_insert_scope ON bumblebee_batch_receipts;
CREATE POLICY bumblebee_batch_receipts_insert_scope ON bumblebee_batch_receipts FOR INSERT TO allura_app
  WITH CHECK (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));

DROP POLICY IF EXISTS bumblebee_records_select_scope ON bumblebee_records;
CREATE POLICY bumblebee_records_select_scope ON bumblebee_records FOR SELECT TO allura_app
  USING (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));
DROP POLICY IF EXISTS bumblebee_records_insert_scope ON bumblebee_records;
CREATE POLICY bumblebee_records_insert_scope ON bumblebee_records FOR INSERT TO allura_app
  WITH CHECK (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));

DROP POLICY IF EXISTS bumblebee_run_decisions_select_scope ON bumblebee_run_decisions;
CREATE POLICY bumblebee_run_decisions_select_scope ON bumblebee_run_decisions FOR SELECT TO allura_app
  USING (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));

DROP POLICY IF EXISTS bumblebee_exposure_evidence_select_scope ON bumblebee_exposure_evidence;
CREATE POLICY bumblebee_exposure_evidence_select_scope ON bumblebee_exposure_evidence FOR SELECT TO allura_app
  USING (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));

-- ── Grants: no direct INSERT; accept function only ─
REVOKE ALL ON bumblebee_batch_receipts, bumblebee_records, bumblebee_run_decisions, bumblebee_exposure_evidence FROM allura_app;
GRANT SELECT ON bumblebee_batch_receipts, bumblebee_records, bumblebee_run_decisions, bumblebee_exposure_evidence TO allura_app;

-- ── Security-definer accept function ─────────────────────────────────────
-- All-or-nothing atomic ingest: inserts batch receipt + records + decision +
-- exposure evidence inside a single transaction.  The app role cannot INSERT
-- directly into decisions or evidence; this function is the only gateway.
CREATE OR REPLACE FUNCTION app.accept_bumblebee_ingest(
  p_group_id TEXT,
  p_workspace_id TEXT,
  p_source_id TEXT,
  p_source_revision_id TEXT,
  p_lease_id TEXT,
  p_batch_id TEXT,
  p_body_sha256 TEXT,
  p_expanded_sha256 TEXT,
  p_sanitized_payload_digest TEXT,
  p_compressed_bytes INTEGER,
  p_expanded_bytes INTEGER,
  p_line_count INTEGER,
  p_record_count INTEGER,
  p_records JSONB,
  p_decision TEXT,
  p_reason_code TEXT,
  p_exposure_evidence JSONB DEFAULT '[]'::jsonb
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_rec RECORD;
  v_evidence RECORD;
BEGIN
  -- Lock source then lease (same order as the TS repository).
  PERFORM 1 FROM public.bumblebee_sources
    WHERE group_id = p_group_id AND workspace_id = p_workspace_id
      AND source_id = p_source_id AND source_revision_id = p_source_revision_id
      AND disabled_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source not found or disabled'; END IF;

  PERFORM 1 FROM public.bumblebee_scan_leases
    WHERE group_id = p_group_id AND workspace_id = p_workspace_id
      AND source_id = p_source_id AND source_revision_id = p_source_revision_id
      AND lease_id = p_lease_id AND revoked_at IS NULL
      AND expires_at > statement_timestamp()
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lease not found, revoked, or expired'; END IF;

  -- Idempotent replay: if exact body already accepted, return prior batch_id.
  PERFORM 1 FROM public.bumblebee_batch_receipts
    WHERE group_id = p_group_id AND workspace_id = p_workspace_id
      AND source_id = p_source_id AND source_revision_id = p_source_revision_id
      AND lease_id = p_lease_id AND body_sha256 = p_body_sha256;
  IF FOUND THEN RETURN p_batch_id; END IF;

  INSERT INTO public.bumblebee_batch_receipts
    (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id,
     body_sha256, expanded_sha256, sanitized_payload_digest,
     compressed_bytes, expanded_bytes, line_count, record_count)
  VALUES
    (p_group_id, p_workspace_id, p_source_id, p_source_revision_id, p_lease_id, p_batch_id,
     p_body_sha256, p_expanded_sha256, p_sanitized_payload_digest,
     p_compressed_bytes, p_expanded_bytes, p_line_count, p_record_count);

  FOR v_rec IN SELECT * FROM jsonb_array_elements(p_records) AS obj LOOP
    INSERT INTO public.bumblebee_records
      (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id,
       run_id, record_id, record_type, line_number, line_sha256,
       verification_digest, sanitized_payload, redaction_provenance)
    VALUES
      (p_group_id, p_workspace_id, p_source_id, p_source_revision_id, p_lease_id, p_batch_id,
       v_rec->>'run_id', v_rec->>'record_id', v_rec->>'record_type',
       (v_rec->>'line_number')::INTEGER, v_rec->>'line_sha256',
       v_rec->>'verification_digest',
       (v_rec->>'sanitized_payload')::jsonb,
       (v_rec->>'redaction_provenance')::jsonb);
  END LOOP;

  INSERT INTO public.bumblebee_run_decisions
    (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id,
     decision, reason_code)
  VALUES
    (p_group_id, p_workspace_id, p_source_id, p_source_revision_id, p_lease_id, p_batch_id,
     p_decision, p_reason_code);

  FOR v_evidence IN SELECT * FROM jsonb_array_elements(p_exposure_evidence) AS obj LOOP
    INSERT INTO public.bumblebee_exposure_evidence
      (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id,
       record_id, evidence_digest)
    VALUES
      (p_group_id, p_workspace_id, p_source_id, p_source_revision_id, p_lease_id, p_batch_id,
       v_evidence->>'record_id', v_evidence->>'evidence_digest');
  END LOOP;

  RETURN p_batch_id;
END;
$$;
ALTER FUNCTION app.accept_bumblebee_ingest(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
  JSONB, TEXT, TEXT, JSONB
) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.accept_bumblebee_ingest(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
  JSONB, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.accept_bumblebee_ingest(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
  JSONB, TEXT, TEXT, JSONB
) TO allura_app;

-- ── Views ───────────────────────────────────────────────────────────────
CREATE VIEW bumblebee_current_routine_runs AS
  SELECT br.group_id, br.workspace_id, br.source_id, br.run_id,
         rd.decision, rd.reason_code, rd.decided_at,
         br.accepted_at AS batch_accepted_at
  FROM bumblebee_records br
  JOIN bumblebee_run_decisions rd
    ON br.group_id = rd.group_id
   AND br.workspace_id = rd.workspace_id
   AND br.source_id = rd.source_id
   AND br.source_revision_id = rd.source_revision_id
   AND br.lease_id = rd.lease_id
   AND br.batch_id = rd.batch_id
  WHERE br.record_type IN ('package', 'scan_summary')
    AND rd.decision = 'promoted'
    AND br.lease_id = (
      SELECT l2.lease_id
      FROM bumblebee_scan_leases l2
      WHERE l2.group_id = br.group_id
        AND l2.workspace_id = br.workspace_id
        AND l2.source_id = br.source_id
        AND l2.source_revision_id = br.source_revision_id
      ORDER BY l2.generation DESC
      LIMIT 1
    );

CREATE VIEW bumblebee_current_inventory AS
  SELECT r.group_id, r.workspace_id, r.source_id, r.run_id,
         r.record_id, r.record_type, r.sanitized_payload,
         r.redaction_provenance, r.accepted_at
  FROM bumblebee_records r
  JOIN bumblebee_run_decisions rd
    ON r.group_id = rd.group_id
   AND r.workspace_id = rd.workspace_id
   AND r.source_id = rd.source_id
   AND r.source_revision_id = rd.source_revision_id
   AND r.lease_id = rd.lease_id
   AND r.batch_id = rd.batch_id
  WHERE r.record_type = 'package'
    AND rd.decision = 'promoted';

CREATE VIEW bumblebee_incomplete_runs AS
  SELECT DISTINCT ON (r.group_id, r.workspace_id, r.source_id, r.run_id)
    r.group_id, r.workspace_id, r.source_id, r.run_id,
    rd.decision, rd.reason_code
  FROM bumblebee_records r
  JOIN bumblebee_run_decisions rd
    ON r.group_id = rd.group_id
   AND r.workspace_id = rd.workspace_id
   AND r.source_id = rd.source_id
   AND r.source_revision_id = rd.source_revision_id
   AND r.lease_id = rd.lease_id
   AND r.batch_id = rd.batch_id
  WHERE rd.decision = 'held'
  ORDER BY r.group_id, r.workspace_id, r.source_id, r.run_id, r.accepted_at DESC;

CREATE VIEW bumblebee_trusted_exposures AS
  SELECT ee.group_id, ee.workspace_id, ee.source_id,
         ee.record_id, ee.evidence_digest, ee.is_trusted, ee.trusted_at
  FROM bumblebee_exposure_evidence ee
  WHERE ee.is_trusted = true;

-- ── Schema version ───────────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES ('048', NOW(), 'Story 26.7 immutable atomic Bumblebee NDJSON ingest receipt and sanitized record ledger')
ON CONFLICT (version) DO NOTHING;

COMMIT;