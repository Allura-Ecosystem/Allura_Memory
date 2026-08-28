import { describe, expect, it } from "vitest"

import { evaluateIngestDecision, type IngestDecisionInput, type IngestDecisionSummary } from "../ingest-decision"

const base: IngestDecisionInput = {
  profile: "baseline",
  mode: "inventory",
  generation: 7,
  packageRecords: 1,
  findingRecords: 0,
  leaseCreatedAt: new Date("2026-08-28T11:59:55.000Z"),
  databaseNow: new Date("2026-08-28T12:00:10.000Z"),
  summary: {
    status: "complete",
    timedOut: false,
    packageRecordsEmitted: 1,
    packageRecordsSuppressed: 0,
    findingsEmitted: 0,
    httpBatchesFailed: 0,
    errorPresent: false,
    scanTime: new Date("2026-08-28T12:00:00.000Z"),
    endTime: new Date("2026-08-28T12:00:05.000Z"),
  },
}

function decide(overrides: Partial<IngestDecisionInput> = {}, summary: Partial<IngestDecisionSummary> = {}) {
  return evaluateIngestDecision({ ...base, ...overrides, summary: { ...base.summary, ...summary } as IngestDecisionSummary })
}

describe("Story 26.7 bound-population promotion matrix", () => {
  it("promotes a valid complete routine snapshot, including known-empty state", () => {
    expect(decide()).toEqual({ decision: "promoted", reasonCode: "PROMOTED_COMPLETE" })
    expect(decide({ packageRecords: 0 }, { packageRecordsEmitted: 0 })).toEqual({
      decision: "promoted", reasonCode: "PROMOTED_COMPLETE",
    })
  })

  it.each([
    [{}, { status: "partial" }, "HELD_PARTIAL"],
    [{}, { status: "error" }, "HELD_ERROR"],
    [{}, { timedOut: true }, "HELD_TIMEOUT"],
    [{ profile: "deep" }, {}, "HELD_DEEP"],
    [{ mode: "findings-only" }, {}, "HELD_FINDINGS_ONLY"],
    [{ packageRecords: 2 }, {}, "HELD_COUNTER_MISMATCH"],
    [{ findingRecords: 1 }, {}, "HELD_COUNTER_MISMATCH"],
    [{}, { packageRecordsSuppressed: 1 }, "HELD_SUPPRESSED_RECORDS"],
    [{}, { httpBatchesFailed: 1 }, "HELD_FAILED_BATCH"],
    [{}, { errorPresent: true }, "HELD_ERROR_CONTRADICTION"],
    [{}, { scanTime: new Date("2026-08-28T12:06:00.000Z"), endTime: new Date("2026-08-28T12:06:01.000Z") }, "HELD_FUTURE_CLOCK"],
    [{}, { scanTime: new Date("2026-08-28T11:50:00.000Z"), endTime: new Date("2026-08-28T12:00:01.000Z") }, "HELD_LEASE_CLOCK_MISMATCH"],
    [{}, { endTime: new Date("2026-08-28T11:59:59.000Z") }, "HELD_CLOCK_ORDER"],
  ] as const)("holds unsafe or non-routine evidence with stable code %#", (overrides, summary, reasonCode) => {
    expect(decide(overrides, summary)).toEqual({ decision: "held", reasonCode })
  })

  it("holds with a stable reason code when the batch carried no scan_summary record", () => {
    expect(evaluateIngestDecision({ ...base, summary: null })).toEqual({
      decision: "held", reasonCode: "HELD_MISSING_SUMMARY",
    })
  })
})
