-- Append-only provider opt-in. Old signatures remain MiniLM-only and unchanged.
-- A provider-managed alias is NOT an immutable vendor model snapshot.
ALTER TABLE allura.index_jobs DROP CONSTRAINT index_jobs_index_version_check;
ALTER TABLE allura.index_jobs ADD CONSTRAINT index_jobs_index_version_check CHECK(index_version IN ('minilm-q8-mean-normalized-v1','openai-text-embedding-3-small-384-normalized-v1'));
ALTER TABLE allura.source_vectors DROP CONSTRAINT source_vectors_model_id_check;
ALTER TABLE allura.source_vectors DROP CONSTRAINT source_vectors_model_revision_check;
ALTER TABLE allura.source_vectors ADD CONSTRAINT source_vectors_model_contract_check CHECK(
 (index_version='minilm-q8-mean-normalized-v1' AND model_id='Xenova/all-MiniLM-L6-v2' AND model_revision='751bff37182d3f1213fa05d7196b954e230abad9' AND dimensions=384) OR
 (index_version='openai-text-embedding-3-small-384-normalized-v1' AND model_id='text-embedding-3-small' AND model_revision='provider-managed-alias' AND dimensions=384));
CREATE FUNCTION allura.embedding_contract(iv text) RETURNS TABLE(model_id text,model_revision text,dimensions integer)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF iv='minilm-q8-mean-normalized-v1' THEN RETURN QUERY SELECT 'Xenova/all-MiniLM-L6-v2'::text,'751bff37182d3f1213fa05d7196b954e230abad9'::text,384;
 ELSIF iv='openai-text-embedding-3-small-384-normalized-v1' THEN RETURN QUERY SELECT 'text-embedding-3-small'::text,'provider-managed-alias'::text,384;
 ELSE RAISE EXCEPTION 'invalid'; END IF;
END $$;
REVOKE ALL ON FUNCTION allura.embedding_contract(text) FROM PUBLIC,allura_app;

