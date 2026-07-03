/**
 * Approval Audit Logger
 *
 * Ensures that NO Insight enters Neo4j without an approval event logged
 * to PostgreSQL. This is the audit gate for the HITL promotion pipeline.
 *
 * Invariants:
 * - group_id on EVERY query (tenant isolation)
 * - Append-only on events table (INSERT only, no UPDATE/DELETE)
 * - Parameterized queries ($1, $2 syntax) — never string interpolation
 * - Idempotent: duplicate calls for the same proposal_id are no-ops
 *
 * Reference: docs/allura/BLUEPRINT.md (F-003: Approval Audit Flow)
 */

import type { Pool, PoolClient, QueryResult } from "pg"
import { getPool } from "@/lib/postgres/connection"
import { hasPermission } from "@/lib/auth/roles"
import type { AlluraRole } from "@/lib/auth/types"
import { validateGroupId } from "@/lib/validation/group-id"

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * Approval audit event — the canonical record of a curator decision.
 * Every field is persisted in the events table's JSONB metadata column.
 */
export interface ApprovalAuditEvent {
  /** Proposal identifier from canonical_proposals table */
  proposal_id: string
  /** Tenant namespace (must match ^allura-*) */
  group_id: string
  /** Memory identifier being promoted */
  memory_id: string
  /** Actor that requested promotion; separate from the decision actor when known */
  requested_by?: string
  /** Curator who made the decision */
  curator_id: string
  /** Role held by the decision actor when the decision was made */
  decision_actor_role?: AlluraRole
  /** Decision outcome */
  decision: "approved" | "rejected" | "needs_evidence"
  /** Resulting proposal status after the decision is applied */
  resulting_status?: "approved" | "rejected" | "pending"
  /** Optional rationale for the decision */
  rationale?: string
  /** Curator confidence score at decision time */
  score: number
  /** Tier classification at decision time */
  tier: string
  /** ISO 8601 timestamp of the decision */
  approved_at: string
}

export interface CuratorDecisionReceipt {
  proposal_id: string
  group_id: string
  decision: "approved" | "rejected" | "needs_evidence" | "missing_receipt"
  previous_status: "pending"
  resulting_status: "approved" | "rejected" | "pending"
  promoted_memory_id: string | null
  actor: string
  rationale: string | null
  decided_at: string | null
  trace_reference: string | null
  source_event_type: ApprovalAuditEventType | "missing"
  receipt_status: "available" | "missing_receipt_blocker"
  degraded_reason?: string
}

type ReceiptProposalRecord = {
  id?: unknown
  group_id?: unknown
  status?: unknown
  trace_ref?: unknown
  memory_id?: unknown
}

type ReceiptEventRecord = {
  event_type?: unknown
  agent_id?: unknown
  created_at?: unknown
  metadata?: unknown
} | null | undefined

/**
 * Error thrown when a promotion is attempted without a recorded approval.
 */
export class ApprovalRequiredError extends Error {
  public readonly proposalId: string
  public readonly groupId: string

  constructor(proposalId: string, groupId: string) {
    super(
      `Approval required before promotion: no approval event found for proposal ${proposalId} in group ${groupId}`
    )
    this.name = "ApprovalRequiredError"
    this.proposalId = proposalId
    this.groupId = groupId
  }
}

export class SegregationOfDutiesError extends Error {
  constructor(actorId: string) {
    super(`Segregation of duties violation: requester and approver must be different actors (${actorId})`)
    this.name = "SegregationOfDutiesError"
  }
}

export class ApprovalAuditAuthorizationError extends Error {
  constructor(role: AlluraRole) {
    super(`Approval audit decision requires curator or admin role; received ${role}`)
    this.name = "ApprovalAuditAuthorizationError"
  }
}

// ── Event type constants ──────────────────────────────────────────────────

const EVENT_TYPE_APPROVED = "proposal_approved" as const
const EVENT_TYPE_REJECTED = "proposal_rejected" as const
const EVENT_TYPE_EVIDENCE_REQUESTED = "proposal_evidence_requested" as const

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">
type ApprovalAuditEventType = typeof EVENT_TYPE_APPROVED | typeof EVENT_TYPE_REJECTED | typeof EVENT_TYPE_EVIDENCE_REQUESTED

