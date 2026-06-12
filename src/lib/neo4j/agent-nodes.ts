/**
 * Team RAM Agent Nodes - Neo4j Operations
 *
 * Manages persistent memory nodes for Allura Agent-OS Team RAM agents.
 * Each of the 10 Team RAM agents (Brooks, Jobs, Woz, Scout, Knuth,
 * Bellard, Carmack, Pike, Fowler, Hightower) has a unique memory node
 * that tracks its state, contributions, and learning over time.
 *
 * **Tenant Isolation**: All operations require `group_id` for multi-tenant safety.
 * **Steel Frame Versioning**: Agent nodes support SUPERSEDES lineage.
 */

import { type ManagedTransaction, readTransaction, writeTransaction } from "./connection";

// Server-only guard: throw if imported in browser environment
if (typeof window !== "undefined") {
  throw new Error("Agent memory module can only be used server-side");
}

/**
 * Agent status values
 */
export type AgentStatus = "active" | "inactive" | "paused" | "deprecated";

/**
 * Agent memory node - tracks agent state and contributions
 */
export interface AgentNode {
  /** Stable identifier (e.g., 'agent.memory-orchestrator') */
  id: string;
  /** Agent identifier (e.g., 'memory-orchestrator') */
  agent_id: string;
  /** Human-readable name (e.g., 'MemoryOrchestrator') */
  name: string;
  /** Agent role description */
  role: string;
  /** Model identifier (e.g., 'ollama-cloud/glm-5.1') */
  model: string;
  /** Fallback model identifier (e.g., 'ollama-cloud/glm-5.1') */
  fallback_model: string;
  /** Tenant isolation identifier (e.g., 'allura-system') */
  group_id: string;
  /** Creation timestamp */
  created_at: Date;
  /** Last activity timestamp */
  last_active: Date;
  /** Agent confidence score (0.0 to 1.0) */
  confidence: number;
  /** Number of contributions made */
  contribution_count: number;
  /** Number of learning events recorded */
  learning_count: number;
  /** Current status */
  status: AgentStatus;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Agent creation payload
 */
export interface AgentInsert {
  /** Required: Agent identifier (e.g., 'memory-orchestrator') */
  agent_id: string;
  /** Required: Human-readable name */
  name: string;
  /** Required: Agent role */
  role: string;
  /** Required: Model identifier */
  model: string;
  /** Optional: Fallback model identifier (defaults to 'ollama-cloud/glm-5.1') */
  fallback_model?: string;
  /** Required: Tenant isolation identifier */
  group_id: string;
  /** Optional: Initial confidence (defaults to 0.0) */
  confidence?: number;
  /** Optional: Initial status (defaults to 'active') */
  status?: AgentStatus;
  /** Optional: Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent query parameters
 */
export interface AgentQueryParams {
  /** Required: Tenant isolation */
  group_id: string;
  /** Optional: Filter by agent_id */
  agent_id?: string;
  /** Optional: Filter by status */
  status?: AgentStatus;
  /** Optional: Filter by name (fuzzy match) */
  name?: string;
  /** Optional: Pagination limit */
  limit?: number;
  /** Optional: Pagination offset */
  offset?: number;
}

/**
 * Validation error for invalid agent data
 */
export class AgentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentValidationError";
  }
}

/**
 * Conflict error for duplicate agents
 */
export class AgentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConflictError";
  }
}

/**
 * Query error for invalid query parameters
 */
export class AgentQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentQueryError";
  }
}

/**
 * Validate agent insert payload
 */
function validateAgentInsert(agent: AgentInsert): void {
  const errors: string[] = [];

  if (!agent.agent_id || agent.agent_id.trim().length === 0) {
    errors.push("agent_id is required and cannot be empty");
  }

  if (!agent.group_id || agent.group_id.trim().length === 0) {
    errors.push("group_id is required and cannot be empty");
  }

  // Enforce allura-* naming convention
  if (agent.group_id && !agent.group_id.startsWith("allura-")) {
    errors.push("group_id must use allura-* format (found: " + agent.group_id + ")");
  }

  if (!agent.name || agent.name.trim().length === 0) {
    errors.push("name is required and cannot be empty");
  }

  if (!agent.role || agent.role.trim().length === 0) {
    errors.push("role is required and cannot be empty");
  }

  if (!agent.model || agent.model.trim().length === 0) {
    errors.push("model is required and cannot be empty");
  }

  if (agent.confidence !== undefined && (agent.confidence < 0 || agent.confidence > 1)) {
    errors.push("confidence must be between 0 and 1");
  }

  if (errors.length > 0) {
    throw new AgentValidationError(`Agent validation failed: ${errors.join("; ")}`);
  }
}

