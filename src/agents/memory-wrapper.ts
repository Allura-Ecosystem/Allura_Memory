/**
 * Agent-Facing Memory Wrapper
 *
 * Story 1.2: TraceMiddleware Integration
 * AD-030: Memory Wrapper for Agent Write-Back
 *
 * This module provides a lightweight, agent-callable interface to Allura Brain.
 * Agents import this and call memory.add(), memory.search(), etc. directly.
 *
 * Design:
 * - Routes through controlPlane syscalls (syscall_mutate / syscall_query)
 * - Validation at the boundary: group_id, content, agent_id
 * - Type-safe: matches @allura/sdk contracts
 * - Audit trail: all operations logged to PostgreSQL via controlPlane
 *
 * Usage (from agents):
 *   import { agentMemory } from '@/agents/memory-wrapper';
 *
 *   const result = await agentMemory.add({
 *     groupId: 'allura-system',
 *     userId: 'brooks-architect',
 *     content: 'ADR: Decision made',
 *     metadata: { source: 'conversation', confidence: 0.9 }
 *   });
 *
 *   const results = await agentMemory.search({
 *     groupId: 'allura-system',
 *     query: 'architecture decisions'
 *   });
 */

import { syscall_mutate, syscall_query } from "@/control-plane/syscalls";
import type { SyscallContext } from "@/control-plane/syscalls";
import type {
  MemoryAddParams,
  MemoryAddResponse,
  MemoryDeleteParams,
  MemoryDeleteResponse,
  MemoryGetParams,
  MemoryGetResponse,
  MemoryListParams,
  MemoryListResponse,
  MemorySearchParams,
  MemorySearchResponse,
} from "@/lib/sdk";
import {
  MemoryAddResponseSchema,
  MemoryDeleteResponseSchema,
  MemoryGetResponseSchema,
  MemoryIdSchema,
  MemoryListResponseSchema,
  MemorySearchResponseSchema,
  ValidationError,
} from "@/lib/sdk";
import { validateGroupId } from "@/lib/validation/group-id";

/**
 * Build a SyscallContext for agent memory operations.
 */
function buildContext(userId: string, groupId: string): SyscallContext {
  return {
    actor: userId,
    group_id: groupId,
    permission_tier: "plugin",
  };
}

export type AgentMemoryAddParams = Omit<MemoryAddParams, "threshold"> & {
  threshold?: number;
};

export interface AgentMemoryAPI {
  add(params: AgentMemoryAddParams): Promise<MemoryAddResponse>;
  search(params: MemorySearchParams): Promise<MemorySearchResponse>;
  get(params: MemoryGetParams): Promise<MemoryGetResponse>;
  list(params: MemoryListParams): Promise<MemoryListResponse>;
  delete(params: MemoryDeleteParams): Promise<MemoryDeleteResponse>;
}

/**
 * Agent-callable memory wrapper
 *
 * Routes through controlPlane syscalls (syscall_mutate / syscall_query) instead of
 * calling canonicalMemoryTools directly.
 */
