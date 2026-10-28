-- Destinations are installed only by the operator/owner, never a public request.
ALTER TABLE allura.events DROP CONSTRAINT events_kind_check;
ALTER TABLE allura.events ADD CONSTRAINT events_kind_check CHECK(kind IN ('capture','proposal','decision','deletion','projection_transfer'));
CREATE TABLE allura.projection_destinations (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), origin text NOT NULL, page_id uuid NOT NULL, descriptor jsonb NOT NULL,
 PRIMARY KEY(group_id,workspace_id,id,revision), UNIQUE(origin,page_id), FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces,
 CHECK(descriptor->>'id'=id::text AND (descriptor->>'revision')::integer=revision AND descriptor->>'origin'=origin AND descriptor->>'pageId'=page_id::text AND descriptor->>'adapter'='notion-page-v1')
);
CREATE TABLE allura.projection_transfers (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL, actor_id uuid NOT NULL, operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'), semantic_version_id uuid NOT NULL, decision_id uuid NOT NULL, intent_id uuid NOT NULL,
 destination_id uuid NOT NULL, destination_revision integer NOT NULL, head_revision integer NOT NULL CHECK(head_revision>0),
 envelope jsonb NOT NULL, intended_digest text NOT NULL CHECK(intended_digest ~ '^[0-9a-f]{64}$'), rationale text NOT NULL CHECK(octet_length(rationale) BETWEEN 1 AND 4000), evidence_ids uuid[] NOT NULL CHECK(cardinality(evidence_ids) BETWEEN 1 AND 32),
 event_id uuid NOT NULL, receipt_text text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,id), UNIQUE(group_id,workspace_id,actor_id,operation_key), UNIQUE(group_id,workspace_id,destination_id,destination_revision),
 FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships,
 FOREIGN KEY(group_id,workspace_id,semantic_version_id,decision_id) REFERENCES allura.semantic_versions(group_id,workspace_id,id,decision_id),
 FOREIGN KEY(group_id,workspace_id,intent_id) REFERENCES allura.semantic_intents,
 FOREIGN KEY(group_id,workspace_id,destination_id,destination_revision) REFERENCES allura.projection_destinations,
 FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE allura.projection_transfer_state (
 group_id text NOT NULL, workspace_id uuid NOT NULL, transfer_id uuid NOT NULL, active boolean NOT NULL,
 PRIMARY KEY(group_id,workspace_id,transfer_id), FOREIGN KEY(group_id,workspace_id,transfer_id) REFERENCES allura.projection_transfers
);
CREATE TABLE allura.projection_observations (
 group_id text NOT NULL, workspace_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), transfer_id uuid NOT NULL, actor_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','unknown','synced','failed')), reason text NOT NULL CHECK(reason IN ('authorized','write_started','matched','conflict','timeout','unavailable','empty','revoked','rate_limited')),
 fence integer NOT NULL CHECK(fence BETWEEN 0 AND 5), verified_digest text CHECK(verified_digest ~ '^[0-9a-f]{64}$'), observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((status='synced' AND reason='matched' AND verified_digest IS NOT NULL) OR (status<>'synced' AND verified_digest IS NULL)),
 PRIMARY KEY(group_id,workspace_id,id), UNIQUE(group_id,workspace_id,id,transfer_id), FOREIGN KEY(group_id,workspace_id,transfer_id) REFERENCES allura.projection_transfers, FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
