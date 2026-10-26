CREATE TABLE allura.correction_targets (
 group_id text NOT NULL, workspace_id uuid NOT NULL, proposal_id uuid NOT NULL, proposal_version integer NOT NULL,
 base_version_id uuid NOT NULL, knowledge_id uuid NOT NULL, expected_base_version integer NOT NULL CHECK(expected_base_version>0),
 rationale text NOT NULL CHECK(octet_length(rationale) BETWEEN 1 AND 4000),
 PRIMARY KEY(group_id,workspace_id,proposal_id,proposal_version),
 FOREIGN KEY(group_id,workspace_id,proposal_id,proposal_version) REFERENCES allura.proposal_versions,
 FOREIGN KEY(group_id,workspace_id,base_version_id,knowledge_id) REFERENCES allura.semantic_versions(group_id,workspace_id,id,knowledge_id)
);
CREATE TABLE allura.correction_receipts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, actor_id uuid NOT NULL, operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'), proposal_id uuid NOT NULL, proposal_version integer NOT NULL, event_id uuid NOT NULL,
 receipt_text text NOT NULL CHECK(octet_length(receipt_text)<=8192), PRIMARY KEY(group_id,workspace_id,id), UNIQUE(group_id,workspace_id,actor_id,operation_key),
 FOREIGN KEY(group_id,workspace_id,proposal_id,proposal_version) REFERENCES allura.proposal_versions, FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events,
 FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
CREATE TABLE allura.semantic_supersedes (
 group_id text NOT NULL, workspace_id uuid NOT NULL, knowledge_id uuid NOT NULL, newer_id uuid NOT NULL, older_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), CHECK(newer_id<>older_id), PRIMARY KEY(group_id,workspace_id,newer_id), UNIQUE(group_id,workspace_id,older_id),
 FOREIGN KEY(group_id,workspace_id,newer_id,knowledge_id) REFERENCES allura.semantic_versions(group_id,workspace_id,id,knowledge_id),
 FOREIGN KEY(group_id,workspace_id,older_id,knowledge_id) REFERENCES allura.semantic_versions(group_id,workspace_id,id,knowledge_id)
);
CREATE FUNCTION allura.correction_edit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 IF NEW.version>1 AND EXISTS(SELECT FROM allura.correction_targets WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id AND proposal_id=NEW.proposal_id) AND current_setting('allura.correction_edit',true) IS DISTINCT FROM NEW.proposal_id::text THEN RAISE EXCEPTION 'conflict'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER correction_edit_guard BEFORE INSERT ON allura.proposal_versions FOR EACH ROW EXECUTE FUNCTION allura.correction_edit_guard();
CREATE FUNCTION allura.submit_correction(g text,w uuid,input jsonb,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid:=current_setting('allura.principal',true)::uuid; existing allura.correction_receipts; base allura.semantic_versions; head allura.semantic_heads;
 proposed jsonb; proposal_input jsonb; event_new uuid:=gen_random_uuid(); receipt_new uuid:=gen_random_uuid(); result text; p uuid; v integer; edit_id uuid:=(input->>'proposalId')::uuid;
BEGIN
 IF NOT allura.context_allows(g,w,'proposal:write') OR NOT allura.additional_action(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,actor,'correction',input->>'operationKey')::text,43001));
 SELECT * INTO existing FROM allura.correction_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=input->>'operationKey';
 IF existing.id IS NOT NULL THEN IF existing.digest<>digest_arg THEN RAISE EXCEPTION 'conflict'; END IF; RETURN existing.receipt_text; END IF;
 IF edit_id IS NOT NULL THEN
   PERFORM 1 FROM allura.proposal_state WHERE group_id=g AND workspace_id=w AND id=edit_id FOR UPDATE;
   IF NOT EXISTS(SELECT FROM allura.correction_targets WHERE group_id=g AND workspace_id=w AND proposal_id=edit_id) THEN RAISE EXCEPTION 'not_found'; END IF;
 END IF;
 SELECT * INTO base FROM allura.semantic_versions WHERE group_id=g AND workspace_id=w AND id=(input->>'baseMemoryId')::uuid;
 IF base.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT * INTO head FROM allura.semantic_heads WHERE group_id=g AND workspace_id=w AND knowledge_id=base.knowledge_id FOR SHARE;
 IF head.current_version_id IS DISTINCT FROM base.id OR head.lifecycle<>'current' OR base.version<>(input->>'expectedBaseVersion')::integer THEN RAISE EXCEPTION 'conflict'; END IF;
 INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(g,w,event_new,actor,'capture',jsonb_build_object('content',input->>'content','rationale',input->>'rationale','baseMemoryId',base.id,'expectedBaseVersion',base.version,'source','correction_submission'));
 proposal_input:=jsonb_build_object('summary',input->>'content','assertionKind','inference','evidenceIds',(input->'evidenceIds')||jsonb_build_array(event_new));
 IF edit_id IS NOT NULL THEN
   proposal_input:=proposal_input||jsonb_build_object('proposalId',edit_id,'expectedVersion',(input->>'expectedProposalVersion')::integer);
   PERFORM set_config('allura.correction_edit',edit_id::text,true);
 END IF;
 proposed:=allura.submit_proposal(g,w,proposal_input);p:=(proposed->>'id')::uuid;v:=(proposed->>'version')::integer;
 PERFORM set_config('allura.correction_edit','',true);
 INSERT INTO allura.correction_targets(group_id,workspace_id,proposal_id,proposal_version,base_version_id,knowledge_id,expected_base_version,rationale) VALUES(g,w,p,v,base.id,base.knowledge_id,base.version,input->>'rationale');
 result:=jsonb_build_object('version','correction-v1','submission_receipt_id',receipt_new,'group_id',g,'workspace_id',w,'actor_id',actor,'proposal_id',p,'proposal_version',v,'base_memory_id',base.id,'expected_base_version',input->>'expectedBaseVersion','status','pending_review','evidence_event_id',event_new,'accepted_at',clock_timestamp())::text;
 INSERT INTO allura.correction_receipts(group_id,workspace_id,id,actor_id,operation_key,digest,proposal_id,proposal_version,event_id,receipt_text) VALUES(g,w,receipt_new,actor,input->>'operationKey',digest_arg,p,v,event_new,result);
 RETURN result;
