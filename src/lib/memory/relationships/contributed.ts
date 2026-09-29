/**
 * CONTRIBUTED Relationship Tracker
 * Story 1.5: Track agent knowledge contributions
 *
 * Creates (Agent)-[:CONTRIBUTED]->(Entity) relationships in the semantic store
 * to track which agents contributed to tasks, decisions, lessons, etc.
 */

import { canonicalizeAgentId, resolveCanonicalAgentIdentity } from "@/lib/agents/canonical-identity";
import { memory } from "../writer";
import type { MemoryLabel, RelationshipType } from "../writer";

/**
 * Agent contribution input
 */
export interface AgentContributionInput {
  /** Agent ID (e.g., 'memory-orchestrator') */
  agentId: string;
  /** Entity that was contributed to */
  entityId: string;
  /** Entity label (Task, Decision, Lesson, etc.) */
  entityLabel: MemoryLabel;
  /** Optional: Timestamp of contribution */
  timestamp?: string;
  /** Optional: Result/outcome of contribution */
  result?: string;
  /** Optional: Session ID for attribution */
  sessionId?: string;
  /** Optional: Confidence score */
  confidence?: number;
}

/**
 * Record an agent's contribution to an entity
 *
 * Creates or merges a CONTRIBUTED relationship:
 * (Agent {agent_id})-[:CONTRIBUTED {on, result, session_id}]->(Entity {entity_id})
 *
 * @param contribution - Contribution details
 * @param group_id - Tenant isolation (required)
 * @returns Promise that resolves when relationship is created
 */
export async function recordContribution(
  contribution: AgentContributionInput,
  group_id: string
): Promise<void> {
  const mem = memory();
  const canonicalAgent = resolveCanonicalAgentIdentity(contribution.agentId);

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

  // Create CONTRIBUTED relationship
  await mem.createRelationship({
    fromId: canonicalAgent.id,
    fromLabel: "Agent",
    toId: contribution.entityId,
    toLabel: contribution.entityLabel,
    type: "CONTRIBUTED",
    props: {
      on: contribution.timestamp ?? new Date().toISOString(),
      result: contribution.result ?? "complete",
      session_id: contribution.sessionId,
      confidence: contribution.confidence ?? 0.5,
    },
  });
}

/**
 * Batch record multiple contributions
 *
 * @param contributions - Array of contribution inputs
 * @param group_id - Tenant isolation
 * @returns Summary of created relationships
 */
export async function recordContributionsBatch(
  contributions: AgentContributionInput[],
  group_id: string
): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const results = { total: contributions.length, succeeded: 0, failed: 0 };

  for (const contribution of contributions) {
    try {
      await recordContribution(contribution, group_id);
      results.succeeded++;
    } catch (error) {
      console.error(
        `[ContributedTracker] Failed to record contribution: ${error instanceof Error ? error.message : error}`
      );
      results.failed++;
    }
  }

  return results;
}

/**
 * Query contributions by agent
 *
 * Returns all entities an agent has contributed to.
 *
 * @param agentId - Agent identifier
 * @param group_id - Tenant isolation
 * @returns Array of contributed entities
 */
export async function getAgentContributions(
  agentId: string,
  group_id: string
): Promise<Array<{
  entityId: string;
  entityLabel: MemoryLabel;
  contributedOn: string;
  result: string;
}>> {
  const mem = memory();
  const canonicalAgentId = canonicalizeAgentId(agentId);

  const result = await mem.query<{
    entityId: string;
    entityLabel: MemoryLabel;
    contributedOn: string;
    result: string;
  }>(
    `
    MATCH (a:Agent {agent_id: $agentId, group_id: $groupId})-
      [r:CONTRIBUTED]->(e)
    WHERE e.group_id = $groupId
    RETURN 
      e.node_id AS entityId,
      labels(e)[0] AS entityLabel,
      r.on AS contributedOn,
      r.result AS result
    ORDER BY r.on DESC
  `,
    { agentId: canonicalAgentId, groupId: group_id }
  );

  return result;
}

