-- 67-device-exchange-denial-audit.sql (logical schema version 067)
-- Epic 29 / Story 29.7 — transactional pre-human audit for a device that
-- cannot be resolved to tenant authority. This function is intentionally
-- narrower than device_enrollment_pre_human_audit: it can emit exactly one
-- failed event type and cannot be used to bypass workspace-scoped event RLS.

BEGIN;

CREATE OR REPLACE FUNCTION public.device_exchange_denial_audit(
  p_metadata JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.events (
    group_id,
    workspace_id,
    event_type,
    agent_id,
    metadata,
    status
  ) VALUES (
    'allura-system',
    NULL,
    'DEVICE_EXCHANGE_DENIED',
    'device-enrollment',
    COALESCE(p_metadata, '{}'::jsonb),
    'failed'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.device_exchange_denial_audit(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.device_exchange_denial_audit(JSONB) TO allura_app;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('067', NOW(), 'Epic 29: fail-closed pre-human audit for denied device challenge issuance')
ON CONFLICT (version) DO NOTHING;

COMMIT;
