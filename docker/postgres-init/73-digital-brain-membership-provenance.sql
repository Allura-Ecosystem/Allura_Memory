BEGIN;

-- Additive, production-candidate provenance ledger.  The application role is
-- intentionally read-only; a separately configured governed writer must own
-- grant/revoke transactions after policy approval.
CREATE TABLE IF NOT EXISTS brain_membership_approvals (
  approval_id UUID PRIMARY KEY,
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  subject_user_id TEXT NOT NULL CHECK (length(btrim(subject_user_id)) > 0),
  approver_id TEXT NOT NULL CHECK (length(btrim(approver_id)) > 0),
  approver_role TEXT NOT NULL CHECK (approver_role = 'workspace_membership_admin'),
  action TEXT NOT NULL CHECK (action IN ('grant','revoke')),
  provenance_ref TEXT NOT NULL CHECK (length(btrim(provenance_ref)) > 0),
  policy_epoch BIGINT NOT NULL CHECK (policy_epoch > 0),
  verified_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  UNIQUE (group_id, workspace_id, subject_user_id, action, provenance_ref),
  FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS brain_membership_receipts (
  receipt_id UUID PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('membership_grant','membership_revoke','membership_read_back')),
  decision TEXT NOT NULL CHECK (decision = 'allow_candidate'),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  subject_user_id TEXT NOT NULL,
  approval_id UUID,
  authority_epoch BIGINT NOT NULL CHECK (authority_epoch > 0),
  target_epoch BIGINT NOT NULL CHECK (target_epoch > 0),
  witness_hash TEXT NOT NULL CHECK (length(btrim(witness_hash)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (action, group_id, workspace_id, actor_id, subject_user_id, target_epoch, witness_hash)
);

-- Migration 072 deliberately created no provenance reference. Keep upgrades
-- additive: legacy rows remain unreadable to the governed lifecycle until an
-- explicit approval is attached by a separately approved migration.
ALTER TABLE brain_workspace_memberships
  ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES brain_membership_approvals(approval_id) ON DELETE RESTRICT;

ALTER TABLE brain_membership_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_membership_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE brain_membership_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_membership_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brain_membership_approval_scope ON brain_membership_approvals;
CREATE POLICY brain_membership_approval_scope ON brain_membership_approvals FOR SELECT TO allura_app
  USING (group_id = current_setting('app.current_group_id', true) AND workspace_id = current_setting('app.current_workspace_id', true));
DROP POLICY IF EXISTS brain_membership_receipt_scope ON brain_membership_receipts;
CREATE POLICY brain_membership_receipt_scope ON brain_membership_receipts FOR SELECT TO allura_app
  USING (group_id = current_setting('app.current_group_id', true) AND workspace_id = current_setting('app.current_workspace_id', true));
REVOKE INSERT, UPDATE, DELETE ON brain_membership_approvals, brain_membership_receipts FROM allura_app;
GRANT SELECT ON brain_membership_approvals, brain_membership_receipts TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('073', now(), 'Epic 30 governed workspace membership approval provenance and receipts')
ON CONFLICT (version) DO NOTHING;
COMMIT;
