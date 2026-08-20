/**
 * @vitest-environment node
 *
 * Skill Usage Tracker — Unit Tests (Story 1.2)
 *
 * Verifies:
 *   - Payload validation (group_id, skill_name, success, token_count, duration_ms)
 *   - `logSkillUsage` routes through controlPlane `syscall_mutate` with the correct
 *     target (`pg:skill_usage_events`) and context (AD-40 compliance).
 *   - `getSkillUsageEvents` routes through controlPlane `syscall_query`.
 *   - `getSkillUsageSummary` aggregates count, success rate, avg tokens, avg
 *     duration per skill_name and supports `skill_name` / `since` filters.
 *   - The API route returns the expected response shapes and status codes.
 *
 * The controlPlane syscalls are mocked so no live PostgreSQL is required.
 */

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ── Mock the controlPlane syscalls BEFORE importing the tracker ─────────────────────
// This mirrors the pattern in src/lib/memory/writer.test.ts.

const mockMutate = vi.fn()
const mockQuery = vi.fn()

vi.mock("@/control-plane/syscalls", () => ({
  syscall_mutate: (...args: unknown[]) => mockMutate(...args),
  syscall_query: (...args: unknown[]) => mockQuery(...args),
}))

// Mock server-only so the tracker module can be imported under test.
vi.mock("server-only", () => ({}))

// Mock the postgres connection pool — used only by getSkillUsageSummaryFromView.
const mockPoolQuery = vi.fn()
vi.mock("@/lib/postgres/connection", () => ({
  getPool: () => ({ query: (...args: unknown[]) => mockPoolQuery(...args) }),
}))

import { GET } from "@/app/api/tracking/skill-usage/route"
import {
  getSkillUsageEvents,
  getSkillUsageSummary,
  logSkillUsage,
  SkillUsageValidationError,
  validateSkillUsageEvent,
} from "@/lib/tracking/skill-usage-tracker"

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Parameters<typeof logSkillUsage>[0]> = {}) {
  return {
    group_id: "allura-test",
    skill_name: "my-skill",
    success: true,
    token_count: 100,
    duration_ms: 50,
    ...overrides,
  } as Parameters<typeof logSkillUsage>[0]
}

function makeStoredRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    group_id: "allura-test",
    skill_name: "my-skill",
    success: true,
    token_count: 100,
    duration_ms: 50,
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

function controlPlaneMutateSuccess() {
  return {
    success: true,
    data: { affected_rows: 1, auditId: "audit-123" },
  }
}

