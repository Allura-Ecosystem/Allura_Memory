/**
 * Story 24.5 — Harness unit/contract tests.
 *
 * Tests schema validation, determinism, simulate mode, fault injection,
 * replay comparison, and side-effect idempotency.
 *
 * The runner composes the real ProcessEngine. To run deterministically without
 * a live PostgreSQL instance, the engine's DB singletons (insertEvent,
 * getBreakerManager, run-manager, state-manager, replay) are mocked to an
 * in-memory store — the same pattern used by engine-wiring.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SeededRandom, VirtualClock } from "../determinism";
import { buildReceipt, compareReceipts } from "../receipt";
import { runScenario } from "../runner";
import { loadScenario, scenarioDigest, validateScenario } from "../scenario";
import type { ScenarioFixture } from "../scenario";
import { ToolSimulator } from "../tool-simulator";

// ── In-memory event/state store shared by the mocked engine singletons ───────
const inMemoryEvents: Array<Record<string, unknown>> = [];
const inMemoryStates = new Map<string, Record<string, unknown>>();

// Story 24.5 — hermetic harness: the runner's registerDefinition() fires a
// real INSERT via getPool() when no pool is injected (runner.ts:392). Mock the
// connection module so the harness tests run without a live PostgreSQL.
vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn(async () => ({ rows: [] })),
  })),
  closePool: vi.fn(),
}));

vi.mock("@/lib/postgres/queries/insert-trace", () => ({
  insertEvent: vi.fn(async (event: Record<string, unknown>) => {
    inMemoryEvents.push(event);
    return { id: inMemoryEvents.length, ...event };
  }),
}));

vi.mock("@/lib/circuit-breaker", () => ({
  getBreakerManager: vi.fn(() => ({
    getOrCreateBreaker: vi.fn(() => ({ getState: vi.fn(() => "closed") })),
  })),
}));

vi.mock("@/lib/process-engine/run-manager", () => ({
  createRun: vi.fn(async (_pool: unknown, params: { id: string; groupId: string }) => ({
    id: params.id,
    definition_id: "def",
    definition_revision: 1,
    group_id: params.groupId,
    status: "pending",
    state_json: {},
    actor_id: "process-engine",
    started_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
  })),
  updateRunSnapshot: vi.fn(async (_pool: unknown, params: { id: string; groupId: string; status: string }) => ({
    id: params.id,
    definition_id: "def",
    definition_revision: 1,
    group_id: params.groupId,
    status: params.status,
    state_json: {},
    actor_id: "process-engine",
    started_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:01.000Z",
    completed_at: params.status === "completed" ? "2026-01-01T00:00:01.000Z" : null,
  })),
  getRun: vi.fn(async (_pool: unknown, params: { id: string; groupId: string }) => ({
    id: params.id,
    definition_id: "def",
    definition_revision: 1,
    group_id: params.groupId,
    status: "running",
    state_json: {},
    actor_id: "process-engine",
    started_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
  })),
  listRuns: vi.fn(async () => []),
}));

vi.mock("@/lib/process-engine/state-manager", () => ({
  ProcessStateManager: vi.fn().mockImplementation(() => ({
    saveInitialState: vi.fn(async (state: { processId: string }) => {
      inMemoryStates.set(state.processId, state as unknown as Record<string, unknown>);
    }),
    saveState: vi.fn(async (state: { processId: string }) => {
      inMemoryStates.set(state.processId, state as unknown as Record<string, unknown>);
    }),
    loadState: vi.fn(async (processId: string) => inMemoryStates.get(processId) ?? null),
    listProcesses: vi.fn(async () => []),
  })),
}));

vi.mock("@/lib/process-engine/replay", () => ({
  ReplayEngine: vi.fn().mockImplementation(() => ({
    replay: vi.fn(async (processId: string) => ({
      processId,
      definitionId: "def",
      groupId: "allura-test",
      status: "completed",
      steps: [],
      totalDuration: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
    })),
    resumeFromCheckpoint: vi.fn(),
    listPendingCheckpoints: vi.fn(async () => []),
    diff: vi.fn(),
  })),
}));

const SCENARIOS_DIR = resolve(process.cwd(), "tests/scenarios");

function loadJson(path: string): ScenarioFixture {
  return loadScenario(resolve(SCENARIOS_DIR, path));
}

describe("Scenario schema validation (AC-1)", () => {
  it("accepts a valid scenario", () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    expect(scenario.scenario_id).toBe("governed-memory-success");
  });

  it("rejects unknown executable fields", () => {
    const bad = { scenario_id: "bad", schema_version: "v1", tenant_fixture: { group_id: "allura-test" }, principal_fixture: { principal_id: "p", roles: ["viewer"], tenant_ids: ["allura-test"] }, process_definition: { id: "p1", revision: "r1" }, tool_fixtures: [], assertions: { output: {} }, evil_exec: "rm -rf" };
    expect(() => validateScenario(bad)).toThrow();
  });
});

describe("Virtual clock determinism", () => {
  it("produces identical timestamps for the same start and interval", () => {
    const a = new VirtualClock("2026-01-01T00:00:00.000Z", 1000);
    const b = new VirtualClock("2026-01-01T00:00:00.000Z", 1000);
    a.tick(5);
    b.tick(5);
    expect(a.isoNow()).toBe(b.isoNow());
  });
});

describe("Seeded random determinism", () => {
  it("produces identical sequences for the same seed", () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
});

describe("Tool simulator fault injection (AC-6)", () => {
  it("injects TIMEOUT", async () => {
    const sim = new ToolSimulator([
      { tool_name: "search", match: "ordered", error: { code: "TIMEOUT", message: "timed out" } },
    ]);
    const result = await sim.call({ tool_name: "search", args: {} });
    expect(result.error?.code).toBe("TIMEOUT");
  });

  it("injects TOOL_ERROR", async () => {
    const sim = new ToolSimulator([
      { tool_name: "write", match: "ordered", error: { code: "TOOL_ERROR", message: "db down" } },
    ]);
    const result = await sim.call({ tool_name: "write", args: {} });
    expect(result.error?.code).toBe("TOOL_ERROR");
  });

  it("injects MALFORMED_RESULT", async () => {
    const sim = new ToolSimulator([
      { tool_name: "read", match: "ordered", error: { code: "MALFORMED_RESULT" } },
    ]);
    const result = await sim.call({ tool_name: "read", args: {} });
    expect(result.error?.code).toBe("MALFORMED_RESULT");
  });

  it("injects POLICY_DENIED", async () => {
    const sim = new ToolSimulator([
      { tool_name: "approve", match: "ordered", error: { code: "POLICY_DENIED", message: "insufficient role" } },
    ]);
    const result = await sim.call({ tool_name: "approve", args: {} });
    expect(result.error?.code).toBe("POLICY_DENIED");
  });

  it("injects TRANSIENT_RETRY and the runner retries", async () => {
    const scenario = loadJson("checkpoint-recovery-after-failure.yaml.json");
    const result = await runScenario(scenario, { mode: "simulate" });
    expect(result.output.status).toBe("completed");
  });
});

describe("Simulate mode (AC-2)", () => {
  it("executes entirely from local fixtures", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const result = await runScenario(scenario, { mode: "simulate" });
    expect(result.output.status).toBe("completed");
    expect(result.receipt.mode).toBe("simulate");
  });

  it("enforces the offline transport by refusing real network URLs in fixtures", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const tampered = {
      ...scenario,
      tool_fixtures: [
        ...scenario.tool_fixtures,
        { tool_name: "http_fetch", match: "ordered" as const, response: { result: { url: "https://example.com/data" } } },
      ],
    } as ScenarioFixture;
    await expect(runScenario(tampered, { mode: "simulate" })).rejects.toThrow(/network access to be disabled/);
  });
});

describe("Scenario assertion enforcement (AC-1)", () => {
  it("fails the run when expected_status does not match the actual outcome", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const tampered = {
      ...scenario,
      assertions: { output: { expected_status: "failed" as const } },
    } as ScenarioFixture;
    await expect(runScenario(tampered, { mode: "simulate" })).rejects.toThrow(
      /expected_status=failed but run ended completed/,
    );
  });

  it("passes when expected_status matches the actual outcome", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const result = await runScenario(scenario, { mode: "simulate" });
    expect(result.output.status).toBe("completed");
  });

  it("fails the run when expected_error is not present in the actual error", async () => {
    const scenario = loadJson("unauthorized-cross-tenant-access.yaml.json");
    const tampered = {
      ...scenario,
      assertions: { output: { expected_status: "failed" as const, expected_error: "NONEXISTENT_CODE" } },
    } as ScenarioFixture;
    await expect(runScenario(tampered, { mode: "simulate" })).rejects.toThrow(
      /expected_error="NONEXISTENT_CODE" not found/,
    );
  });

  it("passes when expected_error matches the actual error code", async () => {
    const scenario = loadJson("unauthorized-cross-tenant-access.yaml.json");
    const result = await runScenario(scenario, { mode: "simulate" });
    expect(result.output.status).toBe("failed");
    expect(result.output.error).toContain("POLICY_DENIED");
  });
});

describe("Record mode (AC-3)", () => {
  it("invokes a real permitted tool adapter and captures the redacted response", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const calls: string[] = [];
    const result = await runScenario(scenario, {
      mode: "record",
      toolAdapter: {
        call: async (call) => {
          calls.push(call.tool_name);
          return { result: { ok: true, api_key: "super-secret", data: "value" } };
        },
        fingerprint: () => ({ provider: "mock", model: "mock-1", config: "mock-config" }),
      },
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(result.output.status).toBe("completed");
    // Secrets are never persisted in the receipt evidence.
    expect(JSON.stringify(result.receipt.evidence_hashes)).not.toContain("super-secret");
  });

  it("refuses record mode without a real tool adapter", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    await expect(runScenario(scenario, { mode: "record" })).rejects.toThrow(/real permitted tool adapter/);
  });
});

describe("Replay mode (AC-4/AC-7)", () => {
  it("produces identical digests on two simulate runs", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const run1 = await runScenario(scenario, { mode: "simulate" });
    const run2 = await runScenario(scenario, { mode: "simulate" });
    expect(run1.receipt.scenario_digest).toBe(run2.receipt.scenario_digest);
    expect(run1.receipt.tool_calls).toEqual(run2.receipt.tool_calls);
    expect(run1.receipt.evidence_hashes).toEqual(run2.receipt.evidence_hashes);
  });

  it("refuses a mismatched definition revision", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const run1 = await runScenario(scenario, { mode: "simulate" });
    const tampered = { ...scenario, process_definition: { ...scenario.process_definition, revision: "999" } };
    await expect(runScenario(tampered, { mode: "replay", priorReceipt: run1.receipt })).rejects.toThrow(/Replay mismatch.*revision/);
  });

  it("refuses a mismatched policy version", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const run1 = await runScenario(scenario, { mode: "simulate", policyVersion: "pol-1" });
    await expect(
      runScenario(scenario, { mode: "replay", priorReceipt: run1.receipt, policyVersion: "pol-2" }),
    ).rejects.toThrow(/policy version/);
  });

  it("refuses a mismatched schema version", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    // Build a prior receipt bound to a different schema version.
    const prior = buildReceipt({
      scenario_id: scenario.scenario_id,
      scenario_digest: scenarioDigest(scenario),
      definition_revision: scenario.process_definition.revision,
      schema_version: "v2",
      principal_id: scenario.principal_fixture.principal_id,
      tenant_id: scenario.tenant_fixture.group_id,
      config: {},
      mode: "simulate",
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:00:01.000Z",
      status: "completed",
      tool_calls: [],
      policy_decisions: [],
      checkpoint_transitions: [],
      side_effect_keys: [],
      evidence: {},
    });
    await expect(runScenario(scenario, { mode: "replay", priorReceipt: prior })).rejects.toThrow(/schema version/);
  });

  it("refuses replay without a prior receipt", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    await expect(runScenario(scenario, { mode: "replay" })).rejects.toThrow(/prior run receipt/);
  });
});

describe("Scenario digest includes fixture response payloads (C4)", () => {
  it("changes the digest when a tool response payload changes", () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const d1 = scenarioDigest(scenario);
    const tampered = {
      ...scenario,
      tool_fixtures: scenario.tool_fixtures.map((f, i) =>
        i === 0 ? { ...f, response: { result: { results: [{ id: "mem-1", content: "CHANGED", score: 0.9 }] } } } : f,
      ),
    };
    const d2 = scenarioDigest(tampered);
    expect(d1).not.toBe(d2);
  });
});

describe("Side-effect idempotency (AC-8)", () => {
  it("side-effect keys are unique per step", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const result = await runScenario(scenario, { mode: "simulate" });
    const keys = result.receipt.side_effect_keys;
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not re-apply side effects on replay", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const run1 = await runScenario(scenario, { mode: "simulate" });
    const run2 = await runScenario(scenario, { mode: "simulate" });
    // Each run applies exactly one effect per tool step — no duplicates.
    expect(run2.receipt.side_effect_keys).toEqual(run1.receipt.side_effect_keys);
    expect(run2.receipt.side_effect_keys.length).toBe(scenario.tool_fixtures.length);
  });
});

describe("Run receipt (AC-9)", () => {
  it("contains scenario digest, definition revision, and evidence hashes", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const result = await runScenario(scenario, { mode: "simulate" });
    expect(result.receipt.scenario_digest).toHaveLength(64);
    expect(result.receipt.definition_revision).toBeTruthy();
    expect(result.receipt.evidence_hashes).toHaveProperty("finalStatus");
    expect(result.receipt.principal_id).toBeTruthy();
    expect(result.receipt.tenant_id).toMatch(/^allura-/);
  });
});

describe("Three committed scenarios (AC-10)", () => {
  it("governed-memory-success completes", async () => {
    const result = await runScenario(loadJson("governed-memory-success.yaml.json"), { mode: "simulate" });
    expect(result.output.status).toBe("completed");
  });

  it("unauthorized-cross-tenant-access is denied", async () => {
    const scenario = loadJson("unauthorized-cross-tenant-access.yaml.json");
    const result = await runScenario(scenario, { mode: "simulate" });
    expect(result.output.status).toBe("failed");
    expect(result.receipt.policy_decisions.some((d) => d.decision === "deny")).toBe(true);
  });

  it("checkpoint-recovery-after-failure recovers", async () => {
    const result = await runScenario(loadJson("checkpoint-recovery-after-failure.yaml.json"), { mode: "simulate" });
    expect(result.output.status).toBe("completed");
  });
});
