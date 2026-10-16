// Catalog evidence is necessary, not proof of live retrieval freshness or every write path.
export const SEMANTIC_SCHEMA_EVIDENCE = `SELECT
  (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('graph_memories','graph_supersedes')
     AND c.relrowsecurity AND c.relforcerowsecurity
     AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='workspace_id' AND NOT a.attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='workspace_scope_state' AND NOT a.attisdropped)
     AND NOT EXISTS (SELECT 1 FROM unnest(CASE WHEN c.relname='graph_memories'
       THEN ARRAY['id','group_id','content','version','deprecated','deleted_at','restored_at','content_tsv']
       ELSE ARRAY['newer_id','superseded_id','group_id','created_at'] END) required(name)
       WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname=required.name AND NOT a.attisdropped))
     AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive))
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT rolsuper AND NOT rolbypassrls)
  AS verified`

export const LEDGER_EVIDENCE = `SELECT EXISTS (
  SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE t.tgrelid='public.events'::regclass AND t.tgname='events_immutable_trigger'
    AND t.tgenabled IN ('O','A') AND (t.tgtype & 24)=24
    AND n.nspname='app' AND p.proname='reject_events_mutation' AND NOT p.prosecdef
) AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT rolsuper AND NOT rolbypassrls)
  AND current_setting('session_replication_role')='origin' AS verified`

export const LINEAGE_VIOLATIONS = `SELECT COUNT(*) AS count FROM (
  SELECT s.newer_id FROM graph_supersedes s
  LEFT JOIN graph_memories newer ON newer.id=s.newer_id AND newer.group_id=s.group_id AND newer.workspace_id=s.workspace_id
  LEFT JOIN graph_memories older ON older.id=s.superseded_id AND older.group_id=s.group_id AND older.workspace_id=s.workspace_id
  WHERE s.group_id=$1 AND (newer.id IS NULL OR older.id IS NULL OR newer.version<>older.version+1
    OR s.newer_id=s.superseded_id OR s.workspace_scope_state<>'workspace_scoped')
  UNION ALL
  SELECT m.id FROM graph_memories m WHERE m.group_id=$1 AND m.version>1
    AND NOT EXISTS (SELECT 1 FROM graph_supersedes s WHERE s.newer_id=m.id
      AND s.group_id=m.group_id AND s.workspace_id=m.workspace_id)
) invalid_lineage`

export const APPROVAL_VIOLATIONS = `SELECT COUNT(*) AS count FROM graph_memories m
 WHERE m.group_id=$1 AND m.version=1 AND NOT EXISTS (
   SELECT 1 FROM canonical_proposals p JOIN governance_receipts r ON r.proposal_id=p.id
     AND r.group_id=p.group_id AND r.workspace_id=p.workspace_id
   WHERE p.group_id=m.group_id AND p.workspace_id=m.workspace_id AND p.approved_memory_id=m.id
     AND p.status='approved' AND p.content=m.content AND p.decided_by IS NOT NULL
     AND r.action='approve' AND r.memory_id=m.id AND r.actor_id=p.decided_by AND r.actor_role IN ('admin','curator')
     AND EXISTS (SELECT 1 FROM events e WHERE e.group_id=p.group_id AND e.workspace_id=p.workspace_id
       AND e.event_type='proposal_approved' AND e.metadata->>'proposal_id'=p.id::text)
 )`