function controlPlaneMutateFailure() {
  return {
    success: false,
    error: "ControlPlane policy denied",
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── validateSkillUsageEvent ──────────────────────────────────────────────────

describe("validateSkillUsageEvent", () => {
  it("accepts a valid event payload", () => {
    expect(() => validateSkillUsageEvent(makeEvent())).not.toThrow()
  })

  it("accepts defaults (token_count and duration_ms optional)", () => {
    expect(() =>
      validateSkillUsageEvent({
        group_id: "allura-test",
        skill_name: "ok",
        success: false,
      }),
    ).not.toThrow()
  })

  it("rejects an invalid group_id (no allura- prefix)", () => {
    expect(() => validateSkillUsageEvent(makeEvent({ group_id: "bad-group" }))).toThrow(
      /group_id/,
    )
  })

  it("rejects an empty group_id", () => {
    expect(() => validateSkillUsageEvent(makeEvent({ group_id: "" }))).toThrow(
      /group_id/,
    )
  })

  it("rejects an empty skill_name", () => {
    expect(() => validateSkillUsageEvent(makeEvent({ skill_name: "" }))).toThrow(
      /skill_name/,
    )
  })

  it("rejects an uppercase skill_name", () => {
    expect(() => validateSkillUsageEvent(makeEvent({ skill_name: "MySkill" }))).toThrow(
      /skill_name/,
    )
  })

  it("rejects a skill_name with spaces", () => {
    expect(() => validateSkillUsageEvent(makeEvent({ skill_name: "my skill" }))).toThrow(
      /skill_name/,
    )
  })

  it("rejects a non-boolean success", () => {
    expect(() =>
      validateSkillUsageEvent(
        makeEvent({ success: "yes" as unknown as boolean }),
      ),
    ).toThrow(/success/)
  })

  it("rejects a negative token_count", () => {
    expect(() => validateSkillUsageEvent(makeEvent({ token_count: -1 }))).toThrow(
      /token_count/,
    )
  })

  it("rejects a non-integer token_count", () => {
    expect(() => validateSkillUsageEvent(makeEvent({ token_count: 1.5 }))).toThrow(
      /token_count/,
    )
  })

  it("rejects a negative duration_ms", () => {
    expect(() => validateSkillUsageEvent(makeEvent({ duration_ms: -5 }))).toThrow(
      /duration_ms/,
    )
  })

  it("rejects a non-integer duration_ms", () => {
    expect(() => validateSkillUsageEvent(makeEvent({ duration_ms: 2.5 }))).toThrow(
      /duration_ms/,
    )
  })

  it("throws a SkillUsageValidationError instance", () => {
    try {
      validateSkillUsageEvent(makeEvent({ skill_name: "" }))
      expect.unreachable("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(SkillUsageValidationError)
    }
  })
})

// ── logSkillUsage ─────────────────────────────────────────────────────────────

describe("logSkillUsage", () => {
  it("routes through syscall_mutate with the pg:skill_usage_events target", async () => {
    mockMutate.mockResolvedValue(controlPlaneMutateSuccess())

    await logSkillUsage(makeEvent())

    expect(mockMutate).toHaveBeenCalledTimes(1)
    const [request, context] = mockMutate.mock.calls[0] as [unknown, unknown]
    expect(request).toMatchObject({
      type: "insert",
      target: "pg:skill_usage_events",
    })
    expect(context).toMatchObject({
      group_id: "allura-test",
      permission_tier: "skill",
    })
  })

  it("includes all payload fields in the data bag", async () => {
    mockMutate.mockResolvedValue(controlPlaneMutateSuccess())

    await logSkillUsage(makeEvent({ token_count: 250, duration_ms: 75 }))

    const [request] = mockMutate.mock.calls[0] as [{ data: Record<string, unknown> }, unknown]
    expect(request.data).toMatchObject({
      group_id: "allura-test",
      skill_name: "my-skill",
      success: true,
      token_count: 250,
      duration_ms: 75,
    })
  })

  it("defaults token_count and duration_ms to 0", async () => {
    mockMutate.mockResolvedValue(controlPlaneMutateSuccess())

    await logSkillUsage({
      group_id: "allura-test",
      skill_name: "ok",
      success: true,
    })

    const [request] = mockMutate.mock.calls[0] as [{ data: Record<string, unknown> }, unknown]
    expect(request.data.token_count).toBe(0)
    expect(request.data.duration_ms).toBe(0)
  })

  it("returns the auditId from the controlPlane result", async () => {
    mockMutate.mockResolvedValue(controlPlaneMutateSuccess())

    const result = await logSkillUsage(makeEvent())
    expect(result.auditId).toBe("audit-123")
  })

  it("throws when the controlPlane returns success: false", async () => {
    mockMutate.mockResolvedValue(controlPlaneMutateFailure())

    await expect(logSkillUsage(makeEvent())).rejects.toThrow(/ControlPlane policy denied/)
  })

  it("throws SkillUsageValidationError before calling the controlPlane for bad input", async () => {
    mockMutate.mockResolvedValue(controlPlaneMutateSuccess())

    await expect(
      logSkillUsage(makeEvent({ group_id: "bad-group" })),
    ).rejects.toThrow(/group_id/)
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it("honours an explicit actor override", async () => {
    mockMutate.mockResolvedValue(controlPlaneMutateSuccess())

    await logSkillUsage(makeEvent(), { actor: "agent-brooks" })

    const [, context] = mockMutate.mock.calls[0] as [unknown, { actor: string }]
    expect(context.actor).toBe("agent-brooks")
  })
})

// ── getSkillUsageEvents ──────────────────────────────────────────────────────

describe("getSkillUsageEvents", () => {
  it("routes through syscall_query with pg:skill_usage_events target", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [makeStoredRow()],
    })

    const rows = await getSkillUsageEvents({ group_id: "allura-test" })

    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [request, context] = mockQuery.mock.calls[0] as [unknown, unknown]
    expect(request).toMatchObject({ target: "pg:skill_usage_events" })
    expect(context).toMatchObject({ group_id: "allura-test" })
    expect(rows).toHaveLength(1)
  })

  it("passes skill_name into the query filter when provided", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] })

    await getSkillUsageEvents({ group_id: "allura-test", skill_name: "my-skill" })

    const [request] = mockQuery.mock.calls[0] as [{ query: Record<string, unknown> }, unknown]
    expect(request.query).toMatchObject({ skill_name: "my-skill" })
  })

  it("throws when the controlPlane returns success: false", async () => {
    mockQuery.mockResolvedValue({ success: false, error: "denied" })

    await expect(getSkillUsageEvents({ group_id: "allura-test" })).rejects.toThrow(
      /denied/,
    )
  })

  it("rejects an invalid group_id", async () => {
    await expect(getSkillUsageEvents({ group_id: "bad" })).rejects.toThrow(/group_id/)
  })
})

