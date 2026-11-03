-- Configuration authority only: no scanner credential or ingestion route is minted here.
ALTER TABLE allura.events DROP CONSTRAINT events_kind_check;
ALTER TABLE allura.events ADD CONSTRAINT events_kind_check CHECK(kind IN ('capture','proposal','decision','deletion','projection_transfer','bumblebee_config'));
CREATE TABLE allura.bumblebee_source_heads (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), enabled boolean NOT NULL,
 PRIMARY KEY(group_id,workspace_id,source_id), FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces
);
CREATE TABLE allura.bumblebee_catalog_revisions (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, id uuid NOT NULL, digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 metadata jsonb NOT NULL, actor_id uuid NOT NULL, approved_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL, event_id uuid NOT NULL,
 PRIMARY KEY(group_id,workspace_id,source_id,id), FOREIGN KEY(group_id,workspace_id,source_id) REFERENCES allura.bumblebee_source_heads,
 FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships, FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED,
 CHECK(metadata->>'sourceId'=source_id::text AND metadata->>'revisionId'=id::text AND metadata->>'classification'='internal' AND metadata->>'redaction'='allowlist-v1' AND metadata->>'retention'='append-only' AND metadata->>'verificationRule'='human-reviewed-sha256'),
 CHECK(expires_at>approved_at AND expires_at<=approved_at+interval '7 days')
);
CREATE TABLE allura.bumblebee_catalog_entries (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, catalog_id uuid NOT NULL, entry_id uuid NOT NULL,
 ecosystem text NOT NULL CHECK(ecosystem IN ('npm','pypi')), name text NOT NULL, version text NOT NULL, severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
 PRIMARY KEY(group_id,workspace_id,source_id,catalog_id,entry_id), FOREIGN KEY(group_id,workspace_id,source_id,catalog_id) REFERENCES allura.bumblebee_catalog_revisions
);
CREATE TABLE allura.bumblebee_catalog_state (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, catalog_id uuid NOT NULL, rejected boolean NOT NULL DEFAULT false,
 PRIMARY KEY(group_id,workspace_id,source_id,catalog_id), FOREIGN KEY(group_id,workspace_id,source_id,catalog_id) REFERENCES allura.bumblebee_catalog_revisions
);
CREATE TABLE allura.bumblebee_source_revisions (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), descriptor jsonb NOT NULL,
 owner_id uuid NOT NULL, owner_issuer text NOT NULL, owner_subject text NOT NULL, owner_kind text NOT NULL DEFAULT 'human' CHECK(owner_kind='human'),
 catalog_id uuid, enabled boolean NOT NULL, event_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,source_id,revision), FOREIGN KEY(group_id,workspace_id,source_id) REFERENCES allura.bumblebee_source_heads,
 FOREIGN KEY(group_id,workspace_id,source_id,catalog_id) REFERENCES allura.bumblebee_catalog_revisions(group_id,workspace_id,source_id,id),
 FOREIGN KEY(group_id,owner_id) REFERENCES allura.memberships,
 FOREIGN KEY(owner_issuer,owner_subject,owner_kind,owner_id) REFERENCES allura.identity_bindings(issuer,subject,identity_kind,principal_id),
 FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED,
 CHECK(descriptor->>'sourceId'=source_id::text AND (descriptor->>'catalogRevisionId')::uuid IS NOT DISTINCT FROM catalog_id)
);
ALTER TABLE allura.bumblebee_source_heads ADD FOREIGN KEY(group_id,workspace_id,source_id,revision) REFERENCES allura.bumblebee_source_revisions DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE allura.bumblebee_config_receipts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, actor_id uuid NOT NULL, operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), kind text NOT NULL CHECK(kind IN ('source','catalog','invalidate')), source_id uuid NOT NULL,
 rationale text NOT NULL CHECK(octet_length(rationale) BETWEEN 1 AND 4000), evidence_ids uuid[] NOT NULL CHECK(cardinality(evidence_ids) BETWEEN 1 AND 32), receipt_text text NOT NULL, event_id uuid NOT NULL,
 PRIMARY KEY(group_id,workspace_id,actor_id,operation_key), FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships,
 FOREIGN KEY(group_id,workspace_id,source_id) REFERENCES allura.bumblebee_source_heads,
 FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION allura.bumblebee_config_authority(g text,w uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'workspace:grants:manage') THEN RAISE EXCEPTION 'forbidden'; END IF;
