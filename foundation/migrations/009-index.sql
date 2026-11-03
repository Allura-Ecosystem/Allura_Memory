CREATE TABLE allura.index_jobs (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_kind text NOT NULL CHECK(source_kind IN ('event','semantic')), source_id uuid NOT NULL,
 index_version text NOT NULL CHECK(index_version='minilm-q8-mean-normalized-v1'),
 event_id uuid GENERATED ALWAYS AS (CASE WHEN source_kind='event' THEN source_id END) STORED,
 semantic_id uuid GENERATED ALWAYS AS (CASE WHEN source_kind='semantic' THEN source_id END) STORED,
 state text NOT NULL CHECK(state IN ('queued','processing','succeeded','retry_wait','failed')), attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 3),
 actor_id uuid NOT NULL, lease_id uuid, lease_until timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,source_kind,source_id,index_version), FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events,
 FOREIGN KEY(group_id,workspace_id,semantic_id) REFERENCES allura.semantic_versions, FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
CREATE TABLE allura.source_vectors (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_kind text NOT NULL, source_id uuid NOT NULL, index_version text NOT NULL,
 model_id text NOT NULL CHECK(model_id='Xenova/all-MiniLM-L6-v2'), model_revision text NOT NULL CHECK(model_revision='751bff37182d3f1213fa05d7196b954e230abad9'),
 dimensions integer NOT NULL CHECK(dimensions=384), embedding real[] NOT NULL CHECK(cardinality(embedding)=384), digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,source_kind,source_id,index_version),
 FOREIGN KEY(group_id,workspace_id,source_kind,source_id,index_version) REFERENCES allura.index_jobs
);
CREATE FUNCTION allura.index_source(g text,w uuid,k text,s uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE content_value text;
BEGIN
 IF NOT allura.context_allows(g,w,'proposal:write') OR NOT allura.additional_action(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF k='semantic' THEN SELECT content INTO content_value FROM allura.semantic_versions WHERE group_id=g AND workspace_id=w AND id=s;
 ELSIF k='event' THEN SELECT payload->>'content' INTO content_value FROM allura.events WHERE group_id=g AND workspace_id=w AND id=s AND kind='capture' AND jsonb_typeof(payload->'content')='string' AND (actor_id::text=current_setting('allura.principal',true) OR allura.additional_action(g,w,'evidence:read'));
 ELSE RAISE EXCEPTION 'invalid'; END IF;
 IF content_value IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;RETURN content_value;
END $$;
CREATE FUNCTION allura.claim_index(g text,w uuid,k text,s uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE content_value text:=allura.index_source(g,w,k,s); actor uuid:=current_setting('allura.principal',true)::uuid; job allura.index_jobs; lease uuid:=gen_random_uuid();
BEGIN
 INSERT INTO allura.index_jobs(group_id,workspace_id,source_kind,source_id,index_version,state,attempts,actor_id,digest) VALUES(g,w,k,s,'minilm-q8-mean-normalized-v1','queued',0,actor,encode(sha256(convert_to(content_value,'UTF8')),'hex')) ON CONFLICT DO NOTHING;
 SELECT * INTO job FROM allura.index_jobs WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version='minilm-q8-mean-normalized-v1' FOR UPDATE;
 IF job.state IN ('succeeded','failed') OR (job.state='processing' AND job.lease_until>clock_timestamp()) OR (job.state='retry_wait' AND job.next_attempt_at>clock_timestamp()) THEN RETURN jsonb_build_object('state',job.state); END IF;
 IF job.attempts>=3 THEN UPDATE allura.index_jobs SET state='failed',updated_at=clock_timestamp() WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version=job.index_version;RETURN jsonb_build_object('state','failed'); END IF;
 UPDATE allura.index_jobs SET state='processing',attempts=attempts+1,actor_id=actor,lease_id=lease,lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version=job.index_version;
 RETURN jsonb_build_object('state','claimed','leaseId',lease,'content',content_value,'digest',job.digest);
END $$;
CREATE FUNCTION allura.finish_index(g text,w uuid,k text,s uuid,lease uuid,vector_json jsonb,success boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE content_value text:=allura.index_source(g,w,k,s); actor uuid:=current_setting('allura.principal',true)::uuid; job allura.index_jobs; values_array real[]; norm double precision;
BEGIN
 SELECT * INTO job FROM allura.index_jobs WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version='minilm-q8-mean-normalized-v1' FOR UPDATE;
 IF job.lease_id IS DISTINCT FROM lease OR job.actor_id IS DISTINCT FROM actor OR job.state IS DISTINCT FROM 'processing' OR job.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'conflict'; END IF;
 IF job.digest<>encode(sha256(convert_to(content_value,'UTF8')),'hex') THEN RAISE EXCEPTION 'conflict'; END IF;
 IF success THEN
   SELECT array_agg(value::real) INTO values_array FROM jsonb_array_elements_text(vector_json);
   IF cardinality(values_array) IS DISTINCT FROM 384 OR EXISTS(SELECT FROM unnest(values_array) v WHERE v IS NULL OR v IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)) THEN RAISE EXCEPTION 'invalid'; END IF;
   SELECT sqrt(sum(v::double precision*v::double precision)) INTO norm FROM unnest(values_array) v;
   IF abs(norm-1)>0.001 THEN RAISE EXCEPTION 'invalid'; END IF;
   INSERT INTO allura.source_vectors(group_id,workspace_id,source_kind,source_id,index_version,model_id,model_revision,dimensions,embedding,digest) VALUES(g,w,k,s,job.index_version,'Xenova/all-MiniLM-L6-v2','751bff37182d3f1213fa05d7196b954e230abad9',384,values_array,job.digest);
   UPDATE allura.index_jobs SET state='succeeded',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version=job.index_version;
   RETURN 'succeeded';
 END IF;
 UPDATE allura.index_jobs SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'retry_wait' END,lease_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+make_interval(secs=>power(2,attempts)::integer),updated_at=clock_timestamp() WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version=job.index_version;
 RETURN CASE WHEN job.attempts>=3 THEN 'failed' ELSE 'retry_wait' END;
END $$;
ALTER TABLE allura.index_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.index_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.source_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.source_vectors FORCE ROW LEVEL SECURITY;
CREATE POLICY index_job_read ON allura.index_jobs FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'proposal:write') AND actor_id::text=current_setting('allura.principal',true));
CREATE POLICY source_vector_read ON allura.source_vectors FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'memory:read') AND (source_kind='semantic' OR allura.additional_action(group_id,workspace_id,'evidence:read')));
REVOKE ALL ON allura.index_jobs,allura.source_vectors FROM PUBLIC,allura_app;
GRANT SELECT ON allura.index_jobs,allura.source_vectors TO allura_app;
REVOKE ALL ON FUNCTION allura.index_source(text,uuid,text,uuid),allura.claim_index(text,uuid,text,uuid),allura.finish_index(text,uuid,text,uuid,uuid,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.claim_index(text,uuid,text,uuid),allura.finish_index(text,uuid,text,uuid,uuid,jsonb,boolean) TO allura_app;
CREATE FUNCTION allura.index_candidates(g text,w uuid,n integer) RETURNS TABLE(kind text,id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 IF n<1 OR n>8 THEN RAISE EXCEPTION 'invalid'; END IF;
 IF NOT allura.context_allows(g,w,'proposal:write') OR NOT allura.additional_action(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN QUERY SELECT candidates.kind,candidates.id FROM (
   SELECT 'semantic'::text AS kind,v.id,v.created_at FROM allura.semantic_versions v WHERE v.group_id=g AND v.workspace_id=w
   UNION ALL
   SELECT 'event'::text,e.id,e.created_at FROM allura.events e JOIN allura.index_intents i ON i.group_id=e.group_id AND i.workspace_id=e.workspace_id AND i.event_id=e.id WHERE e.group_id=g AND e.workspace_id=w AND (e.actor_id::text=current_setting('allura.principal',true) OR allura.additional_action(g,w,'evidence:read'))
 ) candidates LEFT JOIN allura.index_jobs j ON j.group_id=g AND j.workspace_id=w AND j.source_kind=candidates.kind AND j.source_id=candidates.id AND j.index_version='minilm-q8-mean-normalized-v1'
 WHERE j.source_id IS NULL OR j.state='queued' OR (j.state='processing' AND j.lease_until<=clock_timestamp()) OR (j.state='retry_wait' AND j.next_attempt_at<=clock_timestamp())
 ORDER BY candidates.created_at,candidates.kind,candidates.id LIMIT n;
END $$;
REVOKE ALL ON FUNCTION allura.index_candidates(text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.index_candidates(text,uuid,integer) TO allura_app;
