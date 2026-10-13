# Tenant Table Inventory

**Story:** 24.3 — Database-Enforced Tenant Isolation and Immutable Ledger
**Date:** 2026-08-18
**Status:** Draft — under review as part of Story 24.3

## Classification scheme

| Class | Definition | RLS treatment |
|---|---|---|
| `tenant-scoped` | Contains data owned by one tenant; application queries always filter by `group_id` | RLS `USING (group_id = current_setting('app.current_tenant')::text)` forced |
| `tenant-scoped-credential` | Credential/identity data bound to a tenant; access must follow principal tenant set | Same as tenant-scoped, plus policy references `current_setting('app.current_tenant')` |
| `global-reference` | Tenant existence/registration tables that must be readable across tenants for discovery, but writes are administrative | RLS on SELECT for membership rows, or no RLS but admin-only writes |
| `operational` | No `group_id`; internal platform state not scoped to a tenant | No RLS; write access restricted by role |
| `migration-only` | Managed exclusively by migration tooling; not accessed by application | No RLS; migration role only |

## Inventory

### Tenant-scoped tables

| Table | Rationale | group_id nullable? | Notes |
|---|---|---|---|
| `adas_runs` | Per-tenant ADAS execution records | review | |
| `agent_trajectories` | Per-tenant agent interaction history | review | |
| `allura_feedback` | Feedback data scoped to tenant | review | |
| `allura_memories` | Core memory store; tenant is primary shard key | no | Canonical governed memory |
| `approval_notifications` | Approval workflow notifications per tenant | review | |
| `approval_transitions` | Approval state transitions per tenant | review | |
| `audit_analyses` | Audit analyses scoped to tenant | review | |
| `audit_documents` | Audit documents scoped to tenant | review | |
| `canonical_proposals` | Canonical change proposals per tenant | review | |
| `checkpoints` | Process checkpoints per tenant | review | |
| `coherence_conflicts` | Coherence check conflicts per tenant | review | |
| `curator_config` | Curator configuration per tenant | review | |
| `curator_stats` | Curator statistics per tenant | review | |
| `design_sync_status` | Design sync state per tenant | review | |
| `events` | Append-only audit/event ledger; `group_id` is effective tenant | no | Immutable ledger — no UPDATE/DELETE |
| `evidence_packets` | Evidence packets per tenant | review | |
| `graph_memories` | Graph-backed memory per tenant | review | |
| `graph_structural_edges` | Graph edges per tenant | review | |
| `graph_structural_nodes` | Graph nodes per tenant | review | |
| `graph_supersedes` | Supersedes relationships per tenant | review | |
| `handoffs` | Handoff records per tenant | review | |
| `lanes` | Workflow lanes per tenant | review | |
| `notion_sync_dlq` | Notion sync dead-letter per tenant | review | |
| `outcomes` | Outcome records per tenant | review | |
| `pattern_proposals` | Pattern proposals per tenant | review | |
| `process_definitions` | Process definitions per tenant | review | |
| `process_runs` | Process executions per tenant | review | |
| `projects` | Projects per tenant | review | |
| `promotion_proposals` | Promotion proposals per tenant | review | |
| `recovery_events` | Recovery events per tenant | review | |
| `ruvector_memory_fallback` | RuVector fallback memory per tenant | review | |
| `skill_usage_events` | Skill usage events per tenant | review | |
| `suspicious_decisions` | Flagged decisions per tenant | review | |
| `sync_drift_log` | Drift log per tenant | review | |
| `witness_logs` | Witness logs per tenant | review | |
| `work_item_dependencies` | Work item dependencies per tenant | review | |
| `work_items` | Work items per tenant | review | |
| `workspaces` | Workspaces per tenant | review | FK target for many tenant-scoped tables |

### Global-reference / credential tables

| Table | Rationale | group_id nullable? | Notes |
|---|---|---|---|
| `mcp_tokens` | Per-tenant MCP credentials; but token lookup by prefix must work across tenant allowlists | review | See AC-3/AC-4 of Story 24.2 |
| `memberships` | Tenant membership records; may span tenants | review | Needs principal-based membership policy |
| `tenants` | Tenant registry | review | Read needed for onboarding; writes admin-only |

### Operational tables

| Table | Rationale | Notes |
|---|---|---|
| `insight_adoptions` | Cross-tenant platform insight adoption state | No `group_id` |
| `platform_insights` | Aggregated platform-level insights | No `group_id` |
| `platform_promotion_queue` | Platform-wide promotion queue | No `group_id` |
| `skill_usage_summary` | View over `skill_usage_events` | Not directly RLS-protected; protected via base table |

### Migration-only tables

| Table | Rationale | Notes |
|---|---|---|
| `schema_versions` | Migration tracking | Managed by migration tooling only |

## Open classification questions

1. Many tables list `group_id` nullable status as "review" because the schema inspection does not yet reveal nullability. Story 24.3 should resolve these to `NOT NULL` where appropriate.
2. `mcp_tokens` and `memberships` may require a different RLS shape because their access patterns depend on the principal's tenant allowlist, not a single active tenant. The transaction-local tenant setting may need to support an array or a membership-aware predicate.
3. `events` requires immutability (no UPDATE/DELETE) but its `group_id` must still match the active tenant on INSERT.

## Test contract

The inventory classification is machine-checkable via `src/lib/db/tenant-table-inventory.ts`. Adding a new table without updating the classification is a test failure.