async function insertApprovalEvent(event: ApprovalAuditEvent, validatedGroupId: string, eventType: ApprovalAuditEventType, queryable: Queryable): Promise<QueryResult> {
  return queryable.query(
    `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      validatedGroupId,
      eventType,
      event.curator_id,
      "completed",
      JSON.stringify({
        proposal_id: event.proposal_id,
        memory_id: event.memory_id,
        requested_by: event.requested_by ?? null,
        curator_id: event.curator_id,
        decision_actor_role: event.decision_actor_role ?? null,
        decision: event.decision,
        resulting_status: event.resulting_status ?? event.decision,
        rationale: event.rationale ?? null,
        score: event.score,
        tier: event.tier,
        approved_at: event.approved_at,
      }),
      event.approved_at,
    ]
  )
}

async function findExistingApprovalEvent(validatedGroupId: string, eventType: ApprovalAuditEventType, proposalId: string, queryable: Queryable): Promise<QueryResult<{ id: number }>> {
  return queryable.query<{ id: number }>(
    `SELECT id
     FROM events
     WHERE group_id = $1
       AND event_type = $2
       AND metadata->>'proposal_id' = $3
     LIMIT 1`,
    [validatedGroupId, eventType, proposalId]
  )
}

// ── Core Functions ────────────────────────────────────────────────────────

/**
 * Log an approval or rejection event to the PostgreSQL events table.
 *
 * Idempotent: if an event with the same proposal_id and decision already
 * exists, this function returns silently without inserting a duplicate.
 *
 * @param event - The approval audit event to log
 * @param pool  - Optional Pool override (for testing); defaults to getPool()
 * @throws GroupIdValidationError if group_id is invalid
 * @throws Error on database failure (no silent failures)
 */
export async function logApprovalEvent(
  event: ApprovalAuditEvent,
  pool?: Pool
): Promise<void> {
  // Validate group_id format — enforce tenant isolation at the boundary
  const validatedGroupId = validateGroupId(event.group_id)

  if (event.requested_by && event.requested_by === event.curator_id) {
    throw new SegregationOfDutiesError(event.curator_id)
  }

  if (event.decision_actor_role && !hasPermission(event.decision_actor_role, "curator")) {
    throw new ApprovalAuditAuthorizationError(event.decision_actor_role)
  }

  const pg = pool ?? getPool()

  const eventType = getAuditEventType(event.decision)

  // A Pool has connect() but no release(); a checked-out PoolClient has both.
  // When the caller passes its transaction client, fall through to the
  // queryable path — re-connecting a live client throws "Client has already
  // been connected", and the caller's transaction already provides atomicity.
  if ("connect" in pg && typeof pg.connect === "function" && !("release" in pg)) {
    const client = await pg.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${validatedGroupId}:${eventType}:${event.proposal_id}`])

      const existing = await findExistingApprovalEvent(validatedGroupId, eventType, event.proposal_id, client)
      if (existing.rows.length === 0) {
        await insertApprovalEvent(event, validatedGroupId, eventType, client)
      }

      await client.query("COMMIT")
      return
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }

  // Idempotency check: has this exact decision already been logged?
  const existing = await findExistingApprovalEvent(validatedGroupId, eventType, event.proposal_id, pg)

  if (existing.rows.length > 0) {
    // Already logged — idempotent return
    return
  }

  // INSERT into events table (append-only — never UPDATE/DELETE)
  await insertApprovalEvent(event, validatedGroupId, eventType, pg)
}

function getAuditEventType(decision: ApprovalAuditEvent["decision"]): ApprovalAuditEventType {
  if (decision === "approved") return EVENT_TYPE_APPROVED
  if (decision === "rejected") return EVENT_TYPE_REJECTED
  return EVENT_TYPE_EVIDENCE_REQUESTED
}

export async function logProposalNeedsEvidenceEvent(
  event: ApprovalAuditEvent & { decision: "needs_evidence"; resulting_status: "pending" },
  pool?: Pool,
): Promise<void> {
  const validatedGroupId = validateGroupId(event.group_id)

  if (event.requested_by && event.requested_by === event.curator_id) {
    throw new SegregationOfDutiesError(event.curator_id)
  }

  if (event.decision_actor_role && !hasPermission(event.decision_actor_role, "curator")) {
    throw new ApprovalAuditAuthorizationError(event.decision_actor_role)
  }

  const pg = pool ?? getPool()
  await insertApprovalEvent(event, validatedGroupId, EVENT_TYPE_EVIDENCE_REQUESTED, pg)
}

/**
 * Guard function: require an approval event before allowing Neo4j promotion.
 *
 * Queries the events table for a `proposal_approved` event matching
 * the given proposal_id and group_id. Returns true if found.
 * Throws ApprovalRequiredError if no approval event exists.
 *
 * @param proposalId - The proposal ID to check
 * @param groupId    - The tenant namespace
 * @param pool       - Optional Pool override (for testing)
 * @returns true if approval exists
 * @throws ApprovalRequiredError if no approval event found
 * @throws GroupIdValidationError if group_id is invalid
 */
