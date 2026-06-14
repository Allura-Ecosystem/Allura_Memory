#!/usr/bin/env bun
/**
 * Ralph Loop Harness — Allura integration wrapper for `ralph` CLI.
 *
 * This is NOT an implementation of the Ralph loop. The Ralph loop is
 * an installed tool: `@th0rgal/ralph-wiggum` (https://github.com/Th0rgal/open-ralph-wiggum).
 *
 * What Ralph does (the tool): wraps an AI coding agent (OpenCode, Claude Code,
 * Codex, Copilot) in a persistent loop. Each iteration, the agent receives
 * the same prompt but sees changed files. It self-corrects until it outputs
 * <promise>COMPLETE</promise> or max-iterations is reached.
 *
 * What this script does (the harness):
 *   1. Resolves the `ralph` binary (global install or project-local)
 *   2. Constructs the ralph command with Allura-specific defaults
 *   3. Logs the loop start/end to PostgreSQL (audit trail)
 *   4. Passes through to the real `ralph` CLI — no reimplementation
 *
 * Tool: Ralph integration harness
 * CI Route: none (manual or issue-tagged dispatch only)
 * See: .opencode/contracts/ralph-integration.md
 *
 * Install Ralph:
 *   bun add -g @th0rgal/ralph-wiggum
 *   # or: bun add -g @th0rgal/ralph-wiggum
 *
 * Gracefully handles missing DB connections (for CI environments).
 */

import path from "node:path";
import { assertCwdOutsideGitDir } from "../../src/lib/git/exec";

const TASK_DESCRIPTION = process.argv[2];
const ARGS = process.argv.slice(3);

// ── Git-exec safety guard ───────────────────────────────────────────────────
//
// Incident containment: the external `ralph` CLI must NEVER be spawned with a
// working directory that resolves inside a `.git/` directory. When git sees
// bare=false + no core.worktree there, it dumps the working tree into the
// gitdir and corrupts the (sub)module. We can't fix the external binary, so we
// refuse to launch it from an unsafe cwd at the boundary we control.
//
// assertCwdOutsideGitDir is the canonical single-source-of-truth implementation
// in src/lib/git/exec.ts (GIT-EXEC-001). The local reimplementation has been
// removed — one source of truth, no drift.

// ── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_AGENT = process.env.RALPH_AGENT || "opencode";
const DEFAULT_MAX_ITERATIONS = process.env.RALPH_MAX_ITERATIONS || "10";
const RALPH_BINARY =
  process.env.RALPH_BINARY ||
  (process.env.RALPH_OPENCODE_BINARY || "ralph");

// ── Arg Parsing ───────────────────────────────────────────────────────────

interface RalphConfig {
  task: string;
  agent: string;
  model?: string;
  maxIterations: number;
  completionPromise: string;
  tasks: boolean;
  dryRun: boolean;
  rotation?: string;
  extraArgs: string[];
}

function parseArgs(task: string, args: string[]): RalphConfig {
  const config: RalphConfig = {
    task,
    agent: DEFAULT_AGENT,
    maxIterations: parseInt(DEFAULT_MAX_ITERATIONS, 10),
    completionPromise: "COMPLETE",
    tasks: false,
    dryRun: false,
    extraArgs: [],
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case "--agent":
        config.agent = args[++i];
        break;
      case "--model":
        config.model = args[++i];
        break;
      case "--max-iterations":
        config.maxIterations = parseInt(args[++i], 10);
        break;
      case "--completion-promise":
        config.completionPromise = args[++i];
        break;
      case "--tasks":
      case "-t":
        config.tasks = true;
        break;
      case "--rotation":
        config.rotation = args[++i];
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      default:
        config.extraArgs.push(arg);
    }
    i++;
  }

  return config;
}

// ── Ralph Invocation ──────────────────────────────────────────────────────

