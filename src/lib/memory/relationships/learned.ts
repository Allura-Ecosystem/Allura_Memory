/**
 * LEARNED Relationship Tracker
 * Story 1.6: Track agent session learning
 *
 * Creates (Agent)-[:LEARNED]->(Insight|Lesson|Session) relationships in the semantic store
 * to track what agents learned during sessions.
 */

import { canonicalizeAgentId, resolveCanonicalAgentIdentity } from "@/lib/agents/canonical-identity";
import { memory } from "../writer";
import type { MemoryLabel } from "../writer";

/**
 * Agent learning input
 */
export interface AgentLearningInput {
  /** Agent ID (e.g., 'memory-orchestrator') */
  agentId: string;
  /** Entity that was learned (Insight, Lesson, Session, etc.) */
  entityId: string;
  /** Entity label type */
  entityLabel: MemoryLabel;
  /** Optional: Relevance score (0.0-1.0) */
  relevanceScore?: number;
  /** Optional: Context about what was learned */
  context?: string;
  /** Optional: Session ID where learning occurred */
  sessionId?: string;
  /** Optional: Timestamp */
  timestamp?: string;
}

/**
 * Record that an agent learned from an entity
 *
 * Creates or merges a LEARNED relationship:
 * (Agent {agent_id})-[:LEARNED {timestamp, relevance_score, context}]->(Entity)
 *
 * @param learning - Learning details
 * @param group_id - Tenant isolation (required)
 * @returns Promise that resolves when relationship is created
 */
export async function recordLearning(
  learning: AgentLearningInput,
  group_id: string
): Promise<void> {
  const mem = memory();
  const canonicalAgent = resolveCanonicalAgentIdentity(learning.agentId);

  // Ensure agent node exists
  await mem.createEntity({
    label: "Agent",
    group_id,
    props: {
      agent_id: canonicalAgent.id,
      name: canonicalAgent.name,
      type: "AI Agent",
    },
  });

  // Create LEARNED relationship
  await mem.createRelationship({
    fromId: canonicalAgent.id,
    fromLabel: "Agent",
    toId: learning.entityId,
    toLabel: learning.entityLabel,
    type: "LEARNED",
    props: {
      timestamp: learning.timestamp ?? new Date().toISOString(),
      relevance_score: learning.relevanceScore ?? 0.5,
      context: learning.context,
      session_id: learning.sessionId,
    },
  });
}

/**
 * Batch record multiple learnings
 *
 * @param learnings - Array of learning inputs
 * @param group_id - Tenant isolation
 * @returns Summary of created relationships
 */
export async function recordLearningsBatch(
  learnings: AgentLearningInput[],
  group_id: string
): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const results = { total: learnings.length, succeeded: 0, failed: 0 };

  for (const learning of learnings) {
    try {
      await recordLearning(learning, group_id);
      results.succeeded++;
    } catch (error) {
      console.error(
        `[LearnedTracker] Failed to record learning: ${error instanceof Error ? error.message : error}`
      );
      results.failed++;
    }
  }

  return results;
}

/**
 * Query learnings by agent
 *
 * Returns all entities an agent has learned from.
 *
 * @param agentId - Agent identifier
 * @param group_id - Tenant isolation
 * @returns Array of learned entities
 */
export async function getAgentLearnings(
  agentId: string,
  group_id: string
): Promise<Array<{
  entityId: string;
  entityLabel: MemoryLabel;
  learnedAt: string;
  relevanceScore: number;
  context?: string;
}>> {
  const mem = memory();
  const canonicalAgentId = canonicalizeAgentId(agentId);

  const result = await mem.query<{
    entityId: string;
    entityLabel: MemoryLabel;
    learnedAt: string;
    relevanceScore: number;
    context?: string;
  }>(
    `
    MATCH (a:Agent {agent_id: $agentId, group_id: $groupId})-
      [r:LEARNED]->(e)
    WHERE e.group_id = $groupId
    RETURN 
      e.node_id AS entityId,
      labels(e)[0] AS entityLabel,
      r.timestamp AS learnedAt,
      r.relevance_score AS relevanceScore,
      r.context AS context
    ORDER BY r.timestamp DESC
  `,
    { agentId: canonicalAgentId, groupId: group_id }
  );

  return result;
}

/**
 * Query agents who learned from an entity
 *
 * Returns all agents who learned from a specific entity.
 *
 * @param entityId - Entity identifier
 * @param entityLabel - Entity label type
 * @param group_id - Tenant isolation
 * @returns Array of agents who learned
 */
export async function getLearningAgents(
  entityId: string,
  entityLabel: MemoryLabel,
  group_id: string
): Promise<Array<{
  agentId: string;
  learnedAt: string;
  relevanceScore: number;
}>> {
  const mem = memory();

  const result = await mem.query<{
    agentId: string;
    learnedAt: string;
    relevanceScore: number;
  }>(
    `
    MATCH (a:Agent)-[r:LEARNED]->(e:${entityLabel} {node_id: $entityId, group_id: $groupId})
    WHERE a.group_id = $groupId
    RETURN 
      a.agent_id AS agentId,
      r.timestamp AS learnedAt,
      r.relevance_score AS relevanceScore
    ORDER BY r.timestamp DESC
  `,
    { entityId, groupId: group_id }
  );

  return result;
}

