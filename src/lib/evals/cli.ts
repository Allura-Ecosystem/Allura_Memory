#!/usr/bin/env bun
/**
 * Story 24.6 — Portfolio evaluation CLI.
 *
 * Runs the canonical evaluation suite (evals/suites/portfolio.yaml), executing
 * every declared lane's dataset, and writes the JSON + Markdown reports.
 * Exits non-zero when the overall status is not "pass", so it can be wired
 * into CI as a required regression gate.
 *
 * Two modes:
 *   --live   execute every lane through the real measured executors (app-role
 *            PostgreSQL, policy engine, harness replay, tool catalog). This is
 *            the measured evaluation gate. Requires POSTGRES_APP_USER /
 *            POSTGRES_APP_PASSWORD and a migrated database.
 *   (default) offline shape validation only — a wiring check, NOT a
 *            measurement. The report marks every lane measured:false.
 *
 * Usage:
 *   bun run eval:portfolio
 *   bun run eval:portfolio --live
 *   bun run eval:portfolio --live --json=artifacts/ci/eval/portfolio.json
 *   bun run eval:portfolio --live --md=artifacts/ci/eval/portfolio.md
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { liveExecutor } from "./executors/live-executors";
import { seedCorpus } from "./executors/live-retrieval";
import { generateJsonReport, generateMarkdownReport } from "./report";
import { runSuite } from "./runner";

const SUITE_PATH = "evals/suites/portfolio.yaml";
const CORPUS_PATH = "evals/datasets/relevance-corpus.json";

function parseArgs(argv: string[]): { json: string | null; md: string | null; live: boolean } {
  const opts = { json: null as string | null, md: null as string | null, live: false };
  for (const arg of argv) {
    if (arg === "--live") opts.live = true;
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "json" && value) opts.json = value;
    if (key === "md" && value) opts.md = value;
  }
  return opts;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.live) {
    // Seed the labeled retrieval corpus so the measured retrieval lane has
    // real data to rank. This is tenant-scoped and RLS-enforced.
    const seeded = await seedCorpus(CORPUS_PATH);
    process.stderr.write(`Seeded ${seeded} labeled retrieval documents.\n`);
  }

  const result = await runSuite({
    suitePath: SUITE_PATH,
    executor: opts.live ? liveExecutor : undefined,
    environment: opts.live
      ? { mode: "live", postgres_role: "allura_app" }
      : { mode: "offline-shape-only" },
  });

  const json = generateJsonReport(result);
  const md = generateMarkdownReport(result);

  if (opts.json) {
    const out = resolve(process.cwd(), opts.json);
    await mkdir(resolve(out, ".."), { recursive: true });
    await writeFile(out, json + "\n", "utf8");
    process.stderr.write(`JSON report written to ${opts.json}\n`);
  }
  if (opts.md) {
    const out = resolve(process.cwd(), opts.md);
    await mkdir(resolve(out, ".."), { recursive: true });
    await writeFile(out, md + "\n", "utf8");
    process.stderr.write(`Markdown report written to ${opts.md}\n`);
  }

  process.stderr.write(`portfolio evaluation: ${result.overall_status.toUpperCase()} (${result.metrics.length} metrics, ${opts.live ? "live" : "offline"})\n`);
  for (const m of result.metrics) {
    process.stderr.write(`  ${m.name}: ${m.value} (threshold ${m.threshold}) ${m.status}${m.measured ? " [measured]" : " [wiring-check]"}\n`);
  }
  return result.overall_status === "pass" ? 0 : 1;
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`[eval] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
      process.exit(1);
    });
}
