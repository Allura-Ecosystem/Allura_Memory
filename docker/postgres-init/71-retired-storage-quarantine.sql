-- Forward-only retirement of unused sync/replay storage. Preserve every row and
-- all shipped migrations. No active source consumer remains; the app must not
-- resume replay or synchronization from these historical tables.
BEGIN;
CREATE SCHEMA IF NOT EXISTS retired_storage;
REVOKE ALL ON SCHEMA retired_storage FROM PUBLIC, allura_app;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['design_sync_status','sync_drift_log','ruvector_memory_fallback'] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      IF to_regclass(format('retired_storage.%I', table_name)) IS NOT NULL THEN
        RAISE EXCEPTION 'Archive collision for %; operator reconciliation required', table_name;
      END IF;
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA retired_storage', table_name);
    END IF;
    IF to_regclass(format('retired_storage.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE retired_storage.%I FROM PUBLIC, allura_app', table_name);
      EXECUTE format('COMMENT ON TABLE retired_storage.%I IS %L', table_name,
        'Historical storage, quarantined from runtime. Data retained; no replay or sync consumer.');
    END IF;
  END LOOP;
END $$;

-- Refresh current catalog descriptions without altering historical migration files.
COMMENT ON TABLE public.canonical_proposals IS 'Human-reviewed semantic promotion queue. Atomic approval creates graph_memories and governance evidence.';
COMMENT ON COLUMN public.canonical_proposals.status IS 'pending: awaiting human review; approved: atomic semantic promotion; rejected: retained decision evidence';
COMMENT ON TABLE public.graph_memories IS 'Workspace-scoped semantic memory in PostgreSQL. New versions preserve prior content and SUPERSEDES lineage.';
COMMENT ON TABLE public.graph_supersedes IS 'Immutable workspace-scoped version edges from newer_id to superseded_id.';
COMMENT ON COLUMN public.graph_memories.content_tsv IS 'PostgreSQL generated full-text search vector derived from content.';
COMMENT ON COLUMN public.graph_supersedes.newer_id IS 'Identity of the newer semantic version.';
COMMENT ON COLUMN public.graph_supersedes.superseded_id IS 'Identity of the preserved prior semantic version.';
COMMENT ON TABLE public.graph_structural_nodes IS 'Workspace-scoped structural context nodes in PostgreSQL.';
COMMENT ON TABLE public.graph_structural_edges IS 'Workspace-scoped structural relationships in PostgreSQL.';
COMMIT;
