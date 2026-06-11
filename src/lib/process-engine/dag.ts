/**
 * Process Engine — DAG Dependency Resolver
 * Story 12.6: DAG Dependency Resolver for Allura Memory
 *
 * Validates a process definition's dependency graph and produces parallel
 * execution groups via topological sort. Enables runParallel() in engine.ts.
 *
 * Checks:
 *   - Self-references (step depends on itself)
 *   - Cycles (DFS coloring: white/gray/black)
 *   - Missing step references (dependsOn references a step ID that doesn't exist)
 *
 * Execution order is returned as groups — each inner array contains step IDs
 * that can execute in parallel (all their dependencies are in prior groups).
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-engine/dag is server-side only")
}

import type { StepDefinition } from "./types"

// ── Public Types ──────────────────────────────────────────────────────────────

export interface DAGNode {
  id: string
  dependsOn: string[]
}

export interface DAGValidationResult {
  valid: boolean
  /** Cycle descriptions, missing refs, self-reference errors */
  errors: string[]
  /** Groups of parallel steps in execution order. Empty when invalid. */
  executionOrder: string[][]
}

// ── Internal DFS State ────────────────────────────────────────────────────────

type Color = "white" | "gray" | "black"

// ── DAGResolver ───────────────────────────────────────────────────────────────

export class DAGResolver {
  /**
   * Validate a process definition's dependency graph.
   *
   * Checks for: cycles, missing step references, self-references.
   * Returns execution order as groups of parallel steps.
   *
   * @example
   * const result = DAGResolver.validate(definition.steps)
   * if (!result.valid) throw new Error(result.errors.join('; '))
   * // result.executionOrder = [['A','B'], ['C','D']]
   */
  static validate(steps: StepDefinition[]): DAGValidationResult {
    const errors: string[] = []
    const stepIds = new Set(steps.map((s) => s.id))

    // ── Self-reference check ─────────────────────────────────────────────────
    for (const step of steps) {
      if (step.dependsOn && step.dependsOn.includes(step.id)) {
        errors.push(`Step "${step.id}" depends on itself`)
      }
    }

    // ── Missing reference check ──────────────────────────────────────────────
    for (const step of steps) {
      if (!step.dependsOn) continue
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          errors.push(`Step "${step.id}" depends on "${dep}" which does not exist`)
        }
      }
    }

    // ── Cycle detection ──────────────────────────────────────────────────────
    const cycles = DAGResolver.detectCycles(steps)
    errors.push(...cycles)

    if (errors.length > 0) {
      return { valid: false, errors, executionOrder: [] }
    }

    const executionOrder = DAGResolver.topoSort(steps)
    return { valid: true, errors: [], executionOrder }
  }

  /**
   * Topological sort with parallel grouping.
   *
   * Steps with no unmet dependencies execute together in the same group.
   * Each group is safe to run with Promise.all.
   *
   * Algorithm: Kahn's BFS — iteratively collect nodes whose in-degree
   * (unresolved dependencies) has dropped to zero, emit them as one group,
   * then decrement successors and repeat.
   *
   * Assumes the graph has no cycles (call validate() first).
   *
   * @example
   * // A, B independent; C depends on A; D depends on A and B
   * DAGResolver.topoSort(steps) → [['A','B'], ['C','D']]
   */
  static topoSort(steps: StepDefinition[]): string[][] {
    if (steps.length === 0) return []

    // Build in-degree map and adjacency list (dependency → dependents)
    const inDegree = new Map<string, number>()
    const dependents = new Map<string, string[]>() // parent → children who depend on it

    for (const step of steps) {
      if (!inDegree.has(step.id)) inDegree.set(step.id, 0)
      if (!dependents.has(step.id)) dependents.set(step.id, [])
    }

    for (const step of steps) {
      const deps = step.dependsOn ?? []
      inDegree.set(step.id, deps.length)
      for (const dep of deps) {
        if (!dependents.has(dep)) dependents.set(dep, [])
        dependents.get(dep)!.push(step.id)
      }
    }

    const result: string[][] = []
    let ready: string[] = []

    // Collect initial ready set (in-degree 0)
    for (const [id, degree] of inDegree.entries()) {
      if (degree === 0) ready.push(id)
    }

    while (ready.length > 0) {
      // Sort within group for deterministic output (makes tests reliable)
      ready.sort()
      result.push([...ready])

      const nextReady: string[] = []
      for (const id of ready) {
        for (const child of dependents.get(id) ?? []) {
          const newDegree = (inDegree.get(child) ?? 1) - 1
          inDegree.set(child, newDegree)
          if (newDegree === 0) nextReady.push(child)
        }
      }
      ready = nextReady
    }

    return result
  }

  /**
   * Detect cycles using DFS with three-color marking.
   *
   * - white: not yet visited
   * - gray:  in the current DFS path (on the recursion stack)
   * - black: fully explored (no cycle from this node)
   *
   * A cycle exists when we encounter a gray node during traversal.
   * Returns descriptions of each cycle found.
   */
  static detectCycles(steps: StepDefinition[]): string[] {
    const colors = new Map<string, Color>()
    const adjacency = new Map<string, string[]>()
    const cycles: string[] = []

    for (const step of steps) {
      colors.set(step.id, "white")
      // Only include deps that actually exist (missing refs handled separately)
      const existingIds = new Set(steps.map((s) => s.id))
      adjacency.set(
        step.id,
        (step.dependsOn ?? []).filter((d) => existingIds.has(d)),
      )
    }

    const path: string[] = []

    function dfs(nodeId: string): void {
      colors.set(nodeId, "gray")
      path.push(nodeId)

      for (const dep of adjacency.get(nodeId) ?? []) {
        if (colors.get(dep) === "gray") {
          // Cycle detected — reconstruct cycle segment from path
          const cycleStart = path.indexOf(dep)
          const cyclePath = [...path.slice(cycleStart), dep]
          cycles.push(`Cycle detected: ${cyclePath.join(" → ")}`)
        } else if (colors.get(dep) === "white") {
          dfs(dep)
        }
      }

      path.pop()
      colors.set(nodeId, "black")
    }

    for (const step of steps) {
      if (colors.get(step.id) === "white") {
        dfs(step.id)
      }
    }

    return cycles
  }
}
