/**
 * MemoryCoordinator — Single Policy Enforcement Point
 *
 * Sits between the MCP server layer and the canonical-tools data layer.
 * Every memory operation flows through this coordinator, which:
 *
 * 1. Validates group_id on EVERY operation (rejects with 422 if missing/invalid)
 * 2. Delegates to canonical-tools for actual DB operations
 * 3. Wraps every response in the standard { data, meta, error } envelope
 * 4. Logs policy decisions to PostgreSQL events table
 *
 * The coordinator is a THIN POLICY LAYER — it does NOT contain business logic.
 * It enforces: group_id validation, response envelope, audit logging.
 *
 * Reference: docs/allura/BLUEPRINT.md (F-001: MemoryCoordinator)
 */

import type {
  MemoryAddRequest,
  MemoryAddResponse,
  MemoryDeleteRequest,
  MemoryDeleteResponse,
  MemoryExportRequest,
  MemoryExportResponse,
  MemoryGetRequest,
  MemoryGetResponse,
  MemoryListDeletedRequest,
  MemoryListDeletedResponse,
  MemoryListRequest,
  MemoryListResponse,
  MemoryPromoteRequest,
  MemoryPromoteResponse,
  MemoryRestoreRequest,
  MemoryRestoreResponse,
  MemorySearchRequest,
  MemorySearchResponse,
  MemoryUpdateRequest,
  MemoryUpdateResponse,
} from "@/lib/memory/canonical-contracts"

import type { EnvelopeMeta, MemoryResponseEnvelope } from "@/lib/memory/response-envelope"
import { errorEnvelope, successEnvelope, validationErrorEnvelope } from "@/lib/memory/response-envelope"

import { recordTrajectoryAsync } from "@/lib/sona/trajectory-engine"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"

import * as canonicalTools from "@/mcp/canonical-tools"

// SONA trajectory recording (Story 1.3)

// ── Audit Logging ──────────────────────────────────────────────────────────

/**
 * Log a coordinator policy decision to PostgreSQL.
 * Fire-and-forget — never blocks the response path.
 */