function buildRalphCommand(config: RalphConfig): string[] {
  const cmd: string[] = [RALPH_BINARY, `"${config.task}"`];

  cmd.push("--agent", config.agent);

  if (config.model) {
    cmd.push("--model", config.model);
  }

  cmd.push("--max-iterations", String(config.maxIterations));
  cmd.push("--completion-promise", config.completionPromise);

  if (config.tasks) {
    cmd.push("--tasks");
  }

  if (config.rotation) {
    cmd.push("--rotation", config.rotation);
  }

  // Pass through any extra args
  cmd.push(...config.extraArgs);

  return cmd;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function ralphLoop() {
  if (!TASK_DESCRIPTION) {
    console.error("Usage: bun scripts/agents/ralph-loop.ts <task> [options]");
    console.error("");
    console.error("This script wraps the `ralph` CLI (@th0rgal/ralph-wiggum).");
    console.error("Install: npm install -g @th0rgal/ralph-wiggum");
    console.error("");
    console.error("Options:");
    console.error("  --agent AGENT            opencode (default), claude-code, codex, copilot");
    console.error("  --model MODEL            Model for the agent (e.g. claude-sonnet-4)");
    console.error("  --max-iterations N       Max loop iterations (default: 10)");
    console.error("  --completion-promise T   Completion signal (default: COMPLETE)");
    console.error("  --tasks, -t              Enable structured task tracking");
    console.error("  --rotation LIST          Cycle through agent:model pairs");
    console.error("  --dry-run                Print command, don't execute");
    console.error("");
    console.error("Any other flags are passed through to the `ralph` CLI.");
    console.error("");
    console.error("Ralph docs: https://github.com/Th0rgal/open-ralph-wiggum");
    process.exit(1);
  }

  const config = parseArgs(TASK_DESCRIPTION, ARGS);
  const ralphCmd = buildRalphCommand(config);

  console.log(`[ralph-harness] Task: ${config.task}`);
  console.log(`[ralph-harness] Agent: ${config.agent}`);
  console.log(`[ralph-harness] Max iterations: ${config.maxIterations}`);
  console.log(`[ralph-harness] Completion promise: ${config.completionPromise}`);
  if (config.tasks) console.log("[ralph-harness] Tasks mode: ON");
  if (config.rotation) console.log(`[ralph-harness] Rotation: ${config.rotation}`);
  console.log("");

  // ── Dry Run ────────────────────────────────────────────────────────────

  if (config.dryRun) {
    console.log("[ralph-harness] DRY RUN — command that would execute:");
    console.log(`  ${ralphCmd.join(" ")}`);
    console.log("");
    console.log("[ralph-harness] No changes made. No DB logging.");
    process.exit(0);
  }

  // ── Check ralph binary ─────────────────────────────────────────────────

  const { spawnSync } = await import("child_process");
  const whichResult = spawnSync("which", [RALPH_BINARY], {
    encoding: "utf-8",
  });

  if (whichResult.status !== 0) {
    console.error(`[ralph-harness] ERROR: '${RALPH_BINARY}' not found in PATH.`);
    console.error("[ralph-harness] Install with: npm install -g @th0rgal/ralph-wiggum");
    console.error("[ralph-harness] Or set RALPH_BINARY to the full path.");
    process.exit(1);
  }

  // ── Log start to PostgreSQL ────────────────────────────────────────────

  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const neo4jUri = process.env.NEO4J_URI;
  let pgPool: InstanceType<typeof import("pg").Pool> | null = null;
  let neo4jDriver: { session: () => { run: (q: string, p: Record<string, unknown>) => Promise<{ summary: unknown }>; close: () => Promise<void> } } | null = null;

  if (postgresUrl && neo4jUri) {
    try {
      const { getPool } = await import("../../src/lib/postgres/connection");
      const { getDriver } = await import("../../src/lib/neo4j/connection");
      pgPool = getPool();
      neo4jDriver = getDriver();
    } catch (error) {
      console.log("[ralph-harness] DB connections unavailable — proceeding without logging");
    }
  }

  if (pgPool) {
    try {
      await pgPool.query(`
        INSERT INTO events (group_id, event_type, agent_id, metadata, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        "allura-system",
        "ralph_loop_start",
        "ralph",
        JSON.stringify({
          task: config.task,
          agent: config.agent,
          model: config.model || "default",
          max_iterations: config.maxIterations,
          completion_promise: config.completionPromise,
          tasks_mode: config.tasks,
          rotation: config.rotation || null,
          harness_version: "1.0.0",
        }),
        "running",
      ]);
    } catch (error) {
      console.error("[ralph-harness] PostgreSQL start-log failed:", error);
    }
  }

  // ── Execute Ralph ──────────────────────────────────────────────────────

  console.log("[ralph-harness] ═══════════════════════════════════════════════════════");
  console.log("[ralph-harness]   Invoking ralph CLI — this is the real loop tool");
  console.log("[ralph-harness]   (not a reimplementation — we USE ralph-wiggum)");
  console.log("[ralph-harness] ═══════════════════════════════════════════════════════");
  console.log("");

  // Guard: refuse to launch the external ralph CLI from inside a .git dir.
  // No cwd is passed to spawnSync, so the spawned process inherits process.cwd().
  // assertCwdOutsideGitDir is the canonical GIT-EXEC-001 choke point.
  const ralphCwd = assertCwdOutsideGitDir(process.cwd());

  const result = spawnSync(ralphCmd[0], ralphCmd.slice(1), {
    stdio: "inherit",
    shell: true,
    cwd: ralphCwd,
    env: {
      ...process.env,
      RALPH_AGENT: config.agent,
    },
  });

  const exitCode = result.status ?? 1;
  const completed = exitCode === 0;

  // ── Log end to PostgreSQL ──────────────────────────────────────────────

  if (pgPool) {
    try {
      await pgPool.query(`
        INSERT INTO events (group_id, event_type, agent_id, metadata, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        "allura-system",
        "ralph_loop_end",
        "ralph",
        JSON.stringify({
          task: config.task,
          exit_code: exitCode,
          completed,
          max_iterations: config.maxIterations,
        }),
        completed ? "completed" : "failed",
      ]);
    } catch (error) {
      console.error("[ralph-harness] PostgreSQL end-log failed:", error);
    }
  }

  if (neo4jDriver) {
    const neoSession = neo4jDriver.session();
    try {
      await neoSession.run(`
        CREATE (i:Insight {
          insight_id: 'ins_ralph_' + randomUUID(),
          summary: $summary,
          confidence: $confidence,
          status: 'active',
          group_id: 'allura-system',
          created_at: datetime(),
          source_type: 'agent_loop'
        })
        RETURN i
      `, {
        summary: `Ralph loop ${completed ? "completed" : "failed"}: ${config.task}. Agent: ${config.agent}. Iterations: ≤${config.maxIterations}.`,
        confidence: completed ? 0.80 : 0.30,
      });
    } catch (error) {
      console.error("[ralph-harness] Neo4j log failed:", error);
    } finally {
      await neoSession.close();
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  if (pgPool) {
    const { closePool } = await import("../../src/lib/postgres/connection");
    const { closeDriver } = await import("../../src/lib/neo4j/connection");
    await closeDriver();
    await closePool();
  }

  process.exit(exitCode);
}

// Only run the loop when invoked directly as a CLI, not when imported (e.g. by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  ralphLoop();
}
