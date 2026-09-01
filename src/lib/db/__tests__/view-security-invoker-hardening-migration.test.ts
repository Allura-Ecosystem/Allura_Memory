import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Text-shape assertions only: this proves the migration file contains the
// expected DDL statements. It CANNOT prove the views actually return rows
// under RLS as a non-owner role, or that the fix is effective against a live
// FORCE ROW LEVEL SECURITY base table -- see
// src/__tests__/view-security-invoker-hardening.e2e.test.ts for that proof.
describe("migration 51 security_invoker hardening relational contract", () => {
  const sql = readFileSync(
    join(process.cwd(), "docker/postgres-init/51-view-security-invoker-hardening.sql"),
    "utf8",
  )

  const AFFECTED_VIEWS = [
    "brooks_decisions",
    "brooks_metrics",
    "brooks_session_timeline",
    "brooks_confidence_distribution",
    "brooks_principles_applied",
    "skill_usage_summary",
  ]

  it("wraps the migration in a transaction and records schema_versions", () => {
    expect(sql).toMatch(/\nBEGIN;\n/)
    expect(sql).toContain("INSERT INTO schema_versions (version, applied_at, description)")
    expect(sql).toContain("VALUES ('051',")
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true)
  })

  it("hardens every affected view with ALTER VIEW ... SET (security_invoker = true) -- the surgical, forward-only form", () => {
    for (const view of AFFECTED_VIEWS) {
      expect(sql).toContain(`ALTER VIEW ${view} SET (security_invoker = true);`)
    }
  })

  it("does not issue CREATE (OR REPLACE) VIEW as a statement -- this migration must not redefine view bodies, only their reloptions", () => {
    expect(sql).not.toMatch(/^\s*CREATE (OR REPLACE )?VIEW/m)
  })

  it("never uses SECURITY DEFINER -- that would strip tenant scoping in the opposite direction", () => {
    expect(sql).not.toContain("SECURITY DEFINER")
  })

  it("covers exactly the six views identified as leaking FORCE RLS on events / skill_usage_events, no more and no fewer", () => {
    const alterClauses = [...sql.matchAll(/ALTER VIEW (\w+) SET \(security_invoker = true\);/g)]
      .map((m) => m[1])
      .sort()
    expect(alterClauses).toEqual([...AFFECTED_VIEWS].sort())
  })

  it("documents why ALTER VIEW is used instead of editing the already-applied migrations 10 and 32", () => {
    expect(sql).toContain("10-brooks-tracking.sql")
    expect(sql).toContain("32-skill-usage-events.sql")
    expect(sql).toMatch(/ALTER VIEW \.\.\. SET/)
  })
})
