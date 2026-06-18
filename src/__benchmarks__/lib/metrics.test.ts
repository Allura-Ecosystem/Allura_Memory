/**
 * Pure unit tests for the benchmark metric primitives. No DB / live stack —
 * runs in the unit lane to guard the IR-metric math the harness depends on.
 */

import { describe, expect, it } from "vitest"
import { mean, percentile, precisionAtK, recallAtK, reciprocalRank, round } from "./metrics"
import { gated, statusFromMetrics } from "./metric-builder"

describe("percentile", () => {
  it("returns 0 for empty input", () => {
    expect(percentile([], 95)).toBe(0)
  })

  it("computes nearest-rank percentiles", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(percentile(xs, 50)).toBe(50)
    expect(percentile(xs, 90)).toBe(90)
    expect(percentile(xs, 100)).toBe(100)
  })

  it("is order-independent", () => {
    expect(percentile([100, 10, 50, 30], 50)).toBe(percentile([10, 30, 50, 100], 50))
  })
})

describe("mean", () => {
  it("averages and handles empty", () => {
    expect(mean([2, 4, 6])).toBe(4)
    expect(mean([])).toBe(0)
  })
})

describe("precisionAtK / recallAtK", () => {
  const relevant = new Set(["a", "b", "c"])

  it("precision counts relevant in top-K", () => {
    expect(precisionAtK(["a", "x", "b", "y"], relevant, 4)).toBe(0.5)
    expect(precisionAtK(["a", "b"], relevant, 2)).toBe(1)
  })

  it("recall is hits over total relevant", () => {
    expect(recallAtK(["a", "b", "x"], relevant, 3)).toBeCloseTo(2 / 3, 5)
    expect(recallAtK(["a", "b", "c"], relevant, 5)).toBe(1)
  })

  it("recall is 0 when nothing is relevant", () => {
    expect(recallAtK(["a"], new Set(), 5)).toBe(0)
  })
})

describe("reciprocalRank", () => {
  it("is 1/rank of the first relevant item", () => {
    expect(reciprocalRank(["x", "a", "b"], new Set(["a"]))).toBe(1 / 2)
    expect(reciprocalRank(["a"], new Set(["a"]))).toBe(1)
    expect(reciprocalRank(["x", "y"], new Set(["a"]))).toBe(0)
  })
})

describe("round", () => {
  it("rounds to 3 decimals by default", () => {
    expect(round(0.123456)).toBe(0.123)
  })
})

describe("metric-builder", () => {
  it("gated computes pass for gte and lte", () => {
    expect(gated("p", 0.9, "gte", 0.85).passed).toBe(true)
    expect(gated("p", 0.8, "gte", 0.85).passed).toBe(false)
    expect(gated("lat", 100, "lte", 200).passed).toBe(true)
    expect(gated("lat", 300, "lte", 200).passed).toBe(false)
  })

  it("statusFromMetrics fails if any gated metric fails", () => {
    expect(statusFromMetrics([gated("a", 1, "gte", 0)])).toBe("pass")
    expect(statusFromMetrics([gated("a", 1, "gte", 0), gated("b", 0, "gte", 1)])).toBe("fail")
    expect(statusFromMetrics([{ name: "info", value: 5, unit: "" }])).toBe("pass")
  })
})
