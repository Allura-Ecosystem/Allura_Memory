-- Fresh Epic 2 authority/evidence schema. Execute in owner transaction only.
CREATE SCHEMA IF NOT EXISTS allura;
REVOKE ALL ON SCHEMA allura FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='allura_app') THEN
    CREATE ROLE allura_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='allura_app' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) OR EXISTS (SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='allura_app')) THEN
    RAISE EXCEPTION 'unsafe pre-existing app role';
  END IF;
END $$;
GRANT USAGE ON SCHEMA allura TO allura_app;
CREATE TABLE allura.principals (
  id uuid PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('human','service','device','worker')),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,kind)
);
CREATE TABLE allura.identity_bindings (
  issuer text NOT NULL CHECK (length(issuer)>0), subject text NOT NULL CHECK (length(subject)>0),
  identity_kind text NOT NULL, principal_id uuid NOT NULL, active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(issuer,subject,identity_kind), FOREIGN KEY(principal_id,identity_kind) REFERENCES allura.principals(id,kind)
);
CREATE TABLE allura.tenants (
  group_id text PRIMARY KEY CHECK (group_id ~ '^allura-[a-z0-9][a-z0-9-]{0,79}$'), active boolean NOT NULL DEFAULT true
);
CREATE TABLE allura.memberships (
  group_id text NOT NULL REFERENCES allura.tenants, principal_id uuid NOT NULL REFERENCES allura.principals,
  active boolean NOT NULL DEFAULT true, org_admin boolean NOT NULL DEFAULT false,
  workspace_create boolean NOT NULL DEFAULT false, PRIMARY KEY(group_id,principal_id)
);
CREATE TABLE allura.workspaces (
  group_id text NOT NULL REFERENCES allura.tenants, id uuid NOT NULL,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  locked boolean NOT NULL DEFAULT false, created_by uuid NOT NULL REFERENCES allura.principals,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(group_id,id)
);
CREATE TABLE allura.workspace_grants (
  group_id text NOT NULL, workspace_id uuid NOT NULL, principal_id uuid NOT NULL,
  role text NOT NULL CHECK(role IN ('viewer','curator','workspace_admin')),
  review_approve boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), issuer uuid NOT NULL REFERENCES allura.principals,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,principal_id),
  FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces,
  FOREIGN KEY(group_id,principal_id) REFERENCES allura.memberships
);
CREATE FUNCTION allura.human_grant_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,allura AS $$
BEGIN
  IF (NEW.review_approve OR NEW.role='workspace_admin') AND NOT EXISTS (SELECT FROM allura.principals WHERE id=NEW.principal_id AND kind='human') THEN
    RAISE EXCEPTION 'human grant required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER human_grant_guard BEFORE INSERT OR UPDATE ON allura.workspace_grants FOR EACH ROW EXECUTE FUNCTION allura.human_grant_guard();
