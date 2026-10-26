CREATE TABLE allura.proposal_state (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, current_version integer NOT NULL CHECK(current_version>0),
 state text NOT NULL CHECK(state IN ('pending','needs_evidence','approved','rejected')), requester_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,id),
 FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces, FOREIGN KEY(group_id,requester_id) REFERENCES allura.memberships
);
CREATE TABLE allura.proposal_versions (
 group_id text NOT NULL, workspace_id uuid NOT NULL, proposal_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 requester_id uuid NOT NULL, producer_id uuid NOT NULL, summary text NOT NULL CHECK(octet_length(summary) BETWEEN 1 AND 12000),
 confidence double precision NOT NULL CHECK(confidence>=0 AND confidence<=1 AND confidence<>'NaN'::float8),
 confidence_origin text NOT NULL CHECK(confidence_origin IN ('submitter','unscored')),
 assertion_kind text NOT NULL CHECK(assertion_kind IN ('observation','inference')), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,proposal_id,version), FOREIGN KEY(group_id,workspace_id,proposal_id) REFERENCES allura.proposal_state,
 FOREIGN KEY(group_id,requester_id) REFERENCES allura.memberships, FOREIGN KEY(group_id,producer_id) REFERENCES allura.memberships
);
ALTER TABLE allura.proposal_state ADD CONSTRAINT current_proposal_version FOREIGN KEY(group_id,workspace_id,id,current_version) REFERENCES allura.proposal_versions(group_id,workspace_id,proposal_id,version) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE allura.proposal_evidence (
 group_id text NOT NULL, workspace_id uuid NOT NULL, proposal_id uuid NOT NULL, version integer NOT NULL, event_id uuid NOT NULL,
 PRIMARY KEY(group_id,workspace_id,proposal_id,version,event_id),
 FOREIGN KEY(group_id,workspace_id,proposal_id,version) REFERENCES allura.proposal_versions,
 FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events
);
CREATE TABLE allura.proposal_audit (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL, version integer NOT NULL,
 actor_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('pending','needs_evidence','approved','rejected')), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,id), FOREIGN KEY(group_id,workspace_id,proposal_id,version) REFERENCES allura.proposal_versions,
 FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
