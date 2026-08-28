if (typeof window !== "undefined") throw new Error("server-side only")

import { createHash } from "node:crypto"
import { gunzipSync } from "node:zlib"

import type { BoundIngestAuthority } from "./lease-repository"

export const BUMBLEBEE_INGEST_LIMITS = Object.freeze({
  compressedBytes: 1_048_576,
  expandedBytes: 4_194_304,
  lineBytes: 262_144,
  records: 500,
})

export const BUMBLEBEE_INGEST_ERROR = Object.freeze({
  insecureTransport: "BUMBLEBEE_INGEST_HTTPS_REQUIRED",
  mediaType: "BUMBLEBEE_INGEST_MEDIA_TYPE_UNSUPPORTED",
  encoding: "BUMBLEBEE_INGEST_ENCODING_UNSUPPORTED",
  invalidGzip: "BUMBLEBEE_INGEST_INVALID_GZIP",
  compressedLimit: "BUMBLEBEE_INGEST_COMPRESSED_LIMIT",
  expandedLimit: "BUMBLEBEE_INGEST_EXPANDED_LIMIT",
  lineLimit: "BUMBLEBEE_INGEST_LINE_LIMIT",
  recordLimit: "BUMBLEBEE_INGEST_RECORD_LIMIT",
  invalidNdjson: "BUMBLEBEE_INGEST_INVALID_NDJSON",
  invalidRecord: "BUMBLEBEE_INGEST_INVALID_RECORD",
  recordConflict: "BUMBLEBEE_INGEST_RECORD_CONFLICT",
} as const)

export interface SanitizedIngestRecord {
  lineNumber: number
  recordId: string
  runId: string
  recordType: "package" | "finding" | "scan_summary"
  lineSha256: string
  verificationDigest: string
  sanitized: Readonly<Record<string, unknown>>
  redactionProvenance: Readonly<{ policy: "bumblebee-ingest-v1"; omittedFields: readonly string[] }>
}

export interface ParsedIngestBatch {
  authority: BoundIngestAuthority
  bodySha256: string
  expandedSha256: string
  compressedBytes: number
  expandedBytes: number
  lineCount: number
  records: readonly SanitizedIngestRecord[]
  sanitizedPayloadDigest: string
}

export interface BatchReceipt { receiptId: string; replayed: boolean }
export type PersistIngestBatch = (batch: ParsedIngestBatch) => Promise<BatchReceipt>

function fail(code: string): never { throw new Error(code) }
function hash(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex") }
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  return value as Record<string, unknown>
}
function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== "string" || value.length === 0) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  return value
}
function exactKeys(record: Record<string, unknown>, allowed: readonly string[], required: readonly string[]) {
  if (Object.keys(record).some((key) => !allowed.includes(key)) || required.some((key) => !(key in record))) {
    fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  }
}
function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

const endpointKeys = ["hostname", "os", "arch", "username", "uid", "device_id"]
const endpointRequired = ["hostname", "os", "arch", "username", "uid"]
const common = ["record_type", "record_id", "schema_version", "scanner_name", "scanner_version", "run_id", "scan_time", "endpoint", "profile"]
const packageKeys = [...common, "ecosystem", "package_name", "normalized_name", "version", "project_path", "root_kind", "install_scope", "package_manager", "source_type", "source_file", "direct_dependency", "has_lifecycle_scripts", "lifecycle_scripts", "confidence", "requested_spec", "server_name"]
const packageRequired = [...common, "ecosystem", "package_name", "normalized_name", "version", "source_type", "source_file", "has_lifecycle_scripts", "confidence"]
const findingKeys = [...common, "finding_type", "severity", "catalog_id", "catalog_name", "ecosystem", "package_name", "normalized_name", "version", "root_kind", "project_path", "source_type", "source_file", "confidence", "evidence"]
const findingRequired = [...common, "finding_type", "catalog_id", "ecosystem", "package_name", "normalized_name", "version", "source_type", "source_file", "confidence"]
const summaryKeys = [...common, "end_time", "status", "roots", "counts", "package_records_emitted", "package_records_suppressed", "findings_emitted", "duplicates", "diagnostics_count", "files_considered", "timed_out", "duration_ms", "http_batches_attempted", "http_batches_succeeded", "http_batches_failed", "http_last_status", "error"]
const summaryRequired = [...common, "end_time", "status", "package_records_emitted", "findings_emitted", "duplicates", "diagnostics_count", "files_considered", "timed_out", "duration_ms"]
const profiles = ["baseline", "project", "deep"]
const packageEcosystems = ["npm", "pypi", "go", "rubygems", "packagist", "mcp", "editor-extension", "browser-extension", "homebrew"]
const findingEcosystems = packageEcosystems.filter((value) => value !== "homebrew")

