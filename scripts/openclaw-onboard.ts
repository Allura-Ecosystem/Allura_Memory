#!/usr/bin/env bun
/**
 * OpenClaw Onboarding - Quick Setup
 * 
 * Single command to get OpenClaw running:
 * bun run openclaw:onboard
 * 
 * This will:
 * 1. Check the PostgreSQL connection (episodic, semantic, and RuVector share one instance)
 * 2. Onboard OpenClaw agent into memory system
 * 3. Start OpenClaw HTTP gateway
 */

import { config } from "dotenv";
import { getPool } from "../src/lib/postgres/connection";

config();

const OPENCLAW_PORT = parseInt(process.env.OPENCLAW_PORT || "3200", 10);

async function checkPostgreSQL(): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT 1 as test");
    // Don't close pool - will be reused
    return result.rows.length > 0;
  } catch (error) {
    console.error("   ✗ PostgreSQL connection failed:", (error as Error).message);
    return false;
  }
}

async function onboardOpenClaw(groupId: string): Promise<void> {
  const pool = getPool();
  
  // Create OpenClaw agent entry (using correct schema)
  const agentResult = await pool.query(`
    INSERT INTO agents (agent_id, name, description, module, platform, version, status, capabilities, group_id)
    VALUES ('openclaw-gateway', 'OpenClaw Gateway', 'HTTP gateway for external channels', 'l5-gateway', 'allura', '1.0.0', 'Active', $1, $2)
    ON CONFLICT (agent_id) DO UPDATE SET 
      description = 'HTTP gateway for external channels',
      status = 'Active',
      version = '1.0.0',
      capabilities = $1
    RETURNING id
  `, [
    JSON.stringify({
      type: "gateway",
      role: "L5-human-interface",
      exposed_tools: ["memory_search", "memory_store", "adas_run_search", "adas_get_proposals", "adas_approve_design"],
      port: OPENCLAW_PORT,
    }),
    groupId,
  ]);

  console.log(`   ✓ OpenClaw agent registered: ${agentResult.rows[0].id}`);

  // Log onboarding event
  await pool.query(`
    INSERT INTO events (event_type, group_id, agent_id, status, metadata)
    VALUES ('AGENT_ONBOARDED', $1, 'openclaw-gateway', 'completed', $2)
  `, [
    groupId,
    JSON.stringify({
      agent: "openclaw-gateway",
      port: OPENCLAW_PORT,
      tools: ["memory_search", "memory_store", "adas_run_search", "adas_get_proposals", "adas_approve_design"],
      timestamp: new Date().toISOString(),
    }),
  ]);

  console.log(`   ✓ Onboarding event logged`);
}

async function main(): Promise<void> {
  const groupId = process.env.DEFAULT_GROUP_ID || "allura-production";
  const args = process.argv.slice(2);
  
  // Parse --group argument
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--group" || args[i] === "--group-id") {
      const provided = args[i + 1];
      if (provided && provided.startsWith("allura-")) {
        const nextArg = args[i + 1];
        if (nextArg) {
          // Valid group_id
        }
      }
    }
  }

  console.log("\n🦾 OpenClaw Onboarding\n");
  console.log(`   Group: ${groupId}`);
  console.log(`   Port: ${OPENCLAW_PORT}\n`);

  // Step 1: Check PostgreSQL
  console.log("📦 Checking PostgreSQL...");
  const pgOk = await checkPostgreSQL();
  if (!pgOk) {
    console.error("\n❌ PostgreSQL connection failed");
    console.error("   Ensure PostgreSQL is running and env vars are set:");
    console.error("   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD\n");
    process.exit(1);
  }
  console.log("   ✓ PostgreSQL connected\n");

  // Step 3: Onboard OpenClaw
  console.log("🤖 Onboarding OpenClaw agent...");
  try {
    await onboardOpenClaw(groupId);
    console.log("   ✓ Agent onboarded successfully\n");
  } catch (error) {
    console.error("   ✗ Onboarding failed:", (error as Error).message);
    process.exit(1);
  }

  // Done
  console.log("✅ Onboarding complete!\n");
  console.log("🚀 Start canonical MCP HTTP gateway:");
  console.log(`   ALLURA_MCP_HTTP_PORT=${OPENCLAW_PORT} bun run mcp:http\n`);
  console.log("📡 Test the gateway:");
  console.log(`   curl http://localhost:${OPENCLAW_PORT}/health | jq .\n`);
  console.log("🔧 Available tools:");
  console.log("   • memory_search");
  console.log("   • memory_store");
  console.log("   • adas_run_search");
  console.log("   • adas_get_proposals");
  console.log("   • adas_approve_design\n");
}

main().catch((error) => {
  console.error("\n❌ Onboarding failed:", error.message);
  process.exit(1);
});
