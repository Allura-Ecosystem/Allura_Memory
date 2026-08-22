#!/usr/bin/env bun
/**
 * MCP Runtime Test Runner
 * 
 * Runs live MCP-adjacent runtime-health tests against the built app.
 *
 * Important contract boundary:
 * - This runner validates a live Next.js runtime-health surface.
 * - It does NOT validate browser automation or the canonical MCP Streamable HTTP `/mcp` protocol gate.
 *   Use `RUN_MCP_TESTS=true ALLURA_MCP_HTTP_URL=... bun vitest run
 *   src/__tests__/mcp-streamable-http.test.ts` for the protocol gate.
 */

import { spawn } from "child_process";
import { getPort } from "../src/lib/config/ports";

const DASHBOARD_PORT = getPort("dashboard", "ALLURA_DASHBOARD_PORT");
const TEST_TIMEOUT = 300000; // 5 minutes

interface TestOptions {
  verbose?: boolean;
  testNamePattern?: string;
  testPathPattern?: string;
}

async function checkDevServer(): Promise<boolean> {
  console.log("🔍 Checking Next.js dev server...");
  console.log(`   Using port: ${DASHBOARD_PORT}`);
  
  try {
    const response = await fetch(`http://localhost:${DASHBOARD_PORT}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    console.warn(`⚠️  Dev server not responding at http://localhost:${DASHBOARD_PORT}`);
    console.log("   Make sure to run: bun run dev");
    console.log(`   Or set ALLURA_DASHBOARD_PORT environment variable`);
    return false;
  }
}

async function runTests(options: TestOptions): Promise<number> {
  const args = ["vitest", "run", "--config", "vitest.config.mcp.ts"];

  if (options.verbose) {
    args.push("--reporter=verbose");
  }

  if (options.testNamePattern) {
    args.push("-t", options.testNamePattern);
  }

  if (options.testPathPattern) {
    args.push(options.testPathPattern);
  }

  const env = { ...process.env };

  console.log("\n🧪 Running MCP runtime tests against the live app...\n");
  
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env
  });

  return new Promise((resolve) => {
    child.on("close", (code) => {
      resolve(code || 0);
    });
  });
}

function parseArgs(): TestOptions {
  const options: TestOptions = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--testNamePattern":
      case "-t":
        options.testNamePattern = args[++i];
        break;
      case "--testPathPattern":
      case "-p":
        options.testPathPattern = args[++i];
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
MCP Runtime Test Runner

Usage: bun run test:mcp:browser [options]

Options:
  -v, --verbose             Verbose output
  -t, --testNamePattern     Run tests matching pattern
  -p, --testPathPattern     Run tests in specific path
  -h, --help                Show this help

Examples:
  bun run test:mcp:browser              # Run MCP runtime health tests
  bun run test:mcp:browser -v           # Verbose output
  bun run test:mcp:browser -t "health"  # Run health tests
`);
}

async function main(): Promise<void> {
  console.log("🚀 MCP Runtime Test Runner\n");

  const options = parseArgs();
  const devServerRunning = await checkDevServer();

  if (!devServerRunning) {
    console.error("\n❌ Next.js app is not responding!");
    console.log("   This is a runtime-health validation precondition, not a /mcp protocol failure.");
    console.log(`   Start it with: ALLURA_DASHBOARD_PORT=${DASHBOARD_PORT} bun run start`);
    console.log(`   Expected health endpoint: http://localhost:${DASHBOARD_PORT}/api/health\n`);
    process.exit(1);
  }

  // Run tests
  const exitCode = await runTests(options);

  if (exitCode === 0) {
    console.log("\n✅ All MCP runtime tests passed!");
  } else {
    console.log("\n❌ MCP runtime tests failed");
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error("❌ Test runner failed:", error);
  process.exit(1);
});