CREATE TABLE allura.machine_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), principal_id uuid NOT NULL REFERENCES allura.principals,
  digest bytea NOT NULL UNIQUE CHECK(octet_length(digest)=32), group_id text NOT NULL, workspace_id uuid NOT NULL,
  actions text[] NOT NULL CHECK(actions <@ ARRAY['memory:read','memory:capture','evidence:read','proposal:write','review:read','memory:delete','audit:read','health:read']::text[]),
  expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false,
  FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE TABLE allura.events (
  group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES allura.principals, kind text NOT NULL CHECK(kind IN ('capture','proposal','decision','deletion')),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,id),
  FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE TABLE allura.access_audit (
  group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES allura.principals, target_id uuid REFERENCES allura.principals,
  action text NOT NULL CHECK(action IN ('create','invite','accept','grant','revoke','lock','recover')),
  outcome text NOT NULL CHECK(outcome IN ('succeeded','denied','conflict')),
  category text NOT NULL CHECK(category IN ('authorized','not_eligible','stale','self_change','last_admin','orphan')),
  before_role text CHECK(before_role IN ('viewer','curator','workspace_admin')),
  after_role text CHECK(after_role IN ('viewer','curator','workspace_admin')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,id),
  FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE FUNCTION allura.append_only() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'append-only'; END $$;
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE ON allura.events FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER events_no_truncate BEFORE TRUNCATE ON allura.events FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER access_immutable BEFORE UPDATE OR DELETE ON allura.access_audit FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER access_no_truncate BEFORE TRUNCATE ON allura.access_audit FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();

CREATE FUNCTION allura.role_allows(role_name text, review_allowed boolean, principal_kind text, action_name text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE
    WHEN role_name NOT IN ('viewer','curator','workspace_admin') THEN false
    WHEN action_name='review:approve' THEN principal_kind='human' AND review_allowed
    WHEN action_name='workspace:grants:manage' THEN principal_kind='human' AND role_name='workspace_admin'
    WHEN action_name='memory:read' THEN true
    WHEN action_name IN ('memory:capture','proposal:write','review:read') THEN role_name IN ('curator','workspace_admin')
    WHEN action_name IN ('evidence:read','memory:delete','audit:read','health:read') THEN role_name='workspace_admin'
    ELSE false END;
$$;
-- Narrow trusted-service lookup, no display/content fields. No PUBLIC execution.
CREATE FUNCTION allura.resolve_authority(issuer_arg text, subject_arg text, kind_arg text, principal_arg text, digest_arg text, group_arg text, workspace_arg text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT jsonb_build_object('principalId',p.id,'kind',p.kind,'principalActive',p.active,
   'membershipActive',m.active,'tenantActive',t.active,'workspaceLocked',w.locked,
   'grantActive',g.active,'role',g.role,'reviewApprove',g.review_approve,'groupId',g.group_id,'workspaceId',g.workspace_id)
 FROM allura.principals p
 JOIN allura.memberships m ON m.principal_id=p.id AND m.group_id=group_arg
 JOIN allura.tenants t ON t.group_id=m.group_id
 JOIN allura.workspaces w ON w.group_id=m.group_id AND w.id::text=workspace_arg
 JOIN allura.workspace_grants g ON g.principal_id=p.id AND g.group_id=w.group_id AND g.workspace_id=w.id
 WHERE p.kind=kind_arg AND (
   (kind_arg='human' AND EXISTS(SELECT FROM allura.identity_bindings b WHERE b.issuer=issuer_arg AND b.subject=subject_arg AND b.identity_kind='human' AND b.principal_id=p.id AND b.active)) OR
   (kind_arg IN ('service','device','worker') AND p.id::text=principal_arg AND EXISTS(SELECT FROM allura.machine_credentials c WHERE c.principal_id=p.id AND encode(c.digest,'hex')=digest_arg AND c.group_id=group_arg AND c.workspace_id::text=workspace_arg AND NOT c.revoked AND c.expires_at>clock_timestamp()))
 );
$$;
CREATE FUNCTION allura.lookup_machine(digest_arg text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT jsonb_build_object('principalId',p.id,'kind',p.kind,'groupId',c.group_id,'workspaceId',c.workspace_id,'actions',c.actions,'expiresAt',floor(extract(epoch from c.expires_at)),'revoked',c.revoked OR NOT p.active)
 FROM allura.machine_credentials c JOIN allura.principals p ON p.id=c.principal_id
 WHERE encode(c.digest,'hex')=digest_arg AND p.kind IN ('service','device','worker');
$$;
CREATE FUNCTION allura.context_allows(row_group text,row_workspace uuid,required_action text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r jsonb; kind_name text := current_setting('allura.kind',true); action_name text := current_setting('allura.action',true);
BEGIN
 IF row_group IS DISTINCT FROM current_setting('allura.group',true) OR row_workspace::text IS DISTINCT FROM current_setting('allura.workspace',true) OR action_name IS DISTINCT FROM required_action THEN RETURN false; END IF;
 r := allura.resolve_authority(current_setting('allura.issuer',true),current_setting('allura.subject',true),kind_name,current_setting('allura.principal',true),current_setting('allura.credential',true),row_group,row_workspace::text);
 IF r IS NULL OR (r->>'principalId') IS DISTINCT FROM current_setting('allura.principal',true) THEN RETURN false; END IF;
 IF kind_name <> 'human' AND NOT EXISTS(SELECT FROM allura.machine_credentials c WHERE encode(c.digest,'hex')=current_setting('allura.credential',true) AND required_action=ANY(c.actions)) THEN RETURN false; END IF;
 RETURN (r->>'principalActive')::boolean AND (r->>'membershipActive')::boolean AND (r->>'tenantActive')::boolean AND (r->>'grantActive')::boolean AND NOT (r->>'workspaceLocked')::boolean AND allura.role_allows(r->>'role',(r->>'reviewApprove')::boolean,kind_name,required_action);
END $$;
CREATE FUNCTION allura.lock_authority(principal_arg uuid, group_arg text, workspace_arg uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 PERFORM 1 FROM allura.principals WHERE id=principal_arg FOR SHARE;
 PERFORM 1 FROM allura.identity_bindings WHERE principal_id=principal_arg FOR SHARE;
 PERFORM 1 FROM allura.machine_credentials WHERE principal_id=principal_arg FOR SHARE;
 PERFORM 1 FROM allura.tenants WHERE group_id=group_arg FOR SHARE;
 PERFORM 1 FROM allura.memberships WHERE group_id=group_arg AND principal_id=principal_arg FOR SHARE;
 PERFORM 1 FROM allura.workspaces WHERE group_id=group_arg AND id=workspace_arg FOR SHARE;
 PERFORM 1 FROM allura.workspace_grants WHERE group_id=group_arg AND workspace_id=workspace_arg AND principal_id=principal_arg FOR SHARE;
END $$;
ALTER TABLE allura.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.events FORCE ROW LEVEL SECURITY;
CREATE POLICY events_read ON allura.events FOR SELECT TO allura_app USING (allura.context_allows(group_id,workspace_id,'evidence:read'));
CREATE POLICY events_append ON allura.events FOR INSERT TO allura_app WITH CHECK (kind='capture' AND actor_id::text=current_setting('allura.principal',true) AND allura.context_allows(group_id,workspace_id,'memory:capture'));
ALTER TABLE allura.access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.access_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY access_read ON allura.access_audit FOR SELECT TO allura_app USING (allura.context_allows(group_id,workspace_id,'audit:read'));
REVOKE ALL ON ALL TABLES IN SCHEMA allura FROM PUBLIC, allura_app;
GRANT SELECT,INSERT ON allura.events TO allura_app;
GRANT SELECT ON allura.access_audit TO allura_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA allura FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.resolve_authority(text,text,text,text,text,text,text), allura.lookup_machine(text), allura.context_allows(text,uuid,text), allura.lock_authority(uuid,text,uuid) TO allura_app;
