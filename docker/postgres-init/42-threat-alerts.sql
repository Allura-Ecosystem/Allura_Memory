-- Migration 42: Durable, tenant-routed exposure alerts
-- Story 26.4 — Scheduled Discovery and Alert Routing
--
-- Story 26.3's ExposureMatcher (src/lib/exposure/matcher.ts) is deliberately
-- in-memory only: no DB writes, no policy activation. This table is where
-- Story 26.4 persists its output durably, tenant-routed, with the richer
-- lifecycle the story requires.
--
-- LIFECYCLE VS STORY 26.3: the in-memory ExposureAlert.state (26.3) only has
-- open/acknowledged/resolved/suppressed, always created as 'open'. This
-- table's lifecycle_state is a separate, story-26.4-owned vocabulary:
-- new | acknowledged | mitigated | resolved | stale. 'open' maps to 'new' on
-- first persistence. 'stale' means the alert's supporting evidence has
-- degraded/gone stale since creation -- surfaced explicitly, never silently
-- retained as if still fresh (AC-4). It is a real lifecycle state, not a
-- separate freshness column, so a stale alert cannot be mistaken for current.
--
-- DEDUPLICATION: dedup_key is unique per tenant/workspace (AC-5) -- one alert
-- row per unique exposure, no matter how many advisory matches produced it.
--
-- MUTABILITY: NOT append-only, unlike mitigation_receipts or governance
-- receipts. An alert's lifecycle_state legitimately transitions over time.
-- The trigger below permits UPDATE of lifecycle_state (and updated_at) only
-- -- every other column, once written, is immutable. This mirrors
-- pattern_proposals' HITL-review-gate trigger (migration 31) exactly.
--
-- AUTHORITY: per AD-57/Story 26.1, this table only ever holds alerts and
-- references to simulated (never persisted) mitigation drafts. Nothing here
-- authorizes activation, enforcement, or any connector/response action.

CREATE TABLE IF NOT EXISTS threat_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  inventory_ref TEXT NOT NULL CHECK (LENGTH(TRIM(inventory_ref)) > 0),
  artifact_ref TEXT NOT NULL CHECK (LENGTH(TRIM(artifact_ref)) > 0),
  advisory_refs JSONB NOT NULL CHECK (
    jsonb_typeof(advisory_refs) = 'array' AND jsonb_array_length(advisory_refs) > 0
  ),
  match_type TEXT NOT NULL CHECK (LENGTH(TRIM(match_type)) > 0),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  severity TEXT NOT NULL CHECK (LENGTH(TRIM(severity)) > 0),
  evidence_ids JSONB NOT NULL CHECK (
    jsonb_typeof(evidence_ids) = 'array' AND jsonb_array_length(evidence_ids) > 0
  ),
  dedup_key TEXT NOT NULL CHECK (LENGTH(TRIM(dedup_key)) > 0),
  lifecycle_state TEXT NOT NULL DEFAULT 'new'
    CHECK (lifecycle_state IN ('new', 'acknowledged', 'mitigated', 'resolved', 'stale')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT threat_alerts_group_workspace_fkey
    FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id),
  CONSTRAINT threat_alerts_dedup_key
    UNIQUE (group_id, workspace_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS threat_alerts_scope_state_created_idx
  ON threat_alerts (group_id, workspace_id, lifecycle_state, created_at DESC);

-- ── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE threat_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_alerts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS threat_alerts_workspace_isolation_policy ON threat_alerts;
CREATE POLICY threat_alerts_workspace_isolation_policy ON threat_alerts
  FOR ALL TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  );

-- ── Restricted-column UPDATE gate (mirrors pattern_proposals, migration 31) ──
CREATE OR REPLACE FUNCTION app.guard_threat_alert_lifecycle_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'threat_alerts is immutable except lifecycle_state: DELETE is not permitted';
  END IF;

  -- Explicit per-column comparison, not a jsonb diff: `jsonb - jsonb` is not
  -- a valid PostgreSQL operator (only `jsonb - text` / `jsonb - text[]`
  -- exist). migration 31's pattern_proposals trigger uses that exact
  -- `jsonb_object_keys(to_jsonb(NEW) - to_jsonb(OLD))` expression and would
  -- raise the same "operator does not exist" error on any real UPDATE --
  -- found while validating this migration; flagged separately, not fixed
  -- here (out of this story's scope).
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.group_id IS DISTINCT FROM OLD.group_id
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.inventory_ref IS DISTINCT FROM OLD.inventory_ref
      OR NEW.artifact_ref IS DISTINCT FROM OLD.artifact_ref
      OR NEW.advisory_refs IS DISTINCT FROM OLD.advisory_refs
      OR NEW.match_type IS DISTINCT FROM OLD.match_type
      OR NEW.confidence IS DISTINCT FROM OLD.confidence
      OR NEW.severity IS DISTINCT FROM OLD.severity
      OR NEW.evidence_ids IS DISTINCT FROM OLD.evidence_ids
      OR NEW.dedup_key IS DISTINCT FROM OLD.dedup_key
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'threat_alerts UPDATE may only touch lifecycle_state / updated_at';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_threat_alerts_block_delete ON threat_alerts;
CREATE TRIGGER trg_threat_alerts_block_delete
  BEFORE DELETE ON threat_alerts
  FOR EACH ROW
  EXECUTE FUNCTION app.guard_threat_alert_lifecycle_update();

DROP TRIGGER IF EXISTS trg_threat_alerts_restrict_update ON threat_alerts;
CREATE TRIGGER trg_threat_alerts_restrict_update
  BEFORE UPDATE ON threat_alerts
  FOR EACH ROW
  EXECUTE FUNCTION app.guard_threat_alert_lifecycle_update();

GRANT SELECT, INSERT, UPDATE ON threat_alerts TO allura_app;

-- ── Schema version tracking ──────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '042',
    NOW(),
    'Story 26.4: threat_alerts table -- durable, tenant-routed, deduplicated exposure alerts with a restricted-column lifecycle (new/acknowledged/mitigated/resolved/stale), gated to lifecycle_state-only UPDATE.'
) ON CONFLICT (version) DO NOTHING;
