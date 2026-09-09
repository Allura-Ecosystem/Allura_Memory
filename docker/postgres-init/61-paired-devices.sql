-- 61-paired-devices.sql (logical schema version 061)
-- Epic 29 / Story 29.1 — Paired devices with complete server-resolved authority.

BEGIN;

CREATE TABLE IF NOT EXISTS paired_devices (
    id                    TEXT PRIMARY KEY,
    principal_id          TEXT NOT NULL,
    group_id              TEXT NOT NULL
        CONSTRAINT chk_paired_devices_group_id_format
        CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
    workspace_id          TEXT NOT NULL REFERENCES workspaces(workspace_id),
    display_label         TEXT NOT NULL,

    current_public_key    TEXT NOT NULL,
    current_key_id        TEXT NOT NULL,
    current_key_algo      TEXT NOT NULL DEFAULT 'ecdsa-p256'
        CHECK (current_key_algo IN ('ed25519', 'ecdsa-p256', 'rsa-pss-2048')),

    pending_next_public_key   TEXT,
    pending_next_key_id       TEXT,
    pending_next_key_algo     TEXT,
    rotation_idempotency_key  TEXT,
    rotation_receipt          JSONB,
    rotation_grace_expires_at TIMESTAMPTZ,
    grace_exchange_count      INTEGER NOT NULL DEFAULT 0
        CHECK (grace_exchange_count >= 0),
    key_generation            INTEGER NOT NULL DEFAULT 1,

    lifecycle_state      TEXT NOT NULL DEFAULT 'APPROVED'
        CHECK (lifecycle_state IN ('APPROVED', 'REVOKED', 'LOST')),

    -- Audit correlation only. Enrollment rows are eligible for later cleanup.
    enrollment_id        TEXT,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_exchange_at     TIMESTAMPTZ,
    last_rotation_at     TIMESTAMPTZ,
    revoked_at           TIMESTAMPTZ,
    lost_at              TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paired_devices_principal_workspace
    ON paired_devices (group_id, workspace_id, principal_id)
    WHERE lifecycle_state = 'APPROVED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_paired_devices_rotation_idem
    ON paired_devices (rotation_idempotency_key)
    WHERE rotation_idempotency_key IS NOT NULL;

ALTER TABLE paired_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE paired_devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paired_devices_policy ON paired_devices;
CREATE POLICY paired_devices_policy ON paired_devices FOR ALL TO allura_app
    USING (group_id = current_setting('app.current_group_id', true))
    WITH CHECK (group_id = current_setting('app.current_group_id', true));

-- Migration 36 grants DML only to tables that exist at that point and does not
-- establish default privileges, so post-36 tables must grant explicitly.
REVOKE ALL ON paired_devices FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON paired_devices TO allura_app;
GRANT ALL PRIVILEGES ON paired_devices TO allura_migration;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('061', NOW(), 'Epic 29: paired_devices authority, lifecycle, rotation, and RLS contract')
ON CONFLICT (version) DO NOTHING;

COMMIT;
