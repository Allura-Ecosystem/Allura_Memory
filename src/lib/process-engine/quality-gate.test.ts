/**
 * quality-gate.test.ts — Unit tests for scored quality gates (AD-P1-03)
 *
 * Tests cover:
 * - Passing gate with evidence
 * - Failing gate (score below threshold)
 * - Gate error terminates immediately (no retry)
 * - Low score retries up to maxAttempts
 * - Gate pass without evidenceId treated as failure
 * - Config validation (threshold, maxAttempts bounds)
 * - All attempts recorded in results array
 */

import { describe, expect, it, vi } from "vitest"
import { evaluateGate, type GateConfig } from "./quality-gate"
import type { ProcessContext } from "./types"

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ProcessContext> = {}): ProcessContext {
  return {
    processId: "test-run-1",
    groupId: "allura-system",
    agentId: "test-agent",
    stepResults: {},
    metadata: {},
    promotionMode: "soc2",
    ...overrides,
  }
}

function makeConfig(overrides: Partial<GateConfig> = {}): GateConfig {
  return {
    threshold: 0.85,
    maxAttempts: 3,
    evaluate: vi.fn().mockResolvedValue({
      score: 0.9,
      evidenceId: "ev-001",
      reasoning: "All checks passed",
    }),
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("evaluateGate", () => {
  it("passes when score >= threshold with evidence", async () => {
    const config = makeConfig()
    const ctx = makeCtx()

    const { finalResult, results } = await evaluateGate(config, ctx)

    expect(finalResult.passed).toBe(true)
    expect(finalResult.score).toBe(0.9)
    expect(finalResult.threshold).toBe(0.85)
    expect(finalResult.attempt).toBe(1)
    expect(finalResult.evidenceId).toBe("ev-001")
    expect(results).toHaveLength(1)
  })

  it("fails when score < threshold and maxAttempts exhausted", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      score: 0.5,
      evidenceId: "ev-low",
      reasoning: "Quality too low",
    })
    const config = makeConfig({ evaluate, maxAttempts: 2 })
    const ctx = makeCtx()

    const { finalResult, results } = await evaluateGate(config, ctx)

    expect(finalResult.passed).toBe(false)
    expect(finalResult.score).toBe(0.5)
    expect(finalResult.attempt).toBe(2)
    expect(results).toHaveLength(2)
    expect(evaluate).toHaveBeenCalledTimes(2)
  })

  it("retries on low score and passes on later attempt", async () => {
    const evaluate = vi.fn()
      .mockResolvedValueOnce({ score: 0.5, evidenceId: "ev-1", reasoning: "Low" })
      .mockResolvedValueOnce({ score: 0.6, evidenceId: "ev-2", reasoning: "Still low" })
      .mockResolvedValueOnce({ score: 0.9, evidenceId: "ev-3", reasoning: "Passed" })
    const config = makeConfig({ evaluate, maxAttempts: 5 })
    const ctx = makeCtx()

    const { finalResult, results } = await evaluateGate(config, ctx)

    expect(finalResult.passed).toBe(true)
    expect(finalResult.attempt).toBe(3)
    expect(finalResult.evidenceId).toBe("ev-3")
    expect(results).toHaveLength(3)
  })

  it("terminates immediately on evaluate error (no retry)", async () => {
    const evaluate = vi.fn().mockRejectedValue(new Error("Scoring function crashed"))
    const config = makeConfig({ evaluate, maxAttempts: 5 })
    const ctx = makeCtx()

    const { finalResult, results } = await evaluateGate(config, ctx)

    expect(finalResult.passed).toBe(false)
    expect(finalResult.score).toBe(0)
    expect(finalResult.attempt).toBe(1)
    expect(finalResult.reasoning).toContain("Gate error")
    expect(finalResult.reasoning).toContain("Scoring function crashed")
    expect(finalResult.evidenceId).toBe("")
    expect(results).toHaveLength(1)
    expect(evaluate).toHaveBeenCalledTimes(1) // no retry on error
  })

  it("treats pass without evidenceId as failure", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      score: 0.95,
      evidenceId: "", // empty — violation
      reasoning: "Score is high but no evidence",
    })
    const config = makeConfig({ evaluate, maxAttempts: 3 })
    const ctx = makeCtx()

    const { finalResult, results } = await evaluateGate(config, ctx)

    expect(finalResult.passed).toBe(false)
    expect(finalResult.reasoning).toContain("no evidenceId")
    expect(results).toHaveLength(1)
    expect(evaluate).toHaveBeenCalledTimes(1) // terminates, no retry
  })

  it("records all attempts in results array", async () => {
    const evaluate = vi.fn()
      .mockResolvedValueOnce({ score: 0.3, evidenceId: "ev-1", reasoning: "Attempt 1" })
      .mockResolvedValueOnce({ score: 0.4, evidenceId: "ev-2", reasoning: "Attempt 2" })
      .mockResolvedValueOnce({ score: 0.5, evidenceId: "ev-3", reasoning: "Attempt 3" })
    const config = makeConfig({ evaluate, maxAttempts: 3 })
    const ctx = makeCtx()

    const { results } = await evaluateGate(config, ctx)

    expect(results).toHaveLength(3)
    expect(results[0].attempt).toBe(1)
    expect(results[1].attempt).toBe(2)
    expect(results[2].attempt).toBe(3)
    expect(results[0].score).toBe(0.3)
    expect(results[1].score).toBe(0.4)
    expect(results[2].score).toBe(0.5)
  })

  it("throws on invalid threshold (too low)", async () => {
    const config = makeConfig({ threshold: 0 })
    const ctx = makeCtx()

    await expect(evaluateGate(config, ctx)).rejects.toThrow("threshold must be between 0.01 and 1.0")
  })

  it("throws on invalid threshold (too high)", async () => {
    const config = makeConfig({ threshold: 1.5 })
    const ctx = makeCtx()

    await expect(evaluateGate(config, ctx)).rejects.toThrow("threshold must be between 0.01 and 1.0")
  })

  it("throws on invalid maxAttempts (zero)", async () => {
    const config = makeConfig({ maxAttempts: 0 })
    const ctx = makeCtx()

    await expect(evaluateGate(config, ctx)).rejects.toThrow("maxAttempts must be an integer between 1 and 100")
  })

  it("throws on invalid maxAttempts (too high)", async () => {
    const config = makeConfig({ maxAttempts: 101 })
    const ctx = makeCtx()

    await expect(evaluateGate(config, ctx)).rejects.toThrow("maxAttempts must be an integer between 1 and 100")
  })

  it("works with maxAttempts = 1 (single shot)", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      score: 0.5,
      evidenceId: "ev-single",
      reasoning: "Only one shot",
    })
    const config = makeConfig({ evaluate, maxAttempts: 1 })
    const ctx = makeCtx()

    const { finalResult, results } = await evaluateGate(config, ctx)

    expect(finalResult.passed).toBe(false)
    expect(finalResult.attempt).toBe(1)
    expect(results).toHaveLength(1)
    expect(evaluate).toHaveBeenCalledTimes(1)
  })

  it("passes context to evaluate function", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      score: 0.9,
      evidenceId: "ev-ctx",
      reasoning: "Context verified",
    })
    const ctx = makeCtx({ processId: "ctx-test-run", agentId: "ctx-test-agent" })
    const config = makeConfig({ evaluate })

    await evaluateGate(config, ctx)

    expect(evaluate).toHaveBeenCalledWith(ctx)
  })
})