/**
 * Validate query parameters
 */
function validateQueryParams(params: AgentQueryParams): void {
  const errors: string[] = [];

  if (!params.group_id || params.group_id.trim().length === 0) {
    errors.push("group_id is required and cannot be empty");
  }

  // Enforce allura-* naming convention
  if (params.group_id && !params.group_id.startsWith("allura-")) {
    errors.push("group_id must use allura-* format (found: " + params.group_id + ")");
  }

  if (params.limit !== undefined && params.limit < 0) {
    errors.push("limit must be a positive number");
  }

  if (params.offset !== undefined && params.offset < 0) {
    errors.push("offset must be a positive number");
  }

  if (errors.length > 0) {
    throw new AgentQueryError(`Query validation failed: ${errors.join("; ")}`);
  }
}

/**
 * Convert Neo4j record to AgentNode
 */
function neo4jToAgentNode(record: Record<string, unknown>): AgentNode {
  const props = record.properties || record;

  const convertValue = (val: unknown): unknown => {
    if (val === null || val === undefined) return val;
    // Handle Neo4j Integer
    if (typeof val === "object" && val !== null && "toNumber" in val && typeof (val as { toNumber: () => number }).toNumber === "function") {
      return (val as { toNumber: () => number }).toNumber();
    }
    return val;
  };

  const convertDate = (val: unknown): Date | null => {
    if (val === null || val === undefined) return null;
    // Handle Neo4j DateTime
    if (typeof val === "object" && val !== null) {
      const dateTime = val as { toString?: () => string; year?: { toNumber?: () => number }; month?: { toNumber?: () => number }; day?: { toNumber?: () => number } };
      if (typeof dateTime.toString === "function") {
        return new Date(dateTime.toString());
      }
      // Handle Neo4j Date object
      if (dateTime.year && dateTime.month && dateTime.day) {
        const y = typeof dateTime.year === "object" && dateTime.year.toNumber ? dateTime.year.toNumber() : dateTime.year as number;
        const m = typeof dateTime.month === "object" && dateTime.month.toNumber ? dateTime.month.toNumber() : dateTime.month as number;
        const d = typeof dateTime.day === "object" && dateTime.day.toNumber ? dateTime.day.toNumber() : dateTime.day as number;
        return new Date(y, m - 1, d);
      }
    }
    return new Date(val as string);
  };

  const convertMetadata = (val: unknown): Record<string, unknown> => {
    if (val === null || val === undefined) return {};
    // Neo4j 5.x rejects nested maps as node property values — only
    // primitives and arrays of primitives are valid (verified 2026-06-12
    // against Neo4j 5.26 community). The Agent writer JSON.stringifies
    // metadata, so we JSON.parse back on read. See insert-insight.ts for
    // the full investigation.
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return {};
      }
    }
    // Defensive: if a future writer stores a real map, walk it the same
    // way insert-insight does.
    if (typeof val === "object") {
      const result: Record<string, unknown> = {};
      const obj = val as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        result[key] = convertValue(obj[key]);
      }
      return result;
    }
    return {};
  };

  // Type assertion for props with known Agent properties
  const p = props as {
    id: unknown;
    agent_id: unknown;
    name: unknown;
    role: unknown;
    model: unknown;
    fallback_model: unknown;
    group_id: unknown;
    created_at: unknown;
    last_active: unknown;
    confidence: unknown;
    contribution_count: unknown;
    learning_count: unknown;
    status: unknown;
    metadata: unknown;
  };

  return {
    id: p.id as string,
    agent_id: p.agent_id as string,
    name: p.name as string,
    role: p.role as string,
    model: p.model as string,
    fallback_model: (p.fallback_model as string) ?? "ollama-cloud/glm-5.1",
    group_id: p.group_id as string,
    created_at: convertDate(p.created_at) as Date,
    last_active: convertDate(p.last_active) as Date,
    confidence: convertValue(p.confidence) as number,
    contribution_count: convertValue(p.contribution_count) as number,
    learning_count: convertValue(p.learning_count) as number,
    status: p.status as AgentStatus,
    metadata: convertMetadata(p.metadata),
  };
}

/**
 * Create a new agent memory node
 * 
 * @param agent - The agent to create
 * @returns The created agent node
 * @throws AgentValidationError if validation fails
 * @throws AgentConflictError if agent_id already exists in the group
 */
