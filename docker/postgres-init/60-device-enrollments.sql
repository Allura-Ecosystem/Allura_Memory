-- 60-device-enrollments.sql (logical schema version 060)
-- Epic 29 / Story 29.1 — Enrollment transactions.
-- PENDING rows carry no tenant authority. APPROVED rows temporarily carry
-- server-resolved authority and one-time completion state.

BEGIN;

CREATE TABLE IF NOT EXISTS device_enrollments (
    id                          TEXT PRIMARY KEY,
    display_label               TEXT NOT NULL,

    public_key                  TEXT NOT NULL,
    key_id                      TEXT NOT NULL,
    key_algo                    TEXT NOT NULL DEFAULT 'ecdsa-p256'
        CHECK (key_algo IN ('ed25519', 'ecdsa-p256', 'rsa-pss-2048')),

    pkce_code_challenge         TEXT NOT NULL,
    pkce_code_challenge_method  TEXT NOT NULL DEFAULT 'S256',
    pkce_state                  TEXT NOT NULL,

    callback_type               TEXT NOT NULL DEFAULT 'deep_link'
        CHECK (callback_type IN ('deep_link', 'loopback')),

    state                       TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (state IN ('PENDING', 'APPROVED', 'EXPIRED', 'CONSUMED')),

    expires_at                  TIMESTAMPTZ NOT NULL,
    approved_at                 TIMESTAMPTZ,
    consumed_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    approved_principal_id       TEXT,
    approved_group_id           TEXT
        CONSTRAINT chk_device_enrollments_approved_group_id_format
        CHECK (
            approved_group_id IS NULL
            OR approved_group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
        ),
    approved_workspace_id       TEXT,

    authorization_code_hash         TEXT,
    authorization_code_expires_at   TIMESTAMPTZ,
    authorization_code_consumed_at  TIMESTAMPTZ,

    completion_nonce            TEXT,
    completion_nonce_expires_at TIMESTAMPTZ,

    CONSTRAINT chk_enroll_pending_no_auth CHECK (
        (
            state = 'PENDING'
            AND approved_principal_id IS NULL
            AND approved_group_id IS NULL
            AND approved_workspace_id IS NULL
            AND authorization_code_hash IS NULL
            AND authorization_code_expires_at IS NULL
            AND completion_nonce IS NULL
            AND completion_nonce_expires_at IS NULL
            AND approved_at IS NULL
            AND authorization_code_consumed_at IS NULL
        )
        OR state <> 'PENDING'
    ),

    CONSTRAINT chk_enroll_approved_has_auth CHECK (
        (
            state = 'APPROVED'
            AND approved_principal_id IS NOT NULL
            AND approved_group_id IS NOT NULL
            AND approved_workspace_id IS NOT NULL
            AND authorization_code_hash IS NOT NULL
            AND authorization_code_expires_at IS NOT NULL
            AND completion_nonce IS NOT NULL
            AND completion_nonce_expires_at IS NOT NULL
            AND approved_at IS NOT NULL
            AND authorization_code_consumed_at IS NULL
        )
        OR state <> 'APPROVED'
    ),

    CONSTRAINT chk_enroll_consumed_has_consumed_at CHECK (
        (state = 'CONSUMED' AND consumed_at IS NOT NULL)
        OR state <> 'CONSUMED'
    ),

    CONSTRAINT chk_enroll_expired_cleared_code CHECK (
        (state = 'EXPIRED' AND authorization_code_consumed_at IS NULL)
        OR state <> 'EXPIRED'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_enrollments_id
    ON device_enrollments (id);

CREATE INDEX IF NOT EXISTS idx_device_enrollments_expires
    ON device_enrollments (expires_at)
    WHERE state IN ('PENDING', 'APPROVED');

REVOKE ALL ON device_enrollments FROM PUBLIC;
REVOKE ALL ON device_enrollments FROM allura_app;

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
    INSERT INTO public.device_enrollments (
        id,
        display_label,
        public_key,
        key_id,
        key_algo,
        pkce_code_challenge,
        pkce_code_challenge_method,
        pkce_state,
        callback_type,
        state,
        expires_at
    ) VALUES (
        p_id,
        p_display_label,
        p_public_key,
        p_key_id,
        p_key_algo,
        p_pkce_code_challenge,
        p_pkce_code_challenge_method,
        p_pkce_state,
        p_callback_type,
        'PENDING',
        p_expires_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION device_enrollment_approve(
    p_id                            TEXT,
    p_pkce_state                    TEXT,
    p_principal_id                  TEXT,
    p_group_id                      TEXT,
    p_workspace_id                  TEXT,
    p_authorization_code_hash       TEXT,
    p_authorization_code_expires_at TIMESTAMPTZ,
    p_completion_nonce              TEXT,
    p_completion_nonce_expires_at   TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    row_state TEXT;
    stored_state TEXT;
    enrollment_expires_at TIMESTAMPTZ;
BEGIN
    IF current_setting('app.current_principal', true) IS DISTINCT FROM p_principal_id
       OR current_setting('app.current_group_id', true) IS DISTINCT FROM p_group_id
       OR current_setting('app.current_workspace_id', true) IS DISTINCT FROM p_workspace_id THEN
        RAISE EXCEPTION 'authenticated principal context required';
    END IF;

    SELECT e.state, e.pkce_state, e.expires_at
      INTO row_state, stored_state, enrollment_expires_at
      FROM public.device_enrollments e
     WHERE e.id = p_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'NOT_FOUND';
    END IF;

    IF row_state = 'PENDING' AND enrollment_expires_at <= NOW() THEN
        UPDATE public.device_enrollments
           SET state = 'EXPIRED', updated_at = NOW()
         WHERE id = p_id;
        RETURN 'EXPIRED';
    END IF;

    IF row_state <> 'PENDING' THEN
        RETURN row_state;
    END IF;

    IF stored_state IS DISTINCT FROM p_pkce_state THEN
        RETURN 'STATE_MISMATCH';
    END IF;

    UPDATE public.device_enrollments
       SET state = 'APPROVED',
           approved_principal_id = p_principal_id,
           approved_group_id = p_group_id,
           approved_workspace_id = p_workspace_id,
           authorization_code_hash = p_authorization_code_hash,
           authorization_code_expires_at = p_authorization_code_expires_at,
           completion_nonce = p_completion_nonce,
           completion_nonce_expires_at = p_completion_nonce_expires_at,
           approved_at = NOW(),
           updated_at = NOW()
     WHERE id = p_id;

    RETURN 'APPROVED';
END;
$$;

CREATE OR REPLACE FUNCTION device_enrollment_lock_for_complete(
    p_id TEXT
) RETURNS TABLE (
    state TEXT,
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

CREATE OR REPLACE FUNCTION device_enrollment_consume(
    p_id TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    UPDATE public.device_enrollments
       SET state = 'CONSUMED',
           consumed_at = NOW(),
           authorization_code_consumed_at = NOW(),
           updated_at = NOW()
     WHERE id = p_id
       AND state = 'APPROVED';
END;
$$;

CREATE OR REPLACE FUNCTION device_enrollment_expire(
    p_id TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    UPDATE public.device_enrollments
       SET state = 'EXPIRED',
           updated_at = NOW()
     WHERE id = p_id
       AND state IN ('PENDING', 'APPROVED')
       AND (
           expires_at < NOW()
           OR authorization_code_expires_at < NOW()
           OR completion_nonce_expires_at < NOW()
       );
END;
$$;

REVOKE EXECUTE ON FUNCTION
    device_enrollment_create(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ),
    device_enrollment_approve(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ),
    device_enrollment_lock_for_complete(TEXT),
    device_enrollment_consume(TEXT),
    device_enrollment_expire(TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    device_enrollment_create(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ),
    device_enrollment_approve(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ),
    device_enrollment_lock_for_complete(TEXT),
    device_enrollment_consume(TEXT),
    device_enrollment_expire(TEXT)
TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('060', NOW(), 'Epic 29: device_enrollments table with SECURITY DEFINER-only access')
ON CONFLICT (version) DO NOTHING;

COMMIT;