END $$;
-- Forward replacement preserves original human/replay/stale guards and adds
-- an exact correction-head lock. Accepted migration005 remains immutable.
CREATE OR REPLACE FUNCTION allura.decide_proposal(g text,w uuid,input jsonb,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid:=current_setting('allura.principal',true)::uuid; existing allura.decision_receipts; s allura.proposal_state; p allura.proposal_versions;
 proposal_arg uuid:=(input->>'proposalId')::uuid; reviewed integer:=(input->>'reviewedProposalVersion')::integer; decision_arg text:=input->>'decision';
 receipt_id uuid:=gen_random_uuid(); semantic_id uuid; knowledge uuid; event_id uuid:=gen_random_uuid(); now_at timestamptz:=clock_timestamp(); result text; outcome text; ids uuid[]; source uuid;
 correction allura.correction_targets; head allura.semantic_heads; next_version integer:=1;
BEGIN
 IF current_setting('allura.kind',true)<>'human' OR NOT allura.context_allows(g,w,'review:approve') OR NOT allura.additional_action(g,w,'review:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF digest_arg !~ '^[0-9a-f]{64}$' OR length(coalesce(input->>'rationale',''))=0 OR reviewed<1 OR decision_arg NOT IN ('approve','reject','request_evidence') THEN RAISE EXCEPTION 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,actor,'human_decision',input->>'operationKey')::text,41001));
 SELECT * INTO existing FROM allura.decision_receipts WHERE group_id=g AND workspace_id=w AND reviewer_id=actor AND operation_key=input->>'operationKey';
 IF existing.id IS NOT NULL THEN IF existing.digest<>digest_arg THEN RAISE EXCEPTION 'conflict'; END IF; RETURN existing.receipt_text; END IF;
 SELECT * INTO s FROM allura.proposal_state WHERE group_id=g AND workspace_id=w AND id=proposal_arg FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF s.current_version<>reviewed OR s.state NOT IN ('pending','needs_evidence') THEN RAISE EXCEPTION 'conflict'; END IF;
 SELECT * INTO p FROM allura.proposal_versions WHERE group_id=g AND workspace_id=w AND proposal_id=proposal_arg AND version=reviewed;
 IF actor IN (p.requester_id,p.producer_id) OR EXISTS(SELECT FROM allura.proposal_evidence l JOIN allura.events e ON e.group_id=l.group_id AND e.workspace_id=l.workspace_id AND e.id=l.event_id WHERE l.group_id=g AND l.workspace_id=w AND l.proposal_id=proposal_arg AND l.version=reviewed AND e.actor_id=actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT array_agg(value::uuid ORDER BY value) INTO ids FROM jsonb_array_elements_text(input->'evidenceIds');
 IF cardinality(ids) NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'invalid'; END IF;
 FOREACH source IN ARRAY ids LOOP IF NOT EXISTS(SELECT FROM allura.proposal_evidence l WHERE l.group_id=g AND l.workspace_id=w AND l.proposal_id=proposal_arg AND l.version=reviewed AND l.event_id=source) THEN RAISE EXCEPTION 'not_found'; END IF; END LOOP;
 outcome:=CASE decision_arg WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'needs_evidence' END;
 IF decision_arg='approve' THEN
   SELECT * INTO correction FROM allura.correction_targets WHERE group_id=g AND workspace_id=w AND proposal_id=proposal_arg AND proposal_version=reviewed;
   IF correction.proposal_id IS NOT NULL THEN
     SELECT * INTO head FROM allura.semantic_heads WHERE group_id=g AND workspace_id=w AND knowledge_id=correction.knowledge_id FOR UPDATE;
     IF head.current_version_id IS DISTINCT FROM correction.base_version_id OR head.lifecycle<>'current' THEN RAISE EXCEPTION 'conflict'; END IF;
     knowledge:=correction.knowledge_id;next_version:=correction.expected_base_version+1;
   ELSE knowledge:=gen_random_uuid(); END IF;
   semantic_id:=gen_random_uuid();
   INSERT INTO allura.semantic_versions(group_id,workspace_id,id,knowledge_id,version,content,proposal_id,proposal_version,decision_id,created_at) VALUES(g,w,semantic_id,knowledge,next_version,p.summary,proposal_arg,reviewed,receipt_id,now_at);
   IF correction.proposal_id IS NOT NULL THEN
     INSERT INTO allura.semantic_supersedes(group_id,workspace_id,knowledge_id,newer_id,older_id) VALUES(g,w,knowledge,semantic_id,correction.base_version_id);
     UPDATE allura.semantic_heads SET current_version_id=semantic_id,revision=revision+1 WHERE group_id=g AND workspace_id=w AND knowledge_id=knowledge;
   ELSE INSERT INTO allura.semantic_heads(group_id,workspace_id,knowledge_id,current_version_id,lifecycle) VALUES(g,w,knowledge,semantic_id,'current'); END IF;
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
ALTER TABLE allura.correction_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.correction_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.correction_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.correction_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_supersedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_supersedes FORCE ROW LEVEL SECURITY;
CREATE POLICY correction_target_read ON allura.correction_targets FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'review:read'));
CREATE POLICY correction_receipt_read ON allura.correction_receipts FOR SELECT TO allura_app USING(actor_id::text=current_setting('allura.principal',true) AND (allura.context_allows(group_id,workspace_id,'proposal:write') OR allura.context_allows(group_id,workspace_id,'review:read')));
CREATE POLICY supersedes_read ON allura.semantic_supersedes FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'memory:read'));
CREATE TRIGGER correction_targets_immutable BEFORE UPDATE OR DELETE ON allura.correction_targets FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER correction_targets_no_truncate BEFORE TRUNCATE ON allura.correction_targets FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER correction_receipt_immutable BEFORE UPDATE OR DELETE ON allura.correction_receipts FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER correction_receipt_no_truncate BEFORE TRUNCATE ON allura.correction_receipts FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER supersedes_immutable BEFORE UPDATE OR DELETE ON allura.semantic_supersedes FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER supersedes_no_truncate BEFORE TRUNCATE ON allura.semantic_supersedes FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.correction_targets,allura.correction_receipts,allura.semantic_supersedes FROM PUBLIC,allura_app;
GRANT SELECT ON allura.correction_targets,allura.correction_receipts,allura.semantic_supersedes TO allura_app;
REVOKE ALL ON FUNCTION allura.correction_edit_guard(),allura.submit_correction(text,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.submit_correction(text,uuid,jsonb,text) TO allura_app;
CREATE FUNCTION allura.correction_context(g text,w uuid,p uuid,v integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT jsonb_build_object('baseMemoryId',b.id,'expectedBaseVersion',c.expected_base_version::text,'knowledgeId',b.knowledge_id,'baseContent',b.content,'rationale',c.rationale,'currentHeadId',h.current_version_id)
 FROM allura.correction_targets c JOIN allura.semantic_versions b ON b.group_id=c.group_id AND b.workspace_id=c.workspace_id AND b.id=c.base_version_id
 JOIN allura.semantic_heads h ON h.group_id=b.group_id AND h.workspace_id=b.workspace_id AND h.knowledge_id=b.knowledge_id
 WHERE c.group_id=g AND c.workspace_id=w AND c.proposal_id=p AND c.proposal_version=v AND allura.context_allows(g,w,'review:read') AND allura.additional_action(g,w,'memory:read');
$$;
REVOKE ALL ON FUNCTION allura.correction_context(text,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.correction_context(text,uuid,uuid,integer) TO allura_app;
