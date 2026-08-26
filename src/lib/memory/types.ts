/**
 * Memory System Types
 * 
 * Core types for the unified memory system supporting:
 * - Neo4j graph storage for insights and knowledge
 * - PostgreSQL trace storage for raw events
 * - Multi-tenant isolation via group_id
 */

import { z } from "zod";

// ============================================================================
// BASE TYPES
// ============================================================================

/**
 * Memory node types in the knowledge graph
 */
export const MemoryNodeType = z.enum([
  "Insight",
  "Agent",
  "Entity",
  "Decision",
  "Research",
  "ADR",
  "Pattern",
  "Workflow",
  "Project",
  "Epic",
  "Story",
  "Task",
]);
export type MemoryNodeType = z.infer<typeof MemoryNodeType>;

/**
 * Memory relationship types
 */
export const MemoryRelationType = z.enum([
  "SUPERSEDES",
  "RELATES_TO",
  "CREATED_BY",
  "APPROVED_BY",
  "EVIDENCE_FOR",
  "IMPLEMENTED_BY",
  "DEPENDS_ON",
  "PART_OF",
  "FOLLOWS",
]);
export type MemoryRelationType = z.infer<typeof MemoryRelationType>;

/**
 * Insight lifecycle states (Steel Frame model)
 */
export const InsightStatus = z.enum([
  "draft",
  "testing",
  "active",
  "deprecated",
  "archived",
]);
export type InsightStatus = z.infer<typeof InsightStatus>;

// ============================================================================
// MEMORY SEARCH TYPES
// ============================================================================

/**
 * Search request for memory queries
 */
export const MemorySearchRequest = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  group_id: z.string().min(1, "group_id is required for tenant isolation"),
  workspace_id: z.string().min(1, "workspace_id is required for workspace isolation"),
  agent_id: z.string().min(1, "agent_id is required for scoped access"),
  types: z.array(MemoryNodeType).optional(),
  limit: z.number().int().min(1).max(100).default(10),
  offset: z.number().int().min(0).default(0),
  include_global: z.boolean().default(true),
  confidence_min: z.number().min(0).max(1).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});
export type MemorySearchRequest = z.infer<typeof MemorySearchRequest>;

/**
 * Memory search result
 */
export const MemorySearchResult = z.object({
  id: z.string(),
  type: MemoryNodeType,
  topic_key: z.string(),
  title: z.string().optional(),
  summary: z.string().optional(),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  group_id: z.string(),
  status: InsightStatus,
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number().int().min(1),
  superseded_by: z.string().optional(),
  trace_ref: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type MemorySearchResult = z.infer<typeof MemorySearchResult>;

/**
 * Memory search response
 */
export const MemorySearchResponse = z.object({
  results: z.array(MemorySearchResult),
  total: z.number().int(),
  query_time_ms: z.number(),
  group_id: z.string(),
});
export type MemorySearchResponse = z.infer<typeof MemorySearchResponse>;

// ============================================================================
// MEMORY STORE TYPES
// ============================================================================

/**
 * Create memory request
 */
export const CreateMemoryRequest = z.object({
  type: MemoryNodeType,
  topic_key: z.string().min(1, "topic_key is required"),
  title: z.string().optional(),
  summary: z.string().optional(),
  content: z.string().min(1, "Content cannot be empty"),
  confidence: z.number().min(0).max(1).default(0.5),
  group_id: z.string().min(1, "group_id is required for tenant isolation"),
  status: InsightStatus.default("draft"),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  superseded_id: z.string().optional(),
  trace_ref: z.string().optional(),
});
export type CreateMemoryRequest = z.infer<typeof CreateMemoryRequest>;

/**
 * Create memory response
 */
export const CreateMemoryResponse = z.object({
  id: z.string(),
  type: MemoryNodeType,
  topic_key: z.string(),
  created_at: z.string(),
  version: z.number().int(),
  status: InsightStatus,
});
export type CreateMemoryResponse = z.infer<typeof CreateMemoryResponse>;

// ============================================================================
// MEMORY GET TYPES
// ============================================================================

/**
 * Get memory request
 */
export const GetMemoryRequest = z.object({
  topic_key: z.string().min(1, "topic_key is required"),
  group_id: z.string().min(1, "group_id is required for tenant isolation"),
  workspace_id: z.string().min(1, "workspace_id is required for workspace isolation"),
  agent_id: z.string().min(1, "agent_id is required for scoped access"),
  version: z.number().int().min(1).optional(),
  include_history: z.boolean().default(false),
  include_evidence: z.boolean().default(false),
});
export type GetMemoryRequest = z.infer<typeof GetMemoryRequest>;

/**
 * Get memory response
 */
export const GetMemoryResponse = z.object({
  current: MemorySearchResult,
  history: z.array(MemorySearchResult).optional(),
  evidence: z.array(z.object({
    id: z.string(),
    type: z.string(),
    timestamp: z.string(),
    summary: z.string(),
  })).optional(),
});
export type GetMemoryResponse = z.infer<typeof GetMemoryResponse>;

// ============================================================================
// TRACE TYPES (PostgreSQL)
// ============================================================================

/**
 * Trace event for raw evidence storage
 */
export const TraceEvent = z.object({
  group_id: z.string(),
  agent_id: z.string(),
  workflow: z.string(),
  event_type: z.string(),
  outcome: z.enum(["success", "failure", "pending"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  trace_ref: z.string().optional(),
});
export type TraceEvent = z.infer<typeof TraceEvent>;

// ============================================================================
// TOPIC KEY CONVENTIONS
// ============================================================================

/**
 * Standard topic key prefixes for different memory types
 */
export const TOPIC_KEY_PREFIXES = {
  AGENT: "agent",
  INSIGHT: "insight",
  RESEARCH: "research",
  ADR: "adr",
  PATTERN: "pattern",
  PROJECT: "project",
  EPIC: "epic",
  STORY: "story",
  DECISION: "decision",
} as const;

/**
 * Build a topic key from prefix and identifier
 */
export function buildTopicKey(
  prefix: keyof typeof TOPIC_KEY_PREFIXES,
  identifier: string,
  group_id: string
): string {
  return `${group_id}.${prefix}.${identifier}`;
}

/**
 * Parse a topic key into its components
 */
export function parseTopicKey(topic_key: string): {
  group_id: string;
  prefix: string;
  identifier: string;
} | null {
  const parts = topic_key.split(".");
  if (parts.length < 3) return null;
  return {
    group_id: parts[0],
    prefix: parts[1],
    identifier: parts.slice(2).join("."),
  };
}

// ============================================================================
// GROUP ID CONSTANTS
// ============================================================================

/**
 * Reserved group IDs
 */
export const RESERVED_GROUP_IDS = {
  GLOBAL: "global",
  SYSTEM: "system",
  TEST: "test",
} as const;

/**
 * Project-specific group IDs
 */
export const PROJECT_GROUP_IDS = {
  RONINOS: "roninos",
  FAITH_MEATS: "faith-meats",
  MEMORY: "memory",
} as const;