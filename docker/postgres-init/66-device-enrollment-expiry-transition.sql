-- 66-device-enrollment-expiry-transition.sql (logical schema version 066)
-- Epic 29 / Story 29.6 review remediation — expiration must report whether it
-- transitioned a lifecycle row, using wall-clock semantics after lock waits.

BEGIN;

-- PostgreSQL cannot CREATE OR REPLACE a function when VOID changes to BOOLEAN.
-- No schema object depends on this runtime-called function.
DROP FUNCTION IF EXISTS public.device_enrollment_expire(TEXT);

CREATE FUNCTION device_enrollment_expire(
    p_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    UPDATE public.device_enrollments
       SET state = 'EXPIRED',
           updated_at = clock_timestamp()
     WHERE id = p_id
       AND state IN ('PENDING', 'APPROVED')
       AND (
           expires_at < clock_timestamp()
           OR authorization_code_expires_at < clock_timestamp()
           OR completion_nonce_expires_at < clock_timestamp()
       );
    RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION device_enrollment_expire(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION device_enrollment_expire(TEXT) TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('066', NOW(), 'Epic 29: expiration transition is wall-clock aligned and observable')
ON CONFLICT (version) DO NOTHING;

COMMIT;