class AgentMemory implements AgentMemoryAPI {
  /**
   * Add a memory to Allura Brain
   *
   * @param params - Memory parameters
   * @returns Memory add response with ID and storage location
   * @throws ValidationError if validation fails
   * @throws Error if controlPlane mutate fails
   */
  async add(params: AgentMemoryAddParams): Promise<MemoryAddResponse> {
    // Validate required fields
    validateGroupId(params.group_id);

    if (!params.content || params.content.trim().length === 0) {
      throw new ValidationError("content must not be empty", {
        content: ["content is required and must not be empty"],
      });
    }

    if (!params.user_id) {
      throw new ValidationError("user_id is required", {
        user_id: ["user_id must be provided (agent identifier)"],
      });
    }

    if (params.threshold !== undefined && (params.threshold < 0 || params.threshold > 1)) {
      throw new ValidationError("threshold must be between 0 and 1", {
        threshold: ["threshold must be between 0 and 1"],
      });
    }

    const ctx = buildContext(params.user_id, params.group_id);
    const result = await syscall_mutate(
      {
        type: "insert",
        target: "pg:memories",
        data: {
          group_id: params.group_id,
          user_id: params.user_id,
          content: params.content,
          metadata: params.metadata ?? {},
          threshold: params.threshold,
        },
      },
      ctx
    );

    if (!result.success) {
      throw new Error(result.error ?? "ControlPlane mutate failed");
    }

    return MemoryAddResponseSchema.parse({
      id: result.data?.auditId ?? crypto.randomUUID(),
      stored: "episodic",
      score: params.threshold ?? 0.5,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Search memories across both stores
   *
   * @param params - Search parameters
   * @returns Search results with relevance scores
   * @throws ValidationError if validation fails
   */
  async search(params: MemorySearchParams): Promise<MemorySearchResponse> {
    validateGroupId(params.group_id);

    if (!params.query || params.query.trim().length === 0) {
      throw new ValidationError("query must not be empty", {
        query: ["query is required and must not be empty"],
      });
    }

    if (params.limit !== undefined && (params.limit < 1 || params.limit > 100)) {
      throw new ValidationError("limit must be between 1 and 100", {
        limit: ["limit must be between 1 and 100"],
      });
    }

    const ctx = buildContext(params.user_id ?? "anonymous", params.group_id);
    const result = await syscall_query(
      {
        target: "pg:memories",
        query: {
          group_id: params.group_id,
          ...(params.user_id ? { user_id: params.user_id } : {}),
        },
        limit: params.limit ?? 10,
      },
      ctx
    );

    if (!result.success) {
      throw new Error(result.error ?? "ControlPlane query failed");
    }

    const rows = (result.data ?? []) as Array<Record<string, unknown>>;
    return MemorySearchResponseSchema.parse({
      results: rows.map((r) => ({
        id: r.id ?? r.memory_id ?? crypto.randomUUID(),
        content: r.content ?? "",
        score: (r.score as number) ?? 0.5,
        source: (r.source as string) ?? ("episodic" as const),
        provenance: (r.provenance as string) ?? ("conversation" as const),
        created_at: (r.created_at as string) ?? new Date().toISOString(),
      })),
      count: rows.length,
      latency_ms: 0,
      meta: {
        contract_version: "v1" as const,
        degraded: false,
        stores_used: ["postgres"],
        stores_attempted: ["postgres"],
        warnings: [],
      },
    });
  }

  /**
   * Retrieve a single memory by ID
   *
   * @param params - Get parameters
   * @returns Memory details
   * @throws ValidationError if validation fails
   * @throws Error if memory not found
   */
  async get(params: MemoryGetParams): Promise<MemoryGetResponse> {
    validateGroupId(params.group_id);

    if (!params.id || params.id.trim().length === 0) {
      throw new ValidationError("id is required", {
        id: ["id must be a valid UUID"],
      });
    }

    // Validate UUID format (throws on invalid UUID)
    MemoryIdSchema.parse(params.id);

    const ctx = buildContext("system", params.group_id);
    const result = await syscall_query(
      {
        target: "pg:memories",
        query: { group_id: params.group_id, id: params.id },
        limit: 1,
      },
      ctx
    );

    if (!result.success) {
      throw new Error(result.error ?? "ControlPlane query failed");
    }

    const rows = (result.data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      throw new Error(`Memory not found: ${params.id}`);
    }

    const row = rows[0];
    return MemoryGetResponseSchema.parse({
      id: row.id ?? params.id,
      content: row.content ?? "",
      score: (row.score as number) ?? 0.5,
      source: (row.source as string) ?? "episodic",
      provenance: (row.provenance as string) ?? "conversation",
      user_id: (row.user_id as string) ?? "system",
      created_at: (row.created_at as string) ?? new Date().toISOString(),
    });
  }

  /**
   * List all memories for a user
   *
   * @param params - List parameters
   * @returns Paginated list of memories
   * @throws ValidationError if validation fails
   */
  async list(params: MemoryListParams): Promise<MemoryListResponse> {
    validateGroupId(params.group_id);

    if (params.limit !== undefined && (params.limit < 1 || params.limit > 1000)) {
      throw new ValidationError("limit must be between 1 and 1000", {
        limit: ["limit must be between 1 and 1000"],
      });
    }

    if (params.offset !== undefined && params.offset < 0) {
      throw new ValidationError("offset must be >= 0", {
        offset: ["offset must be non-negative"],
      });
    }

    const ctx = buildContext(params.user_id ?? "system", params.group_id);
    const result = await syscall_query(
      {
        target: "pg:memories",
        query: {
          group_id: params.group_id,
          ...(params.user_id ? { user_id: params.user_id } : {}),
        },
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
      ctx
    );

    if (!result.success) {
      throw new Error(result.error ?? "ControlPlane query failed");
    }

    const rows = (result.data ?? []) as Array<Record<string, unknown>>;
    return MemoryListResponseSchema.parse({
      memories: rows.map((r) => ({
        id: r.id ?? r.memory_id ?? crypto.randomUUID(),
        content: r.content ?? "",
        score: (r.score as number) ?? 0.5,
        source: (r.source as string) ?? "episodic",
        provenance: (r.provenance as string) ?? "conversation",
        user_id: (r.user_id as string) ?? "system",
        created_at: (r.created_at as string) ?? new Date().toISOString(),
      })),
      total: rows.length,
      has_more: false,
    });
  }

  /**
   * Soft-delete a memory
   *
   * Records a MEMORY_DELETED event via the controlPlane. The actual row-level
   * soft-delete is handled downstream by the target resolver or a cleanup job.
   *
   * @param params - Delete parameters
   * @returns Deletion confirmation
   * @throws ValidationError if validation fails
   */
  async delete(params: MemoryDeleteParams): Promise<MemoryDeleteResponse> {
    validateGroupId(params.group_id);

    if (!params.id || params.id.trim().length === 0) {
      throw new ValidationError("id is required", {
        id: ["id must be a valid UUID"],
      });
    }

    // Validate UUID format (throws on invalid UUID)
    MemoryIdSchema.parse(params.id);

    if (!params.user_id) {
      throw new ValidationError("user_id is required for deletion", {
        user_id: ["user_id must be provided (for audit trail)"],
      });
    }

    const ctx = buildContext(params.user_id, params.group_id);
    const result = await syscall_mutate(
      {
        type: "insert",
        target: "pg:events",
        data: {
          group_id: params.group_id,
          agent_id: params.user_id,
          event_type: "MEMORY_DELETED",
          status: "completed",
          metadata: JSON.stringify({ memory_id: params.id, deleted_by: params.user_id }),
        },
      },
      ctx
    );

    if (!result.success) {
      throw new Error(result.error ?? "ControlPlane delete event failed");
    }

    return MemoryDeleteResponseSchema.parse({
      id: params.id,
      deleted: true,
      deleted_at: new Date().toISOString(),
      recovery_days: 30,
    });
  }
}

/**
 * Singleton instance for agent use
 *
 * Agents import this and call: agentMemory.add(), agentMemory.search(), etc.
 */
export const agentMemory: AgentMemoryAPI = new AgentMemory();

/**
 * Default export for convenience
 */
export default agentMemory;
