BEGIN;

-- Epic 30 durable messaging writers. Every candidate receipt is content-free;
-- all mutation authority remains in narrowly scoped SECURITY DEFINER
-- functions, with no direct application-role DML grants.
ALTER TABLE brain_messaging_approvals
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
CREATE TABLE brain_messaging_receipt_consumptions (
  receipt_id UUID PRIMARY KEY REFERENCES brain_messaging_receipts(receipt_id) ON DELETE RESTRICT,
  consumed_by TEXT NOT NULL CHECK (length(btrim(consumed_by)) > 0),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE brain_messaging_receipt_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_messaging_receipt_consumptions FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS brain_messaging_approvals_pending_idx
  ON brain_messaging_approvals (group_id, workspace_id, approval_id)
  WHERE revoked_at IS NULL AND consumed_at IS NULL;
CREATE OR REPLACE FUNCTION public.prevent_brain_messaging_receipt_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Brain messaging receipts are immutable' USING ERRCODE = '42501';
END;
$$;
ALTER FUNCTION public.prevent_brain_messaging_receipt_mutation() OWNER TO allura_migration;
REVOKE ALL ON FUNCTION public.prevent_brain_messaging_receipt_mutation() FROM PUBLIC;
CREATE TRIGGER brain_messaging_receipts_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON brain_messaging_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_brain_messaging_receipt_mutation();

CREATE OR REPLACE FUNCTION app.record_brain_messaging_receipt(
  p_receipt_id UUID,
  p_action TEXT,
  p_resource_id TEXT,
  p_policy_epoch BIGINT,
  p_witness_hash TEXT
) RETURNS TABLE(receipt_id UUID, witness_hash TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_group_id TEXT := current_setting('app.current_group_id', true);
  v_workspace_id TEXT := current_setting('app.current_workspace_id', true);
  v_principal_id TEXT := current_setting('app.current_principal', true);
  v_epoch BIGINT;
BEGIN
  IF v_group_id IS NULL OR length(btrim(v_group_id)) = 0
     OR v_workspace_id IS NULL OR length(btrim(v_workspace_id)) = 0
     OR v_principal_id IS NULL OR length(btrim(v_principal_id)) = 0
     OR p_action NOT IN ('discover_contact', 'invite_channel', 'send_message', 'read_back')
     OR p_resource_id IS NULL OR length(btrim(p_resource_id)) = 0 OR length(p_resource_id) > 1000
     OR p_policy_epoch <= 0 OR p_witness_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'governed messaging receipt refused' USING ERRCODE = '42501';
  END IF;

  SELECT workspace_membership.policy_epoch INTO v_epoch
    FROM public.memberships AS tenant_membership
    JOIN public.brain_workspace_memberships AS workspace_membership
      ON workspace_membership.group_id = tenant_membership.group_id
     AND workspace_membership.user_id = tenant_membership.user_id
    JOIN public.brain_membership_approvals AS membership_approval
      ON membership_approval.approval_id = workspace_membership.approval_id
     AND membership_approval.group_id = workspace_membership.group_id
     AND membership_approval.workspace_id = workspace_membership.workspace_id
     AND membership_approval.subject_user_id = workspace_membership.user_id
     AND membership_approval.policy_epoch = workspace_membership.policy_epoch
   WHERE tenant_membership.group_id = v_group_id
     AND tenant_membership.user_id = v_principal_id
     AND tenant_membership.removed_at IS NULL
     AND workspace_membership.workspace_id = v_workspace_id
     AND workspace_membership.revoked_at IS NULL
     AND membership_approval.action = 'grant'
     AND membership_approval.verified_at IS NOT NULL
     AND membership_approval.revoked_at IS NULL
     AND membership_approval.consumed_at IS NOT NULL
   FOR SHARE OF workspace_membership;
  IF NOT FOUND OR v_epoch <> p_policy_epoch THEN
    RAISE EXCEPTION 'governed messaging receipt authority refused' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.brain_messaging_receipts
    (receipt_id, action, decision, group_id, workspace_id, actor_id, resource_id, policy_epoch, witness_hash)
  VALUES
    (p_receipt_id, p_action, 'allow', v_group_id, v_workspace_id, v_principal_id, p_resource_id, p_policy_epoch, p_witness_hash);
  RETURN QUERY SELECT p_receipt_id, p_witness_hash;
END;
$$;

CREATE OR REPLACE FUNCTION app.commit_brain_channel_invitation(
  p_owner_approval_id UUID,
  p_membership_admin_approval_id UUID,
  p_project_id TEXT,
  p_channel_id TEXT,
  p_invitee_id TEXT,
  p_policy_epoch BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_group_id TEXT := current_setting('app.current_group_id', true);
  v_workspace_id TEXT := current_setting('app.current_workspace_id', true);
  v_principal_id TEXT := current_setting('app.current_principal', true);
  v_owner public.brain_messaging_approvals%ROWTYPE;
  v_admin public.brain_messaging_approvals%ROWTYPE;
  v_receipt_id UUID;
BEGIN
  IF v_group_id IS NULL OR length(btrim(v_group_id)) = 0
     OR v_workspace_id IS NULL OR length(btrim(v_workspace_id)) = 0
     OR v_principal_id IS NULL OR length(btrim(v_principal_id)) = 0
     OR p_owner_approval_id = p_membership_admin_approval_id
     OR p_project_id IS NULL OR length(btrim(p_project_id)) = 0
     OR p_channel_id IS NULL OR length(btrim(p_channel_id)) = 0
     OR p_invitee_id IS NULL OR length(btrim(p_invitee_id)) = 0
     OR p_policy_epoch <= 0 THEN
    RAISE EXCEPTION 'governed invitation refused' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS tenant_membership
    JOIN public.brain_workspace_memberships AS workspace_membership
      ON workspace_membership.group_id = tenant_membership.group_id AND workspace_membership.user_id = tenant_membership.user_id
    JOIN public.brain_membership_approvals AS membership_approval
      ON membership_approval.approval_id = workspace_membership.approval_id
     AND membership_approval.policy_epoch = workspace_membership.policy_epoch
   WHERE tenant_membership.group_id = v_group_id AND tenant_membership.user_id = v_principal_id
     AND tenant_membership.role = 'admin' AND tenant_membership.removed_at IS NULL
     AND workspace_membership.workspace_id = v_workspace_id AND workspace_membership.revoked_at IS NULL
     AND workspace_membership.policy_epoch = p_policy_epoch
     AND membership_approval.action = 'grant' AND membership_approval.verified_at IS NOT NULL
     AND membership_approval.revoked_at IS NULL AND membership_approval.consumed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'governed invitation actor refused' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_owner FROM public.brain_messaging_approvals
   WHERE approval_id = p_owner_approval_id AND group_id = v_group_id AND workspace_id = v_workspace_id
     AND project_id = p_project_id AND channel_id = p_channel_id AND invitee_id = p_invitee_id
     AND approver_role = 'project_owner' AND verification_source = 'trusted_approval_adapter'
     AND policy_epoch = p_policy_epoch AND verified_at IS NOT NULL AND revoked_at IS NULL AND consumed_at IS NULL
   FOR UPDATE;
  SELECT * INTO v_admin FROM public.brain_messaging_approvals
   WHERE approval_id = p_membership_admin_approval_id AND group_id = v_group_id AND workspace_id = v_workspace_id
     AND project_id = p_project_id AND channel_id = p_channel_id AND invitee_id = p_invitee_id
     AND approver_role = 'workspace_membership_admin' AND verification_source = 'trusted_approval_adapter'
     AND policy_epoch = p_policy_epoch AND verified_at IS NOT NULL AND revoked_at IS NULL AND consumed_at IS NULL
   FOR UPDATE;
  IF v_owner.approval_id IS NULL OR v_admin.approval_id IS NULL OR v_owner.approver_id = v_admin.approver_id THEN
    RAISE EXCEPTION 'governed invitation approvals refused' USING ERRCODE = '42501';
  END IF;

  SELECT receipt_id INTO v_receipt_id FROM public.brain_messaging_receipts
   WHERE action = 'invite_channel' AND decision = 'allow' AND group_id = v_group_id
     AND workspace_id = v_workspace_id AND actor_id = v_principal_id
     AND resource_id = p_project_id || ':' || p_channel_id || ':' || p_invitee_id
     AND policy_epoch = p_policy_epoch
     AND NOT EXISTS (SELECT 1 FROM public.brain_messaging_receipt_consumptions AS consumption WHERE consumption.receipt_id = brain_messaging_receipts.receipt_id)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'governed invitation receipt refused' USING ERRCODE = '42501'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS tenant_membership
    JOIN public.brain_workspace_memberships AS workspace_membership
      ON workspace_membership.group_id = tenant_membership.group_id AND workspace_membership.user_id = tenant_membership.user_id
   WHERE tenant_membership.group_id = v_group_id AND tenant_membership.user_id = p_invitee_id
     AND tenant_membership.removed_at IS NULL AND workspace_membership.workspace_id = v_workspace_id
     AND workspace_membership.revoked_at IS NULL AND workspace_membership.approval_id IS NOT NULL
  ) THEN RAISE EXCEPTION 'governed invitation invitee refused' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.brain_channel_invitations
    (invitation_id, group_id, workspace_id, project_id, channel_id, invitee_id, owner_approval_id, membership_admin_approval_id, policy_epoch, revoked_at)
  VALUES (gen_random_uuid(), v_group_id, v_workspace_id, p_project_id, p_channel_id, p_invitee_id, p_owner_approval_id, p_membership_admin_approval_id, p_policy_epoch, NULL)
  ON CONFLICT (group_id, workspace_id, project_id, channel_id, invitee_id) DO UPDATE
    SET owner_approval_id = EXCLUDED.owner_approval_id, membership_admin_approval_id = EXCLUDED.membership_admin_approval_id,
        policy_epoch = EXCLUDED.policy_epoch, revoked_at = NULL
    WHERE public.brain_channel_invitations.revoked_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'governed invitation conflict refused' USING ERRCODE = '23505'; END IF;

  UPDATE public.brain_messaging_approvals SET consumed_at = now()
   WHERE approval_id IN (p_owner_approval_id, p_membership_admin_approval_id) AND consumed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'governed invitation approval replay refused' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.brain_messaging_receipt_consumptions (receipt_id, consumed_by) VALUES (v_receipt_id, v_principal_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION app.commit_brain_restricted_message(
  p_message_id UUID,
  p_project_id TEXT,
  p_channel_id TEXT,
  p_recipient_id TEXT,
  p_body TEXT,
  p_policy_epoch BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_group_id TEXT := current_setting('app.current_group_id', true);
  v_workspace_id TEXT := current_setting('app.current_workspace_id', true);
  v_principal_id TEXT := current_setting('app.current_principal', true);
  v_receipt_id UUID;
BEGIN
  IF v_group_id IS NULL OR length(btrim(v_group_id)) = 0
     OR v_workspace_id IS NULL OR length(btrim(v_workspace_id)) = 0
     OR v_principal_id IS NULL OR length(btrim(v_principal_id)) = 0
     OR p_project_id IS NULL OR length(btrim(p_project_id)) = 0
     OR p_body IS NULL OR length(btrim(p_body)) = 0 OR length(p_body) > 4000
     OR p_policy_epoch <= 0 OR ((p_channel_id IS NULL) = (p_recipient_id IS NULL)) THEN
    RAISE EXCEPTION 'governed message refused' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS tenant_membership
    JOIN public.brain_workspace_memberships AS workspace_membership
      ON workspace_membership.group_id = tenant_membership.group_id AND workspace_membership.user_id = tenant_membership.user_id
    JOIN public.brain_membership_approvals AS membership_approval
      ON membership_approval.approval_id = workspace_membership.approval_id
     AND membership_approval.policy_epoch = workspace_membership.policy_epoch
   WHERE tenant_membership.group_id = v_group_id AND tenant_membership.user_id = v_principal_id
     AND tenant_membership.removed_at IS NULL AND workspace_membership.workspace_id = v_workspace_id
     AND workspace_membership.revoked_at IS NULL AND workspace_membership.policy_epoch = p_policy_epoch
     AND membership_approval.action = 'grant' AND membership_approval.verified_at IS NOT NULL
     AND membership_approval.revoked_at IS NULL AND membership_approval.consumed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'governed message actor refused' USING ERRCODE = '42501'; END IF;

  SELECT receipt_id INTO v_receipt_id FROM public.brain_messaging_receipts
   WHERE action = 'send_message' AND decision = 'allow' AND group_id = v_group_id
     AND workspace_id = v_workspace_id AND actor_id = v_principal_id AND resource_id = p_message_id::text
     AND policy_epoch = p_policy_epoch
     AND NOT EXISTS (SELECT 1 FROM public.brain_messaging_receipt_consumptions AS consumption WHERE consumption.receipt_id = brain_messaging_receipts.receipt_id)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'governed message receipt refused' USING ERRCODE = '42501'; END IF;

  IF p_channel_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.brain_channel_invitations AS invitation
      JOIN public.brain_messaging_approvals AS owner_approval ON owner_approval.approval_id = invitation.owner_approval_id
      JOIN public.brain_messaging_approvals AS admin_approval ON admin_approval.approval_id = invitation.membership_admin_approval_id
     WHERE invitation.group_id = v_group_id AND invitation.workspace_id = v_workspace_id
       AND invitation.project_id = p_project_id AND invitation.channel_id = p_channel_id
       AND invitation.invitee_id = v_principal_id AND invitation.policy_epoch = p_policy_epoch
       AND invitation.revoked_at IS NULL AND owner_approval.revoked_at IS NULL AND admin_approval.revoked_at IS NULL
       AND owner_approval.consumed_at IS NOT NULL AND admin_approval.consumed_at IS NOT NULL
    ) THEN RAISE EXCEPTION 'governed message invitation refused' USING ERRCODE = '42501'; END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.brain_project_contacts
     WHERE group_id = v_group_id AND workspace_id = v_workspace_id AND project_id = p_project_id
       AND principal_id = p_recipient_id AND contact_role IN ('project_owner', 'project_manager')
       AND policy_epoch = p_policy_epoch AND revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'governed message recipient refused' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.brain_restricted_messages
    (message_id, group_id, workspace_id, project_id, channel_id, sender_id, recipient_id, body)
  VALUES (p_message_id, v_group_id, v_workspace_id, p_project_id, p_channel_id, v_principal_id, p_recipient_id, p_body);
  INSERT INTO public.brain_messaging_receipt_consumptions (receipt_id, consumed_by) VALUES (v_receipt_id, v_principal_id);
  RETURN true;
END;
$$;

ALTER FUNCTION app.record_brain_messaging_receipt(UUID,TEXT,TEXT,BIGINT,TEXT) OWNER TO allura_migration;
ALTER FUNCTION app.commit_brain_channel_invitation(UUID,UUID,TEXT,TEXT,TEXT,BIGINT) OWNER TO allura_migration;
ALTER FUNCTION app.commit_brain_restricted_message(UUID,TEXT,TEXT,TEXT,TEXT,BIGINT) OWNER TO allura_migration;
REVOKE ALL ON FUNCTION app.record_brain_messaging_receipt(UUID,TEXT,TEXT,BIGINT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.commit_brain_channel_invitation(UUID,UUID,TEXT,TEXT,TEXT,BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.commit_brain_restricted_message(UUID,TEXT,TEXT,TEXT,TEXT,BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_brain_messaging_receipt(UUID,TEXT,TEXT,BIGINT,TEXT) TO allura_app;
GRANT EXECUTE ON FUNCTION app.commit_brain_channel_invitation(UUID,UUID,TEXT,TEXT,TEXT,BIGINT) TO allura_app;
GRANT EXECUTE ON FUNCTION app.commit_brain_restricted_message(UUID,TEXT,TEXT,TEXT,TEXT,BIGINT) TO allura_app;
REVOKE INSERT, UPDATE, DELETE ON brain_messaging_approvals, brain_messaging_receipts, brain_messaging_receipt_consumptions, brain_channel_invitations, brain_restricted_messages FROM allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('077', now(), 'Epic 30 governed restricted messaging receipt and commit writers')
ON CONFLICT (version) DO NOTHING;

COMMIT;
