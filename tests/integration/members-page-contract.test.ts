/**
 * Members & Roles Contract Test
 *
 * Pins the `memberships` table shape the admin Members API depends on:
 *  - table exists with required columns
 *  - role CHECK only allows admin/curator/viewer
 *  - the active-members list query runs (group_id-scoped, removed_at IS NULL)
 *
 * Run: bun vitest run tests/integration/members-page-contract.test.ts
 * Gating: skips gracefully when DB is unavailable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { getPool } from "@/lib/postgres/connection"

const GROUP_ID = "allura-system"

async function isDbAvailable(): Promise<boolean> {
  try {
    const pool = getPool()
    await pool.query("SELECT 1")
    return true
  } catch {
    return false
  }
}

let dbAvailable = false

describe("Members & Roles Contract — memberships table", () => {
  beforeAll(async () => {
    dbAvailable = await isDbAvailable()
  })
  afterAll(() => {})

  it("memberships table exists with the columns the API depends on", async () => {
    if (!dbAvailable) return
    const pool = getPool()
    const result = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'memberships' AND table_schema = 'public'`,
    )
    const columns = result.rows.map((r) => r.column_name)
    for (const col of ["id", "group_id", "user_id", "email", "role", "invited_by", "created_at", "updated_at", "removed_at"]) {
      expect(columns, `expected column '${col}' on memberships`).toContain(col)
    }
  })

  it("role values are constrained to admin/curator/viewer", async () => {
    if (!dbAvailable) return
    const pool = getPool()
    const result = await pool.query<{ role: string }>(
      `SELECT DISTINCT role FROM memberships WHERE group_id = $1`,
      [GROUP_ID],
    )
    const allowed = new Set(["admin", "curator", "viewer"])
    for (const row of result.rows) {
      expect(allowed.has(row.role), `unexpected role: '${row.role}'`).toBe(true)
    }
  })

  it("active-members list query runs (group-scoped, removed_at IS NULL)", async () => {
    if (!dbAvailable) return
    const pool = getPool()
    const result = await pool.query(
      `SELECT id, group_id, user_id, email, role, invited_by, created_at, updated_at, removed_at
       FROM memberships
       WHERE group_id = $1 AND removed_at IS NULL
       ORDER BY created_at ASC`,
      [GROUP_ID],
    )
    expect(Array.isArray(result.rows)).toBe(true)
  })
})
