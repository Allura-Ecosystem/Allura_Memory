-- Authenticated device lifecycle; all writes enter through one scoped command.
CREATE TABLE allura.device_enrollments (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL, owner_issuer text NOT NULL, owner_subject text NOT NULL,
 label text NOT NULL CHECK(octet_length(label) BETWEEN 1 AND 80), challenge text NOT NULL CHECK(challenge ~ '^[A-Za-z0-9_-]{43}$'),
 requested_actions text[] NOT NULL, approved_actions text[],
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','completed')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '10 minutes',
 approver_id uuid REFERENCES allura.principals, approver_issuer text, approver_subject text,
 device_id uuid REFERENCES allura.principals, completion_digest text, completion_receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,id),
 FOREIGN KEY(group_id,workspace_id,owner_id) REFERENCES allura.workspace_grants(group_id,workspace_id,principal_id),
 CHECK(requested_actions <@ ARRAY['memory:read','memory:capture','proposal:write','review:read']::text[] AND 'memory:read'=ANY(requested_actions)),
 CHECK(approved_actions IS NULL OR (approved_actions <@ requested_actions AND 'memory:read'=ANY(approved_actions)))
);
CREATE TABLE allura.device_receipts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES allura.principals,
 kind text NOT NULL CHECK(kind IN ('begin','rotate','revoke')), operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,actor_id,kind,operation_key),
 FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE TABLE allura.device_audit (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES allura.principals, auth_method text NOT NULL CHECK(auth_method='cloudflare_access'),
 action text NOT NULL CHECK(action IN ('begin','approve','complete','rotate','revoke')), target_id uuid NOT NULL,
 generation bigint, outcome text NOT NULL CHECK(outcome='succeeded'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,id), FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE TRIGGER device_receipts_immutable BEFORE UPDATE OR DELETE ON allura.device_receipts FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER device_receipts_no_truncate BEFORE TRUNCATE ON allura.device_receipts FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER device_audit_immutable BEFORE UPDATE OR DELETE ON allura.device_audit FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER device_audit_no_truncate BEFORE TRUNCATE ON allura.device_audit FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.device_enrollments,allura.device_receipts,allura.device_audit FROM PUBLIC,allura_app;
ALTER TABLE allura.device_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.device_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY device_audit_read ON allura.device_audit FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'audit:read'));
GRANT SELECT ON allura.device_audit TO allura_app;

