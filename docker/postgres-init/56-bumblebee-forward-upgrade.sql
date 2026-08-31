-- Migration 56: forward-only Bumblebee repair for recorded 055 deployments.
BEGIN;

-- Never alter a migration that may already be recorded. Reconcile every legacy
-- receipt deterministically and retain non-authoritative bodies for operators.
DROP INDEX IF EXISTS bumblebee_batch_receipts_one_body_per_lease;

-- This candidate key lets the authority FK prove its selected batch/body is
-- one concrete immutable receipt.
CREATE UNIQUE INDEX IF NOT EXISTS bumblebee_batch_receipts_exact_body_identity
  ON bumblebee_batch_receipts
    (group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,body_sha256);

-- observed_receipt_count is a historical reconciliation observation. It is set
-- once when authority is selected and remains immutable with the authority row.
CREATE TABLE IF NOT EXISTS bumblebee_lease_body_authority (
  group_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  active_batch_id TEXT NOT NULL,
  active_body_sha256 TEXT NOT NULL CHECK (active_body_sha256 ~ '^[a-f0-9]{64}$'),
  reconciliation_state TEXT NOT NULL
    CHECK (reconciliation_state IN ('accepted','reconciled_multiple')),
  observed_receipt_count INTEGER NOT NULL CHECK (observed_receipt_count > 0),
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(group_id,workspace_id,source_id,source_revision_id,lease_id),
  FOREIGN KEY(group_id,workspace_id,source_id,source_revision_id,lease_id)
    REFERENCES bumblebee_scan_leases(group_id,workspace_id,source_id,source_revision_id,lease_id),
  FOREIGN KEY(group_id,workspace_id,source_id,source_revision_id,lease_id,active_batch_id,active_body_sha256)
    REFERENCES bumblebee_batch_receipts(group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,body_sha256)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS bumblebee_batch_receipt_quarantine (
  group_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  selected_batch_id TEXT NOT NULL,
  selected_body_sha256 TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason='legacy_multiple_bodies'),
  quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id),
  FOREIGN KEY(group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id)
    REFERENCES bumblebee_batch_receipts(group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id)
);

WITH ranked AS (
  SELECT receipt.*,
    ROW_NUMBER() OVER (
      PARTITION BY group_id,workspace_id,source_id,source_revision_id,lease_id
      ORDER BY accepted_at,batch_id,body_sha256
    ) AS rank,
    COUNT(*) OVER (
      PARTITION BY group_id,workspace_id,source_id,source_revision_id,lease_id
    ) AS receipt_count
  FROM bumblebee_batch_receipts receipt
)
INSERT INTO bumblebee_lease_body_authority(
  group_id,workspace_id,source_id,source_revision_id,lease_id,
  active_batch_id,active_body_sha256,reconciliation_state,observed_receipt_count
)
SELECT group_id,workspace_id,source_id,source_revision_id,lease_id,
  batch_id,body_sha256,
  CASE WHEN receipt_count > 1 THEN 'reconciled_multiple' ELSE 'accepted' END,
  receipt_count
FROM ranked WHERE rank=1
ON CONFLICT(group_id,workspace_id,source_id,source_revision_id,lease_id) DO NOTHING;

WITH ranked AS (
  SELECT receipt.*,
    FIRST_VALUE(batch_id) OVER authority AS selected_batch_id,
    FIRST_VALUE(body_sha256) OVER authority AS selected_body_sha256,
    ROW_NUMBER() OVER authority AS rank
  FROM bumblebee_batch_receipts receipt
  WINDOW authority AS (
    PARTITION BY group_id,workspace_id,source_id,source_revision_id,lease_id
    ORDER BY accepted_at,batch_id,body_sha256
  )
)
INSERT INTO bumblebee_batch_receipt_quarantine(
  group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,
  body_sha256,selected_batch_id,selected_body_sha256,reason
)
SELECT group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,
  body_sha256,selected_batch_id,selected_body_sha256,'legacy_multiple_bodies'
FROM ranked WHERE rank > 1
ON CONFLICT DO NOTHING;

