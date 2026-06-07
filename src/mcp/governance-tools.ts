/**
 * Governance MCP Tool Handlers (Story 9.1)
 *
 * Implements 5 governance tools for the canonical Allura Brain MCP server:
 * 1. governance_list_policies   — list all 6 invariant policies
 * 2. governance_get_policy      — retrieve a single policy by ID
 * 3. governance_check_gate      — evaluate 6 invariants for a proposed action
 * 4. governance_update_policy   — HITL-gated policy override
 * 5. governance_audit_log       — paginated read of governance audit events
 *
 * Architecture decisions (Brooks, 2026-06-06):
 * - SCHEMA: append-only events table (no new mutable governance_policies table)
 * - REGISTRY: 6 invariants are static in src/lib/governance/policies.ts
 * - UPDATES: governance_policy_updated events record HITL-approved overrides
 * - HITL gate: governance_update_policy verifies an approved + unconsumed
 *   canonical_proposals entry, then appends governance_approval_consumed so
 *   the same approval cannot be replayed
 *
 * Governance invariants (enforced on every call):
 * - group_id validated via validateGroupId (^allura-[a-z0-9-]+$ pattern)
 * - All DB ops via getConnections() — never direct exec
 * - All writes are INSERTs into events table (append-only)
 * - No autonomous Neo4j promotion
 * - Parameterized SQL only
 */

if (typeof window !== "undefined") throw new Error("server-side only")

import { classifyPostgresError, DatabaseQueryError, DatabaseUnavailableError } from "@/lib/errors/database-errors"
import type {
  GovernanceAuditLogRequest,
  GovernanceAuditLogResponse,
  GovernanceCheckGateRequest,
  GovernanceCheckGateResponse,
  GovernanceGetPolicyRequest,
  GovernanceGetPolicyResponse,
  GovernanceListPoliciesRequest,
  GovernanceListPoliciesResponse,
  GovernancePolicyRecord,
  GovernanceUpdatePolicyRequest,
  GovernanceUpdatePolicyResponse,
} from "@/lib/memory/canonical-contracts"
import { CANONICAL_POLICIES, findPolicyById, mergePolicyOverride } from "@/lib/governance/policies"
import { baseMeta } from "./canonical-tools/validation-utils"
import { getConnections } from "./canonical-tools/connection"
import { validateGroupId } from "./canonical-tools/validation-utils"
import { withCircuitBreaker } from "./canonical-tools/budget-circuit"

// ── Governance event types written to the events table ────────────────────

const GOVERNANCE_EVENT_TYPES = [
  "governance_policy_updated",
  "governance_gate_checked",
  "governance_approval_consumed",
] as const

type GovernanceEventType = (typeof GOVERNANCE_EVENT_TYPES)[number]

// ── Helper: resolve latest policy override from events table ─────────────

interface PolicyOverrideRow {
  event_id: string
  description: string | null
  severity: string | null
  version: number | null
  updated_at: string
}

async function fetchPolicyOverride(
  pg: Awaited<ReturnType<typeof getConnections>>["pg"],
  groupId: string,
  policyId: string
): Promise<PolicyOverrideRow | null> {
  const result = await pg.query<{
    id: string
    metadata: Record<string, unknown>
    created_at: string
  }>(
    `SELECT id, metadata, created_at
     FROM events
     WHERE group_id = $1
       AND event_type = 'governance_policy_updated'
       AND metadata->>'policy_id' = $2
       AND status = 'completed'
     ORDER BY created_at DESC
     LIMIT 1`,
    [groupId, policyId]
  )

  if (result.rows.length === 0) return null

  const row = result.rows[0]
  const meta = row.metadata
  return {
    event_id: String(row.id),
    description: typeof meta.description === "string" ? meta.description : null,
    severity: typeof meta.severity === "string" ? meta.severity : null,
    version: typeof meta.version === "number" ? meta.version : null,
    updated_at: row.created_at,
  }
}

// ── 1. governance_list_policies ──────────────────────────────────────────

/**
 * Returns all 6 canonical invariant policies, merged with any approved HITL
 * overrides found in the events table. Read-only — no DB writes.
 */
