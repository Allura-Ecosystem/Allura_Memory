-- App presentation configuration is not a grant or a domain-data mutation.
ALTER TABLE allura.events DROP CONSTRAINT events_kind_check;
ALTER TABLE allura.events ADD CONSTRAINT events_kind_check CHECK(kind IN ('capture','proposal','decision','deletion','projection_transfer','bumblebee_config','bumblebee_scan','app_module'));
CREATE TABLE allura.app_module_heads (
 group_id text NOT NULL,workspace_id uuid NOT NULL,app_id text NOT NULL CHECK(app_id IN ('bumblebee','memory-review')),revision integer NOT NULL CHECK(revision>0),
 PRIMARY KEY(group_id,workspace_id,app_id),FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE TABLE allura.app_module_revisions (
 group_id text NOT NULL,workspace_id uuid NOT NULL,app_id text NOT NULL,revision integer NOT NULL CHECK(revision>0),
 version text NOT NULL CHECK(version IN ('1.0.0','1.0.1')),enabled boolean NOT NULL,configuration jsonb NOT NULL CHECK(jsonb_typeof(configuration)='object'),
 source_id uuid GENERATED ALWAYS AS ((configuration->>'sourceId')::uuid) STORED,
 CONSTRAINT app_module_configuration_shape CHECK((app_id='memory-review' AND configuration='{}'::jsonb) OR (app_id='bumblebee' AND configuration ? 'sourceId' AND configuration-'sourceId'='{}'::jsonb)),
 CONSTRAINT app_module_source_scope_fkey FOREIGN KEY(group_id,workspace_id,source_id) REFERENCES allura.bumblebee_source_heads(group_id,workspace_id,source_id),
 actor_id uuid NOT NULL,event_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,app_id,revision),FOREIGN KEY(group_id,workspace_id,app_id) REFERENCES allura.app_module_heads,
 FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships,FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE allura.app_module_heads ADD FOREIGN KEY(group_id,workspace_id,app_id,revision) REFERENCES allura.app_module_revisions DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE allura.app_module_receipts (
 group_id text NOT NULL,workspace_id uuid NOT NULL,actor_id uuid NOT NULL,operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 app_id text NOT NULL,revision integer NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),rationale text NOT NULL CHECK(octet_length(rationale) BETWEEN 1 AND 4000),
 evidence_ids uuid[] NOT NULL CHECK(cardinality(evidence_ids) BETWEEN 1 AND 32),receipt_text text NOT NULL,event_id uuid NOT NULL,
 PRIMARY KEY(group_id,workspace_id,actor_id,operation_key),FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships,
 FOREIGN KEY(group_id,workspace_id,app_id,revision) REFERENCES allura.app_module_revisions,
 FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION allura.configure_app_module(g text,w uuid,input jsonb,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid:=current_setting('allura.principal')::uuid; prior allura.app_module_receipts; h allura.app_module_heads;
 app text:=input->>'appId'; version_arg text:=input->>'version'; enabled_arg boolean:=(input->>'enabled')::boolean; expected integer:=(input->>'expectedRevision')::integer;
 config jsonb:=input->'configuration';evidence uuid[]; e uuid:=gen_random_uuid(); next_revision integer; result text;source_arg uuid;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'workspace:grants:manage') THEN RAISE EXCEPTION 'forbidden';END IF;
 IF app IS NULL OR app NOT IN ('bumblebee','memory-review') OR version_arg IS NULL OR version_arg NOT IN ('1.0.0','1.0.1') OR expected IS NULL OR expected<0 OR expected>=2147483647 OR enabled_arg IS NULL OR jsonb_typeof(config) IS DISTINCT FROM 'object' OR coalesce(input->>'operationKey','') !~ '^[A-Za-z0-9._:-]{1,128}$' OR coalesce(digest_arg,'') !~ '^[a-f0-9]{64}$' OR octet_length(coalesce(input->>'rationale','')) NOT BETWEEN 1 AND 4000 OR jsonb_typeof(input->'evidenceIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid';END IF;
 IF jsonb_array_length(input->'evidenceIds') NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'invalid';END IF;
 IF app='memory-review' AND config<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid';END IF;
 IF app='bumblebee' THEN
  IF NOT(config ? 'sourceId') OR config-'sourceId'<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid';END IF;
  source_arg:=(config->>'sourceId')::uuid;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,actor,input->>'operationKey')::text,10130));
 SELECT * INTO prior FROM allura.app_module_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=input->>'operationKey';
 IF FOUND THEN IF prior.digest<>digest_arg THEN RAISE EXCEPTION 'conflict';END IF;RETURN prior.receipt_text;END IF;
 SELECT array_agg(value::uuid ORDER BY value) INTO evidence FROM jsonb_array_elements_text(input->'evidenceIds');
 IF cardinality(evidence)<>(SELECT count(DISTINCT x) FROM unnest(evidence) x) THEN RAISE EXCEPTION 'invalid';END IF;
 IF EXISTS(SELECT FROM unnest(evidence) x WHERE NOT EXISTS(SELECT FROM allura.events WHERE group_id=g AND workspace_id=w AND id=x)) THEN RAISE EXCEPTION 'not_found';END IF;
 IF source_arg IS NOT NULL AND NOT EXISTS(SELECT FROM allura.bumblebee_source_heads WHERE group_id=g AND workspace_id=w AND source_id=source_arg) THEN RAISE EXCEPTION 'not_found';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,app)::text,10131));
 SELECT * INTO h FROM allura.app_module_heads WHERE group_id=g AND workspace_id=w AND app_id=app FOR UPDATE;
 IF coalesce(h.revision,0)<>expected THEN RAISE EXCEPTION 'conflict';END IF;next_revision:=expected+1;
 IF h.app_id IS NULL THEN INSERT INTO allura.app_module_heads VALUES(g,w,app,next_revision);ELSE UPDATE allura.app_module_heads SET revision=next_revision WHERE group_id=g AND workspace_id=w AND app_id=app;END IF;
 INSERT INTO allura.app_module_revisions(group_id,workspace_id,app_id,revision,version,enabled,configuration,actor_id,event_id) VALUES(g,w,app,next_revision,version_arg,enabled_arg,config,actor,e);
 result:=jsonb_build_object('contract','app-module-v1','appId',app,'version',version_arg,'revision',next_revision,'enabled',enabled_arg,'configuration',config,'actorId',actor,'eventId',e,'scope',jsonb_build_object('groupId',g,'workspaceId',w),'operationKey',input->>'operationKey','capabilityChange','none','dataChange','none')::text;
 INSERT INTO allura.app_module_receipts VALUES(g,w,actor,input->>'operationKey',app,next_revision,digest_arg,input->>'rationale',evidence,result,e);
 INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(g,w,e,actor,'app_module',jsonb_build_object('appId',app,'revision',next_revision,'version',version_arg,'enabled',enabled_arg,'capabilityChange','none','dataChange','none'));
 RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'conflict';
