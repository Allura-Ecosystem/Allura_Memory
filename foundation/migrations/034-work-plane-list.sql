-- Additive read-only helpers. No table/data/history or run-definition changes.
CREATE FUNCTION allura.work_project_map(g text,w uuid,pid text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE a text; p allura.work_projects;
BEGIN
 PERFORM allura.work_guard(g,w,false);
 IF NOT allura.work_text(pid,1,256) THEN RAISE EXCEPTION 'invalid'; END IF;
 SELECT id INTO a FROM allura.work_authority WHERE singleton FOR SHARE;
 SELECT * INTO p FROM allura.work_projects WHERE group_id=g AND workspace_id=w AND id=pid FOR SHARE;
 IF a IS NULL OR p.id IS NULL OR NOT p.active OR p.authority_instance_id<>a THEN RAISE EXCEPTION 'not_found'; END IF;
 RETURN a;
END $$;
CREATE FUNCTION allura.list_work_items(g text,w uuid,pid text,filter_status text,page_limit integer,last_created text,last_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE result jsonb; boundary timestamptz;
BEGIN
 PERFORM allura.work_guard(g,w,false);
 PERFORM allura.work_project_map(g,w,pid);
 IF page_limit IS NULL OR page_limit<1 OR page_limit>100 OR (filter_status IS NOT NULL AND filter_status NOT IN ('backlog','ready','in_progress','in_review','blocked','done','cancelled')) OR (last_created IS NULL)<>(last_id IS NULL) THEN RAISE EXCEPTION 'invalid'; END IF;
 IF last_created IS NOT NULL THEN
  BEGIN
   boundary:=last_created::timestamptz;
   IF NOT allura.work_text(last_id,1,256) OR boundary<'0001-01-01T00:00:00Z' OR boundary>='10000-01-01T00:00:00Z' OR allura.work_token(boundary)<>last_created THEN RAISE EXCEPTION 'invalid'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid'; END;
 END IF;
 SELECT coalesce(jsonb_agg(allura.work_snapshot(x::allura.work_items) ORDER BY x.created_at DESC,x.id COLLATE "C" DESC),'[]'::jsonb) INTO result
 FROM (SELECT i.* FROM allura.work_items i WHERE i.group_id=g AND i.workspace_id=w AND i.project_id=pid
  AND (filter_status IS NULL OR i.status=filter_status)
  AND (boundary IS NULL OR i.created_at<boundary OR (i.created_at=boundary AND i.id COLLATE "C"<last_id COLLATE "C"))
  ORDER BY i.created_at DESC,i.id COLLATE "C" DESC LIMIT page_limit+1 FOR SHARE) x;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION allura.work_project_map(text,uuid,text),allura.list_work_items(text,uuid,text,text,integer,text,text) FROM PUBLIC,allura_app;
GRANT EXECUTE ON FUNCTION allura.work_project_map(text,uuid,text),allura.list_work_items(text,uuid,text,text,integer,text,text) TO allura_app;