/**
 * Create a lesson with automatic learning tracking
 *
 * Helper that creates a Lesson entity and records the agent's learning.
 *
 * @param lessonProps - Lesson properties
 * @param agentId - Agent creating the lesson
 * @param group_id - Tenant isolation
 * @returns Created lesson ID
 */
export async function createLessonWithLearning(
  lessonProps: {
    learned: string;
    context?: string;
    severity?: "info" | "warning" | "critical";
    [key: string]: unknown;
  },
  agentId: string,
  group_id: string
): Promise<{ lessonId: string }> {
  const mem = memory();
  const canonicalAgentId = canonicalizeAgentId(agentId);

  // Create lesson
  const { node_id: lessonId } = await mem.createEntity({
    label: "Lesson",
    group_id,
    props: {
      lesson_id: crypto.randomUUID(),
      ...lessonProps,
      severity: lessonProps.severity ?? "info",
    },
  });

  // Record learning
  await recordLearning(
    {
      agentId: canonicalAgentId,
      entityId: lessonId,
      entityLabel: "Lesson",
      relevanceScore: 0.8,
      context: lessonProps.context,
    },
    group_id
  );

  return { lessonId };
}

/**
 * Get high-relevance learnings for an agent
 *
 * Returns learnings with relevance score >= threshold.
 *
 * @param agentId - Agent identifier
 * @param group_id - Tenant isolation
 * @param minRelevance - Minimum relevance score (0.0-1.0)
 * @returns Filtered learnings
 */
export async function getHighRelevanceLearnings(
  agentId: string,
  group_id: string,
  minRelevance: number = 0.7
): Promise<Array<{
  entityId: string;
  entityLabel: MemoryLabel;
  learnedAt: string;
  relevanceScore: number;
}>> {
  const mem = memory();

  const result = await mem.query<{
    entityId: string;
    entityLabel: MemoryLabel;
    learnedAt: string;
    relevanceScore: number;
  }>(
    `
    MATCH (a:Agent {agent_id: $agentId, group_id: $groupId})-
      [r:LEARNED]->(e)
    WHERE e.group_id = $groupId
      AND r.relevance_score >= $minRelevance
    RETURN 
      e.node_id AS entityId,
      labels(e)[0] AS entityLabel,
      r.timestamp AS learnedAt,
      r.relevance_score AS relevanceScore
    ORDER BY r.relevance_score DESC, r.timestamp DESC
  `,
    { agentId, groupId: group_id, minRelevance }
  );

  return result;
}

/**
 * Learning statistics for an agent
 *
 * @param agentId - Agent identifier
 * @param group_id - Tenant isolation
 * @returns Statistics summary
 */
export async function getAgentLearningStats(
  agentId: string,
  group_id: string
): Promise<{
  totalLearnings: number;
  byEntityType: Record<string, number>;
  averageRelevance: number;
  recentLearnings: Array<{
    entityId: string;
    entityLabel: string;
    date: string;
  }>;
}> {
  const mem = memory();

  interface RecentLearning {
    entityId: string;
    entityLabel: string;
    date: string;
  }

  interface StatsResult {
    totalLearnings: number;
    avgRelevance: number;
    recentLearnings: RecentLearning[];
  }

  const result = await mem.query<StatsResult>(
    `
    MATCH (a:Agent {agent_id: $agentId, group_id: $groupId})-
      [r:LEARNED]->(e)
    WHERE e.group_id = $groupId
    WITH 
      count(r) AS totalLearnings,
      avg(r.relevance_score) AS avgRelevance,
      collect({
        entityId: e.node_id,
        entityLabel: labels(e)[0],
        date: r.timestamp
      })[0..5] AS recentLearnings
    RETURN 
      totalLearnings,
      avgRelevance,
      recentLearnings
  `,
    { agentId, groupId: group_id }
  );

  if (result.length === 0) {
    return {
      totalLearnings: 0,
      byEntityType: {},
      averageRelevance: 0,
      recentLearnings: [],
    };
  }

  // Query for breakdown by entity type
  const byTypeResult = await mem.query<{
    entityLabel: string;
    count: number;
  }>(
    `
    MATCH (a:Agent {agent_id: $agentId, group_id: $groupId})-
      [r:LEARNED]->(e)
    WHERE e.group_id = $groupId
    RETURN labels(e)[0] AS entityLabel, count(r) AS count
  `,
    { agentId, groupId: group_id }
  );

  const byEntityType: Record<string, number> = {};
  for (const row of byTypeResult) {
    byEntityType[row.entityLabel] = row.count;
  }

  const recentLearnings = (result[0].recentLearnings || []).map((c: RecentLearning) => ({
    entityId: c.entityId,
    entityLabel: c.entityLabel,
    date: c.date,
  }));

  return {
    totalLearnings: result[0].totalLearnings,
    byEntityType,
    averageRelevance: result[0].avgRelevance,
    recentLearnings,
  };
}
