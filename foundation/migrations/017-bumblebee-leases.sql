-- Exclusive scanner credentials never enter machine_credentials or general grants.
CREATE TABLE allura.bumblebee_runners (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, id uuid NOT NULL, source_revision integer NOT NULL,
 digest text NOT NULL UNIQUE CHECK(digest ~ '^[a-f0-9]{64}$'), owner_id uuid NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, event_id uuid NOT NULL,
 PRIMARY KEY(group_id,workspace_id,source_id,id), FOREIGN KEY(group_id,workspace_id,source_id,source_revision) REFERENCES allura.bumblebee_source_revisions,
 FOREIGN KEY(group_id,owner_id) REFERENCES allura.memberships, FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED,
 CHECK(expires_at=created_at+interval '24 hours')
);
CREATE TABLE allura.bumblebee_runner_state (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, credential_id uuid NOT NULL, revoked boolean NOT NULL DEFAULT false,
 PRIMARY KEY(group_id,workspace_id,source_id,credential_id), FOREIGN KEY(group_id,workspace_id,source_id,credential_id) REFERENCES allura.bumblebee_runners
);
CREATE TABLE allura.bumblebee_runner_receipts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, actor_id uuid NOT NULL, operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'), kind text NOT NULL CHECK(kind IN ('issue','revoke')), source_id uuid NOT NULL, credential_id uuid NOT NULL,
 rationale text NOT NULL CHECK(octet_length(rationale) BETWEEN 1 AND 4000), evidence_ids uuid[] NOT NULL CHECK(cardinality(evidence_ids) BETWEEN 1 AND 32), receipt jsonb NOT NULL, event_id uuid NOT NULL,
 PRIMARY KEY(group_id,workspace_id,actor_id,operation_key), FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships,
 FOREIGN KEY(group_id,workspace_id,source_id,credential_id) REFERENCES allura.bumblebee_runners,
 FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE allura.bumblebee_generations (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(group_id,workspace_id,source_id), FOREIGN KEY(group_id,workspace_id,source_id) REFERENCES allura.bumblebee_source_heads
);
CREATE TABLE allura.bumblebee_leases (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, id uuid NOT NULL, credential_id uuid NOT NULL, source_revision integer NOT NULL,
 operation_key text NOT NULL CHECK(operation_key ~ '^[A-Za-z0-9._:-]{1,128}$'), generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
 population_digest text NOT NULL CHECK(population_digest ~ '^[a-f0-9]{64}$'), catalog_id uuid, catalog_digest text CHECK(catalog_digest ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, ingest_digest text NOT NULL UNIQUE CHECK(ingest_digest ~ '^[a-f0-9]{64}$'), key_revision text NOT NULL CHECK(key_revision ~ '^[A-Za-z0-9._:-]{1,128}$'), event_id uuid NOT NULL,
 PRIMARY KEY(group_id,workspace_id,source_id,id), UNIQUE(group_id,workspace_id,source_id,credential_id,operation_key), UNIQUE(group_id,workspace_id,source_id,generation),
 FOREIGN KEY(group_id,workspace_id,source_id,credential_id) REFERENCES allura.bumblebee_runners,
 FOREIGN KEY(group_id,workspace_id,source_id,source_revision) REFERENCES allura.bumblebee_source_revisions,
 FOREIGN KEY(group_id,workspace_id,source_id,catalog_id) REFERENCES allura.bumblebee_catalog_revisions(group_id,workspace_id,source_id,id),
 FOREIGN KEY(group_id,workspace_id,event_id) REFERENCES allura.events DEFERRABLE INITIALLY DEFERRED,
 CHECK(expires_at=issued_at+interval '600 seconds'), CHECK((catalog_id IS NULL)=(catalog_digest IS NULL))
);
ALTER TABLE allura.bumblebee_leases ADD COLUMN artifact_sha256 text NOT NULL DEFAULT '3b46f98ab8fa6345a5d39c7483ff37c51b2ee7699aabe51f2a54133f357f6c7a' CHECK(artifact_sha256='3b46f98ab8fa6345a5d39c7483ff37c51b2ee7699aabe51f2a54133f357f6c7a');
CREATE TABLE allura.bumblebee_lease_state (
 group_id text NOT NULL, workspace_id uuid NOT NULL, source_id uuid NOT NULL, lease_id uuid NOT NULL, revoked boolean NOT NULL DEFAULT false,
 PRIMARY KEY(group_id,workspace_id,source_id,lease_id), FOREIGN KEY(group_id,workspace_id,source_id,lease_id) REFERENCES allura.bumblebee_leases
);
-- Lock human authority before source, then reread all current bindings under locks.
CREATE FUNCTION allura.bumblebee_lock_source(g text,w uuid,s uuid,revision_arg integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r allura.bumblebee_source_revisions; h allura.bumblebee_source_heads; a jsonb; c allura.bumblebee_catalog_revisions; rejected_arg boolean;
BEGIN
 SELECT * INTO r FROM allura.bumblebee_source_revisions WHERE group_id=g AND workspace_id=w AND source_id=s AND revision=revision_arg;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden';END IF;
 PERFORM allura.lock_authority(r.owner_id,g,w);
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,s)::text,10103));
 SELECT * INTO h FROM allura.bumblebee_source_heads WHERE group_id=g AND workspace_id=w AND source_id=s FOR UPDATE;
 IF h.revision IS DISTINCT FROM revision_arg OR NOT h.enabled THEN RAISE EXCEPTION 'forbidden';END IF;
 a:=allura.resolve_authority(r.owner_issuer,r.owner_subject,'human','','',g,w::text);
 IF a IS NULL OR a->>'principalId' IS DISTINCT FROM r.owner_id::text OR NOT (a->>'principalActive')::boolean OR NOT (a->>'membershipActive')::boolean OR NOT (a->>'tenantActive')::boolean OR NOT (a->>'grantActive')::boolean OR (a->>'workspaceLocked')::boolean OR a->>'role' IS DISTINCT FROM 'workspace_admin' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF r.catalog_id IS NOT NULL THEN
  SELECT * INTO c FROM allura.bumblebee_catalog_revisions WHERE group_id=g AND workspace_id=w AND source_id=s AND id=r.catalog_id;
  SELECT rejected INTO rejected_arg FROM allura.bumblebee_catalog_state WHERE group_id=g AND workspace_id=w AND source_id=s AND catalog_id=r.catalog_id FOR SHARE;
  IF c.id IS NULL OR rejected_arg IS DISTINCT FROM false OR c.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'forbidden';END IF;
 END IF;
 RETURN jsonb_build_object('groupId',g,'workspaceId',w,'sourceId',s,'source',r.descriptor,'sourceRevision',revision_arg,'ownerId',r.owner_id,'catalogDigest',c.digest);
