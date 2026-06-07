/**
 * Allura Governance Policy Registry
 *
 * The 6 canonical Allura invariants are the authoritative governance policy set.
 * These are defined as a static registry — no mutable governance_policies table.
 * Overrides are written as governance_policy_updated events in the events table
 * and must be HITL-gated.
 *
 * Reference: docs/allura/BLUEPRINT.md, SOLUTION-ARCHITECTURE.md
 */

if (typeof window !== "undefined") throw new Error("server-side only")

// ── Policy Types ────────────────────────────────────────────────────────────

export type PolicySeverity = "critical" | "high" | "medium" | "low"
export type InvariantKey =
  | "group_id_required"
  | "append_only_events"
  | "neo4j_supersedes"
  | "hitl_promotion"
  | "db_connection_only"
  | "allura_namespace"

export interface GovernancePolicy {
  /** Stable policy identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Full description of what the policy enforces */
  description: string
  /** Enforcement severity */
  severity: PolicySeverity
  /** Which invariant key this policy maps to */
  invariant_key: InvariantKey
  /** Whether this policy can be overridden via governance_update_policy (HITL-gated) */
  overridable: boolean
  /** Policy version — incremented when updated via HITL */
  version: number
  /** ISO timestamp of last update */
  updated_at: string
}

// ── Static Policy Registry ─────────────────────────────────────────────────

/**
 * The canonical 6-policy registry.
 * This is the source of truth for governance_list_policies and governance_get_policy.
 * Updates are applied via HITL-gated governance_update_policy events and merged at runtime.
 */
export const CANONICAL_POLICIES: readonly GovernancePolicy[] = Object.freeze([
  {
    id: "pol-001",
    name: "group_id Required on Every Operation",
    description:
      "Every database read and write MUST include a valid group_id matching the pattern " +
      "^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$. " +
      "Missing or invalid group_id causes a CHECK constraint failure. " +
      "This is the primary tenant isolation boundary.",
    severity: "critical",
    invariant_key: "group_id_required",
    overridable: false,
    version: 1,
    updated_at: "2026-06-06T00:00:00.000Z",
  },
  {
    id: "pol-002",
    name: "Append-Only Events (No UPDATE/DELETE)",
    description:
      "The PostgreSQL events table is append-only. " +
      "No UPDATE or DELETE operations are permitted on trace rows, ever. " +
      "Soft-deletes are implemented by appending a memory_delete event. " +
      "Updates create a new row, not a mutation of existing rows.",
    severity: "critical",
    invariant_key: "append_only_events",
    overridable: false,
    version: 1,
    updated_at: "2026-06-06T00:00:00.000Z",
  },
  {
    id: "pol-003",
    name: "Neo4j Versioning via SUPERSEDES",
    description:
      "Neo4j knowledge nodes are never mutated in-place. " +
      "All updates create a new node and link it with a SUPERSEDES relationship: " +
      "(v2)-[:SUPERSEDES]->(v1:deprecated). " +
      "The old node is marked :deprecated but never deleted. " +
      "This preserves full lineage for audit trails.",
    severity: "critical",
    invariant_key: "neo4j_supersedes",
    overridable: false,
    version: 1,
    updated_at: "2026-06-06T00:00:00.000Z",
  },
  {
    id: "pol-004",
    name: "HITL Required for Promotion",
    description:
      "Agents cannot autonomously promote memories to the Neo4j semantic layer. " +
      "Eligible memories queue into canonical_proposals for human review. " +
      "PROMOTION_MODE=auto is retained for backward-compatible env parsing only; " +
      "canonical promotion is always HITL-gated. " +
      "This invariant enforces the SOC2 governance posture.",
    severity: "critical",
    invariant_key: "hitl_promotion",
    overridable: false,
    version: 1,
    updated_at: "2026-06-06T00:00:00.000Z",
  },
  {
    id: "pol-005",
    name: "DB Operations via Canonical Connection Only",
    description:
      "All database operations MUST use the canonical connection helper " +
      "(getConnections() from canonical-tools/connection.ts). " +
      "Direct shell or exec access for data operations is forbidden. " +
      "This ensures all queries are governed by circuit breakers and budget enforcement.",
    severity: "high",
    invariant_key: "db_connection_only",
    overridable: false,
    version: 1,
    updated_at: "2026-06-06T00:00:00.000Z",
  },
  {
    id: "pol-006",
    name: "allura-* Tenant Namespace Enforcement",
    description:
      "All group_ids MUST use the allura-* namespace: ^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$. " +
      "Deprecated tenant patterns are not accepted and must be flagged as drift. " +
      "The default tenant for system operations is allura-system.",
    severity: "critical",
    invariant_key: "allura_namespace",
    overridable: false,
    version: 1,
    updated_at: "2026-06-06T00:00:00.000Z",
  },
] as const)

/**
 * Lookup a policy by ID from the static registry.
 * Returns undefined if not found.
 */
export function findPolicyById(id: string): GovernancePolicy | undefined {
  return CANONICAL_POLICIES.find((p) => p.id === id)
}

/**
 * Merge static policy with any approved HITL override.
 * Used by governance handlers to apply event-sourced overrides.
 */
export function mergePolicyOverride(
  base: GovernancePolicy,
  override: Partial<Pick<GovernancePolicy, "description" | "severity" | "version" | "updated_at">>
): GovernancePolicy {
  return {
    ...base,
    description: override.description ?? base.description,
    severity: override.severity ?? base.severity,
    version: override.version ?? base.version,
    updated_at: override.updated_at ?? base.updated_at,
  }
}
