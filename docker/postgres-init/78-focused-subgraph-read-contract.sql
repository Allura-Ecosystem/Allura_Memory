BEGIN;

-- Story 31.2: additive endpoint typing. Historical scope is never invented:
-- only an endpoint that resolves uniquely inside its existing workspace is typed.
ALTER TABLE graph_structural_edges ADD COLUMN IF NOT EXISTS from_kind TEXT;
ALTER TABLE graph_structural_edges ADD COLUMN IF NOT EXISTS to_kind TEXT;
ALTER TABLE graph_structural_edges ADD COLUMN IF NOT EXISTS endpoint_state TEXT;

WITH resolution AS (
  SELECT e.ctid,
    CASE WHEN fm.id IS NOT NULL AND fs.node_id IS NULL THEN 'memory'
         WHEN fs.node_id IS NOT NULL AND fm.id IS NULL THEN 'structural' END AS resolved_from,
    CASE WHEN tm.id IS NOT NULL AND ts.node_id IS NULL THEN 'memory'
         WHEN ts.node_id IS NOT NULL AND tm.id IS NULL THEN 'structural' END AS resolved_to,
    ((fm.id IS NOT NULL)::int + (fs.node_id IS NOT NULL)::int) AS from_matches,
    ((tm.id IS NOT NULL)::int + (ts.node_id IS NOT NULL)::int) AS to_matches
  FROM graph_structural_edges e
  LEFT JOIN graph_memories fm ON fm.group_id=e.group_id AND fm.workspace_id=e.workspace_id AND fm.id=e.from_id
    AND fm.workspace_scope_state='workspace_scoped'
  LEFT JOIN graph_structural_nodes fs ON fs.group_id=e.group_id AND fs.workspace_id=e.workspace_id AND fs.node_id=e.from_id
    AND fs.workspace_scope_state='workspace_scoped'
  LEFT JOIN graph_memories tm ON tm.group_id=e.group_id AND tm.workspace_id=e.workspace_id AND tm.id=e.to_id
    AND tm.workspace_scope_state='workspace_scoped'
  LEFT JOIN graph_structural_nodes ts ON ts.group_id=e.group_id AND ts.workspace_id=e.workspace_id AND ts.node_id=e.to_id
    AND ts.workspace_scope_state='workspace_scoped'
  WHERE e.workspace_id IS NOT NULL AND e.workspace_scope_state='workspace_scoped'
)
UPDATE graph_structural_edges e
SET from_kind=r.resolved_from,
    to_kind=r.resolved_to,
    endpoint_state=CASE WHEN r.from_matches=1 AND r.to_matches=1 THEN 'resolved'
                        WHEN r.from_matches>1 OR r.to_matches>1 THEN 'ambiguous'
                        ELSE 'orphan' END
FROM resolution r WHERE e.ctid=r.ctid;

UPDATE graph_structural_edges
SET endpoint_state='orphan',from_kind=NULL,to_kind=NULL
WHERE endpoint_state IS NULL;

ALTER TABLE graph_structural_edges ALTER COLUMN endpoint_state SET DEFAULT 'resolved';
ALTER TABLE graph_structural_edges ALTER COLUMN endpoint_state SET NOT NULL;
ALTER TABLE graph_structural_edges DROP CONSTRAINT IF EXISTS graph_structural_edges_endpoint_contract_check;
ALTER TABLE graph_structural_edges ADD CONSTRAINT graph_structural_edges_endpoint_contract_check CHECK (
  (endpoint_state='resolved' AND from_kind IN ('memory','structural') AND to_kind IN ('memory','structural')) OR
  (endpoint_state IN ('ambiguous','orphan') AND from_kind IS NULL AND to_kind IS NULL)
);

-- Remove tenant-only identities which prevented equal logical IDs in distinct
-- workspaces. Existing scoped UNIQUE constraints remain FK targets.
ALTER TABLE graph_supersedes DROP CONSTRAINT IF EXISTS graph_supersedes_newer_id_group_id_fkey;
ALTER TABLE graph_supersedes DROP CONSTRAINT IF EXISTS graph_supersedes_superseded_id_group_id_fkey;
ALTER TABLE graph_memories DROP CONSTRAINT IF EXISTS graph_memories_pkey;
ALTER TABLE graph_structural_nodes DROP CONSTRAINT IF EXISTS graph_structural_nodes_pkey;
ALTER TABLE graph_structural_edges DROP CONSTRAINT IF EXISTS graph_structural_edges_pkey;
ALTER TABLE graph_supersedes DROP CONSTRAINT IF EXISTS graph_supersedes_pkey;

ALTER TABLE graph_structural_nodes DROP CONSTRAINT IF EXISTS graph_structural_nodes_scope_identity_key;
ALTER TABLE graph_structural_nodes ADD CONSTRAINT graph_structural_nodes_scope_identity_key UNIQUE(group_id,workspace_id,node_id);
ALTER TABLE graph_structural_edges DROP CONSTRAINT IF EXISTS graph_structural_edges_scope_identity_key;
ALTER TABLE graph_structural_edges ADD CONSTRAINT graph_structural_edges_scope_identity_key
  UNIQUE(group_id,workspace_id,from_kind,from_id,to_kind,to_id,rel_type);
