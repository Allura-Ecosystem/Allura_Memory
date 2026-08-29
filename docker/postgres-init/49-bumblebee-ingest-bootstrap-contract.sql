BEGIN;

-- PostgreSQL cannot alter a function's OUT-row type in place. This forward
-- migration replaces the narrow lease bootstrap with the source-bound ingest
-- contract before regranting its only caller.
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
  profile TEXT,
  mode TEXT,
  ecosystems TEXT[]
)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog
AS $$
  SELECT l.lease_id, l.group_id, l.workspace_id, l.source_id, l.source_revision_id,
    l.ingest_token_hash, l.expires_at, l.revoked_at,
    s.profile, s.mode, s.ecosystems
  FROM public.bumblebee_scan_leases AS l
  JOIN public.bumblebee_sources AS s
    ON l.group_id = s.group_id
   AND l.workspace_id = s.workspace_id
   AND l.source_id = s.source_id
   AND l.source_revision_id = s.source_revision_id
  WHERE l.ingest_token_prefix = p_prefix AND l.ingest_audience = 'bumblebee_ingest'
    AND s.disabled_at IS NULL
  LIMIT 1
$$;
ALTER FUNCTION app.bumblebee_bootstrap_ingest(TEXT) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.bumblebee_bootstrap_ingest(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.bumblebee_bootstrap_ingest(TEXT) TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('049', NOW(), 'Story 26.7 source-bound ingest bootstrap conformance contract')
ON CONFLICT (version) DO NOTHING;

COMMIT;
