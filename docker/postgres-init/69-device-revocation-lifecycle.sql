-- 69-device-revocation-lifecycle.sql (logical schema version 069)
-- Story 29.15 — terminal device lifecycle authority and irreversible transitions.

BEGIN;

-- A terminal device cannot use resolve_device_route(), which intentionally
-- resolves APPROVED devices only. This resolver accepts the tenant already
-- derived from the authenticated server request and returns no row unless that
-- exact device belongs to that tenant. It is deliberately not a global lookup:
-- callers cannot bootstrap a different tenant or distinguish cross-tenant from
-- missing device ids.
CREATE OR REPLACE FUNCTION resolve_device_lifecycle_context(
    p_device_id TEXT,
    p_group_id TEXT
) RETURNS TABLE (
    group_id TEXT,
    workspace_id TEXT,
    principal_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_device_id IS NULL
       OR p_group_id IS NULL
       OR p_group_id !~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT d.group_id, d.workspace_id, d.principal_id
      FROM public.paired_devices AS d
     WHERE d.id = p_device_id
       AND p_group_id = current_setting('app.current_group_id', true)
       AND d.group_id = p_group_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_device_lifecycle_context(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_device_lifecycle_context(TEXT, TEXT) TO allura_app;

-- Lifecycle terminality belongs in the database, not only in application code.
-- A terminal row may receive non-lifecycle bookkeeping updates, but it can never
-- be restored to APPROVED or converted between REVOKED and LOST.
CREATE OR REPLACE FUNCTION paired_devices_reject_terminal_lifecycle_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.lifecycle_state IN ('REVOKED', 'LOST')
       AND NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state THEN
        RAISE EXCEPTION
            'paired device lifecycle is terminal: cannot transition from % to %',
            OLD.lifecycle_state,
            NEW.lifecycle_state
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paired_devices_terminal_lifecycle ON paired_devices;
CREATE TRIGGER trg_paired_devices_terminal_lifecycle
BEFORE UPDATE OF lifecycle_state ON paired_devices
FOR EACH ROW
EXECUTE FUNCTION paired_devices_reject_terminal_lifecycle_transition();

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('069', NOW(), 'Epic 29: tenant-bound terminal device lifecycle resolution and irreversible revocation/lost transitions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
