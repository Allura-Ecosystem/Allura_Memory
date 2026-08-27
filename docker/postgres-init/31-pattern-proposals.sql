-- ============================================================================
-- Story 2.2: Genesis Engine — Pattern Proposals
-- ============================================================================
-- Purpose: Append-only table storing pattern proposals produced by the
-- Genesis Engine. The detector analyses `agent_trajectories` (Story 1.3)
-- and `skill_usage_events` (Story 1.2) over a configurable window and emits
-- proposals for skills/workflows that should exist but do not.
--
-- Design:
--   * Append-only for the *creation* path — INSERTs flow through the control plane
--     syscall_mutate (AD-40) path. UPDATEs are permitted ONLY for the HITL
--     review gate (status + reviewed_at). A trigger blocks DELETE/TRUNCATE.
--   * group_id stamped on every row for tenant isolation (AD-40). The CHECK
--     constraint enforces the ^allura- format established by ADR-001
--     (mirrors `src/lib/validation/group-id.ts` GROUP_ID_RULES.PATTERN).
--   * status DEFAULT 'proposed', restricted by CHECK to the closed set
--     ('proposed', 'approved', 'rejected').
--   * confidence is a float (0.0–1.0).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pattern_proposals (
  id                 SERIAL PRIMARY KEY,
  group_id           TEXT        NOT NULL
                                 CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  pattern_description TEXT       NOT NULL,
  pattern_type       TEXT        NOT NULL,
  frequency          INTEGER     NOT NULL DEFAULT 0,
  suggested_skill    TEXT,
  confidence         REAL        NOT NULL DEFAULT 0.0,
  status             TEXT        NOT NULL DEFAULT 'proposed'
                       CHECK (status IN ('proposed', 'approved', 'rejected')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at        TIMESTAMPTZ
);

-- ── Tenant isolation: group_id must be non-empty (defence in depth) ─────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pattern_proposals_group_not_empty'
  ) THEN
    ALTER TABLE pattern_proposals ADD CONSTRAINT chk_pattern_proposals_group_not_empty
      CHECK (LENGTH(TRIM(group_id)) > 0);
  END IF;
END $$;

-- ── frequency must be non-negative ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pattern_proposals_frequency_nonneg'
  ) THEN
    ALTER TABLE pattern_proposals ADD CONSTRAINT chk_pattern_proposals_frequency_nonneg
      CHECK (frequency >= 0);
  END IF;
END $$;

-- ── confidence must be in [0.0, 1.0] ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pattern_proposals_confidence_range'
  ) THEN
    ALTER TABLE pattern_proposals ADD CONSTRAINT chk_pattern_proposals_confidence_range
      CHECK (confidence >= 0.0 AND confidence <= 1.0);
  END IF;
END $$;

-- ── pattern_type must be non-empty ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pattern_proposals_type_not_empty'
  ) THEN
    ALTER TABLE pattern_proposals ADD CONSTRAINT chk_pattern_proposals_type_not_empty
      CHECK (LENGTH(TRIM(pattern_type)) > 0);
  END IF;
END $$;

