CREATE VIEW allura.memory_projection WITH (security_invoker=true) AS
 SELECT v.group_id,v.workspace_id,v.id,v.knowledge_id,v.version,v.content,v.created_at,h.revision AS head_revision,
 CASE WHEN h.current_version_id=v.id THEN h.lifecycle ELSE 'superseded' END AS lifecycle
 FROM allura.semantic_versions v JOIN allura.semantic_heads h ON h.group_id=v.group_id AND h.workspace_id=v.workspace_id AND h.knowledge_id=v.knowledge_id;
CREATE VIEW allura.semantic_edges WITH (security_invoker=true) AS
 SELECT group_id,workspace_id,newer_id AS from_id,older_id AS to_id,'supersedes'::text AS relation FROM allura.semantic_supersedes
 UNION ALL SELECT group_id,workspace_id,memory_id,canonical_id,'exact_text'::text FROM allura.semantic_equivalences;
REVOKE ALL ON allura.memory_projection,allura.semantic_edges FROM PUBLIC,allura_app;
GRANT SELECT ON allura.memory_projection,allura.semantic_edges TO allura_app;
CREATE FUNCTION allura.graph_evidence(g text,w uuid,ids jsonb) RETURNS TABLE(memory_id uuid,event_id uuid,content text,truncated boolean,created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 IF NOT allura.context_allows(g,w,'memory:read') OR NOT allura.additional_action(g,w,'evidence:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF jsonb_typeof(ids)<>'array' OR jsonb_array_length(ids)>40 THEN RAISE EXCEPTION 'invalid'; END IF;
 RETURN QUERY SELECT p.semantic_version_id,e.id,left(e.payload->>'content',256),length(e.payload->>'content')>256,e.created_at
 FROM allura.semantic_provenance p JOIN allura.semantic_versions v ON v.group_id=p.group_id AND v.workspace_id=p.workspace_id AND v.id=p.semantic_version_id
 JOIN allura.events e ON e.group_id=p.group_id AND e.workspace_id=p.workspace_id AND e.id=p.event_id
 WHERE p.group_id=g AND p.workspace_id=w AND p.semantic_version_id IN(SELECT value::uuid FROM jsonb_array_elements_text(ids))
 ORDER BY e.created_at,e.id,p.semantic_version_id LIMIT 21;
END $$;
REVOKE ALL ON FUNCTION allura.graph_evidence(text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.graph_evidence(text,uuid,jsonb) TO allura_app;
CREATE TABLE allura.read_audit (
 group_id text NOT NULL,workspace_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('get','list','graph','search')),item_count integer NOT NULL CHECK(item_count BETWEEN 0 AND 256),
 history boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(group_id,workspace_id,id),
 FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces,FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
ALTER TABLE allura.read_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.read_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY read_audit_append ON allura.read_audit FOR INSERT TO allura_app WITH CHECK(allura.context_allows(group_id,workspace_id,'memory:read') AND actor_id::text=current_setting('allura.principal',true));
CREATE POLICY read_audit_read ON allura.read_audit FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'audit:read'));
CREATE TRIGGER read_audit_immutable BEFORE UPDATE OR DELETE ON allura.read_audit FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER read_audit_no_truncate BEFORE TRUNCATE ON allura.read_audit FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.read_audit FROM PUBLIC,allura_app;
GRANT SELECT,INSERT ON allura.read_audit TO allura_app;
