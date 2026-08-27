-- Migration 44: Persisted supply-chain inventory records
-- Bumblebee Guard (docs/allura/DESIGN-ALLURA.md) -- inventory reconciliation.
--
-- Story 26.2 built the normalization/matching primitive
-- (src/lib/inventory/service.ts) but it is deliberately in-memory only --
-- "no DB writes, no filesystem, no subprocesses" is its own stated design.
-- Nothing has ever persisted real inventory data, which meant Story 26.4's
-- discovery worker had no real packages to poll advisories against. This
-- table is that missing persistence layer.
--
-- MUTABILITY: unlike threat_alerts (migration 42) or mitigation_receipts
-- (migration 41), this is NOT an append-only or restricted-column table.
-- A real dependency's version and hash genuinely change between
-- reconciliation cycles -- this is a plain, fully-mutable tenant-scoped
-- reference table, closer to `workspaces` than to a receipt/ledger table.
-- Tenant isolation is enforced by RLS, not by a mutation-restricting
-- trigger.
--
-- FRESHNESS: a reconciliation cycle re-parses the source (bun.lock in this
-- first slice) and UPSERTs every record it finds as freshness_state='fresh'.
-- Any existing record NOT found in the latest parse is marked 'stale'
-- (never silently deleted or omitted -- Story 26.2 AC-5) by a separate
-- reconciliation step, not by this migration.

CREATE TABLE IF NOT EXISTS inventory_records (
  id TEXT NOT NULL,
  group_id TEXT NOT NULL CHECK (group_id ~ '^allura-[a-z0-9-]+$'),
  workspace_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'sbom', 'lockfile', 'package_manifest', 'ci_workflow', 'container_metadata',
    'extension', 'mcp_manifest', 'skill', 'plugin', 'model_artifact'
  )),
  ecosystem TEXT NOT NULL CHECK (LENGTH(TRIM(ecosystem)) > 0),
  package TEXT NOT NULL CHECK (LENGTH(TRIM(package)) > 0),
  version TEXT NOT NULL CHECK (LENGTH(TRIM(version)) > 0),
  hash TEXT NOT NULL CHECK (LENGTH(TRIM(hash)) > 0),
  publisher TEXT NOT NULL CHECK (LENGTH(TRIM(publisher)) > 0),
  workflow_reference TEXT NOT NULL CHECK (LENGTH(TRIM(workflow_reference)) > 0),
  source_ref TEXT NOT NULL CHECK (LENGTH(TRIM(source_ref)) > 0),
  trust_state TEXT NOT NULL CHECK (trust_state IN ('provisional', 'verified', 'rejected')),
  freshness_state TEXT NOT NULL CHECK (freshness_state IN ('fresh', 'stale', 'degraded', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, workspace_id, id),
  CONSTRAINT inventory_records_group_workspace_fkey
    FOREIGN KEY (group_id, workspace_id) REFERENCES workspaces(group_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS inventory_records_scope_type_idx
  ON inventory_records (group_id, workspace_id, artifact_type);

CREATE INDEX IF NOT EXISTS inventory_records_scope_package_idx
  ON inventory_records (group_id, workspace_id, ecosystem, package);

-- ── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE inventory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_records_workspace_isolation_policy ON inventory_records;
CREATE POLICY inventory_records_workspace_isolation_policy ON inventory_records
  FOR ALL TO allura_app
  USING (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  )
  WITH CHECK (
    group_id = current_setting('app.current_group_id', true)
    AND workspace_id = current_setting('app.current_workspace_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_records TO allura_app;

-- ── Schema version tracking ──────────────────────────────────────────────────
INSERT INTO schema_versions (version, applied_at, description)
VALUES (
    '044',
    NOW(),
    'Bumblebee Guard: inventory_records table -- persisted, tenant-scoped, fully-mutable supply-chain inventory. First real source: bun.lock reconciliation (src/lib/inventory/lockfile-parser.ts, reconciliation.ts).'
) ON CONFLICT (version) DO NOTHING;