export async function createAgentNode(agent: AgentInsert): Promise<AgentNode> {
  validateAgentInsert(agent);

  const result = await writeTransaction(async (tx: ManagedTransaction) => {
    // Check if agent_id already exists in this group (tenant isolation)
    const checkQuery = `
      MATCH (a:Agent {agent_id: $agent_id, group_id: $group_id})
      RETURN a
    `;
    const checkResult = await tx.run(checkQuery, {
      agent_id: agent.agent_id,
      group_id: agent.group_id,
    });

    if (checkResult.records.length > 0) {
      throw new AgentConflictError(
        `Agent with agent_id '${agent.agent_id}' already exists in group '${agent.group_id}'. Use updateAgentNode to modify.`
      );
    }

    // Create new agent node
    const query = `
      CREATE (a:Agent {
        id: randomUUID(),
        agent_id: $agent_id,
        name: $name,
        role: $role,
        model: $model,
        fallback_model: $fallback_model,
        group_id: $group_id,
        created_at: datetime(),
        last_active: datetime(),
        confidence: $confidence,
        contribution_count: 0,
        learning_count: 0,
        status: $status,
        metadata: $metadata
      })
      RETURN a
    `;

    const params = {
      agent_id: agent.agent_id,
      name: agent.name,
      role: agent.role,
      model: agent.model,
      fallback_model: agent.fallback_model ?? "ollama-cloud/glm-5.1",
      group_id: agent.group_id,
      confidence: agent.confidence ?? 0.0,
      status: agent.status ?? "active",
      // Neo4j 5.x constraint: nested Cypher maps cannot be stored as node
      // property values. JSON.stringify is the deliberate adaptation.
      // See insert-insight.ts for the 2026-06-12 investigation.
      metadata: JSON.stringify(agent.metadata || {}),
    };

    const queryResult = await tx.run(query, params);
    return queryResult;
  });

  // Extract the node from the result
  const record = result.records[0];
  const node = record.get("a");
  return neo4jToAgentNode(node.properties);
}

/**
 * Get an agent by agent_id and group_id
 * 
 * @param agent_id - Agent identifier
 * @param group_id - Tenant isolation identifier
 * @returns The agent node or null if not found
 */
export async function getAgentNode(
  agent_id: string,
  group_id: string
): Promise<AgentNode | null> {
  if (!agent_id || !group_id) {
    throw new AgentQueryError("agent_id and group_id are required");
  }

  // Enforce allura-* naming
  if (!group_id.startsWith("allura-")) {
    throw new AgentQueryError(`group_id must use allura-* format (found: ${group_id})`);
  }

  const result = await readTransaction(async (tx: ManagedTransaction) => {
    const query = `
      MATCH (a:Agent {agent_id: $agent_id, group_id: $group_id})
      RETURN a
    `;
    return await tx.run(query, { agent_id, group_id });
  });

  if (result.records.length === 0) {
    return null;
  }

  const node = result.records[0].get("a");
  return neo4jToAgentNode(node.properties);
}

/**
 * List agents matching query parameters
 * 
 * @param params - Query parameters (group_id is required)
 * @returns Array of matching agent nodes
 */
export async function listAgentNodes(params: AgentQueryParams): Promise<AgentNode[]> {
  validateQueryParams(params);

  const result = await readTransaction(async (tx: ManagedTransaction) => {
    // Build WHERE clause with required group_id and optional filters
    const conditions: string[] = ["a.group_id = $group_id"];

    if (params.agent_id) {
      conditions.push("a.agent_id = $agent_id");
    }

    if (params.status) {
      conditions.push("a.status = $status");
    }

    if (params.name) {
      conditions.push("a.name CONTAINS $name");
    }

    const whereClause = conditions.join(" AND ");

    // Build pagination
    const limitClause = params.limit ? `LIMIT ${params.limit}` : "";
    const offsetClause = params.offset ? `SKIP ${params.offset}` : "";

    const query = `
      MATCH (a:Agent)
      WHERE ${whereClause}
      RETURN a
      ORDER BY a.created_at DESC
      ${offsetClause}
      ${limitClause}
    `;

    const queryParams: Record<string, unknown> = {
      group_id: params.group_id,
      agent_id: params.agent_id,
      status: params.status,
      name: params.name,
    };

    return await tx.run(query, queryParams);
  });

  return result.records.map((record) => {
    const node = record.get("a");
    return neo4jToAgentNode(node.properties);
  });
}

/**
 * Update agent confidence and activity
 * 
 * @param agent_id - Agent identifier
 * @param group_id - Tenant isolation identifier
 * @param updates - Fields to update
 * @returns The updated agent node
 */
