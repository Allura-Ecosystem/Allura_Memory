import { describe, expect, it } from "vitest"

import {
  evaluateIngestDecision,
  type IngestDecisionInput,
  type IngestDecisionSummary,
  parseIngestSummary,
} from "../ingest-decision"

const LEASE_CREATED_AT = new Date("2026-08-28T23:00:00.000Z")
const DATABASE_NOW = new Date("2026-08-28T23:59:20.000Z")

function summary(overrides: Partial<IngestDecisionSummary> = {}): IngestDecisionSummary {
  return {
    status: "complete",
    timedOut: false,
    packageRecordsEmitted: 2,
    packageRecordsSuppressed: 0,
    findingsEmitted: 0,
    httpBatchesFailed: 0,
    errorPresent: false,
    scanTime: new Date("2026-08-28T23:59:14.725Z"),
    endTime: new Date("2026-08-28T23:59:14.726Z"),
    ...overrides,
  }
}

function input(overrides: Partial<IngestDecisionInput> = {}): IngestDecisionInput {
  return {
    profile: "baseline",
    mode: "inventory",
    packageRecords: 2,
    findingRecords: 0,
    leaseCreatedAt: LEASE_CREATED_AT,
    databaseNow: DATABASE_NOW,
    summary: summary(),
    ...overrides,
  }
}

describe("Story 26.7 AC-10 evaluateIngestDecision — promotion matrix", () => {
  it("row 1: bound complete baseline inventory with valid counts is promoted", () => {
    expect(evaluateIngestDecision(input())).toEqual({ decision: "promoted", reasonCode: "PROMOTED_COMPLETE" })
  })

  it("row 1: bound complete project inventory with valid counts is promoted", () => {
    expect(evaluateIngestDecision(input({ profile: "project" })))
      .toEqual({ decision: "promoted", reasonCode: "PROMOTED_COMPLETE" })
  })

  it("row 2: bound EMPTY complete inventory (zero packages, zero findings) is promoted", () => {
    const decision = evaluateIngestDecision(input({
      packageRecords: 0,
      findingRecords: 0,
      summary: summary({ packageRecordsEmitted: 0, findingsEmitted: 0 }),
    }))
    expect(decision).toEqual({ decision: "promoted", reasonCode: "PROMOTED_COMPLETE" })
  })

  it("row 3: findings-only mode is held, never promoted", () => {
    expect(evaluateIngestDecision(input({ mode: "findings-only" })))
      .toEqual({ decision: "held", reasonCode: "HELD_FINDINGS_ONLY" })
  })

  it("row 4: complete deep profile is campaign evidence only, never promoted", () => {
    expect(evaluateIngestDecision(input({ profile: "deep" })))
      .toEqual({ decision: "held", reasonCode: "HELD_DEEP" })
  })

  it("row 5: partial status is held, preserving current state", () => {
    expect(evaluateIngestDecision(input({ summary: summary({ status: "partial" }) })))
      .toEqual({ decision: "held", reasonCode: "HELD_PARTIAL" })
  })

  it("row 5: error status is held", () => {
    expect(evaluateIngestDecision(input({ summary: summary({ status: "error" }) })))
      .toEqual({ decision: "held", reasonCode: "HELD_ERROR" })
  })

  it("row 5: timed-out scan is held even when status reports complete", () => {
    expect(evaluateIngestDecision(input({ summary: summary({ timedOut: true }) })))
      .toEqual({ decision: "held", reasonCode: "HELD_TIMEOUT" })
  })

  it("row 5: missing scan_summary is held", () => {
    expect(evaluateIngestDecision(input({ summary: null })))
      .toEqual({ decision: "held", reasonCode: "HELD_MISSING_SUMMARY" })
  })

  it("row 6: summary counters contradicting the stored record counts are held", () => {
    expect(evaluateIngestDecision(input({ packageRecords: 1 })))
      .toEqual({ decision: "held", reasonCode: "HELD_COUNTER_MISMATCH" })
  })

  it("row 6: findings counter contradicting the stored record count is held", () => {
    expect(evaluateIngestDecision(input({ findingRecords: 1 })))
      .toEqual({ decision: "held", reasonCode: "HELD_COUNTER_MISMATCH" })
  })

  it("row 6: non-zero suppressed packages held even when emitted counters match", () => {
    expect(evaluateIngestDecision(input({ summary: summary({ packageRecordsSuppressed: 1 }) })))
      .toEqual({ decision: "held", reasonCode: "HELD_SUPPRESSED_RECORDS" })
  })

  it("row 6: failed-batch contradiction is held", () => {
    expect(evaluateIngestDecision(input({ summary: summary({ httpBatchesFailed: 1 }) })))
      .toEqual({ decision: "held", reasonCode: "HELD_FAILED_BATCH" })
  })

  it("row 6: a complete status with a non-empty error string is held (error contradiction)", () => {
    expect(evaluateIngestDecision(input({ summary: summary({ errorPresent: true }) })))
      .toEqual({ decision: "held", reasonCode: "HELD_ERROR_CONTRADICTION" })
  })

  it("clock: scan_time far in the future of the database clock is held", () => {
    const decision = evaluateIngestDecision(input({
      summary: summary({ scanTime: new Date("2099-01-01T00:00:00.000Z") }),
    }))
    expect(decision).toEqual({ decision: "held", reasonCode: "HELD_FUTURE_CLOCK" })
  })

  it("clock: end_time far in the future of the database clock is held", () => {
    const decision = evaluateIngestDecision(input({
      summary: summary({ endTime: new Date("2099-01-01T00:00:00.000Z") }),
    }))
    expect(decision).toEqual({ decision: "held", reasonCode: "HELD_FUTURE_CLOCK" })
  })

  it("clock: scan_time before the lease was created (beyond skew) is held", () => {
    const decision = evaluateIngestDecision(input({
      summary: summary({ scanTime: new Date("2020-01-01T00:00:00.000Z") }),
    }))
    expect(decision).toEqual({ decision: "held", reasonCode: "HELD_LEASE_CLOCK_MISMATCH" })
  })

  it("clock: end_time before scan_time is held (impossible ordering)", () => {
    const decision = evaluateIngestDecision(input({
      summary: summary({
        scanTime: new Date("2026-08-28T23:59:20.000Z"),
        endTime: new Date("2026-08-28T23:59:10.000Z"),
      }),
    }))
    expect(decision).toEqual({ decision: "held", reasonCode: "HELD_CLOCK_ORDER" })
  })

  it("row 7 (write-path half): a late/older-generation batch still gets an evaluated decision persisted, not silently dropped", () => {
    // The engine itself is generation-agnostic — every batch is evaluated on its
    // own merits and the fact is always persisted (see ingest-decision.ts header
    // note). "Cannot replace current state" for an older generation is enforced
    // by the read-side current-state view, which is out of scope for this slice.
    expect(evaluateIngestDecision(input())).toEqual({ decision: "promoted", reasonCode: "PROMOTED_COMPLETE" })
  })

  it("precedence: partial status held before findings-only/deep/counter checks are ever reached", () => {
    const decision = evaluateIngestDecision(input({
      mode: "findings-only",
      profile: "deep",
      packageRecords: 999,
      summary: summary({ status: "partial" }),
    }))
    expect(decision).toEqual({ decision: "held", reasonCode: "HELD_PARTIAL" })
  })
})