-- CREATE TABLE IF NOT EXISTS does not add constraints to an already-recorded
-- 055 authority table. Name and validate this exact composite FK separately so
-- fresh installs and partially-upgraded deployments converge.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.bumblebee_lease_body_authority'::regclass
      AND conname='bumblebee_lease_body_authority_active_receipt_fkey'
  ) THEN
    ALTER TABLE bumblebee_lease_body_authority
      ADD CONSTRAINT bumblebee_lease_body_authority_active_receipt_fkey
      FOREIGN KEY(group_id,workspace_id,source_id,source_revision_id,lease_id,active_batch_id,active_body_sha256)
      REFERENCES bumblebee_batch_receipts(group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,body_sha256)
      DEFERRABLE INITIALLY DEFERRED NOT VALID;
  END IF;
END $$;
ALTER TABLE bumblebee_lease_body_authority
  VALIDATE CONSTRAINT bumblebee_lease_body_authority_active_receipt_fkey;

-- Reconciliation inserts reference already-existing receipts. Resolve the
-- deferred exact-receipt FK before subsequent DDL touches the authority table.
SET CONSTRAINTS ALL IMMEDIATE;

CREATE OR REPLACE VIEW bumblebee_lease_body_reconciliation
WITH (security_invoker = true) AS
SELECT authority.*,
  COALESCE(quarantine.quarantined_receipt_count,0) AS quarantined_receipt_count,
  COALESCE(quarantine.quarantined_receipts,'[]'::jsonb) AS quarantined_receipts
FROM bumblebee_lease_body_authority authority
LEFT JOIN (
  SELECT group_id,workspace_id,source_id,source_revision_id,lease_id,
    COUNT(*)::INTEGER AS quarantined_receipt_count,
    jsonb_agg(jsonb_build_object(
      'batch_id',batch_id,'body_sha256',body_sha256,
      'selected_batch_id',selected_batch_id,'selected_body_sha256',selected_body_sha256,
      'reason',reason,'quarantined_at',quarantined_at
    ) ORDER BY quarantined_at,batch_id,body_sha256) AS quarantined_receipts
  FROM bumblebee_batch_receipt_quarantine
  GROUP BY group_id,workspace_id,source_id,source_revision_id,lease_id
) quarantine USING(group_id,workspace_id,source_id,source_revision_id,lease_id);
REVOKE ALL ON bumblebee_lease_body_reconciliation FROM PUBLIC;
GRANT SELECT ON bumblebee_lease_body_reconciliation TO allura_app;

CREATE OR REPLACE FUNCTION app.enforce_bumblebee_one_body_per_lease()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  authority public.bumblebee_lease_body_authority%ROWTYPE;
BEGIN
  -- Lock the durable lease parent before looking for authority.  Two first
  -- writers cannot both observe no authority and race an INSERT; they serialize
  -- on this exact lease even before an authority row exists.
  PERFORM 1 FROM public.bumblebee_scan_leases
  WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id
    AND source_id=NEW.source_id AND source_revision_id=NEW.source_revision_id
    AND lease_id=NEW.lease_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bumblebee receipt lease authority is missing' USING ERRCODE='23503';
  END IF;
  SELECT * INTO authority FROM public.bumblebee_lease_body_authority
  WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id
    AND source_id=NEW.source_id AND source_revision_id=NEW.source_revision_id
    AND lease_id=NEW.lease_id
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.bumblebee_lease_body_authority(
      group_id,workspace_id,source_id,source_revision_id,lease_id,
      active_batch_id,active_body_sha256,reconciliation_state,observed_receipt_count
    ) VALUES (
      NEW.group_id,NEW.workspace_id,NEW.source_id,NEW.source_revision_id,NEW.lease_id,
      NEW.batch_id,NEW.body_sha256,'accepted',1
    );
  ELSIF authority.active_batch_id IS DISTINCT FROM NEW.batch_id
     OR authority.active_body_sha256 IS DISTINCT FROM NEW.body_sha256 THEN
    RAISE EXCEPTION 'one accepted body is already authoritative for this Bumblebee lease'
      USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app.enforce_bumblebee_one_body_per_lease() OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.enforce_bumblebee_one_body_per_lease() FROM PUBLIC;

