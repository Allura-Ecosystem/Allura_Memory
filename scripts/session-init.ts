#!/usr/bin/env bun
/**
 * Session Initialization Protocol
 *
 * Deprecated: use the harness startup flow and MCP_DOCKER tools.
 * Direct docker exec access to databases has been intentionally removed.
 */

console.log("🧠 SESSION INITIALIZATION - MCP_DOCKER ONLY\n");
console.log("This legacy script no longer probes databases directly.");
console.log("Use the harness startup flow and MCP_DOCKER tools instead:\n");
console.log("  • MCP_DOCKER_mcp-find      Discover approved servers");
console.log("  • MCP_DOCKER_mcp-add       Activate a server");
console.log("  • MCP_DOCKER_execute_sql   Read PostgreSQL safely");
console.log("  • MCP_DOCKER_insert_data   Append events");
console.log("\nTenant namespace: allura-system");
console.log("Raw docker exec DB access has been intentionally removed.");
