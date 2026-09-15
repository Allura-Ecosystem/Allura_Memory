-- 63-device-challenges.sql (logical schema version 063)
-- Epic 29 / Story 29.1 — Tenant-scoped, single-use device proof challenges.

BEGIN;

CREATE TABLE IF NOT EXISTS device_challenges (
    id                    TEXT PRIMARY KEY,
    group_id              TEXT NOT NULL
        CONSTRAINT chk_device_challenges_group_id_format
        CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
    paired_device_id      TEXT NOT NULL REFERENCES paired_devices(id),
    nonce                 TEXT NOT NULL,
    audience              TEXT NOT NULL,
    purpose               TEXT NOT NULL DEFAULT 'exchange'
        CHECK (purpose IN ('exchange', 'rotation_stage', 'rotation_activate', 'recovery_status')),
    server_context        JSONB NOT NULL DEFAULT '{}',
    expires_at            TIMESTAMPTZ NOT NULL,
    consumed_at           TIMESTAMPTZ,
    consumed_by_token_id  TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_challenges_nonce
    ON device_challenges (nonce)
    WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_challenges_group_nonce
    ON device_challenges (group_id, nonce)
    WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_challenges_expires
    ON device_challenges (expires_at)
    WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_challenges_group_expires
    ON device_challenges (group_id, expires_at)
    WHERE consumed_at IS NULL;

ALTER TABLE device_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_challenges FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_challenges_policy ON device_challenges;
CREATE POLICY device_challenges_policy ON device_challenges FOR ALL TO allura_app
    USING (group_id = current_setting('app.current_group_id', true))
    WITH CHECK (group_id = current_setting('app.current_group_id', true));

REVOKE ALL ON device_challenges FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON device_challenges TO allura_app;
GRANT ALL PRIVILEGES ON device_challenges TO allura_migration;

CREATE OR REPLACE FUNCTION resolve_device_route(p_device_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    resolved_group_id TEXT;
BEGIN
    SELECT group_id
      INTO resolved_group_id
      FROM public.paired_devices
     WHERE id = p_device_id
       AND lifecycle_state = 'APPROVED';

    RETURN resolved_group_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_device_route(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_device_route(TEXT) TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('063', NOW(), 'Epic 29: device challenge replay cache, tenant RLS, and route resolver')
ON CONFLICT (version) DO NOTHING;

COMMIT;
