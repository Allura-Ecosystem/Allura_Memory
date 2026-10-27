-- Device authority is a strict attenuation of a current, explicitly granted human.
-- Private authority tables follow001: no direct app grants. Lifecycle commands
-- are introduced separately; this migration itself exposes no issuance endpoint.
ALTER TABLE allura.identity_bindings ADD CONSTRAINT identity_binding_owner UNIQUE(issuer,subject,identity_kind,principal_id);
ALTER TABLE allura.machine_credentials ADD CONSTRAINT credential_principal UNIQUE(group_id,workspace_id,id,principal_id);
CREATE TABLE allura.device_owners (
 device_id uuid PRIMARY KEY, device_kind text NOT NULL DEFAULT 'device' CHECK(device_kind='device'),
 group_id text NOT NULL, workspace_id uuid NOT NULL,
 owner_id uuid NOT NULL, owner_kind text NOT NULL DEFAULT 'human' CHECK(owner_kind='human'),
 owner_issuer text NOT NULL, owner_subject text NOT NULL,
 current_credential_id uuid NOT NULL, generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),
 revoked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(device_id,device_kind) REFERENCES allura.principals(id,kind),
 FOREIGN KEY(owner_id,owner_kind) REFERENCES allura.principals(id,kind),
 FOREIGN KEY(group_id,workspace_id,device_id) REFERENCES allura.workspace_grants(group_id,workspace_id,principal_id),
 FOREIGN KEY(group_id,workspace_id,owner_id) REFERENCES allura.workspace_grants(group_id,workspace_id,principal_id),
 FOREIGN KEY(owner_issuer,owner_subject,owner_kind,owner_id) REFERENCES allura.identity_bindings(issuer,subject,identity_kind,principal_id),
 FOREIGN KEY(group_id,workspace_id,current_credential_id,device_id) REFERENCES allura.machine_credentials(group_id,workspace_id,id,principal_id)
);
REVOKE ALL ON allura.device_owners FROM PUBLIC,allura_app;
ALTER FUNCTION allura.resolve_authority(text,text,text,text,text,text,text) RENAME TO resolve_authority_pre_device;
ALTER FUNCTION allura.lookup_machine(text) RENAME TO lookup_machine_pre_device;
ALTER FUNCTION allura.lock_authority(uuid,text,uuid) RENAME TO lock_authority_pre_device;
REVOKE ALL ON FUNCTION allura.resolve_authority_pre_device(text,text,text,text,text,text,text),allura.lookup_machine_pre_device(text),allura.lock_authority_pre_device(uuid,text,uuid) FROM PUBLIC,allura_app;

CREATE FUNCTION allura.device_owner_authority(device_arg text,group_arg text,workspace_arg text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE d allura.device_owners; r jsonb;
BEGIN
 SELECT * INTO d FROM allura.device_owners WHERE device_id::text=device_arg AND group_id=group_arg AND workspace_id::text=workspace_arg AND NOT revoked;
 IF NOT FOUND THEN RETURN NULL; END IF;
 r:=allura.resolve_authority_pre_device(d.owner_issuer,d.owner_subject,'human','','',group_arg,workspace_arg);
 IF r IS NULL OR r->>'principalId' IS DISTINCT FROM d.owner_id::text OR NOT (r->>'principalActive')::boolean OR NOT (r->>'membershipActive')::boolean OR NOT (r->>'tenantActive')::boolean OR NOT (r->>'grantActive')::boolean OR (r->>'workspaceLocked')::boolean OR r->>'role' NOT IN ('viewer','curator','workspace_admin') THEN RETURN NULL; END IF;
 RETURN r;
END $$;

CREATE FUNCTION allura.resolve_authority(issuer_arg text,subject_arg text,kind_arg text,principal_arg text,digest_arg text,group_arg text,workspace_arg text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r jsonb; o jsonb;
BEGIN
 r:=allura.resolve_authority_pre_device(issuer_arg,subject_arg,kind_arg,principal_arg,digest_arg,group_arg,workspace_arg);
 IF kind_arg<>'device' OR r IS NULL THEN RETURN r; END IF;
 o:=allura.device_owner_authority(principal_arg,group_arg,workspace_arg);
 IF o IS NULL OR r->>'role' NOT IN ('viewer','curator') OR NOT EXISTS(
  SELECT FROM allura.device_owners d JOIN allura.machine_credentials c ON c.id=d.current_credential_id AND c.principal_id=d.device_id
  WHERE d.device_id::text=principal_arg AND d.group_id=group_arg AND d.workspace_id::text=workspace_arg AND NOT d.revoked
   AND c.group_id=d.group_id AND c.workspace_id=d.workspace_id AND encode(c.digest,'hex')=digest_arg AND NOT c.revoked AND c.expires_at>clock_timestamp()
 ) THEN RETURN NULL; END IF;
 RETURN r||jsonb_build_object('role',CASE WHEN o->>'role'='viewer' OR r->>'role'='viewer' THEN 'viewer' ELSE 'curator' END,'reviewApprove',false);
END $$;

CREATE FUNCTION allura.lookup_machine(digest_arg text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r jsonb; a jsonb; ceiling jsonb;
BEGIN
 r:=allura.lookup_machine_pre_device(digest_arg);
 IF r IS NULL OR r->>'kind'<>'device' THEN RETURN r; END IF;
 a:=allura.resolve_authority('','','device',r->>'principalId',digest_arg,r->>'groupId',r->>'workspaceId');
 SELECT coalesce(jsonb_agg(v),'[]'::jsonb) INTO ceiling FROM jsonb_array_elements_text(r->'actions') v WHERE v IN ('memory:read','memory:capture','proposal:write','review:read');
 RETURN r||jsonb_build_object('actions',ceiling,'revoked',a IS NULL OR (r->>'revoked')::boolean OR NOT (a->>'principalActive')::boolean OR NOT (a->>'membershipActive')::boolean OR NOT (a->>'grantActive')::boolean OR NOT (a->>'tenantActive')::boolean OR (a->>'workspaceLocked')::boolean);
END $$;

CREATE FUNCTION allura.lock_authority(principal_arg uuid,group_arg text,workspace_arg uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE owner_arg uuid;
BEGIN
 SELECT owner_id INTO owner_arg FROM allura.device_owners WHERE device_id=principal_arg AND group_id=group_arg AND workspace_id=workspace_arg FOR SHARE;
 IF FOUND THEN PERFORM allura.lock_authority_pre_device(owner_arg,group_arg,workspace_arg); END IF;
 PERFORM allura.lock_authority_pre_device(principal_arg,group_arg,workspace_arg);
END $$;
REVOKE ALL ON FUNCTION allura.device_owner_authority(text,text,text),allura.resolve_authority(text,text,text,text,text,text,text),allura.lookup_machine(text),allura.lock_authority(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.resolve_authority(text,text,text,text,text,text,text),allura.lookup_machine(text),allura.lock_authority(uuid,text,uuid) TO allura_app;
