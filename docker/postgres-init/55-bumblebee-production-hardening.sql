-- Migration 55: close Bumblebee's production acceptance and exposure-authority gaps.
BEGIN;

-- A lease represents one scanner upload. The older body-hash uniqueness key
-- deduplicated identical bytes but still allowed two different bodies to win a
-- race. The application also locks the lease row; this unique key is the
-- database backstop for every writer, including future ones.
CREATE UNIQUE INDEX IF NOT EXISTS bumblebee_batch_receipts_one_body_per_lease
  ON bumblebee_batch_receipts (group_id, workspace_id, source_id, source_revision_id, lease_id);

-- A catalog identity becomes promotion authority only when its immutable
-- normalized entry binds exact package/finding semantics and affected
-- versions. Existing pre-055 rows remain readable but untrusted unless they
-- satisfy this contract and their stored digest matches the canonical JSONB.
CREATE OR REPLACE FUNCTION app.bumblebee_catalog_entry_is_normalized(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT
    jsonb_typeof(candidate)='object'
    AND candidate ?& ARRAY[
      'ecosystem','normalized_name','finding_type','advisory_id','affected_versions'
    ]
    AND candidate - ARRAY[
      'ecosystem','normalized_name','finding_type','advisory_id','affected_versions'
    ] = '{}'::jsonb
    AND jsonb_typeof(candidate->'ecosystem')='string'
    AND length(btrim(candidate->>'ecosystem')) > 0
    AND jsonb_typeof(candidate->'normalized_name')='string'
    AND length(btrim(candidate->>'normalized_name')) > 0
    AND jsonb_typeof(candidate->'finding_type')='string'
    AND length(btrim(candidate->>'finding_type')) > 0
    AND jsonb_typeof(candidate->'advisory_id')='string'
    AND length(btrim(candidate->>'advisory_id')) > 0
    AND jsonb_typeof(candidate->'affected_versions')='array'
    AND jsonb_array_length(candidate->'affected_versions') > 0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(candidate->'affected_versions') AS version(value)
      WHERE jsonb_typeof(value) <> 'string' OR length(btrim(value #>> '{}')) = 0
    );
$$;

-- A caller-supplied digest is not catalog authority. Bind each immutable
-- revision digest to PostgreSQL's canonical JSONB representation. NOT VALID
-- preserves pre-055 rows for audit, while every new row is enforced and the
-- exposure query independently rejects legacy mismatches.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.bumblebee_catalog_revisions'::regclass
      AND conname='bumblebee_catalog_revisions_digest_check'
  ) THEN
    ALTER TABLE bumblebee_catalog_revisions
      ADD CONSTRAINT bumblebee_catalog_revisions_digest_check
      CHECK (
        catalog_digest=encode(digest(canonical_catalog::text, 'sha256'),'hex')
      ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.bumblebee_catalog_entries'::regclass
      AND conname='bumblebee_catalog_entries_normalized_contract_check'
  ) THEN
    ALTER TABLE bumblebee_catalog_entries
      ADD CONSTRAINT bumblebee_catalog_entries_normalized_contract_check
      CHECK (
        app.bumblebee_catalog_entry_is_normalized(normalized_entry)
        AND entry_digest=encode(digest(normalized_entry::text, 'sha256'),'hex')
      ) NOT VALID;
  END IF;
END $$;

-- Replace the bootstrap row type so ingestion receives the complete immutable
-- population, catalog, privacy, and ordering contract. Scope is still derived
-- solely from the verified token prefix; no request field participates.
DROP FUNCTION IF EXISTS app.bumblebee_bootstrap_ingest(TEXT);

CREATE OR REPLACE FUNCTION app.bumblebee_bootstrap_ingest(p_prefix TEXT)
RETURNS TABLE (
  lease_id TEXT,
  group_id TEXT,
  workspace_id TEXT,
  source_id TEXT,
  source_revision_id TEXT,
  token_hash TEXT,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  generation BIGINT,
  profile TEXT,
  mode TEXT,
  root_config_digest TEXT,
  ecosystems TEXT[],
  all_users BOOLEAN,
  catalog_revision_id TEXT,
  catalog_digest TEXT,
  classification TEXT,
  redaction_policy TEXT
)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog
AS $$
  SELECT l.lease_id, l.group_id, l.workspace_id, l.source_id, l.source_revision_id,
    l.ingest_token_hash, l.expires_at, l.revoked_at, l.generation,
    l.profile, l.mode, l.root_config_digest, l.ecosystems, l.all_users,
    l.catalog_revision_id, l.catalog_digest, s.classification, s.redaction_policy
  FROM public.bumblebee_scan_leases AS l
  JOIN public.bumblebee_sources AS s
    ON s.group_id = l.group_id
   AND s.workspace_id = l.workspace_id
   AND s.source_id = l.source_id
   AND s.source_revision_id = l.source_revision_id
   AND s.profile = l.profile
   AND s.mode = l.mode
   AND s.root_config_digest = l.root_config_digest
   AND s.ecosystems = l.ecosystems
   AND s.all_users = l.all_users
   AND s.catalog_revision_id IS NOT DISTINCT FROM l.catalog_revision_id
   AND s.catalog_digest IS NOT DISTINCT FROM l.catalog_digest
  WHERE l.ingest_token_prefix = p_prefix
    AND l.ingest_audience = 'bumblebee_ingest'
    AND s.disabled_at IS NULL
  LIMIT 1
$$;
ALTER FUNCTION app.bumblebee_bootstrap_ingest(TEXT) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.bumblebee_bootstrap_ingest(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.bumblebee_bootstrap_ingest(TEXT) TO allura_app;

-- Server-recomputed exposure evidence. Each row binds the actual accepted
-- finding record to the exact source revision, profile, lease, batch, and
-- catalog authority used for recomputation. Nullable catalog columns preserve
-- endpoint-asserted (untrusted) evidence without inventing a sentinel.
CREATE TABLE IF NOT EXISTS bumblebee_exposure_evidence (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  profile TEXT NOT NULL CHECK (profile IN ('baseline', 'project', 'deep')),
  lease_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  finding_record_id TEXT NOT NULL,
  exposure_key TEXT NOT NULL CHECK (exposure_key ~ '^[a-f0-9]{64}$'),
  is_trusted BOOLEAN NOT NULL,
  catalog_revision_id TEXT,
  catalog_digest TEXT,
  exposure JSONB NOT NULL CHECK (jsonb_typeof(exposure) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (
    group_id, workspace_id, source_id, source_revision_id, profile,
    lease_id, batch_id, finding_record_id, exposure_key
  ),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, finding_record_id)
    REFERENCES bumblebee_records(group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, record_id),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id, lease_id)
    REFERENCES bumblebee_scan_leases(group_id, workspace_id, source_id, source_revision_id, lease_id),
  FOREIGN KEY (group_id, workspace_id, catalog_revision_id, catalog_digest)
    REFERENCES bumblebee_catalog_revisions(group_id, workspace_id, catalog_revision_id, catalog_digest),
  CHECK ((catalog_revision_id IS NULL) = (catalog_digest IS NULL)),
  CHECK (NOT is_trusted OR catalog_revision_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS bumblebee_exposure_evidence_exact_scope_idx
  ON bumblebee_exposure_evidence
    (group_id, workspace_id, source_id, source_revision_id, profile, created_at DESC);

-- Keep the stored evidence representation closed and reproducible. The
-- application role supplies JSON only because it is the cross-language wire
-- format; the definer validates the exact server-owned shape and recomputes
-- its dedup key before any durable write.
CREATE OR REPLACE FUNCTION app.bumblebee_exposure_shape_is_valid(
  candidate JSONB,
  trusted BOOLEAN
) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE STRICT
SET search_path = pg_catalog
AS $$
  SELECT
    jsonb_typeof(candidate)='object'
    AND candidate ?& ARRAY[
      'ecosystem','package_name','version','finding_type','catalog_id',
      'advisory_id','is_trusted','matched_package','evidence_source'
    ]
    AND candidate - ARRAY[
      'ecosystem','package_name','version','finding_type','catalog_id',
      'advisory_id','is_trusted','matched_package','evidence_source'
    ] = '{}'::jsonb
    AND jsonb_typeof(candidate->'ecosystem')='string'
    AND length(candidate->>'ecosystem') > 0
    AND jsonb_typeof(candidate->'package_name')='string'
    AND length(candidate->>'package_name') > 0
    AND jsonb_typeof(candidate->'version') IN ('string','null')
    AND (jsonb_typeof(candidate->'version')='null' OR length(candidate->>'version') > 0)
    AND jsonb_typeof(candidate->'finding_type')='string'
    AND length(candidate->>'finding_type') > 0
    AND jsonb_typeof(candidate->'catalog_id') IN ('string','null')
    AND (jsonb_typeof(candidate->'catalog_id')='null' OR length(candidate->>'catalog_id') > 0)
    AND jsonb_typeof(candidate->'advisory_id') IN ('string','null')
    AND (jsonb_typeof(candidate->'advisory_id')='null' OR length(candidate->>'advisory_id') > 0)
    AND jsonb_typeof(candidate->'is_trusted')='boolean'
    AND candidate->'is_trusted'=to_jsonb(trusted)
    AND jsonb_typeof(candidate->'evidence_source')='string'
    AND (
      (
        trusted
        AND candidate->>'evidence_source'='server-recomputed'
        AND jsonb_typeof(candidate->'matched_package')='object'
        AND candidate->'matched_package' ?& ARRAY[
          'ecosystem','normalized_name','version','source_file'
        ]
        AND (candidate->'matched_package') - ARRAY[
          'ecosystem','normalized_name','version','source_file'
        ] = '{}'::jsonb
        AND jsonb_typeof(candidate->'matched_package'->'ecosystem')='string'
        AND length(candidate->'matched_package'->>'ecosystem') > 0
        AND jsonb_typeof(candidate->'matched_package'->'normalized_name')='string'
        AND length(candidate->'matched_package'->>'normalized_name') > 0
        AND jsonb_typeof(candidate->'matched_package'->'version')='string'
        AND length(candidate->'matched_package'->>'version') > 0
        AND jsonb_typeof(candidate->'matched_package'->'source_file')='string'
        AND length(candidate->'matched_package'->>'source_file') > 0
      )
      OR (
        NOT trusted
        AND candidate->>'evidence_source'='endpoint-asserted'
        AND jsonb_typeof(candidate->'matched_package')='null'
      )
    );
$$;
REVOKE ALL ON FUNCTION app.bumblebee_exposure_shape_is_valid(JSONB,BOOLEAN) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.bumblebee_exposure_key(candidate JSONB)
RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT
SET search_path = pg_catalog
AS $$
  SELECT encode(public.digest(
    convert_to('finding:' || encode(public.digest(
      convert_to(COALESCE(candidate->>'ecosystem',''),'UTF8') || decode('00','hex')
      || convert_to(COALESCE(candidate->>'package_name',''),'UTF8') || decode('00','hex')
      || convert_to(COALESCE(candidate->>'version',''),'UTF8') || decode('00','hex')
      || convert_to(COALESCE(candidate->>'finding_type',''),'UTF8') || decode('00','hex')
      || convert_to(COALESCE(candidate->>'catalog_id',''),'UTF8') || decode('00','hex')
      || convert_to(COALESCE(candidate->>'advisory_id',''),'UTF8'),
      'sha256'
    ),'hex'),'UTF8') || decode('00','hex')
      || convert_to(COALESCE(candidate->>'evidence_source',''),'UTF8'),
    'sha256'
  ),'hex');
$$;
REVOKE ALL ON FUNCTION app.bumblebee_exposure_key(JSONB) FROM PUBLIC;

-- The app role cannot manufacture evidence rows directly. This narrow writer
-- derives permission from the transaction's tenant/workspace settings and
-- validates every cross-table association before the owner inserts one row.
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
            AND package_record.lease_id=p_lease_id
            AND package_record.batch_id=p_batch_id
            AND package_record.record_type='package'
            AND decision.decision='promoted'
            AND decision.decided_at
              + package_source.freshness_ttl_seconds * INTERVAL '1 second'
              > statement_timestamp()
            AND package_lease.generation=(
              SELECT MAX(latest_lease.generation)
              FROM public.bumblebee_scan_leases AS latest_lease
              WHERE latest_lease.group_id=p_group_id
                AND latest_lease.workspace_id=p_workspace_id
                AND latest_lease.source_id=p_source_id
                AND latest_lease.source_revision_id=p_source_revision_id
                AND latest_lease.profile=p_profile
            )
            AND package_record.sanitized_payload->>'ecosystem'=p_exposure->>'ecosystem'
            AND package_record.sanitized_payload->>'normalized_name'=p_exposure->>'package_name'
            AND package_record.sanitized_payload->>'version'=p_exposure->'matched_package'->>'version'
            AND package_record.sanitized_payload->>'source_file'=p_exposure->'matched_package'->>'source_file'
        )
        OR EXISTS (
          SELECT 1
          FROM public.bumblebee_current_inventory AS inventory,
               jsonb_array_elements(inventory.packages) AS package(value)
          WHERE inventory.group_id=p_group_id AND inventory.workspace_id=p_workspace_id
            AND inventory.source_id=p_source_id
            AND inventory.source_revision_id=p_source_revision_id
            AND inventory.profile=p_profile
            AND inventory.decided_at
              + inventory.freshness_ttl_seconds * INTERVAL '1 second'
              > statement_timestamp()
            AND package.value->>'ecosystem'=p_exposure->>'ecosystem'
            AND package.value->>'normalized_name'=p_exposure->>'package_name'
            AND package.value->>'version'=p_exposure->'matched_package'->>'version'
            AND package.value->>'source_file'=p_exposure->'matched_package'->>'source_file'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Bumblebee trusted exposure authority mismatch' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.bumblebee_exposure_evidence
    (group_id, workspace_id, source_id, source_revision_id, profile,
     lease_id, batch_id, run_id, finding_record_id, exposure_key, is_trusted,
     catalog_revision_id, catalog_digest, exposure)
  VALUES
    (p_group_id, p_workspace_id, p_source_id, p_source_revision_id, p_profile,
     p_lease_id, p_batch_id, p_run_id, p_finding_record_id, p_exposure_key,
     p_is_trusted, p_catalog_revision_id, p_catalog_digest, p_exposure);
END;
$$;

ALTER FUNCTION app.insert_bumblebee_exposure_evidence(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,JSONB
) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.insert_bumblebee_exposure_evidence(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.insert_bumblebee_exposure_evidence(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,JSONB
) TO allura_app;

CREATE OR REPLACE FUNCTION app.prevent_bumblebee_exposure_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bumblebee exposure evidence is append-only; % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS bumblebee_exposure_evidence_immutable ON bumblebee_exposure_evidence;
CREATE TRIGGER bumblebee_exposure_evidence_immutable
  BEFORE UPDATE OR DELETE ON bumblebee_exposure_evidence
  FOR EACH ROW EXECUTE FUNCTION app.prevent_bumblebee_exposure_mutation();

ALTER TABLE bumblebee_exposure_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_exposure_evidence FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bumblebee_exposure_evidence_scope ON bumblebee_exposure_evidence;
CREATE POLICY bumblebee_exposure_evidence_scope ON bumblebee_exposure_evidence FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));
REVOKE INSERT, UPDATE, DELETE ON bumblebee_exposure_evidence FROM allura_app;
GRANT SELECT ON bumblebee_exposure_evidence TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('055', NOW(), 'Bumblebee atomic lease acceptance, complete ingest authority, and exact-scope exposure evidence')
ON CONFLICT (version) DO NOTHING;

COMMIT;
