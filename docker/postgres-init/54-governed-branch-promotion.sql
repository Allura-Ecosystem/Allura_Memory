-- Migration 54: one authoritative governed-branch representation.
--
-- A lane writes a fully materialized, immutable snapshot. The legacy branch
-- proposal ledger and the canonical curator queue both reference that exact
-- snapshot, allowing the approval transaction to lock and compare all three
-- representations before changing canonical state.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Migration 40 supports both the pre-39 receipt envelope (which carried
-- subject_kind/subject_id) and the current proposal FK contract. Retain the
-- legacy subject columns on every upgrade path so one approval INSERT works
-- against both histories.
ALTER TABLE governance_receipts
  ADD COLUMN IF NOT EXISTS subject_kind TEXT;
ALTER TABLE governance_receipts
  ADD COLUMN IF NOT EXISTS subject_id TEXT;

ALTER TABLE branch_registry
  ADD COLUMN IF NOT EXISTS reviewer_ids TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE branch_registry
  ADD COLUMN IF NOT EXISTS lane_id TEXT;

-- Repository-owned lane policy is copied into a durable, owner-controlled
-- catalog. Runtime rows are evidence of execution, never authorization policy.
-- The restricted application role may read this catalog but cannot change it.
CREATE TABLE IF NOT EXISTS governed_lane_authority (
  lane_id TEXT PRIMARY KEY CHECK (length(btrim(lane_id)) > 0),
  branch_id TEXT NOT NULL UNIQUE CHECK (length(btrim(branch_id)) > 0),
  writer_id TEXT NOT NULL CHECK (length(btrim(writer_id)) > 0),
  reviewer_ids TEXT[] NOT NULL CHECK (
    cardinality(reviewer_ids) > 0
    AND NOT writer_id = ANY(reviewer_ids)
  ),
  task_id TEXT,
  policy_version TEXT NOT NULL DEFAULT 'repository-2026-08-31',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT governed_lane_authority_identity_key
    UNIQUE (lane_id, branch_id, writer_id)
);

INSERT INTO governed_lane_authority(lane_id,branch_id,writer_id,reviewer_ids,task_id)
VALUES
  ('story-lane-27-1','ram/story/27-1','scout',ARRAY['pike','fowler'],'27-1'),
  ('story-lane-27-2','ram/story/27-2','woz',ARRAY['pike','fowler'],'27-2'),
  ('story-lane-27-3','ram/story/27-3','woz',ARRAY['pike','fowler'],'27-3'),
  ('story-lane-27-4','ram/story/27-4','bellard',ARRAY['pike','fowler'],'27-4'),
  ('story-lane-27-5','ram/story/27-5','brooks',ARRAY['pike','fowler'],'27-5'),
  ('story-lane-27-6','ram/story/27-6','hightower',ARRAY['pike','fowler'],'27-6'),
  ('agent-lane-brooks','ram/agent/brooks','brooks',ARRAY['pike','fowler'],NULL),
  ('agent-lane-woz','ram/agent/woz','woz',ARRAY['pike','fowler'],NULL),
  ('agent-lane-knuth','ram/agent/knuth','knuth',ARRAY['pike','fowler'],NULL),
  ('agent-lane-pike','ram/agent/pike','pike',ARRAY['fowler'],NULL),
  ('agent-lane-fowler','ram/agent/fowler','fowler',ARRAY['pike'],NULL),
  ('agent-lane-bellard','ram/agent/bellard','bellard',ARRAY['pike','fowler'],NULL),
  ('agent-lane-hightower','ram/agent/hightower','hightower',ARRAY['pike','fowler'],NULL),
  ('agent-lane-jobs','ram/agent/jobs','jobs',ARRAY['pike','fowler'],NULL),
  ('agent-lane-carmack','ram/agent/carmack','carmack',ARRAY['pike','fowler'],NULL),
  ('agent-lane-scout','ram/agent/scout','scout',ARRAY['pike','fowler'],NULL),
  ('agent-lane-bahari','ram/agent/bahari','bahari',ARRAY['pike','fowler'],NULL),
  ('review-lane-pike','ram/review/pike','pike',ARRAY['fowler'],NULL),
  ('review-lane-fowler','ram/review/fowler','fowler',ARRAY['pike'],NULL),
  ('review-lane-munari-rand','ram/review/munari-rand','munari-rand',ARRAY['pike','fowler'],NULL),
  ('durham-conservative','durham/concept/conservative','munari-rand',ARRAY['pike','fowler'],NULL),
  ('durham-expressive','durham/concept/expressive','munari-rand',ARRAY['pike','fowler'],NULL),
  ('durham-crop-resilient','durham/concept/crop-resilient','munari-rand',ARRAY['pike','fowler'],NULL)
