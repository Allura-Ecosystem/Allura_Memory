#!/usr/bin/env bun
/**
 * Story 24.6 — measured retrieval lane.
 *
 * Seeds a labeled corpus into PostgreSQL, runs each query through real lexical
 * retrieval, and reports measured P@5 against the suite threshold (0.70).
 *
 * This is the one lane that reports a measurement rather than a wiring check.
 * Exits non-zero if the measured mean falls below threshold, so it can gate CI.
 *
 * Usage:
 *   set -a; . ./.env.portfolio; set +a
 *   bun run scripts/eval-live-retrieval.ts
 *   bun run scripts/eval-live-retrieval.ts --json=artifacts/portfolio-demo/07-measured-retrieval.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { precisionAtK, retrieve, runLiveRetrieval, seedCorpus } from "../src/lib/evals/executors/live-retrieval";

const CORPUS = "evals/datasets/relevance-corpus.json";
const THRESHOLD = 0.7;

/**
 * Negative controls. A metric that cannot fail is not a metric — these cases
 * deliberately pair a query with the wrong gold document, so a lane that is
 * still only checking case shape would score them 1.00 exactly like the real
 * set. Run with --control.
 */
const CONTROLS = [
  { id: "c1", query: "debt to income ratio exceeded guideline compensating factors", expected: ["mem-flood-1"], note: "mislabeled: right query, wrong gold doc" },
  { id: "c2", query: "photosynthesis chlorophyll absorption spectrum", expected: ["mem-dti-1"], note: "query with no corpus match" },
  { id: "c3", query: "wage earner pay stubs W-2 verbal verification", expected: ["mem-income-1"], note: "near-miss: distractor is the true match, label points to the self-employed doc" },
];

async function runControls(): Promise<number> {
  console.log("Negative controls — the lane must FAIL these or it is inert.\n");
  let sum = 0;
  for (const c of CONTROLS) {
    const r = await retrieve(c.query, 5);
    const p = precisionAtK(r, c.expected, 5);
    sum += p;
    console.log(`  ${c.id}  P@5=${p.toFixed(2)}  ${c.note}`);
    console.log(`        retrieved ${r.length ? r.join(", ") : "(nothing)"}`);
  }
  const mean = sum / CONTROLS.length;
  console.log("");
  console.log(`negative-control mean P@5: ${mean.toFixed(3)} (threshold ${THRESHOLD}) ${mean >= THRESHOLD ? "pass" : "fail"}`);
  console.log(
    mean < THRESHOLD
      ? "FALSIFIABLE: the lane reports failure on bad labels."
      : "NOT FALSIFIABLE: the metric is inert and must not be reported as measured.",
  );
  // Controls are expected to fail the threshold; that outcome is the pass.
  return mean < THRESHOLD ? 0 : 1;
}

async function main(): Promise<number> {
  const jsonArg = process.argv.slice(2).find((a) => a.startsWith("--json="));
  if (process.argv.includes("--control")) return runControls();

  const seeded = await seedCorpus(CORPUS);
  console.log(`Seeded ${seeded} labeled documents (tenant-scoped, RLS enforced).`);

  const { cases, meanPrecision } = await runLiveRetrieval(CORPUS);

  console.log("");
  console.log("Measured retrieval — lexical (content_tsv / ts_rank_cd), no embedding service");
  console.log("");
  for (const c of cases) {
    const mark = c.precision > 0 ? "PASS" : "FAIL";
    console.log(`  ${mark}  ${c.id}  P@5=${c.precision.toFixed(2)}  "${c.query}"`);
    console.log(`        expected  ${c.expected.join(", ")}`);
    console.log(`        retrieved ${c.retrieved.length ? c.retrieved.join(", ") : "(nothing)"}`);
  }

  const status = meanPrecision >= THRESHOLD ? "pass" : "fail";
  console.log("");
  console.log(
    `retrieval_relevance_p@5: ${meanPrecision.toFixed(3)} (threshold ${THRESHOLD}) ${status}  [MEASURED]`,
  );

  if (jsonArg) {
    const out = resolve(process.cwd(), jsonArg.split("=")[1]);
    mkdirSync(resolve(out, ".."), { recursive: true });
    writeFileSync(
      out,
      JSON.stringify(
        {
          metric: "retrieval_relevance_p@5",
          value: Number(meanPrecision.toFixed(4)),
          threshold: THRESHOLD,
          status,
          measurement: "live",
          method: "PostgreSQL full-text search over content_tsv, ranked by ts_rank_cd",
          caveat:
            "Lexical retrieval only. No embedding service in this environment, so the hybrid vector path is not exercised.",
          corpus_documents: seeded,
          cases,
          generated_at: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    console.log(`\nJSON written to ${jsonArg.split("=")[1]}`);
  }

  return status === "pass" ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