function canonicalId(type: string, parts: readonly string[]): string {
  return `${type}:${hash(`${type}\0${parts.join("\x1e")}`)}`
}
function optionalString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (value === undefined) return ""
  if (typeof value !== "string") fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  return value
}
function optionalInt(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (value === undefined) return 0
  if (!finiteNonNegative(value)) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  return value
}
function endpoint(record: Record<string, unknown>) {
  const value = object(record.endpoint)
  exactKeys(value, endpointKeys, endpointRequired)
  const hostname = stringField(value, "hostname")
  const username = stringField(value, "username")
  const uid = stringField(value, "uid")
  void hostname; void username; void uid
  const safe: Record<string, string> = { os: stringField(value, "os"), arch: stringField(value, "arch") }
  if (value.device_id !== undefined) safe.device_id = stringField(value, "device_id")
  return safe
}
function validateCommon(record: Record<string, unknown>, type: string) {
  if (record.record_type !== type || record.schema_version !== "0.1.0" || record.scanner_name !== "bumblebee" || record.scanner_version !== "v0.1.2") fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  if (!/^[a-f0-9]{32}$/.test(stringField(record, "run_id"))) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  if (!Number.isFinite(Date.parse(stringField(record, "scan_time"))) || !profiles.includes(String(record.profile))) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
}

