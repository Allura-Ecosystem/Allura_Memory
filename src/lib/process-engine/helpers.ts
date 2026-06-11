/**
 * Process Engine — DSL Helpers
 * Story 12.1: Process-as-Code Engine for Allura Memory
 *
 * Ergonomic builder functions for constructing ProcessDefinitions
 * without repetitive type boilerplate.
 *
 * Usage:
 *   import { defineProcess, step, checkpoint, gate } from "@/lib/process-engine"
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-engine/helpers is server-side only")
}

import type { ProcessDefinition, StepDefinition } from "./types"

// ── DSL Helpers ───────────────────────────────────────────────────────────────

/**
 * Define a typed process. The id is separated so it can be used as a key
 * without being part of the config object at the call site.
 *
 * @example
 * const myProcess = defineProcess("my-process", {
 *   name: "My Process",
 *   group_id: "allura-system",
 *   steps: [...],
 * })
 */
export function defineProcess<TCtx = Record<string, unknown>>(
  id: string,
  config: Omit<ProcessDefinition<TCtx>, "id">,
): ProcessDefinition<TCtx> {
  return { id, ...config }
}

/**
 * Create a standard executable step.
 *
 * @example
 * step("typecheck", "Run typecheck", async (ctx) => {
 *   // do work
 *   return { exitCode: 0 }
 * })
 */
export function step<TCtx = Record<string, unknown>>(
  id: string,
  name: string,
  execute: StepDefinition<TCtx>["execute"],
): StepDefinition<TCtx> {
  return {
    id,
    name,
    type: "step",
    execute,
  }
}

/**
 * Create a checkpoint step.
 *
 * In SOC2 mode: the process pauses and emits process_checkpoint_blocked.
 * Call engine.resume(processId) after human approval to continue.
 *
 * In auto mode: the checkpoint is a pass-through no-op.
 *
 * @example
 * checkpoint("human-review", "Code review approval", {
 *   required: (ctx) => ctx.promotionMode === "soc2",
 * })
 */
export function checkpoint<TCtx = Record<string, unknown>>(
  id: string,
  name: string,
  config: {
    required?: StepDefinition<TCtx>["required"]
  } = {},
): StepDefinition<TCtx> {
  return {
    id,
    name,
    type: "checkpoint",
    required: config.required,
  }
}

/**
 * Create a gate step that evaluates a condition before proceeding.
 *
 * If the condition returns false and the step is required (default),
 * the process fails with process_gate_failed.
 *
 * If required is false, a failing gate skips the step (process continues).
 *
 * @example
 * gate("sprint-status-check", "Verify sprint-status updated", async (ctx) => {
 *   // return true to pass, false to block/skip
 *   return hasStagedFile("sprint-status.yaml")
 * })
 */
export function gate<TCtx = Record<string, unknown>>(
  id: string,
  name: string,
  condition: StepDefinition<TCtx>["condition"],
  config: {
    required?: StepDefinition<TCtx>["required"]
  } = {},
): StepDefinition<TCtx> {
  return {
    id,
    name,
    type: "gate",
    condition,
    required: config.required,
  }
}
