-- Exact immutable versions only. No workspace grants or RLS widening.
CREATE TABLE allura.memory_shares (
 group_id text NOT NULL, workspace_id uuid NOT NULL, recipient_id uuid NOT NULL, memory_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(), revision bigint NOT NULL CHECK(revision>0), active boolean NOT NULL,
 issuer_id uuid NOT NULL REFERENCES allura.principals, issuer text NOT NULL, subject text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(group_id,workspace_id,recipient_id,memory_id),
 FOREIGN KEY(group_id,recipient_id) REFERENCES allura.memberships,
 FOREIGN KEY(group_id,workspace_id,memory_id) REFERENCES allura.semantic_versions(group_id,workspace_id,id)
);
CREATE TABLE allura.memory_share_receipts (
 group_id text NOT NULL, workspace_id uuid NOT NULL, actor_id uuid NOT NULL, operation_key uuid NOT NULL,
 digest text NOT NULL, receipt jsonb NOT NULL,
 PRIMARY KEY(group_id,workspace_id,actor_id,operation_key),
 FOREIGN KEY(group_id,workspace_id) REFERENCES allura.workspaces,
 FOREIGN KEY(group_id,actor_id) REFERENCES allura.memberships
);
CREATE TABLE allura.memory_share_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id text NOT NULL, workspace_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES allura.principals, recipient_id uuid NOT NULL REFERENCES allura.principals,
 memory_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('approve','revoke','get')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(group_id,workspace_id,memory_id) REFERENCES allura.semantic_versions(group_id,workspace_id,id)
);
CREATE TRIGGER memory_share_receipts_immutable BEFORE UPDATE OR DELETE ON allura.memory_share_receipts FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER memory_share_receipts_no_truncate BEFORE TRUNCATE ON allura.memory_share_receipts FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER memory_share_audit_immutable BEFORE UPDATE OR DELETE ON allura.memory_share_audit FOR EACH ROW EXECUTE FUNCTION allura.append_only();
CREATE TRIGGER memory_share_audit_no_truncate BEFORE TRUNCATE ON allura.memory_share_audit FOR EACH STATEMENT EXECUTE FUNCTION allura.append_only();
REVOKE ALL ON allura.memory_shares,allura.memory_share_receipts,allura.memory_share_audit FROM PUBLIC,allura_app;