END $$;
CREATE FUNCTION allura.bumblebee_config_replay(g text,w uuid,input jsonb,digest_arg text,kind_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE existing allura.bumblebee_config_receipts; evidence uuid; count_arg integer;
BEGIN
 PERFORM allura.bumblebee_config_authority(g,w);
 IF coalesce(input->>'operationKey','') !~ '^[A-Za-z0-9._:-]{1,128}$' OR coalesce(digest_arg,'') !~ '^[a-f0-9]{64}$' OR octet_length(coalesce(input->>'rationale','')) NOT BETWEEN 1 AND 4000 OR jsonb_typeof(input->'evidenceIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid'; END IF;
 count_arg:=jsonb_array_length(input->'evidenceIds');IF count_arg NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,current_setting('allura.principal'),input->>'operationKey')::text,10102));
 SELECT * INTO existing FROM allura.bumblebee_config_receipts WHERE group_id=g AND workspace_id=w AND actor_id=current_setting('allura.principal')::uuid AND operation_key=input->>'operationKey';
 IF FOUND THEN IF existing.digest<>digest_arg OR existing.kind<>kind_arg THEN RAISE EXCEPTION 'conflict'; END IF;RETURN existing.receipt_text;END IF;
 FOR evidence IN SELECT value::uuid FROM jsonb_array_elements_text(input->'evidenceIds') LOOP
  IF NOT EXISTS(SELECT FROM allura.events WHERE group_id=g AND workspace_id=w AND id=evidence) THEN RAISE EXCEPTION 'not_found';END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE FUNCTION allura.bumblebee_config_receipt(g text,w uuid,input jsonb,digest_arg text,kind_arg text,s uuid,e uuid,result jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid:=current_setting('allura.principal')::uuid; evidence uuid[]; receipt text;
BEGIN
 PERFORM allura.bumblebee_config_authority(g,w);
 SELECT array_agg(value::uuid ORDER BY value) INTO evidence FROM jsonb_array_elements_text(input->'evidenceIds');
 receipt:=(result||jsonb_build_object('version','bumblebee-config-v1','sourceId',s,'eventId',e,'actorId',actor))::text;
 INSERT INTO allura.bumblebee_config_receipts VALUES(g,w,actor,input->>'operationKey',digest_arg,kind_arg,s,input->>'rationale',evidence,receipt,e);
 INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(g,w,e,actor,'bumblebee_config',result||jsonb_build_object('sourceId',s,'configurationKind',kind_arg));
 RETURN receipt;
END $$;
CREATE FUNCTION allura.configure_bumblebee_source(g text,w uuid,input jsonb,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE prior text:=allura.bumblebee_config_replay(g,w,input,digest_arg,'source'); s uuid:=(input->'source'->>'sourceId')::uuid; c uuid:=(input->'source'->>'catalogRevisionId')::uuid;
 h allura.bumblebee_source_heads; next_revision integer; e uuid:=gen_random_uuid(); enabled_arg boolean:=(input->>'enabled')::boolean; expected integer:=(input->>'expectedRevision')::integer;
BEGIN
 IF prior IS NOT NULL THEN RETURN prior;END IF;
 IF s IS NULL OR expected IS NULL OR expected<0 OR enabled_arg IS NULL THEN RAISE EXCEPTION 'invalid';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,s)::text,10103));
 SELECT * INTO h FROM allura.bumblebee_source_heads WHERE group_id=g AND workspace_id=w AND source_id=s FOR UPDATE;
 IF coalesce(h.revision,0)<>expected THEN RAISE EXCEPTION 'conflict';END IF;
 IF c IS NOT NULL THEN
  IF NOT EXISTS(SELECT FROM allura.bumblebee_catalog_revisions WHERE group_id=g AND workspace_id=w AND source_id=s AND id=c) THEN RAISE EXCEPTION 'not_found';END IF;
  IF enabled_arg AND NOT EXISTS(SELECT FROM allura.bumblebee_catalog_revisions r JOIN allura.bumblebee_catalog_state t ON t.group_id=r.group_id AND t.workspace_id=r.workspace_id AND t.source_id=r.source_id AND t.catalog_id=r.id WHERE r.group_id=g AND r.workspace_id=w AND r.source_id=s AND r.id=c AND NOT t.rejected AND r.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'forbidden';END IF;
 END IF;
 next_revision:=expected+1;
 IF h.source_id IS NULL THEN INSERT INTO allura.bumblebee_source_heads VALUES(g,w,s,next_revision,enabled_arg);
 ELSE UPDATE allura.bumblebee_source_heads SET revision=next_revision,enabled=enabled_arg WHERE group_id=g AND workspace_id=w AND source_id=s; END IF;
 INSERT INTO allura.bumblebee_source_revisions(group_id,workspace_id,source_id,revision,descriptor,owner_id,owner_issuer,owner_subject,catalog_id,enabled,event_id) VALUES(g,w,s,next_revision,input->'source',current_setting('allura.principal')::uuid,current_setting('allura.issuer'),current_setting('allura.subject'),c,enabled_arg,e);
 RETURN allura.bumblebee_config_receipt(g,w,input,digest_arg,'source',s,e,jsonb_build_object('revision',next_revision,'enabled',enabled_arg));
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'conflict';
END $$;
CREATE FUNCTION allura.approve_bumblebee_catalog(g text,w uuid,input jsonb,catalog_digest text,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE prior text:=allura.bumblebee_config_replay(g,w,input,digest_arg,'catalog'); c jsonb:=input->'catalog';s uuid:=(c->>'sourceId')::uuid; r uuid:=(c->>'revisionId')::uuid;
 h allura.bumblebee_source_heads;e uuid:=gen_random_uuid();entry jsonb;expires timestamptz:=to_timestamp((c->>'expiresAt')::numeric/1000);
BEGIN
 IF prior IS NOT NULL THEN RETURN prior;END IF;
 IF coalesce(catalog_digest,'') !~ '^[a-f0-9]{64}$' OR r IS NULL OR s IS NULL OR expires IS NULL OR expires<=clock_timestamp() OR expires>clock_timestamp()+interval '7 days' OR (c->>'fetchedAt')::numeric>extract(epoch FROM clock_timestamp())*1000 OR (c->>'publishedAt')::numeric>(c->>'fetchedAt')::numeric OR jsonb_typeof(c->'entries') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'entries') NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'invalid';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,s)::text,10103));
 SELECT * INTO h FROM allura.bumblebee_source_heads WHERE group_id=g AND workspace_id=w AND source_id=s FOR UPDATE;
 IF h.source_id IS NULL THEN RAISE EXCEPTION 'not_found';END IF;IF NOT h.enabled THEN RAISE EXCEPTION 'forbidden';END IF;
 INSERT INTO allura.bumblebee_catalog_revisions VALUES(g,w,s,r,catalog_digest,c,current_setting('allura.principal')::uuid,clock_timestamp(),expires,e);
 FOR entry IN SELECT value FROM jsonb_array_elements(c->'entries') LOOP
  IF EXISTS(SELECT FROM allura.bumblebee_catalog_entries WHERE group_id=g AND workspace_id=w AND source_id=s AND entry_id=(entry->>'id')::uuid AND (ecosystem<>entry->>'ecosystem' OR name<>entry->>'name' OR version<>entry->>'version')) THEN RAISE EXCEPTION 'conflict';END IF;
  INSERT INTO allura.bumblebee_catalog_entries VALUES(g,w,s,r,(entry->>'id')::uuid,entry->>'ecosystem',entry->>'name',entry->>'version',entry->>'severity');
 END LOOP;
 INSERT INTO allura.bumblebee_catalog_state VALUES(g,w,s,r,false);
 RETURN allura.bumblebee_config_receipt(g,w,input,digest_arg,'catalog',s,e,jsonb_build_object('catalogRevisionId',r,'catalogDigest',catalog_digest,'trust','approved'));
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'conflict';
END $$;
CREATE FUNCTION allura.invalidate_bumblebee_catalog(g text,w uuid,input jsonb,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE prior text:=allura.bumblebee_config_replay(g,w,input,digest_arg,'invalidate');s uuid:=(input->>'sourceId')::uuid;r uuid:=(input->>'revisionId')::uuid;e uuid:=gen_random_uuid();
BEGIN
 IF prior IS NOT NULL THEN RETURN prior;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,s)::text,10103));
 PERFORM 1 FROM allura.bumblebee_source_heads WHERE group_id=g AND workspace_id=w AND source_id=s FOR UPDATE;
 UPDATE allura.bumblebee_catalog_state SET rejected=true WHERE group_id=g AND workspace_id=w AND source_id=s AND catalog_id=r;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found';END IF;
 RETURN allura.bumblebee_config_receipt(g,w,input,digest_arg,'invalidate',s,e,jsonb_build_object('catalogRevisionId',r,'trust','rejected'));