export async function updateAgentNode(
  agent_id: string,
  group_id: string,
  updates: {
    confidence?: number;
    contribution_count?: number;
    learning_count?: number;
    status?: AgentStatus;
    last_active?: Date;
    metadata?: Record<string, unknown>;
  }
): Promise<AgentNode> {
  if (!agent_id || !group_id) {
    throw new AgentQueryError("agent_id and group_id are required");
  }

  // Enforce allura-* naming
  if (!group_id.startsWith("allura-")) {
    throw new AgentQueryError(`group_id must use allura-* format (found: ${group_id})`);
  }

  const result = await writeTransaction(async (tx: ManagedTransaction) => {
    // Build SET clause dynamically
    const setStatements: string[] = [];
    const params: Record<string, unknown> = { agent_id, group_id };

    if (updates.confidence !== undefined) {
      setStatements.push("a.confidence = $confidence");
      params.confidence = updates.confidence;
    }

    if (updates.contribution_count !== undefined) {
      setStatements.push("a.contribution_count = $contribution_count");
      params.contribution_count = updates.contribution_count;
    }

    if (updates.learning_count !== undefined) {
      setStatements.push("a.learning_count = $learning_count");
      params.learning_count = updates.learning_count;
    }

    if (updates.status !== undefined) {
      setStatements.push("a.status = $status");
      params.status = updates.status;
    }

    if (updates.metadata !== undefined) {
      setStatements.push("a.metadata = $metadata");
      // JSON.stringify for the same Neo4j 5.x reason as createAgentNode.
      params.metadata = JSON.stringify(updates.metadata);
    }

    // Always update last_active
    setStatements.push("a.last_active = datetime()");

    if (setStatements.length === 1) {
      // Only last_active update, nothing else
      throw new AgentValidationError("No fields to update");
    }

    const query = `
      MATCH (a:Agent {agent_id: $agent_id, group_id: $group_id})
      SET ${setStatements.join(", ")}
      RETURN a
    `;

    const queryResult = await tx.run(query, params);

    if (queryResult.records.length === 0) {
      throw new AgentValidationError(
        `Agent with agent_id '${agent_id}' not found in group '${group_id}'`
      );
    }

    return queryResult;
  });

  const node = result.records[0].get("a");
  return neo4jToAgentNode(node.properties);
}

/**
 * Create agent group node and link agents
 * 
 * @param group_id - Tenant isolation identifier
 * @param group_name - Human-readable group name
 * @returns The created group node
 */
export async function createAgentGroup(
  group_id: string,
  group_name: string
): Promise<{ id: string; group_id: string; created_at: Date }> {
  if (!group_id || !group_id.startsWith("allura-")) {
    throw new AgentValidationError(`group_id must use allura-* format (found: ${group_id})`);
  }

  if (!group_name || group_name.trim().length === 0) {
    throw new AgentValidationError("group_name is required and cannot be empty");
  }

  const result = await writeTransaction(async (tx: ManagedTransaction) => {
    // Check if group already exists
    const checkQuery = `
      MATCH (g:AgentGroup {group_id: $group_id})
      RETURN g
    `;
    const checkResult = await tx.run(checkQuery, { group_id });

    if (checkResult.records.length > 0) {
      throw new AgentConflictError(`AgentGroup with group_id '${group_id}' already exists`);
    }

    // Create group
    const query = `
      CREATE (g:AgentGroup {
        id: randomUUID(),
        group_id: $group_id,
        name: $name,
        created_at: datetime()
      })
      RETURN g
    `;

    return await tx.run(query, { group_id, name: group_name });
  });

  const node = result.records[0].get("g").properties;
  return {
    id: (node.id as string),
    group_id: (node.group_id as string),
    created_at: new Date(node.created_at.toString()),
  };
}

/**
 * Link agent to group (INCLUDES relationship)
 * 
 * @param agent_id - Agent identifier
 * @param group_id - Tenant isolation identifier
 */
export async function linkAgentToGroup(
  agent_id: string,
  group_id: string
): Promise<void> {
  if (!agent_id || !group_id) {
    throw new AgentQueryError("agent_id and group_id are required");
  }

  // Enforce allura-* naming
  if (!group_id.startsWith("allura-")) {
    throw new AgentQueryError(`group_id must use allura-* format (found: ${group_id})`);
  }

  await writeTransaction(async (tx: ManagedTransaction) => {
    const query = `
      MATCH (a:Agent {agent_id: $agent_id, group_id: $group_id})
      MATCH (g:AgentGroup {group_id: $group_id})
      MERGE (g)-[:INCLUDES]->(a)
    `;

    const result = await tx.run(query, { agent_id, group_id });

    // Note: MERGE is idempotent, so this won't fail if relationship exists
    return result;
  });
}

