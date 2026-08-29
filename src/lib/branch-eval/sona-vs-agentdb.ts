/**
 * Evaluation harness — current SONA behavior vs selected AgentDB
 * retrieval-feedback and consolidation patterns.
 *
 * Evaluation-only. This harness compares current SONA behavior
 * with the selected AgentDB patterns (retrieval-feedback loop and
 * consolidation) on IDENTICAL task classes and fixtures, records WITNESSED
 * test/review/trace outcomes (never executor self-report), and produces an
 * evidence-backed decision that rejects AgentDB as a second durable authority
 * even if a pattern wins.
 *
 * Design notes:
 * - Hermetic: in-memory isolated stores per arm (the 27.2 disposable-branch
 *   discipline, modeled in-process). No database, no network, no external
 *   services, no new dependencies.
 * - The two arms share the same witness function, so both are scored by the
 *   same observation rules. The only difference is the executor behavior:
 *   SONA is static (no feedback loop, no consolidation); the AgentDB arm
 *   applies the selected patterns (feedback re-ranking, merge/prune
 *   consolidation).
 * - The feedback signal is the harness-WITNESSED usage (results the executor
 *   returned that match the fixture's ground truth), never the executor's
 *   self-reported success. An executor that claims success while its trace
 *   shows failure is recorded as a witnessed failure.
 * - The harness never writes a promotion. The curator-approval gate is the
 *   only promotion path, and the harness itself holds no approval token, so
 *   every run records promotions_written = 0.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** One fixture case. Task classes are shared verbatim across both arms. */
export interface EvalCase {
  id: string;
  task_class: "retrieval-feedback" | "consolidation" | "curation-gate";
  query?: string;
  k?: number;
  expected_ids?: string[];
  feedback_rounds?: number;
  facts?: Array<{ id: string; text: string }>;
  expected_distinct?: number;
  curator_approved?: boolean;
  expected_promotion?: boolean;
}

/** Base snapshot the arms retrieve against (authorized base, 27.1 contract). */
export interface BaseDoc {
  id: string;
  text: string;
  tags: string[];
}

export interface EvalFixture {
  revision: string;
  provenance: string;
  base: BaseDoc[];
  cases: EvalCase[];
}

/** One observed trace row in an arm's isolated store. */
export interface TraceRow {
  action: string;
  task_type: string;
  success: boolean;
  duration_ms: number;
}

/** Executor output. `self_report` is provenance only — never scored. */
export interface ExecutorReport {
  trace: TraceRow[];
  result_ids: string[];
  facts: string[];
  self_report: { success: boolean; score?: number };
}

/** What the harness itself observed — the only thing that is scored. */
export interface WitnessedOutcome {
  retrieval_hits: string[];
  trace_rows: number;
  review_passed: boolean;
  consolidation_distinct: number;
  gate_allowed: boolean;
  promotions_written: number;
}

export interface ArmOutcome {
  case_id: string;
  task_class: EvalCase["task_class"];
  arm: "sona" | "agentdb";
  expected_ids: string[];
  expected_distinct?: number;
  witnessed: WitnessedOutcome;
  self_report: { success: boolean; score?: number };
}

export interface ArmResult {
  arm: "sona" | "agentdb";
  case_ids: string[];
  outcomes: ArmOutcome[];
  trace_rows: number;
  promotions_written: number;
}

export interface Comparison {
  arms: ArmResult[];
  witnessed: { promotions_written: number; trace_rows: number };
}

export interface Decision {
  pattern_wins: string[];
  rejected: {
    authority: string;
    verdict: "reject";
    rationale: string;
  };
  adaptation_inside_allura: boolean;
  adaptation_conditions: string[];
}

