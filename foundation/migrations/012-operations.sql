CREATE TABLE allura.operation_observations (
 group_id text NOT NULL,workspace_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,correlation_id uuid NOT NULL,
 stage text NOT NULL CHECK(stage IN('capture','indexing','retrieval','promotion')),
 outcome text NOT NULL CHECK(outcome IN('succeeded','failed','partial','unknown')),
 reason text CHECK(reason IN('in_progress','retry_scheduled','attempts_exhausted','fallback','unavailable')),
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(group_id,workspace_id,id),
 FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces,FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
CREATE INDEX operation_observations_recent ON allura.operation_observations(group_id,workspace_id,observed_at DESC,id DESC);
ALTER TABLE allura.operation_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.operation_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY operation_read ON allura.operation_observations FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'audit:read'));
CREATE TRIGGER operation_immutable BEFORE UPDATE OR DELETE ON allura.operation_observations FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER operation_no_truncate BEFORE TRUNCATE ON allura.operation_observations FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.operation_observations FROM PUBLIC,allura_app;
GRANT SELECT ON allura.operation_observations TO allura_app;
CREATE FUNCTION allura.observe_durable_stage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid;correlation uuid;stage_value text;outcome_value text;reason_value text;
BEGIN
 IF TG_TABLE_NAME='events' THEN
  IF NEW.kind<>'capture' THEN RETURN NEW; END IF;
  actor:=NEW.actor_id;correlation:=NEW.id;stage_value:='capture';outcome_value:='succeeded';
 ELSIF TG_TABLE_NAME='decision_receipts' THEN
  IF NEW.decision<>'approve' THEN RETURN NEW; END IF;
  actor:=NEW.reviewer_id;correlation:=NEW.semantic_version_id;stage_value:='promotion';outcome_value:='succeeded';
 ELSE
  IF NEW.state='queued' THEN RETURN NEW; END IF;
  actor:=NEW.actor_id;correlation:=NEW.source_id;stage_value:='indexing';
  outcome_value:=CASE WHEN NEW.state='succeeded' THEN 'succeeded' WHEN NEW.state='failed' THEN 'failed' ELSE 'unknown' END;
  reason_value:=CASE WHEN NEW.state='processing' THEN 'in_progress' WHEN NEW.state='retry_wait' THEN 'retry_scheduled' WHEN NEW.state='failed' THEN 'attempts_exhausted' END;
 END IF;
 INSERT INTO allura.operation_observations(group_id,workspace_id,actor_id,correlation_id,stage,outcome,reason) VALUES(NEW.group_id,NEW.workspace_id,actor,correlation,stage_value,outcome_value,reason_value);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION allura.observe_durable_stage() FROM PUBLIC,allura_app;
CREATE TRIGGER observe_capture AFTER INSERT ON allura.events FOR EACH ROW EXECUTE FUNCTION allura.observe_durable_stage();
CREATE TRIGGER observe_promotion AFTER INSERT ON allura.decision_receipts FOR EACH ROW EXECUTE FUNCTION allura.observe_durable_stage();
CREATE TRIGGER observe_index AFTER UPDATE OF state ON allura.index_jobs FOR EACH ROW EXECUTE FUNCTION allura.observe_durable_stage();
CREATE FUNCTION allura.observe_retrieval(g text,w uuid,outcome_value text,reason_value text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE correlation uuid:=gen_random_uuid();
BEGIN
 IF NOT allura.context_allows(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden';END IF;
 IF outcome_value NOT IN('succeeded','failed','partial','unknown') OR (reason_value IS NOT NULL AND reason_value NOT IN('fallback','unavailable')) THEN RAISE EXCEPTION 'invalid';END IF;
 INSERT INTO allura.operation_observations(group_id,workspace_id,actor_id,correlation_id,stage,outcome,reason) VALUES(g,w,current_setting('allura.principal')::uuid,correlation,'retrieval',outcome_value,reason_value);
 RETURN correlation;
END $$;
CREATE FUNCTION allura.scoped_operational_health(g text,w uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE semantic_count integer;missing_semantic integer;event_count integer;missing_events integer;jobs jsonb;
BEGIN
 IF NOT allura.context_allows(g,w,'health:read') THEN RAISE EXCEPTION 'forbidden';END IF;
 SELECT count(*),count(*) FILTER(WHERE NOT EXISTS(SELECT FROM allura.source_vectors x WHERE x.group_id=g AND x.workspace_id=w AND x.source_kind='semantic' AND x.source_id=v.id AND x.digest=encode(sha256(convert_to(v.content,'UTF8')),'hex')))
 INTO semantic_count,missing_semantic FROM allura.semantic_heads h JOIN allura.semantic_versions v ON v.group_id=h.group_id AND v.workspace_id=h.workspace_id AND v.id=h.current_version_id WHERE h.group_id=g AND h.workspace_id=w AND h.lifecycle='current';
 SELECT count(*),count(*) FILTER(WHERE NOT EXISTS(SELECT FROM allura.source_vectors x WHERE x.group_id=g AND x.workspace_id=w AND x.source_kind='event' AND x.source_id=e.id AND x.digest=encode(sha256(convert_to(e.payload->>'content','UTF8')),'hex')))
 INTO event_count,missing_events FROM allura.events e WHERE e.group_id=g AND e.workspace_id=w AND e.kind='capture' AND jsonb_typeof(e.payload->'content')='string';
 SELECT coalesce(jsonb_object_agg(state,n),'{}'::jsonb) INTO jobs FROM(SELECT state,count(*) n FROM allura.index_jobs WHERE group_id=g AND workspace_id=w GROUP BY state) scoped_jobs;
 RETURN jsonb_build_object('currentSemantic',semantic_count,'missingSemanticVectors',missing_semantic,'capturedEvents',event_count,'missingEventVectors',missing_events,'jobs',jobs);
END $$;
REVOKE ALL ON FUNCTION allura.observe_retrieval(text,uuid,text,text),allura.scoped_operational_health(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.observe_retrieval(text,uuid,text,text),allura.scoped_operational_health(text,uuid) TO allura_app;
