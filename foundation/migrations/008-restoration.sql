-- DOC-03: restoration appends a fresh reviewed version; never undo lineage.
CREATE TABLE allura.restoration_targets (
 group_id text NOT NULL, workspace_id uuid NOT NULL, proposal_id uuid NOT NULL, proposal_version integer NOT NULL,
 source_version_id uuid NOT NULL, knowledge_id uuid NOT NULL, expected_head_revision integer NOT NULL CHECK(expected_head_revision>0),
 PRIMARY KEY(group_id,workspace_id,proposal_id,proposal_version),
 FOREIGN KEY(group_id,workspace_id,proposal_id,proposal_version) REFERENCES allura.correction_targets,
 FOREIGN KEY(group_id,workspace_id,source_version_id,knowledge_id) REFERENCES allura.semantic_versions(group_id,workspace_id,id,knowledge_id)
);
CREATE TABLE allura.restoration_receipts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, actor_id uuid NOT NULL,
 operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'), digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 proposal_id uuid NOT NULL, proposal_version integer NOT NULL, event_id uuid NOT NULL, receipt_text text NOT NULL CHECK(octet_length(receipt_text)<=8192),
 PRIMARY KEY(group_id,workspace_id,id), UNIQUE(group_id,workspace_id,actor_id,operation_key),
 FOREIGN KEY(group_id,workspace_id,proposal_id,proposal_version) REFERENCES allura.restoration_targets,
 FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events, FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
CREATE FUNCTION allura.restoration_edit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 IF NEW.version>1 AND EXISTS(SELECT FROM allura.restoration_targets WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id AND proposal_id=NEW.proposal_id) THEN RAISE EXCEPTION 'conflict'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER restoration_edit_guard BEFORE INSERT ON allura.proposal_versions FOR EACH ROW EXECUTE FUNCTION allura.restoration_edit_guard();
CREATE FUNCTION allura.submit_restoration(g text,w uuid,input jsonb,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid:=current_setting('allura.principal',true)::uuid; existing allura.restoration_receipts; source allura.semantic_versions; base allura.semantic_versions; head allura.semantic_heads;
 event_new uuid:=gen_random_uuid(); receipt_new uuid:=gen_random_uuid(); proposed jsonb; p uuid; result text;
BEGIN
 IF NOT allura.context_allows(g,w,'proposal:write') OR NOT allura.additional_action(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,actor,'restoration',input->>'operationKey')::text,44003));
 SELECT * INTO existing FROM allura.restoration_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=input->>'operationKey';
 IF existing.id IS NOT NULL THEN IF existing.digest<>digest_arg THEN RAISE EXCEPTION 'conflict'; END IF; RETURN existing.receipt_text; END IF;
 SELECT * INTO source FROM allura.semantic_versions WHERE group_id=g AND workspace_id=w AND id=(input->>'sourceMemoryId')::uuid;
 IF source.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT * INTO head FROM allura.semantic_heads WHERE group_id=g AND workspace_id=w AND knowledge_id=source.knowledge_id FOR SHARE;
 IF head.lifecycle<>'deprecated' OR head.current_version_id IS DISTINCT FROM (input->>'expectedHeadId')::uuid OR head.revision IS DISTINCT FROM (input->>'expectedHeadRevision')::integer THEN RAISE EXCEPTION 'conflict'; END IF;
 SELECT * INTO base FROM allura.semantic_versions WHERE group_id=g AND workspace_id=w AND id=head.current_version_id;
 INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(g,w,event_new,actor,'capture',jsonb_build_object('content',source.content,'rationale',input->>'rationale','sourceMemoryId',source.id,'expectedHeadId',base.id,'expectedHeadRevision',head.revision,'source','restoration_submission'));
 proposed:=allura.submit_proposal(g,w,jsonb_build_object('summary',source.content,'assertionKind','observation','evidenceIds',(input->'evidenceIds')||jsonb_build_array(event_new)));p:=(proposed->>'id')::uuid;
 INSERT INTO allura.correction_targets(group_id,workspace_id,proposal_id,proposal_version,base_version_id,knowledge_id,expected_base_version,rationale) VALUES(g,w,p,1,base.id,base.knowledge_id,base.version,input->>'rationale');
 INSERT INTO allura.restoration_targets(group_id,workspace_id,proposal_id,proposal_version,source_version_id,knowledge_id,expected_head_revision) VALUES(g,w,p,1,source.id,source.knowledge_id,head.revision);
 result:=jsonb_build_object('version','restoration-v1','submission_receipt_id',receipt_new,'group_id',g,'workspace_id',w,'actor_id',actor,'proposal_id',p,'proposal_version',1,'source_memory_id',source.id,'expected_head_id',head.current_version_id,'expected_head_revision',head.revision,'status','pending_review','evidence_event_id',event_new,'accepted_at',clock_timestamp())::text;
 INSERT INTO allura.restoration_receipts(group_id,workspace_id,id,actor_id,operation_key,digest,proposal_id,proposal_version,event_id,receipt_text) VALUES(g,w,receipt_new,actor,input->>'operationKey',digest_arg,p,1,event_new,result);
 RETURN result;