ON CONFLICT (lane_id) DO UPDATE SET
  branch_id=EXCLUDED.branch_id,
  writer_id=EXCLUDED.writer_id,
  reviewer_ids=EXCLUDED.reviewer_ids,
  task_id=EXCLUDED.task_id,
  policy_version='repository-2026-08-31';

REVOKE ALL ON governed_lane_authority FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON governed_lane_authority FROM allura_app;
GRANT SELECT ON governed_lane_authority TO allura_app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.branch_registry'::regclass
      AND conname='branch_registry_lane_authority_fkey'
  ) THEN
    ALTER TABLE branch_registry
      ADD CONSTRAINT branch_registry_lane_authority_fkey
      FOREIGN KEY (lane_id,branch_id,agent_id)
      REFERENCES governed_lane_authority(lane_id,branch_id,writer_id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

-- Client-selected memory IDs use a tenant-wide primary-key grain. RLS hides
-- sibling workspaces from allura_app, so this owner-side assertion is the
-- only safe way to fail early with an explicit scope collision.
CREATE OR REPLACE FUNCTION app.assert_governed_memory_ids_available(
  p_group_id TEXT,
  p_workspace_id TEXT,
  p_output_ids TEXT[]
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_setting('app.current_group_id', true) IS DISTINCT FROM p_group_id
     OR current_setting('app.current_workspace_id', true) IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'governed memory identity scope mismatch' USING ERRCODE='42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.graph_memories
    WHERE group_id=p_group_id AND id=ANY(p_output_ids)
      AND workspace_id IS DISTINCT FROM p_workspace_id
  ) THEN
    RAISE EXCEPTION 'governed memory output identity collides with a sibling workspace'
      USING ERRCODE='23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.graph_memories
    WHERE group_id=p_group_id AND workspace_id=p_workspace_id
      AND id=ANY(p_output_ids)
  ) THEN
    RAISE EXCEPTION 'governed memory output identity already exists'
      USING ERRCODE='23505';
  END IF;
