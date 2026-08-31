-- Migration 57: narrow authenticated review loader for governed lane snapshots.
-- The application role cannot UPDATE branch_registry/branch_snapshots, so it
-- cannot use SELECT ... FOR UPDATE directly. This definer owns only the lock +
-- authority read; proposal creation remains in the existing application path.
BEGIN;

CREATE OR REPLACE FUNCTION app.load_governed_lane_snapshot_for_review(
  p_group_id TEXT,
  p_workspace_id TEXT,
  p_lane_id TEXT,
  p_snapshot_id UUID
) RETURNS TABLE(
  group_id TEXT,
  workspace_id TEXT,
  status TEXT,
  retention_expires_at TIMESTAMPTZ,
  diff_snapshot JSONB,
  agent_id TEXT,
  reviewer_ids TEXT[],
  snapshot_id UUID,
  base_revision TEXT,
  snapshot_diff JSONB,
  snapshot_evidence_refs JSONB,
  writer_id TEXT,
  snapshot_hash TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  principal TEXT := current_setting('app.current_principal', true);
BEGIN
  IF current_setting('app.current_group_id', true) IS DISTINCT FROM p_group_id
     OR current_setting('app.current_workspace_id', true) IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'governed lane review scope mismatch' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT registry.group_id,registry.workspace_id,registry.status,
         registry.retention_expires_at,registry.diff_snapshot,
         authority.writer_id,authority.reviewer_ids,
         snapshot.id,snapshot.base_revision,snapshot.diff,snapshot.evidence_refs,
         snapshot.writer_id,snapshot.snapshot_hash
  FROM public.branch_registry AS registry
  JOIN public.governed_lane_authority AS authority
    ON authority.lane_id=registry.lane_id
   AND authority.branch_id=registry.branch_id
   AND authority.writer_id=registry.agent_id
   AND authority.reviewer_ids=registry.reviewer_ids
  JOIN public.branch_snapshots AS snapshot
    ON snapshot.group_id=registry.group_id
   AND snapshot.workspace_id=registry.workspace_id
   AND snapshot.branch_id=registry.branch_id
   AND snapshot.id=p_snapshot_id
  WHERE registry.group_id=p_group_id
    AND registry.workspace_id=p_workspace_id
    AND registry.lane_id=p_lane_id
    AND principal=ANY(authority.reviewer_ids)
    AND principal IS DISTINCT FROM authority.writer_id
  FOR UPDATE OF registry,snapshot;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'governed lane snapshot is missing or reviewer is unauthorized'
      USING ERRCODE='42501';
  END IF;
END;
$$;

ALTER FUNCTION app.load_governed_lane_snapshot_for_review(TEXT,TEXT,TEXT,UUID) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.load_governed_lane_snapshot_for_review(TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.load_governed_lane_snapshot_for_review(TEXT,TEXT,TEXT,UUID) TO allura_app;

INSERT INTO schema_versions(version,applied_at,description)
VALUES ('057',NOW(),'Authenticated governed lane review lock boundary')
ON CONFLICT(version) DO NOTHING;

COMMIT;