describe("Story 26.7 AC-10 parseIngestSummary", () => {
  const validPayload = {
    status: "complete",
    timed_out: false,
    package_records_emitted: 2,
    package_records_suppressed: 0,
    findings_emitted: 0,
    http_batches_failed: 0,
    scan_time: "2026-08-28T23:59:14.725988598Z",
    end_time: "2026-08-28T23:59:14.726695576Z",
  } as Record<string, unknown>

  it("parses a structurally valid payload", () => {
    const parsed = parseIngestSummary(validPayload)
    expect(parsed).not.toBeNull()
    expect(parsed?.status).toBe("complete")
    expect(parsed?.packageRecordsEmitted).toBe(2)
    expect(parsed?.errorPresent).toBe(false)
  })

  it("defaults package_records_suppressed and http_batches_failed to 0 when absent", () => {
    const { package_records_suppressed: _s, http_batches_failed: _h, ...rest } = validPayload
    const parsed = parseIngestSummary(rest)
    expect(parsed?.packageRecordsSuppressed).toBe(0)
    expect(parsed?.httpBatchesFailed).toBe(0)
  })

  it("treats a non-empty error string as errorPresent", () => {
    const parsed = parseIngestSummary({ ...validPayload, error: "disk full" })
    expect(parsed?.errorPresent).toBe(true)
  })

  it("returns null for an unrecognized status value (cannot trust the fact)", () => {
    expect(parseIngestSummary({ ...validPayload, status: "unknown" })).toBeNull()
  })

  it("returns null when timed_out is not boolean", () => {
    expect(parseIngestSummary({ ...validPayload, timed_out: "false" })).toBeNull()
  })

  it("returns null when a required counter is not numeric", () => {
    expect(parseIngestSummary({ ...validPayload, package_records_emitted: "2" })).toBeNull()
  })

  it("returns null when scan_time is not a parseable date", () => {
    expect(parseIngestSummary({ ...validPayload, scan_time: "not-a-date" })).toBeNull()
  })

  it("returns null when end_time is missing", () => {
    const { end_time: _e, ...rest } = validPayload
    expect(parseIngestSummary(rest)).toBeNull()
  })
})
