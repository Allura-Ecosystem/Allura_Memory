-- Access lifecycle. New migration: never rewrite the accepted 001 checksum.
CREATE TABLE allura.workspace_creations (
 group_id text NOT NULL REFERENCES allura.tenants, id uuid NOT NULL DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL DEFAULT gen_random_uuid(),
 creator uuid NOT NULL REFERENCES allura.principals, nominee uuid NOT NULL REFERENCES allura.principals, creator_credential bytea,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200), state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','declined')),
 PRIMARY KEY(group_id,id), FOREIGN KEY(group_id,creator) REFERENCES allura.memberships, FOREIGN KEY(group_id,nominee) REFERENCES allura.memberships
);
CREATE TABLE allura.workspace_invitations (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 issuer uuid NOT NULL REFERENCES allura.principals, target uuid NOT NULL REFERENCES allura.principals,
 role text NOT NULL CHECK(role IN ('viewer','curator','workspace_admin')), review_approve boolean NOT NULL DEFAULT false,
 mode text NOT NULL CHECK(mode IN ('invite','transfer','recover')), base_revision bigint NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','declined','revoked','expired')),
 expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,id), FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces,
 FOREIGN KEY(group_id,issuer) REFERENCES allura.memberships, FOREIGN KEY(group_id,target) REFERENCES allura.memberships
);
-- Unknown workspace selectors are retained only as private access requests, not
-- workspace authority/content. This prevents existence leaks from request status.
CREATE TABLE allura.access_requests (
 group_id text NOT NULL REFERENCES allura.tenants, workspace_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 requester uuid NOT NULL REFERENCES allura.principals, role text NOT NULL CHECK(role IN ('viewer','curator','workspace_admin')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000), base_revision bigint NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','approved-with-changes','denied','cancelled')),
 approved_role text CHECK(approved_role IN ('viewer','curator','workspace_admin')), category text CHECK(category IN ('not_eligible','different_access','insufficient_information','other')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,id), FOREIGN KEY(group_id,requester) REFERENCES allura.memberships
);
CREATE TABLE allura.access_notifications (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 recipient uuid NOT NULL REFERENCES allura.principals, request_id uuid NOT NULL, outcome text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,id),
 FOREIGN KEY(group_id,workspace_id,request_id) REFERENCES allura.access_requests, FOREIGN KEY(group_id,recipient) REFERENCES allura.memberships
);
CREATE TRIGGER notifications_immutable BEFORE UPDATE OR DELETE ON allura.access_notifications FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER notifications_no_truncate BEFORE TRUNCATE ON allura.access_notifications FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE FUNCTION allura.active_human(g text,p uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,allura AS $$
 SELECT EXISTS(SELECT FROM allura.principals a JOIN allura.memberships m ON m.principal_id=a.id JOIN allura.tenants t USING(group_id) WHERE a.id=p AND a.kind='human' AND a.active AND m.group_id=g AND m.active AND t.active);
$$;
ALTER TABLE allura.machine_credentials DROP CONSTRAINT machine_credentials_actions_check;
ALTER TABLE allura.machine_credentials ADD CONSTRAINT machine_credentials_actions_check CHECK(actions <@ ARRAY['memory:read','memory:capture','evidence:read','proposal:write','review:read','memory:delete','audit:read','health:read','workspace:create']::text[]);
CREATE FUNCTION allura.valid_service_creator(g text,p uuid,d bytea) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,allura AS $$
 SELECT EXISTS(SELECT FROM allura.machine_credentials c JOIN allura.principals a ON a.id=c.principal_id JOIN allura.memberships m ON m.principal_id=a.id AND m.group_id=c.group_id JOIN allura.tenants t ON t.group_id=m.group_id JOIN allura.workspaces w ON w.group_id=c.group_id AND w.id=c.workspace_id WHERE c.digest=d AND a.id=p AND a.kind='service' AND a.active AND m.group_id=g AND m.active AND m.workspace_create AND t.active AND NOT w.locked AND NOT c.revoked AND c.expires_at>clock_timestamp() AND 'workspace:create'=ANY(c.actions));
$$;
CREATE FUNCTION allura.service_creation(p uuid,d text,g text,nominee_arg uuid,name_arg text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE creation allura.workspace_creations;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(g,23002));
 PERFORM a.id FROM allura.principals a JOIN allura.memberships m ON m.principal_id=a.id WHERE m.group_id=g ORDER BY a.id FOR SHARE OF a,m;
 PERFORM 1 FROM allura.machine_credentials WHERE principal_id=p FOR SHARE;
 PERFORM 1 FROM allura.tenants WHERE group_id=g FOR SHARE;
 PERFORM 1 FROM allura.workspaces WHERE group_id=g FOR SHARE;
 IF NOT allura.valid_service_creator(g,p,decode(d,'hex')) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT allura.active_human(g,nominee_arg) THEN RAISE EXCEPTION 'invalid'; END IF;
 IF name_arg IS NULL OR length(name_arg) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid'; END IF;
 INSERT INTO allura.workspace_creations(group_id,creator,nominee,creator_credential,name) VALUES(g,p,nominee_arg,decode(d,'hex'),name_arg) RETURNING * INTO creation;
 RETURN jsonb_build_object('outcome','pending','id',creation.id,'workspaceId',creation.workspace_id);
END $$;
CREATE FUNCTION allura.grant_admin(g text,w uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,allura AS $$
 SELECT allura.active_human(g,p) AND EXISTS(SELECT FROM allura.workspace_grants a JOIN allura.workspaces b ON b.group_id=a.group_id AND b.id=a.workspace_id WHERE a.group_id=g AND a.workspace_id=w AND a.principal_id=p AND a.active AND a.role='workspace_admin' AND NOT b.locked);
$$;
CREATE FUNCTION allura.admin_count(g text,w uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,allura AS $$
 SELECT count(*) FROM allura.workspace_grants a WHERE a.group_id=g AND a.workspace_id=w AND a.active AND a.role='workspace_admin' AND allura.active_human(g,a.principal_id);
$$;
CREATE FUNCTION allura.change_grant(g text,w uuid,target_arg uuid,role_arg text,review_arg boolean,active_arg boolean,revision_arg bigint,issuer_arg uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,allura AS $$
DECLARE previous allura.workspace_grants;
BEGIN
 IF role_arg IS NULL OR role_arg NOT IN ('viewer','curator','workspace_admin') OR review_arg IS NULL OR active_arg IS NULL OR revision_arg IS NULL OR revision_arg<0 THEN RAISE EXCEPTION 'invalid'; END IF;
 IF NOT allura.active_human(g,target_arg) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO previous FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=target_arg FOR UPDATE;
 IF coalesce(previous.revision,0)<>revision_arg THEN RAISE EXCEPTION 'conflict'; END IF;
 IF previous.active AND previous.role='workspace_admin' AND (NOT active_arg OR role_arg<>'workspace_admin') AND allura.admin_count(g,w)<=1 THEN RAISE EXCEPTION 'conflict'; END IF;
 INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,review_approve,active,issuer,revision)
 VALUES(g,w,target_arg,role_arg,review_arg,active_arg,issuer_arg,revision_arg+1)
 ON CONFLICT(group_id,workspace_id,principal_id) DO UPDATE SET role=excluded.role,review_approve=excluded.review_approve,active=excluded.active,issuer=excluded.issuer,revision=excluded.revision,created_at=clock_timestamp();
END $$;
CREATE FUNCTION allura.access_command(issuer_arg text,subject_arg text,g text,w uuid,command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid; op text:=command->>'op'; target_arg uuid; role_arg text:=command->>'role';
 item_id uuid; item allura.workspace_invitations; req allura.access_requests; creation allura.workspace_creations;
 before_grant allura.workspace_grants; rev bigint; review_arg boolean:=coalesce((command->>'reviewApprove')::boolean,false);
 org_admin boolean; new_id uuid:=gen_random_uuid(); outcome text; members jsonb; pending bigint; admin_total bigint;
BEGIN
 -- Serializes admin transitions per tenant; DB rows below serialize security
 -- revocation with these decisions. No role/grant is inferred from issuer text.
 PERFORM pg_advisory_xact_lock(hashtextextended(g,23002));
 SELECT p.id INTO actor FROM allura.identity_bindings b JOIN allura.principals p ON p.id=b.principal_id
 WHERE b.issuer=issuer_arg AND b.subject=subject_arg AND b.identity_kind='human' AND b.active AND p.active AND p.kind='human';
 IF actor IS NULL OR NOT allura.active_human(g,actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM p.id FROM allura.principals p JOIN allura.memberships m ON m.principal_id=p.id WHERE m.group_id=g ORDER BY p.id FOR SHARE OF p,m;
 PERFORM 1 FROM allura.identity_bindings WHERE principal_id=actor FOR SHARE;
 PERFORM 1 FROM allura.tenants WHERE group_id=g FOR SHARE;
 -- Recheck after locks; an identity revoked while waiting cannot act.
 IF NOT allura.active_human(g,actor) OR NOT EXISTS(SELECT FROM allura.identity_bindings WHERE issuer=issuer_arg AND subject=subject_arg AND identity_kind='human' AND principal_id=actor AND active) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT m.org_admin INTO org_admin FROM allura.memberships m WHERE group_id=g AND principal_id=actor;
 IF command ? 'target' THEN target_arg:=(command->>'target')::uuid; END IF;
 IF command ? 'id' THEN item_id:=(command->>'id')::uuid; END IF;
 IF op='create' THEN
   IF NOT EXISTS(SELECT FROM allura.memberships WHERE group_id=g AND principal_id=actor AND workspace_create) THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF NOT allura.active_human(g,target_arg) THEN RAISE EXCEPTION 'invalid'; END IF;
   IF command->>'name' IS NULL OR length(command->>'name') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid'; END IF;
   IF target_arg<>actor THEN
     INSERT INTO allura.workspace_creations(group_id,creator,nominee,name) VALUES(g,actor,target_arg,command->>'name') RETURNING * INTO creation;
     RETURN jsonb_build_object('outcome','pending','id',creation.id,'workspaceId',creation.workspace_id);
   END IF;
   w:=gen_random_uuid();
   INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(g,w,command->>'name',actor);
   PERFORM allura.change_grant(g,w,actor,'workspace_admin',false,true,0,actor);
   INSERT INTO allura.access_audit(group_id,workspace_id,actor_id,target_id,action,outcome,category,after_role) VALUES(g,w,actor,actor,'create','succeeded','authorized','workspace_admin');
   RETURN jsonb_build_object('outcome','succeeded','workspaceId',w);
 ELSIF op IN ('accept_creation','decline_creation') THEN
   SELECT * INTO creation FROM allura.workspace_creations WHERE group_id=g AND id=item_id AND nominee=actor FOR UPDATE;
   IF creation.id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF creation.state<>'pending' THEN RAISE EXCEPTION 'conflict'; END IF;
   IF op='decline_creation' THEN UPDATE allura.workspace_creations SET state='declined' WHERE group_id=g AND id=item_id; RETURN jsonb_build_object('outcome','declined'); END IF;
   IF creation.creator_credential IS NOT NULL THEN
     PERFORM 1 FROM allura.machine_credentials WHERE principal_id=creation.creator FOR SHARE;
     PERFORM 1 FROM allura.workspaces WHERE group_id=g FOR SHARE;
     IF NOT allura.valid_service_creator(g,creation.creator,creation.creator_credential) THEN RAISE EXCEPTION 'forbidden'; END IF;
   ELSIF NOT allura.active_human(g,creation.creator) OR NOT EXISTS(SELECT FROM allura.memberships WHERE group_id=g AND principal_id=creation.creator AND workspace_create AND active) THEN RAISE EXCEPTION 'forbidden'; END IF;
   w:=creation.workspace_id;
   INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(g,w,creation.name,creation.creator);
   PERFORM allura.change_grant(g,w,actor,'workspace_admin',false,true,0,creation.creator);
   UPDATE allura.workspace_creations SET state='accepted' WHERE group_id=g AND id=item_id;
   INSERT INTO allura.access_audit(group_id,workspace_id,actor_id,target_id,action,outcome,category,after_role) VALUES(g,w,actor,actor,'create','succeeded','authorized','workspace_admin');
   RETURN jsonb_build_object('outcome','succeeded','workspaceId',w);
 ELSIF op='remove_member' THEN
   IF NOT org_admin THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF target_arg IS NULL OR target_arg=actor THEN RAISE EXCEPTION 'conflict'; END IF;
   PERFORM 1 FROM allura.workspaces WHERE group_id=g ORDER BY id FOR UPDATE;
   IF EXISTS(SELECT FROM allura.workspace_grants a JOIN allura.workspaces b ON b.group_id=a.group_id AND b.id=a.workspace_id WHERE a.group_id=g AND a.principal_id=target_arg AND a.active AND a.role='workspace_admin' AND NOT b.locked AND allura.admin_count(g,a.workspace_id)<=1) THEN RAISE EXCEPTION 'conflict'; END IF;
   UPDATE allura.memberships SET active=false WHERE group_id=g AND principal_id=target_arg;
   INSERT INTO allura.access_audit(group_id,workspace_id,actor_id,target_id,action,outcome,category) SELECT g,id,actor,target_arg,'revoke','succeeded','authorized' FROM allura.workspaces WHERE group_id=g;
   RETURN jsonb_build_object('outcome','succeeded');
 END IF;
 IF w IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
 PERFORM 1 FROM allura.workspaces WHERE group_id=g AND id=w FOR UPDATE;
 IF op='request' THEN
   IF role_arg IS NULL OR role_arg NOT IN ('viewer','curator','workspace_admin') OR length(coalesce(command->>'reason','')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid'; END IF;
   IF EXISTS(SELECT FROM allura.access_requests WHERE group_id=g AND workspace_id=w AND requester=actor AND role=role_arg AND reason=command->>'reason' AND state IN ('pending','denied')) THEN RAISE EXCEPTION 'conflict'; END IF;
   SELECT revision INTO rev FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=actor;
   INSERT INTO allura.access_requests(group_id,workspace_id,id,requester,role,reason,base_revision) VALUES(g,w,new_id,actor,role_arg,command->>'reason',coalesce(rev,0));
   RETURN jsonb_build_object('outcome','pending','id',new_id);
 ELSIF op IN ('request_status','cancel_request') THEN
   SELECT * INTO req FROM allura.access_requests WHERE group_id=g AND workspace_id=w AND id=item_id AND requester=actor;
   IF req.id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF op='cancel_request' THEN
     IF req.state<>'pending' THEN RAISE EXCEPTION 'conflict'; END IF;
     UPDATE allura.access_requests SET state='cancelled' WHERE group_id=g AND workspace_id=w AND id=item_id;
     RETURN jsonb_build_object('outcome','cancelled');
   END IF;
   RETURN jsonb_build_object('outcome',CASE WHEN req.state='pending' AND allura.admin_count(g,w)=0 THEN 'unavailable' ELSE req.state END,'role',coalesce(req.approved_role,req.role),'category',req.category);
 ELSIF op='metadata' THEN
   IF NOT org_admin THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF NOT EXISTS(SELECT FROM allura.workspaces WHERE group_id=g AND id=w) THEN RAISE EXCEPTION 'forbidden'; END IF;
   SELECT coalesce(jsonb_agg(jsonb_build_object('principalId',principal_id,'role',role,'reviewApprove',review_approve,'active',active,'issuer',issuer,'issuedAt',created_at)),'[]') INTO members FROM (SELECT * FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w ORDER BY principal_id LIMIT 100) bounded;
   SELECT count(*) INTO pending FROM allura.access_requests WHERE group_id=g AND workspace_id=w AND state='pending';
   admin_total:=allura.admin_count(g,w);
   RETURN (SELECT jsonb_build_object('workspaceId',id,'name',display_name,'createdAt',created_at,'creator',created_by,'state',CASE WHEN locked THEN 'locked' ELSE 'active' END,'grants',members,'grantsTruncated',(SELECT count(*)>100 FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w),'activeAdministrators',admin_total,'orphaned',admin_total=0,'pendingRequests',pending,'label','Organization administration — no workspace content access') FROM allura.workspaces WHERE group_id=g AND id=w);
 END IF;
 IF NOT EXISTS(SELECT FROM allura.workspaces WHERE group_id=g AND id=w AND NOT locked) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF op IN ('accept','decline','revoke_invite','invite_status') THEN
   SELECT * INTO item FROM allura.workspace_invitations WHERE group_id=g AND workspace_id=w AND id=item_id FOR UPDATE;
   IF item.id IS NULL OR (item.target<>actor AND (op<>'revoke_invite' OR item.issuer<>actor)) THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF op='invite_status' THEN RETURN jsonb_build_object('outcome',CASE WHEN item.state='pending' AND item.expires_at<=clock_timestamp() THEN 'expired' ELSE item.state END,'workspaceName',(SELECT display_name FROM allura.workspaces WHERE group_id=g AND id=w),'role',item.role,'reviewApprove',item.review_approve,'issuer',item.issuer,'expiresAt',item.expires_at); END IF;
   IF item.state<>'pending' THEN RAISE EXCEPTION 'conflict'; END IF;
   IF item.expires_at<=clock_timestamp() THEN UPDATE allura.workspace_invitations SET state='expired' WHERE group_id=g AND workspace_id=w AND id=item_id; RETURN jsonb_build_object('outcome','expired'); END IF;
   IF op='decline' THEN outcome:='declined';
   ELSIF op='revoke_invite' THEN
     IF NOT allura.grant_admin(g,w,actor) AND NOT (item.mode='recover' AND org_admin) THEN RAISE EXCEPTION 'forbidden'; END IF;
     outcome:='revoked';
   ELSE
     IF NOT allura.active_human(g,item.issuer) THEN RAISE EXCEPTION 'forbidden'; END IF;
     IF item.mode='recover' THEN
       IF NOT EXISTS(SELECT FROM allura.memberships m WHERE m.group_id=g AND m.principal_id=item.issuer AND m.org_admin AND m.active) THEN RAISE EXCEPTION 'forbidden'; END IF;
       IF allura.admin_count(g,w)<>0 THEN RAISE EXCEPTION 'conflict'; END IF;
     ELSIF NOT allura.grant_admin(g,w,item.issuer) THEN RAISE EXCEPTION 'forbidden'; END IF;
     PERFORM allura.change_grant(g,w,actor,item.role,item.review_approve,true,item.base_revision,item.issuer);
     IF item.mode='transfer' THEN
       SELECT * INTO before_grant FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=item.issuer;
       PERFORM allura.change_grant(g,w,item.issuer,'viewer',false,true,before_grant.revision,actor);
       INSERT INTO allura.access_audit(group_id,workspace_id,actor_id,target_id,action,outcome,category,before_role,after_role) VALUES(g,w,actor,item.issuer,'grant','succeeded','authorized',before_grant.role,'viewer');
     END IF;
     outcome:='accepted';
   END IF;
   UPDATE allura.workspace_invitations SET state=outcome WHERE group_id=g AND workspace_id=w AND id=item_id;
   INSERT INTO allura.access_audit(group_id,workspace_id,actor_id,target_id,action,outcome,category,after_role) VALUES(g,w,actor,item.target,'accept','succeeded','authorized',CASE WHEN outcome='accepted' THEN item.role ELSE NULL END);
   RETURN jsonb_build_object('outcome',outcome);
 END IF;
 IF op='recover' THEN
   IF NOT org_admin THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF target_arg=actor OR allura.admin_count(g,w)<>0 THEN RAISE EXCEPTION 'conflict'; END IF;
 ELSE
   IF NOT allura.grant_admin(g,w,actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
 END IF;
 IF op='decide_request' THEN
   SELECT * INTO req FROM allura.access_requests WHERE group_id=g AND workspace_id=w AND id=item_id FOR UPDATE;
   IF req.id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
   IF req.state<>'pending' OR req.requester=actor THEN RAISE EXCEPTION 'conflict'; END IF;
   IF command->>'decision'='approve' THEN
     IF role_arg IS NULL OR array_position(ARRAY['viewer','curator','workspace_admin'],role_arg) IS NULL OR array_position(ARRAY['viewer','curator','workspace_admin'],role_arg)>array_position(ARRAY['viewer','curator','workspace_admin'],req.role) THEN RAISE EXCEPTION 'invalid'; END IF;
     SELECT * INTO before_grant FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=req.requester;
     PERFORM allura.change_grant(g,w,req.requester,role_arg,false,true,req.base_revision,actor);
     outcome:=CASE WHEN role_arg=req.role THEN 'approved' ELSE 'approved-with-changes' END;
   ELSIF command->>'decision'='deny' AND command->>'category' IN ('not_eligible','different_access','insufficient_information','other') THEN outcome:='denied';
   ELSE RAISE EXCEPTION 'invalid'; END IF;
   UPDATE allura.access_requests SET state=outcome,approved_role=CASE WHEN outcome<>'denied' THEN role_arg ELSE NULL END,category=command->>'category' WHERE group_id=g AND workspace_id=w AND id=item_id;
   INSERT INTO allura.access_notifications(group_id,workspace_id,recipient,request_id,outcome) VALUES(g,w,req.requester,item_id,outcome);
   INSERT INTO allura.access_audit(group_id,workspace_id,actor_id,target_id,action,outcome,category,after_role) VALUES(g,w,actor,req.requester,'grant',CASE WHEN outcome='denied' THEN 'denied' ELSE 'succeeded' END,'authorized',CASE WHEN outcome<>'denied' THEN role_arg ELSE NULL END);
   RETURN jsonb_build_object('outcome',outcome);
 END IF;
 IF target_arg IS NULL OR NOT allura.active_human(g,target_arg) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF target_arg=actor THEN RAISE EXCEPTION 'conflict'; END IF;
 SELECT * INTO before_grant FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=target_arg;
 IF op IN ('invite','transfer','recover') THEN
   IF op IN ('transfer','recover') THEN role_arg:='workspace_admin'; review_arg:=false; END IF;
   IF role_arg IS NULL OR role_arg NOT IN ('viewer','curator','workspace_admin') THEN RAISE EXCEPTION 'invalid'; END IF;
   INSERT INTO allura.workspace_invitations(group_id,workspace_id,id,issuer,target,role,review_approve,mode,base_revision,expires_at) VALUES(g,w,new_id,actor,target_arg,role_arg,review_arg,CASE WHEN op='invite' THEN 'invite' ELSE op END,coalesce(before_grant.revision,0),(command->>'expiresAt')::timestamptz);
   INSERT INTO allura.access_audit(group_id,workspace_id,actor_id,target_id,action,outcome,category) VALUES(g,w,actor,target_arg,CASE WHEN op='recover' THEN 'recover' ELSE 'invite' END,'succeeded',CASE WHEN op='recover' THEN 'orphan' ELSE 'authorized' END);
   RETURN jsonb_build_object('outcome','pending','id',new_id);
 ELSIF op IN ('grant','revoke') THEN
   rev:=(command->>'revision')::bigint;
   IF op='revoke' THEN role_arg:=before_grant.role; review_arg:=false; END IF;
   PERFORM allura.change_grant(g,w,target_arg,role_arg,review_arg,op<>'revoke',rev,actor);
   INSERT INTO allura.access_audit(group_id,workspace_id,actor_id,target_id,action,outcome,category,before_role,after_role) VALUES(g,w,actor,target_arg,op,'succeeded','authorized',before_grant.role,CASE WHEN op='grant' THEN role_arg ELSE NULL END);
   RETURN jsonb_build_object('outcome','succeeded','revision',rev+1);
 END IF;
 RAISE EXCEPTION 'invalid';
END $$;
REVOKE ALL ON allura.workspace_creations,allura.workspace_invitations,allura.access_requests,allura.access_notifications FROM PUBLIC,allura_app;
REVOKE ALL ON FUNCTION allura.active_human(text,uuid),allura.grant_admin(text,uuid,uuid),allura.admin_count(text,uuid),allura.change_grant(text,uuid,uuid,text,boolean,boolean,bigint,uuid),allura.access_command(text,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.access_command(text,text,text,uuid,jsonb) TO allura_app;
REVOKE ALL ON FUNCTION allura.valid_service_creator(text,uuid,bytea),allura.service_creation(uuid,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.service_creation(uuid,text,text,uuid,text) TO allura_app;
CREATE FUNCTION allura.resolve_member(issuer_arg text,subject_arg text,g text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT jsonb_build_object('principalId',p.id,'groupId',g,'active',p.active AND b.active AND m.active AND t.active)
 FROM allura.identity_bindings b JOIN allura.principals p ON p.id=b.principal_id JOIN allura.memberships m ON m.principal_id=p.id JOIN allura.tenants t ON t.group_id=m.group_id
 WHERE b.issuer=issuer_arg AND b.subject=subject_arg AND b.identity_kind='human' AND p.kind='human' AND m.group_id=g;
$$;
REVOKE ALL ON FUNCTION allura.resolve_member(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.resolve_member(text,text,text) TO allura_app;
