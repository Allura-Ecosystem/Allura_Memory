-- No provisioning/import API. All authority and fixture installation is owner-only.
CREATE FUNCTION allura.work_text(v text,lo integer,hi integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT v IS NOT NULL AND octet_length(v) BETWEEN lo AND hi AND v !~ '[[:cntrl:]]' $$;
CREATE FUNCTION allura.work_token(v timestamptz) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT to_char(v AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;
CREATE TABLE allura.work_authority(singleton boolean PRIMARY KEY CHECK(singleton),id text UNIQUE NOT NULL CHECK(allura.work_text(id,1,256)));
CREATE TABLE allura.work_entitlements(
 group_id text NOT NULL,workspace_id uuid NOT NULL,principal_id uuid NOT NULL,action text NOT NULL CHECK(action IN ('work:read','work:write')),active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(group_id,workspace_id,principal_id,action),FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces,FOREIGN KEY(group_id,principal_id) REFERENCES allura.memberships
);
CREATE TABLE allura.work_projects(
 group_id text NOT NULL,workspace_id uuid NOT NULL,id text NOT NULL CHECK(allura.work_text(id,1,256)),authority_instance_id text NOT NULL CHECK(allura.work_text(authority_instance_id,1,256)),active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(group_id,workspace_id,id),UNIQUE(group_id,id),FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE FUNCTION allura.work_json_depth(v jsonb,budget integer) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,allura AS $$
DECLARE child jsonb;
BEGIN
 IF jsonb_typeof(v) NOT IN ('array','object') THEN RETURN true; END IF;
 IF budget<1 THEN RETURN false; END IF;
 IF jsonb_typeof(v)='array' THEN
  FOR child IN SELECT value FROM jsonb_array_elements(v) LOOP IF NOT allura.work_json_depth(child,budget-1) THEN RETURN false; END IF; END LOOP;
 ELSE
  FOR child IN SELECT value FROM jsonb_each(v) LOOP IF NOT allura.work_json_depth(child,budget-1) THEN RETURN false; END IF; END LOOP;
 END IF;RETURN true;
END $$;
REVOKE ALL ON FUNCTION allura.work_json_depth(jsonb,integer) FROM PUBLIC,allura_app;
CREATE TABLE allura.work_items(
 group_id text NOT NULL,workspace_id uuid NOT NULL,project_id text NOT NULL,id text NOT NULL CHECK(allura.work_text(id,1,256)),
 lane_id text CHECK(lane_id IS NULL),title text NOT NULL CHECK(allura.work_text(title,1,512)),description text CHECK(description IS NULL OR allura.work_text(description,0,8192)),
 status text NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','ready','in_progress','in_review','blocked','done','cancelled')),priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
 owner_id text CHECK(owner_id IS NULL),team_id text CHECK(team_id IS NULL),acceptance_criteria jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(acceptance_criteria)='array' AND jsonb_array_length(acceptance_criteria)<=32 AND octet_length(acceptance_criteria::text)<=16384 AND allura.work_json_depth(acceptance_criteria,8)),
 linked_run_id text CHECK(linked_run_id IS NULL),latest_receipt_id uuid,blocker text CHECK(blocker IS NULL OR allura.work_text(blocker,0,2048)),
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,completed_at timestamptz,
 PRIMARY KEY(group_id,workspace_id,id),UNIQUE(group_id,workspace_id,id,project_id),FOREIGN KEY(group_id,workspace_id,project_id) REFERENCES allura.work_projects,
 CHECK(created_at>='0001-01-01T00:00:00Z' AND created_at<'10000-01-01T00:00:00Z' AND updated_at>=created_at AND updated_at<'10000-01-01T00:00:00Z'),
 CHECK((status IN ('done','cancelled') AND completed_at=updated_at) OR (status NOT IN ('done','cancelled') AND completed_at IS NULL))
);
CREATE FUNCTION allura.work_storage_cap() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,allura AS $$
DECLARE n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(NEW.group_id,NEW.workspace_id,'work-operations-v1')::text,13002));
 IF TG_TABLE_NAME='work_projects' THEN
  SELECT count(*) INTO n FROM allura.work_projects WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id;
  IF n>=64 THEN RAISE EXCEPTION 'capacity'; END IF;
 ELSE
  SELECT count(*) INTO n FROM allura.work_items WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id;
  IF n>=256 THEN RAISE EXCEPTION 'capacity'; END IF;
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION allura.work_storage_cap() FROM PUBLIC,allura_app;
CREATE TRIGGER capacity BEFORE INSERT ON allura.work_projects FOR EACH ROW EXECUTE FUNCTION allura.work_storage_cap();
CREATE TRIGGER capacity BEFORE INSERT ON allura.work_items FOR EACH ROW EXECUTE FUNCTION allura.work_storage_cap();
CREATE TABLE allura.work_events(
 group_id text NOT NULL,workspace_id uuid NOT NULL,id uuid NOT NULL,item_id text NOT NULL,project_id text NOT NULL,receipt_id uuid NOT NULL,actor_id uuid NOT NULL,kind text NOT NULL CHECK(kind='work_item_transition'),payload jsonb NOT NULL,
 PRIMARY KEY(group_id,workspace_id,id),UNIQUE(group_id,workspace_id,id,receipt_id,item_id),UNIQUE(group_id,workspace_id,receipt_id),
 FOREIGN KEY(group_id,workspace_id,item_id,project_id) REFERENCES allura.work_items(group_id,workspace_id,id,project_id),FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
CREATE TABLE allura.work_receipts(
 group_id text NOT NULL,workspace_id uuid NOT NULL,id uuid NOT NULL,event_id uuid NOT NULL,item_id text NOT NULL,project_id text NOT NULL,actor_id uuid NOT NULL,
 operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'),receipt_text text NOT NULL,response_text text NOT NULL,http_status integer NOT NULL CHECK(http_status=200),
 PRIMARY KEY(group_id,workspace_id,id),UNIQUE(group_id,workspace_id,id,item_id),UNIQUE(group_id,workspace_id,actor_id,operation_key),
 FOREIGN KEY(group_id,workspace_id,item_id,project_id) REFERENCES allura.work_items(group_id,workspace_id,id,project_id),FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships,
 FOREIGN KEY(group_id,workspace_id,event_id,id,item_id) REFERENCES allura.work_events(group_id,workspace_id,id,receipt_id,item_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(octet_length(response_text)<=131072 AND response_text::jsonb->'operation_receipt'=receipt_text::jsonb)
);
ALTER TABLE allura.work_events ADD FOREIGN KEY(group_id,workspace_id,receipt_id,item_id) REFERENCES allura.work_receipts(group_id,workspace_id,id,item_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE allura.work_items ADD FOREIGN KEY(group_id,workspace_id,latest_receipt_id,id) REFERENCES allura.work_receipts(group_id,workspace_id,id,item_id) DEFERRABLE INITIALLY DEFERRED;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['work_authority','work_entitlements','work_projects','work_items','work_events','work_receipts'] LOOP
  EXECUTE format('ALTER TABLE allura.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE allura.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON allura.%I FROM PUBLIC,allura_app',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['work_authority','work_events','work_receipts'] LOOP
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON allura.%I FOR EACH ROW EXECUTE FUNCTION allura.append_only()',t);
  EXECUTE format('CREATE TRIGGER no_truncate BEFORE TRUNCATE ON allura.%I FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only()',t);
 END LOOP;
END $$;
CREATE FUNCTION allura.work_project_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'active') IS DISTINCT FROM (to_jsonb(OLD)-'active') THEN RAISE EXCEPTION 'immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER frozen BEFORE UPDATE OR DELETE ON allura.work_projects FOR EACH ROW EXECUTE FUNCTION allura.work_project_frozen();
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON allura.work_projects FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE FUNCTION allura.work_guard(g text,w uuid,writing boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE p uuid;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 p:=current_setting('allura.principal')::uuid;
 PERFORM allura.lock_authority(p,g,w);
 PERFORM 1 FROM allura.work_entitlements WHERE group_id=g AND workspace_id=w AND principal_id=p ORDER BY action FOR SHARE;
 IF NOT allura.context_allows(g,w,'memory:read') OR NOT EXISTS(SELECT FROM allura.work_entitlements WHERE group_id=g AND workspace_id=w AND principal_id=p AND action='work:read' AND active)
 OR (writing AND NOT EXISTS(SELECT FROM allura.work_entitlements WHERE group_id=g AND workspace_id=w AND principal_id=p AND action='work:write' AND active)) THEN RAISE EXCEPTION 'forbidden'; END IF;
END $$;
CREATE FUNCTION allura.work_map(g text,w uuid,i text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE a text; p allura.work_projects;
BEGIN
 PERFORM allura.work_guard(g,w,false);
 SELECT id INTO a FROM allura.work_authority WHERE singleton FOR SHARE;
 SELECT m.* INTO p FROM allura.work_projects m JOIN allura.work_items x ON (x.group_id,x.workspace_id,x.project_id)=(m.group_id,m.workspace_id,m.id) WHERE x.group_id=g AND x.workspace_id=w AND x.id=i FOR SHARE OF m;
 IF a IS NULL OR p.id IS NULL OR NOT p.active OR p.authority_instance_id<>a THEN RAISE EXCEPTION 'not_found'; END IF;
 RETURN a;
END $$;
CREATE FUNCTION allura.work_snapshot(x allura.work_items) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,allura AS $$
 SELECT to_jsonb(x)||jsonb_build_object('created_at',allura.work_token(x.created_at),'updated_at',allura.work_token(x.updated_at),'completed_at',CASE WHEN x.completed_at IS NULL THEN NULL ELSE allura.work_token(x.completed_at) END)
$$;
CREATE FUNCTION allura.read_work_item(g text,w uuid,i text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE x allura.work_items;
BEGIN
 PERFORM allura.work_guard(g,w,false);PERFORM allura.work_map(g,w,i);
 SELECT * INTO x FROM allura.work_items WHERE group_id=g AND workspace_id=w AND id=i FOR SHARE;
 IF x.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 RETURN jsonb_build_object('work_item',allura.work_snapshot(x))::text;
END $$;
CREATE FUNCTION allura.transition_work_item(g text,w uuid,i text,v jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid; a text; project_key text; x allura.work_items; old allura.work_receipts; digest text; before_token text; before_status text; next_time timestamptz; rid uuid:=gen_random_uuid();eid uuid:=gen_random_uuid();r jsonb;response text;
BEGIN
 PERFORM allura.work_guard(g,w,true);
 actor:=current_setting('allura.principal')::uuid;
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT v ?& ARRAY['contract','command','group_id','workspace_id','actor_id','operation_key','expected_updated_at','to_status','reason','evidence_id'] OR (SELECT count(*) FROM jsonb_object_keys(v))<>10
 OR v->>'contract' IS DISTINCT FROM 'work-plane-compatibility-v1' OR v->>'command' IS DISTINCT FROM 'transition' OR v->>'group_id' IS DISTINCT FROM g OR v->>'workspace_id' IS DISTINCT FROM w::text
 OR jsonb_typeof(v->'operation_key') IS DISTINCT FROM 'string' OR (v->>'operation_key') !~ '^[A-Za-z0-9._:-]{1,128}$'
 OR jsonb_typeof(v->'expected_updated_at') IS DISTINCT FROM 'string' OR (v->>'expected_updated_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
 OR NOT allura.work_text(i,1,256) OR v->'evidence_id' IS DISTINCT FROM 'null'::jsonb OR (v->'reason'<>'null'::jsonb AND (jsonb_typeof(v->'reason')<>'string' OR octet_length(v->>'reason')>2048))
 OR jsonb_typeof(v->'to_status') IS DISTINCT FROM 'string' OR (v->>'to_status') NOT IN ('backlog','ready','in_progress','in_review','blocked','done','cancelled') THEN RAISE EXCEPTION 'invalid'; END IF;
 IF v->>'actor_id' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'forbidden'; END IF;
 BEGIN
  next_time:=(v->>'expected_updated_at')::timestamptz;
  IF next_time<'0001-01-01T00:00:00Z' OR next_time>='10000-01-01T00:00:00Z' OR allura.work_token(next_time)<>v->>'expected_updated_at' THEN RAISE EXCEPTION 'invalid'; END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid'; END;
 a:=allura.work_map(g,w,i);
 -- One workspace work namespace serializes all retained admissions, including keys.
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,'work-operations-v1')::text,13002));
 SELECT project_id INTO project_key FROM allura.work_items WHERE group_id=g AND workspace_id=w AND id=i;
 digest:=encode(sha256(convert_to((v-'operation_key'||jsonb_build_object('authority_instance_id',a,'work_item_id',i,'project_id',project_key))::text,'UTF8')),'hex');
 SELECT * INTO old FROM allura.work_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=v->>'operation_key';
 IF old.id IS NOT NULL THEN
  IF old.request_digest<>digest THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN old.response_text;
 END IF;
 SELECT * INTO x FROM allura.work_items WHERE group_id=g AND workspace_id=w AND id=i FOR UPDATE;
 IF x.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 before_token:=allura.work_token(x.updated_at);before_status:=x.status;
 IF before_token<>v->>'expected_updated_at' THEN RAISE EXCEPTION 'conflict'; END IF;
 IF NOT (CASE x.status WHEN 'backlog' THEN v->>'to_status' IN ('ready','cancelled') WHEN 'ready' THEN v->>'to_status' IN ('in_progress','backlog','cancelled') WHEN 'in_progress' THEN v->>'to_status' IN ('in_review','blocked','done','cancelled') WHEN 'in_review' THEN v->>'to_status' IN ('in_progress','done','cancelled') WHEN 'blocked' THEN v->>'to_status' IN ('in_progress','cancelled') ELSE false END) THEN RAISE EXCEPTION 'invalid'; END IF;
 IF (SELECT count(*) FROM allura.work_receipts WHERE group_id=g AND workspace_id=w)>=1024 THEN RAISE EXCEPTION 'capacity'; END IF;
 next_time:=greatest(clock_timestamp(),x.updated_at+interval '1 microsecond');
 IF next_time>='10000-01-01T00:00:00Z' THEN RAISE EXCEPTION 'capacity'; END IF;
 UPDATE allura.work_items SET status=v->>'to_status',updated_at=next_time,completed_at=CASE WHEN v->>'to_status' IN ('done','cancelled') THEN next_time ELSE NULL END,latest_receipt_id=rid WHERE group_id=g AND workspace_id=w AND id=i RETURNING * INTO x;
 r:=jsonb_build_object('contract','work-plane-compatibility-v1','receipt_id',rid,'event_id',eid,'authority_instance_id',a,'group_id',g,'workspace_id',w,'actor_id',actor,'operation_key',v->>'operation_key','command','transition','request_digest',digest,'work_item_id',i,'project_id',x.project_id,'before_status',before_status,'after_status',x.status,'before_updated_at',before_token,'after_updated_at',allura.work_token(next_time),'evidence_refs','[]'::jsonb,'accepted_at',allura.work_token(next_time),'outcome','committed');
 response:=jsonb_build_object('work_item',allura.work_snapshot(x),'operation_receipt',r)::text;
 INSERT INTO allura.work_events VALUES(g,w,eid,i,x.project_id,rid,actor,'work_item_transition',r||jsonb_build_object('reason',v->'reason'));
 INSERT INTO allura.work_receipts VALUES(g,w,rid,eid,i,x.project_id,actor,v->>'operation_key',digest,r::text,response,200);
 RETURN response;
END $$;
-- No direct application table privileges. Fixed-search-path helpers are private
-- unless explicitly named below; caller GUCs remain trusted-server assertions.
REVOKE ALL ON FUNCTION allura.work_text(text,integer,integer),allura.work_token(timestamptz),allura.work_project_frozen(),allura.work_snapshot(allura.work_items),allura.work_guard(text,uuid,boolean),allura.work_map(text,uuid,text),allura.read_work_item(text,uuid,text),allura.transition_work_item(text,uuid,text,jsonb) FROM PUBLIC,allura_app;
GRANT EXECUTE ON FUNCTION allura.work_guard(text,uuid,boolean),allura.work_map(text,uuid,text),allura.read_work_item(text,uuid,text),allura.transition_work_item(text,uuid,text,jsonb) TO allura_app;
