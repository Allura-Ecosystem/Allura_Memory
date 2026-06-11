/**
 * DAGResolver Tests — Story 12.6
 *
 * Covers: linear chains, diamonds, fully independent steps, cycle detection,
 * self-references, missing references, complex mixed graphs, and empty input.
 */

import { describe, expect, it } from "vitest"
import { DAGResolver } from "./dag"
import type { StepDefinition } from "./types"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStep(id: string, dependsOn?: string[]): StepDefinition {
  return { id, name: id, type: "step", dependsOn }
}

// ── topoSort ──────────────────────────────────────────────────────────────────

describe("DAGResolver.topoSort", () => {
  it("linear chain A→B→C gives [[A],[B],[C]]", () => {
    const steps = [
      makeStep("A"),
      makeStep("B", ["A"]),
      makeStep("C", ["B"]),
    ]
    const order = DAGResolver.topoSort(steps)
    expect(order).toEqual([["A"], ["B"], ["C"]])
  })

  it("diamond A→C, B→C gives [[A,B],[C]]", () => {
    const steps = [
      makeStep("A"),
      makeStep("B"),
      makeStep("C", ["A", "B"]),
    ]
    const order = DAGResolver.topoSort(steps)
    expect(order).toEqual([["A", "B"], ["C"]])
  })

  it("fully independent A,B,C gives [[A,B,C]]", () => {
    const steps = [makeStep("A"), makeStep("B"), makeStep("C")]
    const order = DAGResolver.topoSort(steps)
    expect(order).toEqual([["A", "B", "C"]])
  })

  it("single step gives [[A]]", () => {
    expect(DAGResolver.topoSort([makeStep("A")])).toEqual([["A"]])
  })

  it("empty steps returns []", () => {
    expect(DAGResolver.topoSort([])).toEqual([])
  })

  it("complex graph: mix of parallel and sequential", () => {
    // A, B independent
    // C depends on A
    // D depends on A and B
    // E depends on C and D
    const steps = [
      makeStep("A"),
      makeStep("B"),
      makeStep("C", ["A"]),
      makeStep("D", ["A", "B"]),
      makeStep("E", ["C", "D"]),
    ]
    const order = DAGResolver.topoSort(steps)
    // Groups must be in correct dependency order
    expect(order[0]).toEqual(["A", "B"])
    expect(order[1]).toEqual(["C", "D"])
    expect(order[2]).toEqual(["E"])
  })

  it("two independent chains execute in parallel within their levels", () => {
    // Chain 1: A → C
    // Chain 2: B → D
    const steps = [
      makeStep("A"),
      makeStep("B"),
      makeStep("C", ["A"]),
      makeStep("D", ["B"]),
    ]
    const order = DAGResolver.topoSort(steps)
    expect(order[0]).toEqual(["A", "B"])
    expect(order[1]).toEqual(["C", "D"])
  })
})

// ── detectCycles ──────────────────────────────────────────────────────────────

describe("DAGResolver.detectCycles", () => {
  it("returns empty array for acyclic graph", () => {
    const steps = [makeStep("A"), makeStep("B", ["A"]), makeStep("C", ["B"])]
    expect(DAGResolver.detectCycles(steps)).toEqual([])
  })

  it("detects simple cycle A→B→A", () => {
    const steps = [makeStep("A", ["B"]), makeStep("B", ["A"])]
    const cycles = DAGResolver.detectCycles(steps)
    expect(cycles.length).toBeGreaterThan(0)
    // The cycle description must mention both A and B
    expect(cycles[0]).toMatch(/A/)
    expect(cycles[0]).toMatch(/B/)
  })

  it("detects three-node cycle A→B→C→A", () => {
    const steps = [
      makeStep("A", ["C"]),
      makeStep("B", ["A"]),
      makeStep("C", ["B"]),
    ]
    const cycles = DAGResolver.detectCycles(steps)
    expect(cycles.length).toBeGreaterThan(0)
  })

  it("ignores self-references (handled separately in validate)", () => {
    // A depends on itself — the self-reference is filtered out in detectCycles
    // because DAGResolver filters non-existent deps; A does exist so we
    // should still detect it as a cycle via DFS
    const steps = [makeStep("A", ["A"])]
    const cycles = DAGResolver.detectCycles(steps)
    expect(cycles.length).toBeGreaterThan(0)
  })

  it("returns empty for fully independent steps", () => {
    const steps = [makeStep("X"), makeStep("Y"), makeStep("Z")]
    expect(DAGResolver.detectCycles(steps)).toEqual([])
  })
})

