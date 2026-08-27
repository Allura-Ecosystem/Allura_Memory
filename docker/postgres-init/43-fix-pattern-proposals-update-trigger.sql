-- Migration 43: Fix pattern_proposals' broken UPDATE guard
--
-- Migration 31's fn_pattern_proposals_append_only_guard() computed changed
-- columns via `jsonb_object_keys(to_jsonb(NEW) - to_jsonb(OLD))`. `jsonb -
-- jsonb` is not a valid PostgreSQL operator (only `jsonb - text` and
-- `jsonb - text[]` exist) -- confirmed directly:
--   SELECT '{"a":1}'::jsonb - '{"a":2}'::jsonb;
--   ERROR:  operator does not exist: jsonb - jsonb
--
-- This meant ANY real UPDATE to pattern_proposals -- including a legitimate
-- HITL review-gate transition touching only status/reviewed_at -- raised
-- that error instead of succeeding or being correctly rejected.
-- /api/genesis/proposals/approve and /reject (src/app/api/genesis/proposals/
-- {approve,reject}/route.ts), which route through pgUpdatePatternProposal
-- (src/control-plane/target-resolver.ts), have been unable to complete a
-- real approve/reject since this trigger was introduced.
--
-- CREATE OR REPLACE FUNCTION updates the function body in place; the
-- existing triggers (trg_pattern_proposals_block_update, _block_delete,
-- _block_truncate) already reference this function by name and do not need
-- to be recreated. Fresh bootstraps get the correct version directly from
-- migration 31 (fixed in the same PR as this migration); this migration is
-- the forward-fix for databases that already ran the broken version.

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

-- ── Schema version tracking ──────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '043',
    NOW(),
    'Fix fn_pattern_proposals_append_only_guard(): jsonb - jsonb is not a valid operator; the migration 31 trigger raised an error on every real UPDATE, breaking /api/genesis/proposals/approve and /reject. Replaced with explicit per-column IS DISTINCT FROM comparisons.'
) ON CONFLICT (version) DO NOTHING;
