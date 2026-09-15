-- 64-device-enrollment-approval-context.sql (logical schema version 064)
-- Epic 29 / Story 29.5 — expose only the pre-approval fields that the
-- approval route must validate and audit. Direct table privileges remain
-- revoked from allura_app (AD-61 / architecture §3.1).

BEGIN;

ALTER TABLE public.device_enrollments
    ADD COLUMN IF NOT EXISTS callback_uri TEXT;

-- Rows created before this migration lack a redirect target. Deep links have a
-- fixed target and can be backfilled. A pending loopback enrollment cannot be
-- safely recovered because its bridge-selected ephemeral port was never stored.
UPDATE public.device_enrollments
   SET callback_uri = 'allura-pairing://complete'
 WHERE callback_uri IS NULL
   AND callback_type = 'deep_link'
   AND state = 'PENDING';

UPDATE public.device_enrollments
   SET state = 'EXPIRED', updated_at = NOW()
 WHERE callback_uri IS NULL
   AND callback_type = 'loopback'
   AND state = 'PENDING';

-- Legacy callers retain the 10-argument signature for deep links only. The
-- 11-argument overload below stores the exact callback URI used at approval.
CREATE OR REPLACE FUNCTION device_enrollment_create(
    p_id                         TEXT,
    p_display_label              TEXT,
    p_public_key                 TEXT,
    p_key_id                     TEXT,
    p_key_algo                   TEXT,
    p_pkce_code_challenge        TEXT,
    p_pkce_code_challenge_method TEXT,
    p_pkce_state                 TEXT,
    p_callback_type              TEXT,
    p_expires_at                 TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    PERFORM device_enrollment_create(
        p_id, p_display_label, p_public_key, p_key_id, p_key_algo,
        p_pkce_code_challenge, p_pkce_code_challenge_method, p_pkce_state,
        p_callback_type,
        CASE WHEN p_callback_type = 'deep_link' THEN 'allura-pairing://complete' ELSE NULL END,
        p_expires_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION device_enrollment_create(
    p_id                         TEXT,
    p_display_label              TEXT,
    p_public_key                 TEXT,
    p_key_id                     TEXT,
    p_key_algo                   TEXT,
    p_pkce_code_challenge        TEXT,
    p_pkce_code_challenge_method TEXT,
    p_pkce_state                 TEXT,
    p_callback_type              TEXT,
    p_callback_uri               TEXT,
    p_expires_at                 TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF p_callback_type NOT IN ('deep_link', 'loopback') OR p_callback_uri IS NULL THEN
        RAISE EXCEPTION 'invalid callback type or URI';
    END IF;
    IF p_callback_type = 'deep_link' AND p_callback_uri IS DISTINCT FROM 'allura-pairing://complete' THEN
        RAISE EXCEPTION 'invalid deep-link callback URI';
    END IF;
    IF p_callback_type = 'loopback' AND (
        p_callback_uri !~ '^http://127\.0\.0\.1:(4915[2-9]|491[6-9][0-9]|49[2-9][0-9]{2}|5[0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])/callback$'
    ) THEN
        RAISE EXCEPTION 'invalid loopback callback URI';
    END IF;

    INSERT INTO public.device_enrollments (
        id, display_label, public_key, key_id, key_algo,
        pkce_code_challenge, pkce_code_challenge_method, pkce_state,
        callback_type, callback_uri, state, expires_at
    ) VALUES (
        p_id, p_display_label, p_public_key, p_key_id, p_key_algo,
        p_pkce_code_challenge, p_pkce_code_challenge_method, p_pkce_state,
        p_callback_type, p_callback_uri, 'PENDING', p_expires_at
    );
END;
$$;

-- A repeated approval never returns APPROVED. The caller only receives raw
-- credentials for the atomic PENDING -> APPROVED transition it performed.
CREATE OR REPLACE FUNCTION device_enrollment_approve(
    p_id TEXT, p_pkce_state TEXT, p_principal_id TEXT, p_group_id TEXT,
    p_workspace_id TEXT, p_authorization_code_hash TEXT,
    p_authorization_code_expires_at TIMESTAMPTZ, p_completion_nonce TEXT,
    p_completion_nonce_expires_at TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE row_state TEXT; stored_state TEXT; enrollment_expires_at TIMESTAMPTZ;
BEGIN
    SELECT e.state, e.pkce_state, e.expires_at
      INTO row_state, stored_state, enrollment_expires_at
      FROM public.device_enrollments e WHERE e.id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    IF row_state = 'PENDING' AND enrollment_expires_at <= NOW() THEN
        UPDATE public.device_enrollments SET state = 'EXPIRED', updated_at = NOW() WHERE id = p_id;
        RETURN 'EXPIRED';
    END IF;
    IF row_state <> 'PENDING' THEN RETURN 'NOT_PENDING'; END IF;
    IF stored_state IS DISTINCT FROM p_pkce_state THEN RETURN 'STATE_MISMATCH'; END IF;
    UPDATE public.device_enrollments SET state = 'APPROVED',
      approved_principal_id = p_principal_id, approved_group_id = p_group_id,
      approved_workspace_id = p_workspace_id, authorization_code_hash = p_authorization_code_hash,
      authorization_code_expires_at = p_authorization_code_expires_at,
      completion_nonce = p_completion_nonce, completion_nonce_expires_at = p_completion_nonce_expires_at,
      approved_at = NOW(), updated_at = NOW() WHERE id = p_id;
    RETURN 'APPROVED';
END;
$$;

-- Narrowly-scoped pre-human events need no tenant/workspace authority, but
-- must remain transactional when the caller uses restricted allura_app.
CREATE OR REPLACE FUNCTION device_enrollment_pre_human_audit(
  p_event_type TEXT,
  p_metadata JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_event_type NOT IN ('DEVICE_ENROLL_REQUESTED', 'DEVICE_ENROLL_DENIED', 'DEVICE_ENROLL_EXPIRED') THEN
    RAISE EXCEPTION 'invalid pre-human device enrollment audit event';
  END IF;
  INSERT INTO events (group_id, workspace_id, event_type, agent_id, metadata, status)
  VALUES ('allura-system', NULL, p_event_type, 'device-enrollment', COALESCE(p_metadata, '{}'::jsonb), 'completed');
END;
$$;
REVOKE EXECUTE ON FUNCTION device_enrollment_pre_human_audit(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION device_enrollment_pre_human_audit(TEXT, JSONB) TO allura_app;

CREATE OR REPLACE FUNCTION device_enrollment_approval_context(
    p_id TEXT
) RETURNS TABLE (
    callback_type TEXT,
    callback_uri TEXT,
    public_key TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    -- The row lock is retained until the caller's transaction ends, so the
    -- following approval function observes the same enrollment lifecycle row.
    RETURN QUERY
    SELECT e.callback_type, e.callback_uri, e.public_key
      FROM public.device_enrollments e
     WHERE e.id = p_id
     FOR UPDATE OF e;
END;
$$;

REVOKE EXECUTE ON FUNCTION device_enrollment_approval_context(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION device_enrollment_create(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION device_enrollment_create(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION device_enrollment_approval_context(TEXT) TO allura_app;
GRANT EXECUTE ON FUNCTION device_enrollment_create(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO allura_app;
GRANT EXECUTE ON FUNCTION device_enrollment_create(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('064', NOW(), 'Epic 29: scoped approval context for device enrollments')
ON CONFLICT (version) DO NOTHING;

COMMIT;
