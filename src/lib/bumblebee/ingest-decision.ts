if (typeof window !== "undefined") throw new Error("server-side only")

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
  status: "complete" | "partial" | "error"
  timedOut: boolean
  packageRecordsEmitted: number
  packageRecordsSuppressed: number
  findingsEmitted: number
  httpBatchesFailed: number
  errorPresent: boolean
  scanTime: Date
  endTime: Date
}

export interface IngestDecisionInput {
  profile: "baseline" | "project" | "deep"
  mode: "inventory" | "findings-only"
  generation: number
  packageRecords: number
  findingRecords: number
  leaseCreatedAt: Date
  databaseNow: Date
  // null when the batch carried no trailing scan_summary record — a promotable
  // fact can never be established without one (contract item 8 / AC-10).
  summary: IngestDecisionSummary | null
}

export interface IngestDecision {
  decision: "promoted" | "held"
  reasonCode: IngestDecisionReason
}

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

export interface IngestPopulationBindingInput {
  lease: {
    profile: "baseline" | "project" | "deep"
    mode: "inventory" | "findings-only"
    endpointDeviceId: string
    ecosystems: readonly string[]
    catalogRevisionId: string | null
  }
  run: {
    runId: string
    profile: string
    deviceId: string | undefined
    ecosystems: readonly string[]
    hasFindings: boolean
  }
  existingRunId: string | null
}

export function assertIngestPopulationBinding(input: IngestPopulationBindingInput): void {
  const profileMismatch = input.run.profile !== input.lease.profile
  const deviceMismatch = !input.run.deviceId || input.run.deviceId !== input.lease.endpointDeviceId
  const ecosystemMismatch = input.run.ecosystems.some((ecosystem) => !input.lease.ecosystems.includes(ecosystem))
  const unboundFindings = input.run.hasFindings && input.lease.catalogRevisionId === null
  const mixedRun = input.existingRunId !== null && input.existingRunId !== input.run.runId
  if (profileMismatch || deviceMismatch || ecosystemMismatch || unboundFindings || mixedRun) {
    throw new Error("BUMBLEBEE_INGEST_RECORD_CONFLICT")
  }
}

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
