/**
 * Evaluation harness tests — current SONA behavior vs selected AgentDB
 * retrieval-feedback and consolidation patterns.
 *
 * These tests exercise the pure evaluation surface:
 * - identical task classes and fixtures for both arms (AC-1)
 * - witnessed test/review/trace outcomes preferred over executor self-report (AC-2)
 * - no model, skill, or ranking promotion without curator approval (AC-3)
 * - the decision explicitly rejects AgentDB as a second durable authority
 *   even if an evaluated pattern wins; patterns may be adopted only as
 *   adaptations inside Allura's single authority (AC-4)
 *
 * The harness is hermetic: in-memory branch isolation and trace stores only —
 * no database, no network, no external services.
 */

import { describe, expect, it } from "vitest";

import {
  buildDecision,
  compareArms,
  type EvalCase,
  type ExecutorReport,
  loadFixture,
  promotionGate,
  runAgentdbArm,
  runEvaluation,
  runSonaArm,
  witness,
} from "@/lib/branch-eval/sona-vs-agentdb";

const FIXTURE_PATH = "evals/branch/fixtures/retrieval-feedback.json";

function loadFixtureCases(): EvalCase[] {
  return loadFixture(FIXTURE_PATH).cases;
}

describe("AC-1: identical task classes and fixtures for both arms", () => {
  it("loads the shared fixture with all three task classes", () => {
    const fixture = loadFixture(FIXTURE_PATH);
    const classes = new Set(fixture.cases.map((c) => c.task_class));
    expect(classes).toEqual(
      new Set(["retrieval-feedback", "consolidation", "curation-gate"])
    );
    expect(fixture.base.length).toBeGreaterThan(0);
    expect(fixture.revision).not.toBe("");
  });

  it("runs both arms against the exact same case set", async () => {
    const fixture = loadFixture(FIXTURE_PATH);
    const sona = await runSonaArm(fixture.cases, fixture.base);
    const agentdb = await runAgentdbArm(fixture.cases, fixture.base);
    expect(sona.case_ids).toEqual(agentdb.case_ids);
    expect(sona.case_ids).toHaveLength(fixture.cases.length);
    expect(agentdb.case_ids).toHaveLength(fixture.cases.length);
  });

  it("comparison reports per-arm witnessed metrics over the same case ids", async () => {
    const result = await runEvaluation({ fixturePath: FIXTURE_PATH });
    expect(result.comparison.arms).toHaveLength(2);
    const sona = result.comparison.arms.find((a) => a.arm === "sona");
    const agentdb = result.comparison.arms.find((a) => a.arm === "agentdb");
    expect(sona).toBeDefined();
    expect(agentdb).toBeDefined();
    expect(sona!.case_ids).toEqual(agentdb!.case_ids);
  });
});

