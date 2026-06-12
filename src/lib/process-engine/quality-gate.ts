/**
 * Quality Gate — Scored gates with evidence (AD-P1-03)
 *
 * Gates return a score (0-1) with a mandatory evidence link.
 * Low scores retry (up to maxAttempts). Errors terminate immediately.
 *
 * The engine calls evaluateGate() during step execution for gate-type steps.
 * This module is pure — it does not persist events. The engine handles persistence.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-engine/quality-gate is server-side only")
}

import type { GateResult, ProcessContext, StepDefinition } from "./types"

// ── Gate Evaluator ───────────────────────────────────────────────────────────

export interface GateConfig {
  /** Minimum score to pass (0.01-1.0) */
  threshold: number
  /** Maximum attempts before terminal failure (1-100) */
  maxAttempts: number
  /** Function that produces a score and evidence for this gate */
  evaluate: (ctx: ProcessContext) => Promise<{ score: number; evidenceId: string; reasoning: string }>
}

/**
 * Evaluate a quality gate with bounded retries.
 *
 * - Low score (score < threshold): retry if attempts remain
 * - Error in evaluate(): terminate immediately (gate_error, no retry)
 * - Pass (score >= threshold): return passing GateResult
 * - Exhausted attempts: return final failing GateResult
 *
 * Returns an array of all attempt results (for audit trail).
 */
export async function evaluateGate(
  config: GateConfig,
  ctx: ProcessContext,
): Promise<{ results: GateResult[]; finalResult: GateResult }> {
  validateGateConfig(config)

  const results: GateResult[] = []

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    let evaluation: { score: number; evidenceId: string; reasoning: string }

    try {
      evaluation = await config.evaluate(ctx)
    } catch (err) {
      // Error = terminate immediately, don't retry broken code
      const errorResult: GateResult = {
        score: 0,
        threshold: config.threshold,
        passed: false,
        attempt,
        maxAttempts: config.maxAttempts,
        evidenceId: "",
        reasoning: `Gate error: ${err instanceof Error ? err.message : String(err)}`,
      }
      results.push(errorResult)
      return { results, finalResult: errorResult }
    }

    const passed = evaluation.score >= config.threshold
    const result: GateResult = {
      score: evaluation.score,
      threshold: config.threshold,
      passed,
      attempt,
      maxAttempts: config.maxAttempts,
      evidenceId: evaluation.evidenceId,
      reasoning: evaluation.reasoning,
    }
    results.push(result)

    // Validate: no gate passes without evidenceId
    if (passed && !evaluation.evidenceId) {
      const failedResult: GateResult = {
        ...result,
        passed: false,
        reasoning: "Gate scored above threshold but produced no evidenceId — treated as failure",
      }
      results[results.length - 1] = failedResult
      return { results, finalResult: failedResult }
    }

    if (passed) {
      return { results, finalResult: result }
    }

    // Low score — continue to next attempt (if available)
  }

  // All attempts exhausted
  const finalResult = results[results.length - 1]
  return { results, finalResult }
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateGateConfig(config: GateConfig): void {
  if (config.threshold < 0.01 || config.threshold > 1.0) {
    throw new Error(`Gate threshold must be between 0.01 and 1.0, got ${config.threshold}`)
  }
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1 || config.maxAttempts > 100) {
    throw new Error(`Gate maxAttempts must be an integer between 1 and 100, got ${config.maxAttempts}`)
  }
}

/**
 * Extract GateConfig from a gate-type StepDefinition.
 * Gate steps must have metadata with threshold, maxAttempts, and evaluate function.
 */
export function extractGateConfig(step: StepDefinition): GateConfig | null {
  if (step.type !== "gate") return null

  // Gate steps use the condition field for boolean gates (existing behavior).
  // Scored gates are configured via step metadata or explicit GateConfig.
  // This function is a bridge — callers provide GateConfig directly when
  // they want scored behavior.
  return null
}