// ── validate ──────────────────────────────────────────────────────────────────

describe("DAGResolver.validate", () => {
  it("returns valid for a clean acyclic graph with execution order", () => {
    const steps = [
      makeStep("A"),
      makeStep("B", ["A"]),
      makeStep("C", ["A"]),
      makeStep("D", ["B", "C"]),
    ]
    const result = DAGResolver.validate(steps)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    // A must come before B, C; B and C before D
    expect(result.executionOrder[0]).toContain("A")
    expect(result.executionOrder[result.executionOrder.length - 1]).toContain("D")
  })

  it("returns invalid for cycle A→B→A", () => {
    const steps = [makeStep("A", ["B"]), makeStep("B", ["A"])]
    const result = DAGResolver.validate(steps)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.executionOrder).toEqual([])
  })

  it("returns invalid for self-reference A→A", () => {
    const steps = [makeStep("A", ["A"])]
    const result = DAGResolver.validate(steps)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("itself"))).toBe(true)
    expect(result.executionOrder).toEqual([])
  })

  it("returns invalid for missing reference A→Z (Z doesn't exist)", () => {
    const steps = [makeStep("A", ["Z"])]
    const result = DAGResolver.validate(steps)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('"Z"') || e.includes("Z"))).toBe(true)
    expect(result.executionOrder).toEqual([])
  })

  it("returns valid with empty execution order for empty steps", () => {
    const result = DAGResolver.validate([])
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.executionOrder).toEqual([])
  })

  it("returns valid for steps with no dependsOn field", () => {
    // dependsOn is optional in StepDefinition — omitting it should treat as []
    const steps: StepDefinition[] = [
      { id: "A", name: "Step A", type: "step" },
      { id: "B", name: "Step B", type: "step" },
    ]
    const result = DAGResolver.validate(steps)
    expect(result.valid).toBe(true)
    expect(result.executionOrder).toEqual([["A", "B"]])
  })

  it("reports multiple errors when multiple issues exist", () => {
    const steps = [
      makeStep("A", ["A"]),    // self-reference
      makeStep("B", ["Z"]),    // missing reference
    ]
    const result = DAGResolver.validate(steps)
    expect(result.valid).toBe(false)
    // Should have at least one error for self-ref and one for missing ref
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })

  it("correctly groups a diamond DAG: A→C, B→C", () => {
    const steps = [makeStep("A"), makeStep("B"), makeStep("C", ["A", "B"])]
    const result = DAGResolver.validate(steps)
    expect(result.valid).toBe(true)
    expect(result.executionOrder).toEqual([["A", "B"], ["C"]])
  })

  it("correctly handles checkpoint and gate step types in the graph", () => {
    const steps: StepDefinition[] = [
      { id: "fetch", name: "Fetch Data", type: "step" },
      { id: "gate-validate", name: "Validate Gate", type: "gate", dependsOn: ["fetch"] },
      {
        id: "checkpoint-approve",
        name: "Approval Checkpoint",
        type: "checkpoint",
        dependsOn: ["gate-validate"],
      },
      { id: "write", name: "Write Result", type: "step", dependsOn: ["checkpoint-approve"] },
    ]
    const result = DAGResolver.validate(steps)
    expect(result.valid).toBe(true)
    expect(result.executionOrder).toEqual([
      ["fetch"],
      ["gate-validate"],
      ["checkpoint-approve"],
      ["write"],
    ])
  })
})
