-- 62-mcp-tokens-paired-device.sql (logical schema version 062)
-- Epic 29 / Story 29.1 — Device-token linkage and human-principal invariant.

BEGIN;

ALTER TABLE mcp_tokens
    ADD COLUMN IF NOT EXISTS paired_device_id TEXT REFERENCES paired_devices(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tokens_one_active_per_device
    ON mcp_tokens (paired_device_id)
    WHERE paired_device_id IS NOT NULL
      AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_paired_device
    ON mcp_tokens (paired_device_id)
    WHERE paired_device_id IS NOT NULL;

-- Intentionally SECURITY INVOKER: paired_devices RLS must enforce the active tenant.
-- The deferred trigger validates principal identity within the caller's scoped authority.
CREATE OR REPLACE FUNCTION verify_device_token_agent_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
    expected_principal TEXT;
BEGIN
    IF NEW.paired_device_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT principal_id
      INTO expected_principal
      FROM public.paired_devices
     WHERE id = NEW.paired_device_id;

    IF expected_principal IS NULL THEN
        RAISE EXCEPTION 'paired_device_id % does not exist', NEW.paired_device_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.agent_name IS DISTINCT FROM expected_principal THEN
        RAISE EXCEPTION
            'agent_name (%) does not match paired_devices.principal_id (%) for device %',
            NEW.agent_name, expected_principal, NEW.paired_device_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcp_tokens_device_agent_name ON mcp_tokens;
CREATE CONSTRAINT TRIGGER trg_mcp_tokens_device_agent_name
    AFTER INSERT OR UPDATE OF agent_name, paired_device_id ON mcp_tokens
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION verify_device_token_agent_name();

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('062', NOW(), 'Epic 29: mcp_tokens paired-device linkage, active-token uniqueness, and deferred agent identity invariant')
ON CONFLICT (version) DO NOTHING;

COMMIT;
