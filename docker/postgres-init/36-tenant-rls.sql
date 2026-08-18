-- Migration 36: Row-level security for tenant-scoped tables
-- Story 24.3 — Database-Enforced Tenant Isolation and Immutable Ledger
--
-- Note: audit_documents, audit_analyses, and suspicious_decisions already have
-- RLS policies from migration 08-bank-audit-workflow.sql. They use the same
-- app.current_group_id transaction-local setting. This migration extends the
-- same model to the remaining tenant-scoped tables.

-- Helper to fetch the active principal id from the transaction-local setting.
-- Used by global-reference write policies (e.g., tenants) that require admin.
CREATE OR REPLACE FUNCTION app.current_principal()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_principal', true), ''), '__NO_PRINCIPAL__');
$$;

-- Tenant-scoped tables: any access must match the active tenant.
-- Tables already covered by migration 08 are excluded.
DO $$
DECLARE
    tbl text;
    tenant_tables text[] := ARRAY[
        'adas_runs', 'agent_trajectories', 'allura_feedback', 'allura_memories',
        'approval_notifications', 'approval_transitions',
        'canonical_proposals', 'checkpoints', 'coherence_conflicts',
        'curator_config', 'curator_stats', 'design_sync_status', 'events',
        'evidence_packets', 'graph_memories', 'graph_structural_edges',
        'graph_structural_nodes', 'graph_supersedes', 'handoffs', 'lanes',
        'notion_sync_dlq', 'outcomes', 'pattern_proposals', 'process_definitions',
        'process_runs', 'projects', 'promotion_proposals', 'recovery_events',
        'ruvector_memory_fallback', 'skill_usage_events', 'sync_drift_log',
        'witness_logs', 'work_item_dependencies', 'work_items', 'workspaces'
    ];
BEGIN
    FOREACH tbl IN ARRAY tenant_tables
    LOOP
        -- Enable RLS and force it for the owner too, ensuring no accidental bypass.
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);

        -- Drop any existing policy to make re-runs idempotent.
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', tbl);

        -- ALL operations (SELECT, INSERT, UPDATE, DELETE) must match the active tenant.
        EXECUTE format(
            'CREATE POLICY tenant_isolation_policy ON %I FOR ALL TO allura_app USING (group_id = current_setting(''app.current_group_id'', true)) WITH CHECK (group_id = current_setting(''app.current_group_id'', true))',
            tbl
        );
    END LOOP;
END
$$;

-- Migration 08 already created tenant-scoped RLS policies for these tables.
-- Ensure they are forced so the owner/migration role cannot accidentally bypass.
ALTER TABLE audit_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_analyses FORCE ROW LEVEL SECURITY;
ALTER TABLE suspicious_decisions FORCE ROW LEVEL SECURITY;

-- Global-reference tables: tenant registry and membership.
-- These are not single-tenant-owned; reads must respect the principal's tenant
-- allowlist. We use a membership-aware policy for memberships, and an admin-write
-- policy for tenants.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_read_policy ON tenants;
DROP POLICY IF EXISTS tenants_write_policy ON tenants;
CREATE POLICY tenants_read_policy ON tenants FOR SELECT TO allura_app USING (true);
CREATE POLICY tenants_write_policy ON tenants FOR ALL TO allura_app USING (app.current_principal() = '__ADMIN__') WITH CHECK (app.current_principal() = '__ADMIN__');

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memberships_policy ON memberships;
CREATE POLICY memberships_policy ON memberships FOR ALL TO allura_app
    USING (group_id = current_setting('app.current_group_id', true))
    WITH CHECK (group_id = current_setting('app.current_group_id', true));

-- Credential table: mcp_tokens.
ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcp_tokens_policy ON mcp_tokens;
CREATE POLICY mcp_tokens_policy ON mcp_tokens FOR ALL TO allura_app
    USING (group_id = current_setting('app.current_group_id', true))
    WITH CHECK (group_id = current_setting('app.current_group_id', true));

-- Grant least-privilege DML on all real tables (excluding migration-only schema_versions)
-- to the app role.
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> 'schema_versions'
    LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO allura_app', tbl);
    END LOOP;

    -- Grant sequence usage for generated ids.
    EXECUTE 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO allura_app';
END
$$;

-- Grant full schema/object privileges to migration role.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO allura_migration;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO allura_migration;
