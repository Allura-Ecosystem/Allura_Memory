-- Owner-linked application connections are separate from capped devices.
-- Private linkage only: no issuance or public administration surface.
CREATE TABLE allura.client_delegations (
 id uuid PRIMARY KEY,
 client_id uuid NOT NULL, client_kind text NOT NULL DEFAULT 'service' CHECK(client_kind='service'),
 group_id text NOT NULL, workspace_id uuid NOT NULL,
 owner_id uuid NOT NULL, owner_kind text NOT NULL DEFAULT 'human' CHECK(owner_kind='human'),
 owner_issuer text NOT NULL, owner_subject text NOT NULL,
 actions text[] NOT NULL CHECK(actions <@ ARRAY['memory:read','memory:capture','evidence:read','proposal:write','review:read','memory:delete','audit:read','health:read']::text[]),
 revoked boolean NOT NULL DEFAULT false,
 UNIQUE(group_id,workspace_id,id,client_id),
 FOREIGN KEY(client_id,client_kind) REFERENCES allura.principals(id,kind),
 FOREIGN KEY(group_id,client_id) REFERENCES allura.memberships(group_id,principal_id),
 FOREIGN KEY(group_id,workspace_id,owner_id) REFERENCES allura.workspace_grants(group_id,workspace_id,principal_id),
 FOREIGN KEY(owner_issuer,owner_subject,owner_kind,owner_id) REFERENCES allura.identity_bindings(issuer,subject,identity_kind,principal_id)
);
-- Keep the discriminator after linkage deletion. A missing link must never
-- silently reclassify a client credential as an unrelated legacy service.
ALTER TABLE allura.machine_credentials
 ADD COLUMN client_bound boolean NOT NULL DEFAULT false,
 ADD COLUMN client_delegation_id uuid,
 ADD CONSTRAINT client_credential_mode CHECK(client_bound OR client_delegation_id IS NULL),
 ADD CONSTRAINT client_credential_link FOREIGN KEY(group_id,workspace_id,client_delegation_id,principal_id)
 REFERENCES allura.client_delegations(group_id,workspace_id,id,client_id)
 ON DELETE SET NULL (client_delegation_id);
REVOKE ALL ON allura.client_delegations FROM PUBLIC,allura_app;