// ── getSkillUsageSummary ─────────────────────────────────────────────────────

describe("getSkillUsageSummary", () => {
  it("aggregates count, success rate, avg tokens, and avg duration per skill", async () => {
    const rows = [
      makeStoredRow({ skill_name: "alpha", success: true, token_count: 100, duration_ms: 50 }),
      makeStoredRow({ skill_name: "alpha", success: false, token_count: 200, duration_ms: 150 }),
      makeStoredRow({ skill_name: "beta", success: true, token_count: 50, duration_ms: 10 }),
    ]
    mockQuery.mockResolvedValue({ success: true, data: rows })

    const summary = await getSkillUsageSummary({ group_id: "allura-test" })

    expect(summary).toHaveLength(2)

    // alpha: 2 events, 1 success → 50% success rate, avg tokens 150, avg duration 100
    const alpha = summary.find((r) => r.skill_name === "alpha")
    expect(alpha).toBeDefined()
    expect(alpha!.total_count).toBe(2)
    expect(alpha!.success_count).toBe(1)
    expect(alpha!.failure_count).toBe(1)
    expect(alpha!.success_rate_pct).toBe(50)
    expect(alpha!.avg_tokens).toBe(150)
    expect(alpha!.avg_duration_ms).toBe(100)

    // beta: 1 event, 1 success → 100% success rate, avg tokens 50, avg duration 10
    const beta = summary.find((r) => r.skill_name === "beta")
    expect(beta).toBeDefined()
    expect(beta!.total_count).toBe(1)
    expect(beta!.success_rate_pct).toBe(100)
    expect(beta!.avg_tokens).toBe(50)
    expect(beta!.avg_duration_ms).toBe(10)
  })

  it("returns rows sorted by total_count descending", async () => {
    const rows = [
      makeStoredRow({ skill_name: "rare", success: true }),
      makeStoredRow({ skill_name: "common", success: true }),
      makeStoredRow({ skill_name: "common", success: true }),
    ]
    mockQuery.mockResolvedValue({ success: true, data: rows })

    const summary = await getSkillUsageSummary({ group_id: "allura-test" })
    expect(summary[0].skill_name).toBe("common")
    expect(summary[1].skill_name).toBe("rare")
  })

  it("returns an empty array when no events exist", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] })

    const summary = await getSkillUsageSummary({ group_id: "allura-test" })
    expect(summary).toEqual([])
  })

  it("filters by skill_name when provided (controlPlane-side filter)", async () => {
    // The controlPlane's syscall_query is mocked — it returns whatever we give it.
    // In production, the query handler would filter rows by skill_name in SQL.
    // Here we simulate that by only returning the matching row.
    const rows = [makeStoredRow({ skill_name: "alpha" })]
    mockQuery.mockResolvedValue({ success: true, data: rows })

    const summary = await getSkillUsageSummary({
      group_id: "allura-test",
      skill_name: "alpha",
    })

    // Verify skill_name was forwarded into the controlPlane query filter
    const [request] = mockQuery.mock.calls[0] as [{ query: Record<string, unknown> }, unknown]
    expect(request.query).toMatchObject({ skill_name: "alpha" })

    expect(summary).toHaveLength(1)
    expect(summary[0].skill_name).toBe("alpha")
  })

  it("filters by `since` in-memory", async () => {
    const rows = [
      makeStoredRow({ skill_name: "old", created_at: new Date("2025-01-01T00:00:00Z") }),
      makeStoredRow({ skill_name: "new", created_at: new Date("2026-06-01T00:00:00Z") }),
    ]
    mockQuery.mockResolvedValue({ success: true, data: rows })

    const summary = await getSkillUsageSummary({
      group_id: "allura-test",
      since: new Date("2026-01-01T00:00:00Z"),
    })

    expect(summary).toHaveLength(1)
    expect(summary[0].skill_name).toBe("new")
  })

  it("computes first_used and last_used correctly", async () => {
    const rows = [
      makeStoredRow({ skill_name: "x", created_at: new Date("2026-03-01T00:00:00Z") }),
      makeStoredRow({ skill_name: "x", created_at: new Date("2026-01-01T00:00:00Z") }),
      makeStoredRow({ skill_name: "x", created_at: new Date("2026-06-01T00:00:00Z") }),
    ]
    mockQuery.mockResolvedValue({ success: true, data: rows })

    const summary = await getSkillUsageSummary({ group_id: "allura-test" })
    expect(summary).toHaveLength(1)
    expect(summary[0].first_used).toEqual(new Date("2026-01-01T00:00:00Z"))
    expect(summary[0].last_used).toEqual(new Date("2026-06-01T00:00:00Z"))
  })
})