CREATE TABLE allura.projection_deliveries (
 group_id text NOT NULL, workspace_id uuid NOT NULL, transfer_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','unknown','synced','failed')), attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 5), fence integer NOT NULL CHECK(fence=attempts),
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(), lease_id uuid, lease_until timestamptz, write_started boolean NOT NULL DEFAULT false, observation_id uuid,
 PRIMARY KEY(group_id,workspace_id,transfer_id), FOREIGN KEY(group_id,workspace_id,transfer_id) REFERENCES allura.projection_transfers,
 FOREIGN KEY(group_id,workspace_id,observation_id,transfer_id) REFERENCES allura.projection_observations(group_id,workspace_id,id,transfer_id), CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
CREATE FUNCTION allura.projection_authority(g text,w uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'workspace:grants:manage') OR NOT allura.additional_action(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
END $$;
CREATE FUNCTION allura.projection_source(g text,w uuid,s uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE v allura.semantic_versions; h allura.semantic_heads; i allura.semantic_intents;
BEGIN
 PERFORM allura.projection_authority(g,w);
 SELECT * INTO v FROM allura.semantic_versions WHERE group_id=g AND workspace_id=w AND id=s;
 IF v.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT * INTO h FROM allura.semantic_heads WHERE group_id=g AND workspace_id=w AND knowledge_id=v.knowledge_id FOR SHARE;
 IF h.lifecycle IS DISTINCT FROM 'current' OR h.current_version_id IS DISTINCT FROM s THEN RAISE EXCEPTION 'conflict'; END IF;
 SELECT * INTO i FROM allura.semantic_intents WHERE group_id=g AND workspace_id=w AND semantic_version_id=s AND decision_id=v.decision_id AND kind='canonical_memory_promoted';
 IF i.id IS NULL OR NOT EXISTS(SELECT FROM allura.decision_receipts WHERE group_id=g AND workspace_id=w AND id=v.decision_id AND decision='approve' AND semantic_version_id=s) THEN RAISE EXCEPTION 'not_found'; END IF;
 RETURN jsonb_build_object('semanticVersionId',v.id,'decisionId',v.decision_id,'version',v.version,'content',v.content,'headRevision',h.revision,'intentId',i.id);
END $$;
CREATE FUNCTION allura.prepare_projection(g text,w uuid,s uuid,d uuid,r integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE source jsonb:=allura.projection_source(g,w,s); dest jsonb;
BEGIN
 SELECT descriptor INTO dest FROM allura.projection_destinations WHERE group_id=g AND workspace_id=w AND id=d AND revision=r;
 IF dest IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 RETURN jsonb_build_object('source',source,'destination',dest,'actor',current_setting('allura.principal'));
END $$;
CREATE FUNCTION allura.authorize_projection(g text,w uuid,input jsonb,env jsonb,digest_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid:=current_setting('allura.principal',true)::uuid; existing allura.projection_transfers; prepared jsonb; source jsonb; dest jsonb; evidence uuid[]; eid uuid;
 transfer uuid:=gen_random_uuid(); event uuid:=gen_random_uuid(); observation uuid:=gen_random_uuid(); receipt text;
BEGIN
 PERFORM allura.projection_authority(g,w);
 IF digest_arg IS NULL OR digest_arg !~ '^[0-9a-f]{64}$' OR input->>'operationKey' IS NULL OR input->>'operationKey' !~ '^[A-Za-z0-9._:-]{1,128}$' OR octet_length(coalesce(input->>'rationale','')) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,actor,'projection',input->>'operationKey')::text,71002));
 SELECT * INTO existing FROM allura.projection_transfers WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=input->>'operationKey';
 IF existing.id IS NOT NULL THEN IF existing.request_digest<>digest_arg THEN RAISE EXCEPTION 'conflict'; END IF; RETURN existing.receipt_text; END IF;
 prepared:=allura.prepare_projection(g,w,(input->>'semanticVersionId')::uuid,(input->>'destinationId')::uuid,(input->>'destinationRevision')::integer);source:=prepared->'source';dest:=prepared->'destination';
 IF env->'destination' IS DISTINCT FROM dest OR env->>'content' IS DISTINCT FROM source->>'content' OR env->>'semanticVersionId' IS DISTINCT FROM source->>'semanticVersionId' OR env->>'decisionId' IS DISTINCT FROM source->>'decisionId' OR env->>'version' IS DISTINCT FROM source->>'version' OR coalesce(env->>'digest','') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid'; END IF;
 SELECT array_agg(value::uuid ORDER BY value) INTO evidence FROM jsonb_array_elements_text(input->'evidenceIds');
 IF coalesce(cardinality(evidence),0) NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'invalid'; END IF;
 FOREACH eid IN ARRAY evidence LOOP
  IF NOT EXISTS(SELECT FROM allura.semantic_provenance p JOIN allura.decision_receipts d ON d.group_id=p.group_id AND d.workspace_id=p.workspace_id AND d.semantic_version_id=p.semantic_version_id WHERE p.group_id=g AND p.workspace_id=w AND p.semantic_version_id=(source->>'semanticVersionId')::uuid AND p.event_id=eid AND d.receipt_text::jsonb->'evidence_ids' @> to_jsonb(ARRAY[eid])) THEN RAISE EXCEPTION 'not_found'; END IF;
 END LOOP;
 receipt:=jsonb_build_object('version','projection-transfer-v1','transferId',transfer,'sourceVersionId',source->>'semanticVersionId','decisionId',source->>'decisionId','destinationId',dest->>'id','destinationRevision',dest->'revision','intendedDigest',env->>'digest','delivery','queued','eventId',event)::text;
 INSERT INTO allura.projection_transfers(group_id,workspace_id,id,actor_id,operation_key,request_digest,semantic_version_id,decision_id,intent_id,destination_id,destination_revision,head_revision,envelope,intended_digest,rationale,evidence_ids,event_id,receipt_text)
 VALUES(g,w,transfer,actor,input->>'operationKey',digest_arg,(source->>'semanticVersionId')::uuid,(source->>'decisionId')::uuid,(source->>'intentId')::uuid,(dest->>'id')::uuid,(dest->>'revision')::integer,(source->>'headRevision')::integer,env,env->>'digest',input->>'rationale',evidence,event,receipt);
 INSERT INTO allura.projection_transfer_state VALUES(g,w,transfer,true);
 INSERT INTO allura.projection_observations(group_id,workspace_id,id,transfer_id,actor_id,status,reason,fence) VALUES(g,w,observation,transfer,actor,'queued','authorized',0);
 INSERT INTO allura.projection_deliveries(group_id,workspace_id,transfer_id,status,attempts,fence,observation_id) VALUES(g,w,transfer,'queued',0,0,observation);
 INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(g,w,event,actor,'projection_transfer',jsonb_build_object('transferId',transfer,'sourceVersionId',source->>'semanticVersionId','destinationId',dest->>'id','intendedDigest',env->>'digest'));
 RETURN receipt;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'conflict';
END $$;
CREATE FUNCTION allura.projection_guard(g text,w uuid,t uuid) RETURNS allura.projection_transfers LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE transfer allura.projection_transfers; active_arg boolean; source jsonb;
BEGIN
 PERFORM allura.projection_authority(g,w);
 SELECT * INTO transfer FROM allura.projection_transfers WHERE group_id=g AND workspace_id=w AND id=t;
 IF transfer.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF transfer.actor_id::text IS DISTINCT FROM current_setting('allura.principal',true) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT active INTO active_arg FROM allura.projection_transfer_state WHERE group_id=g AND workspace_id=w AND transfer_id=t FOR SHARE;
 IF active_arg IS DISTINCT FROM true THEN RAISE EXCEPTION 'forbidden'; END IF;
 source:=allura.projection_source(g,w,transfer.semantic_version_id);
 IF (source->>'headRevision')::integer<>transfer.head_revision THEN RAISE EXCEPTION 'conflict'; END IF;
 RETURN transfer;
END $$;
CREATE FUNCTION allura.claim_projection(g text,w uuid,t uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE transfer allura.projection_transfers:=allura.projection_guard(g,w,t); d allura.projection_deliveries; lease uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO d FROM allura.projection_deliveries WHERE group_id=g AND workspace_id=w AND transfer_id=t FOR UPDATE;
 IF d.status IN ('synced','failed') OR d.attempts>=5 OR d.available_at>clock_timestamp() OR d.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('state','idle'); END IF;
 UPDATE allura.projection_deliveries SET attempts=attempts+1,fence=fence+1,lease_id=lease,lease_until=clock_timestamp()+interval '30 seconds' WHERE group_id=g AND workspace_id=w AND transfer_id=t;
 RETURN jsonb_build_object('state','claimed','leaseId',lease,'fence',d.fence+1,'mode',CASE WHEN d.write_started OR d.status='unknown' THEN 'reconcile' ELSE 'read_then_write' END,'envelope',transfer.envelope);
END $$;
CREATE FUNCTION allura.projection_work(g text,w uuid,t uuid,lease uuid,f integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE transfer allura.projection_transfers:=allura.projection_guard(g,w,t); d allura.projection_deliveries;
BEGIN
 SELECT * INTO d FROM allura.projection_deliveries WHERE group_id=g AND workspace_id=w AND transfer_id=t FOR UPDATE;
 IF d.lease_id IS DISTINCT FROM lease OR d.fence IS DISTINCT FROM f OR d.lease_until<=clock_timestamp() OR d.status IN ('synced','failed') THEN RAISE EXCEPTION 'conflict'; END IF;
 RETURN transfer.envelope;
END $$;
CREATE FUNCTION allura.mark_projection_write(g text,w uuid,t uuid,lease uuid,f integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE env jsonb:=allura.projection_work(g,w,t,lease,f); d allura.projection_deliveries; observation uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO d FROM allura.projection_deliveries WHERE group_id=g AND workspace_id=w AND transfer_id=t;
 IF d.write_started OR d.status<>'queued' THEN RAISE EXCEPTION 'conflict'; END IF;
 INSERT INTO allura.projection_observations(group_id,workspace_id,id,transfer_id,actor_id,status,reason,fence) VALUES(g,w,observation,t,current_setting('allura.principal')::uuid,'unknown','write_started',f);
 UPDATE allura.projection_deliveries SET write_started=true,status='unknown',observation_id=observation WHERE group_id=g AND workspace_id=w AND transfer_id=t;
END $$;
CREATE FUNCTION allura.finish_projection(g text,w uuid,t uuid,lease uuid,f integer,outcome text,reason_arg text,retry_ms integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE env jsonb:=allura.projection_work(g,w,t,lease,f); observation uuid:=gen_random_uuid();
BEGIN
 IF outcome IS NULL OR reason_arg IS NULL OR NOT ((outcome='synced' AND reason_arg='matched') OR (outcome='failed' AND reason_arg='conflict') OR (outcome='unknown' AND reason_arg IN ('timeout','unavailable','empty','rate_limited'))) OR retry_ms IS NULL OR retry_ms NOT BETWEEN 0 AND 86400000 THEN RAISE EXCEPTION 'invalid'; END IF;
 INSERT INTO allura.projection_observations(group_id,workspace_id,id,transfer_id,actor_id,status,reason,fence,verified_digest) VALUES(g,w,observation,t,current_setting('allura.principal')::uuid,outcome,reason_arg,f,CASE WHEN outcome='synced' THEN env->>'digest' END);
 UPDATE allura.projection_deliveries SET status=outcome,lease_id=NULL,lease_until=NULL,observation_id=observation,available_at=clock_timestamp()+make_interval(secs=>greatest(5*power(2,f-1),retry_ms/1000.0)) WHERE group_id=g AND workspace_id=w AND transfer_id=t;
END $$;
CREATE FUNCTION allura.revoke_projection(g text,w uuid,t uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE active_arg boolean; d allura.projection_deliveries;
BEGIN
 PERFORM allura.projection_authority(g,w);
 SELECT active INTO active_arg FROM allura.projection_transfer_state WHERE group_id=g AND workspace_id=w AND transfer_id=t FOR UPDATE;
 IF active_arg IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF NOT active_arg THEN RETURN; END IF;
 SELECT * INTO d FROM allura.projection_deliveries WHERE group_id=g AND workspace_id=w AND transfer_id=t FOR UPDATE;
 UPDATE allura.projection_transfer_state SET active=false WHERE group_id=g AND workspace_id=w AND transfer_id=t;
 INSERT INTO allura.projection_observations(group_id,workspace_id,transfer_id,actor_id,status,reason,fence) VALUES(g,w,t,current_setting('allura.principal')::uuid,'unknown','revoked',d.fence);
END $$;
CREATE FUNCTION allura.projection_status(g text,w uuid,t uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('allura.kind',true) IS DISTINCT FROM 'human' OR NOT allura.context_allows(g,w,'audit:read') OR NOT allura.additional_action(g,w,'memory:read') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT jsonb_build_object('transferId',p.id,'sourceVersionId',p.semantic_version_id,'decisionId',p.decision_id,'destinationId',p.destination_id,'destinationRevision',p.destination_revision,'pageId',x.page_id,'intendedDigest',p.intended_digest,'status',d.status,'attempts',d.attempts,'exhausted',d.attempts>=5 AND d.status='unknown','availableAt',d.available_at,'observationId',o.id,'observedAt',o.observed_at,'observer',o.actor_id,'reason',o.reason,'verifiedDigest',o.verified_digest,'active',s.active,'sourceCurrent',h.current_version_id=p.semantic_version_id AND h.lifecycle='current' AND h.revision=p.head_revision) INTO result
 FROM allura.projection_transfers p JOIN allura.projection_deliveries d ON d.group_id=p.group_id AND d.workspace_id=p.workspace_id AND d.transfer_id=p.id
 JOIN allura.projection_transfer_state s ON s.group_id=p.group_id AND s.workspace_id=p.workspace_id AND s.transfer_id=p.id
 JOIN allura.projection_observations o ON o.group_id=p.group_id AND o.workspace_id=p.workspace_id AND o.id=d.observation_id
 JOIN allura.projection_destinations x ON x.group_id=p.group_id AND x.workspace_id=p.workspace_id AND x.id=p.destination_id AND x.revision=p.destination_revision
 JOIN allura.semantic_versions v ON v.group_id=p.group_id AND v.workspace_id=p.workspace_id AND v.id=p.semantic_version_id
 JOIN allura.semantic_heads h ON h.group_id=v.group_id AND h.workspace_id=v.workspace_id AND h.knowledge_id=v.knowledge_id
 WHERE p.group_id=g AND p.workspace_id=w AND p.id=t;
 IF result IS NULL THEN RAISE EXCEPTION 'not_found'; END IF; RETURN result;
END $$;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['projection_destinations','projection_transfers','projection_transfer_state','projection_observations','projection_deliveries'] LOOP
  EXECUTE format('ALTER TABLE allura.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE allura.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON allura.%I FROM PUBLIC,allura_app',table_name);
  -- Envelope/rationale/descriptor are accessible only through bounded private functions.
  IF table_name IN ('projection_deliveries','projection_observations') THEN
   EXECUTE format('CREATE POLICY projection_read ON allura.%I FOR SELECT TO allura_app USING (allura.context_allows(group_id,workspace_id,''audit:read'') AND current_setting(''allura.kind'',true)=''human'')',table_name);
   EXECUTE format('GRANT SELECT ON allura.%I TO allura_app',table_name);
  END IF;
  IF table_name IN ('projection_destinations','projection_transfers','projection_observations') THEN
   EXECUTE format('CREATE TRIGGER projection_immutable BEFORE UPDATE OR DELETE ON allura.%I FOR EACH ROW EXECUTE FUNCTION allura.append_only()',table_name);
   EXECUTE format('CREATE TRIGGER projection_no_truncate BEFORE TRUNCATE ON allura.%I FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only()',table_name);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION allura.projection_authority(text,uuid),allura.projection_source(text,uuid,uuid),allura.projection_guard(text,uuid,uuid),allura.prepare_projection(text,uuid,uuid,uuid,integer),allura.authorize_projection(text,uuid,jsonb,jsonb,text),allura.claim_projection(text,uuid,uuid),allura.projection_work(text,uuid,uuid,uuid,integer),allura.mark_projection_write(text,uuid,uuid,uuid,integer),allura.finish_projection(text,uuid,uuid,uuid,integer,text,text,integer),allura.revoke_projection(text,uuid,uuid),allura.projection_status(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.prepare_projection(text,uuid,uuid,uuid,integer),allura.authorize_projection(text,uuid,jsonb,jsonb,text),allura.claim_projection(text,uuid,uuid),allura.projection_work(text,uuid,uuid,uuid,integer),allura.mark_projection_write(text,uuid,uuid,uuid,integer),allura.finish_projection(text,uuid,uuid,uuid,integer,text,text,integer),allura.revoke_projection(text,uuid,uuid),allura.projection_status(text,uuid,uuid) TO allura_app;
