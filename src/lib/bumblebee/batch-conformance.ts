import { createHash } from "node:crypto"

import { BUMBLEBEE_FINDING_ECOSYSTEMS, BUMBLEBEE_INVENTORY_ECOSYSTEMS, BUMBLEBEE_SCHEMA_VERSION } from "./upstream-contract"

// Byte/record ceilings bound ingestion memory: a hostile or runaway scanner
// payload must never be able to balloon the process before validation runs.
export const MAX_BODY_BYTES = 8 * 1024 * 1024
export const MAX_EXPANDED_BYTES = 64 * 1024 * 1024
export const MAX_LINE_BYTES = 1024 * 1024
export const MAX_RECORDS = 10_000

export const BUMBLEBEE_BATCH_ERROR = Object.freeze({
  malformedLine: "BUMBLEBEE_BATCH_MALFORMED_LINE",
  unknownRecordType: "BUMBLEBEE_BATCH_UNKNOWN_RECORD_TYPE",
  mixedRun: "BUMBLEBEE_BATCH_MIXED_RUN",
  mixedProfile: "BUMBLEBEE_BATCH_MIXED_PROFILE",
  mixedEndpoint: "BUMBLEBEE_BATCH_MIXED_ENDPOINT",
  schemaMismatch: "BUMBLEBEE_BATCH_SCHEMA_MISMATCH",
  ecosystemForbidden: "BUMBLEBEE_BATCH_ECOSYSTEM_FORBIDDEN",
  missingCanonicalInputs: "BUMBLEBEE_BATCH_MISSING_CANONICAL_INPUTS",
  recordIdMismatch: "BUMBLEBEE_BATCH_RECORD_ID_MISMATCH",
  missingSummary: "BUMBLEBEE_BATCH_MISSING_SUMMARY",
  duplicateRecord: "BUMBLEBEE_BATCH_DUPLICATE_RECORD",
  limitExceeded: "BUMBLEBEE_BATCH_LIMIT_EXCEEDED",
} as const)

export interface ConformanceContext {
  readonly mode: "inventory" | "findings-only"
  readonly profile: "baseline" | "project" | "deep"
  readonly ecosystems: readonly string[]
  readonly expectedRunId?: string
}

export interface ConformedRecord {
  readonly line_number: number
  readonly line_sha256: string
  readonly record_type: "package" | "finding" | "scan_summary" | "diagnostic"
  readonly record_id: string
  readonly run_id: string
  readonly sanitized_payload: Readonly<Record<string, unknown>>
  readonly canonical_id_inputs: string
  readonly redaction_provenance: Readonly<{ endpoint: "stripped" }>
}

const RECORD_TYPES = Object.freeze(["package", "finding", "scan_summary", "diagnostic"] as const)
const RECORD_ID_PATTERN = /^(package|finding|scan_summary|diagnostic):[a-f0-9]{64}$/
const RUN_ID_PATTERN = /^[a-f0-9]{32}$/

// The pinned scanner (perplexityai/bumblebee v0.1.2) builds stable IDs as
// sha256(record_type + NUL + parts joined by 0x1e), with 0x1f inside
// sub-lists. Reimplementing it exactly lets us reject a record whose declared
// id was tampered with or truncated in transit.
const RS = "\x1e"
const US = "\x1f"
const NUL = "\x00"

type RawRecord = Record<string, unknown>

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function optionalBool(value: unknown): string {
  // Go *bool: empty string when the pointer is nil, else "true"/"false".
  if (value === undefined || value === null) return ""
  return String(value === true)
}

function requireString(record: RawRecord, field: string): string {
  const value = record[field]
  if (typeof value !== "string") {
    throw new Error(BUMBLEBEE_BATCH_ERROR.missingCanonicalInputs)
  }
  return value
}

