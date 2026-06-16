-- 27-workspaces.sql
-- Allura Hosted Platform — workspace sub-scope (ADR-001)
-- Additive only — no DROP, no ALTER on existing tables.
--
-- TENANCY (ADR-001): the ORGANIZATION is the only tenant boundary and owns the
-- `group_id`. A WORKSPACE is a `workspace_id` sub-scope WITHIN a `group_id` — it
-- is a column on tenant tables, NEVER its own tenant. Isolation between
-- workspaces is enforced at the API/CHECK layer, never by minting a new group_id.
--
-- lock_mode values mirror @allura/types `LockMode` exactly (underscored).
-- group_id CHECK uses the strict pattern established in migration 19
-- (matches src/lib/validation/group-id.ts).

CREATE TABLE IF NOT EXISTS workspaces (
    workspace_id TEXT PRIMARY KEY,
    group_id     TEXT NOT NULL,
    name         TEXT NOT NULL,
    lock_mode    TEXT NOT NULL DEFAULT 'normal',
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_workspaces_group_id_format
        CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),

    CONSTRAINT chk_workspaces_lock_mode
        CHECK (lock_mode IN ('normal', 'read_only', 'no_agent_writes', 'no_promotions', 'full_lockdown'))
);

CREATE INDEX IF NOT EXISTS idx_workspaces_group_id
    ON workspaces (group_id);

-- ── Schema version tracking ───────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '027',
    NOW(),
    'Allura Hosted: workspaces table (workspace_id sub-scope within group_id, ADR-001) + lock_mode'
) ON CONFLICT (version) DO NOTHING;
