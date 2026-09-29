#!/usr/bin/env tsx

/**
 * Session Bootstrap
 * 
 * One-command session startup:
 * 1. Builds memory snapshot from doc directories
 * 2. Hydrates session context into memory system
 * 3. Logs session start event
 * 
 * Usage:
 *   bun run session:bootstrap [--dry-run] [--group <group_id>]
 * 
 * Environment:
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
 */

import { execSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

interface BootstrapOptions {
  groupId: string;
  dryRun: boolean;
  skipSnapshotBuild: boolean;
  concurrency: number;
  help: boolean;
}

function parseArgs(argv: string[]): BootstrapOptions {
  const options: BootstrapOptions = {
    groupId: "allura-system",
    dryRun: false,
    skipSnapshotBuild: false,
    concurrency: 5,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--group":
      case "--group-id":
        options.groupId = argv[++i];
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--skip-snapshot":
        options.skipSnapshotBuild = true;
        break;
      case "--concurrency":
      case "-c":
        options.concurrency = parseInt(argv[++i], 10) || 5;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`Session Bootstrap - One-command memory hydration

Usage:
  bun run session:bootstrap [--options]

Options:
  --group <id>          Tenant/group identifier (default: allura-system)
  --dry-run             Simulate without writing to database
  --skip-snapshot       Skip snapshot build (use existing cache)
  --concurrency <n>     Parallel ingestion limit (default: 5)
  --help                Show this help

Examples:
  # Full startup with default group
  bun run session:bootstrap

  # Dry-run mode (test without side effects)
  bun run session:bootstrap --dry-run

  # Use existing snapshot cache only
  bun run session:bootstrap --skip-snapshot

Environment:
  POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

Note: If running outside Docker, use POSTGRES_HOST=localhost instead of host.docker.internal
`);
}

interface BootstrapResult {
  snapshotBuilt: boolean;
  snapshotStats?: string;
  hydrationComplete: boolean;
  entriesProcessed: number;
  newEntries: number;
  updatedEntries: number;
  durationMs: number;
}

async function runBootstrap(options: BootstrapOptions): Promise<BootstrapResult> {
  const startTime = Date.now();
  const result: BootstrapResult = {
    snapshotBuilt: false,
    hydrationComplete: false,
    entriesProcessed: 0,
    newEntries: 0,
    updatedEntries: 0,
    durationMs: 0,
  };

  const repoRoot = process.cwd();

  // Step 1: Build snapshot (unless skipped)
  if (!options.skipSnapshotBuild) {
    console.log("📦 Building memory snapshot...");
  try {
    const snapshotCmd = `bun run "${path.join(repoRoot, "scripts", "build-memory-snapshot.ts")}" --group-id ${options.groupId}`;

    const output = execSync(snapshotCmd, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
      env: process.env,
    });

      result.snapshotBuilt = true;
      result.snapshotStats = output.trim().split("\n").pop() ?? "Snapshot built";
      console.log(`   ✓ ${result.snapshotStats}`);
    } catch (error) {
      console.error("   ✗ Snapshot build failed:", (error as Error).message);
      throw error;
    }
  } else {
    console.log("📦 Using existing snapshot cache (--skip-snapshot)");
  }

  // Step 2: Hydrate session
  console.log("💧 Hydrating session context...");
  try {
    const hydrationCmd = `bun run "${path.join(repoRoot, "scripts", "hydrate-session-from-snapshot.ts")}" --group-id ${options.groupId} --concurrency ${options.concurrency}${options.dryRun ? " --dry-run" : ""}`;

    const output = execSync(hydrationCmd, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
      env: process.env,
    });

    // Parse hydration output for stats
    const match = output.match(
      /Processed (\d+) entries \(new=(\d+), updated=(\d+)/,
    );
    if (match) {
      result.entriesProcessed = parseInt(match[1], 10);
      result.newEntries = parseInt(match[2], 10);
      result.updatedEntries = parseInt(match[3], 10);
    }

    result.hydrationComplete = true;
    console.log(
      `   ✓ Hydrated ${result.entriesProcessed} entries ` +
        `(${result.newEntries} new, ${result.updatedEntries} updated)`,
    );
  } catch (error) {
    console.error("   ✗ Hydration failed:", (error as Error).message);
    throw error;
  }

  result.durationMs = Date.now() - startTime;

  // Summary
  console.log("\n✅ Session bootstrap complete");
  console.log(`   Duration: ${result.durationMs}ms`);
  if (result.snapshotBuilt) {
    console.log(`   Snapshot: Built fresh`);
  }
  console.log(`   Memory: ${result.entriesProcessed} entries synced`);

  return result;
}

// Main execution
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Check for required env vars
  const requiredEnv = [
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
  ];

  const missing = requiredEnv.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(
      "❌ Missing required environment variables:",
      missing.join(", "),
    );
    console.error("   These can be pulled from MCP_DOCKER_get_current_database_info");
    process.exit(1);
  }

  try {
    const result = await runBootstrap(options);
    process.exit(result.hydrationComplete ? 0 : 1);
  } catch (error) {
    console.error("\n❌ Bootstrap failed:", (error as Error).message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url.startsWith("file:")) {
  main();
}

export { runBootstrap, parseArgs };