export async function governance_list_policies(
  request: GovernanceListPoliciesRequest
): Promise<GovernanceListPoliciesResponse> {
  const groupId = validateGroupId(request.group_id)

  try {
    const { pg } = await getConnections()

    // Fetch any approved overrides for all policies in one query
    const overridesResult = await withCircuitBreaker(
      "postgres",
      groupId,
      "governance_list_policies:fetch_overrides",
      async () =>
        pg.query<{
          policy_id: string
          id: string
          metadata: Record<string, unknown>
          created_at: string
        }>(
          `SELECT DISTINCT ON (metadata->>'policy_id')
             metadata->>'policy_id' AS policy_id,
             id,
             metadata,
             created_at
           FROM events
           WHERE group_id = $1
             AND event_type = 'governance_policy_updated'
             AND status = 'completed'
           ORDER BY metadata->>'policy_id', created_at DESC`,
          [groupId]
        )
    )

    const overrideMap = new Map<string, PolicyOverrideRow>()
    for (const row of overridesResult.rows) {
      const policyId = row.policy_id
      if (policyId) {
        const meta = row.metadata
        overrideMap.set(policyId, {
          event_id: String(row.id),
          description: typeof meta.description === "string" ? meta.description : null,
          severity: typeof meta.severity === "string" ? meta.severity : null,
          version: typeof meta.version === "number" ? meta.version : null,
          updated_at: row.created_at,
        })
      }
    }

    const policies: GovernancePolicyRecord[] = CANONICAL_POLICIES.map((base) => {
      const override = overrideMap.get(base.id)
      if (!override) return base as GovernancePolicyRecord
      const merged = mergePolicyOverride(base, {
        description: override.description ?? undefined,
        severity: override.severity as GovernancePolicyRecord["severity"] | undefined,
        version: override.version ?? undefined,
        updated_at: override.updated_at,
      })
      return merged as GovernancePolicyRecord
    })

    return {
      policies,
      count: policies.length,
      meta: baseMeta(["postgres"]),
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "governance_list_policies", "SELECT events")
    }
    throw error
  }
}

// ── 2. governance_get_policy ─────────────────────────────────────────────

/**
 * Retrieves a single policy by ID, merged with any approved HITL override.
 * Returns 404-style error if policy_id is not in the canonical registry.
 */
export async function governance_get_policy(
  request: GovernanceGetPolicyRequest
): Promise<GovernanceGetPolicyResponse> {
  const groupId = validateGroupId(request.group_id)

  if (!request.policy_id || typeof request.policy_id !== "string") {
    throw new Error("policy_id is required and must be a string")
  }

  const base = findPolicyById(request.policy_id)
  if (!base) {
    throw new Error(`Policy not found: ${request.policy_id}. Valid IDs: ${CANONICAL_POLICIES.map((p) => p.id).join(", ")}`)
  }

  try {
    const { pg } = await getConnections()

    const override = await withCircuitBreaker(
      "postgres",
      groupId,
      "governance_get_policy:fetch_override",
      async () => fetchPolicyOverride(pg, groupId, request.policy_id)
    )

    if (!override) {
      return {
        policy: base as GovernancePolicyRecord,
        override_event_id: null,
        meta: baseMeta(["postgres"]),
      }
    }

    const merged = mergePolicyOverride(base, {
      description: override.description ?? undefined,
      severity: override.severity as GovernancePolicyRecord["severity"] | undefined,
      version: override.version ?? undefined,
      updated_at: override.updated_at,
    })

    return {
      policy: merged as GovernancePolicyRecord,
      override_event_id: override.event_id,
      meta: baseMeta(["postgres"]),
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "governance_get_policy", "SELECT events")
    }
    throw error
  }
}

// ── 3. governance_check_gate ─────────────────────────────────────────────

/**
 * Evaluates all 6 invariants for a proposed action and returns pass/fail per check.
 * Appends a governance_gate_checked event to the events table.
 * Always completes — individual invariant failures are non-throwing (they set pass=false).
 */
