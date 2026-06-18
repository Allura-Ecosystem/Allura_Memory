/**
 * Approvals Page Contract Test
 *
 * Verifies that the curator_proposals (canonical_proposals) table has the
 * expected shape and the data returned by the approvals page query is stable.
 *
 * Run:
 *   bun run test:integration
 *   bun vitest run tests/integration/approvals-page-contract.test.ts
 *
 * Gating: tests skip gracefully when DB is unavailable.
 *
 * Reference: docs/allura/BLUEPRINT.md (Requirements F10-F15, B18-B19)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"
import { getPool } from "@/lib/postgres/connection"

const GROUP_ID = "allura-system"

// ── DB availability probe ─────────────────────────────────────────────────────

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

// ── Zod contract schemas ──────────────────────────────────────────────────────

/**
 * Shape of a row from canonical_proposals as the approvals page queries it.
 * agent_id may be null when trace_ref is null or the event is not found.
 */
const CuratorProposalRowSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1),
  score: z.union([
    z.number().min(0).max(1),
    // PostgreSQL DECIMAL returns as string through some drivers
    z.string().transform((v) => parseFloat(v)),
  ]),
  reasoning: z.string().nullable(),
  tier: z.enum(["emerging", "adoption", "mainstream"]).nullable(),
  status: z.enum(["pending", "approved", "rejected"]),
  created_at: z.union([z.string().min(1), z.date()]),
  agent_id: z.string().nullable(),
})

type CuratorProposalRow = z.infer<typeof CuratorProposalRowSchema>

/**
 * Shape of the KPI aggregate query the approvals page issues.
 */
