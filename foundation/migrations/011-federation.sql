-- Bounded own-capture or explicitly entitled evidence reads. No new role grants.
CREATE FUNCTION allura.retrieval_literal_priority(content_value text,query_value text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN query_value='' THEN 0 WHEN lower(btrim(content_value,E' \t\n\r\f\u000b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'))=lower(query_value) THEN 2 WHEN strpos(lower(content_value),lower(query_value))>0 THEN 1 ELSE 0 END
$$;
REVOKE ALL ON FUNCTION allura.retrieval_literal_priority(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.retrieval_literal_priority(text,text) TO allura_app;
CREATE FUNCTION allura.retrieval_events(g text,w uuid,q text,n integer)
RETURNS TABLE(id uuid,content text,created_at timestamptz,metadata jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 IF NOT allura.context_allows(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF n IS NULL OR n<1 OR n>257 OR q IS NULL OR octet_length(q)>2000 THEN RAISE EXCEPTION 'invalid'; END IF;
 RETURN QUERY SELECT e.id,e.payload->>'content',e.created_at,
  (CASE WHEN jsonb_typeof(e.payload->'metadata')='object' THEN e.payload->'metadata' ELSE '{}'::jsonb END)||jsonb_build_object('kind','evidence','approval','unapproved','actorId',e.actor_id)
 FROM allura.events e WHERE e.group_id=g AND e.workspace_id=w AND e.kind='capture' AND jsonb_typeof(e.payload->'content')='string'
 AND (e.actor_id::text=current_setting('allura.principal',true) OR allura.additional_action(g,w,'evidence:read'))
 AND (q='' OR strpos(lower(e.payload->>'content'),lower(q))>0 OR to_tsvector('english',e.payload->>'content')@@plainto_tsquery('english',q))
 ORDER BY allura.retrieval_literal_priority(e.payload->>'content',q) DESC,e.created_at DESC,e.id LIMIT n;
END $$;
CREATE FUNCTION allura.retrieval_event_vectors(g text,w uuid,n integer)
RETURNS TABLE(id uuid,content text,created_at timestamptz,metadata jsonb,embedding real[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 IF NOT allura.context_allows(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF n IS NULL OR n<1 OR n>257 THEN RAISE EXCEPTION 'invalid'; END IF;
 RETURN QUERY SELECT e.id,e.payload->>'content',e.created_at,
  (CASE WHEN jsonb_typeof(e.payload->'metadata')='object' THEN e.payload->'metadata' ELSE '{}'::jsonb END)||jsonb_build_object('kind','evidence','approval','unapproved','actorId',e.actor_id),v.embedding
 FROM allura.events e JOIN allura.source_vectors v ON v.group_id=e.group_id AND v.workspace_id=e.workspace_id AND v.source_kind='event' AND v.source_id=e.id
 WHERE e.group_id=g AND e.workspace_id=w AND e.kind='capture' AND jsonb_typeof(e.payload->'content')='string'
 AND v.model_id='Xenova/all-MiniLM-L6-v2' AND v.model_revision='751bff37182d3f1213fa05d7196b954e230abad9' AND v.dimensions=384 AND v.index_version='minilm-q8-mean-normalized-v1'
 AND (e.actor_id::text=current_setting('allura.principal',true) OR allura.additional_action(g,w,'evidence:read')) ORDER BY e.created_at DESC,e.id LIMIT n;
END $$;
CREATE FUNCTION allura.retrieval_visible_events(g text,w uuid,ids jsonb) RETURNS TABLE(id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 IF NOT allura.context_allows(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF ids IS NULL OR jsonb_typeof(ids)<>'array' OR jsonb_array_length(ids)>100 THEN RAISE EXCEPTION 'invalid'; END IF;
 RETURN QUERY SELECT e.id FROM allura.events e WHERE e.group_id=g AND e.workspace_id=w AND e.kind='capture'
 AND e.id IN(SELECT value::uuid FROM jsonb_array_elements_text(ids))
 AND (e.actor_id::text=current_setting('allura.principal',true) OR allura.additional_action(g,w,'evidence:read'));
END $$;
REVOKE ALL ON FUNCTION allura.retrieval_events(text,uuid,text,integer),allura.retrieval_event_vectors(text,uuid,integer),allura.retrieval_visible_events(text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.retrieval_events(text,uuid,text,integer),allura.retrieval_event_vectors(text,uuid,integer),allura.retrieval_visible_events(text,uuid,jsonb) TO allura_app;
