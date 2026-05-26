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
 * - Single source of truth: canonical MCP tools in src/mcp/canonical-tools.ts
 * - Validation at the boundary: group_id, content, agent_id
 * - Type-safe: matches @allura/sdk contracts
 * - Audit trail: all operations logged to PostgreSQL
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

import type {
  MemoryAddParams,
  MemorySearchParams,
  MemoryGetParams,
  MemoryListParams,
  MemoryDeleteParams,
  MemoryAddResponse,
  MemorySearchResponse,
  MemoryGetResponse,
  MemoryListResponse,
  MemoryDeleteResponse,
} from "@/lib/sdk";
import {
  MemoryAddResponseSchema,
  MemorySearchResponseSchema,
  MemoryGetResponseSchema,
  MemoryListResponseSchema,
  MemoryDeleteResponseSchema,
  MemoryIdSchema,
  ValidationError,
} from "@/lib/sdk";
import { validateGroupId } from "@/lib/validation/group-id";
import type { GroupId as BrandedGroupId, MemoryId as BrandedMemoryId } from "@/lib/memory/canonical-contracts";

/**
 * Direct invocation of canonical MCP tools.
 *
 * IMPORTANT: This function is called by canonical-tools.ts directly.
 * It does NOT make HTTP requests — it calls the in-process MCP tool implementation.
 *
 * To use from agents:
 * - Import canonicalMemoryTools directly
 * - Or use agentMemory wrapper below (preferred for agents)
 */
import { canonicalMemoryTools } from "@/mcp/canonical-tools";

/**
 * Cast a validated string to branded GroupId.
 *
 * Safe because validateGroupId() has already enforced the ^allura- pattern.
 * The branded type exists for compile-time safety; at runtime it's a string.
 */
function asGroupId(id: string): BrandedGroupId {
  return id as BrandedGroupId;
}

/**
 * Validate and cast a string to branded MemoryId.
 *
 * Safe because MemoryIdSchema enforces the UUID format before the compile-time
 * brand is applied. The branded type exists for canonical tool contracts; at
 * runtime it's still a string.
 */
function asMemoryId(id: string): BrandedMemoryId {
  return MemoryIdSchema.parse(id) as BrandedMemoryId;
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
 * This is the public API that agents use. It validates input and routes to MCP tools.
 */
class AgentMemory implements AgentMemoryAPI {
  /**
   * Add a memory to Allura Brain
   *
   * @param params - Memory parameters
   * @returns Memory add response with ID and storage location
   * @throws ValidationError if validation fails
   * @throws DatabaseError if storage fails
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

    // Call canonical MCP tool (cast to branded types — validation already performed)
    const response = await canonicalMemoryTools.memory_add({
      group_id: asGroupId(params.group_id),
      user_id: params.user_id,
      content: params.content,
      metadata: params.metadata,
      threshold: params.threshold,
    });

    // Validate response schema
    return MemoryAddResponseSchema.parse(response);
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

    const response = await canonicalMemoryTools.memory_search({
      group_id: asGroupId(params.group_id),
      user_id: params.user_id,
      query: params.query,
      limit: params.limit,
      include_global: params.include_global,
      min_score: params.min_score,
    });

    return MemorySearchResponseSchema.parse(response);
  }

  /**
   * Retrieve a single memory by ID
   *
   * @param params - Get parameters
   * @returns Memory details
   * @throws ValidationError if validation fails
   * @throws NotFoundError if memory does not exist
   */
  async get(params: MemoryGetParams): Promise<MemoryGetResponse> {
    validateGroupId(params.group_id);

    if (!params.id || params.id.trim().length === 0) {
      throw new ValidationError("id is required", {
        id: ["id must be a valid UUID"],
      });
    }

    const response = await canonicalMemoryTools.memory_get({
      group_id: asGroupId(params.group_id),
      id: asMemoryId(params.id),
    });

    return MemoryGetResponseSchema.parse(response);
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

    const response = await canonicalMemoryTools.memory_list({
      group_id: asGroupId(params.group_id),
      user_id: params.user_id,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
      sort: params.sort,
    });

    return MemoryListResponseSchema.parse(response);
  }

  /**
   * Soft-delete a memory
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

    if (!params.user_id) {
      throw new ValidationError("user_id is required for deletion", {
        user_id: ["user_id must be provided (for audit trail)"],
      });
    }

    const response = await canonicalMemoryTools.memory_delete({
      group_id: asGroupId(params.group_id),
      id: asMemoryId(params.id),
      user_id: params.user_id,
    });

    return MemoryDeleteResponseSchema.parse(response);
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
