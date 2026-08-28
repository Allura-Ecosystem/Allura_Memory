-- Migration 46: Story 26.7 Bumblebee source, catalog, and runner authority.
-- Immutable source/population revisions bind exact tenant/workspace authority to
-- the pinned scanner contract. Runner credentials have one exclusive audience;
-- lease-bound ingest credentials are introduced with the scan-lease migration.

BEGIN;

CREATE TABLE IF NOT EXISTS bumblebee_runner_credentials (
  credential_id TEXT NOT NULL CHECK (LENGTH(TRIM(credential_id)) > 0),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'bumblebee_runner' CHECK (audience = 'bumblebee_runner'),
  token_prefix TEXT NOT NULL UNIQUE CHECK (token_prefix ~ '^bmb_runner_[A-Za-z0-9_-]{8}$'),
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL CHECK (LENGTH(TRIM(created_by)) > 0),
  PRIMARY KEY (group_id, workspace_id, credential_id),
  UNIQUE (group_id, workspace_id, credential_id, audience),
  FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS bumblebee_catalog_revisions (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  catalog_revision_id TEXT NOT NULL CHECK (LENGTH(TRIM(catalog_revision_id)) > 0),
  catalog_digest TEXT NOT NULL CHECK (catalog_digest ~ '^[a-f0-9]{64}$'),
  canonical_catalog JSONB NOT NULL CHECK (jsonb_typeof(canonical_catalog) = 'object'),
  provenance JSONB NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  catalog_schema_version TEXT NOT NULL CHECK (LENGTH(TRIM(catalog_schema_version)) > 0),
  reviewed_by TEXT NOT NULL CHECK (LENGTH(TRIM(reviewed_by)) > 0),
  approval_receipt_id TEXT NOT NULL CHECK (LENGTH(TRIM(approval_receipt_id)) > 0),
  classification TEXT NOT NULL CHECK (classification IN ('internal', 'confidential', 'restricted')),
  redaction_policy TEXT NOT NULL CHECK (LENGTH(TRIM(redaction_policy)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, workspace_id, catalog_revision_id),
  UNIQUE (group_id, workspace_id, catalog_revision_id, catalog_digest),
  UNIQUE (group_id, workspace_id, catalog_digest),
  FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS bumblebee_catalog_entries (
  group_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  catalog_revision_id TEXT NOT NULL CHECK (LENGTH(TRIM(catalog_revision_id)) > 0),
  catalog_entry_id TEXT NOT NULL CHECK (LENGTH(TRIM(catalog_entry_id)) > 0),
  normalized_entry JSONB NOT NULL CHECK (jsonb_typeof(normalized_entry) = 'object'),
  entry_digest TEXT NOT NULL CHECK (entry_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, workspace_id, catalog_revision_id, catalog_entry_id),
  FOREIGN KEY (group_id, workspace_id, catalog_revision_id)
    REFERENCES bumblebee_catalog_revisions(group_id, workspace_id, catalog_revision_id)
);

CREATE OR REPLACE FUNCTION app.bumblebee_source_ecosystems_valid(
  values_to_check TEXT[], findings_can_be_emitted BOOLEAN
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT cardinality(values_to_check) > 0
    AND array_position(values_to_check, NULL) IS NULL
    AND cardinality(values_to_check) = (
      SELECT count(DISTINCT ecosystem) FROM unnest(values_to_check) AS ecosystem
    )
    AND NOT EXISTS (
      SELECT 1 FROM unnest(values_to_check) AS ecosystem
      WHERE ecosystem <> ALL (
        CASE WHEN findings_can_be_emitted
          THEN ARRAY['npm','pypi','go','rubygems','packagist','mcp','editor-extension','browser-extension']::TEXT[]
          ELSE ARRAY['npm','pypi','go','rubygems','packagist','mcp','editor-extension','browser-extension','homebrew']::TEXT[]
        END
      )
    );
$$;

CREATE TABLE IF NOT EXISTS bumblebee_sources (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL CHECK (LENGTH(TRIM(source_id)) > 0),
  source_revision_id TEXT NOT NULL CHECK (LENGTH(TRIM(source_revision_id)) > 0),
  revision_digest TEXT NOT NULL CHECK (revision_digest ~ '^[a-f0-9]{64}$'),
  endpoint_device_id TEXT NOT NULL CHECK (LENGTH(TRIM(endpoint_device_id)) > 0),
  runner_credential_id TEXT NOT NULL CHECK (LENGTH(TRIM(runner_credential_id)) > 0),
  runner_audience TEXT NOT NULL DEFAULT 'bumblebee_runner' CHECK (runner_audience = 'bumblebee_runner'),
  scanner_tag TEXT NOT NULL CHECK (scanner_tag = 'v0.1.2'),
  scanner_commit TEXT NOT NULL CHECK (scanner_commit = 'cc57710eeaf685e7b89924a36c8583cad0a378fe'),
  scanner_tree TEXT NOT NULL CHECK (scanner_tree = '985f57cf1749c15561c886c4476f10950ffa9cae'),
  scanner_artifact_sha256 TEXT NOT NULL CHECK (scanner_artifact_sha256 ~ '^[a-f0-9]{64}$'),
  record_schema_version TEXT NOT NULL CHECK (record_schema_version = '0.1.0'),
  profile TEXT NOT NULL CHECK (profile IN ('baseline', 'project', 'deep')),
  mode TEXT NOT NULL CHECK (mode IN ('inventory', 'findings-only')),
  findings_enabled BOOLEAN NOT NULL,
  root_config_digest TEXT NOT NULL CHECK (root_config_digest ~ '^[a-f0-9]{64}$'),
  ecosystems TEXT[] NOT NULL CHECK (cardinality(ecosystems) > 0),
  all_users BOOLEAN NOT NULL,
  freshness_ttl_seconds INTEGER NOT NULL CHECK (freshness_ttl_seconds > 0),
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  classification TEXT NOT NULL CHECK (classification IN ('internal', 'confidential', 'restricted')),
  redaction_policy TEXT NOT NULL CHECK (LENGTH(TRIM(redaction_policy)) > 0),
  catalog_revision_id TEXT CHECK (catalog_revision_id IS NULL OR LENGTH(TRIM(catalog_revision_id)) > 0),
  catalog_digest TEXT,
  disabled_at TIMESTAMPTZ,
  disabled_by TEXT,
  disable_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, workspace_id, source_id, source_revision_id),
  UNIQUE (group_id, workspace_id, source_id, revision_digest),
  UNIQUE (group_id, workspace_id, source_id, source_revision_id,
    runner_credential_id, runner_audience),
  FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id),
  FOREIGN KEY (group_id, workspace_id, runner_credential_id, runner_audience)
    REFERENCES bumblebee_runner_credentials(group_id, workspace_id, credential_id, audience),
  FOREIGN KEY (group_id, workspace_id, catalog_revision_id, catalog_digest)
    REFERENCES bumblebee_catalog_revisions(group_id, workspace_id, catalog_revision_id, catalog_digest),
  CHECK (mode <> 'findings-only' OR findings_enabled),
  CHECK (app.bumblebee_source_ecosystems_valid(ecosystems, findings_enabled OR mode = 'findings-only')),
  CHECK ((findings_enabled OR mode = 'findings-only') = (catalog_revision_id IS NOT NULL)),
  CHECK ((catalog_revision_id IS NULL) = (catalog_digest IS NULL)),
  CHECK ((disabled_at IS NULL AND disabled_by IS NULL AND disable_reason IS NULL)
      OR (disabled_at IS NOT NULL AND LENGTH(TRIM(disabled_by)) > 0 AND LENGTH(TRIM(disable_reason)) > 0))
);

CREATE INDEX IF NOT EXISTS bumblebee_sources_scope_active_idx
  ON bumblebee_sources (group_id, workspace_id, source_id, created_at DESC)
  WHERE disabled_at IS NULL;

CREATE OR REPLACE FUNCTION app.prevent_bumblebee_immutable_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION app.protect_bumblebee_runner_credential()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'bumblebee_runner_credentials are not deletable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['revoked_at','last_used_at']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['revoked_at','last_used_at']) THEN
    RAISE EXCEPTION 'bumblebee runner credential identity is immutable';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'bumblebee runner credential revocation is immutable once set';
  END IF;
  IF OLD.last_used_at IS NOT NULL AND
     (NEW.last_used_at IS NULL OR NEW.last_used_at < OLD.last_used_at) THEN
    RAISE EXCEPTION 'bumblebee runner credential last_used_at is monotonic';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.protect_bumblebee_source_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'bumblebee_sources are not deletable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['disabled_at','disabled_by','disable_reason']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['disabled_at','disabled_by','disable_reason']) THEN
    RAISE EXCEPTION 'bumblebee source revision identity and population are immutable';
  END IF;
  -- Disable metadata is a one-way soft-disable transition, never a rewrite path.
  IF OLD.disabled_at IS NOT NULL AND
     ROW(NEW.disabled_at, NEW.disabled_by, NEW.disable_reason) IS DISTINCT FROM
     ROW(OLD.disabled_at, OLD.disabled_by, OLD.disable_reason) THEN
    RAISE EXCEPTION 'bumblebee source disable metadata is immutable once set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bumblebee_runner_credentials_protected ON bumblebee_runner_credentials;
CREATE TRIGGER bumblebee_runner_credentials_protected
  BEFORE UPDATE OR DELETE ON bumblebee_runner_credentials
  FOR EACH ROW EXECUTE FUNCTION app.protect_bumblebee_runner_credential();
DROP TRIGGER IF EXISTS bumblebee_catalog_revisions_immutable ON bumblebee_catalog_revisions;
CREATE TRIGGER bumblebee_catalog_revisions_immutable
  BEFORE UPDATE OR DELETE ON bumblebee_catalog_revisions
  FOR EACH ROW EXECUTE FUNCTION app.prevent_bumblebee_immutable_mutation();
DROP TRIGGER IF EXISTS bumblebee_catalog_entries_immutable ON bumblebee_catalog_entries;
CREATE TRIGGER bumblebee_catalog_entries_immutable
  BEFORE UPDATE OR DELETE ON bumblebee_catalog_entries
  FOR EACH ROW EXECUTE FUNCTION app.prevent_bumblebee_immutable_mutation();
DROP TRIGGER IF EXISTS bumblebee_sources_protected ON bumblebee_sources;
CREATE TRIGGER bumblebee_sources_protected
  BEFORE UPDATE OR DELETE ON bumblebee_sources
  FOR EACH ROW EXECUTE FUNCTION app.protect_bumblebee_source_revision();

ALTER TABLE bumblebee_runner_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_runner_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_catalog_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_catalog_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_catalog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_catalog_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumblebee_sources FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bumblebee_runner_credentials_scope ON bumblebee_runner_credentials;
CREATE POLICY bumblebee_runner_credentials_scope ON bumblebee_runner_credentials FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true) AND workspace_id = current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true) AND workspace_id = current_setting('app.current_workspace_id', true));
DROP POLICY IF EXISTS bumblebee_catalog_revisions_scope ON bumblebee_catalog_revisions;
CREATE POLICY bumblebee_catalog_revisions_scope ON bumblebee_catalog_revisions FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true) AND workspace_id = current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true) AND workspace_id = current_setting('app.current_workspace_id', true));
DROP POLICY IF EXISTS bumblebee_catalog_entries_scope ON bumblebee_catalog_entries;
CREATE POLICY bumblebee_catalog_entries_scope ON bumblebee_catalog_entries FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true) AND workspace_id = current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true) AND workspace_id = current_setting('app.current_workspace_id', true));
DROP POLICY IF EXISTS bumblebee_sources_scope ON bumblebee_sources;
CREATE POLICY bumblebee_sources_scope ON bumblebee_sources FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true) AND workspace_id = current_setting('app.current_workspace_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true) AND workspace_id = current_setting('app.current_workspace_id', true));

GRANT SELECT, INSERT, UPDATE ON bumblebee_runner_credentials TO allura_app;
GRANT SELECT, INSERT ON bumblebee_catalog_revisions, bumblebee_catalog_entries TO allura_app;
GRANT SELECT, INSERT, UPDATE ON bumblebee_sources TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('046', NOW(), 'Story 26.7 immutable Bumblebee runner credential, catalog revision, entry, and source population authority')
ON CONFLICT (version) DO NOTHING;

COMMIT;