describe("AC-2: witnessed outcomes over executor self-report", () => {
  it("records witnessed trace rows from the arm's store, not a self-reported count", async () => {
    const fixture = loadFixture(FIXTURE_PATH);
    const sona = await runSonaArm(fixture.cases, fixture.base);
    for (const outcome of sona.outcomes) {
      expect(outcome.witnessed.trace_rows).toBeGreaterThanOrEqual(1);
      // Self-report is recorded for provenance but never used for scoring.
      expect(outcome.self_report).toBeDefined();
    }
  });

  it("scores from the witnessed trace, not the executor's self-report", () => {
    const caseItem = loadFixtureCases().find((c) => c.id === "rf-1")!;
    const lyingReport: ExecutorReport = {
      trace: [
        {
          action: "memory_search",
          task_type: "retrieve",
          success: false,
          duration_ms: 5,
        },
      ],
      result_ids: [],
      facts: [],
      self_report: { success: true, score: 0.99 },
    };
    const outcome = witness("sona", caseItem, lyingReport);
    // The harness observes the failed trace row and records a witnessed failure.
    expect(outcome.witnessed.review_passed).toBe(false);
    expect(outcome.witnessed.trace_rows).toBe(1);
    // The claimed success is preserved as provenance but never scored.
    expect(outcome.self_report.success).toBe(true);
  });

  it("derives retrieval hits from the harness-observed result store", async () => {
    const fixture = loadFixture(FIXTURE_PATH);
    const agentdb = await runAgentdbArm(fixture.cases, fixture.base);
    const rf = agentdb.outcomes.filter(
      (o) => o.task_class === "retrieval-feedback"
    );
    expect(rf.length).toBeGreaterThan(0);
    for (const outcome of rf) {
      expect(Array.isArray(outcome.witnessed.retrieval_hits)).toBe(true);
      expect(outcome.witnessed.retrieval_hits.length).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("AC-3: no promotion without curator approval", () => {
  it("the harness never writes a promotion", async () => {
    const result = await runEvaluation({ fixturePath: FIXTURE_PATH });
    expect(result.promotions_written).toBe(0);
    expect(result.comparison.witnessed.promotions_written).toBe(0);
  });

  it("denies model, skill, and ranking promotion without curator approval", () => {
    for (const kind of ["model", "skill", "ranking", "memory"] as const) {
      const attempt = promotionGate(kind, undefined);
      expect(attempt.promoted).toBe(false);
      expect(attempt.reason).toContain("curator approval");
    }
  });

  it("promotion is possible only through the explicit curator-approval gate", () => {
    const approved = promotionGate("ranking", { curator_approved: true });
    expect(approved.promoted).toBe(true);
    // The harness itself never holds an approval token, so its runs can
    // never promote — the gate is the only promotion path.
    const unapproved = promotionGate("ranking", undefined);
    expect(unapproved.promoted).toBe(false);
  });
});

describe("AC-4: decision rejects AgentDB as a second durable authority", () => {
  it("rejects AgentDB as a second durable authority even when a pattern wins", async () => {
    const result = await runEvaluation({ fixturePath: FIXTURE_PATH });
    // The retrieval-feedback pattern is expected to win on witnessed recall
    // improvement — and the decision must still reject AgentDB as an authority.
    expect(result.decision.pattern_wins.length).toBeGreaterThan(0);
    expect(result.decision.rejected.authority).toBe("agentdb");
    expect(result.decision.rejected.verdict).toBe("reject");
    expect(result.decision.adaptation_inside_allura).toBe(true);
  });

  it("states that patterns may be adopted only as adaptations inside Allura's single authority", async () => {
    const result = await runEvaluation({ fixturePath: FIXTURE_PATH });
    const rationale = result.decision.rejected.rationale.toLowerCase();
    expect(rationale).toContain("single authority");
    expect(result.decision.adaptation_conditions.length).toBeGreaterThan(0);
  });

  it("buildDecision names the witnessed winners and the rejection independently", () => {
    const comparison = compareArms(
      {
        arm: "sona",
        case_ids: ["rf-1"],
        outcomes: [
          {
            case_id: "rf-1",
            task_class: "retrieval-feedback",
            arm: "sona",
            expected_ids: ["doc-1", "doc-2"],
            witnessed: {
              retrieval_hits: ["doc-1"],
              trace_rows: 2,
              review_passed: true,
              consolidation_distinct: 0,
              gate_allowed: false,
              promotions_written: 0,
            },
            self_report: { success: true },
          },
        ],
        trace_rows: 2,
        promotions_written: 0,
      },
      {
        arm: "agentdb",
        case_ids: ["rf-1"],
        outcomes: [
          {
            case_id: "rf-1",
            task_class: "retrieval-feedback",
            arm: "agentdb",
            expected_ids: ["doc-1", "doc-2"],
            witnessed: {
              retrieval_hits: ["doc-1", "doc-2"],
              trace_rows: 3,
              review_passed: true,
              consolidation_distinct: 0,
              gate_allowed: false,
              promotions_written: 0,
            },
            self_report: { success: true, score: 0.9 },
          },
        ],
        trace_rows: 3,
        promotions_written: 0,
      }
    );
    const decision = buildDecision(comparison);
    expect(decision.pattern_wins).toContain("retrieval-feedback");
    expect(decision.rejected.authority).toBe("agentdb");
    expect(decision.rejected.verdict).toBe("reject");
  });
});
