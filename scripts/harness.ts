#!/usr/bin/env bun
/**
 * Story 24.5 — Temporary harness entrypoint.
 * Usage: bun run scripts/harness.ts <scenario.json> [--replay <receipt.json>]
 */
import { runScenario } from "../src/lib/harness/runner";
import { loadScenario } from "../src/lib/harness/scenario";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: bun run scripts/harness.ts <scenario.json> [--replay <receipt.json>]");
    process.exit(1);
  }

  const scenarioPath = args[0];
  const scenario = loadScenario(resolve(process.cwd(), scenarioPath));

  let mode: "simulate" | "replay" = "simulate";
  let priorReceipt: any = undefined;

  if (args[1] === "--replay" && args[2]) {
    mode = "replay";
    priorReceipt = JSON.parse(readFileSync(args[2], "utf-8"));
  }

  const result = await runScenario(scenario, { mode, priorReceipt });
  const outPath = `./receipt-${scenario.scenario_id}-${Date.now()}.json`;
  writeFileSync(outPath, JSON.stringify(result.receipt, null, 2));
  console.log(`Receipt written to ${outPath}`);
  console.log(`Status: ${result.output.status}`);
  if (result.receipt.replay_comparison) {
    console.log(`Replay identical: ${result.receipt.replay_comparison.identical}`);
    if (!result.receipt.replay_comparison.identical) {
      console.log(`Divergent fields: ${result.receipt.replay_comparison.divergent_fields.join(", ")}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});