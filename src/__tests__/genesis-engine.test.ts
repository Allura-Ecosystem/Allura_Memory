/**
 * @vitest-environment node
 *
 * Genesis Engine — Unit Tests (Story 2.2)
 *
 * Verifies the pure-logic surface of the pattern detector and proposal
 * generator:
 *   - Pattern detection over synthetic trajectories:
 *       * repeated action sequences (3+ identical action patterns)
 *       * high-frequency tasks (10+ same task_type)
 *       * failed-then-succeeded patterns
 *   - Proposal generation routes through controlPlane syscall_mutate (AD-40).
 *   - HITL approve/reject routes through controlPlane syscall_mutate; approve
 *     returns a skill template draft (not auto-deployed).
 *   - group_id validation rejects invalid tenants.
 *
 * The controlPlane syscall_mutate is mocked so no DB is touched — this keeps the
 * tests in the unit lane (no external services). The detector is pure with
 * respect to its inputs, so we call `detectPatterns` directly with a
 * synthetic `DetectionWindow`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock the controlPlane syscall_mutate so we never touch the DB / proof engine ──
const mockMutate = vi.fn();

vi.mock("@/control-plane/syscalls", () => ({
  syscall_mutate: (...args: unknown[]) => mockMutate(...args),
  SyscallContext: {}, // type-only export
}));

vi.mock("@/control-plane/proof", () => ({
  createProof: vi.fn(() => ({ intent: "mutate", subject: "test", actor: "test", claims: {} })),
  verifyProofOrThrow: vi.fn(() => ({
    group_id: "allura-test",
    actor: "test",
    intent: "mutate",
    subject: "test",
    nonce: "n",
    timestamp: 0,
  })),
  getControlPlaneSecretKey: vi.fn(() => "test-secret-key"),
}));

vi.mock("@/control-plane/policy", () => ({
  evaluatePoliciesOrThrow: vi.fn(),
  Policy: {},
  PolicyContext: {},
}));

vi.mock("@/control-plane/target-resolver", () => ({
  resolveTarget: vi.fn(async () => ({ success: true, affected_rows: 1 })),
}));

// ── Import modules under test (after mocks registered) ──────────────────────

import {
  detectPatterns,
  detectRepeatedSequences,
  detectHighFrequencyTasks,
  detectFailedThenSucceeded,
  suggestSkillName,
  DEFAULT_CONFIG,
  type DetectionWindow,
  type DetectedPattern,
  type TrajectoryPoint,
} from "@/lib/genesis/pattern-detector";

import {
  generateProposal,
  generateProposals,
  reviewProposal,
  generateSkillTemplateDraft,
} from "@/lib/genesis/proposal-generator";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTrajectory(
  overrides: Partial<TrajectoryPoint> = {}
): TrajectoryPoint {
  return {
    id: Math.floor(Math.random() * 1_000_000),
    agent_id: "agent-1",
    action: "memory_add",
    task_type: "ingest",
    success: true,
    created_at: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

function buildWindow(
  trajectories: TrajectoryPoint[],
  group_id = "allura-test"
): DetectionWindow {
  return { group_id, trajectories, skillUsage: [] };
}

function resetMutateMock() {
  mockMutate.mockReset();
  mockMutate.mockResolvedValue({
    success: true,
    data: { affected_rows: 1, auditId: "test-audit" },
    auditId: "test-audit",
  });
}

beforeEach(() => {
  resetMutateMock();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN DETECTOR
// ─────────────────────────────────────────────────────────────────────────────

describe("suggestSkillName", () => {
  it("derives a lowercase, hyphenated, tenant-hinted skill name", () => {
    const name = suggestSkillName("task:Memory Add", "allura-acme");
    expect(name).toMatch(/^[a-z0-9-]+$/);
    expect(name).toContain("acme");
    expect(name).toContain("task");
    expect(name).toContain("memory");
    expect(name).toContain("add");
  });

  it("caps length at 64 characters", () => {
    const long = "task:" + "a".repeat(100);
    expect(suggestSkillName(long, "allura-x").length).toBeLessThanOrEqual(64);
  });

  it("strips non-[a-z0-9-] characters", () => {
    const name = suggestSkillName("task:FOO BAR_baz!", "allura-test");
    expect(name).not.toMatch(/[A-Z_!]/);
  });
});

describe("detectRepeatedSequences", () => {
  it("detects a sequence repeated 3+ times by the same agent", () => {
    const sequence = ["memory_search", "memory_add", "memory_search"];
    const points: TrajectoryPoint[] = [];
    // Repeat the sequence 4 times — agent-1
    for (let rep = 0; rep < 4; rep++) {
      for (const action of sequence) {
        points.push(
          makeTrajectory({
            action,
            agent_id: "agent-1",
            created_at: new Date(Date.now() + rep * 10 + sequence.indexOf(action)),
          })
        );
      }
    }
    const window = buildWindow(points);
    const patterns = detectRepeatedSequences(window, DEFAULT_CONFIG);
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    const top = patterns[0];
    expect(top.pattern_type).toBe("repeated_action_sequence");
    expect(top.frequency).toBeGreaterThanOrEqual(3);
    // suggested_skill is derived from the pattern key, not the agent_id
    expect(top.suggested_skill).toMatch(/^[a-z0-9-]+$/);
    expect(top.confidence).toBeGreaterThan(0);
    expect(top.confidence).toBeLessThanOrEqual(1);
  });

  it("does not detect when sequence appears fewer than 3 times", () => {
    const points: TrajectoryPoint[] = [
      makeTrajectory({ action: "memory_add", agent_id: "agent-1" }),
      makeTrajectory({ action: "memory_search", agent_id: "agent-1" }),
      makeTrajectory({ action: "memory_add", agent_id: "agent-1" }),
    ];
    const window = buildWindow(points);
    const patterns = detectRepeatedSequences(window, DEFAULT_CONFIG);
    // Only 2 occurrences of "memory_add → memory_search" (sequence_length=3 has no complete reps)
    // With 3 points and sequence_length=3, there's exactly 1 sequence — frequency 1 < 3.
    expect(patterns).toHaveLength(0);
  });

  it("respects custom sequence_length", () => {
    const points: TrajectoryPoint[] = [];
    const sequence = ["a", "b"];
    for (let rep = 0; rep < 5; rep++) {
      for (const action of sequence) {
        points.push(makeTrajectory({ action, agent_id: "agent-x" }));
      }
    }
    const window = buildWindow(points);
    const cfg = { ...DEFAULT_CONFIG, sequence_length: 2 };
    const patterns = detectRepeatedSequences(window, cfg);
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    expect(patterns[0].frequency).toBeGreaterThanOrEqual(3);
  });
});

describe("detectHighFrequencyTasks", () => {
  it("detects a task_type with 10+ occurrences", () => {
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i < 12; i++) {
      points.push(makeTrajectory({ task_type: "ingest", agent_id: `agent-${i}` }));
    }
    const window = buildWindow(points);
    const patterns = detectHighFrequencyTasks(window, DEFAULT_CONFIG);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].pattern_type).toBe("high_frequency_task");
    expect(patterns[0].frequency).toBe(12);
    expect(patterns[0].evidence?.task_type).toBe("ingest");
  });

  it("does not detect when frequency < threshold", () => {
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i < 9; i++) {
      points.push(makeTrajectory({ task_type: "ingest" }));
    }
    const window = buildWindow(points);
    const patterns = detectHighFrequencyTasks(window, DEFAULT_CONFIG);
    expect(patterns).toHaveLength(0);
  });

  it("respects custom min_task_frequency", () => {
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i < 5; i++) {
      points.push(makeTrajectory({ task_type: "curate" }));
    }
    const window = buildWindow(points);
    const cfg = { ...DEFAULT_CONFIG, min_task_frequency: 5 };
    const patterns = detectHighFrequencyTasks(window, cfg);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].frequency).toBe(5);
  });
});

describe("detectFailedThenSucceeded", () => {
  it("detects a task_type that fails then succeeds", () => {
    const points: TrajectoryPoint[] = [
      makeTrajectory({ task_type: "ingest", success: false, agent_id: "a" }),
      makeTrajectory({ task_type: "ingest", success: false, agent_id: "a" }),
      makeTrajectory({ task_type: "ingest", success: true, agent_id: "a" }),
      makeTrajectory({ task_type: "ingest", success: true, agent_id: "a" }),
    ];
    const window = buildWindow(points);
    const patterns = detectFailedThenSucceeded(window, DEFAULT_CONFIG);
    expect(patterns).toHaveLength(1);
    const p = patterns[0];
    expect(p.pattern_type).toBe("failed_then_succeeded");
    expect(p.evidence?.failures).toBe(2);
    expect(p.evidence?.recoveries).toBe(2);
    expect(p.confidence).toBeGreaterThan(0);
  });

  it("does not detect when there are no failures", () => {
    const points: TrajectoryPoint[] = [
      makeTrajectory({ task_type: "ingest", success: true }),
      makeTrajectory({ task_type: "ingest", success: true }),
    ];
    const window = buildWindow(points);
    const patterns = detectFailedThenSucceeded(window, DEFAULT_CONFIG);
    expect(patterns).toHaveLength(0);
  });

  it("does not detect when there are only failures (no recovery)", () => {
    const points: TrajectoryPoint[] = [
      makeTrajectory({ task_type: "ingest", success: false }),
      makeTrajectory({ task_type: "ingest", success: false }),
    ];
    const window = buildWindow(points);
    const patterns = detectFailedThenSucceeded(window, DEFAULT_CONFIG);
    expect(patterns).toHaveLength(0);
  });
});

describe("detectPatterns (orchestration)", () => {
  it("runs all three detectors and merges results sorted by confidence desc", () => {
    // Build a window that triggers both high-frequency and failed-then-succeeded.
    const points: TrajectoryPoint[] = [];
    // 12 successful ingest (high-frequency)
    for (let i = 0; i < 12; i++) {
      points.push(makeTrajectory({ task_type: "ingest", success: true }));
    }
    // 2 failed then 2 succeeded (failed-then-succeeded)
    points.push(makeTrajectory({ task_type: "retrieve", success: false }));
    points.push(makeTrajectory({ task_type: "retrieve", success: false }));
    points.push(makeTrajectory({ task_type: "retrieve", success: true }));
    points.push(makeTrajectory({ task_type: "retrieve", success: true }));

    const window = buildWindow(points);
    const patterns = detectPatterns(window);
    expect(patterns.length).toBeGreaterThanOrEqual(2);
    // Verify sorted by confidence desc
    for (let i = 1; i < patterns.length; i++) {
      expect(patterns[i - 1].confidence).toBeGreaterThanOrEqual(patterns[i].confidence);
    }
  });

  it("deduplicates by (pattern_type, suggested_skill)", () => {
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i < 15; i++) {
      points.push(makeTrajectory({ task_type: "ingest", agent_id: "same-agent" }));
    }
    const window = buildWindow(points);
    const patterns = detectPatterns(window);
    // high_frequency_task should appear once even though detectHighFrequencyTasks
    // would only emit one for the same task_type anyway.
    const hf = patterns.filter((p) => p.pattern_type === "high_frequency_task");
    expect(hf).toHaveLength(1);
  });

  it("returns empty array when window has no trajectories", () => {
    const window = buildWindow([]);
    expect(detectPatterns(window)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROPOSAL GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

describe("generateProposal", () => {
  it("routes the insert through syscall_mutate with target pg:pattern_proposals", async () => {
    const pattern: DetectedPattern = {
      pattern_type: "high_frequency_task",
      pattern_description: "Task type 'ingest' was performed 12 times.",
      frequency: 12,
      suggested_skill: "acme-task-ingest",
      confidence: 0.7,
    };
    const result = await generateProposal("allura-test", pattern);
    expect(result.recorded).toBe(true);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [mutation, _context] = mockMutate.mock.calls[0] as [
      { type: string; target: string; data: Record<string, unknown> },
      unknown,
    ];
    expect(mutation.type).toBe("insert");
    expect(mutation.target).toBe("pg:pattern_proposals");
    expect(mutation.data.group_id).toBe("allura-test");
    expect(mutation.data.pattern_type).toBe("high_frequency_task");
    expect(mutation.data.frequency).toBe(12);
    expect(mutation.data.status).toBe("proposed");
  });

  it("rejects an invalid group_id without calling the controlPlane", async () => {
    const pattern: DetectedPattern = {
      pattern_type: "high_frequency_task",
      pattern_description: "x",
      frequency: 1,
      suggested_skill: "x",
      confidence: 0.5,
    };
    const result = await generateProposal("invalid-group", pattern);
    expect(result.recorded).toBe(false);
    // group_id validation rejects anything not matching ^allura-[a-z0-9-]+$
    expect(result.error).toMatch(/group_id/i);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("clamps confidence to [0.0, 1.0]", async () => {
    const pattern: DetectedPattern = {
      pattern_type: "high_frequency_task",
      pattern_description: "x",
      frequency: 1,
      suggested_skill: "x",
      confidence: 5.0,
    };
    await generateProposal("allura-test", pattern);
    const [mutation] = mockMutate.mock.calls[0] as [
      { data: Record<string, unknown> },
      unknown,
    ];
    expect(mutation.data.confidence).toBeLessThanOrEqual(1.0);
    expect(mutation.data.confidence).toBeGreaterThanOrEqual(0.0);
  });

  it("returns a failed result when the controlPlane mutate fails", async () => {
    mockMutate.mockResolvedValueOnce({ success: false, error: "policy denied" });
    const pattern: DetectedPattern = {
      pattern_type: "high_frequency_task",
      pattern_description: "x",
      frequency: 1,
      suggested_skill: "x",
      confidence: 0.5,
    };
    const result = await generateProposal("allura-test", pattern);
    expect(result.recorded).toBe(false);
    expect(result.error).toBe("policy denied");
  });
});

describe("generateProposals (batch)", () => {
  it("records each pattern and returns aggregate counts", async () => {
    const patterns: DetectedPattern[] = [
      {
        pattern_type: "high_frequency_task",
        pattern_description: "p1",
        frequency: 10,
        suggested_skill: "s1",
        confidence: 0.6,
      },
      {
        pattern_type: "repeated_action_sequence",
        pattern_description: "p2",
        frequency: 3,
        suggested_skill: "s2",
        confidence: 0.4,
      },
    ];
    const result = await generateProposals("allura-test", patterns);
    expect(result.total).toBe(2);
    expect(result.recorded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(mockMutate).toHaveBeenCalledTimes(2);
  });

  it("captures per-pattern failures without aborting the batch", async () => {
    mockMutate
      .mockResolvedValueOnce({ success: true, data: { affected_rows: 1 } })
      .mockResolvedValueOnce({ success: false, error: "boom" });
    const patterns: DetectedPattern[] = [
      {
        pattern_type: "high_frequency_task",
        pattern_description: "ok",
        frequency: 10,
        suggested_skill: "ok-skill",
        confidence: 0.5,
      },
      {
        pattern_type: "high_frequency_task",
        pattern_description: "bad",
        frequency: 10,
        suggested_skill: "bad-skill",
        confidence: 0.5,
      },
    ];
    const result = await generateProposals("allura-test", patterns);
    expect(result.recorded).toBe(1);
    expect(result.failed).toBe(1);
  });
});

describe("reviewProposal", () => {
  it("routes approve through syscall_mutate with type=update and returns a skill template", async () => {
    const result = await reviewProposal("allura-test", 42, "approved");
    expect(result.updated).toBe(true);
    expect(result.skill_template).toBeDefined();
    expect(result.skill_template).toContain("Skill Template Draft");
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [mutation, _ctx] = mockMutate.mock.calls[0] as [
      { type: string; target: string; data: Record<string, unknown>; query: Record<string, unknown> },
      unknown,
    ];
    expect(mutation.type).toBe("update");
    expect(mutation.target).toBe("pg:pattern_proposals");
    expect(mutation.data.status).toBe("approved");
    expect(mutation.query.id).toBe(42);
  });

  it("routes reject through syscall_mutate with type=update and no skill template", async () => {
    const result = await reviewProposal("allura-test", 7, "rejected");
    expect(result.updated).toBe(true);
    expect(result.skill_template).toBeUndefined();
    const [mutation] = mockMutate.mock.calls[0] as [
      { data: Record<string, unknown> },
      unknown,
    ];
    expect(mutation.data.status).toBe("rejected");
  });

  it("rejects an invalid group_id", async () => {
    const result = await reviewProposal("BAD", 1, "approved");
    expect(result.updated).toBe(false);
    expect(result.error).toMatch(/group_id/i);
  });

  it("returns updated=false on controlPlane failure", async () => {
    mockMutate.mockResolvedValueOnce({ success: false, error: "no row" });
    const result = await reviewProposal("allura-test", 99, "rejected");
    expect(result.updated).toBe(false);
    expect(result.error).toBe("no row");
  });
});

describe("generateSkillTemplateDraft", () => {
  it("produces a non-auto-deployed markdown draft with provenance", () => {
    const draft = generateSkillTemplateDraft("allura-acme", 123);
    expect(draft).toContain("Skill Template Draft");
    expect(draft).toContain("DRAFT");
    expect(draft).toContain("allura-acme");
    expect(draft).toContain("123");
    // Should contain curated section headers, not auto-deployed content.
    expect(draft).toContain("## Triggers");
    expect(draft).toContain("## Steps");
    expect(draft).toContain("## Pitfalls");
  });
});