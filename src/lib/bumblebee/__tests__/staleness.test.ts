import { describe, expect, it } from "vitest"

import {
  canUnionProfiles,
  isStale,
  profileSeparation,
  type StalenessInput,
} from "../staleness"

// ── isStale ────────────────────────────────────────────────────────────────

describe("isStale", () => {
  function makeInput(
    overrides: Partial<StalenessInput> = {},
  ): StalenessInput {
    return {
      lastCompleteGeneration: 1,
      currentServerGeneration: 1,
      freshnessTtlSeconds: 3600,
      lastCompleteAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-01-01T00:30:00Z"),
      ...overrides,
    }
  }

  it("returns true when lastCompleteGeneration is null (never completed)", () => {
    const input = makeInput({ lastCompleteGeneration: null, lastCompleteAt: null })
    expect(isStale(input)).toBe(true)
  })

  it("returns false when a complete generation is recent (within TTL)", () => {
    const input = makeInput({
      lastCompleteGeneration: 5,
      currentServerGeneration: 5,
      lastCompleteAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-01-01T00:30:00Z"),
      freshnessTtlSeconds: 3600,
    })
    expect(isStale(input)).toBe(false)
  })

  it("returns true when a complete generation is older than the TTL", () => {
    const input = makeInput({
      lastCompleteGeneration: 3,
      currentServerGeneration: 5,
      lastCompleteAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-01-01T02:00:01Z"),
      freshnessTtlSeconds: 3600,
    })
    expect(isStale(input)).toBe(true)
  })

  it("returns true when lastCompleteGeneration is set but lastCompleteAt is null", () => {
    const input = makeInput({
      lastCompleteGeneration: 3,
      lastCompleteAt: null,
    })
    expect(isStale(input)).toBe(true)
  })

  it("returns false at the exact TTL boundary (not yet stale)", () => {
    const input = makeInput({
      lastCompleteGeneration: 5,
      currentServerGeneration: 5,
      lastCompleteAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-01-01T01:00:00Z"),
      freshnessTtlSeconds: 3600,
    })
    expect(isStale(input)).toBe(false)
  })

  it("returns true one second past the TTL boundary", () => {
    const input = makeInput({
      lastCompleteGeneration: 5,
      currentServerGeneration: 5,
      lastCompleteAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-01-01T01:00:01Z"),
      freshnessTtlSeconds: 3600,
    })
    expect(isStale(input)).toBe(true)
  })
})

// ── profileSeparation ──────────────────────────────────────────────────────

describe("profileSeparation", () => {
  it("classifies baseline as routine", () => {
    const result = profileSeparation("baseline")
    expect(result.isRoutine).toBe(true)
    expect(result.isCampaign).toBe(false)
  })

  it("classifies project as routine", () => {
    const result = profileSeparation("project")
    expect(result.isRoutine).toBe(true)
    expect(result.isCampaign).toBe(false)
  })

  it("classifies deep as campaign", () => {
    const result = profileSeparation("deep")
    expect(result.isRoutine).toBe(false)
    expect(result.isCampaign).toBe(true)
  })
})

// ── canUnionProfiles ───────────────────────────────────────────────────────

describe("canUnionProfiles", () => {
  it("allows baseline + project to be unioned", () => {
    expect(canUnionProfiles("baseline", "project")).toBe(true)
  })

  it("allows project + baseline to be unioned (order-independent)", () => {
    expect(canUnionProfiles("project", "baseline")).toBe(true)
  })

  it("allows baseline + baseline to be unioned", () => {
    expect(canUnionProfiles("baseline", "baseline")).toBe(true)
  })

  it("allows project + project to be unioned", () => {
    expect(canUnionProfiles("project", "project")).toBe(true)
  })

  it("denies baseline + deep", () => {
    expect(canUnionProfiles("baseline", "deep")).toBe(false)
  })

  it("denies project + deep", () => {
    expect(canUnionProfiles("project", "deep")).toBe(false)
  })

  it("denies deep + deep", () => {
    expect(canUnionProfiles("deep", "deep")).toBe(false)
  })

  it("denies deep + baseline (order-independent)", () => {
    expect(canUnionProfiles("deep", "baseline")).toBe(false)
  })
})