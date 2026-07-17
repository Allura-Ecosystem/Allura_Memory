-- ============================================================================
-- Story 1.2: Skill Usage Tracking — Append-only Event Table
-- ============================================================================
-- Purpose: Track every skill load through the kernel syscall_mutate path.
-- Enables usage analytics: count, success rate, avg tokens, avg duration
-- per skill_name, scoped to a tenant group_id.
--
-- Design:
--   * Append-only — UPDATE / DELETE / TRUNCATE are blocked by a trigger.
--   * group_id stamped on every row for tenant isolation (AD-40).
--   * id is SERIAL (per story spec); created_at defaults to now().
-- ============================================================================

CREATE TABLE IF NOT EXISTS skill_usage_events (
  id          SERIAL PRIMARY KEY,
  group_id    TEXT        NOT NULL,
  skill_name  TEXT        NOT NULL,
  success     BOOLEAN     NOT NULL,
  token_count INTEGER     NOT NULL DEFAULT 0,
  duration_ms INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tenant isolation: group_id must be non-empty ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_skill_usage_group_not_empty'
  ) THEN
    ALTER TABLE skill_usage_events ADD CONSTRAINT chk_skill_usage_group_not_empty
      CHECK (LENGTH(TRIM(group_id)) > 0);
  END IF;
END $$;

-- ── skill_name must be non-empty ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_skill_usage_name_not_empty'
  ) THEN
    ALTER TABLE skill_usage_events ADD CONSTRAINT chk_skill_usage_name_not_empty
      CHECK (LENGTH(TRIM(skill_name)) > 0);
  END IF;
END $$;

-- ── token_count / duration_ms must be non-negative ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_skill_usage_token_count_nonneg'
  ) THEN
    ALTER TABLE skill_usage_events ADD CONSTRAINT chk_skill_usage_token_count_nonneg
      CHECK (token_count >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_skill_usage_duration_nonneg'
  ) THEN
    ALTER TABLE skill_usage_events ADD CONSTRAINT chk_skill_usage_duration_nonneg
      CHECK (duration_ms >= 0);
  END IF;
END $$;

-- ── Indexes for query patterns ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_skill_usage_group_created
  ON skill_usage_events(group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_usage_group_skill
  ON skill_usage_events(group_id, skill_name);

CREATE INDEX IF NOT EXISTS idx_skill_usage_skill_created
  ON skill_usage_events(skill_name, created_at DESC);

-- ============================================================================
-- Append-only enforcement trigger
-- ============================================================================
-- Blocks UPDATE, DELETE, and TRUNCATE on skill_usage_events.
-- Only INSERT is permitted, preserving the audit-trail invariant.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_skill_usage_append_only_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'skill_usage_events is append-only: % operation is not permitted',
    TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_usage_block_update ON skill_usage_events;
CREATE TRIGGER trg_skill_usage_block_update
  BEFORE UPDATE ON skill_usage_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_skill_usage_append_only_guard();

DROP TRIGGER IF EXISTS trg_skill_usage_block_delete ON skill_usage_events;
CREATE TRIGGER trg_skill_usage_block_delete
  BEFORE DELETE ON skill_usage_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_skill_usage_append_only_guard();

DROP TRIGGER IF EXISTS trg_skill_usage_block_truncate ON skill_usage_events;
CREATE TRIGGER trg_skill_usage_block_truncate
  BEFORE TRUNCATE ON skill_usage_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION fn_skill_usage_append_only_guard();

-- ── Summary view: usage aggregates per skill per group ───────────────────────
CREATE OR REPLACE VIEW skill_usage_summary AS
SELECT
  group_id,
  skill_name,
  COUNT(*)                                AS total_count,
  COUNT(*) FILTER (WHERE success = true) AS success_count,
  COUNT(*) FILTER (WHERE success = false) AS failure_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE success = true) / NULLIF(COUNT(*), 0),
    2
 )::NUMERIC(5, 2)                         AS success_rate_pct,
  COALESCE(AVG(token_count), 0)::INTEGER  AS avg_tokens,
  COALESCE(AVG(duration_ms), 0)::INTEGER  AS avg_duration_ms,
  MIN(created_at)                          AS first_used,
  MAX(created_at)                          AS last_used
FROM skill_usage_events
GROUP BY group_id, skill_name;

-- ── Documentation ─────────────────────────────────────────────────────────────
COMMENT ON TABLE skill_usage_events IS
  'Append-only skill usage tracking. INSERT only; UPDATE/DELETE/TRUNCATE blocked by trigger. Story 1.2.';
COMMENT ON COLUMN skill_usage_events.group_id IS
  'Tenant isolation identifier (allura-* format). Stamped by kernel on every insert.';
COMMENT ON COLUMN skill_usage_events.skill_name IS
  'Canonical skill name (lowercase, hyphens/underscores).';
COMMENT ON COLUMN skill_usage_events.success IS
  'Whether the skill load succeeded.';
COMMENT ON COLUMN skill_usage_events.token_count IS
  'Tokens consumed by the skill load (0 if unmeasured).';
COMMENT ON COLUMN skill_usage_events.duration_ms IS
  'Duration of the skill load in milliseconds (0 if unmeasured).';
COMMENT ON VIEW skill_usage_summary IS
  'Aggregated usage metrics per skill per group: count, success rate, avg tokens, avg duration.';

-- ── Record schema version ───────────────────────────────────────────────────
INSERT INTO schema_versions (version, description)
VALUES ('1.2.0-skill-usage', 'Skill usage tracking append-only table and summary view')
ON CONFLICT (version) DO NOTHING;