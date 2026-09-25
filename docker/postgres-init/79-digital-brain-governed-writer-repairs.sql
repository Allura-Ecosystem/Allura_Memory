BEGIN;

-- The membership writer returns columns named after the underlying table.
-- Qualify the table columns so PL/pgSQL cannot confuse a return variable with
-- an approval column. This is a forward repair for PostgreSQL's strict name
--resolution used by the confined CI database.
CREATE OR REPLACE FUNCTION app.commit_brain_workspace_membership(
  p_approval_id UUID,
  p_action TEXT,
  p_authority_epoch BIGINT,
  p_expected_epoch BIGINT,
  p_target_epoch BIGINT
) RETURNS TABLE(
  tenant_id TEXT,
  workspace_id TEXT,
  user_id TEXT,
  approved_by TEXT,
  approval_id UUID,
  policy_epoch BIGINT,
  revoked_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_group_id TEXT := current_setting('app.current_group_id', true);
  v_workspace_id TEXT := current_setting('app.current_workspace_id', true);
  v_principal_id TEXT := current_setting('app.current_principal', true);
  v_actor_epoch BIGINT;
  v_approval public.brain_membership_approvals%ROWTYPE;
  v_membership public.brain_workspace_memberships%ROWTYPE;
  v_receipt_action TEXT;
BEGIN
  IF v_group_id IS NULL OR length(btrim(v_group_id)) = 0
     OR v_workspace_id IS NULL OR length(btrim(v_workspace_id)) = 0
     OR v_principal_id IS NULL OR length(btrim(v_principal_id)) = 0
     OR p_action NOT IN ('grant', 'revoke')
     OR p_authority_epoch <= 0 OR p_expected_epoch < 0
     OR p_target_epoch <> p_expected_epoch + 1 THEN
    RAISE EXCEPTION 'governed membership transition refused' USING ERRCODE = '42501';
  END IF;

  SELECT workspace_membership.policy_epoch INTO v_actor_epoch
    FROM public.memberships AS tenant_membership
    JOIN public.brain_workspace_memberships AS workspace_membership
      ON workspace_membership.group_id = tenant_membership.group_id
     AND workspace_membership.user_id = tenant_membership.user_id
    JOIN public.brain_membership_approvals AS actor_approval
      ON actor_approval.approval_id = workspace_membership.approval_id
     AND actor_approval.group_id = workspace_membership.group_id
     AND actor_approval.workspace_id = workspace_membership.workspace_id
     AND actor_approval.subject_user_id = workspace_membership.user_id
   WHERE tenant_membership.group_id = v_group_id
     AND tenant_membership.user_id = v_principal_id
     AND tenant_membership.role = 'admin'
     AND tenant_membership.removed_at IS NULL
     AND workspace_membership.workspace_id = v_workspace_id
     AND workspace_membership.revoked_at IS NULL
     AND actor_approval.action = 'grant'
     AND actor_approval.revoked_at IS NULL
     AND actor_approval.consumed_at IS NOT NULL
   FOR UPDATE OF workspace_membership;
  IF NOT FOUND OR v_actor_epoch <> p_authority_epoch THEN
    RAISE EXCEPTION 'governed membership actor refused' USING ERRCODE = '42501';
  END IF;

  SELECT approval.* INTO v_approval
    FROM public.brain_membership_approvals AS approval
   WHERE approval.approval_id = p_approval_id
     AND approval.group_id = v_group_id
     AND approval.workspace_id = v_workspace_id
   FOR UPDATE;
  IF NOT FOUND OR v_approval.action <> p_action
     OR v_approval.approver_role <> 'workspace_membership_admin'
     OR v_approval.verified_at IS NULL OR v_approval.revoked_at IS NOT NULL
     OR v_approval.consumed_at IS NOT NULL
     OR v_approval.policy_epoch <> p_authority_epoch THEN
    RAISE EXCEPTION 'governed membership approval refused' USING ERRCODE = '42501';
  END IF;

  v_receipt_action := CASE p_action WHEN 'grant' THEN 'membership_grant' ELSE 'membership_revoke' END;
  IF NOT EXISTS (
    SELECT 1 FROM public.brain_membership_receipts AS receipt
     WHERE receipt.action = v_receipt_action
       AND receipt.decision = 'allow_candidate'
       AND receipt.group_id = v_group_id
       AND receipt.workspace_id = v_workspace_id
       AND receipt.actor_id = v_principal_id
       AND receipt.subject_user_id = v_approval.subject_user_id
       AND receipt.approval_id = p_approval_id
       AND receipt.authority_epoch = p_authority_epoch
       AND receipt.target_epoch = p_target_epoch
  ) THEN
    RAISE EXCEPTION 'governed membership receipt refused' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS subject_tenant_membership
     WHERE subject_tenant_membership.group_id = v_group_id
       AND subject_tenant_membership.user_id = v_approval.subject_user_id
       AND subject_tenant_membership.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'governed membership subject refused' USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO v_membership
    FROM public.brain_workspace_memberships AS membership
   WHERE membership.group_id = v_group_id
     AND membership.workspace_id = v_workspace_id
     AND membership.user_id = v_approval.subject_user_id
   FOR UPDATE;

  IF p_action = 'grant' THEN
    IF FOUND AND v_membership.revoked_at IS NULL THEN
      RAISE EXCEPTION 'governed membership grant already active' USING ERRCODE = '23505';
    END IF;
    IF COALESCE(v_membership.policy_epoch, 0) <> p_expected_epoch THEN
      RAISE EXCEPTION 'governed membership grant epoch refused' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.brain_workspace_memberships
      (group_id, workspace_id, user_id, approved_by, approved_at, revoked_at, policy_epoch, approval_id)
    VALUES
      (v_group_id, v_workspace_id, v_approval.subject_user_id, v_approval.approver_id, now(), NULL, p_target_epoch, p_approval_id)
    ON CONFLICT (group_id, workspace_id, user_id) DO UPDATE
      SET approved_by = EXCLUDED.approved_by,
          approved_at = EXCLUDED.approved_at,
          revoked_at = NULL,
          policy_epoch = EXCLUDED.policy_epoch,
          approval_id = EXCLUDED.approval_id
      WHERE public.brain_workspace_memberships.revoked_at IS NOT NULL
        AND public.brain_workspace_memberships.policy_epoch = p_expected_epoch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'governed membership grant race refused' USING ERRCODE = '40001';
    END IF;
  ELSE
    IF NOT FOUND OR v_membership.revoked_at IS NOT NULL
       OR v_membership.policy_epoch <> p_expected_epoch THEN
      RAISE EXCEPTION 'governed membership revoke refused' USING ERRCODE = '42501';
    END IF;
    UPDATE public.brain_workspace_memberships AS membership
       SET approved_by = v_approval.approver_id,
           approval_id = p_approval_id,
           revoked_at = now(),
           policy_epoch = p_target_epoch
     WHERE membership.group_id = v_group_id
       AND membership.workspace_id = v_workspace_id
       AND membership.user_id = v_approval.subject_user_id
       AND membership.revoked_at IS NULL
       AND membership.policy_epoch = p_expected_epoch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'governed membership revoke race refused' USING ERRCODE = '40001';
    END IF;
  END IF;

  UPDATE public.brain_membership_approvals AS approval
     SET consumed_at = now()
   WHERE approval.approval_id = p_approval_id
     AND approval.consumed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'governed membership approval replay refused' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT membership.group_id, membership.workspace_id, membership.user_id,
           membership.approved_by, membership.approval_id, membership.policy_epoch,
           membership.revoked_at
      FROM public.brain_workspace_memberships AS membership
     WHERE membership.group_id = v_group_id
       AND membership.workspace_id = v_workspace_id
       AND membership.user_id = v_approval.subject_user_id;
END;
$$;

ALTER FUNCTION app.commit_brain_workspace_membership(UUID,TEXT,BIGINT,BIGINT,BIGINT) OWNER TO allura_migration;
REVOKE ALL ON FUNCTION app.commit_brain_workspace_membership(UUID,TEXT,BIGINT,BIGINT,BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.commit_brain_workspace_membership(UUID,TEXT,BIGINT,BIGINT,BIGINT) TO allura_app;

-- A lock on a durable receipt is required to make it single-use. The trusted
-- function owner receives this privilege; the application role remains denied.
GRANT SELECT, UPDATE ON public.brain_messaging_receipts TO allura_migration;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('079', now(), 'Epic 30 governed writer SQL and receipt-lock repairs')
ON CONFLICT (version) DO NOTHING;

COMMIT;