function canonicalParts(record: RawRecord): string[] {
  const type = str(record.record_type)
  switch (type) {
    case "package":
      return [
        requireString(record, "profile"),
        requireString(record, "ecosystem"),
        requireString(record, "normalized_name"),
        requireString(record, "version"),
        requireString(record, "project_path"),
        requireString(record, "root_kind"),
        str(record.install_scope),
        requireString(record, "package_manager"),
        requireString(record, "source_type"),
        requireString(record, "source_file"),
        optionalBool(record.direct_dependency),
        boolString(record, "has_lifecycle_scripts"),
        lifecycleScripts(record),
        requireString(record, "confidence"),
        str(record.requested_spec),
        str(record.server_name),
      ]
    case "finding":
      return [
        requireString(record, "profile"),
        requireString(record, "finding_type"),
        requireString(record, "catalog_id"),
        requireString(record, "ecosystem"),
        requireString(record, "normalized_name"),
        requireString(record, "version"),
        requireString(record, "root_kind"),
        requireString(record, "project_path"),
        requireString(record, "source_type"),
        requireString(record, "source_file"),
        requireString(record, "confidence"),
      ]
    case "scan_summary": {
      const counts = (record.counts ?? {}) as Record<string, unknown>
      // Keys sorted so count-map iteration order can never change the digest.
      const canonicalCounts = Object.keys(counts)
        .sort()
        .map((key) => key + US + String(counts[key]))
        .join(RS)
      return [
        requireString(record, "profile"),
        requireString(record, "status"),
        requireString(record, "scan_time"),
        requireString(record, "end_time"),
        rootsList(record),
        canonicalCounts,
        String(record.package_records_emitted ?? 0),
        String(record.package_records_suppressed ?? 0),
        String(record.findings_emitted ?? 0),
        String(record.duplicates ?? 0),
        String(record.diagnostics_count ?? 0),
        String(record.files_considered ?? 0),
        String(record.timed_out ?? false),
        String(record.duration_ms ?? 0),
        String(record.http_batches_attempted ?? 0),
        String(record.http_batches_succeeded ?? 0),
        String(record.http_batches_failed ?? 0),
        String(record.http_last_status ?? 0),
        str(record.error),
      ]
    }
    case "diagnostic":
      return [requireString(record, "level"), str(record.path), requireString(record, "message")]
    default:
      throw new Error(BUMBLEBEE_BATCH_ERROR.unknownRecordType)
  }
}

function boolString(record: RawRecord, field: string): string {
  const value = record[field]
  if (typeof value !== "boolean") {
    throw new Error(BUMBLEBEE_BATCH_ERROR.missingCanonicalInputs)
  }
  return String(value)
}

function lifecycleScripts(record: RawRecord): string {
  const scripts = record.lifecycle_scripts
  if (scripts === undefined || scripts === null) return ""
  if (!Array.isArray(scripts) || scripts.some((s) => typeof s !== "string")) {
    throw new Error(BUMBLEBEE_BATCH_ERROR.missingCanonicalInputs)
  }
  // Sorted upstream so filesystem ordering noise cannot shift the digest.
  return [...(scripts as string[])].sort().join(US)
}

function rootsList(record: RawRecord): string {
  const roots = record.roots
  if (roots === undefined || roots === null) return ""
  if (!Array.isArray(roots)) throw new Error(BUMBLEBEE_BATCH_ERROR.missingCanonicalInputs)
  return roots
    .map((root) => {
      if (typeof root !== "object" || root === null) throw new Error(BUMBLEBEE_BATCH_ERROR.missingCanonicalInputs)
      const path = (root as RawRecord).path
      const kind = (root as RawRecord).kind
      if (typeof path !== "string" || typeof kind !== "string") {
        throw new Error(BUMBLEBEE_BATCH_ERROR.missingCanonicalInputs)
      }
      return path + US + kind
    })
    .join(RS)
}

export function recomputeRecordId(record: RawRecord): string {
  const type = str(record.record_type)
  const parts = canonicalParts(record)
  const digest = createHash("sha256").update(type + NUL + parts.join(RS)).digest("hex")
  return `${type}:${digest}`
}

