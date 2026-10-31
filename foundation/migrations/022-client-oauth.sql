-- Private local OAuth state. Runtime receives no direct table privileges.
ALTER TABLE allura.machine_credentials ADD COLUMN oauth_bound boolean NOT NULL DEFAULT false;
CREATE TABLE allura.oauth_transactions (
 digest text PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'),
 client_id text NOT NULL, redirect_uri text NOT NULL, resource text NOT NULL,
 actions text[] NOT NULL CHECK(cardinality(actions) BETWEEN 1 AND 8 AND actions <@ ARRAY['memory:read','memory:capture','evidence:read','proposal:write','review:read','memory:delete','audit:read','health:read']::text[]),
 challenge text NOT NULL CHECK(challenge ~ '^[A-Za-z0-9_-]{43}$'), state text,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','displayed','approved','consumed','cancelled')),
 owner_id uuid, owner_issuer text, owner_subject text, group_id text, workspace_id uuid,
 session_digest text, nonce_digest text, code_digest text UNIQUE, code_expires_at timestamptz
);
CREATE TABLE allura.oauth_credentials (
 credential_id uuid PRIMARY KEY REFERENCES allura.machine_credentials(id),
 client_id text NOT NULL, resource text NOT NULL
);
CREATE TABLE allura.oauth_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id text NOT NULL,workspace_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES allura.principals(id),action text NOT NULL CHECK(action IN ('approve','issue','revoke')),
 target_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE TRIGGER oauth_audit_immutable BEFORE UPDATE OR DELETE ON allura.oauth_audit FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER oauth_audit_no_truncate BEFORE TRUNCATE ON allura.oauth_audit FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.oauth_transactions,allura.oauth_credentials,allura.oauth_audit FROM PUBLIC,allura_app;