-- ── Indexes for query patterns ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pattern_proposals_group_status
  ON pattern_proposals (group_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pattern_proposals_group_created
  ON pattern_proposals (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pattern_proposals_pattern_type
  ON pattern_proposals (group_id, pattern_type);

-- ============================================================================
-- Append-only guard for pattern_proposals
-- ============================================================================
-- INSERT: permitted (control plane syscall_mutate).
-- UPDATE: permitted ONLY for the HITL review gate (status + reviewed_at).
--         This is enforced by a BEFORE UPDATE trigger that rejects any UPDATE
--         touching columns other than status / reviewed_at.
-- DELETE / TRUNCATE: blocked — proposals form a durable audit trail for SOC2.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_pattern_proposals_append_only_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pattern_proposals is append-only: DELETE is not permitted';
  END IF;

  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'pattern_proposals is append-only: TRUNCATE is not permitted';
  END IF;

  -- Explicit per-column comparison, not a jsonb diff: `jsonb - jsonb` is not
  -- a valid PostgreSQL operator (only `jsonb - text` / `jsonb - text[]`
  -- exist). The prior version of this function used
  -- `jsonb_object_keys(to_jsonb(NEW) - to_jsonb(OLD))`, which raises
  -- "operator does not exist: jsonb - jsonb" on every real UPDATE -- this
  -- broke /api/genesis/proposals/approve and /reject in production. Found
  -- and fixed 2026-08-27; see migration 43 for the forward-fix applied to
  -- already-bootstrapped databases.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.group_id IS DISTINCT FROM OLD.group_id
      OR NEW.pattern_description IS DISTINCT FROM OLD.pattern_description
      OR NEW.pattern_type IS DISTINCT FROM OLD.pattern_type
      OR NEW.frequency IS DISTINCT FROM OLD.frequency
      OR NEW.suggested_skill IS DISTINCT FROM OLD.suggested_skill
      OR NEW.confidence IS DISTINCT FROM OLD.confidence
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION
        'pattern_proposals is append-only: UPDATE may only touch status / reviewed_at (HITL review gate)';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pattern_proposals_block_update ON pattern_proposals;
CREATE TRIGGER trg_pattern_proposals_block_update
  BEFORE UPDATE ON pattern_proposals
  FOR EACH ROW
  EXECUTE FUNCTION fn_pattern_proposals_append_only_guard();

DROP TRIGGER IF EXISTS trg_pattern_proposals_block_delete ON pattern_proposals;
CREATE TRIGGER trg_pattern_proposals_block_delete
  BEFORE DELETE ON pattern_proposals
  FOR EACH ROW
  EXECUTE FUNCTION fn_pattern_proposals_append_only_guard();

DROP TRIGGER IF EXISTS trg_pattern_proposals_block_truncate ON pattern_proposals;
CREATE TRIGGER trg_pattern_proposals_block_truncate
  BEFORE TRUNCATE ON pattern_proposals
  FOR EACH STATEMENT
  EXECUTE FUNCTION fn_pattern_proposals_append_only_guard();

-- ── Documentation ─────────────────────────────────────────────────────────────
COMMENT ON TABLE pattern_proposals IS
  'Story 2.2 Genesis Engine: append-only pattern proposals. INSERT via control plane syscall_mutate; UPDATE restricted to status/reviewed_at by trigger; DELETE/TRUNCATE blocked.';
COMMENT ON COLUMN pattern_proposals.group_id IS
  'Tenant isolation identifier (allura-* format). Stamped by control plane on every insert.';
COMMENT ON COLUMN pattern_proposals.pattern_description IS
  'Human-readable description of the detected pattern.';
COMMENT ON COLUMN pattern_proposals.pattern_type IS
  'Pattern category: repeated_action_sequence | high_frequency_task | failed_then_succeeded.';
COMMENT ON COLUMN pattern_proposals.frequency IS
  'Number of observations of the pattern within the detection window.';
COMMENT ON COLUMN pattern_proposals.suggested_skill IS
  'Suggested skill/workflow name to create from the approved proposal.';
COMMENT ON COLUMN pattern_proposals.confidence IS
  'Detector confidence score in [0.0, 1.0].';
COMMENT ON COLUMN pattern_proposals.status IS
  'HITL gate: proposed -> approved | rejected.';
COMMENT ON COLUMN pattern_proposals.reviewed_at IS
  'Timestamp of HITL review (approve/reject). Null while proposed.';

-- ── Record schema version ───────────────────────────────────────────────────
INSERT INTO schema_versions (version, description)
VALUES ('2.2.0-genesis', 'Story 2.2 Genesis Engine: pattern_proposals append-only table with HITL review gate trigger')
ON CONFLICT (version) DO NOTHING;