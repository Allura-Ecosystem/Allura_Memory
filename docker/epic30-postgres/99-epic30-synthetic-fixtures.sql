-- EPIC 30 SYNTHETIC TEST DATA ONLY. No real people, customers, or Brain records.
-- Apply after ordered docker/postgres-init migrations in an isolated disposable database.
-- Re-applying is authority-resetting: tenant/workspace/department revocations are restored.
-- Only the newly created, receipt-owned local harness database may be replayed.

BEGIN;

DO $$
BEGIN
  IF current_database() !~ '^allura_epic30_read_[a-f0-9]{32}$' THEN
    RAISE EXCEPTION 'Epic 30 fixture requires a newly owned synthetic database';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM epic30_local.ownership
    WHERE database_name = current_database()
      AND database_name = 'allura_epic30_read_' || run_id
      AND provisioner = current_user
  ) THEN
    RAISE EXCEPTION 'Epic 30 fixture ownership receipt missing';
  END IF;
END
$$;

INSERT INTO workspaces (workspace_id, group_id, name)
VALUES
  ('epic30-local-workspace', 'allura-epic30-local', '[SYNTHETIC] Epic 30 local workspace'),
  ('epic30-other-workspace', 'allura-epic30-local', '[SYNTHETIC] Same-tenant boundary workspace'),
  ('epic30-cross-tenant-workspace', 'allura-epic30-sentinel', '[SYNTHETIC] Cross-tenant boundary workspace')
ON CONFLICT (workspace_id) DO UPDATE
SET name = EXCLUDED.name
WHERE workspaces.group_id = EXCLUDED.group_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('epic30-local-workspace', 'allura-epic30-local'),
      ('epic30-other-workspace', 'allura-epic30-local'),
      ('epic30-cross-tenant-workspace', 'allura-epic30-sentinel')
    ) AS expected(workspace_id, group_id)
    LEFT JOIN workspaces AS actual USING (workspace_id)
    WHERE actual.workspace_id IS NULL OR actual.group_id IS DISTINCT FROM expected.group_id
  ) THEN
    RAISE EXCEPTION 'Epic 30 synthetic fixture workspace already belongs to another tenant';
  END IF;
END
$$;

INSERT INTO memberships (
  group_id, user_id, email, role, created_at, updated_at, removed_at
)
VALUES
  ('allura-epic30-local', 'owner-user', 'owner@example.invalid', 'viewer', '2026-09-15T00:00:00Z', '2026-09-17T00:00:00Z', NULL),
  ('allura-epic30-local', 'other-user', 'other@example.invalid', 'viewer', '2026-09-15T00:00:00Z', '2026-09-17T00:00:00Z', NULL),
  ('allura-epic30-local', 'admin-user', 'admin@example.invalid', 'admin', '2026-09-15T00:00:00Z', '2026-09-17T00:00:00Z', NULL),
  ('allura-epic30-local', 'department-user', 'department@example.invalid', 'viewer', '2026-09-15T00:00:00Z', '2026-09-17T00:00:00Z', NULL),
  ('allura-epic30-local', 'finance-user', 'finance@example.invalid', 'viewer', '2026-09-15T00:00:00Z', '2026-09-17T00:00:00Z', NULL),
  ('allura-epic30-local', 'contractor-user', 'contractor@example.invalid', 'viewer', '2026-09-15T00:00:00Z', '2026-09-17T00:00:00Z', NULL),
  ('allura-epic30-local', 'revoked-user', 'revoked@example.invalid', 'viewer', '2026-09-15T00:00:00Z', '2026-09-17T00:00:00Z', '2026-09-16T00:00:00Z'),
  ('allura-epic30-local', 'workspace-sentinel-owner', 'workspace-sentinel@example.invalid', 'viewer', '2026-09-15T00:00:00Z', '2026-09-17T00:00:00Z', NULL),
  ('allura-epic30-sentinel', 'cross-tenant-sentinel-owner', 'tenant-sentinel@example.invalid', 'viewer', '2026-09-15T00:00:00Z', '2026-09-17T00:00:00Z', NULL)
ON CONFLICT (group_id, user_id) DO UPDATE
SET email = EXCLUDED.email,
    role = EXCLUDED.role,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at,
    removed_at = EXCLUDED.removed_at;

