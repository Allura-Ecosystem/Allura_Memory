-- ============================================================================
-- Story 22.1: Tenant Registry Table
-- ============================================================================
-- Purpose: Single source of truth for all tenant namespaces in Allura Memory.
--   Every group_id that writes memories must be registered here first.
--   The kernel target-resolver validates tenant existence on writes and
--   fails closed if the tenant is not registered.
--
-- Design:
--   * group_id is the PRIMARY KEY (TEXT, CHECK ^allura-[a-z0-9-]+$)
--   * config JSONB stores per-tenant curator settings (Story 22.4)
--   * active flag allows soft-deactivation without losing history
--   * Idempotent — safe to run on existing databases
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  group_id       TEXT        PRIMARY KEY,
  name           TEXT        NOT NULL,
  description    TEXT        NOT NULL DEFAULT '',
  owner_agent_id TEXT        NOT NULL DEFAULT '',
  config         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tenant isolation: group_id must match ^allura-[a-z0-9-]+$ ───────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenants_group_id_format'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT chk_tenants_group_id_format
      CHECK (group_id ~ '^allura-[a-z0-9-]+$');
  END IF;
END $$;

-- ── name must be non-empty ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenants_name_not_empty'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT chk_tenants_name_not_empty
      CHECK (LENGTH(TRIM(name)) > 0);
  END IF;
END $$;

-- ── Index for active tenant lookups ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenants_active
  ON tenants(active) WHERE active = TRUE;

-- ── Seed existing tenants ───────────────────────────────────────────────────
-- These tenants already have data in the system; we register them so the
-- target-resolver validation passes. ON CONFLICT DO NOTHING for idempotency.
INSERT INTO tenants (group_id, name, description, owner_agent_id, config, active)
VALUES
  ('allura-system',         'Allura System',         'System-internal tenant for governance, architecture decisions, and platform operations.', 'gilliam', '{}'::jsonb, TRUE),
  ('allura-faithmeats',     'Faith Meats',           'Faith Meats business tenant — halal meat processing, USDA compliance, stakeholder communications.', 'brooks',  '{}'::jsonb, TRUE),
  ('allura-difference-driven', 'Difference Driven',  'Difference Driven nonprofit tenant — community impact, grants, 501c3 operations.', 'brooks',  '{}'::jsonb, TRUE),
  ('allura-coding',         'Coding',                'Coding workspace tenant — development, technical decisions, and engineering workflows.', 'knuth',   '{}'::jsonb, TRUE)
ON CONFLICT (group_id) DO NOTHING;

-- ── Documentation ───────────────────────────────────────────────────────────
COMMENT ON TABLE tenants IS
  'Tenant registry — source of truth for all tenant namespaces. group_id must be registered here before kernel writes are accepted. Story 22.1.';
COMMENT ON COLUMN tenants.group_id IS
  'Tenant namespace identifier (allura-* format, enforced by CHECK constraint). Primary key.';
COMMENT ON COLUMN tenants.name IS
  'Human-readable tenant name.';
COMMENT ON COLUMN tenants.description IS
  'Description of the tenant purpose and scope.';
COMMENT ON COLUMN tenants.owner_agent_id IS
  'Agent responsible for this tenant.';
COMMENT ON COLUMN tenants.config IS
  'Per-tenant configuration JSONB (promotion_threshold, auto_approval_mode, curator_schedule_hours, drift_audit_enabled). Story 22.4.';
COMMENT ON COLUMN tenants.active IS
  'Whether the tenant is active. Inactive tenants fail closed at MCP startup. Story 22.3.';
COMMENT ON COLUMN tenants.created_at IS
  'When the tenant was registered.';

-- ── Record schema version ───────────────────────────────────────────────────
INSERT INTO schema_versions (version, description)
VALUES ('1.3.0-tenant-registry', 'Tenant registry table with seed data and group_id CHECK constraint')
ON CONFLICT (version) DO NOTHING;