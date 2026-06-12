/**
 * Tests for Agent Memory Nodes
 * Requires a running Neo4j instance.
 * Run with: RUN_E2E_TESTS=true bun vitest run src/lib/neo4j/agent-nodes.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AgentConflictError,
  AgentQueryError,
  AgentValidationError,
  createAgentGroup,
  createAgentNode,
  getAgentNode,
  initializeDefaultAgents,
  linkAgentToGroup,
  listAgentNodes,
  updateAgentNode,
  verifyAgentNodes,
} from "./agent-nodes";
import type { AgentInsert } from "./agent-nodes";
import { closeDriver, getDriver } from "./connection";

// Test configuration
const TEST_GROUP_ID = "allura-test-agents";

// All group_ids used across test fixtures — cleaned before and after
const ALL_TEST_GROUP_IDS = [
  "allura-test-agents",
  "allura-test-group-creation",
  "allura-duplicate-group",
  "allura-link-test-group",
  "allura-default-init-test",
  "allura-existing-agent-test",
  "allura-verify-test",
  "allura-team-ram-test",
];

// E2E guard: requires running Neo4j
const shouldRunE2E = process.env.RUN_E2E_TESTS === "true";

async function cleanupTestNodes(): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(
      "MATCH (n) WHERE n.group_id IN $groupIds DETACH DELETE n",
      { groupIds: ALL_TEST_GROUP_IDS }
    );
  } finally {
    await session.close();
  }
}

// Setup and teardown
beforeAll(async () => {
  // Ensure environment variables are set
  process.env.NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687";
  process.env.NEO4J_USER = process.env.NEO4J_USER || "neo4j";
  process.env.NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "test-password";

  // Verify connectivity
  const driver = getDriver();
  await driver.verifyConnectivity();

  // Clean up any leftover nodes from prior runs
  if (shouldRunE2E) {
    await cleanupTestNodes();
  }
});

afterAll(async () => {
  // Clean up test nodes before closing the driver
  if (shouldRunE2E) {
    await cleanupTestNodes();
  }
  await closeDriver();
});

describe.skipIf(!shouldRunE2E)("Agent Nodes Validation", () => {
  it("should throw if agent_id is missing", async () => {
    const agent = {
      agent_id: "",
      name: "TestAgent",
      role: "Test role",
      model: "test-model",
      group_id: TEST_GROUP_ID,
    } as AgentInsert;

    await expect(createAgentNode(agent)).rejects.toThrow(AgentValidationError);
    await expect(createAgentNode(agent)).rejects.toThrow("agent_id is required");
  });

  it("should throw if group_id is missing", async () => {
    const agent = {
      agent_id: "test-agent",
      name: "TestAgent",
      role: "Test role",
      model: "test-model",
      group_id: "",
    } as AgentInsert;

    await expect(createAgentNode(agent)).rejects.toThrow(AgentValidationError);
    await expect(createAgentNode(agent)).rejects.toThrow("group_id is required");
  });

  it("should reject non-allura group_id format", async () => {
    const agent: AgentInsert = {
      agent_id: "test-agent",
      name: "TestAgent",
      role: "Test role",
      model: "test-model",
      group_id: "invalid-group",
    };

    await expect(createAgentNode(agent)).rejects.toThrow(AgentValidationError);
    await expect(createAgentNode(agent)).rejects.toThrow(
      "group_id must use allura-* format"
    );
  });

  it("should reject confidence outside 0-1 range", async () => {
    const agent: AgentInsert = {
      agent_id: "test-agent",
      name: "TestAgent",
      role: "Test role",
      model: "test-model",
      group_id: TEST_GROUP_ID,
      confidence: 1.5,
    };

    await expect(createAgentNode(agent)).rejects.toThrow(AgentValidationError);
    await expect(createAgentNode(agent)).rejects.toThrow(
      "confidence must be between 0 and 1"
    );
  });
});

describe.skipIf(!shouldRunE2E)("Agent Nodes CRUD", () => {
  it("should create an agent node with defaults", async () => {
    const agent: AgentInsert = {
      agent_id: "create-test",
      name: "CreateTestAgent",
      role: "Test role",
      model: "test-model",
      group_id: TEST_GROUP_ID,
    };

    const created = await createAgentNode(agent);

    expect(created.agent_id).toBe("create-test");
    expect(created.name).toBe("CreateTestAgent");
    expect(created.role).toBe("Test role");
    expect(created.model).toBe("test-model");
    expect(created.group_id).toBe(TEST_GROUP_ID);
    expect(created.confidence).toBe(0.0);
    expect(created.status).toBe("active");
    expect(created.contribution_count).toBe(0);
    expect(created.learning_count).toBe(0);
    expect(created.id).toBeDefined();
    expect(created.created_at).toBeInstanceOf(Date);
    expect(created.last_active).toBeInstanceOf(Date);
  });

  it("should create an agent node with custom values", async () => {
    const agent: AgentInsert = {
      agent_id: "custom-test",
      name: "CustomTestAgent",
      role: "Custom role",
      model: "custom-model",
      group_id: TEST_GROUP_ID,
      confidence: 0.85,
      status: "inactive",
      metadata: { department: "engineering" },
    };

    const created = await createAgentNode(agent);

    expect(created.confidence).toBe(0.85);
    expect(created.status).toBe("inactive");
    expect(created.metadata).toEqual({ department: "engineering" });
  });

  it("should store agent metadata on disk as a JSON string (Neo4j 5.x constraint)", async () => {
    // Lock-in test for the 2026-06-12 carry-forward. Neo4j 5.26 community
    // rejects nested Cypher maps as node property values; the deliberate
    // adaptation is JSON.stringify on write + JSON.parse on read. See
    // insert-insight.test.ts for the full investigation.
    const agent: AgentInsert = {
      agent_id: "metadata-disk-agent-1",
      name: "DiskShapeAgent",
      role: "disk shape",
      model: "shape-model",
      group_id: TEST_GROUP_ID,
      metadata: {
        department: "engineering",
        team: "platform",
        nested: { seniority: 3 },
      },
    };

    const created = await createAgentNode(agent);

    // Round-trip via the returned value.
    expect(created.metadata).toEqual(agent.metadata);

    // On-disk shape: STRING (not MAP, which 5.x rejects). The driver
    // hands a JS string for a STRING value and a JS object for a MAP
    // value — we check at the JS layer (Neo4j 5.x removed `typeof()`).
    const driver = getDriver();
    const session = driver.session();
    try {
      const r = await session.run(
        "MATCH (a:Agent {agent_id: $id}) RETURN a.metadata AS m",
        { id: created.agent_id }
      );
      expect(r.records.length).toBe(1);
      const m = r.records[0].get("m");
      expect(typeof m).toBe("string");
      expect(JSON.parse(m as string)).toEqual(agent.metadata);
    } finally {
      await session.close();
    }
  });

  it("should throw conflict error for duplicate agent_id", async () => {
    const agent: AgentInsert = {
      agent_id: "duplicate-test",
      name: "DuplicateTestAgent",
      role: "Test role",
      model: "test-model",
      group_id: TEST_GROUP_ID,
    };

    // First creation should succeed
    await createAgentNode(agent);

    // Second creation should fail
    await expect(createAgentNode(agent)).rejects.toThrow(AgentConflictError);
    await expect(createAgentNode(agent)).rejects.toThrow("already exists");
  });

  it("should get an agent by agent_id and group_id", async () => {
    const agent: AgentInsert = {
      agent_id: "get-test",
      name: "GetTestAgent",
      role: "Test role",
      model: "test-model",
      group_id: TEST_GROUP_ID,
    };

    await createAgentNode(agent);

    const retrieved = await getAgentNode("get-test", TEST_GROUP_ID);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.agent_id).toBe("get-test");
    expect(retrieved?.name).toBe("GetTestAgent");
    expect(retrieved?.group_id).toBe(TEST_GROUP_ID);
  });

  it("should return null for non-existent agent", async () => {
    const result = await getAgentNode("non-existent", TEST_GROUP_ID);
    expect(result).toBeNull();
  });

  it("should throw if getAgentNode called without required params", async () => {
    await expect(getAgentNode("", TEST_GROUP_ID)).rejects.toThrow(AgentQueryError);
    await expect(getAgentNode("test", "")).rejects.toThrow(AgentQueryError);
  });

  it("should list agents with filters", async () => {
    // Create multiple agents
    const agents: AgentInsert[] = [
      {
        agent_id: "list-test-1",
        name: "ListTest1",
        role: "Role A",
        model: "model-a",
        group_id: TEST_GROUP_ID,
      },
      {
        agent_id: "list-test-2",
        name: "ListTest2",
        role: "Role B",
        model: "model-b",
        group_id: TEST_GROUP_ID,
        status: "inactive",
      },
    ];

    for (const agent of agents) {
      try {
        await createAgentNode(agent);
      } catch (error) {
        // Skip if already exists
        if (!(error instanceof AgentConflictError)) {
          throw error;
        }
      }
    }

    // List all agents in group
    const allAgents = await listAgentNodes({ group_id: TEST_GROUP_ID });
    expect(allAgents.length).toBeGreaterThanOrEqual(2);

    // Filter by status
    const activeAgents = await listAgentNodes({
      group_id: TEST_GROUP_ID,
      status: "active",
    });
    expect(activeAgents.every((a) => a.status === "active")).toBe(true);

    // Filter by agent_id
    const specificAgent = await listAgentNodes({
      group_id: TEST_GROUP_ID,
      agent_id: "list-test-1",
    });
    expect(specificAgent.length).toBe(1);
    expect(specificAgent[0].agent_id).toBe("list-test-1");
  });

  it("should update agent properties", async () => {
    const agent: AgentInsert = {
      agent_id: "update-test",
      name: "UpdateTestAgent",
      role: "Test role",
      model: "test-model",
      group_id: TEST_GROUP_ID,
    };

    await createAgentNode(agent);

    const updated = await updateAgentNode("update-test", TEST_GROUP_ID, {
      confidence: 0.95,
      contribution_count: 5,
      learning_count: 3,
      status: "paused",
      metadata: { updated: true },
    });

    expect(updated.confidence).toBe(0.95);
    expect(updated.contribution_count).toBe(5);
    expect(updated.learning_count).toBe(3);
    expect(updated.status).toBe("paused");
    expect(updated.metadata).toEqual({ updated: true });
  });

  it("should throw if update called without fields", async () => {
    await expect(
      updateAgentNode("test", TEST_GROUP_ID, {})
    ).rejects.toThrow(AgentValidationError);
    await expect(
      updateAgentNode("test", TEST_GROUP_ID, {})
    ).rejects.toThrow("No fields to update");
  });

  it("should throw validation error for non-existent agent update", async () => {
    await expect(
      updateAgentNode("non-existent", TEST_GROUP_ID, { confidence: 0.5 })
    ).rejects.toThrow(AgentValidationError);
    await expect(
      updateAgentNode("non-existent", TEST_GROUP_ID, { confidence: 0.5 })
    ).rejects.toThrow("not found");
  });
});

describe.skipIf(!shouldRunE2E)("Agent Groups", () => {
  it("should create an agent group", async () => {
    const groupId = "allura-test-group-creation";

    const created = await createAgentGroup(groupId, "Test Agent Group");

    expect(created.group_id).toBe(groupId);
    expect(created.id).toBeDefined();
    expect(created.created_at).toBeInstanceOf(Date);
  });

  it("should reject group creation with invalid group_id", async () => {
    await expect(
      createAgentGroup("invalid-group", "Test Group")
    ).rejects.toThrow(AgentValidationError);
    await expect(
      createAgentGroup("invalid-group", "Test Group")
    ).rejects.toThrow("must use allura-* format");
  });

  it("should throw conflict for duplicate group", async () => {
    const groupId = "allura-duplicate-group";

    await createAgentGroup(groupId, "First Group");

    await expect(
      createAgentGroup(groupId, "Second Group")
    ).rejects.toThrow(AgentConflictError);
  });

  it("should link agent to group", async () => {
    const groupId = "allura-link-test-group";

    // Create group
    await createAgentGroup(groupId, "Link Test Group");

    // Create agent
    const agent: AgentInsert = {
      agent_id: "link-test-agent",
      name: "LinkTestAgent",
      role: "Test",
      model: "test",
      group_id: groupId,
    };
    await createAgentNode(agent);

    // Link should be idempotent
    await linkAgentToGroup("link-test-agent", groupId);

    // Second link should succeed (MERGE)
    await linkAgentToGroup("link-test-agent", groupId);
  });
});

describe.skipIf(!shouldRunE2E)("Initialize Default Agents", () => {
  it("should initialize all 7 default agents", async () => {
    const groupId = "allura-default-init-test";

    const agents = await initializeDefaultAgents(groupId);

    expect(agents.length).toBe(7);

    const expectedAgents = [
      "memory-orchestrator",
      "memory-architect",
      "memory-builder",
      "memory-guardian",
      "memory-scout",
      "memory-analyst",
      "memory-chronicler",
    ];

    for (const expectedId of expectedAgents) {
      const found = agents.find((a) => a.agent_id === expectedId);
      expect(found).toBeDefined();
      expect(found?.group_id).toBe(groupId);
    }
  });

  it("should handle existing agents gracefully", async () => {
    const groupId = "allura-existing-agent-test";

    // Create one agent first
    await createAgentNode({
      agent_id: "memory-orchestrator",
      name: "MemoryOrchestrator",
      role: "BMad workflow coordination",
      model: "ollama-cloud/glm-5.1",
      group_id: groupId,
    });

    // Initialize default agents should not fail
    const agents = await initializeDefaultAgents(groupId);

    expect(agents.length).toBe(7);
    expect(agents.find((a) => a.agent_id === "memory-orchestrator")).toBeDefined();
  });
});

describe.skipIf(!shouldRunE2E)("Verify Agent Nodes", () => {
  it("should verify agents exist for a group", async () => {
    const groupId = "allura-verify-test";

    await initializeDefaultAgents(groupId);

    const verification = await verifyAgentNodes(groupId);

    expect(verification.total).toBe(7);
    expect(verification.agents.length).toBe(7);

    const agentIds = verification.agents.map((a) => a.agent_id);
    expect(agentIds).toContain("memory-orchestrator");
    expect(agentIds).toContain("memory-architect");
    expect(agentIds).toContain("memory-builder");
  });

  it("should reject verification with invalid group_id", async () => {
    await expect(verifyAgentNodes("invalid-group")).rejects.toThrow(AgentQueryError);
    await expect(verifyAgentNodes("invalid-group")).rejects.toThrow(
      "must use allura-* format"
    );
  });
});

describe.skipIf(!shouldRunE2E)("Team RAM Agent Nodes", () => {
  const TEAM_RAM_GROUP = "allura-team-ram-test";

  afterAll(async () => {
    const driver = getDriver();
    const session = driver.session();
    try {
      await session.run(
        "MATCH (n) WHERE n.group_id = $groupId DETACH DELETE n",
        { groupId: TEAM_RAM_GROUP }
      );
    } finally {
      await session.close();
    }
  });

  it("should create Team RAM agent nodes with fallback_model", async () => {
    const teamRamAgents: AgentInsert[] = [
      {
        agent_id: "brooks",
        name: "Frederick Brooks",
        role: "Chief Architect",
        model: "openai/gpt-5.4",
        fallback_model: "ollama-cloud/kimi-k2.5",
        group_id: TEAM_RAM_GROUP,
      },
      {
        agent_id: "carmack",
        name: "John Carmack",
        role: "Performance Specialist",
        model: "ollama-cloud/qwen3-coder-next",
        fallback_model: "ollama-cloud/glm-5.1",
        group_id: TEAM_RAM_GROUP,
      },
      {
        agent_id: "hightower",
        name: "Kelsey Hightower",
        role: "DevOps Specialist",
        model: "openai/gpt-5.4",
        fallback_model: "ollama-cloud/kimi-k2.5",
        group_id: TEAM_RAM_GROUP,
      },
    ];

    for (const agent of teamRamAgents) {
      const created = await createAgentNode(agent);
      expect(created.agent_id).toBe(agent.agent_id);
      expect(created.model).toBe(agent.model);
      expect(created.fallback_model).toBe(agent.fallback_model);
      expect(created.group_id).toBe(TEAM_RAM_GROUP);
    }
  });

  it("should default fallback_model to glm-5.1 when not provided", async () => {
    const agent: AgentInsert = {
      agent_id: "no-fallback-test",
      name: "NoFallbackAgent",
      role: "Test",
      model: "test-model",
      group_id: TEAM_RAM_GROUP,
    };

    const created = await createAgentNode(agent);
    expect(created.fallback_model).toBe("ollama-cloud/glm-5.1");
  });

  it("should persist and retrieve fallback_model from graph", async () => {
    const retrieved = await getAgentNode("carmack", TEAM_RAM_GROUP);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.fallback_model).toBe("ollama-cloud/glm-5.1");
    expect(retrieved?.model).toBe("ollama-cloud/qwen3-coder-next");
  });

  it("should not contain any legacy OmO agent names in Team RAM group", async () => {
    const legacyNames = ["turing", "berners-lee", "hopper", "cerf", "torvalds", "liskov", "dijkstra", "hinton"];
    const agents = await listAgentNodes({ group_id: TEAM_RAM_GROUP });
    const agentIds = agents.map((a) => a.agent_id);
    for (const legacy of legacyNames) {
      expect(agentIds).not.toContain(legacy);
    }
  });
});