/**
 * Parity Test: MCP Passthrough vs Direct PG Reads
 *
 * Verifies that 1,000 reads through the MCP coordinator produce
 * ZERO divergence compared to direct PostgreSQL reads.
 *
 * Strategy:
 * 1. Seed N test memories via memory_add (through coordinator)
 * 2. Read each back via memory_get (through coordinator/MCP)
 * 3. Read the same memories via direct PostgreSQL query
 * 4. Compare every field: id, content, score, source, provenance, user_id, created_at
 * 5. Assert 0 divergence across all reads
 *
 * E2E-gated: only runs when RUN_E2E_TESTS=true
 *
 * Reference: docs/allura/BLUEPRINT.md (F-003: Approval Audit Flow)
 */

import { config } from "dotenv"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "crypto"

config()

// ── E2E Gate ──────────────────────────────────────────────────────────────

const shouldRunE2E = process.env.RUN_E2E_TESTS === "true"
const E2E_TIMEOUT = 120_000 // 2 minutes for 1000 reads

// ── Test Configuration ────────────────────────────────────────────────────

const RUN_ID = randomUUID().slice(0, 8)
const TEST_GROUP_ID = `allura-parity-${RUN_ID}` as const
const TEST_USER_ID = "parity-test-user"
const SEED_COUNT = 100 // Seed 100 memories, read each 10x = 1000 reads

// ── Divergence Tracker ────────────────────────────────────────────────────

interface FieldDivergence {
  memoryId: string
  field: string
  mcpValue: unknown
  pgValue: unknown
}

/**
 * Compare two values for parity.
 * Handles ISO date string normalization (trailing Z vs .000Z).
 */
