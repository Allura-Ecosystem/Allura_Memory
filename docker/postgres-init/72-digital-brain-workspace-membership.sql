BEGIN;

-- Epic 30 development candidate. The restricted reader must have an independent,
-- current workspace membership in addition to tenant and department authority.
-- No existing tenant membership is inferred or backfilled into this table.
CREATE TABLE IF NOT EXISTS brain_workspace_memberships (
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL CHECK (length(btrim(user_id)) > 0),
  approved_by TEXT NOT NULL CHECK (length(btrim(approved_by)) > 0),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  policy_epoch BIGINT NOT NULL DEFAULT 1 CHECK (policy_epoch > 0),
  PRIMARY KEY (group_id, workspace_id, user_id),
  CONSTRAINT brain_workspace_memberships_workspace_fkey
    FOREIGN KEY (group_id, workspace_id)
    REFERENCES workspaces(group_id, workspace_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS brain_workspace_memberships_active_idx
  ON brain_workspace_memberships (group_id, workspace_id, user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE brain_workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_workspace_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brain_workspace_membership_read_policy ON brain_workspace_memberships;
CREATE POLICY brain_workspace_membership_read_policy ON brain_workspace_memberships
  FOR SELECT TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
    AND user_id = current_setting('app.current_principal', true)
    AND revoked_at IS NULL
    AND EXISTS (
      SELECT 1 FROM memberships AS tenant_membership
      WHERE tenant_membership.group_id = brain_workspace_memberships.group_id
        AND tenant_membership.user_id = current_setting('app.current_principal', true)
        AND tenant_membership.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS brain_department_membership_read_policy ON brain_department_memberships;
CREATE POLICY brain_department_membership_read_policy ON brain_department_memberships
  FOR SELECT TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
    AND user_id = current_setting('app.current_principal', true)
    AND revoked_at IS NULL
    AND EXISTS (
      SELECT 1 FROM memberships AS tenant_membership
      WHERE tenant_membership.group_id = brain_department_memberships.group_id
        AND tenant_membership.user_id = current_setting('app.current_principal', true)
        AND tenant_membership.removed_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM brain_workspace_memberships AS workspace_membership
      WHERE workspace_membership.group_id = brain_department_memberships.group_id
        AND workspace_membership.workspace_id = brain_department_memberships.workspace_id
        AND workspace_membership.user_id = current_setting('app.current_principal', true)
        AND workspace_membership.revoked_at IS NULL
    )
  );

DROP POLICY IF EXISTS brain_document_read_policy ON brain_documents;
CREATE POLICY brain_document_read_policy ON brain_documents
  FOR SELECT TO allura_app
  USING (
    brain_documents.group_id = current_setting('app.current_group_id', true)
    AND brain_documents.workspace_id = current_setting('app.current_workspace_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships AS tenant_membership
      WHERE tenant_membership.group_id = brain_documents.group_id
        AND tenant_membership.user_id = current_setting('app.current_principal', true)
        AND tenant_membership.removed_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM brain_workspace_memberships AS workspace_membership
      WHERE workspace_membership.group_id = brain_documents.group_id
        AND workspace_membership.workspace_id = brain_documents.workspace_id
        AND workspace_membership.user_id = current_setting('app.current_principal', true)
        AND workspace_membership.revoked_at IS NULL
    )
    AND (
      (brain_documents.visibility = 'private'
       AND brain_documents.owner_id = current_setting('app.current_principal', true))
      OR
      (brain_documents.visibility = 'department'
       AND EXISTS (
         SELECT 1 FROM brain_department_memberships AS department_membership
         WHERE department_membership.group_id = brain_documents.group_id
           AND department_membership.workspace_id = brain_documents.workspace_id
           AND department_membership.department_id = brain_documents.department_id
           AND department_membership.user_id = current_setting('app.current_principal', true)
           AND department_membership.revoked_at IS NULL
       ))
    )
  );

GRANT SELECT ON brain_workspace_memberships TO allura_app;
REVOKE INSERT, UPDATE, DELETE ON brain_workspace_memberships FROM allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('072', now(), 'Epic 30 independent workspace membership for restricted Brain reads')
ON CONFLICT (version) DO NOTHING;

COMMIT;