CREATE FUNCTION allura.claim_index(g text,w uuid,k text,s uuid,iv text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE content_value text:=allura.index_source(g,w,k,s); actor uuid:=current_setting('allura.principal',true)::uuid; job allura.index_jobs; lease uuid:=gen_random_uuid();
BEGIN
 PERFORM * FROM allura.embedding_contract(iv);
 INSERT INTO allura.index_jobs(group_id,workspace_id,source_kind,source_id,index_version,state,attempts,actor_id,digest) VALUES(g,w,k,s,iv,'queued',0,actor,encode(sha256(convert_to(content_value,'UTF8')),'hex')) ON CONFLICT DO NOTHING;
 SELECT * INTO job FROM allura.index_jobs WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version=iv FOR UPDATE;
 IF job.state IN ('succeeded','failed') OR (job.state='processing' AND job.lease_until>clock_timestamp()) OR (job.state='retry_wait' AND job.next_attempt_at>clock_timestamp()) THEN RETURN jsonb_build_object('state',job.state); END IF;
 IF job.attempts>=3 THEN UPDATE allura.index_jobs SET state='failed',updated_at=clock_timestamp() WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version=job.index_version;RETURN jsonb_build_object('state','failed'); END IF;
 UPDATE allura.index_jobs SET state='processing',attempts=attempts+1,actor_id=actor,lease_id=lease,lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version=job.index_version;
 RETURN jsonb_build_object('state','claimed','leaseId',lease,'content',content_value,'digest',job.digest);
END $$;
REVOKE ALL ON FUNCTION allura.claim_index(text,uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.claim_index(text,uuid,text,uuid,text) TO allura_app;
CREATE FUNCTION allura.finish_index(g text,w uuid,k text,s uuid,lease uuid,vector_json jsonb,success boolean,iv text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE content_value text:=allura.index_source(g,w,k,s); actor uuid:=current_setting('allura.principal',true)::uuid; job allura.index_jobs; values_array real[]; norm double precision;
BEGIN
 PERFORM * FROM allura.embedding_contract(iv);
 SELECT * INTO job FROM allura.index_jobs WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version=iv FOR UPDATE;
 IF job.lease_id IS DISTINCT FROM lease OR job.actor_id IS DISTINCT FROM actor OR job.state IS DISTINCT FROM 'processing' OR job.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'conflict'; END IF;
 IF job.digest<>encode(sha256(convert_to(content_value,'UTF8')),'hex') THEN RAISE EXCEPTION 'conflict'; END IF;
 IF success THEN
   SELECT array_agg(value::real) INTO values_array FROM jsonb_array_elements_text(vector_json);
   IF cardinality(values_array) IS DISTINCT FROM 384 OR EXISTS(SELECT FROM unnest(values_array) v WHERE v IS NULL OR v IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)) THEN RAISE EXCEPTION 'invalid'; END IF;
   SELECT sqrt(sum(v::double precision*v::double precision)) INTO norm FROM unnest(values_array) v;
   IF abs(norm-1)>0.001 THEN RAISE EXCEPTION 'invalid'; END IF;
   INSERT INTO allura.source_vectors(group_id,workspace_id,source_kind,source_id,index_version,model_id,model_revision,dimensions,embedding,digest) VALUES(g,w,k,s,job.index_version,(SELECT model_id FROM allura.embedding_contract(iv)),(SELECT model_revision FROM allura.embedding_contract(iv)),384,values_array,job.digest);
   UPDATE allura.index_jobs SET state='succeeded',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version=job.index_version;
   RETURN 'succeeded';
 END IF;
 UPDATE allura.index_jobs SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'retry_wait' END,lease_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+make_interval(secs=>power(2,attempts)::integer),updated_at=clock_timestamp() WHERE group_id=g AND workspace_id=w AND source_kind=k AND source_id=s AND index_version=job.index_version;
 RETURN CASE WHEN job.attempts>=3 THEN 'failed' ELSE 'retry_wait' END;
END $$;
REVOKE ALL ON FUNCTION allura.finish_index(text,uuid,text,uuid,uuid,jsonb,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.finish_index(text,uuid,text,uuid,uuid,jsonb,boolean,text) TO allura_app;
CREATE FUNCTION allura.index_candidates(g text,w uuid,n integer,iv text) RETURNS TABLE(kind text,id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 PERFORM * FROM allura.embedding_contract(iv);
 IF n<1 OR n>8 THEN RAISE EXCEPTION 'invalid'; END IF;
 IF NOT allura.context_allows(g,w,'proposal:write') OR NOT allura.additional_action(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN QUERY SELECT candidates.kind,candidates.id FROM (
   SELECT 'semantic'::text AS kind,v.id,v.created_at FROM allura.semantic_versions v WHERE v.group_id=g AND v.workspace_id=w
   UNION ALL
   SELECT 'event'::text,e.id,e.created_at FROM allura.events e JOIN allura.index_intents i ON i.group_id=e.group_id AND i.workspace_id=e.workspace_id AND i.event_id=e.id WHERE e.group_id=g AND e.workspace_id=w AND (e.actor_id::text=current_setting('allura.principal',true) OR allura.additional_action(g,w,'evidence:read'))
 ) candidates LEFT JOIN allura.index_jobs j ON j.group_id=g AND j.workspace_id=w AND j.source_kind=candidates.kind AND j.source_id=candidates.id AND j.index_version=iv
 WHERE j.source_id IS NULL OR j.state='queued' OR (j.state='processing' AND j.lease_until<=clock_timestamp()) OR (j.state='retry_wait' AND j.next_attempt_at<=clock_timestamp())
 ORDER BY candidates.created_at,candidates.kind,candidates.id LIMIT n;
END $$;
REVOKE ALL ON FUNCTION allura.index_candidates(text,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.index_candidates(text,uuid,integer,text) TO allura_app;
CREATE FUNCTION allura.retrieval_event_vectors(g text,w uuid,n integer,iv text)
RETURNS TABLE(id uuid,content text,created_at timestamptz,metadata jsonb,embedding real[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 PERFORM * FROM allura.embedding_contract(iv);
 IF NOT allura.context_allows(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF n IS NULL OR n<1 OR n>257 THEN RAISE EXCEPTION 'invalid'; END IF;
 RETURN QUERY SELECT e.id,e.payload->>'content',e.created_at,
  (CASE WHEN jsonb_typeof(e.payload->'metadata')='object' THEN e.payload->'metadata' ELSE '{}'::jsonb END)||jsonb_build_object('kind','evidence','approval','unapproved','actorId',e.actor_id),v.embedding
 FROM allura.events e JOIN allura.source_vectors v ON v.group_id=e.group_id AND v.workspace_id=e.workspace_id AND v.source_kind='event' AND v.source_id=e.id
 WHERE e.group_id=g AND e.workspace_id=w AND e.kind='capture' AND jsonb_typeof(e.payload->'content')='string'
 AND v.model_id=(SELECT model_id FROM allura.embedding_contract(iv)) AND v.model_revision=(SELECT model_revision FROM allura.embedding_contract(iv)) AND v.dimensions=384 AND v.index_version=iv
 AND (e.actor_id::text=current_setting('allura.principal',true) OR allura.additional_action(g,w,'evidence:read')) ORDER BY e.created_at DESC,e.id LIMIT n;
END $$;
REVOKE ALL ON FUNCTION allura.retrieval_event_vectors(text,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.retrieval_event_vectors(text,uuid,integer,text) TO allura_app;
CREATE FUNCTION allura.scoped_operational_health(g text,w uuid,iv text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE semantic_count integer;missing_semantic integer;event_count integer;missing_events integer;jobs jsonb;
BEGIN
 PERFORM * FROM allura.embedding_contract(iv);
 IF NOT allura.context_allows(g,w,'health:read') THEN RAISE EXCEPTION 'forbidden';END IF;
 SELECT count(*),count(*) FILTER(WHERE NOT EXISTS(SELECT FROM allura.source_vectors x WHERE x.group_id=g AND x.workspace_id=w AND x.source_kind='semantic' AND x.source_id=v.id AND x.index_version=iv AND x.model_id=(SELECT model_id FROM allura.embedding_contract(iv)) AND x.model_revision=(SELECT model_revision FROM allura.embedding_contract(iv)) AND x.dimensions=384 AND x.digest=encode(sha256(convert_to(v.content,'UTF8')),'hex')))
 INTO semantic_count,missing_semantic FROM allura.semantic_heads h JOIN allura.semantic_versions v ON v.group_id=h.group_id AND v.workspace_id=h.workspace_id AND v.id=h.current_version_id WHERE h.group_id=g AND h.workspace_id=w AND h.lifecycle='current';
 SELECT count(*),count(*) FILTER(WHERE NOT EXISTS(SELECT FROM allura.source_vectors x WHERE x.group_id=g AND x.workspace_id=w AND x.source_kind='event' AND x.source_id=e.id AND x.index_version=iv AND x.model_id=(SELECT model_id FROM allura.embedding_contract(iv)) AND x.model_revision=(SELECT model_revision FROM allura.embedding_contract(iv)) AND x.dimensions=384 AND x.digest=encode(sha256(convert_to(e.payload->>'content','UTF8')),'hex')))
 INTO event_count,missing_events FROM allura.events e WHERE e.group_id=g AND e.workspace_id=w AND e.kind='capture' AND jsonb_typeof(e.payload->'content')='string';
 SELECT coalesce(jsonb_object_agg(state,n),'{}'::jsonb) INTO jobs FROM(SELECT state,count(*) n FROM allura.index_jobs WHERE group_id=g AND workspace_id=w AND index_version=iv GROUP BY state) scoped_jobs;
 RETURN jsonb_build_object('currentSemantic',semantic_count,'missingSemanticVectors',missing_semantic,'capturedEvents',event_count,'missingEventVectors',missing_events,'jobs',jobs);
END $$;
REVOKE ALL ON FUNCTION allura.scoped_operational_health(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.scoped_operational_health(text,uuid,text) TO allura_app;