DROP TRIGGER IF EXISTS bumblebee_batch_receipts_one_body_guard ON bumblebee_batch_receipts;
CREATE TRIGGER bumblebee_batch_receipts_one_body_guard
  BEFORE INSERT ON bumblebee_batch_receipts
  FOR EACH ROW EXECUTE FUNCTION app.enforce_bumblebee_one_body_per_lease();

REVOKE INSERT,UPDATE,DELETE ON bumblebee_lease_body_authority FROM allura_app;
REVOKE INSERT,UPDATE,DELETE ON bumblebee_batch_receipt_quarantine FROM allura_app;
GRANT SELECT ON bumblebee_lease_body_authority,bumblebee_batch_receipt_quarantine TO allura_app;


-- Add durable inventory provenance without rewriting immutable evidence.
ALTER TABLE bumblebee_exposure_evidence
  ADD COLUMN IF NOT EXISTS inventory_lease_id TEXT,
  ADD COLUMN IF NOT EXISTS inventory_batch_id TEXT,
  ADD COLUMN IF NOT EXISTS inventory_generation BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bumblebee_exposure_evidence'::regclass AND conname='bumblebee_exposure_inventory_lease_fkey') THEN
    ALTER TABLE bumblebee_exposure_evidence ADD CONSTRAINT bumblebee_exposure_inventory_lease_fkey
      FOREIGN KEY (group_id,workspace_id,source_id,source_revision_id,inventory_lease_id)
      REFERENCES bumblebee_scan_leases(group_id,workspace_id,source_id,source_revision_id,lease_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bumblebee_exposure_evidence'::regclass AND conname='bumblebee_exposure_inventory_batch_fkey') THEN
    ALTER TABLE bumblebee_exposure_evidence ADD CONSTRAINT bumblebee_exposure_inventory_batch_fkey
      FOREIGN KEY (group_id,workspace_id,source_id,source_revision_id,inventory_lease_id,inventory_batch_id)
      REFERENCES bumblebee_batch_receipts(group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bumblebee_exposure_evidence'::regclass AND conname='bumblebee_exposure_inventory_provenance_check') THEN
    ALTER TABLE bumblebee_exposure_evidence ADD CONSTRAINT bumblebee_exposure_inventory_provenance_check
      CHECK (
        (is_trusted AND inventory_lease_id IS NOT NULL AND inventory_batch_id IS NOT NULL AND inventory_generation IS NOT NULL)
        OR
        (NOT is_trusted AND inventory_lease_id IS NULL AND inventory_batch_id IS NULL AND inventory_generation IS NULL)
      ) NOT VALID;
  END IF;
END $$;

-- Recorded v055 evidence predates inventory provenance. Keep it readable as
-- explicit legacy evidence, never as current trusted authority.
CREATE OR REPLACE VIEW bumblebee_exposure_evidence_reader
WITH (security_invoker = true) AS
SELECT evidence.*,
  CASE WHEN inventory_lease_id IS NULL THEN 'legacy_unverified' ELSE 'inventory_bound' END
    AS evidence_state
FROM bumblebee_exposure_evidence AS evidence;
REVOKE ALL ON bumblebee_exposure_evidence_reader FROM PUBLIC;
GRANT SELECT ON bumblebee_exposure_evidence_reader TO allura_app;

-- Replace the narrow definer with the expanded 17-argument contract. Existing
-- 055 evidence remains append-only and readable; all new trusted writes bind
-- a fresh promoted inventory package, not merely the newest lease.
DROP FUNCTION IF EXISTS app.insert_bumblebee_exposure_evidence(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,JSONB
);

CREATE OR REPLACE FUNCTION app.insert_bumblebee_exposure_evidence(
  p_group_id TEXT,
  p_workspace_id TEXT,
  p_source_id TEXT,
  p_source_revision_id TEXT,
  p_profile TEXT,
  p_lease_id TEXT,
  p_batch_id TEXT,
  p_run_id TEXT,
  p_finding_record_id TEXT,
  p_exposure_key TEXT,
  p_is_trusted BOOLEAN,
  p_catalog_revision_id TEXT,
  p_catalog_digest TEXT,
  p_inventory_lease_id TEXT,
  p_inventory_batch_id TEXT,
  p_inventory_generation BIGINT,
  p_exposure JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  finding_payload JSONB;
BEGIN
  IF current_setting('app.current_group_id', true) IS DISTINCT FROM p_group_id
     OR current_setting('app.current_workspace_id', true) IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'Bumblebee exposure scope mismatch' USING ERRCODE='42501';
  END IF;

  PERFORM 1
  FROM public.bumblebee_scan_leases AS l
  WHERE l.group_id=p_group_id AND l.workspace_id=p_workspace_id
    AND l.source_id=p_source_id AND l.source_revision_id=p_source_revision_id
    AND l.lease_id=p_lease_id AND l.profile=p_profile
    AND l.catalog_revision_id IS NOT DISTINCT FROM p_catalog_revision_id
    AND l.catalog_digest IS NOT DISTINCT FROM p_catalog_digest;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bumblebee exposure lease authority mismatch' USING ERRCODE='23514';
  END IF;

  SELECT r.sanitized_payload INTO finding_payload
  FROM public.bumblebee_records AS r
  WHERE r.group_id=p_group_id AND r.workspace_id=p_workspace_id
    AND r.source_id=p_source_id AND r.source_revision_id=p_source_revision_id
    AND r.lease_id=p_lease_id AND r.batch_id=p_batch_id
    AND r.record_id=p_finding_record_id
    AND r.record_type='finding' AND r.run_id=p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bumblebee exposure finding authority mismatch' USING ERRCODE='23514';
  END IF;

  IF NOT app.bumblebee_exposure_shape_is_valid(p_exposure, p_is_trusted)
     OR p_exposure_key IS DISTINCT FROM app.bumblebee_exposure_key(p_exposure)
     OR finding_payload->'ecosystem' IS DISTINCT FROM p_exposure->'ecosystem'
     OR finding_payload->'normalized_name' IS DISTINCT FROM p_exposure->'package_name'
     OR NULLIF(finding_payload->>'version','') IS DISTINCT FROM p_exposure->>'version'
     OR finding_payload->'finding_type' IS DISTINCT FROM p_exposure->'finding_type'
     OR NULLIF(finding_payload->>'catalog_id','') IS DISTINCT FROM p_exposure->>'catalog_id'
     OR NULLIF(finding_payload->>'advisory_id','') IS DISTINCT FROM p_exposure->>'advisory_id'
     OR (
       p_is_trusted
       AND jsonb_typeof(p_exposure->'version') <> 'null'
       AND p_exposure->>'version' IS DISTINCT FROM p_exposure->'matched_package'->>'version'
     ) THEN
    RAISE EXCEPTION 'Bumblebee exposure JSON truth mismatch' USING ERRCODE='23514';
  END IF;

  IF p_is_trusted AND NOT EXISTS (
    SELECT 1
    FROM public.bumblebee_catalog_revisions AS revision
    JOIN public.bumblebee_catalog_entries AS entry
      ON entry.group_id=revision.group_id
     AND entry.workspace_id=revision.workspace_id
     AND entry.catalog_revision_id=revision.catalog_revision_id
    WHERE revision.group_id=p_group_id AND revision.workspace_id=p_workspace_id
      AND revision.catalog_revision_id=p_catalog_revision_id
      AND revision.catalog_digest=p_catalog_digest
      AND revision.catalog_digest=encode(public.digest(revision.canonical_catalog::text, 'sha256'),'hex')
      AND jsonb_typeof(revision.canonical_catalog->'entries')='array'
      AND revision.canonical_catalog->'entries' @> jsonb_build_array(entry.catalog_entry_id)
      AND entry.catalog_entry_id=p_exposure->>'catalog_id'
      AND app.bumblebee_catalog_entry_is_normalized(entry.normalized_entry)
      AND entry.entry_digest=encode(public.digest(entry.normalized_entry::text, 'sha256'),'hex')
      AND entry.normalized_entry->>'ecosystem'=p_exposure->>'ecosystem'
      AND entry.normalized_entry->>'normalized_name'=p_exposure->>'package_name'
      AND entry.normalized_entry->>'finding_type'=p_exposure->>'finding_type'
      AND entry.normalized_entry->>'advisory_id'=p_exposure->>'advisory_id'
      AND entry.normalized_entry->'affected_versions' ? (p_exposure->'matched_package'->>'version')
      AND p_exposure->'matched_package'->>'ecosystem'=p_exposure->>'ecosystem'
      AND p_exposure->'matched_package'->>'normalized_name'=p_exposure->>'package_name'
      AND (
        EXISTS (
          SELECT 1
          FROM public.bumblebee_records AS package_record
          JOIN public.bumblebee_run_decisions AS decision
            ON decision.group_id=package_record.group_id
           AND decision.workspace_id=package_record.workspace_id
           AND decision.source_id=package_record.source_id
           AND decision.source_revision_id=package_record.source_revision_id
           AND decision.lease_id=package_record.lease_id
           AND decision.batch_id=package_record.batch_id
          JOIN public.bumblebee_scan_leases AS package_lease
            ON package_lease.group_id=package_record.group_id
           AND package_lease.workspace_id=package_record.workspace_id
           AND package_lease.source_id=package_record.source_id
           AND package_lease.source_revision_id=package_record.source_revision_id
           AND package_lease.lease_id=package_record.lease_id
          JOIN public.bumblebee_sources AS package_source
            ON package_source.group_id=package_record.group_id
           AND package_source.workspace_id=package_record.workspace_id
           AND package_source.source_id=package_record.source_id
           AND package_source.source_revision_id=package_record.source_revision_id
          WHERE package_record.group_id=p_group_id
            AND package_record.workspace_id=p_workspace_id
            AND package_record.source_id=p_source_id
            AND package_record.source_revision_id=p_source_revision_id
            AND package_record.lease_id=p_inventory_lease_id
            AND package_record.batch_id=p_inventory_batch_id
            AND package_record.record_type='package'
            AND decision.decision='promoted'
            AND decision.decided_at
              + package_source.freshness_ttl_seconds * INTERVAL '1 second'
              > statement_timestamp()
            AND package_lease.generation=p_inventory_generation
            AND package_lease.profile=p_profile
            -- Authority is the latest *fresh promoted decision* for this exact
            -- source/revision/profile, never simply the maximum lease number.
            AND NOT EXISTS (
              SELECT 1
              FROM public.bumblebee_scan_leases AS newer_lease
              JOIN public.bumblebee_run_decisions AS newer_decision
                ON newer_decision.group_id=newer_lease.group_id
               AND newer_decision.workspace_id=newer_lease.workspace_id
               AND newer_decision.source_id=newer_lease.source_id
               AND newer_decision.source_revision_id=newer_lease.source_revision_id
               AND newer_decision.lease_id=newer_lease.lease_id
              JOIN public.bumblebee_sources AS newer_source
                ON newer_source.group_id=newer_lease.group_id
               AND newer_source.workspace_id=newer_lease.workspace_id
               AND newer_source.source_id=newer_lease.source_id
               AND newer_source.source_revision_id=newer_lease.source_revision_id
              WHERE newer_lease.group_id=p_group_id
                AND newer_lease.workspace_id=p_workspace_id
                AND newer_lease.source_id=p_source_id
                AND newer_lease.source_revision_id=p_source_revision_id
                AND newer_lease.profile=p_profile
                AND newer_decision.decision='promoted'
                AND newer_decision.decided_at
                  + newer_source.freshness_ttl_seconds * INTERVAL '1 second'
                  > statement_timestamp()
                AND (newer_decision.decided_at, newer_lease.generation, newer_decision.batch_id, newer_lease.lease_id)
                  > (decision.decided_at, package_lease.generation, decision.batch_id, package_lease.lease_id)
            )
            AND package_record.sanitized_payload->>'ecosystem'=p_exposure->>'ecosystem'
            AND package_record.sanitized_payload->>'normalized_name'=p_exposure->>'package_name'
            AND package_record.sanitized_payload->>'version'=p_exposure->'matched_package'->>'version'
            AND package_record.sanitized_payload->>'source_file'=p_exposure->'matched_package'->>'source_file'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Bumblebee trusted exposure authority mismatch' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.bumblebee_exposure_evidence
    (group_id, workspace_id, source_id, source_revision_id, profile,
      lease_id, batch_id, run_id, finding_record_id, exposure_key, is_trusted,
      catalog_revision_id, catalog_digest,
      inventory_lease_id, inventory_batch_id, inventory_generation, exposure)
  VALUES
    (p_group_id, p_workspace_id, p_source_id, p_source_revision_id, p_profile,
      p_lease_id, p_batch_id, p_run_id, p_finding_record_id, p_exposure_key,
      p_is_trusted, p_catalog_revision_id, p_catalog_digest,
      p_inventory_lease_id, p_inventory_batch_id, p_inventory_generation, p_exposure);
END;
$$;

ALTER FUNCTION app.insert_bumblebee_exposure_evidence(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,BIGINT,JSONB
) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.insert_bumblebee_exposure_evidence(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,BIGINT,JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.insert_bumblebee_exposure_evidence(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,BIGINT,JSONB
) TO allura_app;

CREATE OR REPLACE FUNCTION app.prevent_bumblebee_reconciliation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bumblebee reconciliation evidence is append-only; % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS bumblebee_lease_body_authority_immutable ON bumblebee_lease_body_authority;
CREATE TRIGGER bumblebee_lease_body_authority_immutable
  BEFORE UPDATE OR DELETE ON bumblebee_lease_body_authority
  FOR EACH ROW EXECUTE FUNCTION app.prevent_bumblebee_reconciliation_mutation();
DROP TRIGGER IF EXISTS bumblebee_batch_receipt_quarantine_immutable ON bumblebee_batch_receipt_quarantine;
CREATE TRIGGER bumblebee_batch_receipt_quarantine_immutable
  BEFORE UPDATE OR DELETE ON bumblebee_batch_receipt_quarantine
  FOR EACH ROW EXECUTE FUNCTION app.prevent_bumblebee_reconciliation_mutation();

ALTER TABLE bumblebee_lease_body_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_lease_body_authority FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bumblebee_lease_body_authority_scope ON bumblebee_lease_body_authority;
CREATE POLICY bumblebee_lease_body_authority_scope ON bumblebee_lease_body_authority FOR ALL TO allura_app
  USING (group_id=current_setting('app.current_group_id', true) AND workspace_id=current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id=current_setting('app.current_group_id', true) AND workspace_id=current_setting('app.current_workspace_id', true));
ALTER TABLE bumblebee_batch_receipt_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_batch_receipt_quarantine FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bumblebee_batch_receipt_quarantine_scope ON bumblebee_batch_receipt_quarantine;
CREATE POLICY bumblebee_batch_receipt_quarantine_scope ON bumblebee_batch_receipt_quarantine FOR ALL TO allura_app
  USING (group_id=current_setting('app.current_group_id', true) AND workspace_id=current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id=current_setting('app.current_group_id', true) AND workspace_id=current_setting('app.current_workspace_id', true));
REVOKE INSERT, UPDATE, DELETE ON bumblebee_lease_body_authority, bumblebee_batch_receipt_quarantine FROM allura_app;
GRANT SELECT ON bumblebee_lease_body_authority, bumblebee_batch_receipt_quarantine TO allura_app;

ALTER TABLE bumblebee_exposure_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_exposure_evidence FORCE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON bumblebee_exposure_evidence FROM allura_app;
GRANT SELECT ON bumblebee_exposure_evidence TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('056', NOW(), 'Bumblebee forward reconciliation and promoted inventory provenance')
ON CONFLICT (version) DO NOTHING;

COMMIT;
