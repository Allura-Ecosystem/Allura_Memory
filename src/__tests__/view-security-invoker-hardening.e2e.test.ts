import { Pool, type PoolClient, type QueryResultRow } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// This suite exists because migration 51's ALTER VIEW ... SET
// (security_invoker = true) statements are a runtime RLS-enforcement
// contract, not a text pattern: a text-shape test (see
// src/lib/db/__tests__/view-security-invoker-hardening-migration.test.ts)
// can only prove the SQL contains the expected ALTER VIEW clauses -- it
// cannot prove a non-owner role actually gets zero rows back under RLS. Only
// a live database that has run migrations through 51 can prove that.
//
// This is the exact defect class proven live on a disposable PG16
// container: with a foreign tenant's app.current_group_id set, a view over
// an RLS-protected table returned another tenant's rows; with no tenant
// context set at all, the base table correctly returned 0 rows while the
// view returned rows anyway. The six views covered here
// (brooks_decisions, brooks_metrics, brooks_session_timeline,
// brooks_confidence_distribution, brooks_principles_applied -- all over
// `events`, and skill_usage_summary -- over `skill_usage_events`) had exactly
// that defect before migration 51.
//
// Env-var discipline: this file must skip cleanly with RUN_E2E_TESTS unset
// (the default for every non-live lane) and must not throw during test
// collection even when POSTGRES_APP_PASSWORD, POSTGRES_USER, or
// POSTGRES_APP_USER are unset -- a prior story's suite threw inside
// beforeAll on a missing env var and vitest surfaced every case in that file
// as "skipped" rather than "failed", which reads as green. All Pool
// construction here happens with `??` fallbacks (never a bare env var
// access that could be undefined at the `new Pool()` call site) and no Pool
// is created outside beforeAll/afterAll/it -- describeLive's factory body
// contains no code that can throw before the gate is evaluated.
const GROUP = "allura-view-invoker-e2e"
const FOREIGN_GROUP = "allura-view-invoker-e2e-foreign-tenant"
const WORKSPACE = "ws-view-invoker-e2e"

const HARDENED_VIEWS = [
  "brooks_decisions",
  "brooks_metrics",
  "brooks_session_timeline",
  "brooks_confidence_distribution",
  "brooks_principles_applied",
  "skill_usage_summary",
] as const

function makePool(user: string, password: string, max = 4) {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: process.env.POSTGRES_DB ?? "memory",
    user,
    password,
    max,
  })
}

const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_APP_PASSWORD ? describe : describe.skip

describeLive("Migration 51 security_invoker hardening against fresh allura_app PostgreSQL", () => {
  const owner = makePool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "")
  const app = makePool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "", 8)

  /** Runs `work` inside a transaction with the given tenant context set (or omitted entirely). */
  async function withContext<T>(
    client: PoolClient,
    context: { groupId: string; workspaceId?: string } | null,
    work: () => Promise<T>,
  ): Promise<T> {
    await client.query("BEGIN")
    try {
      if (context) {
        await client.query("SELECT set_config('app.current_group_id', $1, true)", [context.groupId])
        if (context.workspaceId !== undefined) {
          await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [context.workspaceId])
        }
      }
      const result = await work()
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  }

  async function queryAs<T extends QueryResultRow>(
    context: { groupId: string; workspaceId?: string } | null,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const client = await app.connect()
    try {
      if (context === null) {
        // Deliberately do not set any tenant context at all -- must fail closed.
        const result = await client.query<T>(sql, params)
        return result.rows
      }
      return await withContext(client, context, async () => {
        const result = await client.query<T>(sql, params)
        return result.rows
      })
    } finally {
      client.release()
    }
  }

  beforeAll(async () => {
    // These six views predate any GRANT to the app role -- unlike migration
    // 50's Bumblebee views, which grant SELECT in the same migration that
    // creates them, brooks_* and skill_usage_summary are today reachable
    // only by BYPASSRLS roles (allura / allura_migration). This GRANT
    // simulates the foreseeable next step of exposing these views to a real
    // tenant-facing consumer, which is exactly the scenario migration 51's
    // security_invoker = true protects: without it, this single GRANT
    // statement alone would open a live cross-tenant read of `events` and
    // `skill_usage_events` through the view layer.
    await owner.query(
      `GRANT SELECT ON brooks_decisions, brooks_metrics, brooks_session_timeline, ` +
        `brooks_confidence_distribution, brooks_principles_applied, skill_usage_summary TO allura_app`,
    )

    await owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ($1, $2, 'view invoker e2e') ON CONFLICT (workspace_id) DO NOTHING`,
      [WORKSPACE, GROUP],
    )

    const client = await app.connect()
    try {
      await withContext(client, { groupId: GROUP, workspaceId: WORKSPACE }, async () => {
        await client.query(
          `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, confidence, metadata, outcome, session_id)
           VALUES ($1, $2, 'ADR_CREATED', 'brooks', 'completed', 0.92, $3, '{}', $4)`,
          [GROUP, WORKSPACE, JSON.stringify({ principle: "conceptual-integrity" }), "view-invoker-e2e-session"],
        )
        await client.query(
          `INSERT INTO skill_usage_events (group_id, skill_name, success, token_count, duration_ms)
           VALUES ($1, 'allura-memory-skill', true, 500, 120)`,
          [GROUP],
        )
      })
    } finally {
      client.release()
    }
  })

  afterAll(async () => {
    await Promise.all([app.end(), owner.end()])
  })

  it("shows the fixture row through every hardened view for the real tenant -- proves the GRANT + hardening combination is not overly restrictive", async () => {
    for (const view of HARDENED_VIEWS) {
      const rows = await queryAs({ groupId: GROUP, workspaceId: WORKSPACE }, `SELECT * FROM ${view}`)
      expect(rows.length, `${view} should return the fixture row for its own tenant`).toBeGreaterThan(0)
    }
  })

  // Regression coverage for the CRITICAL cross-tenant leak this migration
  // closes: before migration 51, these views executed with the (BYPASSRLS)
  // owner's privileges instead of the querying role's, silently bypassing
  // FORCE ROW LEVEL SECURITY on `events` / `skill_usage_events`. This is the
  // exact assertion whose absence let that class of leak reach a live
  // database -- if any of these views ever regresses to a default-owner
  // view, these must fail.
  describe("tenant isolation (the assertion that would have caught the CRITICAL view leak)", () => {
    it("returns zero rows from every hardened view for a foreign tenant's group_id, even though the fixture row exists under the real tenant", async () => {
      for (const view of HARDENED_VIEWS) {
        const rows = await queryAs(
          { groupId: FOREIGN_GROUP, workspaceId: WORKSPACE },
          `SELECT count(*)::int AS n FROM ${view}`,
        )
        expect(rows[0].n, `${view} should return zero rows for a foreign tenant`).toBe(0)
      }
    })

    it("fails closed -- returns zero rows from every hardened view when no tenant context is set at all", async () => {
      for (const view of HARDENED_VIEWS) {
        const rows = await queryAs(null, `SELECT count(*)::int AS n FROM ${view}`)
        expect(rows[0].n, `${view} should return zero rows with no tenant context`).toBe(0)
      }
    })
  })
})
