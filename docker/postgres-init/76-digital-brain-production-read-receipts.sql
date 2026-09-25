BEGIN;

-- Epic 30 durable production-candidate read receipt boundary. The restricted
-- application role has no table DML; it may only record a content-free,
-- server-scoped receipt through the narrow function below. Route activation
-- remains a separate policy and release decision.
CREATE TABLE brain_read_receipts (
  receipt_id UUID PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('read_documents', 'search_documents')),
  decision TEXT NOT NULL CHECK (decision = 'allow_candidate'),
  reason_code TEXT NOT NULL CHECK (reason_code = 'authorized'),
  policy_version TEXT NOT NULL CHECK (policy_version = 'epic30-production-v1'),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  principal_id TEXT NOT NULL CHECK (length(btrim(principal_id)) > 0),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('viewer', 'curator', 'admin')),
  session_hash TEXT NOT NULL CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  policy_epoch BIGINT NOT NULL CHECK (policy_epoch > 0),
  witness_hash TEXT NOT NULL CHECK (witness_hash ~ '^[a-f0-9]{64}$'),
  query_hash TEXT CHECK (
    (action = 'read_documents' AND query_hash IS NULL)
    OR (action = 'search_documents' AND query_hash ~ '^[a-f0-9]{64}$')
  ),
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, workspace_id, principal_id, action, policy_epoch, witness_hash)
);

ALTER TABLE brain_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_read_receipts FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.prevent_brain_read_receipt_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Brain read receipts are immutable' USING ERRCODE = '42501';
END;
$$;
ALTER FUNCTION public.prevent_brain_read_receipt_mutation() OWNER TO allura_migration;
REVOKE ALL ON FUNCTION public.prevent_brain_read_receipt_mutation() FROM PUBLIC;
CREATE TRIGGER brain_read_receipts_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON brain_read_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_brain_read_receipt_mutation();

CREATE OR REPLACE FUNCTION app.record_brain_read_receipt(
  p_receipt_id UUID,
  p_action TEXT,
  p_actor_role TEXT,
  p_policy_epoch BIGINT,
  p_session_hash TEXT,
  p_witness_hash TEXT,
  p_query_hash TEXT,
  p_occurred_at TIMESTAMPTZ
) RETURNS TABLE(receipt_id UUID, witness_hash TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_group_id TEXT := current_setting('app.current_group_id', true);
  v_workspace_id TEXT := current_setting('app.current_workspace_id', true);
  v_principal_id TEXT := current_setting('app.current_principal', true);
  v_role TEXT;
  v_epoch BIGINT;
BEGIN
  IF v_group_id IS NULL OR length(btrim(v_group_id)) = 0
     OR v_workspace_id IS NULL OR length(btrim(v_workspace_id)) = 0
     OR v_principal_id IS NULL OR length(btrim(v_principal_id)) = 0
     OR p_action NOT IN ('read_documents', 'search_documents')
     OR p_actor_role NOT IN ('viewer', 'curator', 'admin')
     OR p_policy_epoch <= 0
     OR p_session_hash !~ '^[a-f0-9]{64}$'
     OR p_witness_hash !~ '^[a-f0-9]{64}$'
     OR (p_action = 'read_documents' AND p_query_hash IS NOT NULL)
     OR (p_action = 'search_documents' AND p_query_hash !~ '^[a-f0-9]{64}$')
     OR p_occurred_at IS NULL
     OR p_occurred_at > now() + interval '5 minutes'
     OR p_occurred_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'governed read receipt refused' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_membership.role, workspace_membership.policy_epoch
    INTO v_role, v_epoch
    FROM public.memberships AS tenant_membership
    JOIN public.brain_workspace_memberships AS workspace_membership
      ON workspace_membership.group_id = tenant_membership.group_id
     AND workspace_membership.user_id = tenant_membership.user_id
    JOIN public.brain_membership_approvals AS approval
      ON approval.approval_id = workspace_membership.approval_id
     AND approval.group_id = workspace_membership.group_id
     AND approval.workspace_id = workspace_membership.workspace_id
     AND approval.subject_user_id = workspace_membership.user_id
     AND approval.policy_epoch = workspace_membership.policy_epoch
   WHERE tenant_membership.group_id = v_group_id
     AND tenant_membership.user_id = v_principal_id
     AND tenant_membership.removed_at IS NULL
     AND workspace_membership.workspace_id = v_workspace_id
     AND workspace_membership.revoked_at IS NULL
     AND approval.action = 'grant'
     AND approval.approver_role = 'workspace_membership_admin'
     AND approval.verified_at IS NOT NULL
     AND approval.revoked_at IS NULL
     AND approval.consumed_at IS NOT NULL
   FOR SHARE OF workspace_membership;
  IF NOT FOUND OR v_role <> p_actor_role OR v_epoch <> p_policy_epoch THEN
    RAISE EXCEPTION 'governed read receipt authority refused' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.brain_read_receipts (
    receipt_id, action, decision, reason_code, policy_version, group_id,
    workspace_id, principal_id, actor_role, session_hash, policy_epoch,
    witness_hash, query_hash, occurred_at
  ) VALUES (
    p_receipt_id, p_action, 'allow_candidate', 'authorized', 'epic30-production-v1', v_group_id,
    v_workspace_id, v_principal_id, p_actor_role, p_session_hash, p_policy_epoch,
    p_witness_hash, p_query_hash, p_occurred_at
  );

  RETURN QUERY SELECT p_receipt_id, p_witness_hash;
END;
$$;

ALTER FUNCTION app.record_brain_read_receipt(UUID,TEXT,TEXT,BIGINT,TEXT,TEXT,TEXT,TIMESTAMPTZ) OWNER TO allura_migration;
REVOKE ALL ON FUNCTION app.record_brain_read_receipt(UUID,TEXT,TEXT,BIGINT,TEXT,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_brain_read_receipt(UUID,TEXT,TEXT,BIGINT,TEXT,TEXT,TEXT,TIMESTAMPTZ) TO allura_app;
REVOKE ALL ON brain_read_receipts FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON brain_read_receipts FROM allura_app;
GRANT SELECT ON brain_read_receipts TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('076', now(), 'Epic 30 governed durable production read receipts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