INSERT INTO brain_workspace_memberships (
  group_id, workspace_id, user_id, approved_by, approved_at, revoked_at, policy_epoch
)
VALUES
  ('allura-epic30-local', 'epic30-local-workspace', 'owner-user', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL, 1),
  ('allura-epic30-local', 'epic30-local-workspace', 'other-user', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL, 1),
  ('allura-epic30-local', 'epic30-local-workspace', 'admin-user', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL, 1),
  ('allura-epic30-local', 'epic30-local-workspace', 'department-user', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL, 1),
  ('allura-epic30-local', 'epic30-local-workspace', 'finance-user', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL, 1),
  ('allura-epic30-local', 'epic30-local-workspace', 'contractor-user', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL, 1),
  ('allura-epic30-local', 'epic30-local-workspace', 'revoked-user', 'synthetic-fixture-owner', '2026-09-14T00:00:00Z', '2026-09-16T00:00:00Z', 2),
  ('allura-epic30-local', 'epic30-other-workspace', 'workspace-sentinel-owner', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL, 1),
  ('allura-epic30-sentinel', 'epic30-cross-tenant-workspace', 'cross-tenant-sentinel-owner', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL, 1)
ON CONFLICT (group_id, workspace_id, user_id) DO UPDATE
SET approved_by = EXCLUDED.approved_by,
    approved_at = EXCLUDED.approved_at,
    revoked_at = EXCLUDED.revoked_at,
    policy_epoch = EXCLUDED.policy_epoch;

INSERT INTO brain_department_memberships (
  group_id, workspace_id, department_id, user_id, approved_by, approved_at, revoked_at
)
VALUES
  (
    'allura-epic30-local', 'epic30-local-workspace', 'operations',
    'owner-user', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL
  ),
  (
    'allura-epic30-local', 'epic30-local-workspace', 'operations',
    'department-user', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL
  ),
  (
    'allura-epic30-local', 'epic30-local-workspace', 'finance',
    'finance-user', 'synthetic-fixture-owner', '2026-09-15T00:00:00Z', NULL
  ),
  (
    'allura-epic30-local', 'epic30-local-workspace', 'operations',
    'revoked-user', 'synthetic-fixture-owner', '2026-09-14T00:00:00Z', '2026-09-16T00:00:00Z'
  )
ON CONFLICT (group_id, workspace_id, department_id, user_id) DO UPDATE
SET approved_by = EXCLUDED.approved_by,
    approved_at = EXCLUDED.approved_at,
    revoked_at = EXCLUDED.revoked_at;

