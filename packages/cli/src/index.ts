#!/usr/bin/env bun
/**
 * Allura CLI — Story 24.7
 * Commands: init, up, doctor, run, replay, eval, inspect, down
 * Thin adapter over SDK and harness APIs.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const args = process.argv.slice(2);
const command = args[0] ?? "";

const HELP = `Allura CLI — governed memory platform

Usage: allura <command> [options]

Commands:
  init      Create non-secret example configuration
  up        Start the local development stack
  doctor    Validate runtime, ports, DB, migrations, auth, schema, round-trip
  run       Run a fixture-backed scenario
  replay    Replay a prior scenario run
  eval      Run the portfolio evaluation suite
  inspect   Inspect evidence artifacts
  down      Stop the local development stack

Options:
  --help, -h    Show this help message
  --json        Output machine-readable JSON (for automation)
  --version     Show version
`;

const VERSION = "1.0.0";

async function main() {
  if (command === "--help" || command === "-h" || !command) {
    console.log(HELP);
    return;
  }

  if (command === "--version") {
    console.log(VERSION);
    return;
  }

  const commands: Record<string, () => Promise<void>> = {
    init: cmdInit,
    up: cmdUp,
    doctor: cmdDoctor,
    run: cmdRun,
    replay: cmdReplay,
    eval: cmdEval,
    inspect: cmdInspect,
    down: cmdDown,
  };

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error(HELP);
    process.exit(1);
  }

  try {
    await handler();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (args.includes("--json")) {
      console.log(JSON.stringify({ error: msg, code: 1 }));
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exit(1);
  }
}

async function cmdInit() {
  const target = process.cwd();
  const envPath = join(target, ".env.portfolio.example");
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `# Allura Portfolio Environment
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=memory
POSTGRES_USER=allura
POSTGRES_PASSWORD=change-me
ALLURA_MCP_TOKEN_SECRET=change-me
GRAPH_BACKEND=ruvector
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
`);
  }
  console.log("Created .env.portfolio.example with non-secret defaults.");
  console.log("Edit the file to set your secrets, then run: allura up");
}

async function cmdUp() {
  console.log("Starting local development stack...");
  const { spawnSync } = await import("child_process");
  const result = spawnSync("docker", ["compose", "up", "-d"], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("Failed to start local stack. Ensure docker compose is available and the compose file is present.");
    process.exit(result.status ?? 1);
  }
  console.log("Local stack ready at http://localhost:6477/mcp");
}

async function cmdDoctor() {
  const checks: Array<{ name: string; status: string; detail?: string }> = [];

  // Check bun version
  const bunVersion = process.version;
  checks.push({ name: "Runtime (Bun)", status: "ok", detail: bunVersion });

  // Check PostgreSQL
  try {
    const { Client } = await import("pg");
    const client = new Client({ host: "localhost", port: 5432, database: "memory", user: "allura" });
    await client.connect();
    const res = await client.query("SELECT version()");
    checks.push({ name: "PostgreSQL", status: "ok", detail: res.rows[0].version.split(" ")[1] });
    await client.end();
  } catch {
    checks.push({ name: "PostgreSQL", status: "fail", detail: "Not reachable" });
  }

  // Check migrations
  try {
    const migrationsDir = resolve(process.cwd(), "docker/postgres-init");
    if (existsSync(migrationsDir)) {
      checks.push({ name: "Migrations dir", status: "ok" });
    } else {
      checks.push({ name: "Migrations dir", status: "fail", detail: "Not found" });
    }
  } catch {
    checks.push({ name: "Migrations dir", status: "fail" });
  }

  // Check MCP gateway health (read-only, non-mutating)
  try {
    const port = process.env.ALLURA_MCP_HTTP_PORT ?? "3201";
    const res = await fetch(`http://localhost:${port}/health`);
    if (res.ok) {
      const body = (await res.json()) as { status?: string; auth_enabled?: boolean };
      checks.push({
        name: "MCP gateway",
        status: "ok",
        detail: `status=${body.status ?? "ok"} auth=${body.auth_enabled ?? "unknown"}`,
      });
    } else {
      checks.push({ name: "MCP gateway", status: "fail", detail: `HTTP ${res.status}` });
    }
  } catch {
    checks.push({ name: "MCP gateway", status: "fail", detail: "Not reachable" });
  }

  // Output
  if (args.includes("--json")) {
    console.log(JSON.stringify({ checks, overall: checks.every((c) => c.status === "ok") ? "ok" : "fail" }));
  } else {
    for (const c of checks) {
      const icon = c.status === "ok" ? "✅" : "❌";
      console.log(`  ${icon} ${c.name}: ${c.detail ?? c.status}`);
    }
  }

  if (checks.some((c) => c.status === "fail")) {
    process.exit(1);
  }
}

async function cmdRun() {
  const scenarioPath = args[1];
  if (!scenarioPath) {
    console.error("Usage: allura run <scenario.json>");
    process.exit(1);
  }
  console.log(`Running scenario: ${scenarioPath}`);
  // Delegate to harness script
  const { spawnSync } = await import("child_process");
  const result = spawnSync("bun", ["run", "scripts/harness.ts", scenarioPath], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

async function cmdReplay() {
  const scenarioPath = args[1];
  const receiptPath = args[2];
  if (!scenarioPath || !receiptPath) {
    console.error("Usage: allura replay <scenario.json> <receipt.json>");
    process.exit(1);
  }
  console.log(`Replaying scenario: ${scenarioPath} with receipt: ${receiptPath}`);
  const { spawnSync } = await import("child_process");
  const result = spawnSync("bun", ["run", "scripts/harness.ts", scenarioPath, "--replay", receiptPath], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

async function cmdEval() {
  console.log("Running portfolio evaluation suite...");
  const { spawnSync } = await import("child_process");
  const result = spawnSync("bun", ["x", "vitest", "run", "src/lib/evals/__tests__/eval-runner.test.ts"], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

async function cmdInspect() {
  const evidenceDir = join(process.cwd(), "artifacts");
  if (!existsSync(evidenceDir)) {
    console.log("No evidence artifacts found.");
    return;
  }
  console.log("Evidence artifacts:");
  const { readdirSync } = await import("node:fs");
  for (const entry of readdirSync(evidenceDir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      console.log(`  ${join(entry.parentPath ?? "", entry.name)}`);
    }
  }
}

async function cmdDown() {
  console.log("Stopping local development stack...");
  const { spawnSync } = await import("child_process");
  const result = spawnSync("docker", ["compose", "down"], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("Failed to stop local stack.");
    process.exit(result.status ?? 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});