export async function requireApprovalBeforePromotion(
  proposalId: string,
  groupId: string,
  pool?: Pool
): Promise<boolean> {
  // Validate group_id format
  const validatedGroupId = validateGroupId(groupId)

  const pg = pool ?? getPool()

  const result = await pg.query<{ id: number }>(
    `SELECT id
     FROM events
     WHERE group_id = $1
       AND event_type = $2
       AND metadata->>'proposal_id' = $3
     LIMIT 1`,
    [validatedGroupId, EVENT_TYPE_APPROVED, proposalId]
  )

  if (result.rows.length === 0) {
    throw new ApprovalRequiredError(proposalId, validatedGroupId)
  }

  return true
}

/**
 * Check whether an approval event exists (non-throwing variant).
 *
 * Useful for conditional logic where you want to check status
 * without catching an exception.
 *
 * @param proposalId - The proposal ID to check
 * @param groupId    - The tenant namespace
 * @param pool       - Optional Pool override (for testing)
 * @returns true if approval exists, false otherwise
 */
export async function hasApprovalEvent(
  proposalId: string,
  groupId: string,
  pool?: Pool
): Promise<boolean> {
  try {
    await requireApprovalBeforePromotion(proposalId, groupId, pool)
    return true
  } catch (error) {
    if (error instanceof ApprovalRequiredError) {
      return false
    }
    throw error
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeDecision(eventType: string | null, metadata: Record<string, unknown>): CuratorDecisionReceipt["decision"] {
  const decision = stringOrNull(metadata.decision)
  if (decision === "approved" || decision === "rejected" || decision === "needs_evidence") return decision
  if (eventType === EVENT_TYPE_APPROVED) return "approved"
  if (eventType === EVENT_TYPE_REJECTED) return "rejected"
  if (eventType === EVENT_TYPE_EVIDENCE_REQUESTED) return "needs_evidence"
  return "missing_receipt"
}

function normalizeResultingStatus(value: unknown, fallback: unknown): CuratorDecisionReceipt["resulting_status"] {
  if (value === "approved" || value === "rejected" || value === "pending") return value
  if (fallback === "approved" || fallback === "rejected" || fallback === "pending") return fallback
  return "pending"
}

export function buildCuratorDecisionReceipt(params: {
  proposal: ReceiptProposalRecord
  event: ReceiptEventRecord
}): CuratorDecisionReceipt {
  const proposalId = stringOrNull(params.proposal.id) ?? "unknown-proposal"
  const groupId = validateGroupId(stringOrNull(params.proposal.group_id) ?? "allura-system")
  const traceReference = stringOrNull(params.proposal.trace_ref)

  if (!params.event) {
    return {
      proposal_id: proposalId,
      group_id: groupId,
      decision: "missing_receipt",
      previous_status: "pending",
      resulting_status: normalizeResultingStatus(undefined, params.proposal.status),
      promoted_memory_id: null,
      actor: "unknown",
      rationale: null,
      decided_at: null,
      trace_reference: traceReference,
      source_event_type: "missing",
      receipt_status: "missing_receipt_blocker",
      degraded_reason: `Missing append-only curator decision receipt for proposal ${proposalId}`,
    }
  }

  const metadata = metadataRecord(params.event.metadata)
  const eventType = stringOrNull(params.event.event_type)
  const decision = normalizeDecision(eventType, metadata)
  const memoryId = stringOrNull(metadata.memory_id) ?? stringOrNull(params.proposal.memory_id)

  return {
    proposal_id: stringOrNull(metadata.proposal_id) ?? proposalId,
    group_id: groupId,
    decision,
    previous_status: "pending",
    resulting_status: normalizeResultingStatus(metadata.resulting_status, params.proposal.status),
    promoted_memory_id: decision === "approved" ? memoryId : null,
    actor: stringOrNull(metadata.curator_id) ?? stringOrNull(params.event.agent_id) ?? "unknown",
    rationale: stringOrNull(metadata.rationale),
    decided_at: stringOrNull(metadata.approved_at) ?? stringOrNull(params.event.created_at),
    trace_reference: traceReference,
    source_event_type: eventType === EVENT_TYPE_APPROVED || eventType === EVENT_TYPE_REJECTED || eventType === EVENT_TYPE_EVIDENCE_REQUESTED ? eventType : "missing",
    receipt_status: "available",
  }
}
