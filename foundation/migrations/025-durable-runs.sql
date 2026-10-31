-- Start admission only. No executor, approval or effect entrypoints.
CREATE TABLE allura.run_definitions (
 group_id text NOT NULL, workspace_id uuid NOT NULL, definition_id text NOT NULL CHECK(definition_id='local-evidence-handoff'), revision integer NOT NULL CHECK(revision=1),
 definition jsonb NOT NULL, definition_digest text NOT NULL CHECK(definition_digest ~ '^[0-9a-f]{64}$'),
 policy_digest text NOT NULL CHECK(policy_digest ~ '^[0-9a-f]{64}$'), handler_digest text NOT NULL CHECK(handler_digest ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(group_id,workspace_id,definition_id,revision), FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces,
 CHECK(definition_digest=encode(sha256(convert_to(definition::text,'UTF8')),'hex')),
 CHECK(policy_digest=encode(sha256(convert_to((definition->'policy')::text,'UTF8')),'hex')),
 CHECK(handler_digest=definition->>'handlerBundleDigest')
);
CREATE TABLE allura.run_records (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL,
 definition_id text NOT NULL, definition_revision integer NOT NULL, owner_id uuid NOT NULL, reviewer_id uuid NOT NULL CHECK(owner_id<>reviewer_id),
 owner_issuer text NOT NULL, owner_subject text NOT NULL, reviewer_issuer text NOT NULL, reviewer_subject text NOT NULL,
 goal text NOT NULL CHECK(octet_length(goal) BETWEEN 1 AND 1000), input jsonb NOT NULL,
 input_digest text NOT NULL CHECK(input_digest=encode(sha256(convert_to(input::text,'UTF8')),'hex')),
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at=created_at+interval '24 hours'),
 PRIMARY KEY(group_id,workspace_id,id),
 FOREIGN KEY(group_id,workspace_id,definition_id,definition_revision) REFERENCES allura.run_definitions,
 FOREIGN KEY(group_id,owner_id) REFERENCES allura.memberships, FOREIGN KEY(group_id,reviewer_id) REFERENCES allura.memberships,
 CHECK(octet_length(input->'artifact'->>'text') BETWEEN 1 AND 16384)
);
CREATE TABLE allura.run_state (
 group_id text NOT NULL, workspace_id uuid NOT NULL, run_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), phase text NOT NULL CHECK(phase='ready'), outcome text CHECK(outcome IS NULL),
 reason text NOT NULL CHECK(reason='none'), next_step_id text NOT NULL CHECK(next_step_id='prepare'),
 checkpoint_seq integer NOT NULL CHECK(checkpoint_seq BETWEEN 1 AND 128), cancel_requested boolean NOT NULL CHECK(NOT cancel_requested), updated_at timestamptz NOT NULL,
 PRIMARY KEY(group_id,workspace_id,run_id), FOREIGN KEY(group_id,workspace_id,run_id) REFERENCES allura.run_records
);
CREATE TABLE allura.run_steps (
 group_id text NOT NULL, workspace_id uuid NOT NULL, run_id uuid NOT NULL, step_id text NOT NULL CHECK(step_id IN ('prepare','review','handoff')),
 state text NOT NULL CHECK(state='pending'), attempts integer NOT NULL CHECK(attempts=0), fence integer NOT NULL CHECK(fence=0),
 PRIMARY KEY(group_id,workspace_id,run_id,step_id), FOREIGN KEY(group_id,workspace_id,run_id) REFERENCES allura.run_records
);
CREATE TABLE allura.run_journal (
 group_id text NOT NULL, workspace_id uuid NOT NULL, run_id uuid NOT NULL, seq integer NOT NULL CHECK(seq BETWEEN 1 AND 128),
 event_id uuid NOT NULL, actor_id uuid NOT NULL, kind text NOT NULL CHECK(kind='started'), reason text NOT NULL CHECK(reason='none'), receipt_id uuid NOT NULL, created_at timestamptz NOT NULL,
 PRIMARY KEY(group_id,workspace_id,run_id,seq), UNIQUE(group_id,workspace_id,event_id),
 FOREIGN KEY(group_id,workspace_id,run_id) REFERENCES allura.run_records, FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
CREATE TABLE allura.run_operation_receipts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, run_id uuid NOT NULL, actor_id uuid NOT NULL,
 operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'), command text NOT NULL CHECK(command='start'),
 request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'), receipt_text text NOT NULL,
 accepted_revision integer NOT NULL CHECK(accepted_revision>0), journal_seq integer NOT NULL CHECK(journal_seq BETWEEN 1 AND 128), accepted_at timestamptz NOT NULL,
 PRIMARY KEY(group_id,workspace_id,id), UNIQUE(group_id,workspace_id,id,run_id), UNIQUE(group_id,workspace_id,actor_id,operation_key),
 FOREIGN KEY(group_id,workspace_id,run_id) REFERENCES allura.run_records, FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships,
 FOREIGN KEY(group_id,workspace_id,run_id,journal_seq) REFERENCES allura.run_journal DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE allura.run_journal ADD FOREIGN KEY(group_id,workspace_id,receipt_id,run_id) REFERENCES allura.run_operation_receipts(group_id,workspace_id,id,run_id) DEFERRABLE INITIALLY DEFERRED;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['run_definitions','run_records','run_state','run_steps','run_journal','run_operation_receipts'] LOOP
  EXECUTE format('ALTER TABLE allura.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE allura.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON allura.%I FROM PUBLIC,allura_app',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['run_definitions','run_records','run_journal','run_operation_receipts'] LOOP
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON allura.%I FOR EACH ROW EXECUTE FUNCTION allura.append_only()',t);
  EXECUTE format('CREATE TRIGGER no_truncate BEFORE TRUNCATE ON allura.%I FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only()',t);
 END LOOP;
END $$;
-- Only content-free projections are directly readable; no private receipt text.
CREATE POLICY run_state_read ON allura.run_state FOR SELECT TO allura_app USING(current_setting('allura.kind',true)='human' AND allura.context_allows(group_id,workspace_id,'audit:read'));
CREATE POLICY run_steps_read ON allura.run_steps FOR SELECT TO allura_app USING(current_setting('allura.kind',true)='human' AND allura.context_allows(group_id,workspace_id,'audit:read'));
CREATE POLICY run_journal_read ON allura.run_journal FOR SELECT TO allura_app USING(current_setting('allura.kind',true)='human' AND allura.context_allows(group_id,workspace_id,'audit:read'));
GRANT SELECT ON allura.run_state,allura.run_steps,allura.run_journal TO allura_app;

CREATE FUNCTION allura.validate_run_start(v jsonb,d jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(v->'artifact') IS DISTINCT FROM 'object' OR jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v))<>6 OR NOT v ?& ARRAY['operationKey','definitionId','definitionRevision','goal','reviewerPrincipalId','artifact']
  OR (SELECT count(*) FROM jsonb_object_keys(v->'artifact'))<>3 OR NOT (v->'artifact') ?& ARRAY['text','expectedSha256','sourceRevision']
  OR jsonb_typeof(v->'operationKey') IS DISTINCT FROM 'string' OR (v->>'operationKey') !~ '^[A-Za-z0-9._:-]{1,128}$'
  OR v->'definitionId' IS DISTINCT FROM '"local-evidence-handoff"'::jsonb OR v->'definitionRevision' IS DISTINCT FROM '1'::jsonb
  OR jsonb_typeof(v->'goal') IS DISTINCT FROM 'string' OR octet_length(v->>'goal') NOT BETWEEN 1 AND 1000 OR (v->>'goal') !~ '[^[:space:]]'
  OR jsonb_typeof(v->'reviewerPrincipalId') IS DISTINCT FROM 'string' OR (v->>'reviewerPrincipalId') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(v->'artifact'->'text') IS DISTINCT FROM 'string' OR octet_length(v->'artifact'->>'text') NOT BETWEEN 1 AND 16384
  OR jsonb_typeof(v->'artifact'->'expectedSha256') IS DISTINCT FROM 'string' OR (v->'artifact'->>'expectedSha256') !~ '^[a-f0-9]{64}$'
  OR NOT ((v->'artifact'->'sourceRevision')='null'::jsonb OR (jsonb_typeof(v->'artifact'->'sourceRevision')='string' AND (v->'artifact'->>'sourceRevision') ~ '^[a-f0-9]{40}$'))
  THEN RAISE EXCEPTION 'invalid'; END IF;
 IF jsonb_typeof(d->'handlerBundleDigest') IS DISTINCT FROM 'string' OR (d->>'handlerBundleDigest') !~ '^[a-f0-9]{64}$'
  OR d-'handlerBundleDigest' IS DISTINCT FROM '{"version":"run-definition-v1","id":"local-evidence-handoff","revision":1,"engineContract":"run-engine-v1","policy":{"version":"run-policy-v1","allowedHandlers":["local-artifact-check-v1","local-handoff-receipt-v1"],"approvalStep":"review","independentReviewer":true,"gates":["artifact_nonempty","artifact_digest_match"],"maxAttemptsPerEffect":3,"leaseMs":10000,"stepDeadlineMs":2000,"maxArtifactBytes":16384,"maxJournalRows":128,"maxRunAgeMs":86400000,"approvalTtlMs":86400000},"steps":[{"id":"prepare","kind":"local","handler":"local-artifact-check-v1"},{"id":"review","kind":"approval","dependsOn":"prepare"},{"id":"handoff","kind":"local","handler":"local-handoff-receipt-v1","dependsOn":"review"}]}'::jsonb
  THEN RAISE EXCEPTION 'invalid'; END IF;
END $$;
REVOKE ALL ON FUNCTION allura.validate_run_start(jsonb,jsonb) FROM PUBLIC,allura_app;

CREATE FUNCTION allura.start_run(g text,w uuid,input_arg jsonb,definition_arg jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid; reviewer uuid; binding allura.identity_bindings; run uuid:=gen_random_uuid(); receipt_id_arg uuid:=gen_random_uuid();
 now_arg timestamptz; definition_hash text; policy_hash text; input_hash text; request_hash text; input_value jsonb; receipt text; p uuid; old allura.run_operation_receipts; original allura.run_records;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'workspace:grants:manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM allura.validate_run_start(input_arg,definition_arg);
 actor:=current_setting('allura.principal')::uuid;
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
  SELECT * INTO original FROM allura.run_records WHERE group_id=g AND workspace_id=w AND id=old.run_id;
  IF original.owner_issuer IS DISTINCT FROM current_setting('allura.issuer') OR original.owner_subject IS DISTINCT FROM current_setting('allura.subject')
   OR NOT EXISTS(SELECT FROM allura.identity_bindings WHERE principal_id=original.reviewer_id AND issuer=original.reviewer_issuer AND subject=original.reviewer_subject AND identity_kind='human' AND active) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF old.request_digest<>request_hash THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN old.receipt_text;
 END IF;
 IF EXISTS(SELECT FROM allura.run_definitions WHERE group_id=g AND workspace_id=w AND definition_id='local-evidence-handoff' AND revision=1 AND definition_digest<>definition_hash) THEN RAISE EXCEPTION 'conflict'; END IF;
 IF (SELECT count(*) FROM allura.run_records WHERE group_id=g AND workspace_id=w)>=256
  OR (SELECT count(*) FROM allura.run_state WHERE group_id=g AND workspace_id=w AND phase<>'terminal')>=32 THEN RAISE EXCEPTION 'unavailable'; END IF;
 INSERT INTO allura.run_definitions VALUES(g,w,'local-evidence-handoff',1,definition_arg,definition_hash,policy_hash,definition_arg->>'handlerBundleDigest') ON CONFLICT DO NOTHING;
 INSERT INTO allura.run_records VALUES(g,w,run,'local-evidence-handoff',1,actor,reviewer,current_setting('allura.issuer'),current_setting('allura.subject'),binding.issuer,binding.subject,input_arg->>'goal',input_value,input_hash,now_arg,now_arg+interval '24 hours');
 INSERT INTO allura.run_state VALUES(g,w,run,1,'ready',NULL,'none','prepare',1,false,now_arg);
 INSERT INTO allura.run_steps SELECT g,w,run,s,'pending',0,0 FROM unnest(ARRAY['prepare','review','handoff']) s;
 receipt:=jsonb_build_object('version','run-operation-v1','id',receipt_id_arg,'operationKey',input_arg->>'operationKey','command','start','runId',run,'actorPrincipalId',actor,'requestDigest',request_hash,'acceptedRevision',1,'journalSeq',1,'acceptedAt',to_char(now_arg AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'phaseAtAcceptance','ready')::text;
 INSERT INTO allura.run_journal VALUES(g,w,run,1,gen_random_uuid(),actor,'started','none',receipt_id_arg,now_arg);
 INSERT INTO allura.run_operation_receipts VALUES(g,w,receipt_id_arg,run,actor,input_arg->>'operationKey','start',request_hash,receipt,1,1,now_arg);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION allura.start_run(text,uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.start_run(text,uuid,jsonb,jsonb) TO allura_app;
