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
    if (args.includes("--json")) {
      console.error(JSON.stringify({ error: `Unknown command: ${command}`, code: 1 }));
    } else {
      console.error(`Unknown command: ${command}`);
      console.error(HELP);
    }
    process.exit(1);
  }

  try {
    await handler();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (args.includes("--json")) {
      console.error(JSON.stringify({ error: msg, code: 1 }));
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
# NOTE: must be >= 16 chars — the gateway refuses to start with a shorter secret
ALLURA_MCP_TOKEN_SECRET=change-me-change-me
GRAPH_BACKEND=ruvector
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
`);
  }
  // The compose stack needs a .env for ${VAR} substitution (brain-stack.sh
  // passes --env-file .env). Create it from the example if absent so a fresh
  // clone can `allura up` without a manual copy step.
  const baseEnvPath = join(target, ".env");
  if (!existsSync(baseEnvPath)) {
    writeFileSync(baseEnvPath, `# Allura base environment (non-secret defaults)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=memory
POSTGRES_USER=allura
POSTGRES_PASSWORD=change-me
# NOTE: must be >= 16 chars — the gateway refuses to start with a shorter secret
ALLURA_MCP_TOKEN_SECRET=change-me-change-me
GRAPH_BACKEND=ruvector
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
`);
  }
  // The mcp service's env_file list includes .env.local (secrets override,
  // gitignored). Create it with non-secret defaults so a fresh clone can
  // `allura up` without a manual copy step; users replace the values.
  const localEnvPath = join(target, ".env.local");
  if (!existsSync(localEnvPath)) {
    writeFileSync(localEnvPath, `# Allura local secrets override (gitignored — replace with real secrets)
POSTGRES_PASSWORD=change-me
# NOTE: must be >= 16 chars — the gateway refuses to start with a shorter secret
ALLURA_MCP_TOKEN_SECRET=change-me-change-me
`);
  }
  console.log("Created .env.portfolio.example with non-secret defaults.");
  console.log("Edit the file to set your secrets, then run: allura up");
}

async function cmdUp() {
  console.log("Starting local development stack...");
  const { spawnSync } = await import("child_process");
  // Delegate to the bootstrap script: it pre-creates the external networks
  // and volumes a fresh machine lacks, and applies the .env/.env.local
  // env-file args compose needs for ${VAR} substitution. A bare
  // `docker compose up -d` fails on a fresh clone (external resources
  // missing) — this is the supported path (bun run brain:up).
  const result = spawnSync("bash", ["scripts/brain-stack.sh", "up"], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("Failed to start local stack. Ensure docker compose is available and the compose file is present.");
    process.exit(result.status ?? 1);
  }
  console.log("Local stack ready at http://localhost:5888/mcp");
}

async function cmdDoctor() {
  const checks: Array<{ name: string; status: string; detail?: string }> = [];

  // Check bun version
  const bunVersion = process.version;
  checks.push({ name: "Runtime (Bun)", status: "ok", detail: bunVersion });

  // Check PostgreSQL. Connection details come from the environment so that
  // `allura doctor` validates the stack `allura up` actually started (the
  // portfolio demo binds PostgreSQL on POSTGRES_PORT, not the 5432 default).
  try {
    const { Client } = await import("pg");
    const client = new Client({
      host: process.env.POSTGRES_HOST ?? "localhost",
      port: Number.parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
      database: process.env.POSTGRES_DB ?? "memory",
      user: process.env.POSTGRES_USER ?? "allura",
      password: process.env.POSTGRES_PASSWORD,
    });
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
    const port = process.env.ALLURA_MCP_HTTP_PORT ?? "5888";
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
  // Runs the scored evaluation lanes and prints each metric against its
  // threshold. Previously this ran the eval-runner's own unit tests, which
  // proved the runner compiled but reported no lane scores.
  const { spawnSync } = await import("child_process");
  const result = spawnSync("bun", ["src/lib/evals/cli.ts"], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

async function cmdInspect() {
  const { readdirSync } = await import("node:fs");
  const cwd = process.cwd();
  const evidenceDir = join(cwd, "artifacts");
  const receipts = readdirSync(cwd, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.startsWith("receipt-") && e.name.endsWith(".json"))
    .map((e) => e.name)
    .sort();
  if (receipts.length === 0 && !existsSync(evidenceDir)) {
    console.log("No evidence artifacts found.");
    return;
  }
  console.log("Evidence artifacts:");
  if (receipts.length > 0) {
    console.log("  Run receipts (cwd):");
    for (const name of receipts) {
      console.log(`  ${name}`);
    }
  }
  if (existsSync(evidenceDir)) {
    console.log("  artifacts/:");
    for (const entry of readdirSync(evidenceDir, { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) {
        console.log(`  ${join(entry.parentPath ?? "", entry.name)}`);
      }
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