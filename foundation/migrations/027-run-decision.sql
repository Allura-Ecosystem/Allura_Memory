-- Additive approval-capable revision3; immutable revisions1/2 stay historical.
ALTER TABLE allura.run_state DROP CONSTRAINT run_state_check;
ALTER TABLE allura.run_state ADD CHECK((
 (phase='ready' AND outcome IS NULL AND reason='none' AND next_step_id IN ('prepare','handoff')) OR
 (phase='running' AND outcome IS NULL AND reason='none' AND next_step_id='prepare') OR
 (phase='paused_approval' AND outcome IS NULL AND reason='approval_required' AND next_step_id='review') OR
 (phase='blocked' AND outcome IS NULL AND reason='definition_drift' AND next_step_id='prepare') OR
 (phase='terminal' AND outcome='failed' AND reason IN ('gate_failed','attempts_exhausted','deadline') AND next_step_id IS NULL) OR
 (phase='terminal' AND outcome='partial' AND reason='approval_rejected' AND next_step_id IS NULL)) IS TRUE);
ALTER TABLE allura.run_operation_receipts DROP CONSTRAINT run_operation_receipts_command_check;
ALTER TABLE allura.run_operation_receipts ADD CHECK(command IN ('start','advance','decide'));
ALTER TABLE allura.run_journal DROP CONSTRAINT run_journal_kind_check, DROP CONSTRAINT run_journal_reason_check;
ALTER TABLE allura.run_journal ADD CHECK(kind IN ('started','claimed','effect_committed','approval_requested','blocked','terminated','approval_decided')),
 ADD CHECK(reason IN ('none','approval_required','definition_drift','gate_failed','attempts_exhausted','deadline','approval_rejected'));

