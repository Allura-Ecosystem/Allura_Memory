if (typeof window !== "undefined") throw new Error("server-side only")

import { createHash } from "node:crypto"

import {
  BUMBLEBEE_BATCH_ERROR,
  type ConformanceContext,
  type ConformedRecord,
  MAX_BODY_BYTES,
  parseNdjsonBatch,
} from "./batch-conformance"
import { refusal } from "./lease-routes"

// Lease identity plus the conformance parameters the scan was issued with.
// The auth seam returns these; mode/profile/ecosystems stay optional so the
// route can authenticate before a conformance context exists.
export interface IngestLease {
  readonly groupId: string
  readonly workspaceId: string
  readonly sourceId: string
  readonly sourceRevisionId: string
  readonly leaseId: string
  readonly mode?: "inventory" | "findings-only"
  readonly profile?: "baseline" | "project" | "deep"
  readonly ecosystems?: readonly string[]
}

export interface PersistBatchInput {
  readonly lease: IngestLease
  readonly batchId: string
  readonly bodySha256: string
  readonly byteCount: number
  readonly lineCount: number
  readonly recordCount: number
  readonly records: readonly ConformedRecord[]
  readonly summaryRecordId: string
}

export interface IngestDeps {
  authenticate(request: Request, audience: "bumblebee_ingest"): Promise<{ lease: IngestLease }>
  findExistingBatch(params: { lease: IngestLease; bodySha256: string }): Promise<{ batchId: string } | null>
  findConflictingBatch(params: { lease: IngestLease }): Promise<{ batchId: string; bodySha256: string } | null>
  persistBatch(input: PersistBatchInput): Promise<void>
  now?(): Date
}

// Conformance failures surface the exact upstream code; only the status differs
// for size limits so clients can distinguish "shrink the payload" from "fix the
// payload". Anything the conformance layer did not declare is an internal fault.
const CONFORMANCE_STATUS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    Object.values(BUMBLEBEE_BATCH_ERROR).map((code) => [
      code,
      code === BUMBLEBEE_BATCH_ERROR.limitExceeded ? 413 : 400,
    ]),
  ) as Record<string, number>,
)

function mintBatchId(lease: IngestLease, bodySha256: string): string {
  // Deterministic from (lease, body): a retried upload after a failed persist
  // targets the same batch identity instead of minting a duplicate per attempt.
  const digest = createHash("sha256").update(`${lease.leaseId}\0${bodySha256}`).digest("hex")
  return `batch_${digest.slice(0, 32)}`
}

function failClosed(): Response {
  // No acceptance claim on any internal failure: the scanner must treat the
  // batch as un-landed and retry, never as accepted-but-lost.
  return Response.json({ error: "BUMBLEBEE_SERVICE_UNAVAILABLE" }, { status: 503 })
}

export async function ingestScannerBatch(request: Request, deps: IngestDeps): Promise<Response> {
  // (1) Authentication runs before a single body byte is buffered: otherwise an
  // unauthenticated caller receives free request-body processing work.
  let lease: IngestLease
  try {
    lease = (await deps.authenticate(request, "bumblebee_ingest")).lease
  } catch (error) {
    return refusal(error)
  }

  // (2) Content-Type pins the parser choice; reading and parsing anything that
  // is not NDJSON would just produce confusing downstream failures.
  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase()
  if (mediaType !== "application/x-ndjson") {
    return Response.json({ error: "BUMBLEBEE_BATCH_CONTENT_TYPE" }, { status: 415 })
  }

  // (2b) Encoding gate: only identity is accepted. A compressed payload must
  // be rejected deliberately here — otherwise gzip bytes fall through to the
  // parser and fail as a misleading MALFORMED_LINE, and a future decompression
  // step would need its bomb bound retroactively. AC-7: unsupported encodings
  // fail closed.
  const encoding = (request.headers.get("content-encoding") ?? "identity").trim().toLowerCase()
  if (encoding !== "identity") {
    return Response.json({ error: "BUMBLEBEE_BATCH_UNSUPPORTED_ENCODING" }, { status: 415 })
  }

  // (3) Bounded read. A declared Content-Length gives a cheap early exit; the
  // post-read byte check still bounds chunked/streaming uploads where the
  // header is absent or lying.
  const declaredBytes = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
    return Response.json({ error: "BUMBLEBEE_BATCH_TOO_LARGE" }, { status: 413 })
  }

  let raw: string
  try {
    raw = await request.text()
  } catch (error) {
    return refusal(error)
  }
  const byteCount = Buffer.byteLength(raw, "utf8")
  if (byteCount > MAX_BODY_BYTES) {
    return Response.json({ error: "BUMBLEBEE_BATCH_TOO_LARGE" }, { status: 413 })
  }

  // (4) The raw body digest is the idempotency key: identical bytes under the
  // same lease are one logical batch, whatever transport retries occurred.
  const bodySha256 = createHash("sha256").update(raw).digest("hex")

  // (5) Replay first — cheap DB lookups precede expensive parsing so a
  // duplicated upload costs one query, not a full conformance pass.
  let existing: { batchId: string } | null
  try {
    existing = await deps.findExistingBatch({ lease, bodySha256 })
  } catch (error) {
    return refusal(error)
  }
  if (existing !== null) {
    return Response.json({ batchId: existing.batchId, replayed: true }, { status: 200 })
  }

  // (6) Conflict: the lease already accepted a DIFFERENT body, so a second
  // distinct payload would double-count the scan. Point the client at the
  // accepted batch instead of silently accepting or echoing internals.
  let conflicting: { batchId: string; bodySha256: string } | null
  try {
    conflicting = await deps.findConflictingBatch({ lease })
  } catch (error) {
    return refusal(error)
  }
  if (conflicting !== null) {
    return Response.json({ error: "BUMBLEBEE_BATCH_CONFLICT", batchId: conflicting.batchId }, { status: 409 })
  }

  // (7) Conformance validation against the parameters the lease was issued
  // with; defaults only until the real lease rows carry these fields.
  const ctx: ConformanceContext = {
    mode: lease.mode ?? "inventory",
    profile: lease.profile ?? "baseline",
    ecosystems: lease.ecosystems ?? ["npm"],
  }
  let parsed: { records: ConformedRecord[]; summary?: ConformedRecord }
  try {
    parsed = parseNdjsonBatch(raw, ctx)
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const status = CONFORMANCE_STATUS[code]
    if (status === undefined) return failClosed()
    return Response.json({ error: code }, { status })
  }
  const summary = parsed.summary
  if (summary === undefined) return failClosed()

  const batchId = mintBatchId(lease, bodySha256)
  // The summary is itself an immutable emitted record. Persisting it alongside
  // the package/finding/diagnostic records keeps the held decision's summary
  // reference durable and makes receipt counts describe the full NDJSON batch.
  const batchRecords = [...parsed.records, summary]

  // (8) Atomic persist; fail closed on any storage fault so the client never
  // records an acceptance the system did not commit.
  try {
    await deps.persistBatch({
      lease,
      batchId,
      bodySha256,
      byteCount,
      lineCount: batchRecords.length,
      recordCount: batchRecords.length,
      records: batchRecords,
      summaryRecordId: summary.record_id,
    })
  } catch {
    return failClosed()
  }

  // (9) Accepted exactly once.
  return Response.json({ batchId, accepted: true, recordCount: batchRecords.length }, { status: 201 })
}