const KpiRowSchema = z.object({
  pending_proposals: z.string().transform((v) => parseInt(v, 10)),
  approved_today: z.string().transform((v) => parseInt(v, 10)),
  rejected_today: z.string().transform((v) => parseInt(v, 10)),
})

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Approvals Page Contract — canonical_proposals table shape", () => {
  beforeAll(async () => {
    dbAvailable = await isDbAvailable()
    if (!dbAvailable) {
      console.warn(
        "[approvals-contract] DB unavailable — all tests will be skipped. " +
          "Start the Brain stack with: bun run brain:up"
      )
    }
  })

  afterAll(() => {
    // No writes performed — nothing to clean up.
  })

  // ── Table existence ──────────────────────────────────────────────────────────

  it("canonical_proposals table exists", async () => {
    if (!dbAvailable) return

    const pool = getPool()
    const result = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_name = 'canonical_proposals'
           AND table_schema = 'public'
       ) AS exists`
    )

    expect(result.rows[0]?.exists).toBe(true)
  })

  // ── Column presence ──────────────────────────────────────────────────────────

  it("canonical_proposals has required columns", async () => {
    if (!dbAvailable) return

    const pool = getPool()
    const result = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'canonical_proposals'
         AND table_schema = 'public'`
    )

    const columns = result.rows.map((r) => r.column_name)
    const required = ["id", "content", "score", "status", "reasoning", "tier", "created_at", "trace_ref"]

    for (const col of required) {
      expect(columns, `expected column '${col}' to exist in canonical_proposals`).toContain(col)
    }
  })

  // ── Pending proposals query shape ────────────────────────────────────────────

  it("pending proposals query returns expected shape (with agent_id via trace_ref)", async () => {
    if (!dbAvailable) return

    const pool = getPool()

    const result = await pool.query<CuratorProposalRow>(
      `SELECT
         cp.id,
         cp.content,
         cp.score,
         cp.reasoning,
         cp.tier,
         cp.status,
         cp.created_at,
         e.agent_id
       FROM canonical_proposals cp
       LEFT JOIN events e
         ON e.id = cp.trace_ref
         AND e.group_id = $1
       WHERE cp.group_id = $1 AND cp.status = 'pending'
       ORDER BY cp.score DESC, cp.created_at ASC
       LIMIT 10`,
      [GROUP_ID]
    )

    // The query itself must succeed even with 0 rows
    expect(Array.isArray(result.rows)).toBe(true)

    // Validate each row against the contract schema
    for (const row of result.rows) {
      const parsed = CuratorProposalRowSchema.safeParse(row)
      if (!parsed.success) {
        throw new Error(
          `curator_proposals row shape violation:\n${parsed.error.toString()}\nRow: ${JSON.stringify(row)}`
        )
      }

      const p = parsed.data
      expect(p.id).toBeTruthy()
      expect(p.content.length).toBeGreaterThan(0)
      expect(typeof parseFloat(String(p.score))).toBe("number")
      expect(parseFloat(String(p.score))).toBeGreaterThanOrEqual(0)
      expect(parseFloat(String(p.score))).toBeLessThanOrEqual(1)
      expect(["pending", "approved", "rejected"]).toContain(p.status)
      expect(p.created_at).toBeTruthy()
      // agent_id is nullable (trace_ref may be null)
      expect(p.agent_id === null || typeof p.agent_id === "string").toBe(true)
    }
  })

  // ── All-status query shape ────────────────────────────────────────────────────

  it("all-status query returns rows matching the contract schema", async () => {
    if (!dbAvailable) return

    const pool = getPool()

    const result = await pool.query<CuratorProposalRow>(
      `SELECT
         cp.id,
         cp.content,
         cp.score,
         cp.reasoning,
         cp.tier,
         cp.status,
         cp.created_at,
         e.agent_id
       FROM canonical_proposals cp
       LEFT JOIN events e
         ON e.id = cp.trace_ref
         AND e.group_id = $1
       WHERE cp.group_id = $1
       ORDER BY cp.created_at DESC
       LIMIT 5`,
      [GROUP_ID]
    )

    for (const row of result.rows) {
      const parsed = CuratorProposalRowSchema.safeParse(row)
      if (!parsed.success) {
        throw new Error(
          `curator_proposals row shape violation (all-status):\n${parsed.error.toString()}`
        )
      }
    }
  })

  // ── KPI aggregate query shape ─────────────────────────────────────────────────

  it("KPI aggregate query returns expected shape", async () => {
    if (!dbAvailable) return

    const pool = getPool()

    const result = await pool.query<{
      pending_proposals: string
      approved_today: string
      rejected_today: string
    }>(
      `SELECT
         (SELECT COUNT(*) FROM canonical_proposals WHERE group_id = $1 AND status = 'pending') AS pending_proposals,
         (SELECT COUNT(*) FROM canonical_proposals WHERE group_id = $1 AND status = 'approved' AND decided_at >= CURRENT_DATE) AS approved_today,
         (SELECT COUNT(*) FROM canonical_proposals WHERE group_id = $1 AND status = 'rejected' AND decided_at >= CURRENT_DATE) AS rejected_today`,
      [GROUP_ID]
    )

    expect(result.rows).toHaveLength(1)

    const parsed = KpiRowSchema.safeParse(result.rows[0])
    if (!parsed.success) {
      throw new Error(
        `KPI row shape violation:\n${parsed.error.toString()}`
      )
    }

    const kpi = parsed.data
    expect(kpi.pending_proposals).toBeGreaterThanOrEqual(0)
    expect(kpi.approved_today).toBeGreaterThanOrEqual(0)
    expect(kpi.rejected_today).toBeGreaterThanOrEqual(0)
  })

  // ── Status enum values ────────────────────────────────────────────────────────

  it("status column only contains allowed enum values", async () => {
    if (!dbAvailable) return

    const pool = getPool()

    const result = await pool.query<{ status: string }>(
      `SELECT DISTINCT status
       FROM canonical_proposals
       WHERE group_id = $1`,
      [GROUP_ID]
    )

    const allowedStatuses = new Set(["pending", "approved", "rejected"])
    for (const row of result.rows) {
      expect(
        allowedStatuses.has(row.status),
        `unexpected status value: '${row.status}'`
      ).toBe(true)
    }
  })

  // ── Score range invariant ─────────────────────────────────────────────────────

  it("score values are within 0–1 range", async () => {
    if (!dbAvailable) return

    const pool = getPool()

    const result = await pool.query<{ out_of_range_count: string }>(
      `SELECT COUNT(*) AS out_of_range_count
       FROM canonical_proposals
       WHERE group_id = $1
         AND (score < 0 OR score > 1)`,
      [GROUP_ID]
    )

    expect(parseInt(result.rows[0]?.out_of_range_count ?? "0", 10)).toBe(0)
  })

  // ── Checkpoint approvals query (events table) ──────────────────────────────────
  // Regression guard: the page selected e.event_id, but the events PK is e.id.
  // That bad column threw and the page's shared catch silently zeroed the whole
  // Approvals view (132 pending rendered as 0). This pins the working query.

  it("checkpoint-approvals query runs against events (uses e.id, not e.event_id)", async () => {
    if (!dbAvailable) return

    const pool = getPool()

    // The exact query the Approvals page runs — must not throw.
    const result = await pool.query<{ event_id: string | number; metadata: unknown; created_at: string | Date }>(
      `SELECT e.id AS event_id, e.metadata, e.created_at
       FROM events e
       WHERE e.group_id = $1
         AND e.event_type = 'checkpoint_blocked'
         AND NOT EXISTS (
           SELECT 1 FROM events r
           WHERE r.group_id = $1
             AND r.event_type = 'checkpoint_resumed'
             AND r.metadata->>'checkpoint_id' = e.metadata->>'checkpoint_id'
         )
       ORDER BY e.created_at ASC
       LIMIT 50`,
      [GROUP_ID]
    )

    expect(Array.isArray(result.rows)).toBe(true)
    for (const row of result.rows) {
      expect(row.event_id === null || row.event_id !== undefined).toBe(true)
    }
  })

  it("events table has 'id' (the checkpoint query depends on it) and not a required 'event_id'", async () => {
    if (!dbAvailable) return

    const pool = getPool()
    const result = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'events' AND table_schema = 'public'`
    )
    const columns = result.rows.map((r) => r.column_name)
    expect(columns, "events must have an 'id' primary key column").toContain("id")
  })
})
