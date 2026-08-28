import { getPool } from "@/lib/postgres/connection";

/**
 * Machine-checked tenant table inventory.
 *
 * Any new table added to the database must be classified here, or the
 * `validateTenantTableInventory` test will fail. This forces a deliberate
 * decision about RLS treatment.
 */

export type TenantTableClass =
  | "tenant-scoped"
  | "tenant-scoped-credential"
  | "global-reference"
  | "operational"
  | "migration-only";

export interface TableClassification {
  table: string;
  class: TenantTableClass;
  notes: string;
  workspaceTreatment?: "workspace-scoped-new-writes" | "legacy-unscoped-excluded";
}

export const TENANT_TABLE_INVENTORY: readonly TableClassification[] = [
  // Core tenant-scoped tables
  { table: "allura_memories", class: "tenant-scoped", notes: "Migration 40 scopes new app writes and explicitly quarantines legacy NULL-workspace knowledge", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "events", class: "tenant-scoped", notes: "New writes carry workspace; legacy NULL rows remain excluded", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "workspaces", class: "tenant-scoped", notes: "Tenant workspace registry; FK target" },
  { table: "projects", class: "tenant-scoped", notes: "Tenant projects" },
  { table: "work_items", class: "tenant-scoped", notes: "Tenant work items" },
  { table: "work_item_dependencies", class: "tenant-scoped", notes: "Tenant work item dependencies" },
  { table: "checkpoints", class: "tenant-scoped", notes: "Process checkpoints" },
  { table: "lanes", class: "tenant-scoped", notes: "Workflow lanes" },
  { table: "handoffs", class: "tenant-scoped", notes: "Handoff records" },
  { table: "outcomes", class: "tenant-scoped", notes: "Outcome records" },
  { table: "process_definitions", class: "tenant-scoped", notes: "Process definitions" },
  { table: "process_runs", class: "tenant-scoped", notes: "Process executions" },
  { table: "evidence_packets", class: "tenant-scoped", notes: "Evidence packets" },
  { table: "canonical_proposals", class: "tenant-scoped", notes: "New writes carry workspace; legacy NULL rows remain excluded", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "promotion_proposals", class: "tenant-scoped", notes: "Promotion proposals" },
  { table: "pattern_proposals", class: "tenant-scoped", notes: "Pattern proposals" },
  { table: "approval_notifications", class: "tenant-scoped", notes: "Approval notifications" },
  { table: "approval_transitions", class: "tenant-scoped", notes: "Approval transitions" },
  { table: "audit_analyses", class: "tenant-scoped", notes: "Audit analyses" },
  { table: "audit_documents", class: "tenant-scoped", notes: "Audit documents" },
  { table: "curator_config", class: "tenant-scoped", notes: "Curator configuration" },
  { table: "curator_stats", class: "tenant-scoped", notes: "Curator statistics" },
  { table: "design_sync_status", class: "tenant-scoped", notes: "Design sync state" },
  { table: "coherence_conflicts", class: "tenant-scoped", notes: "Coherence conflicts" },
  { table: "recovery_events", class: "tenant-scoped", notes: "Recovery events" },
  { table: "suspicious_decisions", class: "tenant-scoped", notes: "Flagged decisions" },
  { table: "sync_drift_log", class: "tenant-scoped", notes: "Drift log" },
  { table: "witness_logs", class: "tenant-scoped", notes: "Witness logs" },
  { table: "adas_runs", class: "tenant-scoped", notes: "ADAS execution records" },
  { table: "agent_trajectories", class: "tenant-scoped", notes: "Agent interaction history" },
  { table: "allura_feedback", class: "tenant-scoped", notes: "Feedback data" },
  { table: "graph_memories", class: "tenant-scoped", notes: "Canonical promoted memory; Migration 40 requires exact workspace for new rows and quarantines legacy NULL workspace rows", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "graph_structural_edges", class: "tenant-scoped", notes: "Graph edges" },
  { table: "graph_structural_nodes", class: "tenant-scoped", notes: "Graph nodes" },
  { table: "graph_supersedes", class: "tenant-scoped", notes: "Supersedes relationships" },
  { table: "notion_sync_dlq", class: "tenant-scoped", notes: "Notion sync dead-letter" },
  { table: "ruvector_memory_fallback", class: "tenant-scoped", notes: "RuVector fallback memory" },
  { table: "skill_usage_events", class: "tenant-scoped", notes: "Skill usage events" },
  { table: "promotion_outbox", class: "tenant-scoped", notes: "Migration 40 workspace-scoped delivery; legacy NULL-workspace rows are quarantined", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "promotion_idempotency", class: "tenant-scoped", notes: "Migration 40 workspace-scoped replay identity; legacy NULL-workspace rows are quarantined", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "evidence_requests", class: "tenant-scoped", notes: "Workspace-scoped evidence request lifecycle", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "governance_receipts", class: "tenant-scoped", notes: "Immutable workspace-scoped governance receipts", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "governance_receipt_evidence_requests", class: "tenant-scoped", notes: "Immutable FK-backed complete receipt evidence membership", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "governance_receipts_legacy_archive", class: "migration-only", notes: "Quarantined pre-040 receipt envelopes; no application grants" },
  { table: "semantic_projections", class: "tenant-scoped", notes: "Versioned derived workspace semantic projections", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "mitigation_receipts", class: "tenant-scoped", notes: "Story 26.5 (migration 41): immutable governed mitigation-draft approval/rejection receipts, gated by REQ-GOV-008 approval_ref", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "threat_alerts", class: "tenant-scoped", notes: "Story 26.4 (migration 42): durable, deduplicated exposure alerts; UPDATE restricted to lifecycle_state/updated_at only", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "inventory_records", class: "tenant-scoped", notes: "Bumblebee Guard (migration 44): persisted, fully-mutable supply-chain inventory reconciled from bun.lock (lockfile) and .github/workflows (ci_workflow)", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "containment_receipts", class: "tenant-scoped", notes: "Story 26.6 (migration 45): immutable governed containment-action receipts, gated by REQ-GOV-008 approval_ref and AD-58 admin-role constraint", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "bumblebee_catalog_revisions", class: "tenant-scoped", notes: "Story 26.7 (migration 46): immutable approved scanner catalog revisions", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "bumblebee_catalog_entries", class: "tenant-scoped", notes: "Story 26.7 (migration 46): immutable normalized entries bound to a scoped catalog revision", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "bumblebee_sources", class: "tenant-scoped", notes: "Story 26.7 (migration 46): immutable scanner source/population revisions with one-way soft-disable", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "bumblebee_scan_leases", class: "tenant-scoped-credential", notes: "Story 26.7 (migration 47): source-bound monotonic leases with short-lived hashed ingest credentials", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "bumblebee_batch_receipts", class: "tenant-scoped", notes: "Story 26.7 (migration 48): immutable atomic ingest acceptance receipts", workspaceTreatment: "workspace-scoped-new-writes" },
  { table: "bumblebee_records", class: "tenant-scoped", notes: "Story 26.7 (migration 48): immutable sanitized upstream records", workspaceTreatment: "workspace-scoped-new-writes" },

  // Credential / identity tables
  { table: "mcp_tokens", class: "tenant-scoped-credential", notes: "MCP credentials; lookup by token prefix before tenant resolution" },
  { table: "bumblebee_runner_credentials", class: "tenant-scoped-credential", notes: "Story 26.7 dedicated runner credentials; exclusive bumblebee_runner audience and one-way revocation" },
  { table: "memberships", class: "tenant-scoped-credential", notes: "Tenant membership; may span tenant allowlist" },

  // Global reference
  { table: "tenants", class: "global-reference", notes: "Tenant registry; writes admin-only" },
  // Operational tables: no group_id, or views over operational data.
  { table: "insight_adoptions", class: "operational", notes: "Cross-tenant platform insight adoption state" },
  { table: "platform_insights", class: "operational", notes: "Aggregated platform-level insights" },
  { table: "platform_promotion_queue", class: "operational", notes: "Platform-wide promotion queue" },
  { table: "skill_usage_summary", class: "operational", notes: "View over skill_usage_events; not directly RLS-protected" },

  // Migration-only
  { table: "schema_versions", class: "migration-only", notes: "Migration tracking; managed by migration tooling" },
];

