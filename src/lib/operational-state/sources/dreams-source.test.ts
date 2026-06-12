/**
 * Dreams Source — Unit Tests (Phase 0 Story 9)
 *
 * Usage: bun vitest run src/lib/operational-state/sources/dreams-source.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(),
}))

import { getPool } from "@/lib/postgres/connection"
import { resolveOperationalSurface } from "../index"
import {
  isDreamsEmpty,
  readDreams,
  type DreamsSnapshot,
} from "./dreams-source"

const getPoolMock = getPool as unknown as ReturnType<typeof vi.fn>

const GROUP_ID = "allura-system"

function mockQueryResult(row: Record<string, unknown> | undefined) {
  const query = vi.fn().mockResolvedValue({ rows: row === undefined ? [] : [row] })
  getPoolMock.mockReturnValue({ query })
  return query
}

function isolatePromotionMode() {
  const original = process.env.PROMOTION_MODE
  delete process.env.PROMOTION_MODE
  return original
}

function restorePromotionMode(original: string | undefined) {
  if (original !== undefined) {
    process.env.PROMOTION_MODE = original
  } else {
    delete process.env.PROMOTION_MODE
  }
}

describe("readDreams", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns ok with a parsed snapshot on a successful query", async () => {
    const proposalDate = new Date("2026-06-12T06:00:00.000Z")
    const query = mockQueryResult({
      proposals_pending: "5",
      proposals_approved_7d: "12",
      proposals_rejected_7d: "3",
      backfill_runs_24h: "2",
      proposals_created_24h: "8",
      last_proposal_at: proposalDate,
    })

    const savedEnv = isolatePromotionMode()
    try {
      const outcome = await readDreams(GROUP_ID)

      expect(outcome).not.toBeNull()
      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data).toEqual({
        groupId: GROUP_ID,
        proposalsPending: 5,
        proposalsApproved7d: 12,
        proposalsRejected7d: 3,
        backfillRuns24h: 2,
        proposalsCreated24h: 8,
        lastProposalAt: "2026-06-12T06:00:00.000Z",
        promotionMode: "unknown",
      })
      expect(typeof outcome.fetchedAt).toBe("string")

      // Tenant invariant: group_id is a bound parameter
      const [sql, params] = query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain("group_id = $1")
      expect(params).toEqual([GROUP_ID])
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("parses last_proposal_at when the driver returns a string", async () => {
    const savedEnv = isolatePromotionMode()
    try {
      mockQueryResult({
        proposals_pending: "1",
        proposals_approved_7d: "0",
        proposals_rejected_7d: "0",
        backfill_runs_24h: "0",
        proposals_created_24h: "0",
        last_proposal_at: "2026-06-12 06:00:00.000Z",
      })

      const outcome = await readDreams(GROUP_ID)
      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.lastProposalAt).toBe("2026-06-12T06:00:00.000Z")
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("treats a missing row as zero activity (not an error)", async () => {
    const savedEnv = isolatePromotionMode()
    try {
      mockQueryResult(undefined)

      const outcome = await readDreams(GROUP_ID)
      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.proposalsPending).toBe(0)
      expect(outcome.data.lastProposalAt).toBeNull()
      expect(isDreamsEmpty(outcome.data)).toBe(true)
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("returns null (degraded) when the pool cannot be constructed", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("missing config")
    })

    const outcome = await readDreams(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns null (degraded) when the connection is unreachable", async () => {
    const query = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:5432"))
    getPoolMock.mockReturnValue({ query })

    const outcome = await readDreams(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns a sanitized error on a genuine query failure", async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error('relation "canonical_proposals" does not exist secret=xyz'))
    getPoolMock.mockReturnValue({ query })

    const outcome = await readDreams(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === true) throw new Error("expected error outcome")
    expect(outcome.error).toBe("Dreams query failed")
    expect(outcome.error).not.toContain("xyz")
  })

  it("detects promotion mode from env", async () => {
    const savedEnv = isolatePromotionMode()
    process.env.PROMOTION_MODE = "soc2"

    try {
      mockQueryResult({
        proposals_pending: "1",
        proposals_approved_7d: "0",
        proposals_rejected_7d: "0",
        backfill_runs_24h: "0",
        proposals_created_24h: "0",
        last_proposal_at: null,
      })

      const outcome = await readDreams(GROUP_ID)
      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.promotionMode).toBe("soc2")
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("sanitizes unexpected promotion mode to 'unknown'", async () => {
    const savedEnv = isolatePromotionMode()
    process.env.PROMOTION_MODE = "experimental"

    try {
      mockQueryResult({
        proposals_pending: "0",
        proposals_approved_7d: "0",
        proposals_rejected_7d: "0",
        backfill_runs_24h: "0",
        proposals_created_24h: "0",
        last_proposal_at: null,
      })

      const outcome = await readDreams(GROUP_ID)
      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.promotionMode).toBe("unknown")
    } finally {
      restorePromotionMode(savedEnv)
    }
  })
})

describe("isDreamsEmpty", () => {
  const base: DreamsSnapshot = {
    groupId: GROUP_ID,
    proposalsPending: 0,
    proposalsApproved7d: 0,
    proposalsRejected7d: 0,
    backfillRuns24h: 0,
    proposalsCreated24h: 0,
    lastProposalAt: null,
    promotionMode: "unknown",
  }

  it("is empty when there is no activity at all", () => {
    expect(isDreamsEmpty(base)).toBe(true)
  })

  it("is not empty when proposals are pending", () => {
    expect(isDreamsEmpty({ ...base, proposalsPending: 3 })).toBe(false)
  })

  it("is not empty when proposals were approved recently", () => {
    expect(isDreamsEmpty({ ...base, proposalsApproved7d: 1 })).toBe(false)
  })

  it("is not empty when backfill runs occurred", () => {
    expect(isDreamsEmpty({ ...base, backfillRuns24h: 2 })).toBe(false)
  })
})

describe("operational-state integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("maps a live snapshot to ready via the contract", async () => {
    const savedEnv = isolatePromotionMode()
    try {
      mockQueryResult({
        proposals_pending: "5",
        proposals_approved_7d: "12",
        proposals_rejected_7d: "3",
        backfill_runs_24h: "2",
        proposals_created_24h: "8",
        last_proposal_at: new Date("2026-06-12T06:00:00.000Z"),
      })

      const outcome = await readDreams(GROUP_ID)
      const surface = resolveOperationalSurface({
        source: { id: "dreams", systemOfRecord: "postgres:canonical_proposals+events" },
        outcome,
        isEmpty: isDreamsEmpty,
        freshnessMs: 30_000,
      })

      expect(surface.status).toBe("ready")
      expect(surface.data?.proposalsPending).toBe(5)
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("maps an unreachable source to degraded via the contract", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("no config")
    })

    const outcome = await readDreams(GROUP_ID)
    const surface = resolveOperationalSurface({
      source: { id: "dreams", systemOfRecord: "postgres:canonical_proposals+events" },
      outcome,
      isEmpty: isDreamsEmpty,
      freshnessMs: 30_000,
    })

    expect(surface.status).toBe("degraded")
    expect(surface.data).toBeNull()
  })

  it("maps an empty snapshot to empty via the contract", async () => {
    const savedEnv = isolatePromotionMode()
    try {
      mockQueryResult({
        proposals_pending: "0",
        proposals_approved_7d: "0",
        proposals_rejected_7d: "0",
        backfill_runs_24h: "0",
        proposals_created_24h: "0",
        last_proposal_at: null,
      })

      const outcome = await readDreams(GROUP_ID)
      const surface = resolveOperationalSurface({
        source: { id: "dreams", systemOfRecord: "postgres:canonical_proposals+events" },
        outcome,
        isEmpty: isDreamsEmpty,
        freshnessMs: 30_000,
      })

      expect(surface.status).toBe("empty")
    } finally {
      restorePromotionMode(savedEnv)
    }
  })
})