// ── API Route ─────────────────────────────────────────────────────────────────
//
// The route calls `getSkillUsageSummary`, which calls `getSkillUsageEvents`,
// which calls the (already-mocked) `syscall_query`. So we do NOT need a second
// module-level mock — we just configure `mockQuery` to return the rows we want
// for each route test.


describe("GET /api/tracking/skill-usage", () => {
  it("returns 400 when group_id is missing", async () => {
    const req = new NextRequest(
      "http://localhost:4748/api/tracking/skill-usage",
    )
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/group_id is required/)
  })

  it("returns 400 when group_id is invalid", async () => {
    const req = new NextRequest(
      "http://localhost:4748/api/tracking/skill-usage?group_id=bad-group",
    )
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/group_id/)
  })

  it("returns 400 when `since` is not a valid ISO-8601 timestamp", async () => {
    const req = new NextRequest(
      "http://localhost:4748/api/tracking/skill-usage?group_id=allura-test&since=not-a-date",
    )
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/since/)
  })

  it("returns 200 with a summary and totals on success", async () => {
    mockQuery.mockResolvedValue({
      success: true,
      data: [
        makeStoredRow({
          skill_name: "alpha",
          success: true,
          token_count: 100,
          duration_ms: 50,
        }),
        makeStoredRow({
          id: 2,
          skill_name: "alpha",
          success: false,
          token_count: 200,
          duration_ms: 150,
        }),
      ],
    })

    const req = new NextRequest(
      "http://localhost:4748/api/tracking/skill-usage?group_id=allura-test",
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.group_id).toBe("allura-test")
    expect(body.totals.total_count).toBe(2)
    expect(body.totals.success_count).toBe(1)
    expect(body.totals.failure_count).toBe(1)
    expect(body.totals.success_rate_pct).toBe(50)
    expect(body.totals.skill_count).toBe(1)
    expect(body.skills).toHaveLength(1)
    expect(body.skills[0].skill_name).toBe("alpha")
  })

  it("returns 200 with empty summary when no events exist", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] })

    const req = new NextRequest(
      "http://localhost:4748/api/tracking/skill-usage?group_id=allura-test",
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skills).toEqual([])
    expect(body.totals.total_count).toBe(0)
    expect(body.totals.success_rate_pct).toBe(0)
  })

  it("passes skill_name and since query params through to the controlPlane query", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] })

    const req = new NextRequest(
      "http://localhost:4748/api/tracking/skill-usage?group_id=allura-test&skill_name=alpha&since=2026-01-01T00:00:00Z",
    )
    await GET(req)

    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [request] = mockQuery.mock.calls[0] as [{ query: Record<string, unknown> }, unknown]
    expect(request.query).toMatchObject({ skill_name: "alpha" })
  })

  it("returns 500 when the tracker throws an unexpected error", async () => {
    mockQuery.mockResolvedValue({ success: false, error: "boom" })

    const req = new NextRequest(
      "http://localhost:4748/api/tracking/skill-usage?group_id=allura-test",
    )
    const res = await GET(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/Internal server error/)
  })

  it("sets Cache-Control: no-store on success responses", async () => {
    mockQuery.mockResolvedValue({ success: true, data: [] })

    const req = new NextRequest(
      "http://localhost:4748/api/tracking/skill-usage?group_id=allura-test",
    )
    const res = await GET(req)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
  })
})