export const TABLES_REQUIRING_RLS: readonly string[] = TENANT_TABLE_INVENTORY
  .filter((t) => t.class === "tenant-scoped" || t.class === "tenant-scoped-credential")
  .map((t) => t.table);

export const TABLES_WITH_GROUP_ID: readonly string[] = TENANT_TABLE_INVENTORY
  .filter((t) => t.class !== "operational" && t.class !== "migration-only")
  .map((t) => t.table);

/**
 * Validate that every table in the public schema is classified and that every
 * tenant-scoped table has RLS enabled. Returns a structured report.
 */
export async function validateTenantTableInventory(): Promise<{
  unclassifiedTables: string[];
  missingRlsTables: string[];
  ok: boolean;
}> {
  const pool = getPool();
  const { rows: tables } = await pool.query<{ table_name: string } >(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  const tableNames = tables.map((r) => r.table_name);
  const classifiedTables = new Set(TENANT_TABLE_INVENTORY.map((t) => t.table));
  const unclassifiedTables = tableNames.filter((t) => !classifiedTables.has(t));

  const { rows: rlsRows } = await pool.query<{ tablename: string; relrowsecurity: boolean; relforcerowsecurity: boolean } >(
    `SELECT c.relname AS tablename, c.relrowsecurity, c.relforcerowsecurity
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relname = ANY($1::text[])
     ORDER BY c.relname`,
    [TABLES_REQUIRING_RLS],
  );
  const rlsEnabled = new Set(
    rlsRows.filter((r) => r.relrowsecurity && r.relforcerowsecurity).map((r) => r.tablename),
  );
  const missingRlsTables = TABLES_REQUIRING_RLS.filter((t) => !rlsEnabled.has(t));

  return {
    unclassifiedTables,
    missingRlsTables,
    ok: unclassifiedTables.length === 0 && missingRlsTables.length === 0,
  };
}