CREATE FUNCTION allura.device_human(issuer_arg text,subject_arg text,group_arg text,workspace_arg uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r jsonb;
BEGIN
 r:=allura.resolve_authority(issuer_arg,subject_arg,'human','','',group_arg,workspace_arg::text);
 IF r IS NULL OR NOT (r->>'principalActive')::boolean OR NOT (r->>'membershipActive')::boolean OR NOT (r->>'grantActive')::boolean OR NOT (r->>'tenantActive')::boolean OR (r->>'workspaceLocked')::boolean OR r->>'role' NOT IN ('viewer','curator','workspace_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM allura.lock_authority((r->>'principalId')::uuid,group_arg,workspace_arg);
 -- Caller holds workspace/actor locks; repeat after locking the target human.
 r:=allura.resolve_authority(issuer_arg,subject_arg,'human','','',group_arg,workspace_arg::text);
 IF r IS NULL OR NOT (r->>'principalActive')::boolean OR NOT (r->>'membershipActive')::boolean OR NOT (r->>'grantActive')::boolean OR NOT (r->>'tenantActive')::boolean OR (r->>'workspaceLocked')::boolean THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN r;
END $$;
CREATE FUNCTION allura.device_slots(group_arg text,workspace_arg uuid,owner_arg uuid) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT (SELECT count(*) FROM allura.device_enrollments WHERE group_id=group_arg AND workspace_id=workspace_arg AND owner_id=owner_arg AND state IN ('pending','approved') AND expires_at>clock_timestamp())+
 (SELECT count(*) FROM allura.device_owners d JOIN allura.machine_credentials c ON c.id=d.current_credential_id WHERE d.group_id=group_arg AND d.workspace_id=workspace_arg AND d.owner_id=owner_arg AND NOT d.revoked AND NOT c.revoked AND c.expires_at>clock_timestamp());
$$;
CREATE FUNCTION allura.device_command(group_arg text,workspace_arg uuid,input_arg jsonb,digest_arg text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid; op text:=input_arg->>'kind'; human jsonb; owner_record jsonb; approver jsonb;
 e allura.device_enrollments; d allura.device_owners; prior allura.device_receipts; c allura.machine_credentials;
 receipt jsonb; requested text[]; chosen text[]; action_name text; target uuid; credential uuid; expiry timestamptz; gen bigint;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(group_arg,workspace_arg,CASE WHEN op='approve' THEN 'workspace:grants:manage' ELSE 'memory:read' END) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF op NOT IN ('begin','approve','complete','status','rotate','revoke','list') OR digest_arg !~ '^[a-f0-9]{64}$' OR octet_length(input_arg::text)>4096 THEN RAISE EXCEPTION 'invalid'; END IF;
 actor:=current_setting('allura.principal')::uuid;
 -- Serialize bounded device mutations per workspace, including owner quotas.
 PERFORM pg_advisory_xact_lock(hashtextextended(group_arg||':'||workspace_arg::text,20861028));
 human:=allura.device_human(current_setting('allura.issuer'),current_setting('allura.subject'),group_arg,workspace_arg);
 IF human->>'principalId' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF op IN ('begin','rotate','revoke') THEN
  SELECT * INTO prior FROM allura.device_receipts WHERE group_id=group_arg AND workspace_id=workspace_arg AND actor_id=actor AND kind=op AND operation_key=input_arg->>'operationKey';
  IF FOUND THEN
   IF prior.digest<>digest_arg THEN RAISE EXCEPTION 'conflict'; END IF;
   -- Replays are historical public receipts, never credential reactivation.
   RETURN prior.receipt;
  END IF;
 END IF;
 IF op='begin' THEN
  requested:=ARRAY(SELECT jsonb_array_elements_text(input_arg->'actions'));
  IF cardinality(requested) NOT BETWEEN 1 AND 4 OR NOT requested <@ ARRAY['memory:read','memory:capture','proposal:write','review:read']::text[] OR NOT 'memory:read'=ANY(requested) THEN RAISE EXCEPTION 'invalid'; END IF;
  FOREACH action_name IN ARRAY requested LOOP IF NOT allura.role_allows(human->>'role',false,'human',action_name) THEN RAISE EXCEPTION 'forbidden'; END IF; END LOOP;
  IF allura.device_slots(group_arg,workspace_arg,actor)>=8 THEN RAISE EXCEPTION 'conflict'; END IF;
  INSERT INTO allura.device_enrollments(group_id,workspace_id,owner_id,owner_issuer,owner_subject,label,challenge,requested_actions)
   VALUES(group_arg,workspace_arg,actor,current_setting('allura.issuer'),current_setting('allura.subject'),input_arg->>'label',input_arg->>'challenge',requested) RETURNING * INTO e;
  target:=e.id;receipt:=jsonb_build_object('outcome','pending','enrollmentId',e.id,'revision',e.revision,'expiresAt',e.expires_at);
 ELSIF op IN ('approve','complete','status') THEN
  SELECT * INTO e FROM allura.device_enrollments WHERE group_id=group_arg AND workspace_id=workspace_arg AND id=(input_arg->>'enrollmentId')::uuid FOR UPDATE;
  IF NOT FOUND OR (e.owner_id<>actor AND (op='complete' OR human->>'role'<>'workspace_admin')) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF op='status' THEN RETURN jsonb_build_object('enrollmentId',e.id,'status',CASE WHEN e.state<>'completed' AND e.expires_at<=clock_timestamp() THEN 'expired' ELSE e.state END,'revision',e.revision,'expiresAt',e.expires_at,'deviceId',e.device_id,'requestedActions',e.requested_actions,'approvedActions',e.approved_actions); END IF;
  IF e.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'not_found'; END IF;
  owner_record:=allura.device_human(e.owner_issuer,e.owner_subject,group_arg,workspace_arg);
  IF owner_record->>'principalId' IS DISTINCT FROM e.owner_id::text THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF e.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'not_found'; END IF;
  target:=e.id;
  IF op='approve' THEN
   IF human->>'role'<>'workspace_admin' THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF e.state<>'pending' OR e.revision<>(input_arg->>'expectedRevision')::bigint THEN RAISE EXCEPTION 'conflict'; END IF;
   chosen:=ARRAY(SELECT jsonb_array_elements_text(input_arg->'actions'));
   IF cardinality(chosen) NOT BETWEEN 1 AND 4 OR NOT chosen <@ e.requested_actions OR NOT 'memory:read'=ANY(chosen) THEN RAISE EXCEPTION 'invalid'; END IF;
   FOREACH action_name IN ARRAY chosen LOOP IF NOT allura.role_allows(owner_record->>'role',false,'human',action_name) THEN RAISE EXCEPTION 'forbidden'; END IF; END LOOP;
   UPDATE allura.device_enrollments SET state='approved',revision=revision+1,approved_actions=chosen,approver_id=actor,approver_issuer=current_setting('allura.issuer'),approver_subject=current_setting('allura.subject') WHERE group_id=group_arg AND workspace_id=workspace_arg AND id=e.id RETURNING revision INTO gen;
   receipt:=jsonb_build_object('outcome','approved','enrollmentId',e.id,'revision',gen,'actions',chosen);gen:=NULL;
  ELSE
   IF input_arg->>'proofChallenge' IS DISTINCT FROM e.challenge THEN RAISE EXCEPTION 'not_found'; END IF;
   IF e.state='completed' THEN
    IF e.completion_digest<>digest_arg THEN RAISE EXCEPTION 'conflict'; END IF;
    RETURN e.completion_receipt;
   END IF;
   IF e.state<>'approved' THEN RAISE EXCEPTION 'conflict'; END IF;
   approver:=allura.device_human(e.approver_issuer,e.approver_subject,group_arg,workspace_arg);
   IF approver->>'principalId' IS DISTINCT FROM e.approver_id::text OR approver->>'role'<>'workspace_admin' THEN RAISE EXCEPTION 'forbidden'; END IF;
   FOREACH action_name IN ARRAY e.approved_actions LOOP IF NOT allura.role_allows(owner_record->>'role',false,'human',action_name) THEN RAISE EXCEPTION 'forbidden'; END IF; END LOOP;
   IF input_arg->>'tokenDigest' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid'; END IF;
   IF e.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'not_found'; END IF;
   target:=gen_random_uuid();credential:=gen_random_uuid();expiry:=clock_timestamp()+interval '30 days';gen:=1;
   INSERT INTO allura.principals(id,kind) VALUES(target,'device');
   INSERT INTO allura.memberships(group_id,principal_id,active,org_admin,workspace_create) VALUES(group_arg,target,true,false,false);
   INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,review_approve,active,issuer) VALUES(group_arg,workspace_arg,target,CASE WHEN cardinality(e.approved_actions)=1 THEN 'viewer' ELSE 'curator' END,false,true,e.approver_id);
   INSERT INTO allura.machine_credentials(id,principal_id,digest,group_id,workspace_id,actions,expires_at,revoked) VALUES(credential,target,decode(input_arg->>'tokenDigest','hex'),group_arg,workspace_arg,e.approved_actions,expiry,false);
   INSERT INTO allura.device_owners(device_id,group_id,workspace_id,owner_id,owner_issuer,owner_subject,current_credential_id,generation,revoked) VALUES(target,group_arg,workspace_arg,e.owner_id,e.owner_issuer,e.owner_subject,credential,1,false);
   receipt:=jsonb_build_object('outcome','issued','enrollmentId',e.id,'deviceId',target,'credentialId',credential,'generation',1,'expiresAt',expiry,'actions',e.approved_actions);
   UPDATE allura.device_enrollments SET state='completed',revision=revision+1,device_id=target,completion_digest=digest_arg,completion_receipt=receipt WHERE group_id=group_arg AND workspace_id=workspace_arg AND id=e.id;
  END IF;
 ELSIF op IN ('rotate','revoke') THEN
  SELECT * INTO d FROM allura.device_owners WHERE group_id=group_arg AND workspace_id=workspace_arg AND device_id=(input_arg->>'deviceId')::uuid FOR UPDATE;
  IF NOT FOUND OR (d.owner_id<>actor AND (op='rotate' OR human->>'role'<>'workspace_admin')) THEN RAISE EXCEPTION 'not_found'; END IF;
  target:=d.device_id;gen:=d.generation;
  IF op='revoke' THEN
   UPDATE allura.machine_credentials SET revoked=true WHERE principal_id=d.device_id;
   UPDATE allura.device_owners SET revoked=true WHERE device_id=d.device_id;
   receipt:=jsonb_build_object('outcome','revoked','deviceId',target,'generation',gen);
  ELSE
   IF d.revoked OR d.generation<>(input_arg->>'expectedGeneration')::bigint OR d.generation>=9007199254740991 THEN RAISE EXCEPTION 'conflict'; END IF;
   PERFORM allura.lock_authority(d.device_id,group_arg,workspace_arg);
   owner_record:=allura.device_human(d.owner_issuer,d.owner_subject,group_arg,workspace_arg);
   SELECT * INTO c FROM allura.machine_credentials WHERE id=d.current_credential_id FOR UPDATE;
   IF NOT FOUND OR c.revoked OR input_arg->>'tokenDigest'=encode(c.digest,'hex') THEN RAISE EXCEPTION 'conflict'; END IF;
   IF c.expires_at<=clock_timestamp() AND allura.device_slots(group_arg,workspace_arg,actor)>=8 THEN RAISE EXCEPTION 'conflict'; END IF;
   IF input_arg->>'tokenDigest' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid'; END IF;
   credential:=gen_random_uuid();expiry:=clock_timestamp()+interval '30 days';gen:=gen+1;
   UPDATE allura.machine_credentials SET revoked=true WHERE principal_id=d.device_id;
   INSERT INTO allura.machine_credentials(id,principal_id,digest,group_id,workspace_id,actions,expires_at,revoked) VALUES(credential,target,decode(input_arg->>'tokenDigest','hex'),group_arg,workspace_arg,c.actions,expiry,false);
   UPDATE allura.device_owners SET current_credential_id=credential,generation=gen WHERE device_id=d.device_id;
   receipt:=jsonb_build_object('outcome','rotated','deviceId',target,'credentialId',credential,'generation',gen,'expiresAt',expiry,'actions',c.actions);
  END IF;
 ELSE
  RETURN jsonb_build_object('devices',coalesce((SELECT jsonb_agg(x) FROM (SELECT link.device_id AS "deviceId",link.generation,link.revoked,cred.expires_at AS "expiresAt" FROM allura.device_owners link JOIN allura.machine_credentials cred ON cred.id=link.current_credential_id WHERE link.group_id=group_arg AND link.workspace_id=workspace_arg AND link.owner_id=actor ORDER BY link.created_at DESC,link.device_id LIMIT 100) x),'[]'::jsonb),'truncated',EXISTS(SELECT FROM allura.device_owners link WHERE link.group_id=group_arg AND link.workspace_id=workspace_arg AND link.owner_id=actor OFFSET 100 LIMIT 1));
 END IF;
 INSERT INTO allura.device_audit(group_id,workspace_id,actor_id,auth_method,action,target_id,generation,outcome) VALUES(group_arg,workspace_arg,actor,'cloudflare_access',op,target,gen,'succeeded');
 IF op IN ('begin','rotate','revoke') THEN INSERT INTO allura.device_receipts(group_id,workspace_id,actor_id,kind,operation_key,digest,receipt) VALUES(group_arg,workspace_arg,actor,op,input_arg->>'operationKey',digest_arg,receipt); END IF;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION allura.device_human(text,text,text,uuid),allura.device_slots(text,uuid,uuid),allura.device_command(text,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.device_command(text,uuid,jsonb,text) TO allura_app;
