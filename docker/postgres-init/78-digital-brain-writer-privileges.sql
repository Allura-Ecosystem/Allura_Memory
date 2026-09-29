BEGIN;

-- Epic 30 governed writers execute as allura_migration so forced RLS cannot
-- turn an approved application call into direct app-role table access. Grant
-- that function owner only the exact rows and mutations exercised inside the
-- SECURITY DEFINER boundaries; allura_app remains direct-DML denied.
GRANT SELECT ON public.memberships,
  public.brain_membership_approvals,
  public.brain_membership_receipts
TO allura_migration;

-- The governed writer functions take row locks and upsert the confirmed
-- membership record.  The migration role owns those SECURITY DEFINER
-- functions; application roles still have no direct table access.
GRANT SELECT, INSERT, UPDATE ON public.brain_workspace_memberships
TO allura_migration;

GRANT UPDATE (consumed_at) ON public.brain_membership_approvals
TO allura_migration;

GRANT INSERT ON public.brain_read_receipts TO allura_migration;

GRANT SELECT ON public.brain_messaging_approvals,
  public.brain_messaging_receipts,
  public.brain_messaging_receipt_consumptions,
  public.brain_channel_invitations,
  public.brain_project_contacts
TO allura_migration;

GRANT INSERT ON public.brain_messaging_receipts,
  public.brain_messaging_receipt_consumptions,
  public.brain_channel_invitations,
  public.brain_restricted_messages
TO allura_migration;
GRANT UPDATE (owner_approval_id, membership_admin_approval_id, policy_epoch, revoked_at)
  ON public.brain_channel_invitations TO allura_migration;
GRANT UPDATE (consumed_at) ON public.brain_messaging_approvals TO allura_migration;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('078', now(), 'Epic 30 governed writer function-owner privileges')
ON CONFLICT (version) DO NOTHING;

COMMIT;
