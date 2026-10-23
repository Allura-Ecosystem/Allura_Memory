/**
 * Parity Test: MCP Passthrough vs Direct PG Reads
 *
 * Verifies that 1,000 reads through the MCP coordinator produce
 * ZERO divergence compared to direct PostgreSQL reads.
 *
 * Strategy:
 * 1. Seed N workspace-scoped episodic event fixtures through the owner setup connection
 * 2. Read each back via memory_get (through coordinator/MCP)
 * 3. Read the same memories via direct PostgreSQL query
 * 4. Compare the seven public response fields, including episodic score/source normalization
 * 5. Assert 0 divergence across all reads
 *
 * Requires a trusted disposable integration-lane child; absence fails before connecting.
 *
 * Reference: docs/allura/BLUEPRINT.md (F-003: Approval Audit Flow)
 */

import type { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { freshFixtureScope, requireDisposableFixture } from "../../tests/fixtures/disposable-postgres"
import { closePool, getPool } from "../lib/postgres/connection"
import { toMemoryId, validateGroupId } from "../mcp/canonical-tools/validation-utils"


// ── E2E Gate ──────────────────────────────────────────────────────────────

const E2E_TIMEOUT = 120_000 // 2 minutes for 1000 reads

// ── Test Configuration ────────────────────────────────────────────────────

const scope = freshFixtureScope()
const RUN_ID = scope.sessionId
const TEST_GROUP_ID = validateGroupId(scope.groupId)
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

describe("Parity: MCP passthrough vs direct PG", () => {
  let pgPool: Pool
  const seededMemoryIds: string[] = []

  let assertEnvironment: () => void
  beforeAll(async () => {
    assertEnvironment = await requireDisposableFixture("src/__tests__/parity-test.test.ts")
    pgPool = getPool()
    await pgPool.query(`INSERT INTO workspaces(workspace_id,group_id,name) VALUES($1,$2,'Parity fixture')`,
      [scope.workspaceId, TEST_GROUP_ID])
  }, E2E_TIMEOUT)
  afterAll(async () => { await closePool() }, E2E_TIMEOUT)

  it(
    "should have 0 divergence across 1000 reads",
    async () => {
      assertEnvironment()
      // ── Phase 1: Seed memories ────────────────────────────────────────
      for (let i = 0; i < SEED_COUNT; i++) {
        const memoryId = `mem-parity-${RUN_ID}-${i.toString().padStart(3, "0")}`
        const content = `Parity test memory ${i}: I always prefer strict TypeScript for production code`
        const createdAt = new Date().toISOString()

        await pgPool.query(
          `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at, workspace_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
            scope.workspaceId,
          ]
        )

        seededMemoryIds.push(memoryId)
      }

      expect(seededMemoryIds).toHaveLength(SEED_COUNT)

      // ── Phase 2: Read via MCP coordinator (memory_get) ─────────────────
      // Import dynamically to ensure E2E gate is respected
      const { memory_get } = await import("@/mcp/canonical-tools")
      assertEnvironment()

      const mcpResults: Map<string, Record<string, unknown>> = new Map()

      for (const memoryId of seededMemoryIds) {
        // Read each memory 10 times to reach 1000 total reads
        for (let read = 0; read < 10; read++) {
          const response = await memory_get({
            id: toMemoryId(memoryId), group_id: TEST_GROUP_ID,
            scope: { group_id: TEST_GROUP_ID, workspace_id: scope.workspaceId, agent_id: scope.principalId },
          })
          expect(response.id).toBe(memoryId)
          expect(response.source).toBe("episodic")
          mcpResults.set(`${memoryId}:${read}`, {
            id: response.id, content: response.content, score: response.score, source: response.source,
            provenance: response.provenance, user_id: response.user_id, created_at: response.created_at,
          })
        }
      }

      expect(mcpResults.size).toBe(SEED_COUNT * 10) // 1000 reads

      // ── Phase 3: Read via direct PostgreSQL ───────────────────────────
      const pgResults: Map<string, Record<string, unknown>> = new Map()

      for (const memoryId of seededMemoryIds) {
        const pgRow = await pgPool.query(
          `SELECT metadata->>'memory_id' AS id,
                  metadata->>'content' AS content,
                  0.5::float8 AS score,
                  'episodic'::text AS source,
                  metadata->>'source' AS provenance,
                  metadata->>'user_id' AS user_id,
                  created_at
           FROM events
           WHERE group_id = $1
             AND event_type = 'memory_add'
             AND metadata->>'memory_id' = $2
             AND workspace_id = $3
           ORDER BY created_at DESC
           LIMIT 1`,
          [TEST_GROUP_ID, memoryId, scope.workspaceId]
        )

        expect(pgRow.rows).toHaveLength(1)
        {
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

      expect(pgResults.size).toBe(SEED_COUNT * 10)
      // ── Phase 4: Compare field-by-field ────────────────────────────────
      const divergences: FieldDivergence[] = []
      const fieldsToCompare = ["id", "content", "score", "source", "provenance", "user_id", "created_at"]

      for (const memoryId of seededMemoryIds) {
        for (let read = 0; read < 10; read++) {
          const key = `${memoryId}:${read}`
          const mcpData = mcpResults.get(key)
          const pgData = pgResults.get(key)

          expect(mcpData).toBeDefined()
          expect(pgData).toBeDefined()
          if (!mcpData || !pgData) throw new Error(`Missing parity observation: ${key}`)

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