/**
 * Team RAM Agent Nodes — The Surgical Team
 *
 * Maps the 10 Team RAM agents from `.opencode/agent/*.md` frontmatter
 * to persistent Neo4j nodes. Each agent tracks its model assignment,
 * role, and runtime state.
 */
export async function initializeDefaultAgents(
  group_id: string = "allura-system"
): Promise<AgentNode[]> {
  const teamRamAgents: AgentInsert[] = [
    {
      agent_id: "brooks",
      name: "Brooks",
      role: "Chief Architect — conceptual integrity, contracts, ADRs, final sign-off",
      model: "openai/gpt-5.4",
      fallback_model: "ollama-cloud/glm-5.1",
      group_id,
    },
    {
      agent_id: "jobs",
      name: "Jobs",
      role: "Intent Gate — converts requests into crisp objectives, constraints, and acceptance criteria",
      model: "ollama-cloud/kimi-k2.5",
      fallback_model: "ollama-cloud/glm-5.1",
      group_id,
    },
    {
      agent_id: "woz",
      name: "Woz",
      role: "Primary Builder — implements the Brooks plan with minimal ceremony, ships working code",
      model: "ollama-cloud/qwen3-coder-next",
      fallback_model: "ollama-cloud/glm-5.1",
      group_id,
    },
    {
      agent_id: "scout",
      name: "Scout",
      role: "Recon — fast repo scanning, file path finding, context discovery",
      model: "openai/gpt-5.3-codex-spark",
      fallback_model: "ollama-cloud/nemotron-3-super",
      group_id,
    },
    {
      agent_id: "knuth",
      name: "Knuth",
      role: "Data Architect — PostgreSQL, Neo4j, schema specialist, query optimization",
      model: "ollama-cloud/glm-5.1",
      fallback_model: "ollama-cloud/qwen3-coder-next",
      group_id,
    },
    {
      agent_id: "bellard",
      name: "Bellard",
      role: "Diagnostics & Performance — measurement-first, deep diagnostics under constraints",
      model: "ollama-cloud/glm-5.1",
      fallback_model: "ollama-cloud/qwen3-coder-next",
      group_id,
    },
    {
      agent_id: "carmack",
      name: "Carmack",
      role: "Performance & Optimization — API design, latency reduction, hot path optimization",
      model: "ollama-cloud/qwen3-coder-next",
      fallback_model: "ollama-cloud/glm-5.1",
      group_id,
    },
    {
      agent_id: "pike",
      name: "Pike",
      role: "Interface Review — surface area, concurrency hazards, API ergonomics, simplicity gate",
      model: "openai/gpt-5.4-mini",
      fallback_model: "openai/gpt-5.4",
      group_id,
    },
    {
      agent_id: "fowler",
      name: "Fowler",
      role: "Refactor Gate — maintainability, incremental reversible changes, design drift documentation",
      model: "ollama-cloud/glm-5.1",
      fallback_model: "ollama-cloud/qwen3-coder-next",
      group_id,
    },
    {
      agent_id: "hightower",
      name: "Hightower",
      role: "DevOps — CI/CD, IaC, container orchestration, observability",
      model: "openai/gpt-5.4",
      fallback_model: "openai/gpt-5.4-mini",
      group_id,
    },
  ];

  const createdAgents: AgentNode[] = [];

  for (const agent of teamRamAgents) {
    try {
      const created = await createAgentNode(agent);
      createdAgents.push(created);
    } catch (error) {
      // Skip if agent already exists
      if (error instanceof AgentConflictError) {
        const existing = await getAgentNode(agent.agent_id, agent.group_id);
        if (existing) {
          createdAgents.push(existing);
        }
      } else {
        throw error;
      }
    }
  }

  return createdAgents;
}

/**
 * Verify agent nodes exist for a group
 * 
 * @param group_id - Tenant isolation identifier
 * @returns Verification results
 */
export async function verifyAgentNodes(group_id: string): Promise<{
  total: number;
  agents: Array<{ agent_id: string; name: string; role: string; status: AgentStatus }>;
}> {
  if (!group_id || !group_id.startsWith("allura-")) {
    throw new AgentQueryError(`group_id must use allura-* format (found: ${group_id})`);
  }

  const agents = await listAgentNodes({ group_id });

  return {
    total: agents.length,
    agents: agents.map((a) => ({
      agent_id: a.agent_id,
      name: a.name,
      role: a.role,
      status: a.status,
    })),
  };
}
