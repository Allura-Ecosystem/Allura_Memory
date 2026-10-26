CREATE TABLE allura.semantic_versions (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, knowledge_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 content text NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 12000), proposal_id uuid NOT NULL, proposal_version integer NOT NULL, decision_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,id), UNIQUE(group_id,workspace_id,knowledge_id,version),
 UNIQUE(group_id,workspace_id,id,knowledge_id), UNIQUE(group_id,workspace_id,id,decision_id),
 FOREIGN KEY(group_id,workspace_id,proposal_id,proposal_version) REFERENCES allura.proposal_versions
);
CREATE TABLE allura.semantic_heads (
 group_id text NOT NULL, workspace_id uuid NOT NULL, knowledge_id uuid NOT NULL, current_version_id uuid NOT NULL,
 lifecycle text NOT NULL CHECK(lifecycle IN ('current','deprecated')), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 PRIMARY KEY(group_id,workspace_id,knowledge_id), FOREIGN KEY(group_id,workspace_id,current_version_id,knowledge_id) REFERENCES allura.semantic_versions(group_id,workspace_id,id,knowledge_id)
);
CREATE TABLE allura.decision_receipts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, reviewer_id uuid NOT NULL,
 operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'), digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 proposal_id uuid NOT NULL, proposal_version integer NOT NULL, decision text NOT NULL CHECK(decision IN ('approve','reject','request_evidence')),
 semantic_version_id uuid, event_id uuid NOT NULL, receipt_text text NOT NULL CHECK(octet_length(receipt_text)<=16384), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,id), UNIQUE(group_id,workspace_id,reviewer_id,operation_key),
 FOREIGN KEY(group_id,reviewer_id) REFERENCES allura.memberships,
 FOREIGN KEY(group_id,workspace_id,proposal_id,proposal_version) REFERENCES allura.proposal_versions,
 FOREIGN KEY(group_id,workspace_id,semantic_version_id) REFERENCES allura.semantic_versions,
 FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE allura.semantic_versions ADD CONSTRAINT semantic_decision FOREIGN KEY(group_id,workspace_id,decision_id) REFERENCES allura.decision_receipts DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE allura.semantic_provenance (
 group_id text NOT NULL, workspace_id uuid NOT NULL, semantic_version_id uuid NOT NULL, proposal_id uuid NOT NULL, proposal_version integer NOT NULL, event_id uuid NOT NULL,
 PRIMARY KEY(group_id,workspace_id,semantic_version_id,event_id), FOREIGN KEY(group_id,workspace_id,semantic_version_id) REFERENCES allura.semantic_versions,
 FOREIGN KEY(group_id,workspace_id,proposal_id,proposal_version,event_id) REFERENCES allura.proposal_evidence
);
CREATE TABLE allura.semantic_intents (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, semantic_version_id uuid NOT NULL, decision_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind='canonical_memory_promoted'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,id), UNIQUE(group_id,workspace_id,semantic_version_id),
 FOREIGN KEY(group_id,workspace_id,semantic_version_id,decision_id) REFERENCES allura.semantic_versions(group_id,workspace_id,id,decision_id)
);
CREATE FUNCTION allura.decide_proposal(g text,w uuid,input jsonb,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid:=current_setting('allura.principal',true)::uuid; existing allura.decision_receipts; s allura.proposal_state; p allura.proposal_versions;
 proposal_arg uuid:=(input->>'proposalId')::uuid; reviewed integer:=(input->>'reviewedProposalVersion')::integer; decision_arg text:=input->>'decision';
 receipt_id uuid:=gen_random_uuid(); semantic_id uuid; knowledge uuid; event_id uuid:=gen_random_uuid(); now_at timestamptz:=clock_timestamp(); result text; outcome text; ids uuid[]; source uuid;
BEGIN
 IF current_setting('allura.kind',true)<>'human' OR NOT allura.context_allows(g,w,'review:approve') OR NOT allura.additional_action(g,w,'review:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF digest_arg !~ '^[0-9a-f]{64}$' OR length(coalesce(input->>'rationale',''))=0 OR reviewed<1 OR decision_arg NOT IN ('approve','reject','request_evidence') THEN RAISE EXCEPTION 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,actor,'human_decision',input->>'operationKey')::text,41001));
 SELECT * INTO existing FROM allura.decision_receipts WHERE group_id=g AND workspace_id=w AND reviewer_id=actor AND operation_key=input->>'operationKey';
 IF existing.id IS NOT NULL THEN
   IF existing.digest<>digest_arg THEN RAISE EXCEPTION 'conflict'; END IF;
   RETURN existing.receipt_text;
 END IF;
 SELECT * INTO s FROM allura.proposal_state WHERE group_id=g AND workspace_id=w AND id=proposal_arg FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF s.current_version<>reviewed OR s.state NOT IN ('pending','needs_evidence') THEN RAISE EXCEPTION 'conflict'; END IF;
 SELECT * INTO p FROM allura.proposal_versions WHERE group_id=g AND workspace_id=w AND proposal_id=proposal_arg AND version=reviewed;
 IF actor IN (p.requester_id,p.producer_id) OR EXISTS(SELECT FROM allura.proposal_evidence l JOIN allura.events e ON e.group_id=l.group_id AND e.workspace_id=l.workspace_id AND e.id=l.event_id WHERE l.group_id=g AND l.workspace_id=w AND l.proposal_id=proposal_arg AND l.version=reviewed AND e.actor_id=actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT array_agg(value::uuid ORDER BY value) INTO ids FROM jsonb_array_elements_text(input->'evidenceIds');
 IF cardinality(ids) NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'invalid'; END IF;
 FOREACH source IN ARRAY ids LOOP
   IF NOT EXISTS(SELECT FROM allura.proposal_evidence l WHERE l.group_id=g AND l.workspace_id=w AND l.proposal_id=proposal_arg AND l.version=reviewed AND l.event_id=source) THEN RAISE EXCEPTION 'not_found'; END IF;
 END LOOP;
 outcome:=CASE decision_arg WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'needs_evidence' END;
 IF decision_arg='approve' THEN
   semantic_id:=gen_random_uuid();knowledge:=gen_random_uuid();
   INSERT INTO allura.semantic_versions(group_id,workspace_id,id,knowledge_id,version,content,proposal_id,proposal_version,decision_id,created_at) VALUES(g,w,semantic_id,knowledge,1,p.summary,proposal_arg,reviewed,receipt_id,now_at);
   INSERT INTO allura.semantic_heads(group_id,workspace_id,knowledge_id,current_version_id,lifecycle) VALUES(g,w,knowledge,semantic_id,'current');
   INSERT INTO allura.semantic_provenance(group_id,workspace_id,semantic_version_id,proposal_id,proposal_version,event_id) SELECT g,w,semantic_id,proposal_arg,reviewed,l.event_id FROM allura.proposal_evidence l WHERE l.group_id=g AND l.workspace_id=w AND l.proposal_id=proposal_arg AND l.version=reviewed;
 END IF;
 result:=jsonb_build_object('version','decision-v1','receipt_id',receipt_id,'group_id',g,'workspace_id',w,'reviewer_id',actor,'proposal_id',proposal_arg,'reviewed_proposal_version',reviewed,'requester_id',p.requester_id,'producer_id',p.producer_id,'decision',decision_arg,'rationale',input->>'rationale','evidence_ids',ids,'outcome',outcome,'semantic_version_id',semantic_id,'knowledge_id',knowledge,'event_id',event_id,'accepted_at',now_at,'policy_version','human-review-v1','delivery','not_requested')::text;
 INSERT INTO allura.decision_receipts(group_id,workspace_id,id,reviewer_id,operation_key,digest,proposal_id,proposal_version,decision,semantic_version_id,event_id,receipt_text,created_at) VALUES(g,w,receipt_id,actor,input->>'operationKey',digest_arg,proposal_arg,reviewed,decision_arg,semantic_id,event_id,result,now_at);
 INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload,created_at) VALUES(g,w,event_id,actor,'decision',jsonb_build_object('receiptId',receipt_id,'proposalId',proposal_arg,'reviewedProposalVersion',reviewed,'decision',decision_arg,'outcome',outcome),now_at);
 UPDATE allura.proposal_state SET state=outcome WHERE group_id=g AND workspace_id=w AND id=proposal_arg;
 INSERT INTO allura.proposal_audit(group_id,workspace_id,proposal_id,version,actor_id,state) VALUES(g,w,proposal_arg,reviewed,actor,outcome);
 IF semantic_id IS NOT NULL THEN INSERT INTO allura.semantic_intents(group_id,workspace_id,id,semantic_version_id,decision_id,kind) VALUES(g,w,gen_random_uuid(),semantic_id,receipt_id,'canonical_memory_promoted'); END IF;
 RETURN result;
END $$;
ALTER TABLE allura.semantic_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_heads FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_provenance FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.decision_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.decision_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY semantic_read ON allura.semantic_versions FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'memory:read'));
CREATE POLICY semantic_head_read ON allura.semantic_heads FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'memory:read'));
CREATE POLICY semantic_provenance_read ON allura.semantic_provenance FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'review:read') OR allura.context_allows(group_id,workspace_id,'audit:read'));
CREATE POLICY decision_receipt_read ON allura.decision_receipts FOR SELECT TO allura_app USING((reviewer_id::text=current_setting('allura.principal',true) AND allura.context_allows(group_id,workspace_id,'review:approve')) OR allura.context_allows(group_id,workspace_id,'audit:read'));
CREATE POLICY semantic_intent_read ON allura.semantic_intents FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'health:read'));
CREATE TRIGGER semantic_version_immutable BEFORE UPDATE OR DELETE ON allura.semantic_versions FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER semantic_version_no_truncate BEFORE TRUNCATE ON allura.semantic_versions FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER semantic_provenance_immutable BEFORE UPDATE OR DELETE ON allura.semantic_provenance FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER semantic_provenance_no_truncate BEFORE TRUNCATE ON allura.semantic_provenance FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER decision_receipt_immutable BEFORE UPDATE OR DELETE ON allura.decision_receipts FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER decision_receipt_no_truncate BEFORE TRUNCATE ON allura.decision_receipts FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER semantic_intent_immutable BEFORE UPDATE OR DELETE ON allura.semantic_intents FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER semantic_intent_no_truncate BEFORE TRUNCATE ON allura.semantic_intents FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.semantic_versions,allura.semantic_heads,allura.semantic_provenance,allura.decision_receipts,allura.semantic_intents FROM PUBLIC,allura_app;
GRANT SELECT ON allura.semantic_versions,allura.semantic_heads,allura.semantic_provenance,allura.decision_receipts,allura.semantic_intents TO allura_app;
REVOKE ALL ON FUNCTION allura.decide_proposal(text,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.decide_proposal(text,uuid,jsonb,text) TO allura_app;
