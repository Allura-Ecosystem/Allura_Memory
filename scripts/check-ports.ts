#!/usr/bin/env bun
/**
 * Check Ports Script
 * 
 * Verifies that required ports are available before starting services.
 */

import { getPortConfig, isPortAvailable, PORT_RANGES } from "../src/lib/config/ports";

const REQUIRED_PORTS = [
  { name: "Allura Dashboard (Next.js)", key: "dashboard" as const },
  { name: "Canonical MCP HTTP Gateway", key: "mcp_http" as const },
  { name: "PostgreSQL", key: "postgres" as const },
];

async function checkPorts() {
  console.log("🔍 Checking port availability...\n");
  
  const config = getPortConfig();
  let allAvailable = true;
  
  for (const { name, key } of REQUIRED_PORTS) {
    const port = config[key];
    const range = PORT_RANGES[key];
    const available = await isPortAvailable(port);
    
    const status = available ? "✅" : "❌";
    const portSource =
      key === "mcp_http"
        ? process.env.ALLURA_MCP_HTTP_PORT
          ? "(from ALLURA_MCP_HTTP_PORT)"
          : "(default)"
        : process.env[`${key.toUpperCase()}_PORT`]
          ? "(from env)"
          : "(default)";
    
    console.log(`${status} ${name}: port ${port} ${portSource}`);
    
    if (!available) {
      allAvailable = false;
      console.log(`   Port ${port} is in use. Set ${key.toUpperCase()}_PORT to a different value.`);
      console.log(`   Valid range: ${range.min}-${range.max}`);
    }
  }
  
  console.log("");
  
  if (allAvailable) {
    console.log("✅ All ports are available!");
    console.log("\nTo start services:");
    console.log("  bun run dev          # Start Allura Dashboard on port", config.dashboard);
     console.log("  bun run mcp:http     # Start canonical MCP HTTP gateway on port", config.mcp_http);
    process.exit(0);
  } else {
    console.log("❌ Some ports are in use.");
    console.log("\nOptions:");
    console.log("  1. Stop conflicting services");
    console.log("  2. Set environment variables to use different ports:");
     console.log("     ALLURA_DASHBOARD_PORT=3101 ALLURA_MCP_HTTP_PORT=3202 bun run dev");
    console.log("  3. Generate random ports:");
    console.log("     bun run ports:generate >> .env.local");
    process.exit(1);
  }
}

checkPorts().catch((error) => {
  console.error("❌ Error checking ports:", error);
  process.exit(1);
});