END $$;
CREATE FUNCTION allura.read_bumblebee_source(g text,w uuid,s uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE result jsonb;
BEGIN
 IF NOT allura.context_allows(g,w,'evidence:read') THEN RAISE EXCEPTION 'forbidden';END IF;
 SELECT jsonb_build_object('source',r.descriptor,'revision',h.revision,'enabled',h.enabled,'ownerId',r.owner_id,'catalogState',CASE WHEN r.catalog_id IS NULL THEN 'none' WHEN st.rejected THEN 'rejected' WHEN c.expires_at<=clock_timestamp() THEN 'expired' ELSE 'approved' END) INTO result
 FROM allura.bumblebee_source_heads h JOIN allura.bumblebee_source_revisions r ON r.group_id=h.group_id AND r.workspace_id=h.workspace_id AND r.source_id=h.source_id AND r.revision=h.revision
 LEFT JOIN allura.bumblebee_catalog_revisions c ON c.group_id=r.group_id AND c.workspace_id=r.workspace_id AND c.source_id=r.source_id AND c.id=r.catalog_id
 LEFT JOIN allura.bumblebee_catalog_state st ON st.group_id=c.group_id AND st.workspace_id=c.workspace_id AND st.source_id=c.source_id AND st.catalog_id=c.id
 WHERE h.group_id=g AND h.workspace_id=w AND h.source_id=s;
 IF result IS NULL THEN RAISE EXCEPTION 'not_found';END IF;RETURN result;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bumblebee_source_heads','bumblebee_source_revisions','bumblebee_catalog_revisions','bumblebee_catalog_entries','bumblebee_catalog_state','bumblebee_config_receipts'] LOOP
  EXECUTE format('ALTER TABLE allura.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE allura.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON allura.%I FROM PUBLIC,allura_app',t);
  IF t NOT IN ('bumblebee_source_heads','bumblebee_catalog_state') THEN
   EXECUTE format('CREATE TRIGGER bumblebee_immutable BEFORE UPDATE OR DELETE ON allura.%I FOR EACH ROW EXECUTE FUNCTION allura.append_only()',t);
   EXECUTE format('CREATE TRIGGER bumblebee_no_truncate BEFORE TRUNCATE ON allura.%I FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only()',t);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION allura.bumblebee_config_authority(text,uuid),allura.bumblebee_config_replay(text,uuid,jsonb,text,text),allura.bumblebee_config_receipt(text,uuid,jsonb,text,text,uuid,uuid,jsonb),allura.configure_bumblebee_source(text,uuid,jsonb,text),allura.approve_bumblebee_catalog(text,uuid,jsonb,text,text),allura.invalidate_bumblebee_catalog(text,uuid,jsonb,text),allura.read_bumblebee_source(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.configure_bumblebee_source(text,uuid,jsonb,text),allura.approve_bumblebee_catalog(text,uuid,jsonb,text,text),allura.invalidate_bumblebee_catalog(text,uuid,jsonb,text),allura.read_bumblebee_source(text,uuid,uuid) TO allura_app;