export async function governance_check_gate(
  request: GovernanceCheckGateRequest
): Promise<GovernanceCheckGateResponse> {
  const groupId = validateGroupId(request.group_id)
  const checkedAt = new Date().toISOString()

  if (!request.action || typeof request.action !== "string") {
    throw new Error("action is required and must be a non-empty string")
  }

  const ctx = request.context ?? {}

  // Evaluate each of the 6 invariants
  const checks = evaluateInvariants(groupId, request.action, ctx)
  const overallPass = checks.every((c) => c.pass)

  try {
    const { pg } = await getConnections()

    // Append governance_gate_checked event (append-only)
    await withCircuitBreaker("postgres", groupId, "governance_check_gate:insert_event", async () =>
      pg.query(
        `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          groupId,
          "governance_gate_checked",
          (ctx.agent_id as string) || "governance-tool",
          "completed",
          JSON.stringify({
            action: request.action,
            pass: overallPass,
            checks,
            context: ctx,
          }),
          checkedAt,
        ]
      )
    )
  } catch (error) {
    // Gate check result is still returned even if event logging fails
    // This prevents a PG issue from blocking governance evaluation
    const msg = error instanceof Error ? error.message : String(error)
    console.warn(`[governance_check_gate] Event logging failed (non-blocking): ${msg}`)
  }

  return {
    pass: overallPass,
    action: request.action,
    checks,
    checked_at: checkedAt,
    meta: baseMeta(["postgres"]),
  }
}

/**
 * Evaluate all 6 invariants for a given action and context.
 * Returns one check per invariant.
 */
function evaluateInvariants(
  groupId: string,
  action: string,
  ctx: Record<string, unknown>
): GovernanceCheckGateResponse["checks"] {
  return [
    // 1. group_id required — already validated upstream; check context too
    {
      invariant: "group_id Required on Every Operation",
      invariant_key: "group_id_required",
      pass: Boolean(groupId && groupId.startsWith("allura-")),
      reason: groupId && groupId.startsWith("allura-")
        ? `group_id '${groupId}' is valid and present`
        : `group_id '${groupId}' is missing or does not start with 'allura-'`,
    },

    // 2. append-only events — flag any UPDATE/DELETE action keyword
    {
      invariant: "Append-Only Events (No UPDATE/DELETE)",
      invariant_key: "append_only_events",
      pass: !/(update|delete|mutate|overwrite)/i.test(action) || action.startsWith("governance_update_policy"),
      reason: !/(update|delete|mutate|overwrite)/i.test(action) || action.startsWith("governance_update_policy")
        ? "Action does not attempt direct mutation of event rows"
        : `Action '${action}' contains a mutation keyword; must use append-only INSERT instead`,
    },

    // 3. Neo4j SUPERSEDES — flag any direct neo4j edit action
    {
      invariant: "Neo4j Versioning via SUPERSEDES",
      invariant_key: "neo4j_supersedes",
      pass: !/(neo4j.*edit|neo4j.*mutate|set.*node|edit.*node)/i.test(action),
      reason: !/(neo4j.*edit|neo4j.*mutate|set.*node|edit.*node)/i.test(action)
        ? "Action does not attempt direct Neo4j node mutation"
        : `Action '${action}' implies direct Neo4j node mutation; use SUPERSEDES pattern instead`,
    },

    // 4. HITL promotion — flag any autonomous_promote or direct semantic write
    {
      invariant: "HITL Required for Promotion",
      invariant_key: "hitl_promotion",
      pass:
        !/(autonomous.*promot|direct.*promot|auto.*promot|skip.*hitl|bypass.*hitl)/i.test(action) &&
        !(ctx.bypass_hitl === true),
      reason:
        (ctx.bypass_hitl === true)
          ? "Context contains bypass_hitl=true; HITL is mandatory and cannot be bypassed"
          : !/(autonomous.*promot|direct.*promot|auto.*promot|skip.*hitl|bypass.*hitl)/i.test(action)
          ? "Action does not attempt to bypass HITL promotion gate"
          : `Action '${action}' implies autonomous promotion; must route through canonical_proposals`,
    },

    // 5. DB via canonical connection only — flag docker exec or raw shell patterns
    {
      invariant: "DB Operations via Canonical Connection Only",
      invariant_key: "db_connection_only",
      pass: !(ctx.via_docker_exec === true || ctx.via_raw_shell === true),
      reason:
        ctx.via_docker_exec === true
          ? "Context indicates docker exec access; use getConnections() instead"
          : ctx.via_raw_shell === true
          ? "Context indicates raw shell access; use getConnections() instead"
          : "DB operation uses canonical connection helper",
    },

    // 6. allura-* namespace
    {
      invariant: "allura-* Tenant Namespace Enforcement",
      invariant_key: "allura_namespace",
      pass: /^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(groupId),
      reason: /^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(groupId)
        ? `group_id '${groupId}' matches required allura-* namespace pattern`
        : `group_id '${groupId}' does not match ^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`,
    },
  ]
}

// ── 4. governance_update_policy ──────────────────────────────────────────

/**
 * HITL-gated policy override.
 *
 * Flow:
 * 1. Validate group_id, policy_id, approval_ref
 * 2. Verify approval_ref exists in canonical_proposals with status='approved'
 * 3. Verify approval_ref has not already been consumed (no governance_approval_consumed event)
 * 4. Append governance_policy_updated event (the actual override)
 * 5. Append governance_approval_consumed event (idempotency lock)
 * 6. Return updated policy
 *
 * If no valid unconsumed approval is found, the call is rejected.
 * Never mutates any existing row — both writes are INSERTs.
 */
export async function governance_update_policy(
  request: GovernanceUpdatePolicyRequest
): Promise<GovernanceUpdatePolicyResponse> {
  const groupId = validateGroupId(request.group_id)
  const updatedAt = new Date().toISOString()

  if (!request.policy_id || typeof request.policy_id !== "string") {
    throw new Error("policy_id is required")
  }
  if (!request.approval_ref || typeof request.approval_ref !== "string") {
    throw new Error(
      "approval_ref is required — governance_update_policy is HITL-gated. " +
        "Provide the UUID of an approved canonical_proposals entry."
    )
  }
  if (!request.description || typeof request.description !== "string") {
    throw new Error("description is required for the policy override")
  }
  if (!request.updated_by || typeof request.updated_by !== "string") {
    throw new Error("updated_by is required")
  }

  const base = findPolicyById(request.policy_id)
  if (!base) {
    throw new Error(
      `Policy not found: ${request.policy_id}. Valid IDs: ${CANONICAL_POLICIES.map((p) => p.id).join(", ")}`
    )
  }

  try {
    const { pg } = await getConnections()

    // Step 1: Verify approval_ref exists and is 'approved'
    const approvalResult = await withCircuitBreaker(
      "postgres",
      groupId,
      "governance_update_policy:verify_approval",
      async () =>
        pg.query<{ id: string; status: string; group_id: string }>(
          `SELECT id, status, group_id
           FROM canonical_proposals
           WHERE id = $1
           LIMIT 1`,
          [request.approval_ref]
        )
    )

    if (approvalResult.rows.length === 0) {
      throw new Error(
        `HITL gate rejected: approval_ref '${request.approval_ref}' not found in canonical_proposals. ` +
          "Obtain a valid approved proposal before calling governance_update_policy."
      )
    }

    const approval = approvalResult.rows[0]
    if (approval.status !== "approved") {
      throw new Error(
        `HITL gate rejected: proposal '${request.approval_ref}' has status '${approval.status}' (must be 'approved'). ` +
          "Only approved proposals can authorize a policy update."
      )
    }

    // Verify the proposal belongs to the same group (cross-tenant protection)
    if (approval.group_id !== groupId) {
      throw new Error(
        `HITL gate rejected: proposal '${request.approval_ref}' belongs to a different tenant. ` +
          "Cannot use approvals from other tenants."
      )
    }

    // Step 2: Verify approval_ref has not already been consumed
    const consumedResult = await withCircuitBreaker(
      "postgres",
      groupId,
      "governance_update_policy:check_consumed",
      async () =>
        pg.query<{ id: string }>(
          `SELECT id
           FROM events
           WHERE group_id = $1
             AND event_type = 'governance_approval_consumed'
             AND metadata->>'approval_ref' = $2
           LIMIT 1`,
          [groupId, request.approval_ref]
        )
    )

    if (consumedResult.rows.length > 0) {
      throw new Error(
        `HITL gate rejected: approval_ref '${request.approval_ref}' has already been consumed. ` +
          "Each approval can only be used once. Obtain a new approved proposal."
      )
    }

    // Step 3: Compute new version
    const newVersion = base.version + 1

    // Step 4: Append governance_policy_updated event (append-only)
    const updateEventResult = await withCircuitBreaker(
      "postgres",
      groupId,
      "governance_update_policy:insert_update_event",
      async () =>
        pg.query<{ id: string }>(
          `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            groupId,
            "governance_policy_updated",
            request.updated_by,
            "completed",
            JSON.stringify({
              policy_id: request.policy_id,
              description: request.description,
              version: newVersion,
              rationale: request.rationale,
              approval_ref: request.approval_ref,
              updated_by: request.updated_by,
            }),
            updatedAt,
          ]
        )
    )

    const updateEventId = String(updateEventResult.rows[0].id)

    // Step 5: Append governance_approval_consumed event (idempotency lock — append-only)
    await withCircuitBreaker(
      "postgres",
      groupId,
      "governance_update_policy:insert_consumed_event",
      async () =>
        pg.query(
          `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            groupId,
            "governance_approval_consumed",
            request.updated_by,
            "completed",
            JSON.stringify({
              approval_ref: request.approval_ref,
              policy_id: request.policy_id,
              update_event_id: updateEventId,
            }),
            updatedAt,
          ]
        )
    )

    return {
      policy_id: request.policy_id,
      updated: true,
      version: newVersion,
      event_id: updateEventId,
      updated_at: updatedAt,
      meta: baseMeta(["postgres"]),
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "governance_update_policy", "SELECT/INSERT events")
    }
    throw error
  }
}

// ── 5. governance_audit_log ──────────────────────────────────────────────

const GOVERNANCE_AUDIT_EVENT_TYPES = new Set([
  "governance_policy_updated",
  "governance_gate_checked",
  "governance_approval_consumed",
  // Include related memory governance events for completeness
  "proposal_created",
  "proposal_approved",
  "proposal_rejected",
  "memory_promote_requested",
])

/**
 * Paginated read of governance audit events from the append-only events table.
 * Filters to governance-relevant event_types by default; can be narrowed further
 * by passing event_type. Read-only — no DB writes.
 */
export async function governance_audit_log(
  request: GovernanceAuditLogRequest
): Promise<GovernanceAuditLogResponse> {
  const groupId = validateGroupId(request.group_id)
  const limit = Math.min(Math.max(1, request.limit ?? 50), 500)
  const offset = Math.max(0, request.offset ?? 0)

  // If specific event_type requested, validate it exists in allowed set
  if (request.event_type && !GOVERNANCE_AUDIT_EVENT_TYPES.has(request.event_type)) {
    throw new Error(
      `Unknown governance event_type: '${request.event_type}'. ` +
        `Valid types: ${[...GOVERNANCE_AUDIT_EVENT_TYPES].join(", ")}`
    )
  }

  try {
    const { pg } = await getConnections()

    // Build the event_type filter
    const allowedTypes = request.event_type
      ? [request.event_type]
      : [...GOVERNANCE_AUDIT_EVENT_TYPES]

    // Parameterized ANY($N) for the allowed types array
    const countResult = await withCircuitBreaker(
      "postgres",
      groupId,
      "governance_audit_log:count",
      async () =>
        pg.query<{ total: string }>(
          `SELECT COUNT(*) AS total
           FROM events
           WHERE group_id = $1
             AND event_type = ANY($2::text[])`,
          [groupId, allowedTypes]
        )
    )

    const total = parseInt(countResult.rows[0]?.total ?? "0", 10)

    const rowsResult = await withCircuitBreaker(
      "postgres",
      groupId,
      "governance_audit_log:fetch",
      async () =>
        pg.query<{
          id: string
          event_type: string
          agent_id: string
          status: string
          metadata: Record<string, unknown>
          created_at: string
        }>(
          `SELECT id::text, event_type, agent_id, status, metadata, created_at
           FROM events
           WHERE group_id = $1
             AND event_type = ANY($2::text[])
           ORDER BY created_at DESC
           LIMIT $3 OFFSET $4`,
          [groupId, allowedTypes, limit, offset]
        )
    )

    const entries = rowsResult.rows.map((row) => ({
      id: row.id,
      event_type: row.event_type,
      agent_id: row.agent_id,
      status: row.status,
      metadata: row.metadata ?? {},
      created_at: typeof row.created_at === "string" ? row.created_at : new Date(row.created_at).toISOString(),
    }))

    return {
      entries,
      count: entries.length,
      total,
      has_more: offset + limit < total,
      meta: baseMeta(["postgres"]),
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "governance_audit_log", "SELECT events")
    }
    throw error
  }
}
