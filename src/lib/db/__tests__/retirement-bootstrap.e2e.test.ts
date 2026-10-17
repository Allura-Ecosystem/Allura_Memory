import { afterAll, describe, expect, it } from "vitest"
import { Pool } from "pg"
import { validateTenantTableInventory } from "../tenant-table-inventory"
import { SEMANTIC_SCHEMA_EVIDENCE, verifySemanticSchemaEvidence } from "../../memory/audit-evidence"

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

// Never commit policy/grant drift. Verify the actual connected DB as well as
// the URL before executing any DDL; pooled connections cannot retain SET ROLE.
async function catalogAsApp(drift?: string): Promise<boolean> {
  const client = await disposablePool().connect()
  try {
    const target = await client.query<{ name: string }>("SELECT current_database() AS name")
    if (target.rows[0]?.name !== new URL(url!).pathname.slice(1)
      || !/^allura_retirement_test_[a-z0-9_]+$/.test(target.rows[0]?.name ?? "")) {
      throw new Error("Connected database is not the explicitly selected disposable target")
    }
    await client.query("BEGIN")
    await client.query("SET LOCAL lock_timeout = '2s'")
    await client.query("SET LOCAL statement_timeout = '5s'")
    if (drift) await client.query(drift)
    await client.query("SET LOCAL ROLE allura_app")
    const result = await client.query(SEMANTIC_SCHEMA_EVIDENCE)
    return verifySemanticSchemaEvidence(result.rows)
  } finally {
    // DDL is transactional: even assertion/query errors must restore policies.
    try { await client.query("ROLLBACK") } finally { client.release(true) }
  }
}

describe.skipIf(!enabled)("final bootstrapped retirement schema", () => {
  it("accepts the real post-bootstrap active public inventory", async () => {
    expect(await validateTenantTableInventory(disposablePool())).toEqual({
      ok: true, missingRlsTables: [], unclassifiedTables: [],
    })
  })
  it("accepts the actual shipped tenant/workspace policy model as allura_app", async () => {
    expect(await catalogAsApp()).toBe(true)
  })
  it("does not require edge mutation or physical deletion grants", async () => {
    expect(await catalogAsApp("REVOKE UPDATE, DELETE ON public.graph_supersedes FROM allura_app; REVOKE DELETE ON public.graph_memories FROM allura_app")).toBe(true)
    expect(await catalogAsApp()).toBe(true)
  })
  it.each([
    ["missing permissive policies", "DROP POLICY tenant_isolation_policy ON public.graph_memories; DROP POLICY tenant_isolation_policy ON public.graph_supersedes"],
    ["wrong role", "ALTER POLICY tenant_isolation_policy ON public.graph_memories TO allura_migration"],
    ["wrong command", "DROP POLICY tenant_isolation_policy ON public.graph_memories; CREATE POLICY tenant_isolation_policy ON public.graph_memories FOR SELECT TO allura_app USING (group_id=current_setting('app.current_group_id',true))"],
    ["tenant USING impostor", "ALTER POLICY tenant_isolation_policy ON public.graph_memories USING (true)"],
    ["tenant CHECK impostor", "ALTER POLICY tenant_isolation_policy ON public.graph_memories WITH CHECK (true)"],
    ["workspace impostor", "ALTER POLICY workspace_scope_restrictive_policy ON public.graph_supersedes USING (true)"],
    ["missing SELECT", "REVOKE SELECT ON public.graph_memories FROM allura_app"],
    ["missing edge INSERT", "REVOKE INSERT ON public.graph_supersedes FROM allura_app"],
  ])("detects %s and rolls back all drift", async (_name, sql) => {
    expect(await catalogAsApp(sql)).toBe(false)
    expect(await catalogAsApp()).toBe(true)
  })
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
