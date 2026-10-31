-- Selected client authority is separate from owner delegations and grants.
ALTER TABLE allura.oauth_transactions ADD COLUMN mode text NOT NULL DEFAULT 'owner' CHECK(mode IN ('owner','selected'));
ALTER TABLE allura.oauth_transactions ADD COLUMN selected_connection_id uuid;
ALTER TABLE allura.oauth_transactions DROP CONSTRAINT oauth_transactions_actions_check;
ALTER TABLE allura.oauth_transactions ADD CONSTRAINT oauth_transactions_actions_check CHECK(
 (mode='owner' AND cardinality(actions) BETWEEN 1 AND 8 AND actions <@ ARRAY['memory:read','memory:capture','evidence:read','proposal:write','review:read','memory:delete','audit:read','health:read']::text[])
 OR (mode='selected' AND actions=ARRAY['memory:selected:read']::text[]));
CREATE FUNCTION allura.oauth_mode_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,allura AS $$
BEGIN IF NEW.mode IS DISTINCT FROM OLD.mode THEN RAISE EXCEPTION 'invalid'; END IF; RETURN NEW; END $$;
CREATE TRIGGER oauth_mode_immutable BEFORE UPDATE ON allura.oauth_transactions FOR EACH ROW EXECUTE FUNCTION allura.oauth_mode_immutable();
REVOKE ALL ON FUNCTION allura.oauth_mode_immutable() FROM PUBLIC;
CREATE TABLE allura.selected_connections (
 id uuid PRIMARY KEY, group_id text NOT NULL,workspace_id uuid NOT NULL,
 recipient_id uuid NOT NULL REFERENCES allura.principals,recipient_issuer text NOT NULL,recipient_subject text NOT NULL,
 client_id text NOT NULL,resource text NOT NULL,principal_id uuid REFERENCES allura.principals,
 revoked boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
-- Deliberately no cascading/link FK: classification survives a missing link.
CREATE TABLE allura.selected_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digest text NOT NULL UNIQUE CHECK(digest ~ '^[a-f0-9]{64}$'),
 connection_id uuid NOT NULL,principal_id uuid NOT NULL REFERENCES allura.principals,
 group_id text NOT NULL,workspace_id uuid NOT NULL,client_id text NOT NULL,resource text NOT NULL,
 expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,
 FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE TABLE allura.selected_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id text NOT NULL,workspace_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES allura.principals,connection_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('approve','issue','revoke','get')),memory_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE TRIGGER selected_audit_immutable BEFORE UPDATE OR DELETE ON allura.selected_audit FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER selected_audit_no_truncate BEFORE TRUNCATE ON allura.selected_audit FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.selected_connections,allura.selected_credentials,allura.selected_audit FROM PUBLIC,allura_app;