function sanitizeRecord(raw: unknown, line: Uint8Array, lineNumber: number): SanitizedIngestRecord {
  const record = object(raw)
  const type = stringField(record, "record_type")
  validateCommon(record, type)
  const safeEndpoint = endpoint(record)
  let parts: string[]
  let sanitized: Record<string, unknown>
  let omitted: string[]
  if (type === "package") {
    exactKeys(record, packageKeys, packageRequired)
    if (!packageEcosystems.includes(String(record.ecosystem)) || !["high", "medium", "low"].includes(String(record.confidence)) || typeof record.has_lifecycle_scripts !== "boolean") fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
    if (record.direct_dependency !== undefined && typeof record.direct_dependency !== "boolean") fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
    const scripts = record.lifecycle_scripts === undefined ? [] : record.lifecycle_scripts
    if (!Array.isArray(scripts) || scripts.some((value) => typeof value !== "string")) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
    parts = [String(record.profile), String(record.ecosystem), stringField(record, "normalized_name"), String(record.version), optionalString(record, "project_path"), optionalString(record, "root_kind"), optionalString(record, "install_scope"), optionalString(record, "package_manager"), String(record.source_type), String(record.source_file), record.direct_dependency === undefined ? "" : String(record.direct_dependency), String(record.has_lifecycle_scripts), [...scripts].sort().join("\x1e"), String(record.confidence), optionalString(record, "requested_spec"), optionalString(record, "server_name")]
    sanitized = Object.fromEntries(packageKeys.filter((key) => record[key] !== undefined && !["hostname", "username", "uid", "project_path", "source_file", "lifecycle_scripts", "requested_spec", "server_name"].includes(key)).map((key) => [key, record[key]]))
    sanitized.endpoint = safeEndpoint
    omitted = ["endpoint.hostname", "endpoint.username", "endpoint.uid", "project_path", "source_file", "lifecycle_scripts", "requested_spec", "server_name"].filter((key) => key.includes(".") || record[key] !== undefined)
  } else if (type === "finding") {
    exactKeys(record, findingKeys, findingRequired)
    if (record.finding_type !== "package_exposure" || !findingEcosystems.includes(String(record.ecosystem)) || !["high", "medium", "low"].includes(String(record.confidence))) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
    parts = [String(record.profile), String(record.finding_type), String(record.catalog_id), String(record.ecosystem), String(record.normalized_name), String(record.version), optionalString(record, "root_kind"), optionalString(record, "project_path"), String(record.source_type), String(record.source_file), String(record.confidence)]
    sanitized = Object.fromEntries(findingKeys.filter((key) => record[key] !== undefined && !["catalog_name", "project_path", "source_file", "evidence"].includes(key)).map((key) => [key, record[key]]))
    sanitized.endpoint = safeEndpoint
    omitted = ["endpoint.hostname", "endpoint.username", "endpoint.uid", "catalog_name", "project_path", "source_file", "evidence"].filter((key) => key.includes(".") || record[key] !== undefined)
  } else if (type === "scan_summary") {
    exactKeys(record, summaryKeys, summaryRequired)
    if (!["complete", "partial", "error"].includes(String(record.status)) || typeof record.timed_out !== "boolean" || !Number.isFinite(Date.parse(stringField(record, "end_time")))) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
    for (const key of ["package_records_emitted", "findings_emitted", "duplicates", "diagnostics_count", "files_considered", "duration_ms"]) if (!finiteNonNegative(record[key])) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
    const roots = record.roots === undefined ? [] : record.roots
    if (!Array.isArray(roots)) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
    const rootParts = roots.map((root) => { const value = object(root); exactKeys(value, ["path", "kind"], ["path", "kind"]); return `${stringField(value, "path")}\x1f${stringField(value, "kind")}` })
    const counts = record.counts === undefined ? {} : object(record.counts)
    if (Object.values(counts).some((value) => !finiteNonNegative(value))) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
    const canonicalCounts = Object.keys(counts).sort().map((key) => `${key}\x1f${counts[key]}`).join("\x1e")
    parts = [String(record.profile), String(record.status), String(record.scan_time), String(record.end_time), rootParts.join("\x1e"), canonicalCounts, String(record.package_records_emitted), String(optionalInt(record, "package_records_suppressed")), String(record.findings_emitted), String(record.duplicates), String(record.diagnostics_count), String(record.files_considered), String(record.timed_out), String(record.duration_ms), String(optionalInt(record, "http_batches_attempted")), String(optionalInt(record, "http_batches_succeeded")), String(optionalInt(record, "http_batches_failed")), String(optionalInt(record, "http_last_status")), optionalString(record, "error")]
    sanitized = Object.fromEntries(summaryKeys.filter((key) => record[key] !== undefined && !["roots", "error"].includes(key)).map((key) => [key, record[key]]))
    sanitized.endpoint = safeEndpoint
    omitted = ["endpoint.hostname", "endpoint.username", "endpoint.uid", "roots", "error"].filter((key) => key.includes(".") || record[key] !== undefined)
  } else fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  const expected = canonicalId(type, parts)
  if (record.record_id !== expected) fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  const canonical = JSON.stringify(parts)
  return Object.freeze({ lineNumber, recordId: expected, runId: String(record.run_id), recordType: type, lineSha256: hash(line), verificationDigest: hash(canonical), sanitized: Object.freeze(sanitized), redactionProvenance: Object.freeze({ policy: "bumblebee-ingest-v1", omittedFields: Object.freeze(omitted) }) }) as SanitizedIngestRecord
}

