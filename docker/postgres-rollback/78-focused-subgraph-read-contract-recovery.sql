BEGIN;

-- Recovery is intentionally guarded. Removing endpoint typing or the revision
-- ledger after V2 data exists would destroy authorization/cursor evidence.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM graph_structural_edges WHERE endpoint_state='resolved') OR
     EXISTS (SELECT 1 FROM graph_scope_revisions WHERE graph_revision > 0) THEN
    RAISE EXCEPTION 'focused-subgraph recovery refused: disable V2, drain continuation TTL, and preserve typed/revision evidence';
  END IF;
  IF EXISTS (SELECT 1 FROM graph_memories GROUP BY id,group_id HAVING count(*)>1) OR
     EXISTS (SELECT 1 FROM graph_structural_nodes GROUP BY node_id,group_id HAVING count(*)>1) OR
     EXISTS (SELECT 1 FROM graph_structural_edges GROUP BY from_id,to_id,rel_type,group_id HAVING count(*)>1) OR
     EXISTS (SELECT 1 FROM graph_supersedes GROUP BY newer_id,superseded_id,group_id HAVING count(*)>1) OR
     EXISTS (SELECT 1 FROM graph_supersedes s
       WHERE NOT EXISTS (SELECT 1 FROM graph_memories m WHERE m.id=s.newer_id AND m.group_id=s.group_id)
          OR NOT EXISTS (SELECT 1 FROM graph_memories m WHERE m.id=s.superseded_id AND m.group_id=s.group_id)) THEN
    RAISE EXCEPTION 'focused-subgraph recovery refused: legacy primary/foreign key restoration is impossible';
  END IF;
END $$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'graph_memories','graph_structural_nodes','graph_structural_edges','graph_supersedes',
    'canonical_proposals','governance_receipts','evidence_requests','governance_receipt_evidence_requests'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS focused_subgraph_revision_trigger ON %I',table_name);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS graph_structural_edges_endpoint_integrity ON graph_structural_edges;
DROP TRIGGER IF EXISTS graph_memories_orphan_edges ON graph_memories;
DROP TRIGGER IF EXISTS graph_structural_nodes_orphan_edges ON graph_structural_nodes;
DROP FUNCTION IF EXISTS public.enforce_focused_subgraph_endpoint_integrity();
DROP FUNCTION IF EXISTS public.orphan_focused_subgraph_edges_for_endpoint();
DROP FUNCTION IF EXISTS public.bump_graph_scope_revision();
DROP TABLE graph_scope_revisions;
ALTER TABLE graph_structural_edges DROP CONSTRAINT graph_structural_edges_endpoint_contract_check;
ALTER TABLE graph_structural_edges DROP COLUMN endpoint_state;
ALTER TABLE graph_structural_edges DROP COLUMN from_kind;
ALTER TABLE graph_structural_edges DROP COLUMN to_kind;
ALTER TABLE graph_memories ADD CONSTRAINT graph_memories_pkey PRIMARY KEY(id,group_id);
ALTER TABLE graph_structural_nodes ADD CONSTRAINT graph_structural_nodes_pkey PRIMARY KEY(node_id,group_id);
ALTER TABLE graph_structural_edges ADD CONSTRAINT graph_structural_edges_pkey PRIMARY KEY(from_id,to_id,rel_type,group_id);
ALTER TABLE graph_supersedes ADD CONSTRAINT graph_supersedes_pkey PRIMARY KEY(newer_id,superseded_id,group_id);
ALTER TABLE graph_supersedes ADD CONSTRAINT graph_supersedes_newer_id_group_id_fkey
  FOREIGN KEY(newer_id,group_id) REFERENCES graph_memories(id,group_id) ON DELETE CASCADE;
ALTER TABLE graph_supersedes ADD CONSTRAINT graph_supersedes_superseded_id_group_id_fkey
  FOREIGN KEY(superseded_id,group_id) REFERENCES graph_memories(id,group_id) ON DELETE CASCADE;
DELETE FROM schema_versions WHERE version='078';

COMMIT;