END $$;
CREATE FUNCTION allura.read_app_modules(g text,w uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',a.id,'revision',coalesce(h.revision,0),'version',coalesce(r.version,'1.0.0'),'enabled',coalesce(r.enabled,false),'configuration',coalesce(r.configuration,CASE WHEN a.id='bumblebee' THEN '{"sourceId":null}'::jsonb ELSE '{}'::jsonb END)) ORDER BY a.id) INTO result
 FROM (VALUES('bumblebee'),('memory-review')) a(id) LEFT JOIN allura.app_module_heads h ON h.group_id=g AND h.workspace_id=w AND h.app_id=a.id
 LEFT JOIN allura.app_module_revisions r ON r.group_id=h.group_id AND r.workspace_id=h.workspace_id AND r.app_id=h.app_id AND r.revision=h.revision;
 RETURN result;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['app_module_heads','app_module_revisions','app_module_receipts'] LOOP
  EXECUTE format('ALTER TABLE allura.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE allura.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON allura.%I FROM PUBLIC,allura_app',t);
  IF t<>'app_module_heads' THEN
   EXECUTE format('CREATE TRIGGER app_module_immutable BEFORE UPDATE OR DELETE ON allura.%I FOR EACH ROW EXECUTE FUNCTION allura.append_only()',t);
   EXECUTE format('CREATE TRIGGER app_module_no_truncate BEFORE TRUNCATE ON allura.%I FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only()',t);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION allura.configure_app_module(text,uuid,jsonb,text),allura.read_app_modules(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.configure_app_module(text,uuid,jsonb,text),allura.read_app_modules(text,uuid) TO allura_app;
