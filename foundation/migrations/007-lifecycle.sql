CREATE TABLE allura.lifecycle_receipts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, actor_id uuid NOT NULL,
 operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'), digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 memory_id uuid NOT NULL, event_id uuid NOT NULL, receipt_text text NOT NULL CHECK(octet_length(receipt_text)<=8192),
 PRIMARY KEY(group_id,workspace_id,id), UNIQUE(group_id,workspace_id,actor_id,operation_key),
 FOREIGN KEY(group_id,workspace_id,memory_id) REFERENCES allura.semantic_versions, FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events,
 FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
CREATE TABLE allura.semantic_equivalences (
 group_id text NOT NULL, workspace_id uuid NOT NULL, memory_id uuid NOT NULL, canonical_id uuid NOT NULL, relation text NOT NULL CHECK(relation='exact_text'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(group_id,workspace_id,memory_id), CHECK(memory_id<>canonical_id),
 FOREIGN KEY(group_id,workspace_id,memory_id) REFERENCES allura.semantic_versions, FOREIGN KEY(group_id,workspace_id,canonical_id) REFERENCES allura.semantic_versions
);
CREATE FUNCTION allura.lock_root_content() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 IF NEW.version=1 THEN PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(NEW.group_id,NEW.workspace_id,NEW.content)::text,44001)); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER semantic_root_content BEFORE INSERT ON allura.semantic_versions FOR EACH ROW EXECUTE FUNCTION allura.lock_root_content();
CREATE FUNCTION allura.link_root_content() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE source allura.semantic_versions; canonical uuid;
BEGIN
 SELECT * INTO source FROM allura.semantic_versions WHERE group_id=NEW.group_id AND workspace_id=NEW.workspace_id AND id=NEW.current_version_id;
 SELECT v.id INTO canonical FROM allura.semantic_versions v JOIN allura.semantic_heads h ON h.group_id=v.group_id AND h.workspace_id=v.workspace_id AND h.current_version_id=v.id
 WHERE v.group_id=NEW.group_id AND v.workspace_id=NEW.workspace_id AND v.knowledge_id<>NEW.knowledge_id AND v.content=source.content AND h.lifecycle='current' ORDER BY v.created_at,v.id LIMIT 1;
 IF canonical IS NOT NULL THEN INSERT INTO allura.semantic_equivalences(group_id,workspace_id,memory_id,canonical_id,relation) VALUES(NEW.group_id,NEW.workspace_id,source.id,canonical,'exact_text'); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER semantic_root_equivalence AFTER INSERT ON allura.semantic_heads FOR EACH ROW EXECUTE FUNCTION allura.link_root_content();
CREATE FUNCTION allura.delete_memory(g text,w uuid,input jsonb,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid:=current_setting('allura.principal',true)::uuid; existing allura.lifecycle_receipts; memory allura.semantic_versions; head allura.semantic_heads;
 event_new uuid:=gen_random_uuid(); receipt_new uuid:=gen_random_uuid(); result text;
BEGIN
 IF NOT allura.context_allows(g,w,'memory:delete') THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,actor,'delete',input->>'operationKey')::text,44002));
 SELECT * INTO existing FROM allura.lifecycle_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=input->>'operationKey';
 IF existing.id IS NOT NULL THEN IF existing.digest<>digest_arg THEN RAISE EXCEPTION 'conflict'; END IF; RETURN existing.receipt_text; END IF;
 SELECT * INTO memory FROM allura.semantic_versions WHERE group_id=g AND workspace_id=w AND id=(input->>'memoryId')::uuid;
 IF memory.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT * INTO head FROM allura.semantic_heads WHERE group_id=g AND workspace_id=w AND knowledge_id=memory.knowledge_id FOR UPDATE;
 IF head.current_version_id IS DISTINCT FROM memory.id OR head.revision IS DISTINCT FROM (input->>'expectedHeadRevision')::integer OR head.lifecycle<>'current' THEN RAISE EXCEPTION 'conflict'; END IF;
 INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(g,w,event_new,actor,'deletion',jsonb_build_object('memoryId',memory.id,'knowledgeId',memory.knowledge_id,'reason',input->>'reason','previousHeadRevision',head.revision));
 UPDATE allura.semantic_heads SET lifecycle='deprecated',revision=revision+1 WHERE group_id=g AND workspace_id=w AND knowledge_id=memory.knowledge_id;
 result:=jsonb_build_object('version','lifecycle-v1','receipt_id',receipt_new,'group_id',g,'workspace_id',w,'actor_id',actor,'memory_id',memory.id,'knowledge_id',memory.knowledge_id,'event_id',event_new,'head_revision',head.revision+1,'outcome','deprecated','accepted_at',clock_timestamp())::text;
 INSERT INTO allura.lifecycle_receipts(group_id,workspace_id,id,actor_id,operation_key,digest,memory_id,event_id,receipt_text) VALUES(g,w,receipt_new,actor,input->>'operationKey',digest_arg,memory.id,event_new,result);
 RETURN result;
END $$;
ALTER TABLE allura.lifecycle_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.lifecycle_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_equivalences ENABLE ROW LEVEL SECURITY;
ALTER TABLE allura.semantic_equivalences FORCE ROW LEVEL SECURITY;
CREATE POLICY lifecycle_receipt_read ON allura.lifecycle_receipts FOR SELECT TO allura_app USING((actor_id::text=current_setting('allura.principal',true) AND allura.context_allows(group_id,workspace_id,'memory:delete')) OR allura.context_allows(group_id,workspace_id,'audit:read'));
CREATE POLICY equivalence_read ON allura.semantic_equivalences FOR SELECT TO allura_app USING(allura.context_allows(group_id,workspace_id,'memory:read'));
CREATE TRIGGER lifecycle_receipt_immutable BEFORE UPDATE OR DELETE ON allura.lifecycle_receipts FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER lifecycle_receipt_no_truncate BEFORE TRUNCATE ON allura.lifecycle_receipts FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER equivalence_immutable BEFORE UPDATE OR DELETE ON allura.semantic_equivalences FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER equivalence_no_truncate BEFORE TRUNCATE ON allura.semantic_equivalences FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.lifecycle_receipts,allura.semantic_equivalences FROM PUBLIC,allura_app;
GRANT SELECT ON allura.lifecycle_receipts,allura.semantic_equivalences TO allura_app;
REVOKE ALL ON FUNCTION allura.lock_root_content(),allura.link_root_content(),allura.delete_memory(text,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.delete_memory(text,uuid,jsonb,text) TO allura_app;
