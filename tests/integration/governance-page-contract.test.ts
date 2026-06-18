/**
 * Governance Page Contract Test
 *
 * Pins the data the Governance screen depends on:
 *  - the static CANONICAL_POLICIES registry (6 invariants, well-formed)
 *  - the governance audit-trail query over the events table runs (no throw)
 *
 * Run: bun vitest run tests/integration/governance-page-contract.test.ts
 * Gating: DB tests skip gracefully when DB is unavailable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { getPool } from "@/lib/postgres/connection"
import { CANONICAL_POLICIES } from "@/lib/governance/policies"

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

describe("Governance Page Contract", () => {
  beforeAll(async () => {
    dbAvailable = await isDbAvailable()
  })
  afterAll(() => {})

  it("CANONICAL_POLICIES is the 6-invariant registry, each well-formed", () => {
    expect(CANONICAL_POLICIES.length).toBe(6)
    const sevs = new Set(["critical", "high", "medium", "low"])
    for (const p of CANONICAL_POLICIES) {
      expect(p.id).toMatch(/^pol-\d{3}$/)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
      expect(sevs.has(p.severity)).toBe(true)
      expect(p.invariant_key.length).toBeGreaterThan(0)
      expect(typeof p.overridable).toBe("boolean")
      expect(typeof p.version).toBe("number")
    }
  })

  it("governance audit-trail query runs against events (no throw)", async () => {
    if (!dbAvailable) return
    const pool = getPool()
    const res = await pool.query(
      `SELECT event_type, agent_id, created_at
       FROM events
       WHERE group_id = $1
         AND event_type IN ('governance_policy_updated','governance_gate_checked','governance_approval_consumed')
       ORDER BY created_at DESC
       LIMIT 10`,
      [GROUP_ID]
    )
    expect(Array.isArray(res.rows)).toBe(true)
  })
})
