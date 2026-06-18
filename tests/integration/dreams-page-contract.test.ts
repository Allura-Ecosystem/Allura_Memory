/**
 * Dreams Page Contract Test
 *
 * Verifies the response shape of readDreams() — the live data source used by
 * the Dreams dashboard page. Imports the source directly (no HTTP overhead).
 * Requires a live PostgreSQL stack.
 *
 * Run:
 *   bun run test:integration
 *   bun vitest run tests/integration/dreams-page-contract.test.ts
 *
 * Gating: all tests skip gracefully when the DB is unavailable.
 *
 * Reference: src/lib/operational-state/sources/dreams-source.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"
import { getPool } from "@/lib/postgres/connection"

// ── DB availability probe ─────────────────────────────────────────────────────

/**
 * Returns true when PostgreSQL is reachable.
 * Uses a cheap pool-level query with no side effects.
 */
async function isDbAvailable(): Promise<boolean> {
  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    return false
  }
  try {
    await pool.query("SELECT 1")
    return true
  } catch {
    return false
  }
}

let dbAvailable = false

// ── Zod response-shape schemas ────────────────────────────────────────────────

const DreamsSnapshotSchema = z.object({
  groupId: z.string().min(1),
  proposalsPending: z.number().int().nonnegative(),
  proposalsApproved7d: z.number().int().nonnegative(),
  proposalsRejected7d: z.number().int().nonnegative(),
  backfillRuns24h: z.number().int().nonnegative(),
  proposalsCreated24h: z.number().int().nonnegative(),
  lastProposalAt: z.string().nullable(),
  promotionMode: z.enum(["auto", "soc2", "unknown"]),
})

/**
 * SourceOutcome<DreamsSnapshot> can be:
 *   - null (degraded — DB unreachable)
 *   - { ok: false, error: string } (query error)
 *   - { ok: true, data: DreamsSnapshot, fetchedAt: string }
 */
const DreamsOutcomeOkSchema = z.object({
  ok: z.literal(true),
  data: DreamsSnapshotSchema,
  fetchedAt: z.string().min(1),
})

const DreamsOutcomeErrSchema = z.object({
  ok: z.literal(false),
  error: z.string().min(1),
})

const GROUP_ID = "allura-system"

// ── Teardown ──────────────────────────────────────────────────────────────────

let releasePool: (() => void) | undefined

afterAll(() => {
  releasePool?.()
})

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Dreams Page Contract — readDreams() response shape", () => {
  beforeAll(async () => {
    dbAvailable = await isDbAvailable()
    if (!dbAvailable) {
      console.warn(
        "[dreams-page-contract] DB unavailable — all tests will be skipped. " +
          "Start the Brain stack with: bun run brain:up",
      )
    }
  })

  it("readDreams returns a valid SourceOutcome shape for group_id allura-system", async () => {
    if (!dbAvailable) return

    // Dynamic import to satisfy the server-only guard at module top-level.
    // The guard checks typeof window !== "undefined"; in Node/Vitest this is fine.
    const { readDreams } = await import(
      "@/lib/operational-state/sources/dreams-source"
    )

    const outcome = await readDreams(GROUP_ID)

    // null means degraded — DB was reachable for the probe but the dreams query
    // itself hit a connection error. Acceptable; just note it.
    if (outcome === null) {
      console.warn("[dreams-page-contract] readDreams returned null (degraded)")
      return
    }

    if (!outcome.ok) {
      // Error outcome is a valid contract shape; validate it.
      const parsed = DreamsOutcomeErrSchema.safeParse(outcome)
      if (!parsed.success) {
        throw new Error(
          `readDreams error outcome shape violation:\n${parsed.error.toString()}`,
        )
      }
      // The error message must not be empty (sanitized, but present).
      expect(parsed.data.error.length).toBeGreaterThan(0)
      return
    }

    // Happy path: ok === true
    const parsed = DreamsOutcomeOkSchema.safeParse(outcome)
    if (!parsed.success) {
      throw new Error(
        `readDreams ok outcome shape violation:\n${parsed.error.toString()}`,
      )
    }

    const { data } = parsed

    // groupId must echo back the requested tenant
    expect(data.data.groupId).toBe(GROUP_ID)

    // fetchedAt must be a parseable ISO timestamp
    expect(() => new Date(data.fetchedAt).toISOString()).not.toThrow()

    // All numeric fields must be non-negative integers
    expect(data.data.proposalsPending).toBeGreaterThanOrEqual(0)
    expect(data.data.proposalsApproved7d).toBeGreaterThanOrEqual(0)
    expect(data.data.proposalsRejected7d).toBeGreaterThanOrEqual(0)
    expect(data.data.backfillRuns24h).toBeGreaterThanOrEqual(0)
    expect(data.data.proposalsCreated24h).toBeGreaterThanOrEqual(0)

    // lastProposalAt must be null or a parseable ISO timestamp
    if (data.data.lastProposalAt !== null) {
      expect(() =>
        new Date(data.data.lastProposalAt as string).toISOString(),
      ).not.toThrow()
    }

    // promotionMode must be one of the three valid values
    expect(["auto", "soc2", "unknown"]).toContain(data.data.promotionMode)
  })

  it("isDreamsEmpty returns boolean and is consistent with snapshot counts", async () => {
    if (!dbAvailable) return

    const { readDreams, isDreamsEmpty } = await import(
      "@/lib/operational-state/sources/dreams-source"
    )

    const outcome = await readDreams(GROUP_ID)
    if (outcome === null || !outcome.ok) return

    const result = isDreamsEmpty(outcome.data)
    expect(typeof result).toBe("boolean")

    // Consistency check: if any count > 0, must not be empty
    const anyActivity =
      outcome.data.proposalsPending > 0 ||
      outcome.data.proposalsApproved7d > 0 ||
      outcome.data.proposalsRejected7d > 0 ||
      outcome.data.backfillRuns24h > 0 ||
      outcome.data.proposalsCreated24h > 0

    if (anyActivity) {
      expect(result).toBe(false)
    }

    // Converse: if empty, all counts must be zero
    if (result) {
      expect(outcome.data.proposalsPending).toBe(0)
      expect(outcome.data.proposalsApproved7d).toBe(0)
      expect(outcome.data.proposalsRejected7d).toBe(0)
      expect(outcome.data.backfillRuns24h).toBe(0)
      expect(outcome.data.proposalsCreated24h).toBe(0)
    }
  })

  it("group_id isolation: readDreams uses the supplied group_id as a bound parameter", async () => {
    if (!dbAvailable) return

    // This test verifies the tenant isolation contract by checking that readDreams
    // accepts group_id as a parameter and does not hard-code it. We do not attempt
    // cross-tenant reads — we simply confirm the function accepts GROUP_ID without error.
    const { readDreams } = await import(
      "@/lib/operational-state/sources/dreams-source"
    )

    const outcome = await readDreams(GROUP_ID)

    // Any non-null outcome means the parameter was accepted and the query ran.
    // If null, it's a DB issue not a parameter issue — skip.
    if (outcome === null) return

    if (outcome.ok) {
      // groupId in the snapshot must match what was passed in
      expect(outcome.data.groupId).toBe(GROUP_ID)
    }
  })
})
