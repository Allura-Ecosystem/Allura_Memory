/**
 * Story 24.5 — Harness unit/contract tests.
 *
 * Tests schema validation, determinism, simulate mode, fault injection,
 * replay comparison, and side-effect idempotency.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SeededRandom, VirtualClock } from "../determinism";
import { buildReceipt, compareReceipts } from "../receipt";
import { runScenario } from "../runner";
import { loadScenario, scenarioDigest, validateScenario } from "../scenario";
import type { ScenarioFixture } from "../scenario";
import { ToolSimulator } from "../tool-simulator";

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
    const tampered = { ...scenario, process_definition: { ...scenario.process_definition, revision: "r999" } };
    await expect(runScenario(tampered, { mode: "replay", priorReceipt: run1.receipt })).rejects.toThrow(/Replay mismatch.*revision/);
  });
});

describe("Side-effect idempotency (AC-8)", () => {
  it("side-effect keys are unique per step", async () => {
    const scenario = loadJson("governed-memory-success.yaml.json");
    const result = await runScenario(scenario, { mode: "simulate" });
    const keys = result.receipt.side_effect_keys;
    expect(new Set(keys).size).toBe(keys.length);
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