export function assertSecureTransport(request: Request): void {
  const url = new URL(request.url)
  if (url.protocol === "https:") return
  const allowLoopback = process.env.NODE_ENV === "test" && process.env.BUMBLEBEE_ALLOW_INSECURE_LOOPBACK_TEST === "true" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  const trustedProxy = process.env.BUMBLEBEE_TRUST_PROXY === "true" && request.headers.get("x-forwarded-proto") === "https"
  if (!allowLoopback && !trustedProxy) fail(BUMBLEBEE_INGEST_ERROR.insecureTransport)
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const stream = request.body
  if (!stream) return new Uint8Array()
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > BUMBLEBEE_INGEST_LIMITS.compressedBytes) {
        await reader.cancel().catch(() => undefined)
        fail(BUMBLEBEE_INGEST_ERROR.compressedLimit)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function parseIngestRequest(request: Request, authority: BoundIngestAuthority): Promise<ParsedIngestBatch> {
  assertSecureTransport(request)
  if (request.headers.get("content-type") !== "application/x-ndjson") fail(BUMBLEBEE_INGEST_ERROR.mediaType)
  const encoding = request.headers.get("content-encoding") ?? "identity"
  if (encoding !== "identity" && encoding !== "gzip") fail(BUMBLEBEE_INGEST_ERROR.encoding)
  const contentLength = request.headers.get("content-length")
  if (contentLength !== null) {
    const stated = Number(contentLength)
    if (!Number.isSafeInteger(stated) || stated < 0) fail(BUMBLEBEE_INGEST_ERROR.invalidNdjson)
    if (stated > BUMBLEBEE_INGEST_LIMITS.compressedBytes) fail(BUMBLEBEE_INGEST_ERROR.compressedLimit)
  }
  const wire = await readBoundedBody(request)
  if (wire.byteLength > BUMBLEBEE_INGEST_LIMITS.compressedBytes) fail(BUMBLEBEE_INGEST_ERROR.compressedLimit)
  let expanded: Uint8Array
  try {
    expanded = encoding === "gzip" ? gunzipSync(wire, { maxOutputLength: BUMBLEBEE_INGEST_LIMITS.expandedBytes + 1 }) : wire
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") fail(BUMBLEBEE_INGEST_ERROR.expandedLimit)
    fail(BUMBLEBEE_INGEST_ERROR.invalidGzip)
  }
  if (expanded.byteLength > BUMBLEBEE_INGEST_LIMITS.expandedBytes) fail(BUMBLEBEE_INGEST_ERROR.expandedLimit)
  if (expanded.byteLength === 0 || expanded[expanded.byteLength - 1] !== 10) fail(BUMBLEBEE_INGEST_ERROR.invalidNdjson)
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(expanded.subarray(0, -1))
  } catch {
    fail(BUMBLEBEE_INGEST_ERROR.invalidNdjson)
  }
  const lines = text.split("\n")
  if (lines.length > BUMBLEBEE_INGEST_LIMITS.records) fail(BUMBLEBEE_INGEST_ERROR.recordLimit)
  const records = lines.map((line, index) => {
    const bytes = Buffer.from(line)
    if (bytes.byteLength === 0) fail(BUMBLEBEE_INGEST_ERROR.invalidNdjson)
    if (bytes.byteLength > BUMBLEBEE_INGEST_LIMITS.lineBytes) fail(BUMBLEBEE_INGEST_ERROR.lineLimit)
    try { return sanitizeRecord(JSON.parse(line), bytes, index + 1) } catch (error) { if (error instanceof Error && error.message.startsWith("BUMBLEBEE_")) throw error; fail(BUMBLEBEE_INGEST_ERROR.invalidNdjson) }
  })
  const runId = records[0]?.runId
  const profile = records[0]?.sanitized.profile
  const deviceId = (records[0]?.sanitized.endpoint as Record<string, unknown> | undefined)?.device_id
  if (records.some((record) => record.runId !== runId || record.sanitized.profile !== profile ||
    (record.sanitized.endpoint as Record<string, unknown> | undefined)?.device_id !== deviceId)) {
    fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  }
  const summaries = records.filter((record) => record.recordType === "scan_summary")
  if (summaries.length > 1 || (summaries.length === 1 && records.at(-1)?.recordType !== "scan_summary")) {
    fail(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  }
  const sanitizedAuthority = Object.freeze({
    groupId: authority.groupId,
    workspaceId: authority.workspaceId,
    sourceId: authority.sourceId,
    sourceRevisionId: authority.sourceRevisionId,
    leaseId: authority.leaseId,
  })
  return Object.freeze({ authority: sanitizedAuthority, bodySha256: hash(wire), expandedSha256: hash(expanded), compressedBytes: wire.byteLength, expandedBytes: expanded.byteLength, lineCount: lines.length, records: Object.freeze(records), sanitizedPayloadDigest: hash(JSON.stringify(records.map((record) => record.sanitized))) })
}
