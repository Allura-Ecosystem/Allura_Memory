/**
 * Memory Module
 * 
 * Unified memory system for AI agents with:
 * - RuVector graph storage for insights and knowledge
 * - PostgreSQL trace storage for raw events
 * - Multi-tenant isolation via group_id
 */

// Types
export * from "./types";

// Operations
export { searchMemories, getMemoriesByType, searchAgents } from "./search";
export { getMemory, getCurrentMemory, getMemoryHistory, memoryExists } from "./get";

// Knowledge Promotion (HITL governance)
export {
  ApprovalRequiredError,
  logApprovalEvent,
  requireApprovalBeforePromotion,
  hasApprovalEvent,
} from "./approval-audit";

export {
  type KnowledgeInsight,
  type ApprovalQueueItem,
  type PromotionResult,
  type KnowledgeHubEntry,
  type KnowledgeHubPromotionParams,
  type NotionMCPClient,
  KNOWLEDGE_HUB_DB_ID,
  KNOWLEDGE_HUB_DATA_SOURCE_ID,
  CURATOR_PROPOSALS_DATA_SOURCE_ID,
  KnowledgeHubPromotionParamsSchema,
  ApprovedProposalRowSchema,
  queryApprovedInsights,
  queryApprovedInsightById,
  queryKnowledgeHubBySourceId,
  queryKnowledgeHubByPgTraceId,
  promoteToSemanticStore,
  promoteToKnowledgeHub,
  linkInsightToAgent,
  updateNotionWithSemanticId,
  updateApprovalQueueItem,
  logPromotionEvent,
  processApprovedInsights,
  promoteSingleInsight,
  validateInsightForPromotion,
} from "./knowledge-promotion";

// Orchestrator write wrapper
export { memory } from "./writer";
export type {
  MemoryAPI,
  MemoryLabel,
  RelationshipType,
  CreateEntityInput,
  CreateEntityResult,
  CreateRelationshipCallInput,
  SearchInput,
  // Backward compatibility aliases
  CreateEntityInput as WriteInput,
  CreateEntityResult as WriteResult,
  CreateRelationshipCallInput as RelateInput,
} from "./writer";

// Backward compatibility function exports
export { write, relate, read } from "./writer";

// Traceable Memory (Story 1.2) - TraceMiddleware integration
export {
  createTraceableMemory,
  traceableMemory,
  type TraceableMemoryConfig,
  type TraceableMemoryAPI,
} from "./traceable-memory";

// Convenience re-exports
export {
  buildTopicKey,
  parseTopicKey,
  TOPIC_KEY_PREFIXES,
  RESERVED_GROUP_IDS,
  PROJECT_GROUP_IDS,
} from "./types";
