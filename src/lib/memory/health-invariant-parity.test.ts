/**
 * Health and invariant reports reflect only ACTIVE components (PostgreSQL +
 * RuVector). Reports distinguish verified catalog/data evidence from untested
 * retrieval/tool behavior; no retired component may appear in either.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { supportedSemanticCatalog } from "../../../tests/fixtures/semantic-catalog"
import { SEMANTIC_SCHEMA_EVIDENCE } from "./audit-evidence"

const pgQuery = vi.fn()

vi.mock("@/mcp/canonical-tools/connection", () => ({
  getConnections: vi.fn(async () => ({ pg: { query: pgQuery, connect: vi.fn() } })),
  resetConnections: vi.fn(),
}))

vi.mock("@/mcp/canonical-tools/budget-circuit", () => ({
  withCircuitBreaker: vi.fn(async (_s: string, _g: string, _op: string, fn: () => unknown) => fn()),
}))

vi.mock("@/lib/db/tenant-transaction", () => ({
  tenantQuery: vi.fn(async (_scope, sql, values) => pgQuery(sql, values)),
}))

import { audit_health_report, audit_invariant_check } from "@/mcp/audit-tools"
import type { GroupId } from "@/lib/memory/canonical-contracts"

const GROUP = "allura-test-health" as GroupId
const request = { group_id: GROUP, scope: { group_id: GROUP, workspace_id: "workspace-a", agent_id: "auditor" } }

function evidenceRows(sql: string) {
  if (sql === SEMANTIC_SCHEMA_EVIDENCE) return { rows: supportedSemanticCatalog(), rowCount: 2 }
  if (sql.includes("AS verified")) return { rows: [{ verified: true }], rowCount: 1 }
  if (sql.includes("pg_constraint")) return { rows: [{ count: "1" }], rowCount: 1 }
  if (sql.includes("COUNT(*)")) return { rows: [{ count: "0" }], rowCount: 1 }
  if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 }
  throw new Error(`Unexpected evidence query: ${sql}`)
}

describe("audit reports with bounded active-store evidence", () => {
  beforeEach(() => {
    pgQuery.mockReset()
    // Healthy database: the group_id CHECK constraint exists, every other
    // violation count is zero.
    pgQuery.mockImplementation(async (sql: string) => evidenceRows(sql))
  })

  it("health report labels verified schema and unverified tool behavior separately", async () => {
    const report = await audit_health_report(request)
    expect(report.subsystems.postgres.status).toBe("healthy")
    expect(Object.keys(report.subsystems)).toEqual(
      expect.not.arrayContaining(["neo4j", "graph", "graph_store"])
    )
    expect(JSON.stringify(report).toLowerCase()).not.toContain("neo4j")
    expect(report.overall_status).toBe("degraded")
    expect(report.subsystems.mcp_tools.tool_count).toBeUndefined()
    expect(report.subsystems.postgres.detail).toContain("retrieval freshness")
  })

  it("invariant report passes fully and emits no retired-backend invariants", async () => {
    const report = await audit_invariant_check(request)
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
      return evidenceRows(sql)
    })
    const report = await audit_invariant_check(request)
    expect(report.invariants.find((item) => item.key === "graph_supersedes")).toMatchObject({
      passed: false,
      violation_count: 1,
      detail: "graph_supersedes check failed: semantic table unavailable",
    })
  })

  it("does not report schema health from a successful connectivity query", async () => {
    pgQuery.mockImplementation(async (sql: string) => sql === SEMANTIC_SCHEMA_EVIDENCE
      ? { rows: supportedSemanticCatalog().map((row) => ({ ...row, schema_verified: false })) }
      : evidenceRows(sql))
    expect((await audit_health_report(request)).overall_status).toBe("unavailable")
    expect((await audit_invariant_check(request)).overall_passed).toBe(false)
  })

  it.each(["invalid_lineage", "JOIN governance_receipts"])("fails on invalid semantic evidence: %s", async (marker) => {
    pgQuery.mockImplementation(async (sql: string) => sql.includes(marker) ? { rows: [{ count: "1" }] } : evidenceRows(sql))
    expect((await audit_invariant_check(request)).overall_passed).toBe(false)
  })

  it("fails closed without workspace authority rather than treating RLS-hidden rows as clean", async () => {
    expect((await audit_invariant_check({ group_id: GROUP })).overall_passed).toBe(false)
    expect((await audit_health_report({ group_id: GROUP })).overall_status).toBe("unavailable")
  })
  it("fails when a count query returns no evidence row", async () => {
    pgQuery.mockImplementation(async (sql: string) => sql.includes("invalid_lineage") ? { rows: [] } : evidenceRows(sql))
    const report = await audit_invariant_check(request)
    expect(report.invariants.find((entry) => entry.key === "graph_supersedes")).toMatchObject({ passed: false, violation_count: 1 })
  })
})
