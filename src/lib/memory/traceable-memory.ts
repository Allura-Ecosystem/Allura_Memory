/**
 * Traceable Memory API - Story 1.2
 *
 * Wraps MemoryAPI with TraceMiddleware to automatically trace all
 * semantic write operations to PostgreSQL.
 *
 * Usage:
 *   const memory = createTraceableMemory({
 *     agentId: 'brooks',
 *     groupId: 'allura-test',
 *     innerClient: mcpClient,
 *     flushIntervalMs: 5000
 *   });
 *
 *   // All calls are automatically traced
 *   const { node_id } = await memory.createEntity({ ... });
 */

if (typeof window !== "undefined") {
  throw new Error("This module can only be used server-side");
}

import type { McpToolCaller } from "@/integrations/mcp.client";
import { TraceMiddleware, type TraceMiddlewareConfig } from "@/lib/mcp/trace-middleware";
import {
  type CreateEntityInput,
  type CreateEntityResult,
  type CreateRelationshipCallInput,
  memory,
  type MemoryAPI,
  type SearchInput,
} from "./writer";

export interface TraceableMemoryConfig {
  /** Agent identifier for traces */
  agentId: string;
  /** Tenant isolation group */
  groupId: string;
  /** Optional workflow context */
  workflowId?: string;
  /** Optional step context */
  stepId?: string;
  /** Buffer flush interval in ms (default: immediate) */
  flushIntervalMs?: number;
  /** Inner MCP client for tool calls (optional - creates default if not provided) */
  innerClient?: McpToolCaller;
}

export interface TraceableMemoryAPI extends MemoryAPI {
  /** Start a traced session */
  startSession(workflowId?: string): Promise<void>;
  /** End the traced session and flush remaining traces */
  endSession(): Promise<void>;
  /** Log a decision with confidence score */
  logDecision(content: string, confidence: number): Promise<void>;
  /** Log a learning moment */
  logLearning(content: string, confidence?: number): Promise<void>;
  /** Manually flush the trace buffer */
  flush(): Promise<void>;
  /** Clean up resources */
  destroy(): Promise<void>;
}

/**
 * Create a traceable memory API that wraps all semantic operations with
 * automatic PostgreSQL tracing.
 */
export function createTraceableMemory(config: TraceableMemoryConfig): TraceableMemoryAPI {
  const { agentId, groupId, workflowId, stepId, flushIntervalMs, innerClient } = config;

  // Validate required fields
  if (!agentId || agentId.trim().length === 0) {
    throw new Error("agentId is required and cannot be empty");
  }
  if (!groupId || groupId.trim().length === 0) {
    throw new Error("groupId is required and cannot be empty");
  }

  // Create a minimal MCP tool caller for the TraceMiddleware
  // This bridges the gap between MemoryAPI and MCP tool calling
  const mcpCaller: McpToolCaller = innerClient ?? {
    async callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
      // This is a no-op since MemoryAPI doesn't use MCP tools directly
      // The tracing happens at the memory operation level
      return {} as T;
    },
  };

  const traceConfig: TraceMiddlewareConfig = {
    agentId,
    groupId,
    innerClient: mcpCaller,
    flushIntervalMs,
    workflowId,
    stepId,
  };

  const tracer = new TraceMiddleware(traceConfig);
  const innerMemory = memory();

  return {
    // Core MemoryAPI methods with tracing
    async createEntity(input: CreateEntityInput): Promise<CreateEntityResult> {
      const startTime = performance.now();
      try {
        const result = await innerMemory.createEntity(input);
        const durationMs = performance.now() - startTime;

        // Log the trace via TraceMiddleware
        await tracer.callTool("memory.createEntity", {
          label: input.label,
          group_id: input.group_id,
          node_id: result.node_id,
          duration_ms: durationMs,
          success: true,
        });

        return result;
      } catch (error) {
        const durationMs = performance.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Log error trace
        await tracer.callTool("memory.createEntity", {
          label: input.label,
          group_id: input.group_id,
          duration_ms: durationMs,
          success: false,
          error: errorMessage,
        });

        throw error;
      }
    },

    async createRelationship(input: CreateRelationshipCallInput): Promise<void> {
      const startTime = performance.now();
      try {
        await innerMemory.createRelationship(input);
        const durationMs = performance.now() - startTime;

        await tracer.callTool("memory.createRelationship", {
          type: input.type,
          fromId: input.fromId,
          toId: input.toId,
          duration_ms: durationMs,
          success: true,
        });
      } catch (error) {
        const durationMs = performance.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await tracer.callTool("memory.createRelationship", {
          type: input.type,
          fromId: input.fromId,
          toId: input.toId,
          duration_ms: durationMs,
          success: false,
          error: errorMessage,
        });

        throw error;
      }
    },

    async query<T>(cypher: string, params?: Record<string, unknown>): Promise<T[]> {
      const startTime = performance.now();
      try {
        const results = await innerMemory.query<T>(cypher, params);
        const durationMs = performance.now() - startTime;

        await tracer.callTool("memory.query", {
          cypher: cypher.substring(0, 500), // Truncate for safety
          duration_ms: durationMs,
          result_count: results.length,
          success: true,
        });

        return results;
      } catch (error) {
        const durationMs = performance.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await tracer.callTool("memory.query", {
          cypher: cypher.substring(0, 500),
          duration_ms: durationMs,
          success: false,
          error: errorMessage,
        });

        throw error;
      }
    },

    async search<T>(input: SearchInput): Promise<T[]> {
      const startTime = performance.now();
      try {
        const results = await innerMemory.search<T>(input);
        const durationMs = performance.now() - startTime;

        await tracer.callTool("memory.search", {
          label: input.label,
          group_id: input.group_id,
          duration_ms: durationMs,
          result_count: results.length,
          success: true,
        });

        return results;
      } catch (error) {
        const durationMs = performance.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await tracer.callTool("memory.search", {
          label: input.label,
          group_id: input.group_id,
          duration_ms: durationMs,
          success: false,
          error: errorMessage,
        });

        throw error;
      }
    },

    // Session lifecycle methods
    async startSession(sessionWorkflowId?: string): Promise<void> {
      await tracer.startSession(sessionWorkflowId ?? workflowId);
    },

    async endSession(): Promise<void> {
      await tracer.endSession();
    },

    async logDecision(content: string, confidence: number): Promise<void> {
      await tracer.logDecision(content, confidence);
    },

    async logLearning(content: string, confidence?: number): Promise<void> {
      await tracer.logLearning(content, confidence);
    },

    async flush(): Promise<void> {
      await tracer.flush();
    },

    async destroy(): Promise<void> {
      await tracer.destroy();
    },
  };
}

// Convenience export for backward compatibility
export { createTraceableMemory as traceableMemory };
