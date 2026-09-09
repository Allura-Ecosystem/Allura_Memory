-- 65-device-enrollment-completion-context.sql (logical schema version 065)
-- Epic 29 / Story 29.6 review remediation — expose the enrolled display label
-- only through the completion-time, row-locking SECURITY DEFINER function.

BEGIN;

-- PostgreSQL cannot CREATE OR REPLACE a function whose TABLE return shape
-- changes. The function has no database-object dependents; callers resolve it
-- by name at runtime. Recreate it with the least additional completion field.
DROP FUNCTION IF EXISTS public.device_enrollment_lock_for_complete(TEXT);

CREATE FUNCTION device_enrollment_lock_for_complete(
    p_id TEXT
) RETURNS TABLE (
    state TEXT,
    display_label TEXT,
    public_key TEXT,
    key_id TEXT,
    key_algo TEXT,
    pkce_code_challenge TEXT,
    pkce_state TEXT,
    approved_principal_id TEXT,
    approved_group_id TEXT,
    approved_workspace_id TEXT,
    authorization_code_hash TEXT,
    authorization_code_expires_at TIMESTAMPTZ,
    completion_nonce TEXT,
    completion_nonce_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    RETURN QUERY
    SELECT e.state,
           e.display_label,
           e.public_key,
           e.key_id,
           e.key_algo,
           e.pkce_code_challenge,
           e.pkce_state,
           e.approved_principal_id,
           e.approved_group_id,
           e.approved_workspace_id,
           e.authorization_code_hash,
           e.authorization_code_expires_at,
           e.completion_nonce,
           e.completion_nonce_expires_at
      FROM public.device_enrollments e
     WHERE e.id = p_id
     FOR UPDATE OF e;
END;
$$;

REVOKE EXECUTE ON FUNCTION device_enrollment_lock_for_complete(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION device_enrollment_lock_for_complete(TEXT) TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('065', NOW(), 'Epic 29: completion context preserves enrolled device label')
ON CONFLICT (version) DO NOTHING;

COMMIT;