CREATE FUNCTION allura.selected_begin(digest_arg text,input_arg jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(20861030);
 DELETE FROM allura.oauth_transactions WHERE expires_at<clock_timestamp() AND (code_expires_at IS NULL OR code_expires_at<clock_timestamp());
 IF input_arg IS NULL OR jsonb_typeof(input_arg)<>'object' OR octet_length(input_arg::text)>4096 OR (SELECT count(*) FROM allura.oauth_transactions)>=100
  OR input_arg->'actions' IS DISTINCT FROM '["memory:selected:read"]'::jsonb
  OR EXISTS(SELECT FROM jsonb_object_keys(input_arg) k WHERE k<>ALL(ARRAY['clientId','redirectUri','resource','actions','challenge','state'])) THEN RAISE EXCEPTION 'invalid'; END IF;
 INSERT INTO allura.oauth_transactions(digest,client_id,redirect_uri,resource,actions,challenge,state,mode)
 VALUES(digest_arg,input_arg->>'clientId',input_arg->>'redirectUri',input_arg->>'resource',ARRAY['memory:selected:read'],input_arg->>'challenge',input_arg->>'state','selected');
END $$;

-- Private multiparty locking, with the tenant advisory key already held.
-- Lock candidate issuers before validating; never substitute an actor identity.
CREATE FUNCTION allura.selected_human(issuer_arg text,subject_arg text,g text,w uuid,eligible boolean) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid; people uuid[]; member jsonb;
BEGIN
 member:=allura.resolve_member(issuer_arg,subject_arg,g);actor:=(member->>'principalId')::uuid;
 IF NOT coalesce((member->>'active')::boolean,false) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT array_agg(DISTINCT p) INTO people FROM (SELECT actor AS p UNION SELECT issuer_id FROM allura.memory_shares WHERE group_id=g AND workspace_id=w AND recipient_id=actor) candidates;
 PERFORM p.id FROM allura.principals p JOIN allura.memberships m ON m.principal_id=p.id WHERE m.group_id=g AND p.id=ANY(people) ORDER BY p.id FOR SHARE OF p,m;
 PERFORM 1 FROM allura.identity_bindings WHERE principal_id=ANY(people) ORDER BY principal_id,issuer,subject,identity_kind FOR SHARE;
 PERFORM 1 FROM allura.tenants WHERE group_id=g FOR SHARE;
 PERFORM 1 FROM allura.workspaces WHERE group_id=g AND id=w FOR SHARE;
 PERFORM 1 FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=ANY(people) ORDER BY principal_id FOR SHARE;
 member:=allura.resolve_member(issuer_arg,subject_arg,g);
 IF NOT coalesce((member->>'active')::boolean,false) OR member->>'principalId' IS DISTINCT FROM actor::text OR NOT EXISTS(SELECT FROM allura.workspaces WHERE group_id=g AND id=w AND NOT locked) THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM 1 FROM allura.memory_shares WHERE group_id=g AND workspace_id=w AND recipient_id=actor ORDER BY memory_id FOR SHARE;
 IF eligible AND NOT EXISTS(SELECT FROM allura.memory_shares s WHERE s.group_id=g AND s.workspace_id=w AND s.recipient_id=actor AND s.active AND allura.grant_admin(g,w,s.issuer_id)
  AND EXISTS(SELECT FROM allura.identity_bindings b WHERE b.principal_id=s.issuer_id AND b.issuer=s.issuer AND b.subject=s.subject AND b.identity_kind='human' AND b.active)) THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION allura.selected_human(text,text,text,uuid,boolean) FROM PUBLIC,allura_app;

CREATE FUNCTION allura.selected_consent(issuer_arg text,subject_arg text,g text,w uuid,digest_arg text,input_arg jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid;t allura.oauth_transactions;connection uuid;
BEGIN
 IF input_arg IS NULL OR jsonb_typeof(input_arg)<>'object' OR octet_length(input_arg::text)>4096 OR input_arg->>'kind' NOT IN ('display','approve','cancel')
  OR input_arg->>'sessionDigest' IS NULL OR input_arg->>'sessionDigest' !~ '^[a-f0-9]{64}$' OR input_arg->>'nonceDigest' IS NULL OR input_arg->>'nonceDigest' !~ '^[a-f0-9]{64}$'
  OR EXISTS(SELECT FROM jsonb_object_keys(input_arg) k WHERE k<>ALL(ARRAY['kind','sessionDigest','nonceDigest','codeDigest','clientId','redirectUri','actions','mode','connectionId'])) THEN RAISE EXCEPTION 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(g,23002));
 actor:=allura.selected_human(issuer_arg,subject_arg,g,w,true);
 SELECT * INTO t FROM allura.oauth_transactions WHERE digest=digest_arg FOR UPDATE;
 IF NOT FOUND OR t.mode<>'selected' OR t.actions<>ARRAY['memory:selected:read'] OR t.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF input_arg->>'kind'='display' THEN
  IF t.status<>'pending' THEN RAISE EXCEPTION 'forbidden'; END IF;
  connection:=gen_random_uuid();
  UPDATE allura.oauth_transactions SET status='displayed',owner_id=actor,owner_issuer=issuer_arg,owner_subject=subject_arg,group_id=g,workspace_id=w,session_digest=input_arg->>'sessionDigest',nonce_digest=input_arg->>'nonceDigest',selected_connection_id=connection WHERE digest=digest_arg;
 ELSE
  connection:=t.selected_connection_id;
  IF t.status<>'displayed' OR t.owner_id IS DISTINCT FROM actor OR t.owner_issuer IS DISTINCT FROM issuer_arg OR t.owner_subject IS DISTINCT FROM subject_arg OR t.group_id IS DISTINCT FROM g OR t.workspace_id IS DISTINCT FROM w
   OR t.session_digest IS DISTINCT FROM input_arg->>'sessionDigest' OR t.nonce_digest IS DISTINCT FROM input_arg->>'nonceDigest' OR t.client_id IS DISTINCT FROM input_arg->>'clientId' OR t.redirect_uri IS DISTINCT FROM input_arg->>'redirectUri'
   OR to_jsonb(t.actions) IS DISTINCT FROM input_arg->'actions' OR input_arg->>'mode' IS DISTINCT FROM 'selected' OR connection::text IS DISTINCT FROM input_arg->>'connectionId' THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF input_arg->>'kind'='approve' THEN
   IF input_arg->>'codeDigest' IS NULL OR input_arg->>'codeDigest' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid'; END IF;
   INSERT INTO allura.selected_connections(id,group_id,workspace_id,recipient_id,recipient_issuer,recipient_subject,client_id,resource,revoked) VALUES(connection,g,w,actor,issuer_arg,subject_arg,t.client_id,t.resource,false);
   UPDATE allura.oauth_transactions SET status='approved',nonce_digest=NULL,code_digest=input_arg->>'codeDigest',code_expires_at=clock_timestamp()+interval '5 minutes' WHERE digest=digest_arg;
   INSERT INTO allura.selected_audit(group_id,workspace_id,actor_id,connection_id,action) VALUES(g,w,actor,connection,'approve');
  ELSE UPDATE allura.oauth_transactions SET status='cancelled',nonce_digest=NULL WHERE digest=digest_arg;
  END IF;
 END IF;
 RETURN jsonb_build_object('clientId',t.client_id,'redirectUri',t.redirect_uri,'actions',t.actions,'state',t.state,'connectionId',connection,'mode','selected');
END $$;

CREATE FUNCTION allura.oauth_code_mode(client_arg text,code_arg text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT mode FROM allura.oauth_transactions WHERE client_id=client_arg AND code_digest=code_arg;
$$;
CREATE FUNCTION allura.selected_exchange(client_arg text,code_arg text,redirect_arg text,resource_arg text,token_arg text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE t allura.oauth_transactions;c allura.selected_connections;actor uuid;principal uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO t FROM allura.oauth_transactions WHERE client_id=client_arg AND code_digest=code_arg AND mode='selected';
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t.group_id,23002));
 actor:=allura.selected_human(t.owner_issuer,t.owner_subject,t.group_id,t.workspace_id,true);
 IF actor IS DISTINCT FROM t.owner_id THEN RAISE EXCEPTION 'invalid'; END IF;
 SELECT * INTO c FROM allura.selected_connections WHERE id=t.selected_connection_id FOR UPDATE;
 IF NOT FOUND OR c.revoked OR c.principal_id IS NOT NULL OR c.recipient_id IS DISTINCT FROM actor OR c.recipient_issuer IS DISTINCT FROM t.owner_issuer OR c.recipient_subject IS DISTINCT FROM t.owner_subject OR c.group_id IS DISTINCT FROM t.group_id OR c.workspace_id IS DISTINCT FROM t.workspace_id OR c.client_id IS DISTINCT FROM client_arg OR c.resource IS DISTINCT FROM resource_arg THEN RAISE EXCEPTION 'invalid'; END IF;
 SELECT * INTO t FROM allura.oauth_transactions WHERE client_id=client_arg AND code_digest=code_arg FOR UPDATE;
 IF NOT FOUND OR t.mode<>'selected' OR t.status<>'approved' OR t.code_expires_at<=clock_timestamp() OR t.redirect_uri IS DISTINCT FROM redirect_arg OR t.resource IS DISTINCT FROM resource_arg OR token_arg IS NULL OR token_arg !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid'; END IF;
 INSERT INTO allura.principals(id,kind,active) VALUES(principal,'service',true);
 INSERT INTO allura.memberships(group_id,principal_id,active,org_admin,workspace_create) VALUES(t.group_id,principal,true,false,false);
 UPDATE allura.selected_connections SET principal_id=principal WHERE id=c.id;
 INSERT INTO allura.selected_credentials(digest,connection_id,principal_id,group_id,workspace_id,client_id,resource,expires_at,revoked) VALUES(token_arg,c.id,principal,t.group_id,t.workspace_id,client_arg,resource_arg,clock_timestamp()+interval '15 minutes',false);
 UPDATE allura.oauth_transactions SET status='consumed' WHERE digest=t.digest;
 INSERT INTO allura.selected_audit(group_id,workspace_id,actor_id,connection_id,action) VALUES(t.group_id,t.workspace_id,actor,c.id,'issue');
 RETURN jsonb_build_object('scope','memory:selected:read');
END $$;
REVOKE ALL ON FUNCTION allura.selected_begin(text,jsonb),allura.selected_consent(text,text,text,uuid,text,jsonb),allura.oauth_code_mode(text,text),allura.selected_exchange(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.selected_begin(text,jsonb),allura.selected_consent(text,text,text,uuid,text,jsonb),allura.oauth_code_mode(text,text),allura.selected_exchange(text,text,text,text,text) TO allura_app;

CREATE FUNCTION allura.selected_lookup(digest_arg text,resource_arg text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT jsonb_build_object('kind','service','principalId',k.principal_id,'groupId',k.group_id,'workspaceId',k.workspace_id,'actions',ARRAY['memory:selected:read'],'expiresAt',floor(extract(epoch FROM k.expires_at)),
 'selected',true,'oauthClientId',k.client_id,'oauthResource',k.resource,
 'revoked',k.revoked OR k.expires_at<=clock_timestamp() OR k.resource IS DISTINCT FROM resource_arg OR NOT coalesce(
 c.id=k.connection_id AND NOT c.revoked AND c.principal_id=k.principal_id AND c.group_id=k.group_id AND c.workspace_id=k.workspace_id AND c.client_id=k.client_id AND c.resource=k.resource
 AND p.active AND p.kind='service' AND m.active AND t.active AND NOT w.locked
 AND allura.active_human(k.group_id,c.recipient_id)
 AND EXISTS(SELECT FROM allura.identity_bindings b WHERE b.principal_id=c.recipient_id AND b.issuer=c.recipient_issuer AND b.subject=c.recipient_subject AND b.identity_kind='human' AND b.active),false))
 FROM allura.selected_credentials k LEFT JOIN allura.selected_connections c ON c.id=k.connection_id
 LEFT JOIN allura.principals p ON p.id=k.principal_id LEFT JOIN allura.memberships m ON m.group_id=k.group_id AND m.principal_id=k.principal_id
 LEFT JOIN allura.tenants t ON t.group_id=k.group_id LEFT JOIN allura.workspaces w ON w.group_id=k.group_id AND w.id=k.workspace_id WHERE k.digest=digest_arg;
$$;
CREATE FUNCTION allura.selected_get(digest_arg text,principal_arg uuid,client_arg text,resource_arg text,g text,w uuid,memory uuid,history_arg boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE k allura.selected_credentials;c allura.selected_connections;candidate uuid;people uuid[];s allura.memory_shares;result jsonb;current_identity jsonb;
BEGIN
 IF history_arg IS NULL OR memory IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(g,23002));
 SELECT * INTO k FROM allura.selected_credentials WHERE digest=digest_arg;
 SELECT * INTO c FROM allura.selected_connections WHERE id=k.connection_id;
 SELECT issuer_id INTO candidate FROM allura.memory_shares WHERE group_id=g AND workspace_id=w AND recipient_id=c.recipient_id AND memory_id=memory;
 people:=ARRAY[k.principal_id,c.recipient_id,candidate];
 PERFORM p.id FROM allura.principals p JOIN allura.memberships m ON m.principal_id=p.id WHERE m.group_id=g AND p.id=ANY(people) ORDER BY p.id FOR SHARE OF p,m;
 PERFORM 1 FROM allura.identity_bindings WHERE principal_id=ANY(people) ORDER BY principal_id,issuer,subject,identity_kind FOR SHARE;
 PERFORM 1 FROM allura.selected_credentials WHERE digest=digest_arg FOR SHARE;
 PERFORM 1 FROM allura.tenants WHERE group_id=g FOR SHARE;
 PERFORM 1 FROM allura.workspaces WHERE group_id=g AND id=w FOR SHARE;
 PERFORM 1 FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id=candidate FOR SHARE;
 PERFORM 1 FROM allura.selected_connections WHERE id=k.connection_id FOR SHARE;
 current_identity:=allura.selected_lookup(digest_arg,resource_arg);
 IF current_identity IS NULL OR (current_identity->>'revoked')::boolean OR current_identity->>'principalId' IS DISTINCT FROM principal_arg::text OR current_identity->>'oauthClientId' IS DISTINCT FROM client_arg OR current_identity->>'groupId' IS DISTINCT FROM g OR current_identity->>'workspaceId' IS DISTINCT FROM w::text THEN RAISE EXCEPTION 'forbidden'; END IF;
 -- Re-resolve discovered linkage after all locks; corruption cannot change recipients.
 IF NOT EXISTS(SELECT FROM allura.selected_connections n WHERE n.id=c.id AND n.recipient_id=c.recipient_id AND n.recipient_issuer=c.recipient_issuer AND n.recipient_subject=c.recipient_subject) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO s FROM allura.memory_shares WHERE group_id=g AND workspace_id=w AND recipient_id=c.recipient_id AND memory_id=memory FOR SHARE;
 IF s.issuer_id IS DISTINCT FROM candidate OR NOT coalesce(s.active,false) OR NOT allura.grant_admin(g,w,s.issuer_id)
  OR NOT EXISTS(SELECT FROM allura.identity_bindings WHERE principal_id=s.issuer_id AND issuer=s.issuer AND subject=s.subject AND identity_kind='human' AND active) THEN RAISE EXCEPTION 'not_found'; END IF;
 PERFORM 1 FROM allura.semantic_heads h JOIN allura.semantic_versions v ON v.group_id=h.group_id AND v.workspace_id=h.workspace_id AND v.knowledge_id=h.knowledge_id WHERE v.group_id=g AND v.workspace_id=w AND v.id=memory FOR SHARE OF h;
 SELECT jsonb_build_object('memory',jsonb_build_object('id',v.id,'content',v.content,'created_at',to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) INTO result
 FROM allura.semantic_versions v JOIN allura.semantic_heads h ON h.group_id=v.group_id AND h.workspace_id=v.workspace_id AND h.knowledge_id=v.knowledge_id
 WHERE v.group_id=g AND v.workspace_id=w AND v.id=memory AND (history_arg OR (h.current_version_id=v.id AND h.lifecycle='current'));
 IF result IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 INSERT INTO allura.selected_audit(group_id,workspace_id,actor_id,connection_id,action,memory_id) VALUES(g,w,principal_arg,c.id,'get',memory);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION allura.selected_lookup(text,text),allura.selected_get(text,uuid,text,text,text,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.selected_lookup(text,text),allura.selected_get(text,uuid,text,text,text,uuid,uuid,boolean) TO allura_app;

CREATE FUNCTION allura.selected_revoke(issuer_arg text,subject_arg text,g text,w uuid,connection_arg uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid;c allura.selected_connections;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(g,23002));
 actor:=allura.selected_human(issuer_arg,subject_arg,g,w,false);
 SELECT * INTO c FROM allura.selected_connections WHERE id=connection_arg AND group_id=g AND workspace_id=w;
 IF NOT FOUND OR c.recipient_id IS DISTINCT FROM actor OR c.recipient_issuer IS DISTINCT FROM issuer_arg OR c.recipient_subject IS DISTINCT FROM subject_arg THEN RAISE EXCEPTION 'not_found'; END IF;
 PERFORM 1 FROM allura.selected_credentials WHERE connection_id=c.id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM allura.selected_connections WHERE id=c.id FOR UPDATE;
 IF NOT c.revoked THEN
  UPDATE allura.selected_connections SET revoked=true WHERE id=c.id;
  UPDATE allura.selected_credentials SET revoked=true WHERE connection_id=c.id;
  INSERT INTO allura.selected_audit(group_id,workspace_id,actor_id,connection_id,action) VALUES(g,w,actor,c.id,'revoke');
 END IF;
END $$;
CREATE FUNCTION allura.selected_token_revoke(client_arg text,digest_arg text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE k allura.selected_credentials;
BEGIN
 SELECT * INTO k FROM allura.selected_credentials WHERE digest=digest_arg AND client_id=client_arg;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(k.group_id,23002));
 SELECT * INTO k FROM allura.selected_credentials WHERE digest=digest_arg AND client_id=client_arg FOR UPDATE;
 IF NOT FOUND OR k.revoked THEN RETURN; END IF;
 UPDATE allura.selected_credentials SET revoked=true WHERE id=k.id;
 INSERT INTO allura.selected_audit(group_id,workspace_id,actor_id,connection_id,action) VALUES(k.group_id,k.workspace_id,k.principal_id,k.connection_id,'revoke');
END $$;
REVOKE ALL ON FUNCTION allura.selected_revoke(text,text,text,uuid,uuid),allura.selected_token_revoke(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.selected_revoke(text,text,text,uuid,uuid),allura.selected_token_revoke(text,text) TO allura_app;
