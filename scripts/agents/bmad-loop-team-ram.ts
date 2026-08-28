#!/usr/bin/env bun
/**
 * Team RAM / Allura gate for BMad Loop.
 *
 * BMad Loop remains the execution engine. This wrapper enforces the project
 * boundary around it: explicit scope, clean worktree, disposable worktree
 * policy, BMad Loop preflight, and a post-merge receipt command.
 *
 * Usage:
 *   bun scripts/agents/bmad-loop-team-ram.ts preflight --epic 27
 *   bun scripts/agents/bmad-loop-team-ram.ts run --story 27-1-example --dry-run
 *   bun scripts/agents/bmad-loop-team-ram.ts record-merge --pr 132 --dry-run
 *   bun scripts/agents/bmad-loop-team-ram.ts record-merge --pr 132 --write-brain
 */

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const GROUP_ID = "allura-system";
const PRINCIPAL = "sabir-superadmin";
const ROOT = process.cwd();

type Scope = { kind: "epic"; value: string } | { kind: "story"; value: string };

type Args = {
  command: "preflight" | "run" | "record-merge";
  scope?: Scope;
  dryRun: boolean;
  maxStories?: string;
  pr?: string;
  writeBrain: boolean;
};

function fail(message: string): never {
  console.error(`[team-ram-loop] BLOCKED: ${message}`);
  process.exit(1);
}

function run(command: string, args: string[], options: { inherit?: boolean } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  return result;
}

function parseArgs(argv: string[]): Args {
  const command = argv.shift();
  if (command !== "preflight" && command !== "run" && command !== "record-merge") {
    fail("command must be preflight, run, or record-merge");
  }
  const parsed: Args = { command, dryRun: false, writeBrain: false };
  let epic: string | undefined;
  let story: string | undefined;

  while (argv.length) {
    const flag = argv.shift();
    switch (flag) {
      case "--epic": epic = argv.shift(); break;
      case "--story": story = argv.shift(); break;
      case "--dry-run": parsed.dryRun = true; break;
      case "--max-stories": parsed.maxStories = argv.shift(); break;
      case "--pr": parsed.pr = argv.shift(); break;
      case "--write-brain": parsed.writeBrain = true; break;
      default: fail(`unknown argument: ${flag}`);
    }
  }

  if (parsed.command === "record-merge") {
    if (!parsed.pr || !/^\d+$/.test(parsed.pr)) fail("record-merge requires numeric --pr");
    if (epic || story) fail("record-merge does not accept --epic or --story");
    return parsed;
  }

  if ((epic ? 1 : 0) + (story ? 1 : 0) !== 1) {
    fail("exactly one of --epic N or --story N-N-slug is required");
  }
  if (epic) {
    if (!/^\d+$/.test(epic)) fail("--epic must be numeric");
    parsed.scope = { kind: "epic", value: epic };
  } else if (story) {
    if (!/^\d+-\d+[a-z]?(?:-[a-z0-9]+)+$/.test(story)) {
      fail("--story must use the exact sprint-status key, e.g. 27-1-example");
    }
    parsed.scope = { kind: "story", value: story };
  }
  return parsed;
}

function ensureCleanTree() {
  const result = run("git", ["status", "--porcelain"]);
  if (result.status !== 0) fail("git status failed");
  if (result.stdout.trim()) fail("working tree is not clean");
}

function ensureWorktreePolicy() {
  const policyPath = path.join(ROOT, ".bmad-loop", "policy.toml");
  if (!existsSync(policyPath)) fail("missing local .bmad-loop/policy.toml; run bmad-loop init first");
  const policy = readFileSync(policyPath, "utf8");
  if (!/isolation\s*=\s*"worktree"/.test(policy)) fail("Loop policy must use scm.isolation=worktree");
  if (!/target_branch\s*=\s*"develop"/.test(policy)) fail("Loop policy must target develop");
  if (!/name\s*=\s*"codex"/.test(policy)) fail("Loop policy must use the approved Codex adapter");
}

function ensureLoopPreflight() {
  const result = run("bmad-loop", ["validate", "--project", ROOT, "--json"]);
  if (result.status !== 0) fail(`bmad-loop validate failed: ${result.stdout || result.stderr}`);
  const report = JSON.parse(result.stdout);
  if (report.ok !== true) fail("bmad-loop validate returned a non-OK report");
}

