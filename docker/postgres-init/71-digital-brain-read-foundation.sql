BEGIN;

-- Epic 30 local-test foundation. Additive only: no historical rows are rewritten.
-- Production rollout remains gated; this migration is exercised only by disposable
-- synthetic databases until design, security review, and release approval pass.

CREATE TABLE IF NOT EXISTS brain_department_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  department_id TEXT NOT NULL CHECK (length(btrim(department_id)) > 0),
  user_id TEXT NOT NULL CHECK (length(btrim(user_id)) > 0),
  approved_by TEXT NOT NULL CHECK (length(btrim(approved_by)) > 0),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT brain_department_memberships_workspace_fkey
    FOREIGN KEY (group_id, workspace_id)
    REFERENCES workspaces(group_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT brain_department_memberships_identity_key
    UNIQUE (group_id, workspace_id, department_id, user_id)
);

CREATE TABLE IF NOT EXISTS brain_documents (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  owner_id TEXT NOT NULL CHECK (length(btrim(owner_id)) > 0),
  department_id TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'department')),
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brain_documents_workspace_fkey
    FOREIGN KEY (group_id, workspace_id)
    REFERENCES workspaces(group_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT brain_documents_visibility_scope_check CHECK (
    (visibility = 'private' AND department_id IS NULL)
    OR (visibility = 'department' AND department_id IS NOT NULL AND length(btrim(department_id)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS brain_documents_scope_updated_idx
  ON brain_documents (group_id, workspace_id, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS brain_department_memberships_active_idx
  ON brain_department_memberships (group_id, workspace_id, user_id, department_id)
  WHERE revoked_at IS NULL;

ALTER TABLE brain_department_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_department_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE brain_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_documents FORCE ROW LEVEL SECURITY;

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
    AND (
      (
        brain_documents.visibility = 'private'
        AND brain_documents.owner_id = current_setting('app.current_principal', true)
      )
      OR (
        brain_documents.visibility = 'department'
        AND EXISTS (
          SELECT 1
          FROM brain_department_memberships AS membership
          WHERE membership.group_id = brain_documents.group_id
            AND membership.workspace_id = brain_documents.workspace_id
            AND membership.department_id = brain_documents.department_id
            AND membership.user_id = current_setting('app.current_principal', true)
            AND membership.revoked_at IS NULL
        )
      )
    )
  );

GRANT SELECT ON brain_documents, brain_department_memberships TO allura_app;
REVOKE INSERT, UPDATE, DELETE ON brain_documents, brain_department_memberships FROM allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES (
  '071',
  now(),
  'Epic 30 synthetic local-test digital Brain read foundation with owner/private and approved-department RLS'
) ON CONFLICT (version) DO NOTHING;

COMMIT;