END $$;
CREATE FUNCTION allura.bumblebee_runner_command(g text,w uuid,input jsonb,request_digest_arg text,kind_arg text,credential_arg uuid,digest_arg text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid:=current_setting('allura.principal')::uuid; s uuid:=(input->>'sourceId')::uuid; existing allura.bumblebee_runner_receipts;
 evidence uuid; evidence_arr uuid[]; live jsonb; e uuid:=gen_random_uuid(); issued timestamptz:=date_trunc('milliseconds',clock_timestamp()); result jsonb; revision_arg integer;
BEGIN
 PERFORM allura.bumblebee_config_authority(g,w);
 IF s IS NULL OR coalesce(input->>'operationKey','') !~ '^[A-Za-z0-9._:-]{1,128}$' OR coalesce(request_digest_arg,'') !~ '^[a-f0-9]{64}$' OR octet_length(coalesce(input->>'rationale','')) NOT BETWEEN 1 AND 4000 OR jsonb_typeof(input->'evidenceIds') IS DISTINCT FROM 'array' OR jsonb_array_length(input->'evidenceIds') NOT BETWEEN 1 AND 32 THEN RAISE EXCEPTION 'invalid';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,actor,input->>'operationKey')::text,10104));
 SELECT * INTO existing FROM allura.bumblebee_runner_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=input->>'operationKey';
 IF FOUND THEN IF existing.request_digest<>request_digest_arg OR existing.kind<>kind_arg THEN RAISE EXCEPTION 'conflict';END IF;RETURN existing.receipt;END IF;
 FOR evidence IN SELECT value::uuid FROM jsonb_array_elements_text(input->'evidenceIds') LOOP
  IF NOT EXISTS(SELECT FROM allura.events WHERE group_id=g AND workspace_id=w AND id=evidence) THEN RAISE EXCEPTION 'not_found';END IF;
 END LOOP;
 IF kind_arg='issue' THEN
  revision_arg:=(input->>'sourceRevision')::integer;
  live:=allura.bumblebee_lock_source(g,w,s,revision_arg);
  IF live->>'ownerId' IS DISTINCT FROM actor::text OR credential_arg IS NULL OR coalesce(digest_arg,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'forbidden';END IF;
  IF (SELECT count(*) FROM allura.bumblebee_runners r JOIN allura.bumblebee_runner_state t ON t.group_id=r.group_id AND t.workspace_id=r.workspace_id AND t.source_id=r.source_id AND t.credential_id=r.id WHERE r.group_id=g AND r.workspace_id=w AND r.source_id=s AND NOT t.revoked AND r.expires_at>clock_timestamp())>=8 THEN RAISE EXCEPTION 'conflict';END IF;
  INSERT INTO allura.bumblebee_runners VALUES(g,w,s,credential_arg,revision_arg,digest_arg,actor,issued,issued+interval '24 hours',e);
  INSERT INTO allura.bumblebee_runner_state VALUES(g,w,s,credential_arg,false);
  result:=jsonb_build_object('version','bumblebee-runner-v1','sourceId',s,'credentialId',credential_arg,'sourceRevision',revision_arg,'expiresAt',floor(extract(epoch FROM issued+interval '24 hours')*1000),'eventId',e,'state','issued');
 ELSIF kind_arg='revoke' THEN
  credential_arg:=(input->>'credentialId')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,w,s)::text,10103));
  PERFORM 1 FROM allura.bumblebee_source_heads WHERE group_id=g AND workspace_id=w AND source_id=s FOR UPDATE;
  UPDATE allura.bumblebee_runner_state SET revoked=true WHERE group_id=g AND workspace_id=w AND source_id=s AND credential_id=credential_arg;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found';END IF;
  result:=jsonb_build_object('version','bumblebee-runner-v1','sourceId',s,'credentialId',credential_arg,'eventId',e,'state','revoked');
 ELSE RAISE EXCEPTION 'invalid';END IF;
 SELECT array_agg(value::uuid ORDER BY value) INTO evidence_arr FROM jsonb_array_elements_text(input->'evidenceIds');
 INSERT INTO allura.bumblebee_runner_receipts VALUES(g,w,actor,input->>'operationKey',request_digest_arg,kind_arg,s,credential_arg,input->>'rationale',evidence_arr,result,e);
 INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(g,w,e,actor,'bumblebee_config',result||jsonb_build_object('configurationKind',kind_arg));
 RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'conflict';
