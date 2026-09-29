/**
 * @allura/sdk — Memory operations
 *
 * Implements the 5 canonical memory operations:
 * add, search, get, list, delete
 *
 * Each operation:
 * 1. Validates group_id (ARCH-001 tenant isolation)
 * 2. Validates request parameters with Zod
 * 3. Sends request via MCP Streamable HTTP (POST /mcp)
 * 4. Validates response with Zod
 * 5. Returns typed response
 */

import { ValidationError } from "./errors.js";
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
} from "./types.js";
import {
  MemoryAddResponseSchema,
  MemoryDeleteResponseSchema,
  MemoryGetResponseSchema,
  MemoryListResponseSchema,
  MemorySearchResponseSchema,
} from "./types.js";
import { validateGroupId } from "./utils.js";

/**
 * Internal request function type — injected by AlluraClient.
 */
export type RequestFn = <T>(
  method: string,
  params: Record<string, unknown>,
  responseSchema: { parse: (data: unknown) => T }
) => Promise<T>;

/**
 * Memory operations class — provides the 5 canonical memory operations.
 *
 * This class is not instantiated directly. Use `client.memory` to access it.
 */
export class MemoryOperations {
  private readonly request: RequestFn;

  constructor(requestFn: RequestFn) {
    this.request = requestFn;
  }

  /**
   * Add a memory for a user.
   *
   * Flow:
   * 1. Validate group_id
   * 2. Send memory_add request
   * 3. Return typed response with storage location and score
   *
   * @param params - Memory add parameters
   * @returns Memory add response with ID, storage location, and score
   * @throws {ValidationError} if group_id is invalid or content is empty
   * @throws {AuthenticationError} if auth token is invalid
   */
  async add(params: MemoryAddParams): Promise<MemoryAddResponse> {
    validateGroupId(params.group_id);

    if (!params.content || params.content.trim().length === 0) {
      throw new ValidationError("content must not be empty", {
        content: ["content is required and must not be empty"],
      });
    }

    if (params.threshold !== undefined && (params.threshold < 0 || params.threshold > 1)) {
      throw new ValidationError("threshold must be between 0 and 1", {
        threshold: ["threshold must be between 0 and 1"],
      });
    }

    return this.request("memory_add", params as unknown as Record<string, unknown>, MemoryAddResponseSchema);
  }

  /**
   * Search memories across both stores (PostgreSQL + RuVector).
   * Federated search with results merged by relevance.
   *
   * @param params - Search parameters
   * @returns Search results with relevance scores
   * @throws {ValidationError} if group_id is invalid or query is empty
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

    return this.request("memory_search", params as unknown as Record<string, unknown>, MemorySearchResponseSchema);
  }

  /**
   * Retrieve a single memory by ID.
   *
   * @param params - Get parameters (id and group_id)
   * @returns Memory details
   * @throws {ValidationError} if group_id is invalid
   * @throws {NotFoundError} if memory does not exist
   */
  async get(params: MemoryGetParams): Promise<MemoryGetResponse> {
    validateGroupId(params.group_id);

    if (!params.id) {
      throw new ValidationError("id is required", {
        id: ["id must be a valid UUID"],
      });
    }

    return this.request("memory_get", params as unknown as Record<string, unknown>, MemoryGetResponseSchema);
  }

  /**
   * List all memories for a user within a tenant.
   * Returns from both stores, merged and sorted.
   *
   * @param params - List parameters
   * @returns Paginated list of memories
   * @throws {ValidationError} if group_id is invalid
   */
  async list(params: MemoryListParams): Promise<MemoryListResponse> {
    validateGroupId(params.group_id);

    if (params.limit !== undefined && (params.limit < 1 || params.limit > 1000)) {
      throw new ValidationError("limit must be between 1 and 1000", {
        limit: ["limit must be between 1 and 1000"],
      });
    }

    if (params.offset !== undefined && params.offset < 0) {
      throw new ValidationError("offset must be non-negative", {
        offset: ["offset must be >= 0"],
      });
    }

    return this.request("memory_list", params as unknown as Record<string, unknown>, MemoryListResponseSchema);
  }

  /**
   * Soft-delete a memory.
   * Appends deletion event to PostgreSQL and marks the semantic node as deprecated.
   * Original rows remain for audit trail.
   *
   * @param params - Delete parameters (id, group_id, user_id)
   * @returns Deletion confirmation
   * @throws {ValidationError} if group_id is invalid
   * @throws {NotFoundError} if memory does not exist
   */
  async delete(params: MemoryDeleteParams): Promise<MemoryDeleteResponse> {
    validateGroupId(params.group_id);

    if (!params.id) {
      throw new ValidationError("id is required", {
        id: ["id must be a valid UUID"],
      });
    }

    return this.request("memory_delete", params as unknown as Record<string, unknown>, MemoryDeleteResponseSchema);
  }
}
