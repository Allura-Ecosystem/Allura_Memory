-- 70-paired-device-principal-immutability.sql (logical schema version 070)
-- Epic 29 — Preserve the paired-device principal/token identity invariant.
--
-- Migration 062 validates token writes only. Existing linked credentials mean a
-- paired device principal is now authoritative and cannot be reassigned.

BEGIN;

-- SECURITY INVOKER is intentional: both tables retain their existing tenant RLS
-- policies, so the lookup runs only inside the caller's active group scope.
CREATE OR REPLACE FUNCTION paired_devices_reject_principal_change_with_linked_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.principal_id IS NOT DISTINCT FROM OLD.principal_id THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.mcp_tokens
         WHERE paired_device_id = NEW.id
           AND group_id = NEW.group_id
    ) THEN
        RAISE EXCEPTION
            'cannot change principal_id while linked mcp_tokens exist for paired device %',
            NEW.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paired_devices_reject_principal_change ON paired_devices;
CREATE TRIGGER trg_paired_devices_reject_principal_change
    BEFORE UPDATE OF principal_id ON paired_devices
    FOR EACH ROW
    EXECUTE FUNCTION paired_devices_reject_principal_change_with_linked_token();

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('070', NOW(), 'Epic 29: paired-device principals become immutable after linked token issuance')
ON CONFLICT (version) DO NOTHING;

COMMIT;
