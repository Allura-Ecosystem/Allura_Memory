#!/usr/bin/env tsx

/**
 * Memory Logger for Superpowers Skills
 * 
 * Logs and searches events in the memory system using MCP_DOCKER tools.
 * This script is meant to be invoked via MCP tool execution, not standalone.
 * 
 * Usage via MCP:
 *   node scripts/memory-logger.js --action log-event --data '{...}'
 * 
 * Supported actions:
 *   - log-event: Log raw event to PostgreSQL
 *   - search-events: Search events by pattern
 * 
 * Environment:
 *   All database connections handled via MCP_DOCKER tools.
 */

import { execSync } from "child_process";
import { canonicalizeAgentId } from "../src/lib/agents/canonical-identity";

interface LogEventInput {
  group_id: string;
  event_type: string;
  agent_id: string;
  workflow_id?: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  metadata?: Record<string, unknown>;
}

interface SearchInput {
  query: string;
  limit?: number;
}

type Action = "log-event" | "search-events" | "help";

function parseArgs(argv: string[]): { action: Action; data?: string; help?: boolean } {
  const result: { action: Action; data?: string; help?: boolean } = { action: "help" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--action":
        result.action = argv[++i] as Action;
        break;
      case "--data":
        result.data = argv[++i];
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`Memory Logger for Superpowers Skills

Usage:
  bunx tsx scripts/memory-logger.ts --action <action> --data '<json>'

Actions:
  log-event       Log a raw event to PostgreSQL
  search-events   Search events by query
  help            Show this help message

Examples:
  # Log session start event
  bunx tsx scripts/memory-logger.ts --action log-event --data '{
    "group_id": "allura-system",
    "event_type": "skill:brainstorming:start",
    "agent_id": "openagent",
    "workflow_id": "feature-123",
    "status": "pending"
  }'

  # Search for related events
  bunx tsx scripts/memory-logger.ts --action search-events --data '{"query": "superpowers"}'

Output:
  JSON response with success flag, event_id, and any errors.
`);
}

/**
 * Execute MCP_DOCKER tool via CLI
 */
function callMcpDocker(toolName: string, args: Record<string, unknown>): unknown {
  const argsJson = JSON.stringify(args);
  
  try {
    const output = execSync(
      `npx @anthropic-ai/mcp-docker ${toolName} '${argsJson}'`,
      { encoding: "utf-8", maxBuffer: 1024 * 1024 }
    );
    
    // Parse response - handle wrapped content format
    const parsed = JSON.parse(output);
    if (parsed.content?.[0]?.text) {
      try {
        return JSON.parse(parsed.content[0].text);
      } catch {
        return parsed.content[0].text;
      }
    }
    return parsed;
  } catch (error: any) {
    // Try to parse error output
    const match = error.stdout?.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Fall through
      }
    }
    throw new Error(`MCP tool ${toolName} failed: ${error.message}`);
  }
}

async function logEvent(data: LogEventInput): Promise<{ eventId?: number; success: boolean; error?: string }> {
  try {
    const canonicalAgentId = canonicalizeAgentId(data.agent_id);

    // Use MCP_DOCKER_insert_data for events table
    const result = callMcpDocker("MCP_DOCKER_insert_data", {
      table_name: "events",
      columns: "group_id, event_type, agent_id, workflow_id, status, metadata",
      values: `'${data.group_id}', '${data.event_type}', '${canonicalAgentId}', '${data.workflow_id ?? "default"}', '${data.status}', '${JSON.stringify(data.metadata ?? {})}'`,
    });
    
    return { eventId: (result as any).id, success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function searchEvents(data: SearchInput): Promise<{ events?: unknown[]; success: boolean; error?: string }> {
  try {
    // Use MCP_DOCKER_query_database with natural language
    const result = callMcpDocker("MCP_DOCKER_query_database", {
      query: `Search events for: ${data.query}`,
    });
    
    return { events: result as unknown[], success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.action === "help") {
    printHelp();
    return;
  }

  if (!args.data) {
    console.error("Error: --data is required");
    process.exitCode = 1;
    return;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(args.data);
  } catch {
    console.error("Error: --data must be valid JSON");
    process.exitCode = 1;
    return;
  }

  let result: { success: boolean; error?: string; eventId?: number; events?: unknown[] };

  switch (args.action) {
    case "log-event":
      result = await logEvent(data as unknown as LogEventInput);
      break;
    case "search-events":
      result = await searchEvents(data as unknown as SearchInput);
      break;
    default:
      console.error(`Unknown action: ${args.action}`);
      process.exitCode = 1;
      return;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
