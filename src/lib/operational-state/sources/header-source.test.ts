/**
 * Header Source — Unit Tests
 *
 * Pins the live-state mapping for the Command Center top bar:
 * - store unreachable (no pool / unhealthy / conn error) -> "unknown" freshness, 0 receipts
 * - no activity rows                                      -> "no activity yet" / live
 * - recent write                                          -> "live" with relative label
 * - old write (> 7d)                                      -> "stale"
 * - group_id is always a bound parameter (tenant invariant)
 *
 * Usage: bun vitest run src/lib/operational-state/sources/header-source.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(),
  isPoolHealthy: vi.fn(),
}))

import { getPool, isPoolHealthy } from "@/lib/postgres/connection"
import { getHeaderState } from "./header-source"

const getPoolMock = getPool as unknown as ReturnType<typeof vi.fn>
const isPoolHealthyMock = isPoolHealthy as unknown as ReturnType<typeof vi.fn>

const GROUP_ID = "allura-system"

describe("getHeaderState", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reports unknown freshness when the pool cannot be created", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("no pool")
    })
    const s = await getHeaderState(GROUP_ID)
    expect(s.sourceFreshness).toBe("unknown")
    expect(s.sourceFresh).toBe("store unreachable")
    expect(s.receiptCount).toBe(0)
    expect(s.orgName).toBe(GROUP_ID)
  })

  it("reports unknown freshness when the pool is unhealthy", async () => {
    getPoolMock.mockReturnValue({ query: vi.fn() })
    isPoolHealthyMock.mockResolvedValue(false)
    const s = await getHeaderState(GROUP_ID)
    expect(s.sourceFreshness).toBe("unknown")
    expect(s.receiptCount).toBe(0)
  })

  it("reports 'no activity yet' / live when there are no events", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ max: null }] })
      .mockResolvedValueOnce({ rows: [{ n: "0" }] })
    getPoolMock.mockReturnValue({ query })
    isPoolHealthyMock.mockResolvedValue(true)

    const s = await getHeaderState(GROUP_ID)
    expect(s.sourceFreshness).toBe("live")
    expect(s.sourceFresh).toBe("no activity yet")
    expect(s.receiptCount).toBe(0)
    // group_id bound as a parameter on every query (tenant invariant)
    for (const call of query.mock.calls) {
      expect(call[1]).toEqual([GROUP_ID])
    }
  })

  it("reports live with a relative label and receipt count for a recent write", async () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ max: recent }] })
      .mockResolvedValueOnce({ rows: [{ n: "7" }] })
    getPoolMock.mockReturnValue({ query })
    isPoolHealthyMock.mockResolvedValue(true)

    const s = await getHeaderState(GROUP_ID)
    expect(s.sourceFreshness).toBe("live")
    expect(s.sourceFresh).toMatch(/last write \d+m ago/)
    expect(s.receiptCount).toBe(7)
  })

  it("reports stale when the last write is older than 7 days", async () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ max: old }] })
      .mockResolvedValueOnce({ rows: [{ n: "0" }] })
    getPoolMock.mockReturnValue({ query })
    isPoolHealthyMock.mockResolvedValue(true)

    const s = await getHeaderState(GROUP_ID)
    expect(s.sourceFreshness).toBe("stale")
    expect(s.sourceFresh).toMatch(/last write \d+d ago/)
  })
})