END;
$$;
ALTER FUNCTION app.assert_governed_memory_ids_available(TEXT,TEXT,TEXT[]) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.assert_governed_memory_ids_available(TEXT,TEXT,TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_governed_memory_ids_available(TEXT,TEXT,TEXT[]) TO allura_app;

-- Receipt fields are derived from already-approved locked representations.
-- allura_app cannot INSERT a receipt or supply its content; it may only ask
-- this definer to materialize the unique receipt after the governance receipt
-- has proven the same actor completed the governed server transaction.
CREATE OR REPLACE FUNCTION app.issue_governed_promotion_receipt(
  p_group_id TEXT,
  p_workspace_id TEXT,
  p_promotion_proposal_id UUID,
  p_actor_id TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  issued_id UUID;
BEGIN
  IF current_setting('app.current_group_id', true) IS DISTINCT FROM p_group_id
     OR current_setting('app.current_workspace_id', true) IS DISTINCT FROM p_workspace_id
     OR current_setting('app.current_principal', true) IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'governed promotion receipt scope mismatch' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.promotion_receipts(
    group_id,workspace_id,proposal_id,branch_id,base_revision,diff,
    evidence_refs,actor_id,trace_id,branch_snapshot_id,canonical_proposal_id
  )
  SELECT p.group_id,p.workspace_id,p.id,s.branch_id,s.base_revision,s.diff,
    s.evidence_refs,p_actor_id,p.metadata->>'trace_id',s.id,p.canonical_proposal_id
  FROM public.promotion_proposals p
  JOIN public.canonical_proposals c
    ON c.group_id=p.group_id AND c.workspace_id=p.workspace_id
   AND c.id=p.canonical_proposal_id AND c.status='approved'
  JOIN public.governance_receipts g
    ON g.group_id=c.group_id AND g.workspace_id=c.workspace_id
   AND g.proposal_id=c.id AND g.action='approve' AND g.actor_id=p_actor_id
  JOIN public.branch_snapshots s
    ON s.group_id=p.group_id AND s.workspace_id=p.workspace_id
   AND s.id=p.branch_snapshot_id
  JOIN public.branch_registry r
    ON r.group_id=s.group_id AND r.workspace_id=s.workspace_id
   AND r.branch_id=s.branch_id AND r.status='active'
  JOIN public.governed_lane_authority a
    ON a.lane_id=r.lane_id AND a.branch_id=r.branch_id
   AND a.writer_id=r.agent_id AND a.reviewer_ids=r.reviewer_ids
  WHERE p.group_id=p_group_id AND p.workspace_id=p_workspace_id
    AND p.id=p_promotion_proposal_id AND p.status='approved'
    AND p.proposed_by=ANY(a.reviewer_ids)
    AND p.metadata->>'writer_id'=a.writer_id
    AND p.metadata->>'reviewer_id'=p.proposed_by
  RETURNING id INTO issued_id;

  IF issued_id IS NULL THEN
    RAISE EXCEPTION 'governed promotion receipt requires an approved authoritative transaction'
      USING ERRCODE='23514';
  END IF;
  RETURN issued_id;
END;
$$;
ALTER FUNCTION app.issue_governed_promotion_receipt(TEXT,TEXT,UUID,TEXT) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.issue_governed_promotion_receipt(TEXT,TEXT,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.issue_governed_promotion_receipt(TEXT,TEXT,UUID,TEXT) TO allura_app;

REVOKE INSERT ON promotion_receipts FROM allura_app;

DROP POLICY IF EXISTS branch_registry_workspace_scope_restrictive_policy ON branch_registry;
CREATE POLICY branch_registry_workspace_scope_restrictive_policy ON branch_registry AS RESTRICTIVE
  FOR ALL TO allura_app
  USING (
    group_id=current_setting('app.current_group_id', true)
    AND workspace_id=current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id=current_setting('app.current_group_id', true)
    AND workspace_id=current_setting('app.current_workspace_id', true)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.branch_registry'::regclass
      AND conname='branch_registry_scope_writer_key'
  ) THEN
    ALTER TABLE branch_registry
      ADD CONSTRAINT branch_registry_scope_writer_key
      UNIQUE (group_id, workspace_id, branch_id, agent_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.branch_diff_is_materialized(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT
    jsonb_typeof(candidate)='object'
    AND jsonb_typeof(candidate->'added')='array'
    AND jsonb_typeof(candidate->'overridden')='array'
    AND jsonb_typeof(candidate->'deleted')='array'
    AND (
      jsonb_array_length(candidate->'added')
      + jsonb_array_length(candidate->'overridden')
      + jsonb_array_length(candidate->'deleted')
    ) > 0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(candidate->'added') AS element(value)
      WHERE jsonb_typeof(value) <> 'object'
         OR jsonb_typeof(value->'id') <> 'string'
         OR length(btrim(value->>'id')) = 0
         OR jsonb_typeof(value->'content') <> 'string'
         OR length(btrim(value->>'content')) = 0
         OR jsonb_typeof(value->'score') <> 'number'
         OR (value->>'score')::numeric < 0
         OR (value->>'score')::numeric > 1
         OR jsonb_typeof(value->'tags') <> 'array'
         OR value->>'provenance' NOT IN ('conversation','manual')
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(candidate->'overridden') AS element(value)
      WHERE jsonb_typeof(value) <> 'object'
         OR jsonb_typeof(value->'id') <> 'string'
         OR length(btrim(value->>'id')) = 0
         OR jsonb_typeof(value->'supersedes_id') <> 'string'
         OR length(btrim(value->>'supersedes_id')) = 0
         OR value->>'id' = value->>'supersedes_id'
         OR jsonb_typeof(value->'content') <> 'string'
         OR length(btrim(value->>'content')) = 0
         OR jsonb_typeof(value->'score') <> 'number'
         OR (value->>'score')::numeric < 0
         OR (value->>'score')::numeric > 1
         OR jsonb_typeof(value->'tags') <> 'array'
         OR value->>'provenance' NOT IN ('conversation','manual')
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(candidate->'deleted') AS element(value)
      WHERE jsonb_typeof(value) <> 'string' OR length(btrim(value #>> '{}')) = 0
    );
$$;

CREATE TABLE IF NOT EXISTS branch_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  workspace_id TEXT NOT NULL CHECK (length(btrim(workspace_id)) > 0),
  branch_id TEXT NOT NULL CHECK (length(btrim(branch_id)) > 0),
  base_revision TEXT NOT NULL CHECK (length(btrim(base_revision)) > 0),
  diff JSONB NOT NULL CHECK (app.branch_diff_is_materialized(diff)),
  evidence_refs JSONB NOT NULL CHECK (
    jsonb_typeof(evidence_refs)='array' AND jsonb_array_length(evidence_refs)>0
  ),
  writer_id TEXT NOT NULL CHECK (length(btrim(writer_id)) > 0),
  snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT branch_snapshots_scope_branch_fkey
    FOREIGN KEY (group_id,workspace_id,branch_id)
    REFERENCES branch_registry(group_id,workspace_id,branch_id) ON DELETE RESTRICT,
  CONSTRAINT branch_snapshots_scope_writer_fkey
    FOREIGN KEY (group_id,workspace_id,branch_id,writer_id)
    REFERENCES branch_registry(group_id,workspace_id,branch_id,agent_id) ON DELETE RESTRICT,
  CONSTRAINT branch_snapshots_scope_identity_key
    UNIQUE (group_id,workspace_id,id),
  CONSTRAINT branch_snapshots_scope_hash_key
    UNIQUE (group_id,workspace_id,branch_id,snapshot_hash)
);

CREATE INDEX IF NOT EXISTS branch_snapshots_scope_branch_created_idx
  ON branch_snapshots(group_id,workspace_id,branch_id,created_at DESC,id);

CREATE OR REPLACE FUNCTION app.prevent_branch_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'branch_snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS branch_snapshots_immutable_trigger ON branch_snapshots;
CREATE TRIGGER branch_snapshots_immutable_trigger
  BEFORE UPDATE OR DELETE ON branch_snapshots
  FOR EACH ROW EXECUTE FUNCTION app.prevent_branch_snapshot_mutation();

ALTER TABLE branch_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_snapshots_tenant_isolation_policy ON branch_snapshots;
CREATE POLICY branch_snapshots_tenant_isolation_policy ON branch_snapshots
  FOR ALL TO allura_app
  USING (group_id=current_setting('app.current_group_id', true))
  WITH CHECK (group_id=current_setting('app.current_group_id', true));

DROP POLICY IF EXISTS branch_snapshots_workspace_scope_restrictive_policy ON branch_snapshots;
CREATE POLICY branch_snapshots_workspace_scope_restrictive_policy ON branch_snapshots AS RESTRICTIVE
  FOR ALL TO allura_app
  USING (
    group_id=current_setting('app.current_group_id', true)
    AND workspace_id=current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id=current_setting('app.current_group_id', true)
    AND workspace_id=current_setting('app.current_workspace_id', true)
  );

-- The application role cannot write registry or snapshot authority directly.
-- Narrow SECURITY DEFINER functions below resolve the immutable lane policy,
-- bind scope to transaction-local verified identity, and perform only the
-- transition needed by the production workflow.
REVOKE INSERT, UPDATE, DELETE ON branch_registry FROM allura_app;
REVOKE INSERT, UPDATE, DELETE ON branch_snapshots FROM allura_app;
GRANT SELECT ON branch_registry, branch_snapshots TO allura_app;

CREATE OR REPLACE FUNCTION app.open_governed_lane(
  p_group_id TEXT,
  p_workspace_id TEXT,
  p_lane_id TEXT,
  p_base_revision TEXT
) RETURNS TABLE(
  lane_id TEXT,
  branch_id TEXT,
  writer_id TEXT,
  reviewer_ids TEXT[],
  status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  authority public.governed_lane_authority%ROWTYPE;
  existing public.branch_registry%ROWTYPE;
  principal TEXT := current_setting('app.current_principal', true);
BEGIN
  IF current_setting('app.current_group_id', true) IS DISTINCT FROM p_group_id
     OR current_setting('app.current_workspace_id', true) IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'governed lane scope mismatch' USING ERRCODE='42501';
  END IF;
  SELECT * INTO authority FROM public.governed_lane_authority
   WHERE governed_lane_authority.lane_id=p_lane_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown governed lane %', p_lane_id USING ERRCODE='23514'; END IF;
  IF principal IS DISTINCT FROM authority.writer_id THEN
    RAISE EXCEPTION 'governed lane writer mismatch' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.branch_registry(
    group_id,workspace_id,branch_id,lane_id,task_id,agent_id,
    base_snapshot_id,branch_revision,status,created_by,reviewer_ids
  ) VALUES (
    p_group_id,p_workspace_id,authority.branch_id,authority.lane_id,authority.task_id,
    authority.writer_id,p_base_revision,p_base_revision,'active',principal,authority.reviewer_ids
  ) ON CONFLICT ON CONSTRAINT branch_registry_scope_key DO NOTHING;

  SELECT * INTO existing FROM public.branch_registry registry
   WHERE registry.group_id=p_group_id AND registry.workspace_id=p_workspace_id
     AND registry.branch_id=authority.branch_id
   FOR UPDATE;
  IF existing.lane_id IS DISTINCT FROM authority.lane_id
     OR existing.agent_id IS DISTINCT FROM authority.writer_id
     OR existing.reviewer_ids IS DISTINCT FROM authority.reviewer_ids
     OR existing.status IS DISTINCT FROM 'active'
     OR existing.base_snapshot_id IS DISTINCT FROM p_base_revision THEN
    RAISE EXCEPTION 'governed lane registry drift' USING ERRCODE='23514';
  END IF;

  RETURN QUERY SELECT authority.lane_id,authority.branch_id,authority.writer_id,
    authority.reviewer_ids,existing.status;
END;
$$;

ALTER FUNCTION app.open_governed_lane(TEXT,TEXT,TEXT,TEXT) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.open_governed_lane(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.open_governed_lane(TEXT,TEXT,TEXT,TEXT) TO allura_app;

CREATE OR REPLACE FUNCTION app.persist_governed_lane_snapshot(
  p_group_id TEXT,
  p_workspace_id TEXT,
  p_lane_id TEXT,
  p_base_revision TEXT,
  p_diff JSONB,
  p_evidence_refs JSONB,
  p_snapshot_hash TEXT
) RETURNS TABLE(
  id UUID,
  snapshot_hash TEXT,
  base_revision TEXT,
  diff JSONB,
  evidence_refs JSONB,
  writer_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  authority public.governed_lane_authority%ROWTYPE;
  registry public.branch_registry%ROWTYPE;
  stored public.branch_snapshots%ROWTYPE;
  principal TEXT := current_setting('app.current_principal', true);
BEGIN
  IF current_setting('app.current_group_id', true) IS DISTINCT FROM p_group_id
     OR current_setting('app.current_workspace_id', true) IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'governed lane scope mismatch' USING ERRCODE='42501';
  END IF;
  SELECT * INTO authority FROM public.governed_lane_authority
   WHERE governed_lane_authority.lane_id=p_lane_id;
  IF NOT FOUND OR principal IS DISTINCT FROM authority.writer_id THEN
    RAISE EXCEPTION 'governed lane writer mismatch' USING ERRCODE='42501';
  END IF;
  SELECT * INTO registry FROM public.branch_registry
   WHERE group_id=p_group_id AND workspace_id=p_workspace_id
     AND branch_id=authority.branch_id AND lane_id=authority.lane_id
   FOR UPDATE;
  IF NOT FOUND OR registry.status IS DISTINCT FROM 'active'
     OR registry.agent_id IS DISTINCT FROM authority.writer_id
     OR registry.reviewer_ids IS DISTINCT FROM authority.reviewer_ids
     OR registry.base_snapshot_id IS DISTINCT FROM p_base_revision THEN
    RAISE EXCEPTION 'governed lane registry drift' USING ERRCODE='23514';
  END IF;
  IF NOT app.branch_diff_is_materialized(p_diff)
     OR jsonb_typeof(p_evidence_refs) <> 'array'
     OR jsonb_array_length(p_evidence_refs)=0
     OR p_snapshot_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'governed lane snapshot is malformed' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.branch_snapshots(
    group_id,workspace_id,branch_id,base_revision,diff,evidence_refs,writer_id,snapshot_hash
  ) VALUES (
    p_group_id,p_workspace_id,authority.branch_id,p_base_revision,p_diff,
    p_evidence_refs,authority.writer_id,p_snapshot_hash
  ) RETURNING * INTO stored;

  UPDATE public.branch_registry SET
    diff_snapshot=jsonb_build_object(
      'snapshot_id',stored.id,'snapshot_hash',stored.snapshot_hash,
      'base_revision',stored.base_revision,'diff',stored.diff,
      'evidence_refs',stored.evidence_refs
    ),
    branch_revision=stored.snapshot_hash,
    updated_at=NOW()
  WHERE group_id=p_group_id AND workspace_id=p_workspace_id
    AND branch_id=authority.branch_id AND lane_id=authority.lane_id;

  RETURN QUERY SELECT stored.id,stored.snapshot_hash,stored.base_revision,
    stored.diff,stored.evidence_refs,stored.writer_id;
END;
$$;

ALTER FUNCTION app.persist_governed_lane_snapshot(TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.persist_governed_lane_snapshot(TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.persist_governed_lane_snapshot(TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT) TO allura_app;

CREATE OR REPLACE FUNCTION app.transition_governed_lane(
  p_group_id TEXT,
  p_workspace_id TEXT,
  p_lane_id TEXT,
  p_status TEXT,
  p_reason TEXT,
  p_diff_snapshot JSONB,
  p_retention_expires_at TIMESTAMPTZ
) RETURNS TABLE(branch_id TEXT,status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  authority public.governed_lane_authority%ROWTYPE;
  principal TEXT := current_setting('app.current_principal', true);
BEGIN
  IF current_setting('app.current_group_id', true) IS DISTINCT FROM p_group_id
     OR current_setting('app.current_workspace_id', true) IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'governed lane scope mismatch' USING ERRCODE='42501';
  END IF;
  SELECT * INTO authority FROM public.governed_lane_authority
   WHERE governed_lane_authority.lane_id=p_lane_id;
  IF NOT FOUND OR (
    principal IS DISTINCT FROM authority.writer_id
    AND NOT principal=ANY(authority.reviewer_ids)
  ) THEN RAISE EXCEPTION 'governed lane transition actor mismatch' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('degraded','expired','rejected','quarantined','rolled_back')
     OR length(btrim(p_reason))=0 OR p_diff_snapshot IS NULL
     OR p_retention_expires_at IS NULL THEN
    RAISE EXCEPTION 'invalid governed lane transition' USING ERRCODE='23514';
  END IF;

  RETURN QUERY
  UPDATE public.branch_registry registry SET
    status=p_status,quarantine_reason=p_reason,diff_snapshot=p_diff_snapshot,
    quarantined_at=NOW(),retention_expires_at=p_retention_expires_at,updated_at=NOW()
  WHERE registry.group_id=p_group_id AND registry.workspace_id=p_workspace_id
    AND registry.branch_id=authority.branch_id AND registry.lane_id=authority.lane_id
    AND registry.agent_id=authority.writer_id AND registry.reviewer_ids=authority.reviewer_ids
  RETURNING registry.branch_id,registry.status;
  IF NOT FOUND THEN RAISE EXCEPTION 'governed lane registry drift' USING ERRCODE='23514'; END IF;
END;
$$;

ALTER FUNCTION app.transition_governed_lane(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TIMESTAMPTZ) OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.transition_governed_lane(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.transition_governed_lane(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TIMESTAMPTZ) TO allura_app;

-- Link the compatibility ledger to the real curator queue. All columns stay
-- nullable for pre-054 history; the application requires them for new branch
-- proposals and the partial unique indexes deny duplicate queueing.
ALTER TABLE promotion_proposals
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE promotion_proposals
  ADD COLUMN IF NOT EXISTS branch_snapshot_id UUID;
ALTER TABLE promotion_proposals
  ADD COLUMN IF NOT EXISTS canonical_proposal_id UUID;

-- Migration 36 supplied the tenant boundary before promotion proposals had a
-- workspace column. New governed rows must also be isolated from sibling
-- workspaces in the same tenant.
DROP POLICY IF EXISTS promotion_proposals_workspace_scope_restrictive_policy ON promotion_proposals;
CREATE POLICY promotion_proposals_workspace_scope_restrictive_policy ON promotion_proposals AS RESTRICTIVE
  FOR ALL TO allura_app
  USING (
    group_id=current_setting('app.current_group_id', true)
    AND workspace_id=current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id=current_setting('app.current_group_id', true)
    AND workspace_id=current_setting('app.current_workspace_id', true)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_proposals'::regclass
      AND conname='promotion_proposals_group_workspace_fkey'
  ) THEN
    ALTER TABLE promotion_proposals
      ADD CONSTRAINT promotion_proposals_group_workspace_fkey
      FOREIGN KEY (group_id,workspace_id)
      REFERENCES workspaces(group_id,workspace_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_proposals'::regclass
      AND conname='promotion_proposals_branch_snapshot_scope_fkey'
  ) THEN
    ALTER TABLE promotion_proposals
      ADD CONSTRAINT promotion_proposals_branch_snapshot_scope_fkey
      FOREIGN KEY (group_id,workspace_id,branch_snapshot_id)
      REFERENCES branch_snapshots(group_id,workspace_id,id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_proposals'::regclass
      AND conname='promotion_proposals_canonical_scope_fkey'
  ) THEN
    ALTER TABLE promotion_proposals
      ADD CONSTRAINT promotion_proposals_canonical_scope_fkey
      FOREIGN KEY (group_id,workspace_id,canonical_proposal_id)
      REFERENCES canonical_proposals(group_id,workspace_id,id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS promotion_proposals_branch_snapshot_unique
  ON promotion_proposals(group_id,workspace_id,branch_snapshot_id)
  WHERE branch_snapshot_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS promotion_proposals_canonical_proposal_unique
  ON promotion_proposals(group_id,workspace_id,canonical_proposal_id)
  WHERE canonical_proposal_id IS NOT NULL;

ALTER TABLE promotion_receipts
  ADD COLUMN IF NOT EXISTS branch_snapshot_id UUID;
ALTER TABLE promotion_receipts
  ADD COLUMN IF NOT EXISTS canonical_proposal_id UUID;

DROP POLICY IF EXISTS promotion_receipts_workspace_scope_restrictive_policy ON promotion_receipts;
CREATE POLICY promotion_receipts_workspace_scope_restrictive_policy ON promotion_receipts AS RESTRICTIVE
  FOR ALL TO allura_app
  USING (
    group_id=current_setting('app.current_group_id', true)
    AND workspace_id=current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id=current_setting('app.current_group_id', true)
    AND workspace_id=current_setting('app.current_workspace_id', true)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_receipts'::regclass
      AND conname='promotion_receipts_branch_snapshot_scope_fkey'
  ) THEN
    ALTER TABLE promotion_receipts
      ADD CONSTRAINT promotion_receipts_branch_snapshot_scope_fkey
      FOREIGN KEY (group_id,workspace_id,branch_snapshot_id)
      REFERENCES branch_snapshots(group_id,workspace_id,id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_receipts'::regclass
      AND conname='promotion_receipts_canonical_scope_fkey'
  ) THEN
    ALTER TABLE promotion_receipts
      ADD CONSTRAINT promotion_receipts_canonical_scope_fkey
      FOREIGN KEY (group_id,workspace_id,canonical_proposal_id)
      REFERENCES canonical_proposals(group_id,workspace_id,id) ON DELETE RESTRICT;
  END IF;
END $$;

INSERT INTO schema_versions(version,applied_at,description)
VALUES ('054',NOW(),'Immutable materialized branch snapshots, authoritative lane reviewers, and branch proposal bridge to canonical curator queue')
ON CONFLICT(version) DO NOTHING;

COMMIT;