function endpointIdentity(record: RawRecord): string {
  const endpoint = record.endpoint
  if (typeof endpoint !== "object" || endpoint === null) return ""
  const hostname = (endpoint as RawRecord).hostname
  const username = (endpoint as RawRecord).username
  return `${typeof hostname === "string" ? hostname : ""}|${typeof username === "string" ? username : ""}`
}

// Allowlist of fields permitted in the sanitized payload. Everything else
// (endpoint, scan_time, scanner_name, scanner_version, and any unknown
// future field) is stripped before storage. AC-15 requires allowlisted
// normalized fields only — a deny-list would silently persist new
// device-identifying metadata the upstream scanner adds.
const SANITIZED_FIELDS: ReadonlySet<string> = Object.freeze(new Set([
  "record_type",
  "record_id",
  "schema_version",
  "run_id",
  "profile",
  "ecosystem",
  "package_name",
  "normalized_name",
  "version",
  "project_path",
  "root_kind",
  "package_manager",
  "source_type",
  "source_file",
  "has_lifecycle_scripts",
  "confidence",
  "status",
  "end_time",
  "roots",
  "counts",
  "package_records_emitted",
  "package_records_suppressed",
  "findings_emitted",
  "duplicates",
  "diagnostics_count",
  "files_considered",
  "timed_out",
  "duration_ms",
  "finding_type",
  "catalog_id",
  "level",
  "message",
  "path",
  "install_scope",
  "direct_dependency",
  "lifecycle_scripts",
  "requested_spec",
  "server_name",
  "http_batches_attempted",
  "http_batches_succeeded",
  "http_batches_failed",
  "http_last_status",
  "error",
]))

function sanitize(record: RawRecord): Readonly<Record<string, unknown>> {
  const copy: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (SANITIZED_FIELDS.has(key)) copy[key] = value
  }
  return Object.freeze(copy)
}

function conformed(
  lineNumber: number,
  lineSha256: string,
  record: RawRecord,
  canonicalIdInputs: string,
): ConformedRecord {
  return Object.freeze({
    line_number: lineNumber,
    line_sha256: lineSha256,
    record_type: record.record_type as ConformedRecord["record_type"],
    record_id: str(record.record_id),
    run_id: str(record.run_id),
    sanitized_payload: sanitize(record),
    canonical_id_inputs: canonicalIdInputs,
    redaction_provenance: Object.freeze({ endpoint: "stripped" as const }),
  })
}

