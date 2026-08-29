if (typeof window !== "undefined") throw new Error("server-side only")

// AC-10 (bound-population promotion): `status=complete` is necessary but not
// sufficient. A batch is promoted only when the server-bound lease population
// (profile/mode), the batch's own record counters, and the trailing
// scan_summary record all agree, with no timeout/error/failed-batch
// contradiction and no clock anomaly relative to the lease and the database.
//
// Ported from the superseded branch's `ingest-decision.ts` (proven end-to-end
// against a live database) and adapted to this architecture:
//  - `generation` was dropped from the input. The ported function accepted it
//    but never referenced it in the decision — ordering by server generation
//    ("late older generation cannot replace current state", promotion matrix
//    row 7) is a read-side concern for the current-state view that does not
//    exist yet. This engine always persists an append-only decision fact
//    regardless of generation order; it never "replaces" a prior fact, so the
//    write-path half of row 7 is satisfied without needing generation here.
//  - `assertIngestPopulationBinding` was not ported. It threw on
//    profile/device/ecosystem mismatch, which in this architecture is already
//    enforced fail-closed at the batch-conformance layer (mixed profile/run/
//    endpoint, forbidden ecosystem) before a batch is ever persisted. Porting
//    it here would duplicate a check that already runs earlier in the
//    pipeline with a different (4xx, not held-with-reason) failure mode.
export type IngestDecisionReason =
  | "PROMOTED_COMPLETE"
  | "HELD_PARTIAL"
  | "HELD_ERROR"
  | "HELD_TIMEOUT"
  | "HELD_DEEP"
  | "HELD_FINDINGS_ONLY"
  | "HELD_COUNTER_MISMATCH"
  | "HELD_SUPPRESSED_RECORDS"
  | "HELD_FAILED_BATCH"
  | "HELD_ERROR_CONTRADICTION"
  | "HELD_FUTURE_CLOCK"
  | "HELD_LEASE_CLOCK_MISMATCH"
  | "HELD_CLOCK_ORDER"
  | "HELD_MISSING_SUMMARY"

export interface IngestDecisionSummary {
  readonly status: "complete" | "partial" | "error"
  readonly timedOut: boolean
  readonly packageRecordsEmitted: number
  readonly packageRecordsSuppressed: number
  readonly findingsEmitted: number
  readonly httpBatchesFailed: number
  readonly errorPresent: boolean
  readonly scanTime: Date
  readonly endTime: Date
}

export interface IngestDecisionInput {
  readonly profile: "baseline" | "project" | "deep"
  readonly mode: "inventory" | "findings-only"
  readonly packageRecords: number
  readonly findingRecords: number
  readonly leaseCreatedAt: Date
  readonly databaseNow: Date
  // null when the batch carried no trustworthy trailing scan_summary record —
  // a promotable fact can never be established without one (AC-10).
  readonly summary: IngestDecisionSummary | null
}

export interface IngestDecision {
  readonly decision: "promoted" | "held"
  readonly reasonCode: IngestDecisionReason
}

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

function held(reasonCode: Exclude<IngestDecisionReason, "PROMOTED_COMPLETE">): IngestDecision {
  return Object.freeze({ decision: "held", reasonCode })
}

export function evaluateIngestDecision(input: IngestDecisionInput): IngestDecision {
  const { summary } = input
  if (summary === null) return held("HELD_MISSING_SUMMARY")
  if (summary.status === "partial") return held("HELD_PARTIAL")
  if (summary.status === "error") return held("HELD_ERROR")
  if (summary.timedOut) return held("HELD_TIMEOUT")
  if (input.profile === "deep") return held("HELD_DEEP")
  if (input.mode === "findings-only") return held("HELD_FINDINGS_ONLY")
  if (summary.packageRecordsEmitted !== input.packageRecords || summary.findingsEmitted !== input.findingRecords) {
    return held("HELD_COUNTER_MISMATCH")
  }
  if (summary.packageRecordsSuppressed !== 0) return held("HELD_SUPPRESSED_RECORDS")
  if (summary.httpBatchesFailed !== 0) return held("HELD_FAILED_BATCH")
  if (summary.errorPresent) return held("HELD_ERROR_CONTRADICTION")

  const scanTime = summary.scanTime.getTime()
  const endTime = summary.endTime.getTime()
  const leaseCreatedAt = input.leaseCreatedAt.getTime()
  const databaseNow = input.databaseNow.getTime()
  if (![scanTime, endTime, leaseCreatedAt, databaseNow].every(Number.isFinite)) return held("HELD_CLOCK_ORDER")
  if (scanTime > databaseNow + MAX_CLOCK_SKEW_MS || endTime > databaseNow + MAX_CLOCK_SKEW_MS) {
    return held("HELD_FUTURE_CLOCK")
  }
  if (scanTime < leaseCreatedAt - MAX_CLOCK_SKEW_MS) return held("HELD_LEASE_CLOCK_MISMATCH")
  if (endTime < scanTime) return held("HELD_CLOCK_ORDER")
  return Object.freeze({ decision: "promoted", reasonCode: "PROMOTED_COMPLETE" })
}

// The scan_summary record's sanitized_payload is untyped JSONB: batch
// conformance recomputes its canonical-id digest but does not validate the
// business-meaning of most fields (e.g. it never checks `status` is one of
// the three known values). A payload that fails this structural parse can
// never be trusted to promote, so it is treated identically to a batch that
// carried no summary at all (HELD_MISSING_SUMMARY).
export function parseIngestSummary(payload: Readonly<Record<string, unknown>>): IngestDecisionSummary | null {
  const status = payload.status
  if (status !== "complete" && status !== "partial" && status !== "error") return null

  const timedOut = payload.timed_out
  if (typeof timedOut !== "boolean") return null

  const packageRecordsEmitted = payload.package_records_emitted
  const findingsEmitted = payload.findings_emitted
  const packageRecordsSuppressed = payload.package_records_suppressed ?? 0
  const httpBatchesFailed = payload.http_batches_failed ?? 0
  if (
    typeof packageRecordsEmitted !== "number" ||
    typeof findingsEmitted !== "number" ||
    typeof packageRecordsSuppressed !== "number" ||
    typeof httpBatchesFailed !== "number"
  ) {
    return null
  }

  const errorValue = payload.error
  const errorPresent = typeof errorValue === "string" && errorValue.length > 0

  const scanTimeRaw = payload.scan_time
  const endTimeRaw = payload.end_time
  if (typeof scanTimeRaw !== "string" || typeof endTimeRaw !== "string") return null
  const scanTime = new Date(scanTimeRaw)
  const endTime = new Date(endTimeRaw)
  if (Number.isNaN(scanTime.getTime()) || Number.isNaN(endTime.getTime())) return null

  return Object.freeze({
    status,
    timedOut,
    packageRecordsEmitted,
    packageRecordsSuppressed,
    findingsEmitted,
    httpBatchesFailed,
    errorPresent,
    scanTime,
    endTime,
  })
}
