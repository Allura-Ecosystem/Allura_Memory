-- Migration 47: source-bound monotonic Bumblebee scan leases.
BEGIN;

CREATE TABLE IF NOT EXISTS bumblebee_scan_leases (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT NOT NULL,
  lease_id TEXT NOT NULL CHECK (LENGTH(TRIM(lease_id)) > 0),
  generation BIGINT NOT NULL CHECK (generation > 0),
  revision_digest TEXT NOT NULL CHECK (revision_digest ~ '^[a-f0-9]{64}$'),
  runner_credential_id TEXT NOT NULL,
  runner_audience TEXT NOT NULL DEFAULT 'bumblebee_runner' CHECK (runner_audience = 'bumblebee_runner'),
  profile TEXT NOT NULL CHECK (profile IN ('baseline', 'project', 'deep')),
  mode TEXT NOT NULL CHECK (mode IN ('inventory', 'findings-only')),
  root_config_digest TEXT NOT NULL CHECK (root_config_digest ~ '^[a-f0-9]{64}$'),
  ecosystems TEXT[] NOT NULL CHECK (cardinality(ecosystems) > 0),
  all_users BOOLEAN NOT NULL,
  catalog_revision_id TEXT,
  catalog_digest TEXT,
  ingest_audience TEXT NOT NULL DEFAULT 'bumblebee_ingest' CHECK (ingest_audience = 'bumblebee_ingest'),
  ingest_token_prefix TEXT NOT NULL UNIQUE CHECK (ingest_token_prefix ~ '^bmb_ingest_[A-Za-z0-9_-]{8}$'),
  ingest_token_hash TEXT NOT NULL CHECK (ingest_token_hash ~ '^[a-f0-9]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id, lease_id),
  UNIQUE (group_id, workspace_id, source_id, source_revision_id, generation),
  FOREIGN KEY (group_id, workspace_id, source_id, source_revision_id)
    REFERENCES bumblebee_sources(group_id, workspace_id, source_id, source_revision_id),
  FOREIGN KEY (group_id, workspace_id, runner_credential_id, runner_audience)
    REFERENCES bumblebee_runner_credentials(group_id, workspace_id, credential_id, audience),
  FOREIGN KEY (group_id, workspace_id, catalog_revision_id, catalog_digest)
    REFERENCES bumblebee_catalog_revisions(group_id, workspace_id, catalog_revision_id, catalog_digest),
  CHECK ((catalog_revision_id IS NULL) = (catalog_digest IS NULL)),
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '5 minutes')
);

CREATE OR REPLACE FUNCTION app.protect_bumblebee_scan_lease()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'bumblebee_scan_leases are not deletable'; END IF;
  IF (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at') THEN
    RAISE EXCEPTION 'bumblebee scan lease identity, generation, binding, and expiry are immutable';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'bumblebee scan lease revocation is immutable once set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bumblebee_scan_leases_protected ON bumblebee_scan_leases;
CREATE TRIGGER bumblebee_scan_leases_protected
  BEFORE UPDATE OR DELETE ON bumblebee_scan_leases
  FOR EACH ROW EXECUTE FUNCTION app.protect_bumblebee_scan_lease();

ALTER TABLE bumblebee_scan_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_scan_leases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bumblebee_scan_leases_scope ON bumblebee_scan_leases;
CREATE POLICY bumblebee_scan_leases_scope ON bumblebee_scan_leases FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true));
GRANT SELECT, INSERT, UPDATE (revoked_at) ON bumblebee_scan_leases TO allura_app;

-- Narrow pre-scope bootstrap: exact prefix only, minimal authority output, no table grant bypass.
CREATE OR REPLACE FUNCTION app.bumblebee_bootstrap_runner(p_prefix TEXT)
RETURNS TABLE (credential_id TEXT, group_id TEXT, workspace_id TEXT, token_hash TEXT,
  expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public, app
AS $$
  SELECT c.credential_id, c.group_id, c.workspace_id, c.token_hash, c.expires_at, c.revoked_at
  FROM public.bumblebee_runner_credentials AS c
  WHERE c.token_prefix = p_prefix AND c.audience = 'bumblebee_runner'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.bumblebee_bootstrap_runner(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.bumblebee_bootstrap_runner(TEXT) TO allura_app;

CREATE OR REPLACE FUNCTION app.bumblebee_bootstrap_ingest(p_prefix TEXT)
RETURNS TABLE (lease_id TEXT, group_id TEXT, workspace_id TEXT, source_id TEXT,
  source_revision_id TEXT, token_hash TEXT, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public, app
AS $$
  SELECT l.lease_id, l.group_id, l.workspace_id, l.source_id, l.source_revision_id,
    l.ingest_token_hash, l.expires_at, l.revoked_at
  FROM public.bumblebee_scan_leases AS l
  WHERE l.ingest_token_prefix = p_prefix AND l.ingest_audience = 'bumblebee_ingest'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.bumblebee_bootstrap_ingest(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.bumblebee_bootstrap_ingest(TEXT) TO allura_app;

-- Called only after runner bootstrap and SET LOCAL scope. Locking the exact enabled
-- source revision serializes generation allocation; rollback consumes no generation.
CREATE OR REPLACE FUNCTION app.issue_bumblebee_scan_lease(
  p_source_id TEXT, p_source_revision_id TEXT, p_runner_credential_id TEXT,
  p_lease_id TEXT, p_ingest_token_prefix TEXT, p_ingest_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_source public.bumblebee_sources%ROWTYPE;
  v_generation BIGINT;
BEGIN
  SELECT * INTO STRICT v_source
  FROM public.bumblebee_sources AS s
  WHERE s.group_id = current_setting('app.current_group_id', true)
    AND s.workspace_id = current_setting('app.current_workspace_id', true)
    AND s.source_id = p_source_id
    AND s.source_revision_id = p_source_revision_id
    AND s.runner_credential_id = p_runner_credential_id
    AND s.disabled_at IS NULL
  FOR UPDATE;

  SELECT COALESCE(MAX(generation), 0) + 1 INTO v_generation
  FROM public.bumblebee_scan_leases AS l
  WHERE l.group_id = v_source.group_id AND l.workspace_id = v_source.workspace_id
    AND l.source_id = v_source.source_id AND l.source_revision_id = v_source.source_revision_id;

  INSERT INTO public.bumblebee_scan_leases (
    group_id, workspace_id, source_id, source_revision_id, lease_id, generation,
    revision_digest, runner_credential_id, profile, mode, root_config_digest,
    ecosystems, all_users, catalog_revision_id, catalog_digest,
    ingest_token_prefix, ingest_token_hash, expires_at
  ) VALUES (
    v_source.group_id, v_source.workspace_id, v_source.source_id, v_source.source_revision_id,
    p_lease_id, v_generation, v_source.revision_digest, v_source.runner_credential_id,
    v_source.profile, v_source.mode, v_source.root_config_digest, v_source.ecosystems,
    v_source.all_users, v_source.catalog_revision_id, v_source.catalog_digest,
    p_ingest_token_prefix, p_ingest_token_hash, p_expires_at
  );
  RETURN v_generation;
END;
$$;
REVOKE ALL ON FUNCTION app.issue_bumblebee_scan_lease(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.issue_bumblebee_scan_lease(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ) TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('047', NOW(), 'Story 26.7 source-bound monotonic scan leases and finite ingest credentials')
ON CONFLICT (version) DO NOTHING;

COMMIT;
