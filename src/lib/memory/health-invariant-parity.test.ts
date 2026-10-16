/**
 * Health and invariant reports reflect only ACTIVE components (PostgreSQL +
 * RuVector). When every active service is healthy the reports must be
 * healthy/passing, and no retired component may appear in either.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const pgQuery = vi.fn()

vi.mock("@/mcp/canonical-tools/connection", () => ({
  getConnections: vi.fn(async () => ({ pg: { query: pgQuery, connect: vi.fn() } })),
  resetConnections: vi.fn(),
}))

vi.mock("@/mcp/canonical-tools/budget-circuit", () => ({
  withCircuitBreaker: vi.fn(async (_s: string, _g: string, _op: string, fn: () => unknown) => fn()),
}))

vi.mock("@/lib/postgres/tenant-query", () => ({
  tenantQuery: vi.fn(async () => ({ rows: [], rowCount: 0 })),
}))

import { audit_health_report, audit_invariant_check } from "@/mcp/audit-tools"
import type { GroupId } from "@/lib/memory/canonical-contracts"

const GROUP = "allura-test-health" as GroupId

describe("audit reports with all active services healthy", () => {
  beforeEach(() => {
    pgQuery.mockReset()
    // Healthy database: the group_id CHECK constraint exists, every other
    // violation count is zero.
    pgQuery.mockImplementation(async (sql: string) => ({
      rows: [{ count: /table_constraints/.test(sql) ? "1" : "0", cnt: "0", n: "0" }],
      rowCount: 1,
    }))
  })

  it("health report is healthy and lists no retired subsystem", async () => {
    const report = await audit_health_report({ group_id: GROUP })
    expect(report.subsystems.postgres.status).toBe("healthy")
    expect(Object.keys(report.subsystems)).toEqual(
      expect.not.arrayContaining(["neo4j", "graph", "graph_store"])
    )
    expect(JSON.stringify(report).toLowerCase()).not.toContain("neo4j")
    expect(report.overall_status).toBe("healthy")
  })

  it("invariant report passes fully and emits no retired-backend invariants", async () => {
    const report = await audit_invariant_check({ group_id: GROUP })
    const text = JSON.stringify(report).toLowerCase()
    expect(text).not.toContain("neo4j")
    expect(report.invariants.length).toBeGreaterThan(0)
    expect(report.invariants.filter((i) => !i.passed)).toEqual([])
    expect(pgQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM graph_supersedes"),
      [GROUP]
    )
  })

  it("fails the semantic versioning read check when its table is unavailable", async () => {
    pgQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM graph_supersedes")) throw new Error("semantic table unavailable")
      return { rows: [{ count: /table_constraints/.test(sql) ? "1" : "0" }], rowCount: 1 }
    })
    const report = await audit_invariant_check({ group_id: GROUP })
    expect(report.invariants.find((item) => item.key === "graph_supersedes")).toMatchObject({
      passed: false,
      violation_count: 1,
      detail: "graph_supersedes check failed: semantic table unavailable",
    })
  })
})
