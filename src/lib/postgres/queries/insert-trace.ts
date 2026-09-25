import type { Pool } from "pg"
import { CURRENT_SCHEMA_VERSION } from "@/lib/schema-version"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "../connection"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"

/**
 * Event status values
 */
export type EventStatus = "pending" | "completed" | "failed" | "cancelled"

/**
 * Event insert payload
 * All fields needed to create a new event trace record
 */
export interface EventInsert {
  /** Required: Tenant isolation identifier */
  group_id: string
  /** Required: Type of event (e.g., 'workflow_step', 'agent_action') */
  event_type: string
  /** Required: Agent or system that generated this event */
  agent_id: string
  /** Optional: Workflow this event belongs to */
  workflow_id?: string
  /** Optional: Step within workflow */
  step_id?: string
  /** Optional: Parent event for execution chains */
  parent_event_id?: number
  /** Optional: Structured metadata */
  metadata?: Record<string, unknown>
  /** Optional: Outcome payload */
  outcome?: Record<string, unknown>
  /** Status (defaults to 'pending') */
  status?: EventStatus
  /** Optional: Error message (for failed events) */
  error_message?: string
  /** Optional: Error code (for failed events) */
  error_code?: string
  /** Optional: Confidence score (0.0 to 1.0) for knowledge promotion */
  confidence?: number
  /** Optional: Evidence reference (file path, URL, document ID) */
  evidence_ref?: string
  /** Schema version for compatibility checks (defaults to CURRENT_SCHEMA_VERSION) */
  schema_version?: number
}

export interface WorkspaceEventInsert extends EventInsert {
  workspace_id: string
  principal_id: string
}

/**
 * Event record as stored in database
 */
export interface EventRecord {
  id: number
  group_id: string
  workspace_id?: string | null
  event_type: string
  created_at: Date
  agent_id: string
  workflow_id: string | null
  step_id: string | null
  parent_event_id: number | null
  metadata: Record<string, unknown>
  outcome: Record<string, unknown>
  status: EventStatus
  error_message: string | null
  error_code: string | null
  inserted_at: Date
  confidence: number | null
  evidence_ref: string | null
  schema_version: number
}

/**
 * Insert a workspace-bound event through the restricted application role.
 * Web/API callers must use this path so the workspace GUC and explicit row
 * discriminator agree at the database boundary.
 */