-- Dedicated multiparty entrypoint; never uses scopedTransaction's actor prelock.
-- The access-command advisory key precedes all row locks. Shared reads and
-- exclusive commands also serialize absent shares and candidate issuer changes.
-- This avoids access_command's remove_member shared-membership lock upgrade.
CREATE FUNCTION allura.memory_share(issuer_arg text,subject_arg text,g text,w uuid,op text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,allura AS $$
DECLARE actor uuid; recipient uuid; memory uuid; candidate uuid; s allura.memory_shares;
 result jsonb; member jsonb; revision_arg bigint; key_arg uuid; digest_arg text; old allura.memory_share_receipts;
BEGIN
 IF op NOT IN ('approve','revoke','get') OR op IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
 IF input IS NULL OR jsonb_typeof(input)<>'object' OR octet_length(input::text)>4096 THEN RAISE EXCEPTION 'invalid'; END IF;
 IF EXISTS(SELECT FROM jsonb_object_keys(input) k WHERE NOT k=ANY(CASE WHEN op='get' THEN ARRAY['memoryId','history'] ELSE ARRAY['recipientId','memoryId','expectedRevision','operationKey'] END))
  OR jsonb_typeof(input->'memoryId') IS DISTINCT FROM 'string'
  OR (input->>'memoryId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'invalid'; END IF;
 IF op='get' THEN
  IF input ? 'history' AND jsonb_typeof(input->'history') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid'; END IF;
 ELSE
  IF jsonb_typeof(input->'recipientId') IS DISTINCT FROM 'string' OR jsonb_typeof(input->'operationKey') IS DISTINCT FROM 'string'
   OR (input->>'recipientId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR (input->>'operationKey') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR jsonb_typeof(input->'expectedRevision') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid'; END IF;
  IF (input->>'expectedRevision')::numeric<0 OR (input->>'expectedRevision')::numeric>9007199254740991
   OR trunc((input->>'expectedRevision')::numeric)<>(input->>'expectedRevision')::numeric THEN RAISE EXCEPTION 'invalid'; END IF;
 END IF;
 IF op='get' THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended(g,23002));
 ELSE PERFORM pg_advisory_xact_lock(hashtextextended(g,23002)); END IF;
 member:=allura.resolve_member(issuer_arg,subject_arg,g);
 IF NOT coalesce((member->>'active')::boolean,false) THEN RAISE EXCEPTION 'forbidden'; END IF;
 actor:=(member->>'principalId')::uuid;
 memory:=(input->>'memoryId')::uuid;
 recipient:=CASE WHEN op='get' THEN actor ELSE (input->>'recipientId')::uuid END;
 SELECT issuer_id INTO candidate FROM allura.memory_shares WHERE group_id=g AND workspace_id=w AND recipient_id=recipient AND memory_id=memory;
 PERFORM p.id FROM allura.principals p JOIN allura.memberships m ON m.principal_id=p.id
 WHERE m.group_id=g AND p.id IN (actor,recipient,candidate) ORDER BY p.id FOR SHARE OF p,m;
 PERFORM 1 FROM allura.identity_bindings WHERE principal_id IN (actor,recipient,candidate) ORDER BY principal_id,issuer,subject,identity_kind FOR SHARE;
 PERFORM 1 FROM allura.tenants WHERE group_id=g FOR SHARE;
 IF op='get' THEN PERFORM 1 FROM allura.workspaces WHERE group_id=g AND id=w FOR SHARE;
 ELSE PERFORM 1 FROM allura.workspaces WHERE group_id=g AND id=w FOR UPDATE; END IF;
 PERFORM 1 FROM allura.workspace_grants WHERE group_id=g AND workspace_id=w AND principal_id IN (actor,candidate) ORDER BY principal_id FOR SHARE;
 member:=allura.resolve_member(issuer_arg,subject_arg,g);
 IF NOT coalesce((member->>'active')::boolean,false) OR member->>'principalId' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO s FROM allura.memory_shares WHERE group_id=g AND workspace_id=w AND recipient_id=recipient AND memory_id=memory FOR SHARE;
 IF s.issuer_id IS DISTINCT FROM candidate THEN RAISE EXCEPTION 'not_found'; END IF;
 IF op='get' THEN
  IF NOT coalesce(s.active,false) OR NOT allura.grant_admin(g,w,s.issuer_id)
   OR NOT EXISTS(SELECT FROM allura.identity_bindings WHERE issuer=s.issuer AND subject=s.subject AND principal_id=s.issuer_id AND identity_kind='human' AND active)
   THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM 1 FROM allura.semantic_heads h JOIN allura.semantic_versions v ON v.group_id=h.group_id AND v.workspace_id=h.workspace_id AND v.knowledge_id=h.knowledge_id
   WHERE v.group_id=g AND v.workspace_id=w AND v.id=memory FOR SHARE OF h;
  SELECT jsonb_build_object('memory',jsonb_build_object('id',v.id,'content',v.content,'created_at',to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) INTO result
   FROM allura.semantic_versions v JOIN allura.semantic_heads h ON h.group_id=v.group_id AND h.workspace_id=v.workspace_id AND h.knowledge_id=v.knowledge_id
   WHERE v.group_id=g AND v.workspace_id=w AND v.id=memory AND (coalesce((input->>'history')::boolean,false) OR (h.current_version_id=v.id AND h.lifecycle='current'));
  IF result IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 ELSE
  IF NOT allura.grant_admin(g,w,actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF op='approve' AND (recipient=actor OR NOT allura.active_human(g,recipient) OR NOT EXISTS(SELECT FROM allura.identity_bindings WHERE principal_id=recipient AND identity_kind='human' AND active)) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS(SELECT FROM allura.semantic_versions WHERE group_id=g AND workspace_id=w AND id=memory) THEN RAISE EXCEPTION 'not_found'; END IF;
  revision_arg:=(input->>'expectedRevision')::bigint; key_arg:=(input->>'operationKey')::uuid;
  digest_arg:=encode(sha256(convert_to(jsonb_build_object('op',op,'recipientId',recipient,'memoryId',memory,'expectedRevision',revision_arg)::text,'UTF8')),'hex');
  SELECT * INTO old FROM allura.memory_share_receipts WHERE group_id=g AND workspace_id=w AND actor_id=actor AND operation_key=key_arg;
  IF FOUND THEN
   IF old.digest<>digest_arg THEN RAISE EXCEPTION 'conflict'; END IF;
   RETURN old.receipt;
  END IF;
  IF revision_arg IS NULL OR revision_arg<0 THEN RAISE EXCEPTION 'invalid'; END IF;
  IF op='revoke' AND s.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF coalesce(s.revision,0)<>revision_arg THEN RAISE EXCEPTION 'conflict'; END IF;
  IF op='revoke' AND NOT s.active THEN RAISE EXCEPTION 'conflict'; END IF;
  INSERT INTO allura.memory_shares(group_id,workspace_id,recipient_id,memory_id,revision,active,issuer_id,issuer,subject)
   VALUES(g,w,recipient,memory,revision_arg+1,op='approve',actor,issuer_arg,subject_arg)
   ON CONFLICT(group_id,workspace_id,recipient_id,memory_id) DO UPDATE SET revision=excluded.revision,active=excluded.active,issuer_id=CASE WHEN op='approve' THEN excluded.issuer_id ELSE memory_shares.issuer_id END,issuer=CASE WHEN op='approve' THEN excluded.issuer ELSE memory_shares.issuer END,subject=CASE WHEN op='approve' THEN excluded.subject ELSE memory_shares.subject END,changed_at=clock_timestamp()
   RETURNING * INTO s;
  result:=jsonb_build_object('action',op,'grantId',s.id,'groupId',g,'workspaceId',w,'actorId',actor,'recipientId',recipient,'memoryId',memory,'revision',s.revision,'operationKey',key_arg,'createdAt',s.changed_at);
  INSERT INTO allura.memory_share_receipts VALUES(g,w,actor,key_arg,digest_arg,result);
 END IF;
 INSERT INTO allura.memory_share_audit(group_id,workspace_id,actor_id,recipient_id,memory_id,action) VALUES(g,w,actor,recipient,memory,op);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION allura.memory_share(text,text,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allura.memory_share(text,text,text,uuid,text,jsonb) TO allura_app;
