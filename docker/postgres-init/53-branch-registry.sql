-- Migration 53: branch registry and promotion receipts (governed branchable memory).
--
-- Branch state lives inside the existing PostgreSQL authority, tenant-scoped,
-- RLS-compatible, and is NOT a second memory authority: branch_registry
-- describes branches (status, retention, preserved diff snapshot) and
-- promotion_receipts records accepted promotions. Neither table writes
-- canonical memory; promotion still means creating a curator proposal, and
-- canonical writes still require the curator flow.
--
-- TENANCY (ADR-001): the ORGANIZATION is the only tenant boundary. RLS is
-- keyed on group_id = current_setting('app.current_group_id', true) exactly
-- like migrations 36/39/41. The workspace dimension stays at the API/CHECK
-- layer (workspace_id is a column, never a tenant of its own), matching the
-- 27.1 spike §4 design.
--
-- Status values mirror planning invariant 8: active plus the lifecycle
-- states degraded|expired|rejected|quarantined|rolled_back. Unbounded branch
-- retention is explicitly out of scope, so retention_expires_at is required
-- for non-active rows and enforced by CHECK.
--
-- promotion_receipts is append-only (immutable trigger, mirroring
-- governance_receipts in migration 39 and mitigation_receipts in 41): the
-- server issues the receipt at acceptance time and no later UPDATE or DELETE
-- can rewrite history. The trace_id is the deterministic promotion identity
-- (promo-<sha256 prefix>) so receipts are replayable and idempotent.

BEGIN;

-- ── Branch registry ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branch_registry (
  branch_id TEXT NOT NULL CHECK (LENGTH(TRIM(branch_id)) > 0),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  workspace_id TEXT NOT NULL CHECK (LENGTH(TRIM(workspace_id)) > 0),
  task_id TEXT,
  agent_id TEXT,
  base_snapshot_id TEXT,
  branch_revision TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'degraded', 'expired', 'rejected', 'quarantined', 'rolled_back')),
  quarantine_reason TEXT,
  diff_snapshot JSONB,
  quarantined_at TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL CHECK (LENGTH(TRIM(created_by)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT branch_registry_scope_key PRIMARY KEY (group_id, workspace_id, branch_id),
  -- Unbounded retention is out of scope: any non-active branch must expire.
  CONSTRAINT chk_branch_registry_retention
    CHECK (status = 'active' OR retention_expires_at IS NOT NULL),
  -- A quarantine must say why and must carry the preserved diff for replay.
  CONSTRAINT chk_branch_registry_quarantine
    CHECK (
      status NOT IN ('quarantined', 'rejected', 'rolled_back')
      OR (quarantine_reason IS NOT NULL AND diff_snapshot IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_branch_registry_status
  ON branch_registry (group_id, workspace_id, status, updated_at DESC);

-- ── Promotion receipts (immutable, server-issued) ──────────────────────────
CREATE TABLE IF NOT EXISTS promotion_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  workspace_id TEXT NOT NULL CHECK (LENGTH(TRIM(workspace_id)) > 0),
  proposal_id UUID NOT NULL,
  branch_id TEXT NOT NULL CHECK (LENGTH(TRIM(branch_id)) > 0),
  base_revision TEXT NOT NULL CHECK (LENGTH(TRIM(base_revision)) > 0),
  diff JSONB NOT NULL CHECK (
    jsonb_typeof(diff) = 'object'
    AND diff ? 'added' AND diff ? 'overridden' AND diff ? 'deleted'
  ),
  evidence_refs JSONB NOT NULL CHECK (
    jsonb_typeof(evidence_refs) = 'array' AND jsonb_array_length(evidence_refs) > 0
  ),
  actor_id TEXT NOT NULL CHECK (LENGTH(TRIM(actor_id)) > 0),
  trace_id TEXT NOT NULL CHECK (trace_id ~ '^promo-[a-f0-9]{16}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promotion_receipts_group_workspace_fkey
    FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id),
  CONSTRAINT promotion_receipts_replay_key
    UNIQUE (group_id, workspace_id, branch_id, trace_id)
);

CREATE INDEX IF NOT EXISTS promotion_receipts_scope_branch_issued_idx
  ON promotion_receipts (group_id, workspace_id, branch_id, issued_at DESC, id);

-- ── Referential integrity: receipts must reference a real proposal ─────────
-- Retro item (epic-27): promotion_receipts.proposal_id had no FK to
-- promotion_proposals(id). Idempotent so it applies on fresh and existing DBs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.promotion_receipts'::regclass
      AND conname = 'promotion_receipts_proposal_fkey'
  ) THEN
    ALTER TABLE promotion_receipts
      ADD CONSTRAINT promotion_receipts_proposal_fkey
      FOREIGN KEY (proposal_id) REFERENCES promotion_proposals(id);
  END IF;
END
$$;

-- ── Row-level security (tenant axis only; workspace stays at API/CHECK) ─────
ALTER TABLE branch_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE promotion_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_receipts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branch_registry_tenant_isolation_policy ON branch_registry;
CREATE POLICY branch_registry_tenant_isolation_policy ON branch_registry
  FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true));

DROP POLICY IF EXISTS promotion_receipts_tenant_isolation_policy ON promotion_receipts;
CREATE POLICY promotion_receipts_tenant_isolation_policy ON promotion_receipts
  FOR ALL TO allura_app
  USING (group_id = current_setting('app.current_group_id', true))
  WITH CHECK (group_id = current_setting('app.current_group_id', true));

-- ── Immutability (mirrors governance_receipts / mitigation_receipts) ────────
CREATE OR REPLACE FUNCTION app.prevent_promotion_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'promotion_receipts are immutable';
END;
$$;

DROP TRIGGER IF EXISTS promotion_receipts_immutable_trigger ON promotion_receipts;
CREATE TRIGGER promotion_receipts_immutable_trigger
  BEFORE UPDATE OR DELETE ON promotion_receipts
  FOR EACH ROW
  EXECUTE FUNCTION app.prevent_promotion_receipt_mutation();

GRANT SELECT, INSERT, UPDATE, DELETE ON branch_registry TO allura_app;
GRANT SELECT, INSERT ON promotion_receipts TO allura_app;

-- ── Schema version tracking ─────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
  '053',
  NOW(),
  'Governed branchable memory: tenant-scoped branch_registry (status incl. degraded/expired/rejected/quarantined/rolled_back, retention_expires_at, preserved diff snapshot) and immutable server-issued promotion_receipts with deterministic trace_id'
) ON CONFLICT (version) DO NOTHING;

COMMIT;