CREATE FUNCTION allura.additional_action(g text,w uuid,requested text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r jsonb; kind_name text:=current_setting('allura.kind',true);
BEGIN
 IF NOT allura.context_allows(g,w,current_setting('allura.action',true)) THEN RETURN false; END IF;
 r:=allura.resolve_authority(current_setting('allura.issuer',true),current_setting('allura.subject',true),kind_name,current_setting('allura.principal',true),current_setting('allura.credential',true),g,w::text);
 IF kind_name<>'human' AND NOT EXISTS(SELECT FROM allura.machine_credentials WHERE encode(digest,'hex')=current_setting('allura.credential',true) AND requested=ANY(actions)) THEN RETURN false; END IF;
 RETURN allura.role_allows(r->>'role',(r->>'reviewApprove')::boolean,kind_name,requested);
END $$;
CREATE FUNCTION allura.proposal_source(g text,w uuid,e uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT jsonb_build_object('id',v.id,'actorId',v.actor_id,'payload',v.payload,'createdAt',v.created_at) FROM allura.events v
 WHERE v.group_id=g AND v.workspace_id=w AND v.id=e AND v.kind='capture' AND allura.context_allows(g,w,'proposal:write') AND (
 v.actor_id::text=current_setting('allura.principal',true) OR allura.additional_action(g,w,'evidence:read') OR
 (allura.additional_action(g,w,'review:read') AND EXISTS(SELECT FROM allura.proposal_evidence x WHERE x.group_id=g AND x.workspace_id=w AND x.event_id=e)));
$$;
CREATE FUNCTION allura.submit_proposal(g text,w uuid,input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE p uuid:=coalesce((input->>'proposalId')::uuid,gen_random_uuid()); actor uuid:=current_setting('allura.principal',true)::uuid; s allura.proposal_state; v integer; e uuid; requester uuid; ids uuid[];
BEGIN
 IF NOT allura.context_allows(g,w,'proposal:write') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF input ? 'proposalId' THEN
   SELECT * INTO s FROM allura.proposal_state WHERE group_id=g AND workspace_id=w AND id=p FOR UPDATE;
   IF s.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
   IF s.current_version IS DISTINCT FROM (input->>'expectedVersion')::integer OR s.state NOT IN ('pending','needs_evidence') THEN RAISE EXCEPTION 'conflict'; END IF;
   v:=s.current_version+1; requester:=s.requester_id;
 ELSE v:=1;requester:=actor;
 END IF;
 SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(input->'evidenceIds');
 IF cardinality(ids) NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'invalid'; END IF;
 FOREACH e IN ARRAY ids LOOP IF allura.proposal_source(g,w,e) IS NULL THEN RAISE EXCEPTION 'not_found'; END IF; END LOOP;
 IF v=1 THEN INSERT INTO allura.proposal_state(group_id,workspace_id,id,current_version,state,requester_id) VALUES(g,w,p,1,'pending',requester); END IF;
 INSERT INTO allura.proposal_versions(group_id,workspace_id,proposal_id,version,requester_id,producer_id,summary,confidence,confidence_origin,assertion_kind)
 VALUES(g,w,p,v,requester,actor,input->>'summary',coalesce((input->>'confidence')::float8,0),CASE WHEN input ? 'confidence' THEN 'submitter' ELSE 'unscored' END,input->>'assertionKind');
 INSERT INTO allura.proposal_evidence(group_id,workspace_id,proposal_id,version,event_id) SELECT g,w,p,v,unnest(ids);
 UPDATE allura.proposal_state SET current_version=v,state='pending' WHERE group_id=g AND workspace_id=w AND id=p;
 INSERT INTO allura.proposal_audit(group_id,workspace_id,proposal_id,version,actor_id,state) VALUES(g,w,p,v,actor,'pending');
 INSERT INTO allura.events(group_id,workspace_id,actor_id,kind,payload) VALUES(g,w,actor,'proposal',jsonb_build_object('proposalId',p,'version',v,'state','pending'));
 RETURN jsonb_build_object('id',p,'version',v,'state','pending','requesterId',requester,'producerId',actor,'summary',input->>'summary','confidence',coalesce((input->>'confidence')::float8,0),'confidenceOrigin',CASE WHEN input ? 'confidence' THEN 'submitter' ELSE 'unscored' END,'assertionKind',input->>'assertionKind','evidenceIds',ids);
END $$;
CREATE FUNCTION allura.linked_proposal_evidence(g text,w uuid,p uuid,v integer,e uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT jsonb_build_object('id',a.id,'actorId',a.actor_id,'payload',a.payload,'createdAt',a.created_at)
 FROM allura.proposal_evidence l JOIN allura.events a ON a.group_id=l.group_id AND a.workspace_id=l.workspace_id AND a.id=l.event_id
 WHERE l.group_id=g AND l.workspace_id=w AND l.proposal_id=p AND l.version=v AND l.event_id=e AND allura.context_allows(g,w,'review:read');
$$;
ALTER TABLE allura.proposal_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.proposal_state FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.proposal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.proposal_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.proposal_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.proposal_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.proposal_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.proposal_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY proposal_state_read ON allura.proposal_state FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'review:read') OR allura.context_allows(group_id,workspace_id,'review:approve'));
CREATE POLICY proposal_version_read ON allura.proposal_versions FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'review:read') OR allura.context_allows(group_id,workspace_id,'review:approve'));
CREATE POLICY proposal_evidence_read ON allura.proposal_evidence FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'review:read') OR allura.context_allows(group_id,workspace_id,'review:approve'));
CREATE POLICY proposal_audit_read ON allura.proposal_audit FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'audit:read'));
CREATE TRIGGER proposal_version_immutable BEFORE UPDATE OR DELETE ON allura.proposal_versions FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER proposal_version_no_truncate BEFORE TRUNCATE ON allura.proposal_versions FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER proposal_evidence_immutable BEFORE UPDATE OR DELETE ON allura.proposal_evidence FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER proposal_evidence_no_truncate BEFORE TRUNCATE ON allura.proposal_evidence FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER proposal_audit_immutable BEFORE UPDATE OR DELETE ON allura.proposal_audit FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER proposal_audit_no_truncate BEFORE TRUNCATE ON allura.proposal_audit FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.proposal_state,allura.proposal_versions,allura.proposal_evidence,allura.proposal_audit FROM PUBLIC,allura_app;
GRANT SELECT ON allura.proposal_state,allura.proposal_versions,allura.proposal_evidence,allura.proposal_audit TO allura_app;
REVOKE ALL ON FUNCTION allura.additional_action(text,uuid,text),allura.proposal_source(text,uuid,uuid),allura.submit_proposal(text,uuid,jsonb),allura.linked_proposal_evidence(text,uuid,uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.additional_action(text,uuid,text),allura.proposal_source(text,uuid,uuid),allura.submit_proposal(text,uuid,jsonb),allura.linked_proposal_evidence(text,uuid,uuid,integer,uuid) TO allura_app;
