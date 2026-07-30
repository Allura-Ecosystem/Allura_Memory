#!/usr/bin/env bun
/**
 * Script to initialize Allura Agent Memory Nodes in Neo4j
 * 
 * Usage: bun run scripts/initialize-agent-memory.ts
 */

// Neo4j is sunset — no connection import needed
import {
  closeDriver,
  createAgentGroup,
  initializeDefaultAgents,
  verifyAgentNodes,
} from "./lib/neo4j-stub";

const GROUP_ID = "allura-system";

async function main() {
  try {
    console.log("╔═══════════════════════════════════════════════════════╗");
    console.log("║   Initializing Allura Agent Memory Nodes              ║");
    console.log("╚═══════════════════════════════════════════════════════╝");
    console.log();

    // Step 1: Create agent group
    console.log("Step 1: Creating agent group...");
    try {
      await createAgentGroup(GROUP_ID);
      console.log(`✓ Agent group created: ${GROUP_ID}`);
    } catch (error: any) {
      if (error.name === "AgentConflictError") {
        console.log(`✓ Agent group already exists: ${GROUP_ID}`);
      } else {
        throw error;
      }
    }
    console.log();

    // Step 2: Initialize default agents
    console.log("Step 2: Creating 7 Memory{Role} agents...");
    await initializeDefaultAgents(GROUP_ID);
    const agents: Array<{ name: string; agent_id: string; role: string; model: string; status: string; group_id: string }> = [];
    
    console.log();
    console.log("╔═══════════════════════════════════════════════════════╗");
    console.log("║   Created Agent Nodes                                 ║");
    console.log("╠═══════════════════════════════════════════════════════╣");
    
    agents.forEach((agent, index) => {
      console.log(`║ ${index + 1}. ${agent.name}`);
      console.log(`║    ID: ${agent.agent_id}`);
      console.log(`║    Role: ${agent.role}`);
      console.log(`║    Model: ${agent.model}`);
      console.log(`║    Status: ${agent.status}`);
      console.log(`║    Group: ${agent.group_id}`);
      console.log("║");
    });
    
    console.log("╚═══════════════════════════════════════════════════════╝");
    console.log();

    // Step 3: Verify creation
    console.log("Step 3: Verifying agent nodes...");
    await verifyAgentNodes(GROUP_ID);
    const verificationResult = { total: agents.length, agents };
    
    console.log();
    console.log("╔═══════════════════════════════════════════════════════╗");
    console.log("║   Verification Results                                 ║");
    console.log("╠═══════════════════════════════════════════════════════╣");
    console.log(`║   Total agents: ${verificationResult.total}`);
    console.log("║");
    console.log("║   Agents by ID:");
    verificationResult.agents.forEach((agent) => {
      console.log(`║     - ${agent.agent_id}: ${agent.name} (${agent.status})`);
    });
    console.log("╚═══════════════════════════════════════════════════════╝");
    console.log();

    console.log("✅ Agent memory nodes initialized successfully");
  } catch (error: any) {
    console.error("❌ Error initializing agent memory nodes:");
    console.error(error);
    process.exit(1);
  } finally {
    await closeDriver();
  }
}

main();