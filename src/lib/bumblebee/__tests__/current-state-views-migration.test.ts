import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Text-shape assertions only: this proves the migration file contains the
// expected DDL statements. It CANNOT prove the views actually return rows
// under RLS as the app role, that generation replacement works, or that
// profile partitioning is enforced at query time -- see
// src/__tests__/bumblebee-current-state-views.e2e.test.ts for that proof.
describe("Story 26.7 Bumblebee current-state views relational contract", () => {
  const sql = readFileSync(
    join(process.cwd(), "docker/postgres-init/50-bumblebee-current-state-views.sql"),
    "utf8",
  )

  it("wraps the migration in a transaction and records schema_versions", () => {
    expect(sql.trimStart().startsWith("--")).toBe(true)
    expect(sql).toMatch(/\nBEGIN;\n/)
    expect(sql).toContain("INSERT INTO schema_versions (version, applied_at, description)")
    expect(sql).toContain("VALUES ('050',")
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true)
  })

  it("defines all three contract-item-10 views", () => {
    expect(sql).toContain("CREATE OR REPLACE VIEW bumblebee_current_routine_runs")
    expect(sql).toContain("CREATE OR REPLACE VIEW bumblebee_current_inventory")
    expect(sql).toContain("CREATE OR REPLACE VIEW bumblebee_incomplete_runs")
  })

  it("never creates any view as SECURITY DEFINER -- that would strip tenant scoping", () => {
    expect(sql).not.toContain("SECURITY DEFINER")
  })

  it("declares security_invoker = true on all three views -- a default-owner view would bypass RLS via a BYPASSRLS owner", () => {
    // A plain view (security_invoker = false, the PostgreSQL default) executes
    // with the OWNER's privileges and RLS context. These views are created by
    // the migration-applying role, which carries BYPASSRLS, so without this
    // clause FORCE ROW LEVEL SECURITY on the base tables is silently bypassed
    // for every caller that queries through the view -- a live cross-tenant
    // leak, not a theoretical one.
    const invokerClauses = [...sql.matchAll(/CREATE OR REPLACE VIEW (\w+) WITH \(security_invoker = true\) AS/g)]
      .map((m) => m[1])
    expect(invokerClauses.sort()).toEqual([
      "bumblebee_current_inventory",
      "bumblebee_current_routine_runs",
      "bumblebee_incomplete_runs",
    ])
  })

  it("partitions by the full population key, not source_id alone", () => {
    // Every partitioning clause in this migration must key on the immutable
    // source-revision binding plus profile, never on source_id alone -- a
    // later revision of the same source_id is a different endpoint
    // population and must never be unioned with an older revision's rows.
    const partitionClauses = [...sql.matchAll(/PARTITION BY ([^\n]+)/g)].map((m) => m[1])
    expect(partitionClauses.length).toBeGreaterThan(0)
    for (const clause of partitionClauses) {
      expect(clause).toContain("l.group_id, l.workspace_id, l.source_id, l.source_revision_id, l.profile")
    }
  })

  it("excludes deep from the inventory and routine views but not from incomplete_runs", () => {
    const routineViewStart = sql.indexOf("CREATE OR REPLACE VIEW bumblebee_current_routine_runs")
    const inventoryViewStart = sql.indexOf("CREATE OR REPLACE VIEW bumblebee_current_inventory")
    const incompleteViewStart = sql.indexOf("CREATE OR REPLACE VIEW bumblebee_incomplete_runs")
    const grantsStart = sql.indexOf("-- ── Grants")

    const routineViewSql = sql.slice(routineViewStart, inventoryViewStart)
    const inventoryViewSql = sql.slice(inventoryViewStart, incompleteViewStart)
    const incompleteViewSql = sql.slice(incompleteViewStart, grantsStart)

    expect(routineViewSql).toContain("l.profile IN ('baseline', 'project')")
    expect(inventoryViewSql).toContain("l.profile <> 'deep'")
    expect(incompleteViewSql).not.toContain("profile <> 'deep'")
    expect(incompleteViewSql).not.toContain("profile IN ('baseline', 'project')")
  })

  it("filters current_inventory on decision='promoted' and joins records by lease_id + batch_id + record_type='package'", () => {
    expect(sql).toContain("rd.decision = 'promoted' AND l.profile <> 'deep'")
    expect(sql).toContain("AND r.lease_id = cpb.lease_id AND r.batch_id = cpb.batch_id AND r.record_type = 'package'")
  })

  it("computes current generation as MAX(generation) among promoted batches, not MAX over all leases", () => {
    expect(sql).toContain("MAX(generation) AS generation\n  FROM promoted_batches")
  })

  it("exposes generation, decided_at, and freshness_ttl_seconds instead of hardcoding a staleness window", () => {
    expect(sql).toContain("s.freshness_ttl_seconds")
    expect(sql).not.toMatch(/INTERVAL '[0-9]+ (second|minute|hour|day)/)
  })

  it("grants SELECT on each view explicitly -- a base-table grant does not extend to a view", () => {
    expect(sql).toContain("GRANT SELECT ON bumblebee_current_routine_runs TO allura_app")
    expect(sql).toContain("GRANT SELECT ON bumblebee_current_inventory TO allura_app")
    expect(sql).toContain("GRANT SELECT ON bumblebee_incomplete_runs TO allura_app")
  })

  it("adds the three essential supporting indexes", () => {
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS bumblebee_run_decisions_partition_decision_idx\n  ON bumblebee_run_decisions (group_id, workspace_id, source_id, source_revision_id, decision, lease_id, batch_id)",
    )
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS bumblebee_scan_leases_partition_generation_idx\n  ON bumblebee_scan_leases (group_id, workspace_id, source_id, source_revision_id, profile, generation DESC)",
    )
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS bumblebee_records_lease_type_idx\n  ON bumblebee_records (group_id, workspace_id, source_id, lease_id, record_type)",
    )
  })
})