/**
 * Query contributors to an entity
 *
 * Returns all agents who contributed to a specific entity.
 *
 * @param entityId - Entity identifier
 * @param entityLabel - Entity label type
 * @param group_id - Tenant isolation
 * @returns Array of contributing agents
 */
export async function getEntityContributors(
  entityId: string,
  entityLabel: MemoryLabel,
  group_id: string
): Promise<Array<{
  agentId: string;
  contributedOn: string;
  result: string;
}>> {
  const mem = memory();

  const result = await mem.query<{
    agentId: string;
    contributedOn: string;
    result: string;
  }>(
    `
    MATCH (a:Agent)-[r:CONTRIBUTED]->(e:${entityLabel} {node_id: $entityId, group_id: $groupId})
    WHERE a.group_id = $groupId
    RETURN 
      a.agent_id AS agentId,
      r.on AS contributedOn,
      r.result AS result
    ORDER BY r.on DESC
  `,
    { entityId, groupId: group_id }
  );

  return result;
}

/**
 * Create a task with automatic contribution tracking
 *
 * Helper that creates a Task entity and records the agent's contribution.
 *
 * @param taskProps - Task properties
 * @param agentId - Agent creating the task
 * @param group_id - Tenant isolation
 * @returns Created task ID
 */
export async function createTaskWithContribution(
  taskProps: {
    goal: string;
    status?: string;
    [key: string]: unknown;
  },
  agentId: string,
  group_id: string
): Promise<{ taskId: string }> {
  const mem = memory();
  const canonicalAgentId = canonicalizeAgentId(agentId);

  // Create task
  const { node_id: taskId } = await mem.createEntity({
    label: "Task",
    group_id,
    props: {
      task_id: crypto.randomUUID(),
      ...taskProps,
      status: taskProps.status ?? "created",
    },
  });

  // Record contribution
  await recordContribution(
    {
      agentId: canonicalAgentId,
      entityId: taskId,
      entityLabel: "Task",
      result: "created",
    },
    group_id
  );

  return { taskId };
}

/**
 * Contribution statistics for an agent
 *
 * @param agentId - Agent identifier
 * @param group_id - Tenant isolation
 * @returns Statistics summary
 */
export async function getAgentContributionStats(
  agentId: string,
  group_id: string
): Promise<{
  totalContributions: number;
  byEntityType: Record<string, number>;
  recentContributions: Array<{
    entityId: string;
    entityLabel: string;
    date: string;
  }>;
}> {
  const mem = memory();

  interface RecentContribution {
    entityId: string;
    entityLabel: string;
    date: string;
  }

  interface StatsResult {
    totalContributions: number;
    recentContributions: RecentContribution[];
  }

  const result = await mem.query<StatsResult>(
    `
    MATCH (a:Agent {agent_id: $agentId, group_id: $groupId})-[r:CONTRIBUTED]->(e)
    WHERE e.group_id = $groupId
    WITH 
      count(r) AS totalContributions,
      collect({
        entityId: e.node_id,
        entityLabel: labels(e)[0],
        date: r.on
      })[0..5] AS recentContributions
    RETURN 
      totalContributions,
      recentContributions
  `,
    { agentId, groupId: group_id }
  );

  if (result.length === 0) {
    return {
      totalContributions: 0,
      byEntityType: {},
      recentContributions: [],
    };
  }

  // Query for breakdown by entity type
  const byTypeResult = await mem.query<{
    entityLabel: string;
    count: number;
  }>(
    `
    MATCH (a:Agent {agent_id: $agentId, group_id: $groupId})-[r:CONTRIBUTED]->(e)
    WHERE e.group_id = $groupId
    RETURN labels(e)[0] AS entityLabel, count(r) AS count
  `,
    { agentId, groupId: group_id }
  );

  const byEntityType: Record<string, number> = {};
  for (const row of byTypeResult) {
    byEntityType[row.entityLabel] = row.count;
  }

  const recentContributions = (result[0].recentContributions || []).map((c: RecentContribution) => ({
    entityId: c.entityId,
    entityLabel: c.entityLabel,
    date: c.date,
  }));

  return {
    totalContributions: result[0].totalContributions,
    byEntityType,
    recentContributions,
  };
}