CREATE TABLE allura.run_approval_decisions (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, run_id uuid NOT NULL,
 request_id uuid NOT NULL, reviewer_id uuid NOT NULL, reviewed_evidence_digest text NOT NULL CHECK(reviewed_evidence_digest ~ '^[0-9a-f]{64}$'),
 decision text NOT NULL CHECK(decision IN ('approve','reject')), rationale text NOT NULL CHECK(octet_length(rationale) BETWEEN 1 AND 1000 AND rationale ~ '[^[:space:]]'),
 decision_text text NOT NULL, journal_seq integer NOT NULL CHECK(journal_seq BETWEEN 1 AND 128), created_at timestamptz NOT NULL,
 PRIMARY KEY(group_id,workspace_id,id), UNIQUE(group_id,workspace_id,id,run_id), UNIQUE(group_id,workspace_id,request_id),
 FOREIGN KEY(group_id,workspace_id,run_id) REFERENCES allura.run_records,
 FOREIGN KEY(group_id,workspace_id,request_id,run_id) REFERENCES allura.run_approval_requests(group_id,workspace_id,id,run_id),
 FOREIGN KEY(group_id,reviewer_id) REFERENCES allura.memberships,
 FOREIGN KEY(group_id,workspace_id,run_id,journal_seq) REFERENCES allura.run_journal DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE allura.run_approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.run_approval_decisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON allura.run_approval_decisions FROM PUBLIC,allura_app;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON allura.run_approval_decisions FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON allura.run_approval_decisions FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
ALTER TABLE allura.run_journal ADD COLUMN approval_decision_id uuid;
ALTER TABLE allura.run_journal ADD FOREIGN KEY(group_id,workspace_id,approval_decision_id,run_id) REFERENCES allura.run_approval_decisions(group_id,workspace_id,id,run_id) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION allura.lock_run_decision_participants(g text,w uuid,r uuid) RETURNS allura.run_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE original allura.run_records; p uuid;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'workspace:grants:manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO original FROM allura.run_records WHERE group_id=g AND workspace_id=w AND id=r;
 IF original.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF original.reviewer_id<>current_setting('allura.principal')::uuid OR original.owner_id=original.reviewer_id THEN RAISE EXCEPTION 'forbidden'; END IF;
 FOR p IN SELECT x FROM unnest(ARRAY[original.owner_id,original.reviewer_id]) x ORDER BY x LOOP
  PERFORM 1 FROM allura.principals WHERE id=p FOR SHARE;
  PERFORM 1 FROM allura.identity_bindings WHERE principal_id=p ORDER BY issuer,subject,identity_kind FOR SHARE;
  PERFORM 1 FROM allura.memberships WHERE group_id=g AND principal_id=p FOR SHARE;
  PERFORM 1 FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=p FOR SHARE;
 END LOOP;
 PERFORM 1 FROM allura.tenants WHERE group_id=g FOR SHARE;
 PERFORM 1 FROM allura.workspaces WHERE group_id=g AND id=w FOR SHARE;
 IF NOT allura.context_allows(g,w,'workspace:grants:manage')
 OR original.reviewer_issuer IS DISTINCT FROM current_setting('allura.issuer') OR original.reviewer_subject IS DISTINCT FROM current_setting('allura.subject')
 OR NOT allura.active_human(g,original.owner_id) OR NOT allura.active_human(g,original.reviewer_id)
 OR NOT EXISTS(SELECT FROM allura.identity_bindings WHERE principal_id=original.owner_id AND issuer=original.owner_issuer AND subject=original.owner_subject AND identity_kind='human' AND active)
 OR NOT EXISTS(SELECT FROM allura.identity_bindings WHERE principal_id=original.reviewer_id AND issuer=original.reviewer_issuer AND subject=original.reviewer_subject AND identity_kind='human' AND active)
 OR NOT EXISTS(SELECT FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=original.owner_id AND active AND allura.role_allows(role,review_approve,'human','workspace:grants:manage'))
 OR NOT EXISTS(SELECT FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=original.reviewer_id AND active AND allura.role_allows(role,review_approve,'human','workspace:grants:manage') AND allura.role_allows(role,review_approve,'human','audit:read')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN original;
END $$;
REVOKE ALL ON FUNCTION allura.lock_run_decision_participants(text,uuid,uuid) FROM PUBLIC,allura_app;

CREATE FUNCTION allura.validate_run_decision(v jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,allura AS $$ BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid'; END IF;
 IF NOT v ?& ARRAY['runId','expectedRevision','operationKey','approvalRequestId','reviewedEvidenceDigest','decision','rationale']
 OR v-'runId'-'expectedRevision'-'operationKey'-'approvalRequestId'-'reviewedEvidenceDigest'-'decision'-'rationale'<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid'; END IF;
 PERFORM allura.validate_run_command(v-'approvalRequestId'-'reviewedEvidenceDigest'-'decision'-'rationale');
 IF jsonb_typeof(v->'approvalRequestId') IS DISTINCT FROM 'string' OR v->>'approvalRequestId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR jsonb_typeof(v->'reviewedEvidenceDigest') IS DISTINCT FROM 'string' OR v->>'reviewedEvidenceDigest' !~ '^[a-f0-9]{64}$'
 OR NOT (v->'decision' IN ('"approve"'::jsonb,'"reject"'::jsonb))
 OR jsonb_typeof(v->'rationale') IS DISTINCT FROM 'string' OR octet_length(v->>'rationale') NOT BETWEEN 1 AND 1000 OR v->>'rationale' !~ '[^[:space:]]' THEN RAISE EXCEPTION 'invalid'; END IF;
END $$;
REVOKE ALL ON FUNCTION allura.validate_run_decision(jsonb) FROM PUBLIC,allura_app;

CREATE FUNCTION allura.decide_run(g text,w uuid,v jsonb,d jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r allura.run_records; s allura.run_state; a allura.run_approval_requests; e allura.run_effect_receipts; def allura.run_definitions; old allura.run_operation_receipts;
 actor uuid; digest text; evidence text; n timestamptz; rid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid(); seq integer; phase_arg text; reason_arg text; receipt text; decision_value text;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'workspace:grants:manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM allura.validate_run_decision(v);
 r:=allura.lock_run_decision_participants(g,w,(v->>'runId')::uuid); actor:=r.reviewer_id;
 -- Shared namespace and lock with start/advance; no per-process mutex.
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,'runs-admission')::text,12002));
 digest:=encode(sha256(convert_to(jsonb_build_object('version','run-command-v1','actor',actor,'groupId',g,'workspaceId',w,'command','decide','input',v-'operationKey')::text,'UTF8')),'hex');
 SELECT * INTO old FROM allura.run_operation_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=v->>'operationKey';
 IF old.id IS NOT NULL THEN
  IF old.command<>'decide' OR old.request_digest<>digest THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN old.receipt_text;
 END IF;
 SELECT * INTO s FROM allura.run_state WHERE group_id=g AND workspace_id=w AND run_id=r.id FOR UPDATE;
 SELECT * INTO a FROM allura.run_approval_requests WHERE group_id=g AND workspace_id=w AND run_id=r.id AND id=(v->>'approvalRequestId')::uuid;
 SELECT * INTO def FROM allura.run_definitions WHERE group_id=g AND workspace_id=w AND definition_id=r.definition_id AND revision=r.definition_revision;
 n:=clock_timestamp();
 IF r.definition_revision<>3 OR def.definition IS DISTINCT FROM d OR s.revision<>(v->>'expectedRevision')::integer
 OR s.phase<>'paused_approval' OR s.next_step_id<>'review' OR s.cancel_requested
 OR a.id IS NULL OR a.reviewer_id<>actor OR a.evidence_digest<>v->>'reviewedEvidenceDigest'
 OR a.expires_at<=n OR r.expires_at<=n
 OR EXISTS(SELECT FROM allura.run_approval_decisions WHERE group_id=g AND workspace_id=w AND request_id=a.id)
 OR NOT EXISTS(SELECT FROM allura.run_steps WHERE group_id=g AND workspace_id=w AND run_id=r.id AND step_id='review' AND state='waiting_approval') THEN RAISE EXCEPTION 'conflict'; END IF;
 SELECT * INTO e FROM allura.run_effect_receipts WHERE group_id=g AND workspace_id=w AND run_id=r.id AND id=a.prepared_receipt_id AND step_id='prepare';
 evidence:=encode(sha256(convert_to(jsonb_build_object('runId',r.id,'definitionDigest',def.definition_digest,'inputDigest',r.input_digest,'preparedReceiptId',e.id,'preparedReceiptDigest',encode(sha256(convert_to(e.receipt_text,'UTF8')),'hex'),'reviewerPrincipalId',actor)::text,'UTF8')),'hex');
 IF e.id IS NULL OR e.receipt_text::jsonb->>'actorPrincipalId' IS DISTINCT FROM r.owner_id::text
 OR e.receipt_text::jsonb->>'definitionDigest' IS DISTINCT FROM def.definition_digest OR e.receipt_text::jsonb->>'inputDigest' IS DISTINCT FROM r.input_digest
 OR a.evidence_digest IS DISTINCT FROM evidence
 OR NOT EXISTS(SELECT FROM allura.run_steps WHERE group_id=g AND workspace_id=w AND run_id=r.id AND step_id='prepare' AND state='completed' AND effect_receipt_id=e.id)
 OR a.request_text::jsonb IS DISTINCT FROM jsonb_build_object('id',a.id,'runId',r.id,'stepId','review','definition',jsonb_build_object('id',r.definition_id,'revision',r.definition_revision,'digest',def.definition_digest),'inputDigest',r.input_digest,'preparedReceiptId',e.id,'evidenceDigest',evidence,'requestedAtRevision',s.revision,'reviewerPrincipalId',actor,'createdAt',to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'expiresAt',to_char(a.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) THEN RAISE EXCEPTION 'conflict'; END IF;
 IF s.revision>=2147483647 OR s.checkpoint_seq>=128 THEN RAISE EXCEPTION 'unavailable'; END IF;
 seq:=s.checkpoint_seq+1; phase_arg:=CASE WHEN v->>'decision'='approve' THEN 'ready' ELSE 'terminal' END; reason_arg:=CASE WHEN v->>'decision'='approve' THEN 'none' ELSE 'approval_rejected' END;
 decision_value:=jsonb_build_object('id',did,'requestId',a.id,'runId',r.id,'reviewerPrincipalId',actor,'reviewedEvidenceDigest',evidence,'decision',v->>'decision','rationale',v->>'rationale','journalSeq',seq,'createdAt',to_char(n AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text;
 receipt:=jsonb_build_object('version','run-operation-v1','id',rid,'operationKey',v->>'operationKey','command','decide','runId',r.id,'actorPrincipalId',actor,'requestDigest',digest,'acceptedRevision',s.revision+1,'journalSeq',seq,'acceptedAt',to_char(n AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'phaseAtAcceptance',phase_arg)::text;
 INSERT INTO allura.run_approval_decisions VALUES(g,w,did,r.id,a.id,actor,evidence,v->>'decision',v->>'rationale',decision_value,seq,n);
 INSERT INTO allura.run_operation_receipts VALUES(g,w,rid,r.id,actor,v->>'operationKey','decide',digest,receipt,s.revision+1,seq,n);
 INSERT INTO allura.run_journal(group_id,workspace_id,run_id,seq,event_id,actor_id,kind,reason,receipt_id,created_at,step_id,effect_receipt_id,approval_request_id,approval_decision_id) VALUES(g,w,r.id,seq,gen_random_uuid(),actor,'approval_decided',reason_arg,rid,n,'review',e.id,a.id,did);
 UPDATE allura.run_steps SET state=CASE WHEN v->>'decision'='approve' THEN 'completed' ELSE 'failed' END WHERE group_id=g AND workspace_id=w AND run_id=r.id AND step_id='review';
 UPDATE allura.run_state SET revision=revision+1,phase=phase_arg,outcome=CASE WHEN phase_arg='terminal' THEN 'partial' ELSE NULL END,reason=reason_arg,next_step_id=CASE WHEN phase_arg='ready' THEN 'handoff' ELSE NULL END,checkpoint_seq=seq,updated_at=n WHERE group_id=g AND workspace_id=w AND run_id=r.id;
 -- Deferred failure and expiry remain inside the atomic decision boundary.
 SET CONSTRAINTS ALL IMMEDIATE;
 IF clock_timestamp()>=a.expires_at OR clock_timestamp()>=r.expires_at THEN RAISE EXCEPTION 'conflict'; END IF;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION allura.decide_run(text,uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.decide_run(text,uuid,jsonb,jsonb) TO allura_app;
ALTER TABLE allura.run_definitions DROP CONSTRAINT run_definitions_revision_check;
ALTER TABLE allura.run_definitions ADD CHECK(revision IN (1,2,3));

CREATE OR REPLACE FUNCTION allura.validate_run_start(v jsonb,d jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(v->'artifact') IS DISTINCT FROM 'object' OR jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v))<>6 OR NOT v ?& ARRAY['operationKey','definitionId','definitionRevision','goal','reviewerPrincipalId','artifact']
  OR (SELECT count(*) FROM jsonb_object_keys(v->'artifact'))<>3 OR NOT (v->'artifact') ?& ARRAY['text','expectedSha256','sourceRevision']
  OR jsonb_typeof(v->'operationKey') IS DISTINCT FROM 'string' OR (v->>'operationKey') !~ '^[A-Za-z0-9._:-]{1,128}$'
  OR v->'definitionId' IS DISTINCT FROM '"local-evidence-handoff"'::jsonb OR v->'definitionRevision' NOT IN ('1'::jsonb,'2'::jsonb,'3'::jsonb)
  OR jsonb_typeof(v->'goal') IS DISTINCT FROM 'string' OR octet_length(v->>'goal') NOT BETWEEN 1 AND 1000 OR (v->>'goal') !~ '[^[:space:]]'
  OR jsonb_typeof(v->'reviewerPrincipalId') IS DISTINCT FROM 'string' OR (v->>'reviewerPrincipalId') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(v->'artifact'->'text') IS DISTINCT FROM 'string' OR octet_length(v->'artifact'->>'text') NOT BETWEEN 1 AND 16384
  OR jsonb_typeof(v->'artifact'->'expectedSha256') IS DISTINCT FROM 'string' OR (v->'artifact'->>'expectedSha256') !~ '^[a-f0-9]{64}$'
  OR NOT ((v->'artifact'->'sourceRevision')='null'::jsonb OR (jsonb_typeof(v->'artifact'->'sourceRevision')='string' AND (v->'artifact'->>'sourceRevision') ~ '^[a-f0-9]{40}$'))
  THEN RAISE EXCEPTION 'invalid'; END IF;
 IF jsonb_typeof(d->'handlerBundleDigest') IS DISTINCT FROM 'string' OR (d->>'handlerBundleDigest') !~ '^[a-f0-9]{64}$'
  OR d-'handlerBundleDigest' IS DISTINCT FROM '{"version":"run-definition-v1","id":"local-evidence-handoff","revision":3,"engineContract":"run-engine-v1","policy":{"version":"run-policy-v1","allowedHandlers":["local-artifact-check-v1","local-handoff-receipt-v1"],"approvalStep":"review","independentReviewer":true,"gates":["artifact_nonempty","artifact_digest_match"],"maxAttemptsPerEffect":3,"leaseMs":10000,"stepDeadlineMs":2000,"maxArtifactBytes":16384,"maxJournalRows":128,"maxRunAgeMs":86400000,"approvalTtlMs":86400000},"steps":[{"id":"prepare","kind":"local","handler":"local-artifact-check-v1"},{"id":"review","kind":"approval","dependsOn":"prepare"},{"id":"handoff","kind":"local","handler":"local-handoff-receipt-v1","dependsOn":"review"}]}'::jsonb
  THEN RAISE EXCEPTION 'invalid'; END IF;
END $$;
REVOKE ALL ON FUNCTION allura.validate_run_start(jsonb,jsonb) FROM PUBLIC,allura_app;

CREATE OR REPLACE FUNCTION allura.start_run(g text,w uuid,input_arg jsonb,definition_arg jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid; reviewer uuid; binding allura.identity_bindings; run uuid:=gen_random_uuid(); receipt_id_arg uuid:=gen_random_uuid();
 now_arg timestamptz; definition_hash text; policy_hash text; input_hash text; request_hash text; input_value jsonb; receipt text; p uuid; old allura.run_operation_receipts; original allura.run_records;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'workspace:grants:manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM allura.validate_run_start(input_arg,definition_arg);
 actor:=current_setting('allura.principal')::uuid;
 -- The original participants, not a changed request's reviewer, authorize replay.
 SELECT * INTO old FROM allura.run_operation_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=input_arg->>'operationKey';
 IF old.id IS NOT NULL THEN
  IF old.command<>'start' THEN RAISE EXCEPTION 'conflict'; END IF;
  original:=allura.lock_run_participants(g,w,old.run_id);
  IF original.definition_revision IN (1,2) THEN
   SELECT definition_digest INTO definition_hash FROM allura.run_definitions WHERE group_id=g AND workspace_id=w AND definition_id=original.definition_id AND revision=original.definition_revision;
  ELSE definition_hash:=encode(sha256(convert_to(definition_arg::text,'UTF8')),'hex'); END IF;
  request_hash:=encode(sha256(convert_to(jsonb_build_object('version','run-command-v1','actor',actor,'groupId',g,'workspaceId',w,'command','start','input',input_arg-'operationKey','definitionDigest',definition_hash)::text,'UTF8')),'hex');
  IF old.request_digest<>request_hash THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN old.receipt_text;
 END IF;
 IF input_arg->'definitionRevision'<>'3'::jsonb THEN RAISE EXCEPTION 'conflict'; END IF;
 reviewer:=(input_arg->>'reviewerPrincipalId')::uuid;
 IF reviewer=actor THEN RAISE EXCEPTION 'forbidden'; END IF;
 -- Share locks only, in stable participant/key order, before any run lock.
 FOR p IN SELECT x FROM unnest(ARRAY[actor,reviewer]) x ORDER BY x LOOP
  PERFORM 1 FROM allura.principals WHERE id=p FOR SHARE;
  PERFORM 1 FROM allura.identity_bindings WHERE principal_id=p ORDER BY issuer,subject,identity_kind FOR SHARE;
  PERFORM 1 FROM allura.memberships WHERE group_id=g AND principal_id=p FOR SHARE;
  PERFORM 1 FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=p FOR SHARE;
 END LOOP;
 PERFORM 1 FROM allura.tenants WHERE group_id=g FOR SHARE;
 PERFORM 1 FROM allura.workspaces WHERE group_id=g AND id=w FOR SHARE;
 IF NOT allura.context_allows(g,w,'workspace:grants:manage') OR NOT allura.active_human(g,reviewer)
  OR NOT EXISTS(SELECT FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=reviewer AND active AND allura.role_allows(role,review_approve,'human','workspace:grants:manage') AND allura.role_allows(role,review_approve,'human','audit:read')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO binding FROM allura.identity_bindings WHERE principal_id=reviewer AND identity_kind='human' AND active ORDER BY issuer,subject LIMIT 1;
 IF binding.principal_id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,'runs-admission')::text,12002));
 now_arg:=clock_timestamp();
 definition_hash:=encode(sha256(convert_to(definition_arg::text,'UTF8')),'hex');
 policy_hash:=encode(sha256(convert_to((definition_arg->'policy')::text,'UTF8')),'hex');
 input_value:=input_arg-'operationKey';
 input_hash:=encode(sha256(convert_to(input_value::text,'UTF8')),'hex');
 request_hash:=encode(sha256(convert_to(jsonb_build_object('version','run-command-v1','actor',actor,'groupId',g,'workspaceId',w,'command','start','input',input_value,'definitionDigest',definition_hash)::text,'UTF8')),'hex');
 SELECT * INTO old FROM allura.run_operation_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=input_arg->>'operationKey';
 IF old.id IS NOT NULL THEN
  IF old.command<>'start' THEN RAISE EXCEPTION 'conflict'; END IF;
  original:=allura.lock_run_participants(g,w,old.run_id);
  IF original.owner_issuer IS DISTINCT FROM current_setting('allura.issuer') OR original.owner_subject IS DISTINCT FROM current_setting('allura.subject')
   OR NOT EXISTS(SELECT FROM allura.identity_bindings WHERE principal_id=original.reviewer_id AND issuer=original.reviewer_issuer AND subject=original.reviewer_subject AND identity_kind='human' AND active) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF old.request_digest<>request_hash THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN old.receipt_text;
 END IF;
 IF EXISTS(SELECT FROM allura.run_definitions WHERE group_id=g AND workspace_id=w AND definition_id='local-evidence-handoff' AND revision=3 AND definition_digest<>definition_hash) THEN RAISE EXCEPTION 'conflict'; END IF;
 IF (SELECT count(*) FROM allura.run_records WHERE group_id=g AND workspace_id=w)>=256
  OR (SELECT count(*) FROM allura.run_state WHERE group_id=g AND workspace_id=w AND phase<>'terminal')>=32 THEN RAISE EXCEPTION 'unavailable'; END IF;
 INSERT INTO allura.run_definitions VALUES(g,w,'local-evidence-handoff',3,definition_arg,definition_hash,policy_hash,definition_arg->>'handlerBundleDigest') ON CONFLICT DO NOTHING;
 INSERT INTO allura.run_records VALUES(g,w,run,'local-evidence-handoff',3,actor,reviewer,current_setting('allura.issuer'),current_setting('allura.subject'),binding.issuer,binding.subject,input_arg->>'goal',input_value,input_hash,now_arg,now_arg+interval '24 hours');
 INSERT INTO allura.run_state VALUES(g,w,run,1,'ready',NULL,'none','prepare',1,false,now_arg);
 INSERT INTO allura.run_steps SELECT g,w,run,s,'pending',0,0 FROM unnest(ARRAY['prepare','review','handoff']) s;
 receipt:=jsonb_build_object('version','run-operation-v1','id',receipt_id_arg,'operationKey',input_arg->>'operationKey','command','start','runId',run,'actorPrincipalId',actor,'requestDigest',request_hash,'acceptedRevision',1,'journalSeq',1,'acceptedAt',to_char(now_arg AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'phaseAtAcceptance','ready')::text;
 INSERT INTO allura.run_journal VALUES(g,w,run,1,gen_random_uuid(),actor,'started','none',receipt_id_arg,now_arg);
 INSERT INTO allura.run_operation_receipts VALUES(g,w,receipt_id_arg,run,actor,input_arg->>'operationKey','start',request_hash,receipt,1,1,now_arg);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION allura.start_run(text,uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.start_run(text,uuid,jsonb,jsonb) TO allura_app;

CREATE OR REPLACE FUNCTION allura.claim_run_prepare(g text,w uuid,v jsonb,d jsonb,inv uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r allura.run_records; s allura.run_state; st allura.run_steps; old allura.run_operation_receipts; def allura.run_definitions;
 actor uuid; request_hash text; receipt text; rid uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); n timestamptz; why text; phase_arg text; seq integer;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'workspace:grants:manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM allura.validate_run_command(v);
 IF inv IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
 r:=allura.lock_run_participants(g,w,(v->>'runId')::uuid); actor:=r.owner_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,'runs-admission')::text,12002));
 request_hash:=encode(sha256(convert_to(jsonb_build_object('version','run-command-v1','actor',actor,'groupId',g,'workspaceId',w,'command','advance','input',v-'operationKey')::text,'UTF8')),'hex');
 SELECT * INTO old FROM allura.run_operation_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=v->>'operationKey';
 IF old.id IS NOT NULL AND (old.command<>'advance' OR old.request_digest<>request_hash) THEN RAISE EXCEPTION 'conflict'; END IF;
 SELECT * INTO s FROM allura.run_state WHERE group_id=g AND workspace_id=w AND run_id=r.id FOR UPDATE;
 SELECT * INTO st FROM allura.run_steps WHERE group_id=g AND workspace_id=w AND run_id=r.id AND step_id='prepare' FOR UPDATE;
 n:=clock_timestamp();
 IF old.id IS NOT NULL THEN
  -- Legacy replay is history only, including expired historical claims.
  IF r.definition_revision IN (1,2) THEN RETURN jsonb_build_object('receipt',old.receipt_text,'claim',NULL); END IF;
  -- Committed or still-owned work is only reconciled, never re-executed.
  IF s.phase<>'running' OR st.lease_until>n THEN RETURN jsonb_build_object('receipt',old.receipt_text,'claim',NULL); END IF;
  IF EXISTS(SELECT FROM allura.run_effect_receipts WHERE group_id=g AND workspace_id=w AND run_id=r.id) THEN RAISE EXCEPTION 'conflict'; END IF;
  IF st.due_at>n THEN RAISE EXCEPTION 'conflict'; END IF;
 ELSE
  IF s.revision<>(v->>'expectedRevision')::integer OR s.phase NOT IN ('ready','running') OR s.next_step_id<>'prepare' THEN RAISE EXCEPTION 'conflict'; END IF;
  IF s.phase='running' AND (st.lease_until>n OR st.due_at>n) THEN RAISE EXCEPTION 'conflict'; END IF;
 END IF;
 IF s.revision>=2147483647 OR st.fence>=2147483647 OR s.checkpoint_seq>124 THEN RAISE EXCEPTION 'unavailable'; END IF;
 SELECT * INTO def FROM allura.run_definitions WHERE group_id=g AND workspace_id=w AND definition_id=r.definition_id AND revision=r.definition_revision;
 why:='none'; phase_arg:='running';
 IF r.definition_revision<>3 OR def.definition IS DISTINCT FROM d THEN why:='definition_drift'; phase_arg:='blocked';
 ELSIF r.expires_at<=n THEN why:='deadline'; phase_arg:='terminal';
 ELSIF st.attempts>=3 THEN why:='attempts_exhausted'; phase_arg:='terminal';
 ELSE
  IF (SELECT count(*) FROM allura.run_steps WHERE group_id=g AND workspace_id=w AND state='leased' AND lease_until>n)>=4 THEN RAISE EXCEPTION 'unavailable'; END IF;
 END IF;
 seq:=s.checkpoint_seq+1;
 IF old.id IS NULL THEN
  receipt:=jsonb_build_object('version','run-operation-v1','id',rid,'operationKey',v->>'operationKey','command','advance','runId',r.id,'actorPrincipalId',actor,'requestDigest',request_hash,'acceptedRevision',s.revision+1,'journalSeq',seq,'acceptedAt',to_char(n AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'phaseAtAcceptance',phase_arg)::text;
  INSERT INTO allura.run_operation_receipts VALUES(g,w,rid,r.id,actor,v->>'operationKey','advance',request_hash,receipt,s.revision+1,seq,n);
 ELSE rid:=old.id; receipt:=old.receipt_text; END IF;
 UPDATE allura.run_state SET revision=revision+1,phase=phase_arg,outcome=CASE WHEN phase_arg='terminal' THEN 'failed' ELSE NULL END,reason=why,next_step_id=CASE WHEN phase_arg='terminal' THEN NULL ELSE 'prepare' END,checkpoint_seq=seq,updated_at=n WHERE group_id=g AND workspace_id=w AND run_id=r.id;
 UPDATE allura.run_steps SET state=CASE WHEN phase_arg='running' THEN 'leased' WHEN phase_arg='blocked' THEN 'blocked' ELSE 'failed' END,attempts=attempts+CASE WHEN phase_arg='running' THEN 1 ELSE 0 END,fence=fence+1,lease_id=CASE WHEN phase_arg='running' THEN lease ELSE NULL END,invocation_id=CASE WHEN phase_arg='running' THEN inv ELSE NULL END,lease_until=CASE WHEN phase_arg='running' THEN n+interval '10 seconds' ELSE NULL END,due_at=CASE WHEN phase_arg='running' THEN n+interval '10 seconds'+make_interval(secs=>CASE WHEN st.attempts=0 THEN 1 ELSE 2 END) ELSE NULL END WHERE group_id=g AND workspace_id=w AND run_id=r.id AND step_id='prepare';
 INSERT INTO allura.run_journal(group_id,workspace_id,run_id,seq,event_id,actor_id,kind,reason,receipt_id,created_at,step_id,attempt,fence) VALUES(g,w,r.id,seq,gen_random_uuid(),actor,CASE WHEN phase_arg='running' THEN 'claimed' WHEN phase_arg='blocked' THEN 'blocked' ELSE 'terminated' END,why,rid,n,'prepare',CASE WHEN phase_arg='running' THEN st.attempts+1 ELSE NULL END,st.fence+1);
 RETURN jsonb_build_object('receipt',receipt,'claim',CASE WHEN phase_arg='running' THEN jsonb_build_object('runId',r.id,'leaseId',lease,'invocationId',inv,'fence',st.fence+1,'operationReceiptId',rid) ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION allura.claim_run_prepare(text,uuid,jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.claim_run_prepare(text,uuid,jsonb,jsonb,uuid) TO allura_app;

CREATE OR REPLACE FUNCTION allura.finish_run_prepare(g text,w uuid,rid uuid,lease uuid,inv uuid,fence_arg integer,op uuid,d jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r allura.run_records; s allura.run_state; st allura.run_steps; def allura.run_definitions; n timestamptz; began timestamptz:=clock_timestamp();
 digest text; bytes integer; expected text; gates jsonb; effect uuid:=gen_random_uuid(); approval uuid:=gen_random_uuid(); receipt text; evidence text; request text; seq integer;
BEGIN
 r:=allura.lock_run_participants(g,w,rid);
 SELECT * INTO s FROM allura.run_state WHERE group_id=g AND workspace_id=w AND run_id=rid FOR UPDATE;
 SELECT * INTO st FROM allura.run_steps WHERE group_id=g AND workspace_id=w AND run_id=rid AND step_id='prepare' FOR UPDATE;
 n:=clock_timestamp();
 IF s.phase<>'running' OR st.state<>'leased' OR lease IS NULL OR inv IS NULL OR fence_arg IS NULL
 OR st.lease_id IS DISTINCT FROM lease OR st.invocation_id IS DISTINCT FROM inv OR st.fence IS DISTINCT FROM fence_arg OR st.lease_until<=n
 OR NOT EXISTS(SELECT FROM allura.run_operation_receipts WHERE group_id=g AND workspace_id=w AND id=op AND run_id=rid AND actor_id=r.owner_id AND command='advance') THEN RAISE EXCEPTION 'conflict'; END IF;
 IF s.revision>=2147483647 OR s.checkpoint_seq>125 THEN RAISE EXCEPTION 'unavailable'; END IF;
 SELECT * INTO def FROM allura.run_definitions WHERE group_id=g AND workspace_id=w AND definition_id=r.definition_id AND revision=r.definition_revision;
 seq:=s.checkpoint_seq+1;
 IF r.definition_revision<>3 OR def.definition IS DISTINCT FROM d THEN
  UPDATE allura.run_steps SET state='blocked',lease_id=NULL,invocation_id=NULL,lease_until=NULL,due_at=NULL WHERE group_id=g AND workspace_id=w AND run_id=rid AND step_id='prepare';
  UPDATE allura.run_state SET revision=revision+1,phase='blocked',reason='definition_drift',checkpoint_seq=seq,updated_at=n WHERE group_id=g AND workspace_id=w AND run_id=rid;
  INSERT INTO allura.run_journal(group_id,workspace_id,run_id,seq,event_id,actor_id,kind,reason,receipt_id,created_at,step_id,attempt,fence) VALUES(g,w,rid,seq,gen_random_uuid(),r.owner_id,'blocked','definition_drift',op,n,'prepare',st.attempts,st.fence);
  RETURN;
 END IF;
 IF r.expires_at<=n THEN RAISE EXCEPTION 'conflict'; END IF;
 -- Built-in measurement uses the actual raw UTF8 bytes, not input assertions.
 bytes:=octet_length(r.input->'artifact'->>'text');
 digest:=encode(sha256(convert_to(r.input->'artifact'->>'text','UTF8')),'hex');
 expected:=r.input->'artifact'->>'expectedSha256';
 gates:=jsonb_build_array(jsonb_build_object('id','artifact_nonempty','passed',bytes>0),jsonb_build_object('id','artifact_digest_match','passed',digest=expected));
 IF digest<>expected THEN
  INSERT INTO allura.run_journal(group_id,workspace_id,run_id,seq,event_id,actor_id,kind,reason,receipt_id,created_at,step_id,attempt,fence,measurement) VALUES(g,w,rid,seq,gen_random_uuid(),r.owner_id,'terminated','gate_failed',op,n,'prepare',st.attempts,st.fence,jsonb_build_object('artifactSha256',digest,'artifactBytes',bytes,'expectedSha256',expected,'measuredGates',gates));
  UPDATE allura.run_steps SET state='failed',lease_id=NULL,invocation_id=NULL,lease_until=NULL,due_at=NULL WHERE group_id=g AND workspace_id=w AND run_id=rid AND step_id='prepare';
  UPDATE allura.run_state SET revision=revision+1,phase='terminal',outcome='failed',reason='gate_failed',next_step_id=NULL,checkpoint_seq=seq,updated_at=n WHERE group_id=g AND workspace_id=w AND run_id=rid;
 ELSE
  receipt:=jsonb_build_object('version','run-effect-v1','id',effect,'runId',rid,'stepId','prepare','effectSlot','local-result','definitionDigest',def.definition_digest,'inputDigest',r.input_digest,'actorPrincipalId',r.owner_id,'attempt',st.attempts,'fence',st.fence,'preparedReceiptId',NULL,'approvalDecisionId',NULL,'artifactSha256',digest,'artifactBytes',bytes,'measuredGates',gates,'journalSeq',seq,'committedAt',to_char(n AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text;
  evidence:=encode(sha256(convert_to(jsonb_build_object('runId',rid,'definitionDigest',def.definition_digest,'inputDigest',r.input_digest,'preparedReceiptId',effect,'preparedReceiptDigest',encode(sha256(convert_to(receipt,'UTF8')),'hex'),'reviewerPrincipalId',r.reviewer_id)::text,'UTF8')),'hex');
  request:=jsonb_build_object('id',approval,'runId',rid,'stepId','review','definition',jsonb_build_object('id',r.definition_id,'revision',r.definition_revision,'digest',def.definition_digest),'inputDigest',r.input_digest,'preparedReceiptId',effect,'evidenceDigest',evidence,'requestedAtRevision',s.revision+1,'reviewerPrincipalId',r.reviewer_id,'createdAt',to_char(n AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'expiresAt',to_char(least(r.expires_at,n+interval '24 hours') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text;
  INSERT INTO allura.run_effect_receipts VALUES(g,w,effect,rid,'prepare','local-result',receipt,seq,n);
  INSERT INTO allura.run_approval_requests VALUES(g,w,approval,rid,'review',effect,r.reviewer_id,evidence,request,seq+1,n,least(r.expires_at,n+interval '24 hours'));
  INSERT INTO allura.run_journal(group_id,workspace_id,run_id,seq,event_id,actor_id,kind,reason,receipt_id,created_at,step_id,attempt,fence,effect_receipt_id,approval_request_id) VALUES(g,w,rid,seq,gen_random_uuid(),r.owner_id,'effect_committed','none',op,n,'prepare',st.attempts,st.fence,effect,NULL),(g,w,rid,seq+1,gen_random_uuid(),r.owner_id,'approval_requested','approval_required',op,n,'review',NULL,NULL,effect,approval);
  UPDATE allura.run_steps SET state='completed',lease_id=NULL,invocation_id=NULL,lease_until=NULL,due_at=NULL,effect_receipt_id=effect WHERE group_id=g AND workspace_id=w AND run_id=rid AND step_id='prepare';
  UPDATE allura.run_steps SET state='waiting_approval' WHERE group_id=g AND workspace_id=w AND run_id=rid AND step_id='review';
  UPDATE allura.run_state SET revision=revision+1,phase='paused_approval',reason='approval_required',next_step_id='review',checkpoint_seq=seq+1,updated_at=n WHERE group_id=g AND workspace_id=w AND run_id=rid;
 END IF;
 IF clock_timestamp()>=st.lease_until OR clock_timestamp()>=r.expires_at OR clock_timestamp()-began>=interval '2 seconds' THEN RAISE EXCEPTION 'conflict'; END IF;
END $$;
REVOKE ALL ON FUNCTION allura.finish_run_prepare(text,uuid,uuid,uuid,uuid,integer,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.finish_run_prepare(text,uuid,uuid,uuid,uuid,integer,uuid,jsonb) TO allura_app;