END $$;
CREATE FUNCTION allura.bumblebee_runner_context(digest_arg text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE r allura.bumblebee_runners; live jsonb; revoked_arg boolean;
BEGIN
 SELECT * INTO r FROM allura.bumblebee_runners WHERE digest=digest_arg;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden';END IF;
 live:=allura.bumblebee_lock_source(r.group_id,r.workspace_id,r.source_id,r.source_revision);
 SELECT revoked INTO revoked_arg FROM allura.bumblebee_runner_state WHERE group_id=r.group_id AND workspace_id=r.workspace_id AND source_id=r.source_id AND credential_id=r.id FOR SHARE;
 IF revoked_arg IS DISTINCT FROM false OR r.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'forbidden';END IF;
 RETURN live||jsonb_build_object('credentialId',r.id,'credentialExpiresAt',floor(extract(epoch FROM r.expires_at)*1000));
END $$;
CREATE FUNCTION allura.bumblebee_acquire_lease(digest_arg text,input jsonb,id_arg uuid,population_arg text,ingest_arg text,key_arg text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE live jsonb:=allura.bumblebee_runner_context(digest_arg); g text:=live->>'groupId';w uuid:=(live->>'workspaceId')::uuid;s uuid:=(live->>'sourceId')::uuid; credential_arg uuid:=(live->>'credentialId')::uuid;
 l allura.bumblebee_leases; generation_arg bigint;issued timestamptz:=date_trunc('milliseconds',clock_timestamp());e uuid:=gen_random_uuid();revoked_arg boolean;
BEGIN
 IF coalesce(input->>'operationKey','') !~ '^[A-Za-z0-9._:-]{1,128}$' OR coalesce(population_arg,'') !~ '^[a-f0-9]{64}$' OR coalesce(ingest_arg,'') !~ '^[a-f0-9]{64}$' OR coalesce(key_arg,'') !~ '^[A-Za-z0-9._:-]{1,128}$' OR id_arg IS NULL THEN RAISE EXCEPTION 'invalid';END IF;
 SELECT * INTO l FROM allura.bumblebee_leases WHERE group_id=g AND workspace_id=w AND source_id=s AND credential_id=credential_arg AND operation_key=input->>'operationKey';
 IF FOUND THEN
  IF l.source_revision IS DISTINCT FROM (input->>'sourceRevision')::integer THEN RAISE EXCEPTION 'conflict';END IF;
  SELECT revoked INTO revoked_arg FROM allura.bumblebee_lease_state WHERE group_id=g AND workspace_id=w AND source_id=s AND lease_id=l.id FOR SHARE;
  IF revoked_arg IS DISTINCT FROM false OR l.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'forbidden';END IF;
 ELSE
  IF (input->>'sourceRevision')::integer IS DISTINCT FROM (live->>'sourceRevision')::integer THEN RAISE EXCEPTION 'conflict';END IF;
  INSERT INTO allura.bumblebee_generations VALUES(g,w,s,1) ON CONFLICT(group_id,workspace_id,source_id) DO UPDATE SET generation=allura.bumblebee_generations.generation+1 RETURNING generation INTO generation_arg;
  INSERT INTO allura.bumblebee_leases VALUES(g,w,s,id_arg,credential_arg,(live->>'sourceRevision')::integer,input->>'operationKey',generation_arg,population_arg,(live->'source'->>'catalogRevisionId')::uuid,live->>'catalogDigest',issued,issued+interval '600 seconds',ingest_arg,key_arg,e) RETURNING * INTO l;
  INSERT INTO allura.bumblebee_lease_state VALUES(g,w,s,id_arg,false);
  INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES(g,w,e,(live->>'ownerId')::uuid,'bumblebee_config',jsonb_build_object('configurationKind','lease','sourceId',s,'leaseId',id_arg,'credentialId',credential_arg,'generation',generation_arg,'initiator','bumblebee_runner'));
 END IF;
 RETURN live||jsonb_build_object('leaseId',l.id,'generation',l.generation,'populationDigest',l.population_digest,'issuedAt',floor(extract(epoch FROM l.issued_at)*1000),'expiresAt',floor(extract(epoch FROM l.expires_at)*1000),'ingestDigest',l.ingest_digest,'keyRevision',l.key_revision,'artifactSha256',l.artifact_sha256);
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bumblebee_runners','bumblebee_runner_state','bumblebee_runner_receipts','bumblebee_generations','bumblebee_leases','bumblebee_lease_state'] LOOP
  EXECUTE format('ALTER TABLE allura.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE allura.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON allura.%I FROM PUBLIC,allura_app',t);
  IF t IN ('bumblebee_runners','bumblebee_runner_receipts','bumblebee_leases') THEN
   EXECUTE format('CREATE TRIGGER bumblebee_immutable BEFORE UPDATE OR DELETE ON allura.%I FOR EACH ROW EXECUTE FUNCTION allura.append_only()',t);
   EXECUTE format('CREATE TRIGGER bumblebee_no_truncate BEFORE TRUNCATE ON allura.%I FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only()',t);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION allura.bumblebee_lock_source(text,uuid,uuid,integer),allura.bumblebee_runner_command(text,uuid,jsonb,text,text,uuid,text),allura.bumblebee_runner_context(text),allura.bumblebee_acquire_lease(text,jsonb,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.bumblebee_runner_command(text,uuid,jsonb,text,text,uuid,text),allura.bumblebee_runner_context(text),allura.bumblebee_acquire_lease(text,jsonb,uuid,text,text,text) TO allura_app;
