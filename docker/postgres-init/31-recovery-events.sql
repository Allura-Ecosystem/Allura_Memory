-- ============================================================================
-- Story 2.3: Self-Healing — recovery_events append-only table
-- ============================================================================
-- Purpose: Persist every auto-recovery attempt made by the healing system
-- (src/lib/healing/auto-recovery.ts). Each row records: which component had a
-- problem, which recovery action was taken, whether it succeeded, and any
-- error message. This table is the audit trail for SOC2 evidence and feeds the
-- /api/health/recovery-log endpoint.
--
-- Design:
--   * Append-only — UPDATE / DELETE / TRUNCATE blocked by a trigger.
--   * group_id stamped on every row for tenant isolation (AD-40).
--   * Max-attempts policy is enforced in application code (auto-recovery.ts)
--     using the recent-rows query against this table.
--
-- Schema (per story spec):
--   id serial, group_id text, component text, action text,
--   success boolean, error_message text, created_at timestamptz default now()
-- ============================================================================

CREATE TABLE IF NOT EXISTS recovery_events (
  id            SERIAL       PRIMARY KEY,
  group_id      TEXT         NOT NULL,
  component     TEXT         NOT NULL,
  action        TEXT         NOT NULL,
  success       BOOLEAN      NOT NULL,
  error_message TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Tenant isolation: group_id must be non-empty ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_recovery_group_not_empty'
  ) THEN
    ALTER TABLE recovery_events ADD CONSTRAINT chk_recovery_group_not_empty
      CHECK (LENGTH(TRIM(group_id)) > 0);
  END IF;
END $$;

-- ── component must be non-empty ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_recovery_component_not_empty'
  ) THEN
    ALTER TABLE recovery_events ADD CONSTRAINT chk_recovery_component_not_empty
      CHECK (LENGTH(TRIM(component)) > 0);
  END IF;
END $$;

-- ── action must be non-empty ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_recovery_action_not_empty'
  ) THEN
    ALTER TABLE recovery_events ADD CONSTRAINT chk_recovery_action_not_empty
      CHECK (LENGTH(TRIM(action)) > 0);
  END IF;
END $$;

-- ── Indexes for query patterns ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recovery_events_group_created
  ON recovery_events(group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recovery_events_component_created
  ON recovery_events(component, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recovery_events_group_component
  ON recovery_events(group_id, component);

-- ============================================================================
-- Append-only enforcement trigger
-- ============================================================================
-- Blocks UPDATE, DELETE, and TRUNCATE on recovery_events.
-- Only INSERT is permitted, preserving the audit-trail invariant.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_recovery_events_append_only_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'recovery_events is append-only: % operation is not permitted',
    TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_recovery_block_update ON recovery_events;
CREATE TRIGGER trg_recovery_block_update
  BEFORE UPDATE ON recovery_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_recovery_events_append_only_guard();

DROP TRIGGER IF EXISTS trg_recovery_block_delete ON recovery_events;
CREATE TRIGGER trg_recovery_block_delete
  BEFORE DELETE ON recovery_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_recovery_events_append_only_guard();

DROP TRIGGER IF EXISTS trg_recovery_block_truncate ON recovery_events;
CREATE TRIGGER trg_recovery_block_truncate
  BEFORE TRUNCATE ON recovery_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION fn_recovery_events_append_only_guard();

-- ── Documentation ─────────────────────────────────────────────────────────────
COMMENT ON TABLE recovery_events IS
  'Append-only auto-recovery attempt log. INSERT only; UPDATE/DELETE/TRUNCATE blocked by trigger. Story 2.3.';
COMMENT ON COLUMN recovery_events.group_id IS
  'Tenant isolation identifier (allura-* format). Stamped by kernel on every insert.';
COMMENT ON COLUMN recovery_events.component IS
  'Component that was unhealthy (e.g. mcp-container, postgres, disk, memory).';
COMMENT ON COLUMN recovery_events.action IS
  'Recovery action taken (e.g. restart-mcp, brain-recover, clear-stale-connections).';
COMMENT ON COLUMN recovery_events.success IS
  'Whether the recovery action succeeded.';
COMMENT ON COLUMN recovery_events.error_message IS
  'Error message from the recovery attempt (NULL on success).';

-- ── Record schema version ───────────────────────────────────────────────────
INSERT INTO schema_versions (version, description)
VALUES ('2.3.0-recovery-events', 'Self-healing recovery_events append-only table (Story 2.3)')
ON CONFLICT (version) DO NOTHING;