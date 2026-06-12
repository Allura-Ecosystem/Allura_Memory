/**
 * Story 13.2: Operational surface state contract tests.
 *
 * Pins the ready / empty / error / stale / degraded mapping that every
 * Command Center surface must obey. (Verification gate 4.)
 */

import { describe, expect, it } from "vitest"

import { resolveOperationalSurface, isAuthoritative, type OperationalSource } from "./index"

const source: OperationalSource = { id: "curator-queue", systemOfRecord: "allura-brain" }
const NOW = Date.parse("2026-06-12T00:00:00.000Z")

describe("resolveOperationalSurface", () => {
  it("ready: live, non-empty, within freshness window", () => {
    const surface = resolveOperationalSurface({
      source,
      outcome: { ok: true, data: [{ id: "p1" }], fetchedAt: "2026-06-11T23:59:30.000Z" },
      isEmpty: (d) => d.length === 0,
      freshnessMs: 60_000,
      now: NOW,
    })

    expect(surface.status).toBe("ready")
    expect(surface.data).toEqual([{ id: "p1" }])
    expect(surface.recovery).toBeNull()
    expect(surface.error).toBeNull()
    expect(surface.ageMs).toBe(30_000)
    expect(isAuthoritative(surface.status)).toBe(true)
  })

  it("empty: live success but the set is empty", () => {
    const surface = resolveOperationalSurface({
      source,
      outcome: { ok: true, data: [], fetchedAt: "2026-06-12T00:00:00.000Z" },
      isEmpty: (d) => d.length === 0,
      now: NOW,
    })

    expect(surface.status).toBe("empty")
    expect(surface.data).toBeNull()
    expect(surface.fetchedAt).toBe("2026-06-12T00:00:00.000Z")
    expect(isAuthoritative(surface.status)).toBe(false)
  })

  it("stale: live data older than its freshness window", () => {
    const surface = resolveOperationalSurface({
      source,
      outcome: { ok: true, data: [{ id: "p1" }], fetchedAt: "2026-06-11T23:58:00.000Z" },
      isEmpty: (d) => d.length === 0,
      freshnessMs: 60_000,
      now: NOW,
    })

    expect(surface.status).toBe("stale")
    expect(surface.data).toEqual([{ id: "p1" }]) // still shown, but flagged
    expect(surface.ageMs).toBe(120_000)
    expect(surface.recovery).toMatch(/older than/i)
    expect(isAuthoritative(surface.status)).toBe(false)
  })

  it("error: source answered with a failure", () => {
    const surface = resolveOperationalSurface({
      source,
      outcome: { ok: false, error: "query timeout" },
      now: NOW,
    })

    expect(surface.status).toBe("error")
    expect(surface.error).toBe("query timeout")
    expect(surface.data).toBeNull()
    expect(surface.recovery).not.toBeNull()
    expect(isAuthoritative(surface.status)).toBe(false)
  })

  it("degraded: source could not be reached at all", () => {
    const surface = resolveOperationalSurface({
      source,
      outcome: null,
      now: NOW,
    })

    expect(surface.status).toBe("degraded")
    expect(surface.data).toBeNull()
    expect(surface.error).toBeNull()
    expect(surface.recovery).toMatch(/reachable/i)
    expect(isAuthoritative(surface.status)).toBe(false)
  })

  it("never leaks an unbounded negative age for clock skew", () => {
    const surface = resolveOperationalSurface({
      source,
      // fetchedAt in the future relative to `now`
      outcome: { ok: true, data: [1], fetchedAt: "2026-06-12T00:01:00.000Z" },
      isEmpty: (d) => d.length === 0,
      now: NOW,
    })

    expect(surface.ageMs).toBe(0)
    expect(surface.status).toBe("ready")
  })
})
