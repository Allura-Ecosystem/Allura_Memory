import { afterAll, describe, expect, it } from "vitest"
import { Pool } from "pg"

// Parent must bootstrap ALL migrations in a new disposable database first.
// A separate explicit URL and name gate prevent use of normal application DBs.
const url = process.env.ALLURA_RETIREMENT_TEST_DATABASE_URL
const enabled = process.env.RUN_E2E_TESTS === "true" && !!url
let pool: Pool | undefined
function disposablePool(): Pool {
  if (!url || !/^\/allura_retirement_test_[a-z0-9_]+$/.test(new URL(url).pathname)) {
    throw new Error("A newly disposable allura_retirement_test_* database is required")
  }
  return pool ??= new Pool({ connectionString: url })
}
afterAll(async () => { await pool?.end() })

describe.skipIf(!enabled)("final bootstrapped retirement schema", () => {
  it("has no retired identifiers in live public columns", async () => {
    const result = await disposablePool().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public'`,
    )
    expect(result.rows.length).toBeGreaterThan(0)
    for (const row of result.rows) expect(row.column_name).not.toMatch(/neo4j/i)
  })
  it("retains historical tables in a schema unavailable to the app", async () => {
    const db = disposablePool()
    for (const name of ["design_sync_status", "sync_drift_log", "ruvector_memory_fallback"]) {
      const result = await db.query(`SELECT to_regclass($1) AS live, to_regclass($2) AS archived`, [`public.${name}`, `retired_storage.${name}`])
      expect(result.rows[0].live).toBeNull()
      expect(result.rows[0].archived).not.toBeNull()
    }
    const access = await db.query(`SELECT has_schema_privilege('allura_app','retired_storage','USAGE') AS allowed`)
    expect(access.rows[0].allowed).toBe(false)
  })
  it("contains no retired public relation names or current catalog descriptions", async () => {
    const result = await disposablePool().query(
      `SELECT c.relname,d.description FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       LEFT JOIN pg_description d ON d.objoid=c.oid AND d.classoid='pg_class'::regclass
       WHERE n.nspname='public'`,
    )
    expect(JSON.stringify(result.rows)).not.toMatch(/neo4j/i)
  })
})
