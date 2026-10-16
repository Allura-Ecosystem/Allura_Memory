// Catalog evidence is necessary, not proof of live retrieval freshness or every write path.
export const SEMANTIC_SCHEMA_EVIDENCE = `SELECT c.relname AS table_name,
     (c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
     AND has_schema_privilege(current_user,n.oid,'USAGE')
     AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='workspace_id' AND NOT a.attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='workspace_scope_state' AND NOT a.attisdropped)
     AND NOT EXISTS (SELECT 1 FROM unnest(CASE WHEN c.relname='graph_memories'
       THEN ARRAY['id','group_id','content','version','deprecated','deleted_at','restored_at','content_tsv']
       ELSE ARRAY['newer_id','superseded_id','group_id','created_at'] END) required(name)
       WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname=required.name AND NOT a.attisdropped))
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT rolsuper AND NOT rolbypassrls)) AS schema_verified,
     has_table_privilege(current_user,c.oid,'SELECT') AS can_select,
     has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
     has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,
     COALESCE((SELECT jsonb_agg(jsonb_build_object(
       'name',p.polname,'permissive',p.polpermissive,'command',p.polcmd,
       'roles',ARRAY(SELECT CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid)::text END
         FROM unnest(p.polroles) roles(role_oid) ORDER BY role_oid),
       'applicable',EXISTS(SELECT 1 FROM unnest(p.polroles) roles(role_oid)
         WHERE CASE WHEN role_oid=0 THEN true ELSE pg_has_role(current_user,role_oid,'USAGE') END),
       'using_expression',pg_get_expr(p.polqual,p.polrelid),
       'check_expression',pg_get_expr(p.polwithcheck,p.polrelid)
     ) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb) AS policies
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('graph_memories','graph_supersedes')`

// Exact PostgreSQL 16 deparse of the supported TEXT-column policy model shipped
// by migrations 36/40 (columns from 21/40). Do not normalize away literal content
// or accept equivalent-looking arbitrary expressions. Catalog drift needs review.
const TENANT_EXPRESSION = "(group_id = current_setting('app.current_group_id'::text, true))"
const WORKSPACE_EXPRESSION = "((group_id = current_setting('app.current_group_id'::text, true)) AND (workspace_id = current_setting('app.current_workspace_id'::text, true)) AND (workspace_scope_state = 'workspace_scoped'::text))"

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Strict supported catalog evidence, not proof of arbitrary live query semantics. */
export function verifySemanticSchemaEvidence(rows: readonly unknown[]): boolean {
  if (rows.length !== 2) return false
  return ["graph_memories", "graph_supersedes"].every((name) => {
    const table = rows.find((row) => record(row) && row.table_name === name)
    if (!record(table) || table.schema_verified !== true || table.can_select !== true || table.can_insert !== true) return false
    // Memory flags are mutable; lineage edges are append-only. Neither requires DELETE.
    if (name === "graph_memories" && table.can_update !== true) return false
    if (!Array.isArray(table.policies) || table.policies.length !== 2) return false
    const policies: unknown[] = table.policies
    return [
      { name: "tenant_isolation_policy", permissive: true, expression: TENANT_EXPRESSION },
      { name: "workspace_scope_restrictive_policy", permissive: false, expression: WORKSPACE_EXPRESSION },
    ].every((expected) => {
      const policy = policies.find((entry) => record(entry) && entry.name === expected.name)
      return record(policy) && policy.permissive === expected.permissive && policy.command === "*"
        && policy.applicable === true && Array.isArray(policy.roles)
        && policy.roles.length === 1 && policy.roles[0] === "allura_app"
        && policy.using_expression === expected.expression && policy.check_expression === expected.expression
    })
  })
}

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
