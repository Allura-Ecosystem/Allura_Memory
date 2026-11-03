CREATE TABLE allura.capture_receipts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL,
 event_id uuid NOT NULL, principal_id uuid NOT NULL REFERENCES allura.principals,
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'), receipt_text text NOT NULL CHECK(octet_length(receipt_text)<=8192),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,id),
 UNIQUE(group_id,workspace_id,id,event_id,principal_id), FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events
);
CREATE TABLE allura.capture_replay (
 group_id text NOT NULL, workspace_id uuid NOT NULL, principal_id uuid NOT NULL,
 operation_kind text NOT NULL CHECK(operation_kind='memory_add'), operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'), receipt_id uuid NOT NULL, event_id uuid NOT NULL,
 PRIMARY KEY(group_id,workspace_id,principal_id,operation_kind,operation_key),
 FOREIGN KEY(group_id,workspace_id,receipt_id,event_id,principal_id) REFERENCES allura.capture_receipts(group_id,workspace_id,id,event_id,principal_id)
);
CREATE TABLE allura.index_intents (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL,
 receipt_id uuid NOT NULL, event_id uuid NOT NULL, principal_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,id),
 UNIQUE(group_id,workspace_id,event_id),
 FOREIGN KEY(group_id,workspace_id,receipt_id,event_id,principal_id) REFERENCES allura.capture_receipts(group_id,workspace_id,id,event_id,principal_id)
);
CREATE FUNCTION allura.capture_access(g text,w uuid,p uuid,writing boolean) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
 SELECT p::text=current_setting('allura.principal',true) AND (
   allura.context_allows(g,w,'memory:capture') OR (NOT writing AND allura.context_allows(g,w,'memory:read')));
$$;
REVOKE ALL ON FUNCTION allura.capture_access(text,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.capture_access(text,uuid,uuid,boolean) TO allura_app;
ALTER TABLE allura.capture_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.capture_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.capture_replay ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.capture_replay FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.index_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.index_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY receipt_read ON allura.capture_receipts FOR SELECT TO allura_app USING(allura.capture_access(group_id,workspace_id,principal_id,false));
CREATE POLICY receipt_write ON allura.capture_receipts FOR INSERT TO allura_app WITH CHECK(allura.capture_access(group_id,workspace_id,principal_id,true));
CREATE POLICY replay_read ON allura.capture_replay FOR SELECT TO allura_app USING(allura.capture_access(group_id,workspace_id,principal_id,false));
CREATE POLICY replay_write ON allura.capture_replay FOR INSERT TO allura_app WITH CHECK(allura.capture_access(group_id,workspace_id,principal_id,true));
CREATE POLICY intent_read ON allura.index_intents FOR SELECT TO allura_app USING(allura.capture_access(group_id,workspace_id,principal_id,false));
CREATE POLICY intent_write ON allura.index_intents FOR INSERT TO allura_app WITH CHECK(allura.capture_access(group_id,workspace_id,principal_id,true));
CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON allura.capture_receipts FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER receipt_no_truncate BEFORE TRUNCATE ON allura.capture_receipts FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER replay_immutable BEFORE UPDATE OR DELETE ON allura.capture_replay FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER replay_no_truncate BEFORE TRUNCATE ON allura.capture_replay FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER intent_immutable BEFORE UPDATE OR DELETE ON allura.index_intents FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER intent_no_truncate BEFORE TRUNCATE ON allura.index_intents FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.capture_receipts,allura.capture_replay,allura.index_intents FROM PUBLIC,allura_app;
GRANT SELECT,INSERT ON allura.capture_receipts,allura.capture_replay,allura.index_intents TO allura_app;