ALTER FUNCTION allura.resolve_authority(text,text,text,text,text,text,text) RENAME TO resolve_authority_pre_client;
REVOKE ALL ON FUNCTION allura.resolve_authority_pre_client(text,text,text,text,text,text,text) FROM PUBLIC,allura_app;
CREATE FUNCTION allura.resolve_authority(issuer_arg text,subject_arg text,kind_arg text,principal_arg text,digest_arg text,group_arg text,workspace_arg text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE c allura.machine_credentials; d allura.client_delegations; o jsonb; r jsonb;
BEGIN
 IF kind_arg='human' THEN
  RETURN allura.resolve_authority_pre_client(issuer_arg,subject_arg,kind_arg,principal_arg,digest_arg,group_arg,workspace_arg);
 END IF;
 SELECT * INTO c FROM allura.machine_credentials WHERE encode(digest,'hex')=digest_arg;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT c.client_bound THEN
  RETURN allura.resolve_authority_pre_client(issuer_arg,subject_arg,kind_arg,principal_arg,digest_arg,group_arg,workspace_arg);
 END IF;
 IF kind_arg<>'service' OR c.principal_id::text IS DISTINCT FROM principal_arg OR c.group_id IS DISTINCT FROM group_arg OR c.workspace_id::text IS DISTINCT FROM workspace_arg OR c.revoked OR c.expires_at<=clock_timestamp() THEN RETURN NULL; END IF;
 SELECT * INTO d FROM allura.client_delegations WHERE id=c.client_delegation_id AND client_id=c.principal_id AND group_id=c.group_id AND workspace_id=c.workspace_id AND NOT revoked;
 IF NOT FOUND THEN RETURN NULL; END IF;
 o:=allura.resolve_authority_pre_client(d.owner_issuer,d.owner_subject,'human','','',group_arg,workspace_arg);
 IF o IS NULL OR o->>'principalId' IS DISTINCT FROM d.owner_id::text OR NOT (o->>'principalActive')::boolean OR NOT (o->>'membershipActive')::boolean OR NOT (o->>'tenantActive')::boolean OR NOT (o->>'grantActive')::boolean OR (o->>'workspaceLocked')::boolean THEN RETURN NULL; END IF;
 -- The delegation is this client's explicit grant; it never creates a human
 -- workspace grant, nor changes the separate legacy service/device grants.
 SELECT jsonb_build_object('principalId',p.id,'kind',p.kind,'principalActive',p.active,
  'membershipActive',m.active,'tenantActive',true,'workspaceLocked',false,
  'grantActive',true,'role',o->>'role','reviewApprove',false,'groupId',d.group_id,'workspaceId',d.workspace_id,
  'clientActions',d.actions) INTO r
 FROM allura.principals p JOIN allura.memberships m ON m.principal_id=p.id AND m.group_id=d.group_id
 WHERE p.id=d.client_id AND p.kind='service';
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION allura.resolve_authority(text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.resolve_authority(text,text,text,text,text,text,text) TO allura_app;

ALTER FUNCTION allura.lookup_machine(text) RENAME TO lookup_machine_pre_client;
REVOKE ALL ON FUNCTION allura.lookup_machine_pre_client(text) FROM PUBLIC,allura_app;
CREATE FUNCTION allura.lookup_machine(digest_arg text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE c allura.machine_credentials; r jsonb; a jsonb; ceiling jsonb;
BEGIN
 r:=allura.lookup_machine_pre_client(digest_arg);
 SELECT * INTO c FROM allura.machine_credentials WHERE encode(digest,'hex')=digest_arg;
 IF NOT FOUND OR NOT c.client_bound THEN RETURN r; END IF;
 a:=allura.resolve_authority('','','service',c.principal_id::text,digest_arg,c.group_id,c.workspace_id::text);
 SELECT coalesce(jsonb_agg(v),'[]'::jsonb) INTO ceiling
 FROM jsonb_array_elements_text(r->'actions') v
 WHERE (a->'clientActions') ? v AND allura.role_allows(a->>'role',false,'service',v);
 RETURN r||jsonb_build_object('actions',ceiling,'revoked',a IS NULL OR (r->>'revoked')::boolean OR NOT coalesce((a->>'principalActive')::boolean AND (a->>'membershipActive')::boolean AND (a->>'tenantActive')::boolean AND (a->>'grantActive')::boolean AND NOT (a->>'workspaceLocked')::boolean,false));
END $$;
REVOKE ALL ON FUNCTION allura.lookup_machine(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.lookup_machine(text) TO allura_app;

-- Lock the credential first, so its delegation cannot change while the
-- delegation and current human authority rows are being acquired.
ALTER FUNCTION allura.lock_authority(uuid,text,uuid) RENAME TO lock_authority_pre_client;
REVOKE ALL ON FUNCTION allura.lock_authority_pre_client(uuid,text,uuid) FROM PUBLIC,allura_app;
CREATE FUNCTION allura.lock_authority(principal_arg uuid,group_arg text,workspace_arg uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE d allura.client_delegations;
BEGIN
 PERFORM allura.lock_authority_pre_client(principal_arg,group_arg,workspace_arg);
 FOR d IN SELECT link.* FROM allura.client_delegations link
  WHERE link.client_id=principal_arg AND link.group_id=group_arg AND link.workspace_id=workspace_arg
   AND EXISTS(SELECT FROM allura.machine_credentials c WHERE c.client_bound AND c.client_delegation_id=link.id AND c.principal_id=principal_arg)
  ORDER BY link.id FOR SHARE
 LOOP
  PERFORM allura.lock_authority_pre_client(d.owner_id,group_arg,workspace_arg);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION allura.lock_authority(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.lock_authority(uuid,text,uuid) TO allura_app;

-- Replace in place: existing policies retain this function's OID.
CREATE OR REPLACE FUNCTION allura.context_allows(row_group text,row_workspace uuid,required_action text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r jsonb; kind_name text := current_setting('allura.kind',true); action_name text := current_setting('allura.action',true);
BEGIN
 IF row_group IS DISTINCT FROM current_setting('allura.group',true) OR row_workspace::text IS DISTINCT FROM current_setting('allura.workspace',true) OR action_name IS DISTINCT FROM required_action THEN RETURN false; END IF;
 r := allura.resolve_authority(current_setting('allura.issuer',true),current_setting('allura.subject',true),kind_name,current_setting('allura.principal',true),current_setting('allura.credential',true),row_group,row_workspace::text);
 IF r IS NULL OR (r->>'principalId') IS DISTINCT FROM current_setting('allura.principal',true) THEN RETURN false; END IF;
 IF kind_name <> 'human' AND NOT EXISTS(SELECT FROM allura.machine_credentials c WHERE encode(c.digest,'hex')=current_setting('allura.credential',true) AND required_action=ANY(c.actions)) THEN RETURN false; END IF;
 IF r ? 'clientActions' AND NOT coalesce((r->'clientActions') ? required_action,false) THEN RETURN false; END IF;
 RETURN (r->>'principalActive')::boolean AND (r->>'membershipActive')::boolean AND (r->>'tenantActive')::boolean AND (r->>'grantActive')::boolean AND NOT (r->>'workspaceLocked')::boolean AND allura.role_allows(r->>'role',(r->>'reviewApprove')::boolean,kind_name,required_action);
END $$;