END $$;
-- Forward replacement retains all original authorization/replay/atomicity guards.
CREATE OR REPLACE FUNCTION allura.decide_proposal(g text,w uuid,input jsonb,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid:=current_setting('allura.principal',true)::uuid; existing allura.decision_receipts; s allura.proposal_state; p allura.proposal_versions;
 proposal_arg uuid:=(input->>'proposalId')::uuid; reviewed integer:=(input->>'reviewedProposalVersion')::integer; decision_arg text:=input->>'decision';
 receipt_id uuid:=gen_random_uuid(); semantic_id uuid; knowledge uuid; event_id uuid:=gen_random_uuid(); now_at timestamptz:=clock_timestamp(); result text; outcome text; ids uuid[]; source uuid;
 correction allura.correction_targets; head allura.semantic_heads; next_version integer:=1; restoration allura.restoration_targets;
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
     SELECT * INTO restoration FROM allura.restoration_targets WHERE group_id=g AND workspace_id=w AND proposal_id=proposal_arg AND proposal_version=reviewed;
     IF head.current_version_id IS DISTINCT FROM correction.base_version_id THEN RAISE EXCEPTION 'conflict'; END IF;
     IF restoration.proposal_id IS NOT NULL THEN
       IF NOT allura.additional_action(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
       IF head.lifecycle<>'deprecated' OR head.revision<>restoration.expected_head_revision THEN RAISE EXCEPTION 'conflict'; END IF;
       IF EXISTS(SELECT FROM allura.semantic_versions v JOIN allura.proposal_versions q ON q.group_id=v.group_id AND q.workspace_id=v.workspace_id AND q.proposal_id=v.proposal_id AND q.version=v.proposal_version WHERE v.group_id=g AND v.workspace_id=w AND v.id=restoration.source_version_id AND actor IN(q.requester_id,q.producer_id))
         OR EXISTS(SELECT FROM allura.semantic_provenance sp JOIN allura.events e ON e.group_id=sp.group_id AND e.workspace_id=sp.workspace_id AND e.id=sp.event_id WHERE sp.group_id=g AND sp.workspace_id=w AND sp.semantic_version_id=restoration.source_version_id AND e.actor_id=actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
     ELSIF head.lifecycle<>'current' THEN RAISE EXCEPTION 'conflict'; END IF;
     knowledge:=correction.knowledge_id;next_version:=correction.expected_base_version+1;
   ELSE knowledge:=gen_random_uuid(); END IF;
   semantic_id:=gen_random_uuid();
   INSERT INTO allura.semantic_versions(group_id,workspace_id,id,knowledge_id,version,content,proposal_id,proposal_version,decision_id,created_at) VALUES(g,w,semantic_id,knowledge,next_version,p.summary,proposal_arg,reviewed,receipt_id,now_at);
   IF correction.proposal_id IS NOT NULL THEN
     INSERT INTO allura.semantic_supersedes(group_id,workspace_id,knowledge_id,newer_id,older_id) VALUES(g,w,knowledge,semantic_id,correction.base_version_id);
     UPDATE allura.semantic_heads SET current_version_id=semantic_id,lifecycle='current',revision=revision+1 WHERE group_id=g AND workspace_id=w AND knowledge_id=knowledge;
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
CREATE OR REPLACE FUNCTION allura.correction_context(g text,w uuid,p uuid,v integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT jsonb_build_object('baseMemoryId',b.id,'expectedBaseVersion',c.expected_base_version::text,'knowledgeId',b.knowledge_id,'baseContent',b.content,'rationale',c.rationale,'currentHeadId',h.current_version_id,'headLifecycle',h.lifecycle,'headRevision',h.revision,
 'restoration',CASE WHEN r.proposal_id IS NOT NULL THEN jsonb_build_object('sourceMemoryId',r.source_version_id,'expectedHeadRevision',r.expected_head_revision) ELSE NULL END)
 FROM allura.correction_targets c JOIN allura.semantic_versions b ON b.group_id=c.group_id AND b.workspace_id=c.workspace_id AND b.id=c.base_version_id
 JOIN allura.semantic_heads h ON h.group_id=b.group_id AND h.workspace_id=b.workspace_id AND h.knowledge_id=b.knowledge_id
 LEFT JOIN allura.restoration_targets r ON r.group_id=c.group_id AND r.workspace_id=c.workspace_id AND r.proposal_id=c.proposal_id AND r.proposal_version=c.proposal_version
 WHERE c.group_id=g AND c.workspace_id=w AND c.proposal_id=p AND c.proposal_version=v AND allura.context_allows(g,w,'review:read') AND allura.additional_action(g,w,'memory:read');
$$;
ALTER TABLE allura.restoration_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.restoration_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.restoration_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.restoration_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY restoration_target_read ON allura.restoration_targets FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'review:read'));
CREATE POLICY restoration_receipt_read ON allura.restoration_receipts FOR SELECT TO allura_app USING(actor_id::text=current_setting('allura.principal',true) AND allura.context_allows(group_id,workspace_id,'proposal:write'));
CREATE TRIGGER restoration_target_immutable BEFORE UPDATE OR DELETE ON allura.restoration_targets FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER restoration_target_no_truncate BEFORE TRUNCATE ON allura.restoration_targets FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER restoration_receipt_immutable BEFORE UPDATE OR DELETE ON allura.restoration_receipts FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER restoration_receipt_no_truncate BEFORE TRUNCATE ON allura.restoration_receipts FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.restoration_targets,allura.restoration_receipts FROM PUBLIC,allura_app;
GRANT SELECT ON allura.restoration_targets,allura.restoration_receipts TO allura_app;
REVOKE ALL ON FUNCTION allura.restoration_edit_guard(),allura.submit_restoration(text,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.submit_restoration(text,uuid,jsonb,text) TO allura_app;