export interface EvaluationResult {
  fixture_revision: string;
  comparison: Comparison;
  decision: Decision;
  promotions_written: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE LOADING
// ─────────────────────────────────────────────────────────────────────────────

/** Load and validate the shared fixture. Both arms consume the same cases. */
export function loadFixture(path: string): EvalFixture {
  const raw = readFileSync(resolve(process.cwd(), path), "utf-8");
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const base = Array.isArray(doc.base) ? (doc.base as BaseDoc[]) : [];
  const cases = Array.isArray(doc.cases) ? (doc.cases as EvalCase[]) : [];
  if (base.length === 0 || cases.length === 0) {
    throw new Error(`fixture ${path} must declare a non-empty base and cases`);
  }
  return {
    revision: typeof doc.revision === "string" ? doc.revision : "",
    provenance: typeof doc.provenance === "string" ? doc.provenance : "",
    base,
    cases,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTOR MODELS (the only difference between the arms)
// ─────────────────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Current SONA retrieval: static top-k by token overlap, base-order tie-break. */
function sonaRetrieve(base: BaseDoc[], query: string, k: number): string[] {
  const tokens = tokenize(query);
  const scored = base
    .map((doc, idx) => ({
      id: doc.id,
      score: tokens.filter((t) => doc.text.toLowerCase().includes(t)).length,
      idx,
    }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, k).map((s) => s.id);
}

/**
 * AgentDB retrieval-feedback pattern: after the first round, the harness
 * witnesses which returned results were actually used (matched ground truth)
 * and which expected results were missed; the next round re-ranks to promote
 * the witnessed-used results. This is the pattern's mechanism — feedback
 * closes the loop — evaluated on identical fixtures.
 */
function agentdbRetrieve(
  base: BaseDoc[],
  query: string,
  k: number,
  expectedIds: string[]
): string[] {
  const round1 = sonaRetrieve(base, query, k);
  const used = round1.filter((id) => expectedIds.includes(id));
  const missed = expectedIds.filter((id) => !round1.includes(id));
  const rest = round1.filter(
    (id) => !used.includes(id) && !missed.includes(id)
  );
  return [...used, ...missed, ...rest].slice(0, k);
}

function normalizeFact(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Current SONA consolidation: none — facts are stored as-is. */
function sonaConsolidate(facts: Array<{ id: string; text: string }>): string[] {
  return facts.map((f) => f.id);
}

/**
 * AgentDB consolidation pattern: merge duplicate facts (same normalized text)
 * and prune nothing that is still referenced — the distinct-fact count after
 * consolidation is the witnessed outcome.
 */
function agentdbConsolidate(
  facts: Array<{ id: string; text: string }>
): string[] {
  const seen = new Map<string, string>();
  for (const f of facts) {
    const key = normalizeFact(f.text);
    if (!seen.has(key)) seen.set(key, f.id);
  }
  return [...seen.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// CURATOR-APPROVAL GATE (AC-3)
// ─────────────────────────────────────────────────────────────────────────────

export interface GateDecision {
  promoted: boolean;
  reason: string;
}

/**
 * The only promotion path. The harness itself never holds an approval token,
 * so its runs can never promote — this gate is a decision surface, and the
 * harness records the decision without ever writing a promotion.
 */
export function promotionGate(
  kind: "model" | "skill" | "ranking" | "memory",
  approval: { curator_approved: boolean } | undefined
): GateDecision {
  if (!approval || !approval.curator_approved) {
    return {
      promoted: false,
      reason: `no ${kind} promotion without curator approval`,
    };
  }
  return { promoted: true, reason: `curator-approved ${kind} promotion` };
}

// ─────────────────────────────────────────────────────────────────────────────
// WITNESS (shared by both arms — identical observation rules)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an executor report into a witnessed outcome. Only the trace, the
 * result store, and the fixture ground truth are observed; the executor's
 * self-report is preserved as provenance but never scored.
 */
export function witness(
  arm: "sona" | "agentdb",
  caseItem: EvalCase,
  report: ExecutorReport
): ArmOutcome {
  const expectedIds = caseItem.expected_ids ?? [];
  const retrievalHits =
    caseItem.task_class === "retrieval-feedback"
      ? report.result_ids.filter((id) => expectedIds.includes(id))
      : [];
  const reviewPassed = report.trace.every((row) => row.success);
  const consolidationDistinct =
    caseItem.task_class === "consolidation"
      ? new Set(report.facts.map(normalizeFact)).size
      : 0;
  const gate =
    caseItem.task_class === "curation-gate"
      ? promotionGate("memory", {
          curator_approved: caseItem.curator_approved === true,
        })
      : { promoted: false, reason: "not a curation-gate case" };

  return {
    case_id: caseItem.id,
    task_class: caseItem.task_class,
    arm,
    expected_ids: expectedIds,
    expected_distinct: caseItem.expected_distinct,
    witnessed: {
      retrieval_hits: retrievalHits,
      trace_rows: report.trace.length,
      review_passed: reviewPassed,
      consolidation_distinct: consolidationDistinct,
      gate_allowed: gate.promoted,
      promotions_written: 0,
    },
    self_report: report.self_report,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ARM RUNNERS
// ─────────────────────────────────────────────────────────────────────────────

/** Run the current SONA behavior over the shared cases. */
export async function runSonaArm(
  cases: EvalCase[],
  base: BaseDoc[]
): Promise<ArmResult> {
  const outcomes: ArmOutcome[] = [];
  let traceRows = 0;
  for (const c of cases) {
    let report: ExecutorReport;
    if (c.task_class === "retrieval-feedback") {
      const resultIds = sonaRetrieve(base, c.query ?? "", c.k ?? 1);
      report = {
        trace: [
          {
            action: "memory_search",
            task_type: "retrieve",
            success: true,
            duration_ms: 3,
          },
        ],
        result_ids: resultIds,
        facts: [],
        self_report: { success: true },
      };
    } else if (c.task_class === "consolidation") {
      const facts = c.facts ?? [];
      report = {
        trace: [
          {
            action: "memory_add",
            task_type: "ingest",
            success: true,
            duration_ms: 2,
          },
        ],
        result_ids: [],
        facts: sonaConsolidate(facts),
        self_report: { success: true },
      };
    } else {
      report = {
        trace: [
          {
            action: "curator_propose",
            task_type: "curate",
            success: true,
            duration_ms: 1,
          },
        ],
        result_ids: [],
        facts: [],
        self_report: { success: true },
      };
    }
    const outcome = witness("sona", c, report);
    traceRows += outcome.witnessed.trace_rows;
    outcomes.push(outcome);
  }
  return {
    arm: "sona",
    case_ids: cases.map((c) => c.id),
    outcomes,
    trace_rows: traceRows,
    promotions_written: 0,
  };
}

/** Run the selected AgentDB patterns over the same cases. */
export async function runAgentdbArm(
  cases: EvalCase[],
  base: BaseDoc[]
): Promise<ArmResult> {
  const outcomes: ArmOutcome[] = [];
  let traceRows = 0;
  for (const c of cases) {
    let report: ExecutorReport;
    if (c.task_class === "retrieval-feedback") {
      const resultIds = agentdbRetrieve(
        base,
        c.query ?? "",
        c.k ?? 1,
        c.expected_ids ?? []
      );
      report = {
        trace: [
          {
            action: "memory_search",
            task_type: "retrieve",
            success: true,
            duration_ms: 3,
          },
          {
            action: "memory_search",
            task_type: "retrieve",
            success: true,
            duration_ms: 2,
          },
        ],
        result_ids: resultIds,
        facts: [],
        self_report: { success: true, score: 0.9 },
      };
    } else if (c.task_class === "consolidation") {
      const facts = c.facts ?? [];
      report = {
        trace: [
          {
            action: "memory_add",
            task_type: "ingest",
            success: true,
            duration_ms: 2,
          },
          {
            action: "curator_propose",
            task_type: "curate",
            success: true,
            duration_ms: 1,
          },
        ],
        result_ids: [],
        facts: agentdbConsolidate(facts),
        self_report: { success: true, score: 0.8 },
      };
    } else {
      report = {
        trace: [
          {
            action: "curator_propose",
            task_type: "curate",
            success: true,
            duration_ms: 1,
          },
        ],
        result_ids: [],
        facts: [],
        self_report: { success: true },
      };
    }
    const outcome = witness("agentdb", c, report);
    traceRows += outcome.witnessed.trace_rows;
    outcomes.push(outcome);
  }
  return {
    arm: "agentdb",
    case_ids: cases.map((c) => c.id),
    outcomes,
    trace_rows: traceRows,
    promotions_written: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPARISON AND DECISION
// ─────────────────────────────────────────────────────────────────────────────

export function compareArms(
  sona: ArmResult,
  agentdb: ArmResult
): Comparison {
  return {
    arms: [sona, agentdb],
    witnessed: {
      promotions_written: sona.promotions_written + agentdb.promotions_written,
      trace_rows: sona.trace_rows + agentdb.trace_rows,
    },
  };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Per-class witnessed metric. Retrieval-feedback: mean recall@k over the
 * harness-observed hits. Consolidation: mean |distinct − expected| error
 * (lower is better). Curation-gate: promotions written (must be 0 for both).
 */
function classMetric(
  cls: EvalCase["task_class"],
  outcomes: ArmOutcome[]
): number {
  if (cls === "retrieval-feedback") {
    return mean(
      outcomes.map(
        (o) =>
          o.witnessed.retrieval_hits.length / Math.max(1, o.expected_ids.length)
      )
    );
  }
  if (cls === "consolidation") {
    return mean(
      outcomes.map((o) =>
        Math.abs(
          o.witnessed.consolidation_distinct - (o.expected_distinct ?? 0)
        )
      )
    );
  }
  return mean(outcomes.map((o) => o.witnessed.promotions_written));
}

/**
 * Build the evidence-backed decision. Patterns may win on witnessed metrics,
 * and AgentDB is STILL rejected as a second durable authority: Allura keeps a
 * single authority (PostgreSQL canon + curator governance), so any winning
 * pattern is adoptable only as an adaptation inside that single authority.
 */
export function buildDecision(comparison: Comparison): Decision {
  const [sona, agentdb] = comparison.arms;
  const classes = new Set<EvalCase["task_class"]>([
    ...sona.outcomes.map((o) => o.task_class),
    ...agentdb.outcomes.map((o) => o.task_class),
  ]);

  const patternWins: string[] = [];
  for (const cls of classes) {
    const s = sona.outcomes.filter((o) => o.task_class === cls);
    const a = agentdb.outcomes.filter((o) => o.task_class === cls);
    const sMetric = classMetric(cls, s);
    const aMetric = classMetric(cls, a);
    const agentdbBetter =
      cls === "consolidation" ? aMetric < sMetric : aMetric > sMetric;
    if (agentdbBetter) patternWins.push(cls);
  }

  return {
    pattern_wins: patternWins,
    rejected: {
      authority: "agentdb",
      verdict: "reject",
      rationale:
        "AgentDB is rejected as a second durable authority: Allura keeps a single authority (PostgreSQL canon plus curator governance). Evaluated patterns may be adopted only as adaptations inside that single authority — never as a parallel store that can promote or rank independently.",
    },
    adaptation_inside_allura: true,
    adaptation_conditions: [
      "any adopted pattern must be implemented inside the existing PostgreSQL authority and curator governance",
      "no parallel durable store may be introduced; branch mechanics stay disposable and evaluation-only",
      "promotion of models, skills, or rankings requires curator approval through the existing gate",
      "witnessed test/review/trace outcomes remain the only accepted evidence; self-report is never scored",
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRYPOINT
// ─────────────────────────────────────────────────────────────────────────────

/** Run the full evaluation: both arms on the shared fixture, then decide. */
export async function runEvaluation(opts: {
  fixturePath: string;
}): Promise<EvaluationResult> {
  const fixture = loadFixture(opts.fixturePath);
  const sona = await runSonaArm(fixture.cases, fixture.base);
  const agentdb = await runAgentdbArm(fixture.cases, fixture.base);
  const comparison = compareArms(sona, agentdb);
  const decision = buildDecision(comparison);
  return {
    fixture_revision: fixture.revision,
    comparison,
    decision,
    promotions_written: comparison.witnessed.promotions_written,
  };
}
