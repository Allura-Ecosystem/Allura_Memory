-- 68-device-rotation-idempotency-scope.sql
-- Story 29.12 remediation: client idempotency keys are scoped to the paired device.

BEGIN;

DROP INDEX IF EXISTS idx_paired_devices_rotation_idem;
CREATE UNIQUE INDEX idx_paired_devices_rotation_idem
    ON paired_devices (id, rotation_idempotency_key)
    WHERE rotation_idempotency_key IS NOT NULL;

INSERT INTO schema_versions (version, applied_at, description)
VALUES ('068', NOW(), 'Scope device rotation idempotency keys to paired device')
ON CONFLICT (version) DO NOTHING;

COMMIT;