function ensureScopeExists(scope: Scope) {
  const statusPath = path.join(ROOT, "_bmad", "bmm", "stories", "sprint-status.yaml");
  const raw = readFileSync(statusPath, "utf8");
  const key = scope.kind === "epic" ? `epic-${scope.value}` : scope.value;
  if (!new RegExp(`^\\s{2}${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`, "m").test(raw)) {
    fail(`scope ${key} is not present in development_status`);
  }
}

function printGovernance(scope?: Scope) {
  console.log("[team-ram-loop] Team RAM / Allura gate passed");
  console.log(`[team-ram-loop] scope: ${scope ? `${scope.kind}:${scope.value}` : "post-merge"}`);
  console.log(`[team-ram-loop] group_id: ${GROUP_ID}; principal: ${PRINCIPAL}`);
  console.log("[team-ram-loop] route: Scout hydration → Brooks route → Woz build → Pike/Fowler review → Ralph validation → Brain receipt");
}

function preflight(scope: Scope) {
  ensureCleanTree();
  ensureWorktreePolicy();
  ensureLoopPreflight();
  ensureScopeExists(scope);
  printGovernance(scope);
}

function runLoop(args: Args) {
  const scope = args.scope!;
  preflight(scope);
  const loopArgs = ["run", "--project", ROOT, `--${scope.kind}`, scope.value];
  if (args.maxStories) loopArgs.push("--max-stories", args.maxStories);
  if (args.dryRun) loopArgs.push("--dry-run");
  console.log(`[team-ram-loop] invoking: bmad-loop ${loopArgs.join(" ")}`);
  const result = run("bmad-loop", loopArgs, { inherit: true });
  process.exit(result.status ?? 1);
}

function recordMerge(args: Args) {
  const result = run("gh", ["pr", "view", args.pr!, "--json", "state,url,mergedAt,mergeCommit,statusCheckRollup"]);
  if (result.status !== 0) fail(`cannot read PR #${args.pr}`);
  const pr = JSON.parse(result.stdout);
  const failed = pr.statusCheckRollup.filter((check: { conclusion: string }) => check.conclusion === "FAILURE");
  const pending = pr.statusCheckRollup.filter((check: { status: string }) => check.status !== "COMPLETED");
  if (pr.state !== "MERGED") fail(`PR #${args.pr} is not merged`);
  if (failed.length || pending.length) fail(`PR #${args.pr} does not have a fully green completed check set`);

  const receipt = [
    `BMad Loop governed delivery receipt.`,
    `PR: ${pr.url}`,
    `Merge commit: ${pr.mergeCommit.oid}`,
    `Checks: fully green and completed.`,
    `Team RAM: Brooks route; Woz build; Pike/Fowler review; Ralph validation.`,
    `Scope: ${GROUP_ID}.`,
  ].join(" ");
  printGovernance();
  if (!args.writeBrain || args.dryRun) {
    console.log("[team-ram-loop] receipt is prepared but NOT written. Re-run with --write-brain after human review:");
    console.log(receipt);
    return;
  }

  const prompt = [
    "Do not modify repository files or run shell commands.",
    "Use the enabled allura-brain MCP tool only to write the following append-only outcome receipt.",
    `Call memory_add with group_id=${GROUP_ID}, user_id=${PRINCIPAL}, metadata={source:'conversation',agent_id:'brooks-architect'}, and this content:`,
    receipt,
    "Then call memory_get with the returned id and group_id to verify it. Report only the verified id and whether it is episodic/pending review. If either MCP operation fails, report the exact error and do not claim success.",
  ].join("\n");
  const write = run("codex", ["exec", "--ephemeral", "--sandbox", "read-only", "--dangerously-bypass-approvals-and-sandbox", "-C", ROOT, prompt], { inherit: true });
  process.exit(write.status ?? 1);
}

const args = parseArgs(process.argv.slice(2));
if (args.command === "preflight") preflight(args.scope!);
else if (args.command === "run") runLoop(args);
else recordMerge(args);