CREATE FUNCTION allura.oauth_begin(digest_arg text,input_arg jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(20861030);
 DELETE FROM allura.oauth_transactions WHERE expires_at<clock_timestamp() AND (code_expires_at IS NULL OR code_expires_at<clock_timestamp());
 IF (SELECT count(*) FROM allura.oauth_transactions)>=100 OR octet_length(input_arg::text)>4096 THEN RAISE EXCEPTION 'invalid'; END IF;
 INSERT INTO allura.oauth_transactions(digest,client_id,redirect_uri,resource,actions,challenge,state)
 VALUES(digest_arg,input_arg->>'clientId',input_arg->>'redirectUri',input_arg->>'resource',ARRAY(SELECT jsonb_array_elements_text(input_arg->'actions')),input_arg->>'challenge',input_arg->>'state');
END $$;

CREATE FUNCTION allura.oauth_consent(group_arg text,workspace_arg uuid,digest_arg text,input_arg jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE t allura.oauth_transactions; actor uuid; human jsonb; a text;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(group_arg,workspace_arg,'workspace:grants:manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 actor:=current_setting('allura.principal')::uuid;
 human:=allura.device_human(current_setting('allura.issuer'),current_setting('allura.subject'),group_arg,workspace_arg);
 IF human->>'role'<>'workspace_admin' OR human->>'principalId' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO t FROM allura.oauth_transactions WHERE digest=digest_arg FOR UPDATE;
 IF NOT FOUND OR t.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'invalid'; END IF;
 FOREACH a IN ARRAY t.actions LOOP IF NOT allura.role_allows(human->>'role',false,'service',a) THEN RAISE EXCEPTION 'forbidden'; END IF; END LOOP;
 IF input_arg->>'kind'='display' THEN
  IF t.status<>'pending' OR input_arg->>'sessionDigest' !~ '^[a-f0-9]{64}$' OR input_arg->>'nonceDigest' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid'; END IF;
  UPDATE allura.oauth_transactions SET status='displayed',owner_id=actor,owner_issuer=current_setting('allura.issuer'),owner_subject=current_setting('allura.subject'),group_id=group_arg,workspace_id=workspace_arg,session_digest=input_arg->>'sessionDigest',nonce_digest=input_arg->>'nonceDigest' WHERE digest=digest_arg;
 ELSE
  IF t.status<>'displayed' OR t.owner_id IS DISTINCT FROM actor OR t.owner_issuer IS DISTINCT FROM current_setting('allura.issuer') OR t.owner_subject IS DISTINCT FROM current_setting('allura.subject') OR t.group_id IS DISTINCT FROM group_arg OR t.workspace_id IS DISTINCT FROM workspace_arg OR t.session_digest IS DISTINCT FROM input_arg->>'sessionDigest' OR t.nonce_digest IS DISTINCT FROM input_arg->>'nonceDigest' OR t.client_id IS DISTINCT FROM input_arg->>'clientId' OR t.redirect_uri IS DISTINCT FROM input_arg->>'redirectUri' OR to_jsonb(t.actions) IS DISTINCT FROM input_arg->'actions' THEN RAISE EXCEPTION 'invalid'; END IF;
  IF input_arg->>'kind'='approve' AND input_arg->>'codeDigest' ~ '^[a-f0-9]{64}$' THEN
   UPDATE allura.oauth_transactions SET status='approved',nonce_digest=NULL,code_digest=input_arg->>'codeDigest',code_expires_at=clock_timestamp()+interval '5 minutes' WHERE digest=digest_arg;
   INSERT INTO allura.oauth_audit(group_id,workspace_id,actor_id,action) VALUES(group_arg,workspace_arg,actor,'approve');
  ELSIF input_arg->>'kind'='cancel' THEN UPDATE allura.oauth_transactions SET status='cancelled',nonce_digest=NULL WHERE digest=digest_arg;
  ELSE RAISE EXCEPTION 'invalid'; END IF;
 END IF;
 RETURN jsonb_build_object('clientId',t.client_id,'redirectUri',t.redirect_uri,'actions',t.actions,'state',t.state);
END $$;

CREATE FUNCTION allura.oauth_challenge(client_arg text,code_arg text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT challenge FROM allura.oauth_transactions WHERE client_id=client_arg AND code_digest=code_arg AND status='approved' AND code_expires_at>clock_timestamp();
$$;
CREATE FUNCTION allura.oauth_exchange(client_arg text,code_arg text,redirect_arg text,resource_arg text,token_arg text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE t allura.oauth_transactions; human jsonb; a text; principal uuid:=gen_random_uuid(); delegation uuid:=gen_random_uuid(); credential uuid:=gen_random_uuid();
BEGIN
 -- Match human consent lock order: owner authority before protocol transition.
 SELECT * INTO t FROM allura.oauth_transactions WHERE client_id=client_arg AND code_digest=code_arg;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid'; END IF;
 human:=allura.device_human(t.owner_issuer,t.owner_subject,t.group_id,t.workspace_id);
 IF human->>'role'<>'workspace_admin' OR human->>'principalId' IS DISTINCT FROM t.owner_id::text THEN RAISE EXCEPTION 'invalid'; END IF;
 SELECT * INTO t FROM allura.oauth_transactions WHERE client_id=client_arg AND code_digest=code_arg FOR UPDATE;
 IF NOT FOUND OR t.status<>'approved' OR t.code_expires_at<=clock_timestamp() OR t.redirect_uri IS DISTINCT FROM redirect_arg OR t.resource IS DISTINCT FROM resource_arg OR token_arg !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid'; END IF;
 FOREACH a IN ARRAY t.actions LOOP IF NOT allura.role_allows(human->>'role',false,'service',a) THEN RAISE EXCEPTION 'invalid'; END IF; END LOOP;
 INSERT INTO allura.principals(id,kind,active) VALUES(principal,'service',true);
 INSERT INTO allura.memberships(group_id,principal_id,active,org_admin,workspace_create) VALUES(t.group_id,principal,true,false,false);
 INSERT INTO allura.client_delegations(id,client_id,owner_id,owner_issuer,owner_subject,group_id,workspace_id,actions,revoked) VALUES(delegation,principal,t.owner_id,t.owner_issuer,t.owner_subject,t.group_id,t.workspace_id,t.actions,false);
 INSERT INTO allura.machine_credentials(id,principal_id,digest,group_id,workspace_id,actions,expires_at,revoked,client_bound,client_delegation_id,oauth_bound) VALUES(credential,principal,decode(token_arg,'hex'),t.group_id,t.workspace_id,t.actions,clock_timestamp()+interval '15 minutes',false,true,delegation,true);
 INSERT INTO allura.oauth_credentials(credential_id,client_id,resource) VALUES(credential,client_arg,resource_arg);
 UPDATE allura.oauth_transactions SET status='consumed' WHERE digest=t.digest;
 INSERT INTO allura.oauth_audit(group_id,workspace_id,actor_id,action,target_id) VALUES(t.group_id,t.workspace_id,t.owner_id,'issue',principal);
 RETURN jsonb_build_object('scope',array_to_string(t.actions,' '));
END $$;
CREATE FUNCTION allura.oauth_lookup(digest_arg text,resource_arg text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT allura.lookup_machine(digest_arg)||jsonb_build_object('oauthClientId',o.client_id,'revoked',coalesce((allura.lookup_machine(digest_arg)->>'revoked')::boolean,true) OR o.resource IS DISTINCT FROM resource_arg OR NOT c.client_bound) FROM allura.machine_credentials c LEFT JOIN allura.oauth_credentials o ON c.id=o.credential_id WHERE encode(c.digest,'hex')=digest_arg AND c.oauth_bound;
$$;
CREATE FUNCTION allura.oauth_revoke_connection(group_arg text,workspace_arg uuid,connection_arg uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE d allura.client_delegations;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(group_arg,workspace_arg,'workspace:grants:manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO d FROM allura.client_delegations WHERE id=connection_arg AND group_id=group_arg AND workspace_id=workspace_arg;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
 -- Credential before delegation, as on the current client authorization path.
 PERFORM 1 FROM allura.machine_credentials WHERE client_delegation_id=d.id ORDER BY id FOR UPDATE;
 UPDATE allura.client_delegations SET revoked=true WHERE id=d.id;
 UPDATE allura.machine_credentials SET revoked=true WHERE client_delegation_id=d.id;
 INSERT INTO allura.oauth_audit(group_id,workspace_id,actor_id,action,target_id) VALUES(group_arg,workspace_arg,current_setting('allura.principal')::uuid,'revoke',d.client_id);
END $$;
REVOKE ALL ON FUNCTION allura.oauth_revoke_connection(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.oauth_revoke_connection(text,uuid,uuid) TO allura_app;
CREATE FUNCTION allura.oauth_revoke(client_arg text,token_arg text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 UPDATE allura.machine_credentials c SET revoked=true FROM allura.oauth_credentials o WHERE o.credential_id=c.id AND o.client_id=client_arg AND encode(c.digest,'hex')=token_arg;
END $$;
REVOKE ALL ON FUNCTION allura.oauth_revoke(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.oauth_revoke(text,text) TO allura_app;
REVOKE ALL ON FUNCTION allura.oauth_begin(text,jsonb),allura.oauth_consent(text,uuid,text,jsonb),allura.oauth_challenge(text,text),allura.oauth_exchange(text,text,text,text,text),allura.oauth_lookup(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.oauth_begin(text,jsonb),allura.oauth_consent(text,uuid,text,jsonb),allura.oauth_challenge(text,text),allura.oauth_exchange(text,text,text,text,text),allura.oauth_lookup(text,text) TO allura_app;