function auditLog(tool: string, groupId: string, outcome: "success" | "validation_error" | "internal_error", detail?: string): void {
  // Non-blocking: we don't want audit logging failures to break the response
  setImmediate(() => {
    try {
      void canonicalTools.memory_add // force module binding
      // We use the existing getConnections from canonical-tools to log
      // This is intentionally fire-and-forget
      import("@/mcp/canonical-tools/connection").then(({ getConnections }) => {
        getConnections().then(({ pg }) => {
          pg.query(
            `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              groupId,
              "coordinator_policy",
              "memory-coordinator",
              outcome,
              JSON.stringify({ tool, outcome, detail }),
              new Date().toISOString(),
            ]
          ).catch(() => {
            // Swallow — audit logging must never break the response path
          })
        }).catch(() => {})
      }).catch(() => {})
    } catch {
      // Swallow — audit logging must never break the response path
    }
  })
}

// ── group_id Validation Helper ─────────────────────────────────────────────

/**
 * Validate group_id and return either the validated string or a validation error envelope.
 * Returns a discriminated union so the coordinator methods can early-return on failure.
 */
function validateGroupIdOrEnvelope<T>(
  rawGroupId: unknown,
  tool: string,
  startTime: number
): { ok: true; groupId: string } | { ok: false; envelope: MemoryResponseEnvelope<T> } {
  const groupIdStr = typeof rawGroupId === "string" ? rawGroupId : ""

  try {
    const groupId = validateGroupId(groupIdStr || rawGroupId)
    return { ok: true, groupId }
  } catch (error) {
    const message = error instanceof GroupIdValidationError
      ? error.message
      : `Invalid group_id: ${String(rawGroupId)}`
    auditLog(tool, groupIdStr, "validation_error", message)
    return {
      ok: false,
      envelope: validationErrorEnvelope(tool, groupIdStr, startTime, message),
    }
  }
}

// ── Extract stores_used from canonical-tools meta ──────────────────────────

/**
 * Extract store information from the canonical-tools response meta.
 * Falls back to empty array if meta is not present.
 */
function extractMetaOverrides(response: { meta?: { stores_used?: Array<"postgres" | "neo4j" | "ruvector" | "graph">; degraded?: boolean; degraded_reason?: string; warnings?: string[] } }): Partial<EnvelopeMeta> {
  if (!response.meta) return {}
  return {
    stores_used: response.meta.stores_used ?? [],
    degraded: response.meta.degraded ?? false,
    degraded_reason: response.meta.degraded_reason,
    warnings: response.meta.warnings,
  }
}

// ── MemoryCoordinator Class ────────────────────────────────────────────────

/**
 * The MemoryCoordinator is the single policy enforcement point between
 * the MCP layer and the data layer. It validates group_id, delegates
 * to canonical-tools, wraps responses in the standard envelope, and
 * logs policy decisions.
 */
export class MemoryCoordinator {
  // ── 1. memory_add ──────────────────────────────────────────────────────

  async memory_add(request: MemoryAddRequest): Promise<MemoryResponseEnvelope<MemoryAddResponse>> {
    const tool = "memory_add"
    const startTime = Date.now()

    const validation = validateGroupIdOrEnvelope<MemoryAddResponse>(request.group_id, tool, startTime)
    if (!validation.ok) return validation.envelope

    try {
      const result = await canonicalTools.memory_add(request)
      auditLog(tool, validation.groupId, "success")
      // SONA: record trajectory (async, non-blocking)
      recordTrajectoryAsync({
        group_id: validation.groupId,
        agent_id: (request as { metadata?: { agent_id?: string } }).metadata?.agent_id ?? "memory-coordinator",
        action: "memory_add",
        input: request.content,
        output: result,
        success: true,
        duration_ms: Date.now() - startTime,
      })
      return successEnvelope(result, tool, validation.groupId, startTime, extractMetaOverrides(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      auditLog(tool, validation.groupId, "internal_error", message)
      // SONA: record failed trajectory
      recordTrajectoryAsync({
        group_id: validation.groupId,
        agent_id: (request as { metadata?: { agent_id?: string } }).metadata?.agent_id ?? "memory-coordinator",
        action: "memory_add",
        input: request.content,
        success: false,
        duration_ms: Date.now() - startTime,
      })
      return errorEnvelope(500, message, tool, validation.groupId, startTime)
    }
  }

  // ── 2. memory_search ───────────────────────────────────────────────────

  async memory_search(request: MemorySearchRequest): Promise<MemoryResponseEnvelope<MemorySearchResponse>> {
    const tool = "memory_search"
    const startTime = Date.now()

    const validation = validateGroupIdOrEnvelope<MemorySearchResponse>(request.group_id, tool, startTime)
    if (!validation.ok) return validation.envelope

    try {
      const result = await canonicalTools.memory_search(request)
      auditLog(tool, validation.groupId, "success")
      // SONA: record trajectory (async, non-blocking)
      recordTrajectoryAsync({
        group_id: validation.groupId,
        agent_id: "memory-coordinator",
        action: "memory_search",
        input: request.query,
        output: result,
        success: true,
        duration_ms: Date.now() - startTime,
      })
      return successEnvelope(result, tool, validation.groupId, startTime, extractMetaOverrides(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      auditLog(tool, validation.groupId, "internal_error", message)
      // SONA: record failed trajectory
      recordTrajectoryAsync({
        group_id: validation.groupId,
        agent_id: "memory-coordinator",
        action: "memory_search",
        input: request.query,
        success: false,
        duration_ms: Date.now() - startTime,
      })
      return errorEnvelope(500, message, tool, validation.groupId, startTime)
    }
  }

  // ── 3. memory_get ─────────────────────────────────────────────────────

  async memory_get(request: MemoryGetRequest): Promise<MemoryResponseEnvelope<MemoryGetResponse>> {
    const tool = "memory_get"
    const startTime = Date.now()

    const validation = validateGroupIdOrEnvelope<MemoryGetResponse>(request.group_id, tool, startTime)
    if (!validation.ok) return validation.envelope

    try {
      const result = await canonicalTools.memory_get(request)
      auditLog(tool, validation.groupId, "success")
      return successEnvelope(result, tool, validation.groupId, startTime, extractMetaOverrides(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      auditLog(tool, validation.groupId, "internal_error", message)
      return errorEnvelope(500, message, tool, validation.groupId, startTime)
    }
  }

  // ── 4. memory_list ────────────────────────────────────────────────────

  async memory_list(request: MemoryListRequest): Promise<MemoryResponseEnvelope<MemoryListResponse>> {
    const tool = "memory_list"
    const startTime = Date.now()

    const validation = validateGroupIdOrEnvelope<MemoryListResponse>(request.group_id, tool, startTime)
    if (!validation.ok) return validation.envelope

    try {
      const result = await canonicalTools.memory_list(request)
      auditLog(tool, validation.groupId, "success")
      return successEnvelope(result, tool, validation.groupId, startTime, extractMetaOverrides(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      auditLog(tool, validation.groupId, "internal_error", message)
      return errorEnvelope(500, message, tool, validation.groupId, startTime)
    }
  }

  // ── 5. memory_delete ──────────────────────────────────────────────────

  async memory_delete(request: MemoryDeleteRequest): Promise<MemoryResponseEnvelope<MemoryDeleteResponse>> {
    const tool = "memory_delete"
    const startTime = Date.now()

    const validation = validateGroupIdOrEnvelope<MemoryDeleteResponse>(request.group_id, tool, startTime)
    if (!validation.ok) return validation.envelope

    try {
      const result = await canonicalTools.memory_delete(request)
      auditLog(tool, validation.groupId, "success")
      return successEnvelope(result, tool, validation.groupId, startTime, extractMetaOverrides(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      auditLog(tool, validation.groupId, "internal_error", message)
      return errorEnvelope(500, message, tool, validation.groupId, startTime)
    }
  }

  // ── 6. memory_update ──────────────────────────────────────────────────

  async memory_update(request: MemoryUpdateRequest): Promise<MemoryResponseEnvelope<MemoryUpdateResponse>> {
    const tool = "memory_update"
    const startTime = Date.now()

    const validation = validateGroupIdOrEnvelope<MemoryUpdateResponse>(request.group_id, tool, startTime)
    if (!validation.ok) return validation.envelope

    try {
      const result = await canonicalTools.memory_update(request)
      auditLog(tool, validation.groupId, "success")
      return successEnvelope(result, tool, validation.groupId, startTime, extractMetaOverrides(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      auditLog(tool, validation.groupId, "internal_error", message)
      return errorEnvelope(500, message, tool, validation.groupId, startTime)
    }
  }

  // ── 7. memory_promote ─────────────────────────────────────────────────

  async memory_promote(request: MemoryPromoteRequest): Promise<MemoryResponseEnvelope<MemoryPromoteResponse>> {
    const tool = "memory_promote"
    const startTime = Date.now()

    const validation = validateGroupIdOrEnvelope<MemoryPromoteResponse>(request.group_id, tool, startTime)
    if (!validation.ok) return validation.envelope

    try {
      const result = await canonicalTools.memory_promote(request)
      auditLog(tool, validation.groupId, "success")
      return successEnvelope(result, tool, validation.groupId, startTime, extractMetaOverrides(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      auditLog(tool, validation.groupId, "internal_error", message)
      return errorEnvelope(500, message, tool, validation.groupId, startTime)
    }
  }

  // ── 8. memory_export ──────────────────────────────────────────────────

  async memory_export(request: MemoryExportRequest): Promise<MemoryResponseEnvelope<MemoryExportResponse>> {
    const tool = "memory_export"
    const startTime = Date.now()

    const validation = validateGroupIdOrEnvelope<MemoryExportResponse>(request.group_id, tool, startTime)
    if (!validation.ok) return validation.envelope

    try {
      const result = await canonicalTools.memory_export(request)
      auditLog(tool, validation.groupId, "success")
      return successEnvelope(result, tool, validation.groupId, startTime, extractMetaOverrides(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      auditLog(tool, validation.groupId, "internal_error", message)
      return errorEnvelope(500, message, tool, validation.groupId, startTime)
    }
  }

  // ── 9. memory_restore ─────────────────────────────────────────────────

  async memory_restore(request: MemoryRestoreRequest): Promise<MemoryResponseEnvelope<MemoryRestoreResponse>> {
    const tool = "memory_restore"
    const startTime = Date.now()

    const validation = validateGroupIdOrEnvelope<MemoryRestoreResponse>(request.group_id, tool, startTime)
    if (!validation.ok) return validation.envelope

    try {
      const result = await canonicalTools.memory_restore(request)
      auditLog(tool, validation.groupId, "success")
      return successEnvelope(result, tool, validation.groupId, startTime, extractMetaOverrides(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      auditLog(tool, validation.groupId, "internal_error", message)
      return errorEnvelope(500, message, tool, validation.groupId, startTime)
    }
  }

  // ── 10. memory_list_deleted ───────────────────────────────────────────

  async memory_list_deleted(request: MemoryListDeletedRequest): Promise<MemoryResponseEnvelope<MemoryListDeletedResponse>> {
    const tool = "memory_list_deleted"
    const startTime = Date.now()

    const validation = validateGroupIdOrEnvelope<MemoryListDeletedResponse>(request.group_id, tool, startTime)
    if (!validation.ok) return validation.envelope

    try {
      const result = await canonicalTools.memory_list_deleted(request)
      auditLog(tool, validation.groupId, "success")
      return successEnvelope(result, tool, validation.groupId, startTime, extractMetaOverrides(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      auditLog(tool, validation.groupId, "internal_error", message)
      return errorEnvelope(500, message, tool, validation.groupId, startTime)
    }
  }
}

// ── Singleton Export ────────────────────────────────────────────────────────

/**
 * Default coordinator instance. The MCP server should use this singleton
 * rather than creating new instances.
 */
export const coordinator = new MemoryCoordinator()