-- Sanitized scanner evidence only. No semantic/proposal tables are mutated here.
ALTER TABLE allura.events DROP CONSTRAINT events_kind_check;
ALTER TABLE allura.events ADD CONSTRAINT events_kind_check CHECK(kind IN ('capture','proposal','decision','deletion','projection_transfer','bumblebee_config','bumblebee_scan'));
ALTER TABLE allura.bumblebee_leases ADD CONSTRAINT bumblebee_lease_population_generation UNIQUE(group_id,workspace_id,source_id,id,population_digest,generation);
CREATE TABLE allura.bumblebee_batches (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, lease_id uuid NOT NULL,
 population_digest text NOT NULL CHECK(population_digest ~ '^[a-f0-9]{64}$'), generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
 wire_digest text NOT NULL CHECK(wire_digest ~ '^[a-f0-9]{64}$'), run_digest text NOT NULL CHECK(run_digest ~ '^[a-f0-9]{64}$'), summary_digest text NOT NULL CHECK(summary_digest ~ '^[a-f0-9]{64}$'),
 key_revision text NOT NULL CHECK(key_revision ~ '^[A-Za-z0-9._:-]{1,128}$'), redaction text NOT NULL CHECK(redaction='allowlist-v1'), summary jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(), event_id uuid NOT NULL,
 PRIMARY KEY(group_id,workspace_id,source_id,lease_id), FOREIGN KEY(group_id,workspace_id,source_id,lease_id) REFERENCES allura.bumblebee_leases(group_id,workspace_id,source_id,id),
 FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED,
 UNIQUE(group_id,workspace_id,source_id,population_digest,lease_id,generation),
 FOREIGN KEY(group_id,workspace_id,source_id,lease_id,population_digest,generation) REFERENCES allura.bumblebee_leases(group_id,workspace_id,source_id,id,population_digest,generation)
);
CREATE TABLE allura.bumblebee_records (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, lease_id uuid NOT NULL, id text NOT NULL CHECK(id ~ '^[a-f0-9]{64}$'),
 ecosystem text NOT NULL CHECK(ecosystem IN ('npm','pypi')), name text NOT NULL CHECK(octet_length(name) BETWEEN 1 AND 214), version text NOT NULL CHECK(octet_length(version)<=128),
 confidence text NOT NULL CHECK(confidence IN ('low','medium','high')), source_file_digest text NOT NULL CHECK(source_file_digest ~ '^[a-f0-9]{64}$'),
 project_path_digest text CHECK(project_path_digest ~ '^[a-f0-9]{64}$'), root_digest text NOT NULL CHECK(root_digest ~ '^[a-f0-9]{64}$'), endpoint_digest text NOT NULL CHECK(endpoint_digest ~ '^[a-f0-9]{64}$'), has_lifecycle_scripts boolean NOT NULL,
 PRIMARY KEY(group_id,workspace_id,source_id,lease_id,id), FOREIGN KEY(group_id,workspace_id,source_id,lease_id) REFERENCES allura.bumblebee_batches
);
CREATE TABLE allura.bumblebee_run_decisions (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, lease_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('complete','partial','late')), replaced_current boolean NOT NULL,
 clock_skew boolean NOT NULL, finding_ids jsonb NOT NULL, receipt_text text NOT NULL,
 PRIMARY KEY(group_id,workspace_id,source_id,lease_id), FOREIGN KEY(group_id,workspace_id,source_id,lease_id) REFERENCES allura.bumblebee_batches,
 CHECK(replaced_current=(state='complete'))
);
CREATE TABLE allura.bumblebee_inventory_heads (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, population_digest text NOT NULL, lease_id uuid NOT NULL, generation bigint NOT NULL,
 PRIMARY KEY(group_id,workspace_id,source_id,population_digest), FOREIGN KEY(group_id,workspace_id,source_id,population_digest,lease_id,generation) REFERENCES allura.bumblebee_batches(group_id,workspace_id,source_id,population_digest,lease_id,generation)
);
CREATE TABLE allura.bumblebee_alerts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, population_digest text NOT NULL CHECK(population_digest ~ '^[a-f0-9]{64}$'), alert_key text NOT NULL CHECK(alert_key ~ '^[a-f0-9]{64}$'),
 catalog_id uuid NOT NULL, entry_id uuid NOT NULL, ecosystem text NOT NULL CHECK(ecosystem IN ('npm','pypi')), name text NOT NULL, version text NOT NULL,
 PRIMARY KEY(group_id,workspace_id,source_id,population_digest,alert_key), FOREIGN KEY(group_id,workspace_id,source_id,catalog_id,entry_id) REFERENCES allura.bumblebee_catalog_entries
);
CREATE TABLE allura.bumblebee_alert_observations (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, population_digest text NOT NULL, alert_key text NOT NULL, lease_id uuid NOT NULL,
 catalog_id uuid NOT NULL, entry_id uuid NOT NULL, severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')), package_ids jsonb NOT NULL,
 PRIMARY KEY(group_id,workspace_id,source_id,population_digest,alert_key,lease_id), FOREIGN KEY(group_id,workspace_id,source_id,population_digest,alert_key) REFERENCES allura.bumblebee_alerts,
 FOREIGN KEY(group_id,workspace_id,source_id,lease_id) REFERENCES allura.bumblebee_batches,
 FOREIGN KEY(group_id,workspace_id,source_id,catalog_id,entry_id) REFERENCES allura.bumblebee_catalog_entries
);
CREATE TABLE allura.bumblebee_simulations (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, population_digest text NOT NULL, alert_key text NOT NULL,
 mode text NOT NULL DEFAULT 'simulation' CHECK(mode='simulation'), text text NOT NULL DEFAULT 'Review this verified package exposure with an authorized human. No action has been executed.' CHECK(text='Review this verified package exposure with an authorized human. No action has been executed.'),
 PRIMARY KEY(group_id,workspace_id,source_id,population_digest,alert_key), FOREIGN KEY(group_id,workspace_id,source_id,population_digest,alert_key) REFERENCES allura.bumblebee_alerts
);
CREATE FUNCTION allura.bumblebee_ingest_context(digest_arg text,redaction_revision text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE l allura.bumblebee_leases;r allura.bumblebee_runners;live jsonb;revoked_arg boolean;c allura.bumblebee_catalog_revisions;b allura.bumblebee_batches;h allura.bumblebee_inventory_heads;prior text;scope_arg jsonb;catalog_arg jsonb:=NULL;last_received timestamptz;
BEGIN
 SELECT * INTO l FROM allura.bumblebee_leases WHERE ingest_digest=digest_arg;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden';END IF;
 SELECT * INTO r FROM allura.bumblebee_runners WHERE group_id=l.group_id AND workspace_id=l.workspace_id AND source_id=l.source_id AND id=l.credential_id;
 live:=allura.bumblebee_runner_context(r.digest);
 SELECT revoked INTO revoked_arg FROM allura.bumblebee_lease_state WHERE group_id=l.group_id AND workspace_id=l.workspace_id AND source_id=l.source_id AND lease_id=l.id FOR UPDATE;
 IF revoked_arg IS DISTINCT FROM false OR l.expires_at<=clock_timestamp() OR l.source_revision IS DISTINCT FROM (live->>'sourceRevision')::integer OR l.catalog_digest IS DISTINCT FROM live->>'catalogDigest' THEN RAISE EXCEPTION 'forbidden';END IF;
 SELECT * INTO b FROM allura.bumblebee_batches WHERE group_id=l.group_id AND workspace_id=l.workspace_id AND source_id=l.source_id AND lease_id=l.id;
 IF FOUND AND b.key_revision<>redaction_revision THEN RAISE EXCEPTION 'unknown';END IF;
 SELECT receipt_text INTO prior FROM allura.bumblebee_run_decisions WHERE group_id=l.group_id AND workspace_id=l.workspace_id AND source_id=l.source_id AND lease_id=l.id;
 SELECT * INTO h FROM allura.bumblebee_inventory_heads WHERE group_id=l.group_id AND workspace_id=l.workspace_id AND source_id=l.source_id AND population_digest=l.population_digest FOR UPDATE;
 SELECT received_at INTO last_received FROM allura.bumblebee_batches WHERE group_id=h.group_id AND workspace_id=h.workspace_id AND source_id=h.source_id AND lease_id=h.lease_id;
 scope_arg:=jsonb_build_object('groupId',l.group_id,'workspaceId',l.workspace_id);
 IF l.catalog_id IS NOT NULL THEN
  SELECT * INTO c FROM allura.bumblebee_catalog_revisions WHERE group_id=l.group_id AND workspace_id=l.workspace_id AND source_id=l.source_id AND id=l.catalog_id;
  catalog_arg:=jsonb_build_object('scope',scope_arg,'sourceId',l.source_id,'revisionId',c.id,'digest',c.digest,'trust','approved','approvedAt',floor(extract(epoch FROM c.approved_at)*1000),'expiresAt',floor(extract(epoch FROM c.expires_at)*1000),'entries',c.metadata->'entries');
 END IF;
 RETURN jsonb_build_object('receipt',prior,'session',jsonb_build_object(
  'scope',scope_arg,'sourceScope',scope_arg,'source',live->'source','sourceRevision',l.source_revision,'currentSourceRevision',(live->>'sourceRevision')::integer,'sourceEnabled',true,'ownerAuthorized',true,
  'credentialAudience','bumblebee_ingest','credentialExpiresAt',floor(extract(epoch FROM least(r.expires_at,l.expires_at))*1000),'credentialRevoked',false,
  'lease',jsonb_build_object('scope',scope_arg,'id',l.id,'sourceId',l.source_id,'sourceRevision',l.source_revision,'endpointId',live->'source'->>'endpointId','populationDigest',l.population_digest,'catalogRevisionId',l.catalog_id,'catalogDigest',l.catalog_digest,'generation',l.generation,'issuedAt',floor(extract(epoch FROM l.issued_at)*1000),'expiresAt',floor(extract(epoch FROM l.expires_at)*1000),'revoked',false,'artifactSha256',l.artifact_sha256),
  'catalog',catalog_arg,'currentGeneration',coalesce(h.generation,0),'lastCompleteReceivedAt',floor(extract(epoch FROM last_received)*1000),'priorWireDigest',b.wire_digest,'keyRevision',redaction_revision));
END $$;
CREATE FUNCTION allura.bumblebee_accept_batch(digest_arg text,plan jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE ctx jsonb:=allura.bumblebee_ingest_context(digest_arg,plan->>'keyRevision');sesh jsonb:=ctx->'session';l jsonb:=sesh->'lease';g text:=sesh->'scope'->>'groupId';w uuid:=(sesh->'scope'->>'workspaceId')::uuid;s uuid:=(l->>'sourceId')::uuid;lease_arg uuid:=(l->>'id')::uuid;
 e uuid:=gen_random_uuid();receipt text;replace_arg boolean:=(plan->>'replaceCurrent')::boolean;state_arg text:=plan->>'evidenceState';item jsonb;catalog_arg uuid:=(l->>'catalogRevisionId')::uuid;package_arg text;owner_arg uuid;summary_arg jsonb:=plan->'summary';population_arg text:=l->>'populationDigest';
BEGIN
 IF ctx->>'receipt' IS NOT NULL THEN IF sesh->>'priorWireDigest' IS DISTINCT FROM plan->>'wireDigest' THEN RAISE EXCEPTION 'conflict';END IF;RETURN ctx->>'receipt';END IF;
 IF plan->'scope' IS DISTINCT FROM sesh->'scope' OR plan->>'sourceId' IS DISTINCT FROM s::text OR plan->>'leaseId' IS DISTINCT FROM lease_arg::text OR (plan->>'generation')::bigint IS DISTINCT FROM (l->>'generation')::bigint OR plan->>'populationDigest' IS DISTINCT FROM population_arg OR (plan->>'sourceRevision')::integer IS DISTINCT FROM (l->>'sourceRevision')::integer OR plan->>'catalogRevisionId' IS DISTINCT FROM l->>'catalogRevisionId' OR plan->>'catalogDigest' IS DISTINCT FROM l->>'catalogDigest' OR plan->>'redaction' IS DISTINCT FROM 'allowlist-v1' OR plan->>'trust' IS DISTINCT FROM 'gateway-verified' OR jsonb_typeof(plan->'packages') IS DISTINCT FROM 'array' OR jsonb_array_length(plan->'packages')>2048 OR jsonb_typeof(plan->'exposures') IS DISTINCT FROM 'array' OR jsonb_array_length(plan->'exposures')>2048 THEN RAISE EXCEPTION 'invalid';END IF;
 IF replace_arg IS NULL OR replace_arg IS DISTINCT FROM (state_arg='complete') OR (replace_arg AND ((l->>'generation')::bigint<=(sesh->>'currentGeneration')::bigint OR summary_arg->>'status'<>'complete' OR (summary_arg->>'timedOut')::boolean OR (summary_arg->>'diagnostics')::integer<>0 OR (summary_arg->>'suppressed')::integer<>0)) THEN RAISE EXCEPTION 'invalid';END IF;
 INSERT INTO allura.bumblebee_batches(group_id,workspace_id,source_id,lease_id,population_digest,generation,wire_digest,run_digest,summary_digest,key_revision,redaction,summary,event_id) VALUES(g,w,s,lease_arg,population_arg,(l->>'generation')::bigint,plan->>'wireDigest',plan->>'runDigest',plan->>'summaryDigest',plan->>'keyRevision','allowlist-v1',jsonb_build_object('status',summary_arg->'status','packageCount',summary_arg->'packageCount','findingCount',summary_arg->'findingCount','suppressed',summary_arg->'suppressed','diagnostics',summary_arg->'diagnostics','duplicates',summary_arg->'duplicates','timedOut',summary_arg->'timedOut','durationMs',summary_arg->'durationMs'),e);
 FOR item IN SELECT value FROM jsonb_array_elements(plan->'packages') LOOP
  INSERT INTO allura.bumblebee_records VALUES(g,w,s,lease_arg,item->>'id',item->>'ecosystem',item->>'name',item->>'version',item->>'confidence',item->>'sourceFileDigest',item->>'projectPathDigest',item->>'rootDigest',item->>'endpointDigest',(item->>'hasLifecycleScripts')::boolean);
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(plan->'exposures') LOOP
  IF NOT EXISTS(SELECT FROM allura.bumblebee_catalog_entries WHERE group_id=g AND workspace_id=w AND source_id=s AND catalog_id=catalog_arg AND entry_id=(item->>'catalogEntryId')::uuid AND ecosystem=item->>'ecosystem' AND name=item->>'name' AND version=item->>'version' AND severity=item->>'severity') OR jsonb_array_length(item->'packageIds')<1 THEN RAISE EXCEPTION 'invalid';END IF;
  FOR package_arg IN SELECT value FROM jsonb_array_elements_text(item->'packageIds') LOOP
   IF NOT EXISTS(SELECT FROM allura.bumblebee_records WHERE group_id=g AND workspace_id=w AND source_id=s AND lease_id=lease_arg AND id=package_arg AND ecosystem=item->>'ecosystem' AND name=item->>'name' AND version=item->>'version' AND confidence='high') THEN RAISE EXCEPTION 'invalid';END IF;
  END LOOP;
  INSERT INTO allura.bumblebee_alerts VALUES(g,w,s,population_arg,item->>'alertKey',catalog_arg,(item->>'catalogEntryId')::uuid,item->>'ecosystem',item->>'name',item->>'version') ON CONFLICT DO NOTHING;
  INSERT INTO allura.bumblebee_alert_observations VALUES(g,w,s,population_arg,item->>'alertKey',lease_arg,catalog_arg,(item->>'catalogEntryId')::uuid,item->>'severity',item->'packageIds');
  INSERT INTO allura.bumblebee_simulations(group_id,workspace_id,source_id,population_digest,alert_key) VALUES(g,w,s,population_arg,item->>'alertKey') ON CONFLICT DO NOTHING;
 END LOOP;
 IF replace_arg THEN INSERT INTO allura.bumblebee_inventory_heads VALUES(g,w,s,population_arg,lease_arg,(l->>'generation')::bigint) ON CONFLICT(group_id,workspace_id,source_id,population_digest) DO UPDATE SET lease_id=EXCLUDED.lease_id,generation=EXCLUDED.generation;END IF;
 receipt:=jsonb_build_object('version','bumblebee-ingest-v1','sourceId',s,'leaseId',lease_arg,'generation',(l->>'generation')::bigint,'eventId',e,'state',state_arg,'replacedCurrent',replace_arg,'packageCount',jsonb_array_length(plan->'packages'),'exposureCount',jsonb_array_length(plan->'exposures'),'wireDigest',plan->>'wireDigest','redaction','allowlist-v1','keyRevision',plan->>'keyRevision')::text;
 INSERT INTO allura.bumblebee_run_decisions VALUES(g,w,s,lease_arg,state_arg,replace_arg,(plan->>'clockSkew')::boolean,plan->'findingIds',receipt);
 SELECT owner_id INTO owner_arg FROM allura.bumblebee_source_revisions WHERE group_id=g AND workspace_id=w AND source_id=s AND revision=(l->>'sourceRevision')::integer;
 INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(g,w,e,owner_arg,'bumblebee_scan',receipt::jsonb||jsonb_build_object('initiator','bumblebee_ingest'));
 -- Recheck time-dependent authority after all append work and before returning.
 PERFORM allura.bumblebee_ingest_context(digest_arg,plan->>'keyRevision');RETURN receipt;
END $$;
CREATE FUNCTION allura.read_bumblebee_inventory(g text,w uuid,s uuid,population_arg text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE head allura.bumblebee_inventory_heads;packages jsonb;alerts jsonb;current_arg jsonb:=NULL;received timestamptz;package_count integer;alert_count integer;
BEGIN
 IF NOT allura.context_allows(g,w,'evidence:read') THEN RAISE EXCEPTION 'forbidden';END IF;
 IF NOT EXISTS(SELECT FROM allura.bumblebee_source_heads WHERE group_id=g AND workspace_id=w AND source_id=s) THEN RAISE EXCEPTION 'not_found';END IF;
 SELECT * INTO head FROM allura.bumblebee_inventory_heads WHERE group_id=g AND workspace_id=w AND source_id=s AND population_digest=population_arg;
 IF FOUND THEN
  SELECT count(*)::integer INTO package_count FROM allura.bumblebee_records WHERE group_id=g AND workspace_id=w AND source_id=s AND lease_id=head.lease_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'ecosystem',ecosystem,'name',name,'version',version,'confidence',confidence,'sourceFileDigest',source_file_digest,'projectPathDigest',project_path_digest,'rootDigest',root_digest,'endpointDigest',endpoint_digest,'hasLifecycleScripts',has_lifecycle_scripts) ORDER BY id),'[]'::jsonb) INTO packages FROM (SELECT * FROM allura.bumblebee_records WHERE group_id=g AND workspace_id=w AND source_id=s AND lease_id=head.lease_id ORDER BY id LIMIT 50) rows;
  SELECT received_at INTO received FROM allura.bumblebee_batches WHERE group_id=g AND workspace_id=w AND source_id=s AND lease_id=head.lease_id;
  current_arg:=jsonb_build_object('leaseId',head.lease_id,'generation',head.generation,'populationDigest',head.population_digest,'packages',packages,'packageCount',package_count,'packagesTruncated',package_count>50,'freshness',CASE WHEN received<=clock_timestamp()-interval '24 hours' THEN 'stale' ELSE 'fresh' END);
 END IF;
 SELECT coalesce(jsonb_agg(v ORDER BY alert_key),'[]'::jsonb) INTO alerts FROM (
  SELECT a.alert_key,jsonb_build_object('alertKey',a.alert_key,'catalogEntryId',a.entry_id,'ecosystem',a.ecosystem,'name',a.name,'version',a.version,'simulation',jsonb_build_object('mode',x.mode,'text',x.text)) AS v
  FROM allura.bumblebee_alerts a JOIN allura.bumblebee_simulations x USING(group_id,workspace_id,source_id,population_digest,alert_key)
  WHERE a.group_id=g AND a.workspace_id=w AND a.source_id=s AND a.population_digest=population_arg ORDER BY a.alert_key LIMIT 50
 ) rows;
 SELECT count(*)::integer INTO alert_count FROM allura.bumblebee_alerts WHERE group_id=g AND workspace_id=w AND source_id=s AND population_digest=population_arg;
 RETURN jsonb_build_object('sourceId',s,'current',current_arg,'alerts',alerts,'alertCount',alert_count,'alertsTruncated',alert_count>50);
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bumblebee_batches','bumblebee_records','bumblebee_run_decisions','bumblebee_inventory_heads','bumblebee_alerts','bumblebee_alert_observations','bumblebee_simulations'] LOOP
  EXECUTE format('ALTER TABLE allura.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE allura.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON allura.%I FROM PUBLIC,allura_app',t);
  IF t<>'bumblebee_inventory_heads' THEN
   EXECUTE format('CREATE TRIGGER bumblebee_immutable BEFORE UPDATE OR DELETE ON allura.%I FOR EACH ROW EXECUTE FUNCTION allura.append_only()',t);
   EXECUTE format('CREATE TRIGGER bumblebee_no_truncate BEFORE TRUNCATE ON allura.%I FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only()',t);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION allura.bumblebee_ingest_context(text,text),allura.bumblebee_accept_batch(text,jsonb),allura.read_bumblebee_inventory(text,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.bumblebee_ingest_context(text,text),allura.bumblebee_accept_batch(text,jsonb),allura.read_bumblebee_inventory(text,uuid,uuid,text) TO allura_app;
