/**
 * Overview Page + Header Contract Test
 *
 * Verifies the live reads behind the Command Center Overview page and the
 * DashboardHeader (getHeaderState) have a stable shape:
 *   - events table shape used by recent-receipts + freshness reads
 *   - KPI COUNT(*) queries (allura_memories / canonical_proposals / mcp_tokens / workspaces)
 *
 * Run:
 *   bun run test:integration
 *   bun vitest run tests/integration/overview-page-contract.test.ts
 *
 * Gating: tests skip gracefully when DB is unavailable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"
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

// Shape of a receipt row as the Overview page + header read it.
const ReceiptRowSchema = z.object({
  id: z.string().min(1),
  event_type: z.string().min(1),
  agent_id: z.string().min(1),
  status: z.string().min(1),
  created_at: z.union([z.string().min(1), z.date()]),
})

describe("Overview + Header Contract — events table shape", () => {
  beforeAll(async () => {
    dbAvailable = await isDbAvailable()
    if (!dbAvailable) {
      console.warn(
        "[overview-contract] DB unavailable — all tests will be skipped. " +
          "Start the Brain stack with: bun run brain:up"
      )
    }
  })

  afterAll(() => {
    // No writes performed — nothing to clean up.
  })

  it("events table has the columns the Overview/header reads depend on", async () => {
    if (!dbAvailable) return
    const pool = getPool()
    const result = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'events' AND table_schema = 'public'`
    )
    const columns = result.rows.map((r) => r.column_name)
    for (const col of ["id", "group_id", "event_type", "agent_id", "status", "created_at"]) {
      expect(columns, `expected column '${col}' on events`).toContain(col)
    }
  })

  it("recent-receipts query returns rows matching the contract schema", async () => {
    if (!dbAvailable) return
    const pool = getPool()
    const result = await pool.query(
      `SELECT id::text, event_type, agent_id, status, created_at
       FROM events WHERE group_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [GROUP_ID]
    )
    expect(Array.isArray(result.rows)).toBe(true)
    for (const row of result.rows) {
      const parsed = ReceiptRowSchema.safeParse(row)
      if (!parsed.success) {
        throw new Error(`events receipt row shape violation:\n${parsed.error.toString()}`)
      }
    }
  })

  it("header freshness query (MAX + 24h count) returns expected shape", async () => {
    if (!dbAvailable) return
    const pool = getPool()
    const [latest, recent] = await Promise.all([
      pool.query<{ max: string | Date | null }>(
        `SELECT MAX(created_at) AS max FROM events WHERE group_id = $1`,
        [GROUP_ID]
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM events
         WHERE group_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
        [GROUP_ID]
      ),
    ])
    expect(latest.rows).toHaveLength(1)
    expect(recent.rows).toHaveLength(1)
    const max = latest.rows[0]?.max
    // pg driver returns timestamptz as a Date; header-source wraps with new Date()
    expect(max === null || typeof max === "string" || max instanceof Date).toBe(true)
    expect(parseInt(recent.rows[0]?.n ?? "0", 10)).toBeGreaterThanOrEqual(0)
  })

  it("KPI COUNT(*) queries are group-scoped and return non-negative integers", async () => {
    if (!dbAvailable) return
    const pool = getPool()
    const sources = [
      `SELECT COUNT(*)::text AS n FROM allura_memories WHERE group_id = $1`,
      `SELECT COUNT(*)::text AS n FROM canonical_proposals WHERE group_id = $1 AND status = 'pending'`,
      `SELECT COUNT(*)::text AS n FROM mcp_tokens WHERE group_id = $1 AND revoked_at IS NULL`,
      `SELECT COUNT(*)::text AS n FROM workspaces WHERE group_id = $1`,
    ]
    for (const sql of sources) {
      const res = await pool.query<{ n: string }>(sql, [GROUP_ID])
      expect(res.rows).toHaveLength(1)
      expect(parseInt(res.rows[0]?.n ?? "-1", 10)).toBeGreaterThanOrEqual(0)
    }
  })
})