ALTER TABLE graph_supersedes DROP CONSTRAINT IF EXISTS graph_supersedes_scope_identity_key;
ALTER TABLE graph_supersedes ADD CONSTRAINT graph_supersedes_scope_identity_key
  UNIQUE(group_id,workspace_id,newer_id,superseded_id);

CREATE OR REPLACE FUNCTION public.enforce_focused_subgraph_endpoint_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.endpoint_state <> 'resolved' THEN RETURN NEW; END IF;
  IF NEW.from_kind='memory' AND NOT EXISTS (
    SELECT 1 FROM graph_memories WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id
      AND id=NEW.from_id AND workspace_scope_state='workspace_scoped') THEN
    RAISE EXCEPTION 'resolved graph edge source is missing';
  ELSIF NEW.from_kind='structural' AND NOT EXISTS (
    SELECT 1 FROM graph_structural_nodes WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id
      AND node_id=NEW.from_id AND workspace_scope_state='workspace_scoped') THEN
    RAISE EXCEPTION 'resolved graph edge source is missing';
  END IF;
  IF NEW.to_kind='memory' AND NOT EXISTS (
    SELECT 1 FROM graph_memories WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id
      AND id=NEW.to_id AND workspace_scope_state='workspace_scoped') THEN
    RAISE EXCEPTION 'resolved graph edge target is missing';
  ELSIF NEW.to_kind='structural' AND NOT EXISTS (
    SELECT 1 FROM graph_structural_nodes WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id
      AND node_id=NEW.to_id AND workspace_scope_state='workspace_scoped') THEN
    RAISE EXCEPTION 'resolved graph edge target is missing';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS graph_structural_edges_endpoint_integrity ON graph_structural_edges;
CREATE CONSTRAINT TRIGGER graph_structural_edges_endpoint_integrity
AFTER INSERT OR UPDATE OF group_id,workspace_id,from_id,from_kind,to_id,to_kind,endpoint_state
ON graph_structural_edges DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.enforce_focused_subgraph_endpoint_integrity();

-- Resolved edge typing is evidence, not a guess. If an endpoint is removed,
-- soft-deleted, or moved to another scope, quarantine every affected edge in
-- its old scope rather than leaving a silently stale resolved assertion.
CREATE OR REPLACE FUNCTION public.orphan_focused_subgraph_edges_for_endpoint()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  endpoint_kind TEXT;
  old_endpoint_id TEXT;
  new_endpoint_id TEXT;
  endpoint_moved BOOLEAN;
BEGIN
  endpoint_kind := CASE WHEN TG_TABLE_NAME='graph_memories' THEN 'memory' ELSE 'structural' END;
  old_endpoint_id := CASE WHEN TG_TABLE_NAME='graph_memories' THEN to_jsonb(OLD)->>'id' ELSE to_jsonb(OLD)->>'node_id' END;
  new_endpoint_id := CASE WHEN TG_OP='DELETE' THEN NULL
    WHEN TG_TABLE_NAME='graph_memories' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'node_id' END;
  endpoint_moved := TG_OP='DELETE' OR
    (OLD.group_id,OLD.workspace_id,old_endpoint_id,OLD.workspace_scope_state) IS DISTINCT FROM
    (NEW.group_id,NEW.workspace_id,new_endpoint_id,NEW.workspace_scope_state) OR
    (TG_TABLE_NAME='graph_memories' AND (to_jsonb(OLD)->>'deleted_at') IS NULL AND (to_jsonb(NEW)->>'deleted_at') IS NOT NULL);
  IF endpoint_moved AND OLD.workspace_id IS NOT NULL THEN
    UPDATE public.graph_structural_edges
       SET endpoint_state='orphan',from_kind=NULL,to_kind=NULL
     WHERE group_id=OLD.group_id AND workspace_id=OLD.workspace_id
       AND workspace_scope_state='workspace_scoped' AND endpoint_state='resolved'
       AND ((from_kind=endpoint_kind AND from_id=old_endpoint_id) OR
            (to_kind=endpoint_kind AND to_id=old_endpoint_id));
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS graph_memories_orphan_edges ON graph_memories;
CREATE TRIGGER graph_memories_orphan_edges
AFTER DELETE OR UPDATE OF id,group_id,workspace_id,workspace_scope_state,deleted_at ON graph_memories
FOR EACH ROW EXECUTE FUNCTION public.orphan_focused_subgraph_edges_for_endpoint();
DROP TRIGGER IF EXISTS graph_structural_nodes_orphan_edges ON graph_structural_nodes;
CREATE TRIGGER graph_structural_nodes_orphan_edges
AFTER DELETE OR UPDATE OF node_id,group_id,workspace_id,workspace_scope_state ON graph_structural_nodes
FOR EACH ROW EXECUTE FUNCTION public.orphan_focused_subgraph_edges_for_endpoint();

