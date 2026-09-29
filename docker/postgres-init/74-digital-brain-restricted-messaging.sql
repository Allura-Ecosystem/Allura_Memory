BEGIN;

-- Provider-neutral durable messaging boundary. Delivery is deliberately not
-- represented here; a separately approved provider adapter must consume the
-- committed message after the receipt gate succeeds.
CREATE TABLE IF NOT EXISTS brain_project_contacts (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  contact_role TEXT NOT NULL CHECK (contact_role IN ('project_owner','project_manager')),
  policy_epoch BIGINT NOT NULL CHECK (policy_epoch > 0),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (group_id, workspace_id, project_id, principal_id),
  FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS brain_messaging_approvals (
  approval_id UUID PRIMARY KEY,
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  approver_id TEXT NOT NULL,
  approver_role TEXT NOT NULL CHECK (approver_role IN ('project_owner','workspace_membership_admin')),
  provenance_ref TEXT NOT NULL CHECK (length(btrim(provenance_ref)) > 0),
  verification_source TEXT NOT NULL CHECK (verification_source = 'trusted_approval_adapter'),
  policy_epoch BIGINT NOT NULL CHECK (policy_epoch > 0),
  verified_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (group_id, workspace_id, project_id, channel_id, invitee_id, approver_role, provenance_ref)
);

CREATE TABLE IF NOT EXISTS brain_channel_invitations (
  invitation_id UUID PRIMARY KEY,
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  owner_approval_id UUID NOT NULL REFERENCES brain_messaging_approvals(approval_id) ON DELETE RESTRICT,
  membership_admin_approval_id UUID NOT NULL REFERENCES brain_messaging_approvals(approval_id) ON DELETE RESTRICT,
  policy_epoch BIGINT NOT NULL CHECK (policy_epoch > 0),
  revoked_at TIMESTAMPTZ,
  UNIQUE (group_id, workspace_id, project_id, channel_id, invitee_id),
  FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id) ON DELETE RESTRICT,
  CHECK (owner_approval_id <> membership_admin_approval_id)
);

CREATE TABLE IF NOT EXISTS brain_restricted_messages (
  message_id UUID PRIMARY KEY,
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  channel_id TEXT,
  sender_id TEXT NOT NULL,
  recipient_id TEXT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((channel_id IS NULL) <> (recipient_id IS NULL)),
  FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS brain_messaging_receipts (
  receipt_id UUID PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('discover_contact','invite_channel','send_message','read_back')),
  decision TEXT NOT NULL CHECK (decision = 'allow'),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  policy_epoch BIGINT NOT NULL CHECK (policy_epoch > 0),
  witness_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (action, group_id, workspace_id, actor_id, resource_id, policy_epoch, witness_hash)
);

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['brain_project_contacts','brain_messaging_approvals','brain_channel_invitations','brain_restricted_messages','brain_messaging_receipts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;
DROP POLICY IF EXISTS brain_project_contact_scope ON brain_project_contacts;
CREATE POLICY brain_project_contact_scope ON brain_project_contacts FOR SELECT TO allura_app
  USING (group_id=current_setting('app.current_group_id',true)
    AND workspace_id=current_setting('app.current_workspace_id',true)
    AND revoked_at IS NULL
    AND public.brain_has_current_workspace_membership());
DROP POLICY IF EXISTS brain_messaging_approval_scope ON brain_messaging_approvals;
CREATE POLICY brain_messaging_approval_scope ON brain_messaging_approvals FOR SELECT TO allura_app
  USING (group_id=current_setting('app.current_group_id',true)
    AND workspace_id=current_setting('app.current_workspace_id',true)
    AND public.brain_has_current_workspace_membership()
    AND (invitee_id=current_setting('app.current_principal',true)
      OR public.brain_has_current_workspace_admin()));
DROP POLICY IF EXISTS brain_channel_invitation_scope ON brain_channel_invitations;
CREATE POLICY brain_channel_invitation_scope ON brain_channel_invitations FOR SELECT TO allura_app
  USING (group_id=current_setting('app.current_group_id',true)
    AND workspace_id=current_setting('app.current_workspace_id',true)
    AND public.brain_has_current_workspace_membership()
    AND (invitee_id=current_setting('app.current_principal',true)
      OR public.brain_has_current_workspace_admin()));
DROP POLICY IF EXISTS brain_restricted_message_scope ON brain_restricted_messages;
CREATE POLICY brain_restricted_message_scope ON brain_restricted_messages FOR SELECT TO allura_app
  USING (group_id=current_setting('app.current_group_id',true)
    AND workspace_id=current_setting('app.current_workspace_id',true)
    AND public.brain_has_current_workspace_membership()
    AND (sender_id=current_setting('app.current_principal',true)
      OR recipient_id=current_setting('app.current_principal',true)));
DROP POLICY IF EXISTS brain_messaging_receipt_scope ON brain_messaging_receipts;
CREATE POLICY brain_messaging_receipt_scope ON brain_messaging_receipts FOR SELECT TO allura_app
  USING (group_id=current_setting('app.current_group_id',true)
    AND workspace_id=current_setting('app.current_workspace_id',true)
    AND public.brain_has_current_workspace_membership()
    AND actor_id=current_setting('app.current_principal',true));
REVOKE INSERT, UPDATE, DELETE ON brain_project_contacts, brain_messaging_approvals, brain_channel_invitations, brain_restricted_messages, brain_messaging_receipts FROM allura_app;
GRANT SELECT ON brain_project_contacts, brain_messaging_approvals, brain_channel_invitations, brain_restricted_messages, brain_messaging_receipts TO allura_app;
INSERT INTO schema_versions(version, applied_at, description) VALUES ('074', now(), 'Epic 30 provider-neutral restricted messaging durable boundary') ON CONFLICT(version) DO NOTHING;
COMMIT;