INSERT INTO brain_documents (
  id, group_id, workspace_id, owner_id, department_id, visibility,
  title, content, created_at, updated_at
)
VALUES
  (
    'epic30-owner-private', 'allura-epic30-local', 'epic30-local-workspace',
    'owner-user', NULL, 'private', '[SYNTHETIC] Owner shipment note',
    'SYNTHETIC TEST DATA: owner-user private note about checking sample shipment labels.',
    '2026-09-15T08:00:00Z', '2026-09-17T08:00:00Z'
  ),
  (
    'epic30-owner-private-planning', 'allura-epic30-local', 'epic30-local-workspace',
    'owner-user', NULL, 'private', '[SYNTHETIC] Owner planning notes',
    'SYNTHETIC TEST DATA: owner-user private planning list for a fictional weekly review.',
    '2026-09-15T08:05:00Z', '2026-09-17T08:05:00Z'
  ),
  (
    'epic30-other-private', 'allura-epic30-local', 'epic30-local-workspace',
    'other-user', NULL, 'private', '[SYNTHETIC] Other user private note',
    'SYNTHETIC TEST DATA: other-user private note that admin-user and owner-user must not read.',
    '2026-09-15T08:10:00Z', '2026-09-17T08:10:00Z'
  ),
  (
    'epic30-other-private-reminder', 'allura-epic30-local', 'epic30-local-workspace',
    'other-user', NULL, 'private', '[SYNTHETIC] Other user reminder',
    'SYNTHETIC TEST DATA: other-user private reminder for a fictional appointment.',
    '2026-09-15T08:15:00Z', '2026-09-17T08:15:00Z'
  ),
  (
    'epic30-operations-runbook', 'allura-epic30-local', 'epic30-local-workspace',
    'department-curator', 'operations', 'department', '[SYNTHETIC] Operations runbook',
    'SYNTHETIC TEST DATA: operations members verify the fictional handoff log before closing a shift.',
    '2026-09-15T09:00:00Z', '2026-09-17T09:00:00Z'
  ),
  (
    'epic30-operations-task-queue', 'allura-epic30-local', 'epic30-local-workspace',
    'department-curator', 'operations', 'department', '[SYNTHETIC] Operations task queue',
    'SYNTHETIC TEST DATA: review sample receiving checklist; confirm sample cooler reading; archive test receipt.',
    '2026-09-15T09:05:00Z', '2026-09-17T09:05:00Z'
  ),
  (
    'epic30-operations-safety-checklist', 'allura-epic30-local', 'epic30-local-workspace',
    'department-curator', 'operations', 'department', '[SYNTHETIC] Operations safety checklist',
    'SYNTHETIC TEST DATA: fictional checklist for testing department-scoped reading only.',
    '2026-09-15T09:10:00Z', '2026-09-17T09:10:00Z'
  ),
  (
    'epic30-finance-close-checklist', 'allura-epic30-local', 'epic30-local-workspace',
    'department-curator', 'finance', 'department', '[SYNTHETIC] Finance close checklist',
    'SYNTHETIC TEST DATA: reconcile fictional test ledger and mark sample variance reviewed.',
    '2026-09-15T09:15:00Z', '2026-09-17T09:15:00Z'
  ),
  (
    'epic30-cross-workspace-sentinel', 'allura-epic30-local', 'epic30-other-workspace',
    'workspace-sentinel-owner', NULL, 'private', '[SYNTHETIC] Cross-workspace sentinel',
    'SYNTHETIC TEST DATA: this row must never appear in epic30-local-workspace reads.',
    '2026-09-15T10:00:00Z', '2026-09-17T10:00:00Z'
  ),
  (
    'epic30-cross-tenant-sentinel', 'allura-epic30-sentinel', 'epic30-cross-tenant-workspace',
    'cross-tenant-sentinel-owner', NULL, 'private', '[SYNTHETIC] Cross-tenant sentinel',
    'SYNTHETIC TEST DATA: this row must never appear in allura-epic30-local reads.',
    '2026-09-15T10:05:00Z', '2026-09-17T10:05:00Z'
  )
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    content = EXCLUDED.content,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at
WHERE brain_documents.group_id = EXCLUDED.group_id
  AND brain_documents.workspace_id = EXCLUDED.workspace_id
  AND brain_documents.owner_id = EXCLUDED.owner_id
  AND brain_documents.department_id IS NOT DISTINCT FROM EXCLUDED.department_id
  AND brain_documents.visibility = EXCLUDED.visibility;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('epic30-owner-private', 'allura-epic30-local', 'epic30-local-workspace', 'owner-user', NULL::text, 'private'),
      ('epic30-owner-private-planning', 'allura-epic30-local', 'epic30-local-workspace', 'owner-user', NULL::text, 'private'),
      ('epic30-other-private', 'allura-epic30-local', 'epic30-local-workspace', 'other-user', NULL::text, 'private'),
      ('epic30-other-private-reminder', 'allura-epic30-local', 'epic30-local-workspace', 'other-user', NULL::text, 'private'),
      ('epic30-operations-runbook', 'allura-epic30-local', 'epic30-local-workspace', 'department-curator', 'operations', 'department'),
      ('epic30-operations-task-queue', 'allura-epic30-local', 'epic30-local-workspace', 'department-curator', 'operations', 'department'),
      ('epic30-operations-safety-checklist', 'allura-epic30-local', 'epic30-local-workspace', 'department-curator', 'operations', 'department'),
      ('epic30-finance-close-checklist', 'allura-epic30-local', 'epic30-local-workspace', 'department-curator', 'finance', 'department'),
      ('epic30-cross-workspace-sentinel', 'allura-epic30-local', 'epic30-other-workspace', 'workspace-sentinel-owner', NULL::text, 'private'),
      ('epic30-cross-tenant-sentinel', 'allura-epic30-sentinel', 'epic30-cross-tenant-workspace', 'cross-tenant-sentinel-owner', NULL::text, 'private')
    ) AS expected(id, group_id, workspace_id, owner_id, department_id, visibility)
    LEFT JOIN brain_documents AS actual USING (id)
    WHERE actual.id IS NULL
       OR actual.group_id IS DISTINCT FROM expected.group_id
       OR actual.workspace_id IS DISTINCT FROM expected.workspace_id
       OR actual.owner_id IS DISTINCT FROM expected.owner_id
       OR actual.department_id IS DISTINCT FROM expected.department_id
       OR actual.visibility IS DISTINCT FROM expected.visibility
  ) THEN
    RAISE EXCEPTION 'Epic 30 synthetic document scope conflicts with an existing row';
  END IF;
END
$$;

COMMIT;