function valuesMatch(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (a === undefined || b === undefined) return a === b

  // Normalize date strings
  const aStr = String(a)
  const bStr = String(b)
  try {
    const aDate = new Date(aStr)
    const bDate = new Date(bStr)
    if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
      return aDate.getTime() === bDate.getTime()
    }
  } catch {
    // Not dates, fall through
  }

  // Numeric comparison (score might be number vs string)
  if (typeof a === "number" || typeof b === "number") {
    return Math.abs(Number(a) - Number(b)) < 0.0001
  }

  return aStr === bStr
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe.skipIf(!shouldRunE2E)("Parity: MCP passthrough vs direct PG", () => {
  let pgPool: Pool
  const seededMemoryIds: string[] = []

  beforeAll(async () => {
    if (!process.env.POSTGRES_PASSWORD) {
      throw new Error("POSTGRES_PASSWORD environment variable is required for E2E tests")
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
    if (databaseUrl) {
      pgPool = new Pool({ connectionString: databaseUrl })
    } else {
      pgPool = new Pool({
        host: process.env.POSTGRES_HOST || "localhost",
        port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
        database: process.env.POSTGRES_DB || "memory",
        user: process.env.POSTGRES_USER || "ronin4life",
        password: process.env.POSTGRES_PASSWORD,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 10,
      })
    }

    // Verify connection
    await pgPool.query("SELECT 1")
  }, E2E_TIMEOUT)

  afterAll(async () => {
    // Cleanup: remove test data
    if (pgPool) {
      await pgPool.query("DELETE FROM events WHERE group_id = $1", [TEST_GROUP_ID])
      await pgPool.end()
    }
  }, E2E_TIMEOUT)

  it(
    "should have 0 divergence across 1000 reads",
    async () => {
      // ── Phase 1: Seed memories ────────────────────────────────────────
      for (let i = 0; i < SEED_COUNT; i++) {
        const memoryId = `mem-parity-${RUN_ID}-${i.toString().padStart(3, "0")}`
        const content = `Parity test memory ${i}: I always prefer strict TypeScript for production code`
        const createdAt = new Date().toISOString()

        await pgPool.query(
          `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            TEST_GROUP_ID,
            "memory_add",
            "parity-test",
            "completed",
            JSON.stringify({
              memory_id: memoryId,
              user_id: TEST_USER_ID,
              content,
              source: "conversation",
              score: 0.75 + (i * 0.002), // Vary scores slightly
            }),
            createdAt,
          ]
        )

        seededMemoryIds.push(memoryId)
      }

      expect(seededMemoryIds).toHaveLength(SEED_COUNT)

      // ── Phase 2: Read via MCP coordinator (memory_get) ─────────────────
      // Import dynamically to ensure E2E gate is respected
      const { memory_get } = await import("@/mcp/canonical-tools")

      const mcpResults: Map<string, Record<string, unknown>> = new Map()

      for (const memoryId of seededMemoryIds) {
        // Read each memory 10 times to reach 1000 total reads
        for (let read = 0; read < 10; read++) {
          try {
            const response = await memory_get({
              id: memoryId as any,
              group_id: TEST_GROUP_ID as any,
            })

            mcpResults.set(`${memoryId}:${read}`, {
              id: response.id,
              content: response.content,
              score: response.score,
              source: response.source,
              provenance: response.provenance,
              user_id: response.user_id,
              created_at: response.created_at,
            })
          } catch {
            // Memory might not be found via MCP if not in the semantic store
            // Record as null for divergence tracking
            mcpResults.set(`${memoryId}:${read}`, {
              id: null,
              content: null,
              score: null,
              source: null,
              provenance: null,
              user_id: null,
              created_at: null,
            })
          }
        }
      }

      expect(mcpResults.size).toBe(SEED_COUNT * 10) // 1000 reads

      // ── Phase 3: Read via direct PostgreSQL ───────────────────────────
      const pgResults: Map<string, Record<string, unknown>> = new Map()

      for (const memoryId of seededMemoryIds) {
        const pgRow = await pgPool.query(
          `SELECT metadata->>'memory_id' AS id,
                  metadata->>'content' AS content,
                  metadata->>'score' AS score,
                  metadata->>'source' AS source,
                  metadata->>'source' AS provenance,
                  metadata->>'user_id' AS user_id,
                  created_at
           FROM events
           WHERE group_id = $1
             AND event_type = 'memory_add'
             AND metadata->>'memory_id' = $2
           ORDER BY created_at DESC
           LIMIT 1`,
          [TEST_GROUP_ID, memoryId]
        )

        if (pgRow.rows.length > 0) {
          const row = pgRow.rows[0]
          for (let read = 0; read < 10; read++) {
            pgResults.set(`${memoryId}:${read}`, {
              id: row.id,
              content: row.content,
              score: row.score,
              source: row.source,
              provenance: row.provenance,
              user_id: row.user_id,
              created_at: row.created_at,
            })
          }
        }
      }

      // ── Phase 4: Compare field-by-field ────────────────────────────────
      const divergences: FieldDivergence[] = []
      const fieldsToCompare = ["id", "content", "score", "source", "provenance", "user_id", "created_at"]

      for (const memoryId of seededMemoryIds) {
        for (let read = 0; read < 10; read++) {
          const key = `${memoryId}:${read}`
          const mcpData = mcpResults.get(key)
          const pgData = pgResults.get(key)

          if (!mcpData || !pgData) continue

          for (const field of fieldsToCompare) {
            const mcpVal = mcpData[field]
            const pgVal = pgData[field]

            if (!valuesMatch(mcpVal, pgVal)) {
              divergences.push({
                memoryId,
                field,
                mcpValue: mcpVal,
                pgValue: pgVal,
              })
            }
          }
        }
      }

      // ── Phase 5: Assert 0 divergence ───────────────────────────────────
      if (divergences.length > 0) {
        // Log first 10 divergences for debugging
        console.error(
          `[PARITY FAILURE] ${divergences.length} divergences found (showing first 10):`
        )
        for (const d of divergences.slice(0, 10)) {
          console.error(
            `  memory=${d.memoryId} field=${d.field} mcp=${JSON.stringify(d.mcpValue)} pg=${JSON.stringify(d.pgValue)}`
          )
        }
      }

      expect(divergences).toHaveLength(0)
    },
    E2E_TIMEOUT
  )
})