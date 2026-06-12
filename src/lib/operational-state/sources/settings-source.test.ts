/**
 * Settings Source — Unit Tests (Phase 0 Story 7)
 *
 * Pins the SourceOutcome mapping for the Settings surface:
 * - successful query          -> { ok: true } with parsed snapshot
 * - empty governance activity -> isSettingsEmpty() = true
 * - unreachable pool          -> null (degraded)
 * - query failure             -> { ok: false } with sanitized error
 * - group_id is always passed as a bound parameter (tenant invariant)
 * - MCP health report integrated with subsystem health mapping
 * - promotion mode sanitized from env
 *
 * Usage: bun vitest run src/lib/operational-state/sources/settings-source.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Mock dependencies before importing ────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(),
}))

vi.mock("@/mcp/audit-tools", () => ({
  audit_health_report: vi.fn(),
}))

vi.mock("@/mcp/canonical-tools/validation-utils", () => ({
  validateGroupId: (id: string) => id,
}))

// ── Import after mocking ──────────────────────────────────────────────────────

import { getPool } from "@/lib/postgres/connection"
import { audit_health_report } from "@/mcp/audit-tools"
import { resolveOperationalSurface } from "../index"
import {
  isSettingsEmpty,
  readSettings,
  type SettingsSnapshot,
} from "./settings-source"

const getPoolMock = getPool as unknown as ReturnType<typeof vi.fn>
const auditHealthMock = audit_health_report as unknown as ReturnType<typeof vi.fn>

const GROUP_ID = "allura-system"

function mockQueryResult(row: Record<string, unknown> | undefined) {
  const query = vi.fn().mockResolvedValue({ rows: row === undefined ? [] : [row] })
  getPoolMock.mockReturnValue({ query })
  return query
}

function mockHealthyReport() {
  auditHealthMock.mockResolvedValue({
    subsystems: {
      postgres: { status: "healthy", latency_ms: 5 },
      neo4j: { status: "healthy", latency_ms: 12 },
      embedding_backfill: { status: "healthy", latency_ms: 3 },
      curator_queue: { status: "healthy", latency_ms: 2, pending_count: 10 },
      mcp_tools: { status: "healthy", latency_ms: 0, tool_count: 6 },
    },
    overall_status: "healthy",
    checked_at: new Date().toISOString(),
  })
}

/**
 * Save and clear PROMOTION_MODE so .env doesn't leak into tests.
 */
function isolatePromotionMode() {
  const originalEnv = process.env.PROMOTION_MODE
  delete process.env.PROMOTION_MODE
  return originalEnv
}

function restorePromotionMode(original: string | undefined) {
  if (original !== undefined) {
    process.env.PROMOTION_MODE = original
  } else {
    delete process.env.PROMOTION_MODE
  }
}

