-- 29-memberships.sql
-- Allura Hosted Platform — human team membership + roles.
-- Additive only — no DROP, no ALTER on existing tables.
--
-- TENANCY (ADR-001): group_id is the org tenant boundary. One row per
-- (group_id, user_id). A user can belong to multiple orgs (one row each).
--
-- ROLES (@allura/rbac): admin > curator > viewer. The admin manages members and
-- roles entirely from the dashboard UI (no code).
--
-- MUTABILITY: this is a current-state table (like workspaces / mcp_tokens). Role
-- changes UPDATE `role`; removal is a soft-delete via `removed_at` (no hard DELETE).
-- Every change is also recorded as an append-only event
-- (membership_added / membership_role_changed / membership_removed) so the
-- events-table append-only invariant (POL-002) is preserved as the audit trail.

CREATE TABLE IF NOT EXISTS memberships (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    group_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,            -- stable identity (Clerk user id or email)
    email       TEXT,
    role        TEXT NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('admin', 'curator', 'viewer')),
    invited_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at  TIMESTAMPTZ,

    CONSTRAINT chk_memberships_group_id_format
        CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$')
);

-- One membership per (org, user).
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_group_user
    ON memberships (group_id, user_id);

-- Active members per org — the common admin list query.
CREATE INDEX IF NOT EXISTS idx_memberships_active
    ON memberships (group_id)
    WHERE removed_at IS NULL;

-- ── Schema version tracking ───────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '029',
    NOW(),
    'Allura Hosted: memberships table (group_id-scoped human roles admin/curator/viewer, soft-remove + append-only audit events)'
) ON CONFLICT (version) DO NOTHING;