CREATE TABLE IF NOT EXISTS graph_scope_revisions (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  graph_revision BIGINT NOT NULL DEFAULT 0 CHECK (graph_revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,workspace_id),
  CONSTRAINT graph_scope_revisions_group_workspace_fkey
    FOREIGN KEY(group_id,workspace_id) REFERENCES workspaces(group_id,workspace_id) ON DELETE CASCADE
);
ALTER TABLE graph_scope_revisions DROP CONSTRAINT IF EXISTS graph_scope_revisions_group_id_workspace_id_fkey;
ALTER TABLE graph_scope_revisions DROP CONSTRAINT IF EXISTS graph_scope_revisions_group_workspace_fkey;
ALTER TABLE graph_scope_revisions ADD CONSTRAINT graph_scope_revisions_group_workspace_fkey
  FOREIGN KEY(group_id,workspace_id) REFERENCES workspaces(group_id,workspace_id) ON DELETE CASCADE;
ALTER TABLE graph_scope_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_scope_revisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS graph_scope_revisions_read_policy ON graph_scope_revisions;
CREATE POLICY graph_scope_revisions_read_policy ON graph_scope_revisions FOR SELECT TO allura_app
  USING(group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true));
REVOKE ALL ON graph_scope_revisions FROM PUBLIC;
REVOKE INSERT,UPDATE,DELETE ON graph_scope_revisions FROM allura_app;
GRANT SELECT ON graph_scope_revisions TO allura_app;

CREATE OR REPLACE FUNCTION public.bump_graph_scope_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_group TEXT; v_workspace TEXT;
BEGIN
  IF TG_OP='UPDATE' AND (OLD.group_id,OLD.workspace_id) IS DISTINCT FROM (NEW.group_id,NEW.workspace_id)
     AND OLD.workspace_id IS NOT NULL THEN
    INSERT INTO public.graph_scope_revisions(group_id,workspace_id,graph_revision,updated_at)
    VALUES(OLD.group_id,OLD.workspace_id,1,clock_timestamp())
    ON CONFLICT(group_id,workspace_id) DO UPDATE
      SET graph_revision=public.graph_scope_revisions.graph_revision+1,updated_at=EXCLUDED.updated_at;
  END IF;
  v_group := CASE WHEN TG_OP='DELETE' THEN OLD.group_id ELSE NEW.group_id END;
  v_workspace := CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
  IF v_workspace IS NOT NULL THEN
    INSERT INTO public.graph_scope_revisions(group_id,workspace_id,graph_revision,updated_at)
    VALUES(v_group,v_workspace,1,clock_timestamp())
    ON CONFLICT(group_id,workspace_id) DO UPDATE
      SET graph_revision=public.graph_scope_revisions.graph_revision+1,updated_at=EXCLUDED.updated_at;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.bump_graph_scope_revision() FROM PUBLIC;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'graph_memories','graph_structural_nodes','graph_structural_edges','graph_supersedes',
    'canonical_proposals','governance_receipts','evidence_requests','governance_receipt_evidence_requests'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS focused_subgraph_revision_trigger ON %I',table_name);
    EXECUTE format('CREATE TRIGGER focused_subgraph_revision_trigger AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.bump_graph_scope_revision()',table_name);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS graph_structural_edges_scope_from_traversal_idx
  ON graph_structural_edges(group_id,workspace_id,from_kind,from_id,rel_type,to_kind,to_id)
  WHERE workspace_scope_state='workspace_scoped' AND endpoint_state='resolved';
CREATE INDEX IF NOT EXISTS graph_structural_edges_scope_to_traversal_idx
  ON graph_structural_edges(group_id,workspace_id,to_kind,to_id,rel_type,from_kind,from_id)
  WHERE workspace_scope_state='workspace_scoped' AND endpoint_state='resolved';
CREATE INDEX IF NOT EXISTS graph_memories_scope_roots_idx
  ON graph_memories(group_id,workspace_id,created_at DESC,id)
  WHERE workspace_scope_state='workspace_scoped' AND deprecated=false AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS graph_supersedes_scope_newer_idx
  ON graph_supersedes(group_id,workspace_id,newer_id,superseded_id);
CREATE INDEX IF NOT EXISTS graph_supersedes_scope_superseded_idx
  ON graph_supersedes(group_id,workspace_id,superseded_id,newer_id);
CREATE INDEX IF NOT EXISTS canonical_proposals_scope_approved_memory_evidence_idx
  ON canonical_proposals(group_id,workspace_id,approved_memory_id)
  WHERE approved_memory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS governance_receipts_scope_evidence_projection_idx
  ON governance_receipts(group_id,workspace_id,proposal_id,occurred_at DESC,id);

INSERT INTO schema_versions(version,applied_at,description)
VALUES('078',now(),'Story 31.2 governed focused-subgraph endpoint integrity, revision ledger, RLS, and indexes')
ON CONFLICT(version) DO NOTHING;

COMMIT;