describe("readSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHealthyReport()
  })

  it("returns ok with a parsed snapshot on a successful query", async () => {
    const policyDate = new Date("2026-06-12T08:00:00.000Z")
    const query = mockQueryResult({
      policy_changes: "3",
      gate_checks_24h: "14",
      last_policy_change_at: policyDate,
    })

    const savedEnv = isolatePromotionMode()

    try {
      const outcome = await readSettings(GROUP_ID)

      expect(outcome).not.toBeNull()
      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data).toEqual({
        groupId: GROUP_ID,
        subsystemHealth: {
          postgres: "healthy",
          neo4j: "healthy",
          embeddingBackfill: "healthy",
          curatorQueueDepth: "healthy",
          mcpToolAvailability: "healthy",
        },
        policyChanges: 3,
        gateChecks24h: 14,
        lastPolicyChangeAt: "2026-06-12T08:00:00.000Z",
        promotionMode: "unknown",
      })
      expect(typeof outcome.fetchedAt).toBe("string")

      // Tenant invariant: group_id is a bound parameter, present in the WHERE clause.
      const [sql, params] = query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain("WHERE group_id = $1")
      expect(params).toEqual([GROUP_ID])
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("parses last_policy_change_at when the driver returns a string instead of a Date", async () => {
    const savedEnv = isolatePromotionMode()
    try {
      mockQueryResult({
        policy_changes: "1",
        gate_checks_24h: "0",
        last_policy_change_at: "2026-06-12 08:00:00.000Z",
      })

      const outcome = await readSettings(GROUP_ID)

      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.lastPolicyChangeAt).toBe("2026-06-12T08:00:00.000Z")
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("treats a missing row as zero activity (not an error)", async () => {
    const savedEnv = isolatePromotionMode()
    try {
      mockQueryResult(undefined)

      const outcome = await readSettings(GROUP_ID)

      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.policyChanges).toBe(0)
      expect(outcome.data.gateChecks24h).toBe(0)
      expect(outcome.data.lastPolicyChangeAt).toBeNull()
      expect(isSettingsEmpty(outcome.data)).toBe(true)
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("returns null (degraded) when the pool cannot be constructed", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("missing config")
    })

    const outcome = await readSettings(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns null (degraded) when the connection is unreachable", async () => {
    const query = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:5432"))
    getPoolMock.mockReturnValue({ query })

    const outcome = await readSettings(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns a sanitized error on a genuine query failure", async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error('relation "events" does not exist secret=hunter2'))
    getPoolMock.mockReturnValue({ query })

    const outcome = await readSettings(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === true) throw new Error("expected error outcome")
    expect(outcome.error).toBe("Settings query failed")
    expect(outcome.error).not.toContain("hunter2")
  })

  it("maps degraded MCP subsystem status to 'unhealthy'", async () => {
    const savedEnv = isolatePromotionMode()
    try {
      mockQueryResult({
        policy_changes: "1",
        gate_checks_24h: "5",
        last_policy_change_at: new Date("2026-06-12T08:00:00.000Z"),
      })

      auditHealthMock.mockResolvedValue({
        subsystems: {
          postgres: { status: "healthy", latency_ms: 5 },
          neo4j: { status: "degraded", latency_ms: 0 },
          embedding_backfill: { status: "degraded", latency_ms: 0 },
          curator_queue: { status: "healthy", latency_ms: 2, pending_count: 10 },
          mcp_tools: { status: "healthy", latency_ms: 0, tool_count: 6 },
        },
        overall_status: "degraded",
      })

      const outcome = await readSettings(GROUP_ID)

      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.subsystemHealth.neo4j).toBe("unhealthy")
      expect(outcome.data.subsystemHealth.embeddingBackfill).toBe("unhealthy")
      expect(outcome.data.subsystemHealth.postgres).toBe("healthy")
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("maps unavailable MCP subsystem status to 'unhealthy'", async () => {
    const savedEnv = isolatePromotionMode()
    try {
      mockQueryResult({
        policy_changes: "0",
        gate_checks_24h: "0",
        last_policy_change_at: null,
      })

      auditHealthMock.mockResolvedValue({
        subsystems: {
          postgres: { status: "unavailable", latency_ms: 0 },
          neo4j: { status: "degraded", latency_ms: 0 },
          embedding_backfill: { status: "unavailable", latency_ms: 0 },
          curator_queue: { status: "healthy", latency_ms: 2, pending_count: 10 },
          mcp_tools: { status: "healthy", latency_ms: 0, tool_count: 6 },
        },
        overall_status: "unavailable",
      })

      const outcome = await readSettings(GROUP_ID)

      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.subsystemHealth.postgres).toBe("unhealthy")
      expect(outcome.data.subsystemHealth.embeddingBackfill).toBe("unhealthy")
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("falls back to 'unknown' subsystem health when MCP health report throws", async () => {
    const savedEnv = isolatePromotionMode()
    try {
      mockQueryResult({
        policy_changes: "2",
        gate_checks_24h: "8",
        last_policy_change_at: null,
      })

      auditHealthMock.mockRejectedValue(new Error("MCP gateway unreachable"))

      const outcome = await readSettings(GROUP_ID)

      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      // MCP health failure is non-fatal — subsystem health stays "unknown"
      expect(outcome.data.subsystemHealth.postgres).toBe("unknown")
      expect(outcome.data.subsystemHealth.neo4j).toBe("unknown")
      // But Postgres data still came through
      expect(outcome.data.policyChanges).toBe(2)
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("detects promotion mode 'auto' from env", async () => {
    const savedEnv = isolatePromotionMode()
    process.env.PROMOTION_MODE = "auto"

    try {
      mockQueryResult({
        policy_changes: "1",
        gate_checks_24h: "1",
        last_policy_change_at: null,
      })

      const outcome = await readSettings(GROUP_ID)

      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.promotionMode).toBe("auto")
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("detects promotion mode 'soc2' from env", async () => {
    const savedEnv = isolatePromotionMode()
    process.env.PROMOTION_MODE = "soc2"

    try {
      mockQueryResult({
        policy_changes: "1",
        gate_checks_24h: "1",
        last_policy_change_at: null,
      })

      const outcome = await readSettings(GROUP_ID)

      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.promotionMode).toBe("soc2")
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("sanitizes unexpected promotion mode to 'unknown'", async () => {
    const savedEnv = isolatePromotionMode()
    process.env.PROMOTION_MODE = "something-sensitive"

    try {
      mockQueryResult({
        policy_changes: "1",
        gate_checks_24h: "1",
        last_policy_change_at: null,
      })

      const outcome = await readSettings(GROUP_ID)

      if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
      expect(outcome.data.promotionMode).toBe("unknown")
      expect(outcome.data.promotionMode).not.toContain("something-sensitive")
    } finally {
      restorePromotionMode(savedEnv)
    }
  })
})

describe("isSettingsEmpty", () => {
  const base: SettingsSnapshot = {
    groupId: GROUP_ID,
    subsystemHealth: {
      postgres: "healthy",
      neo4j: "healthy",
      embeddingBackfill: "healthy",
      curatorQueueDepth: "healthy",
      mcpToolAvailability: "healthy",
    },
    policyChanges: 0,
    gateChecks24h: 0,
    lastPolicyChangeAt: null,
    promotionMode: "unknown",
  }

  it("is empty when there is no governance activity at all", () => {
    expect(isSettingsEmpty(base)).toBe(true)
  })

  it("is not empty when policy changes exist", () => {
    expect(isSettingsEmpty({ ...base, policyChanges: 3 })).toBe(false)
  })

  it("is not empty when gate checks occurred in the last 24h", () => {
    expect(isSettingsEmpty({ ...base, gateChecks24h: 5 })).toBe(false)
  })
})

describe("operational-state integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHealthyReport()
  })

  it("maps a live snapshot to ready via the contract", async () => {
    const savedEnv = isolatePromotionMode()
    try {
      mockQueryResult({
        policy_changes: "2",
        gate_checks_24h: "8",
        last_policy_change_at: new Date("2026-06-12T08:00:00.000Z"),
      })

      const outcome = await readSettings(GROUP_ID)
      const surface = resolveOperationalSurface({
        source: { id: "settings", systemOfRecord: "postgres:events+mcp:health" },
        outcome,
        isEmpty: isSettingsEmpty,
        freshnessMs: 30_000,
      })

      expect(surface.status).toBe("ready")
      expect(surface.data?.policyChanges).toBe(2)
    } finally {
      restorePromotionMode(savedEnv)
    }
  })

  it("maps an unreachable source to degraded via the contract", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("no config")
    })

    const outcome = await readSettings(GROUP_ID)
    const surface = resolveOperationalSurface({
      source: { id: "settings", systemOfRecord: "postgres:events+mcp:health" },
      outcome,
      isEmpty: isSettingsEmpty,
      freshnessMs: 30_000,
    })

    expect(surface.status).toBe("degraded")
    expect(surface.data).toBeNull()
  })
})