export function parseNdjsonBatch(
  raw: string,
  ctx: ConformanceContext,
): { records: ConformedRecord[]; summary?: ConformedRecord } {
  if (raw.trim().length === 0) {
    // An empty body is indistinguishable from a truncated upload — fail closed.
    throw new Error(BUMBLEBEE_BATCH_ERROR.malformedLine)
  }

  // A single trailing newline is standard NDJSON framing, not a blank record.
  const lines = raw.split("\n")
  if (lines[lines.length - 1] === "") lines.pop()

  if (lines.length > MAX_RECORDS) {
    throw new Error(BUMBLEBEE_BATCH_ERROR.limitExceeded)
  }

  let runId: string | undefined
  let endpoint: string | undefined
  const seenRecordIds = new Set<string>()
  const records: ConformedRecord[] = []
  let summary: ConformedRecord | undefined

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = index + 1

    if (line.trim().length === 0) {
      throw new Error(BUMBLEBEE_BATCH_ERROR.malformedLine)
    }
    if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
      throw new Error(BUMBLEBEE_BATCH_ERROR.limitExceeded)
    }

    let record: RawRecord
    try {
      const parsed: unknown = JSON.parse(line)
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("not an object")
      }
      record = parsed as RawRecord
    } catch {
      throw new Error(BUMBLEBEE_BATCH_ERROR.malformedLine)
    }

    const recordType = record.record_type
    if (typeof recordType !== "string" || !(RECORD_TYPES as readonly string[]).includes(recordType)) {
      throw new Error(BUMBLEBEE_BATCH_ERROR.unknownRecordType)
    }

    if (record.schema_version !== BUMBLEBEE_SCHEMA_VERSION) {
      throw new Error(BUMBLEBEE_BATCH_ERROR.schemaMismatch)
    }

    const recordRunId = record.run_id
    if (typeof recordRunId !== "string" || !RUN_ID_PATTERN.test(recordRunId)) {
      throw new Error(BUMBLEBEE_BATCH_ERROR.malformedLine)
    }
    if (runId === undefined) {
      runId = recordRunId
    } else if (recordRunId !== runId) {
      // A batch spanning runs cannot be attributed to one scan lease.
      throw new Error(BUMBLEBEE_BATCH_ERROR.mixedRun)
    }
    if (ctx.expectedRunId !== undefined && recordRunId !== ctx.expectedRunId) {
      throw new Error(BUMBLEBEE_BATCH_ERROR.mixedRun)
    }

    if (record.profile !== ctx.profile) {
      throw new Error(BUMBLEBEE_BATCH_ERROR.mixedProfile)
    }

    const recordEndpoint = endpointIdentity(record)
    if (endpoint === undefined) {
      endpoint = recordEndpoint
    } else if (recordEndpoint !== endpoint) {
      // Two devices in one batch means a replayed/merged upload.
      throw new Error(BUMBLEBEE_BATCH_ERROR.mixedEndpoint)
    }

    if (recordType === "package" || recordType === "finding") {
      const ecosystem = record.ecosystem
      if (typeof ecosystem !== "string") {
        throw new Error(BUMBLEBEE_BATCH_ERROR.missingCanonicalInputs)
      }
      const upstreamAllowlist =
        recordType === "package" ? BUMBLEBEE_INVENTORY_ECOSYSTEMS : BUMBLEBEE_FINDING_ECOSYSTEMS
      if (
        !(ctx.ecosystems as readonly string[]).includes(ecosystem) ||
        !(upstreamAllowlist as readonly string[]).includes(ecosystem)
      ) {
        throw new Error(BUMBLEBEE_BATCH_ERROR.ecosystemForbidden)
      }
    }

    // Canonical inputs must resolve before hashing so missing identity fields
    // surface as missingCanonicalInputs rather than a misleading id mismatch.
    const canonicalIdInputs = canonicalParts(record).join(RS)
    const recomputedId = recomputeRecordId(record)

    const declaredId = record.record_id
    if (typeof declaredId !== "string" || !RECORD_ID_PATTERN.test(declaredId)) {
      throw new Error(BUMBLEBEE_BATCH_ERROR.malformedLine)
    }
    if (declaredId !== recomputedId) {
      throw new Error(BUMBLEBEE_BATCH_ERROR.recordIdMismatch)
    }
    if (seenRecordIds.has(declaredId)) {
      throw new Error(BUMBLEBEE_BATCH_ERROR.duplicateRecord)
    }
    seenRecordIds.add(declaredId)

    const lineSha256 = createHash("sha256").update(line).digest("hex")
    const conformedRecord = conformed(lineNumber, lineSha256, record, canonicalIdInputs)

    if (recordType === "scan_summary") {
      if (summary !== undefined) {
        // Exactly one summary per batch — two means a concatenated upload.
        throw new Error(BUMBLEBEE_BATCH_ERROR.duplicateRecord)
      }
      summary = conformedRecord
    } else {
      records.push(conformedRecord)
    }
  }

  if (summary === undefined) {
    // Every scanner run terminates with exactly one scan_summary; absence
    // means the upload was truncated mid-stream.
    throw new Error(BUMBLEBEE_BATCH_ERROR.missingSummary)
  }

  return { records, summary }
}