import { beforeEach, describe, expect, it, vi } from "vitest"
import { supportedSemanticCatalog } from "../../../tests/fixtures/semantic-catalog"
import type { GroupId } from "./canonical-contracts"

let catalog = supportedSemanticCatalog()
const query = vi.fn(async (sql: string) => {
  if (sql.includes("pg_class")) return { rows: catalog }
  return { rows: [{ count: "0" }] }
})
vi.mock("@/mcp/canonical-tools/connection", () => ({ getConnections: async () => ({ pg: { query } }) }))
vi.mock("@/lib/db/tenant-transaction", () => ({ tenantQuery: async (_scope: unknown, sql: string) => query(sql) }))
vi.mock("@/mcp/canonical-tools/budget-circuit", () => ({ withCircuitBreaker: async (_s: string, _g: string, _op: string, fn: () => unknown) => fn() }))
import { audit_health_report, audit_invariant_check } from "@/mcp/audit-tools"

const group = "allura-test-catalog" as GroupId
const request = { group_id: group, scope: { group_id: group, workspace_id: "workspace-a", agent_id: "auditor" } }
describe("supported semantic catalog evidence", () => {
  beforeEach(() => { catalog = supportedSemanticCatalog() })
  it("accepts the shipped policy model without requiring immutable edge UPDATE/DELETE", async () => {
    expect((await audit_health_report(request)).subsystems.postgres.status).toBe("healthy")
  })
  it.each([
    "missing tenant", "wrong role", "inapplicable role", "wrong command", "using true", "check true",
    "restrictive impostor", "missing select", "missing insert", "missing memory update", "extra policy", "missing table", "missing schema access",
  ])("fails closed for %s", async (fault) => {
    const table = catalog[0]!
    if (fault === "missing tenant") table.policies.shift()
    if (fault === "wrong role") table.policies[0]!.roles = ["other_role"]
    if (fault === "inapplicable role") table.policies[0]!.applicable = false
    if (fault === "wrong command") table.policies[0]!.command = "r"
    if (fault === "using true") table.policies[0]!.using_expression = "true"
    if (fault === "check true") table.policies[0]!.check_expression = "true"
    if (fault === "restrictive impostor") table.policies[1]!.using_expression = "true"
    if (fault === "missing select") table.can_select = false
    if (fault === "missing insert") table.can_insert = false
    if (fault === "missing memory update") table.can_update = false
    if (fault === "extra policy") table.policies.push({ ...table.policies[0]!, name: "unreviewed", using_expression: "true" })
    if (fault === "missing table") catalog.pop()
    if (fault === "missing schema access") table.schema_verified = false
    expect((await audit_health_report(request)).subsystems.postgres.status).toBe("unavailable")
    expect((await audit_invariant_check(request)).overall_passed).toBe(false)
  })
})
