#!/usr/bin/env bun
/**
 * Story 24.6 — Portfolio evaluation CLI.
 *
 * Runs the canonical offline evaluation suite (evals/suites/portfolio.yaml),
 * executing every declared lane's dataset, and writes the JSON + Markdown
 * reports. Exits non-zero when the overall status is not "pass", so it can be
 * wired into CI as a required regression gate.
 *
 * Usage:
 *   bun run eval:portfolio
 *   bun run eval:portfolio --json=artifacts/ci/eval/portfolio.json
 *   bun run eval:portfolio --md=artifacts/ci/eval/portfolio.md
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateJsonReport, generateMarkdownReport } from "./report";
import { runSuite } from "./runner";

const SUITE_PATH = "evals/suites/portfolio.yaml";

function parseArgs(argv: string[]): { json: string | null; md: string | null } {
  const opts = { json: null as string | null, md: null as string | null };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "json" && value) opts.json = value;
    if (key === "md" && value) opts.md = value;
  }
  return opts;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const result = await runSuite({ suitePath: SUITE_PATH });

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

  process.stderr.write(`portfolio evaluation: ${result.overall_status.toUpperCase()} (${result.metrics.length} metrics)\n`);
  for (const m of result.metrics) {
    process.stderr.write(`  ${m.name}: ${m.value} (threshold ${m.threshold}) ${m.status}\n`);
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