export async function insertWorkspaceEvent(event: WorkspaceEventInsert): Promise<EventRecord> {
  validateEventInsert(event)
  if (!event.workspace_id?.trim()) throw new ValidationError("workspace_id is required and cannot be empty")
  if (!event.principal_id?.trim()) throw new ValidationError("principal_id is required and cannot be empty")

  return withWorkspaceTransaction({
    tenantId: event.group_id,
    workspaceId: event.workspace_id,
    principalId: event.principal_id,
  }, async (db) => {
    const result = await db.query<EventRecord>(`
      INSERT INTO events (
        group_id, workspace_id, event_type, agent_id, workflow_id, step_id,
        parent_event_id, metadata, outcome, status, error_message, error_code,
        confidence, evidence_ref, schema_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      event.group_id, event.workspace_id, event.event_type, event.agent_id,
      event.workflow_id ?? null, event.step_id ?? null, event.parent_event_id ?? null,
      JSON.stringify(event.metadata ?? {}), JSON.stringify(event.outcome ?? {}),
      event.status ?? "pending", event.error_message ?? null, event.error_code ?? null,
      event.confidence ?? null, event.evidence_ref ?? null,
      event.schema_version ?? CURRENT_SCHEMA_VERSION,
    ])
    return result.rows[0]
  })
}

/**
 * Outcome insert payload
 */
export interface OutcomeInsert {
  /** Required: Tenant isolation (must match parent event's group_id) */
  group_id: string
  /** Required: Parent event this outcome belongs to */
  event_id: number
  /** Required: Type of outcome (e.g., 'analysis_result', 'decision') */
  outcome_type: string
  /** Optional: Confidence score (0.0 to 1.0) */
  confidence?: number
  /** Optional: Structured outcome data */
  data?: Record<string, unknown>
}

/**
 * Outcome record as stored in database
 */
export interface OutcomeRecord {
  id: number
  group_id: string
  event_id: number
  outcome_type: string
  confidence: number | null
  data: Record<string, unknown>
  created_at: Date
}

/**
 * Validation error for missing required fields
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

/**
 * Validate event insert payload
 * Ensures all required fields are present and valid
 */
function validateEventInsert(event: EventInsert): void {
  const errors: string[] = []

  // Group ID validation - uses canonical validateGroupId for defense-in-depth
  // This enforces ^allura-[a-z0-9-]+$ pattern, NFR11 (lowercase-only), length bounds
  try {
    validateGroupId(event.group_id)
  } catch (e) {
    if (e instanceof GroupIdValidationError) {
      errors.push(e.message)
    } else {
      errors.push(`group_id validation failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!event.event_type || event.event_type.trim().length === 0) {
    errors.push("event_type is required and cannot be empty")
  }

  if (!event.agent_id || event.agent_id.trim().length === 0) {
    errors.push("agent_id is required and cannot be empty")
  }

  if (errors.length > 0) {
    throw new ValidationError(`Event validation failed: ${errors.join("; ")}`)
  }
}

/**
 * Validate outcome insert payload
 */
function validateOutcomeInsert(outcome: OutcomeInsert): void {
  const errors: string[] = []

  if (!outcome.group_id || outcome.group_id.trim().length === 0) {
    errors.push("group_id is required and cannot be empty")
  }

  if (!outcome.outcome_type || outcome.outcome_type.trim().length === 0) {
    errors.push("outcome_type is required and cannot be empty")
  }

  if (outcome.confidence !== undefined && (outcome.confidence < 0 || outcome.confidence > 1)) {
    errors.push("confidence must be between 0 and 1")
  }

  if (errors.length > 0) {
    throw new ValidationError(`Outcome validation failed: ${errors.join("; ")}`)
  }
}

/**
 * Insert a new event trace record
 * Append-only: Creates a new immutable record
 *
 * @param event - Event payload to insert
 * @returns The created event record with generated ID and timestamps
 * @throws ValidationError if required fields are missing
 */
export async function insertEvent(event: EventInsert): Promise<EventRecord> {
  // Validate required fields
  validateEventInsert(event)

  const pool = getPool()

  const query = `
    INSERT INTO events (
      group_id,
      event_type,
      agent_id,
      workflow_id,
      step_id,
      parent_event_id,
      metadata,
      outcome,
      status,
      error_message,
      error_code,
      confidence,
      evidence_ref,
      schema_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `

  const values = [
    event.group_id,
    event.event_type,
    event.agent_id,
    event.workflow_id ?? null,
    event.step_id ?? null,
    event.parent_event_id ?? null,
    JSON.stringify(event.metadata ?? {}),
    JSON.stringify(event.outcome ?? {}),
    event.status ?? "pending",
    event.error_message ?? null,
    event.error_code ?? null,
    event.confidence ?? null,
    event.evidence_ref ?? null,
    event.schema_version ?? CURRENT_SCHEMA_VERSION,
  ]

  const result = await pool.query<EventRecord>(query, values)

  return result.rows[0]
}

/**
 * Insert a new outcome linked to an event
 * Append-only: Creates a new immutable record
 *
 * @param outcome - Outcome payload to insert
 * @returns The created outcome record with generated ID
 * @throws ValidationError if required fields are missing or confidence is invalid
 */
export async function insertOutcome(outcome: OutcomeInsert): Promise<OutcomeRecord> {
  // Validate required fields
  validateOutcomeInsert(outcome)

  const pool = getPool()

  const query = `
    INSERT INTO outcomes (
      group_id,
      event_id,
      outcome_type,
      confidence,
      data
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `

  const values = [
    outcome.group_id,
    outcome.event_id,
    outcome.outcome_type,
    outcome.confidence ?? null,
    JSON.stringify(outcome.data ?? {}),
  ]

  const result = await pool.query<OutcomeRecord>(query, values)

  return result.rows[0]
}

/**
 * Bulk insert events (for high-throughput scenarios)
 * Uses the same validation as single insert
 *
 * @param events - Array of event payloads
 * @returns Array of created event records
 * @throws ValidationError if any event fails validation
 */
export async function insertEvents(events: EventInsert[]): Promise<EventRecord[]> {
  // Validate all events first
  for (const event of events) {
    validateEventInsert(event)
  }

  const pool = getPool()
  const results: EventRecord[] = []

  // For now, use individual inserts within a transaction
  // Can be optimized with COPY or multi-row INSERT if needed
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    for (const event of events) {
      const query = `
        INSERT INTO events (
          group_id,
          event_type,
          agent_id,
          workflow_id,
          step_id,
          parent_event_id,
          metadata,
          outcome,
          status,
          error_message,
          error_code,
          schema_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `

      const values = [
        event.group_id,
        event.event_type,
        event.agent_id,
        event.workflow_id ?? null,
        event.step_id ?? null,
        event.parent_event_id ?? null,
        JSON.stringify(event.metadata ?? {}),
        JSON.stringify(event.outcome ?? {}),
        event.status ?? "pending",
        event.error_message ?? null,
        event.error_code ?? null,
        event.schema_version ?? CURRENT_SCHEMA_VERSION,
      ]

      const result = await client.query<EventRecord>(query, values)
      results.push(result.rows[0])
    }

    await client.query("COMMIT")
    return results
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
