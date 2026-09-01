import { describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"

import { MAX_BODY_BYTES, MAX_LINE_BYTES } from "../batch-conformance"
import { type IngestDeps, type IngestLease, ingestScannerBatch, type PersistBatchInput } from "../ingest-pipeline"

/**
 * Fixture mirrors docs/archive/allura/evidence/epic-26/26.7/scan-output-baseline.ndjson
 * so tests exercise the exact shapes the pinned scanner emits.
 */
const RUN_ID = "f83a940c644dcb14152eed0c8b241477"

const packageA = {
  record_type: "package",
  record_id: "package:3e34dec18064de515fd4866c86327ccf262d0d2573947a109620e8a1b59577be",
  schema_version: "0.1.0",
  scanner_name: "bumblebee",
  scanner_version: "v0.1.2",
  run_id: RUN_ID,
  scan_time: "2026-08-28T23:59:14.725988598Z",
  endpoint: { hostname: "ronin704-MS-7B86", os: "linux", arch: "amd64", username: "ronin704", uid: "1000" },
  profile: "baseline",
  ecosystem: "npm",
  package_name: "left-pad",
  normalized_name: "left-pad",
  version: "1.3.0",
  project_path: "/tmp/scan-target",
  root_kind: "user_package_root",
  package_manager: "npm",
  source_type: "npm-node_modules",
  source_file: "/tmp/scan-target/node_modules/left-pad/package.json",
  has_lifecycle_scripts: false,
  confidence: "medium",
} as Record<string, unknown>

const packageB = {
  record_type: "package",
  record_id: "package:1d9b1140470b155b4a9020b4989ac17a7e2d1b77b93cb160317764c5a30a1ee4",
  schema_version: "0.1.0",
  scanner_name: "bumblebee",
  scanner_version: "v0.1.2",
  run_id: RUN_ID,
  scan_time: "2026-08-28T23:59:14.725988598Z",
  endpoint: { hostname: "ronin704-MS-7B86", os: "linux", arch: "amd64", username: "ronin704", uid: "1000" },
  profile: "baseline",
  ecosystem: "npm",
  package_name: "lodash",
  normalized_name: "lodash",
  version: "4.17.21",
  project_path: "/tmp/scan-target",
  root_kind: "user_package_root",
  package_manager: "npm",
  source_type: "npm-node_modules",
  source_file: "/tmp/scan-target/node_modules/lodash/package.json",
  has_lifecycle_scripts: false,
  confidence: "medium",
} as Record<string, unknown>

const scanSummary = {
  record_type: "scan_summary",
  record_id: "scan_summary:658e099a808173188827b64bf126588b9815a87745d3198014f57aee803007eb",
  schema_version: "0.1.0",
  scanner_name: "bumblebee",
  scanner_version: "v0.1.2",
  run_id: RUN_ID,
  scan_time: "2026-08-28T23:59:14.725988598Z",
  end_time: "2026-08-28T23:59:14.726695576Z",
  endpoint: { hostname: "ronin704-MS-7B86", os: "linux", arch: "amd64", username: "ronin704", uid: "1000" },
  profile: "baseline",
  status: "complete",
  roots: [{ path: "/tmp/scan-target", kind: "user_package_root" }],
  counts: { finding: 0, package: 2 },
  package_records_emitted: 2,
  findings_emitted: 0,
  duplicates: 0,
  diagnostics_count: 0,
  files_considered: 3,
  timed_out: false,
  duration_ms: 0,
} as Record<string, unknown>

const validBody = [packageA, packageB, scanSummary].map((r) => JSON.stringify(r)).join("\n")

const LEASE: IngestLease = {
  groupId: "group-1",
  workspaceId: "workspace-1",
  sourceId: "source-1",
  sourceRevisionId: "revision-1",
  leaseId: "lease-1",
  mode: "inventory",
  profile: "baseline",
  ecosystems: ["npm"],
}

function makeDeps(over: Partial<IngestDeps> = {}): IngestDeps {
  return {
    authenticate: async () => ({ lease: LEASE }),
    findExistingBatch: vi.fn(async () => null),
    findConflictingBatch: vi.fn(async () => null),
    persistBatch: vi.fn(async (_input: PersistBatchInput) => {}),
    ...over,
  }
}

function ndjsonRequest(body: string, contentType = "application/x-ndjson"): Request {
  return new Request("http://localhost/api/plugins/bumblebee/ingest", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  })
}

describe("ingestScannerBatch", () => {
  it("authenticates with the bumblebee_ingest audience before the body is ever read", async () => {
    const text = vi.fn(async () => {
      throw new Error("body must never be read")
    })
    const authenticate = vi.fn(async (_request: Request, audience: string) => {
      if (audience !== "bumblebee_ingest") throw new Error("BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN")
      throw new Error("BUMBLEBEE_AUTH_INVALID")
    })
    const response = await ingestScannerBatch(
      { headers: new Headers({ "content-type": "application/x-ndjson" }), text } as unknown as Request,
      makeDeps({ authenticate }),
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "BUMBLEBEE_AUTH_INVALID" })
    expect(authenticate).toHaveBeenCalledOnce()
    expect(authenticate.mock.calls[0][1]).toBe("bumblebee_ingest")
    expect(text).not.toHaveBeenCalled()
  })

  it("maps a wrong-audience credential rejection to 403", async () => {
    const text = vi.fn(async () => validBody)
    const response = await ingestScannerBatch(
      { headers: new Headers({ "content-type": "application/x-ndjson" }), text } as unknown as Request,
      makeDeps({ authenticate: async () => { throw new Error("BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN") } }),
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN" })
    expect(text).not.toHaveBeenCalled()
  })

  it.each(["application/json", "text/plain", "application/octet-stream"])(
    "rejects a non-NDJSON content type without reading the body: %s",
    async (contentType) => {
      const text = vi.fn(async () => validBody)
      const response = await ingestScannerBatch(
        { headers: new Headers({ "content-type": contentType }), text } as unknown as Request,
        makeDeps(),
      )
      expect(response.status).toBe(415)
      expect(await response.json()).toEqual({ error: "BUMBLEBEE_BATCH_CONTENT_TYPE" })
      expect(text).not.toHaveBeenCalled()
    },
  )

  it.each(["gzip", "deflate", "br"])(
    "rejects a non-identity content encoding deliberately before reading the body: %s",
    async (encoding) => {
      const text = vi.fn(async () => validBody)
      const response = await ingestScannerBatch(
        {
          headers: new Headers({ "content-type": "application/x-ndjson", "content-encoding": encoding }),
          text,
        } as unknown as Request,
        makeDeps(),
      )
      expect(response.status).toBe(415)
      expect(await response.json()).toEqual({ error: "BUMBLEBEE_BATCH_UNSUPPORTED_ENCODING" })
      expect(text).not.toHaveBeenCalled()
    },
  )

  it("rejects a missing content type", async () => {
    const text = vi.fn(async () => validBody)
    const response = await ingestScannerBatch(
      { headers: new Headers(), text } as unknown as Request,
      makeDeps(),
    )
    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({ error: "BUMBLEBEE_BATCH_CONTENT_TYPE" })
    expect(text).not.toHaveBeenCalled()
  })

  it("accepts an NDJSON content type that carries a charset parameter", async () => {
    const response = await ingestScannerBatch(
      ndjsonRequest(validBody, "application/x-ndjson; charset=utf-8"),
      makeDeps(),
    )
    expect(response.status).toBe(201)
  })

  it("rejects a body over MAX_BODY_BYTES with 413", async () => {
    const response = await ingestScannerBatch(
      ndjsonRequest("x".repeat(MAX_BODY_BYTES + 1)),
      makeDeps(),
    )
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "BUMBLEBEE_BATCH_TOO_LARGE" })
  })

  it("replays an identical body under the same lease without re-persisting", async () => {
    const persistBatch = vi.fn(async () => {})
    const findConflictingBatch = vi.fn(async () => null)
    const response = await ingestScannerBatch(
      ndjsonRequest(validBody),
      makeDeps({
        findExistingBatch: async () => ({ batchId: "batch-1" }),
        findConflictingBatch,
        persistBatch,
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ batchId: "batch-1", replayed: true })
    expect(persistBatch).not.toHaveBeenCalled()
    expect(findConflictingBatch).not.toHaveBeenCalled()
  })

  it("rejects a different body under a lease that already accepted one", async () => {
    const persistBatch = vi.fn(async () => {})
    const response = await ingestScannerBatch(
      ndjsonRequest(validBody),
      makeDeps({
        findConflictingBatch: async () => ({ batchId: "batch-0", bodySha256: "deadbeef" }),
        persistBatch,
      }),
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "BUMBLEBEE_BATCH_CONFLICT", batchId: "batch-0" })
    expect(persistBatch).not.toHaveBeenCalled()
  })

  it("rejects malformed NDJSON with the conformance error code", async () => {
    const response = await ingestScannerBatch(ndjsonRequest("this is not json\n"), makeDeps())
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "BUMBLEBEE_BATCH_MALFORMED_LINE" })
  })

  it("rejects an oversize line inside an otherwise small body with 413", async () => {
    const response = await ingestScannerBatch(
      ndjsonRequest("x".repeat(MAX_LINE_BYTES + 1) + "\n"),
      makeDeps(),
    )
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "BUMBLEBEE_BATCH_LIMIT_EXCEEDED" })
  })

  it("fails closed without an acceptance claim when persistence errors", async () => {
    const response = await ingestScannerBatch(
      ndjsonRequest(validBody),
      makeDeps({ persistBatch: async () => { throw new Error("db exploded: secret dsn postgres://...") } }),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "BUMBLEBEE_SERVICE_UNAVAILABLE" })
  })

  it("fails closed when the replay lookup itself errors", async () => {
    const response = await ingestScannerBatch(
      ndjsonRequest(validBody),
      makeDeps({ findExistingBatch: async () => { throw new Error("relation batches does not exist") } }),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "BUMBLEBEE_SERVICE_UNAVAILABLE" })
  })

  it("accepts a valid batch and persists the conformed records", async () => {
    const persisted: PersistBatchInput[] = []
    const response = await ingestScannerBatch(ndjsonRequest(validBody), makeDeps({
      persistBatch: async (input) => { persisted.push(input) },
    }))

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.accepted).toBe(true)
    expect(body.recordCount).toBe(3)
    expect(typeof body.batchId).toBe("string")

    expect(persisted).toHaveLength(1)
    const input = persisted[0]!
    expect(input.batchId).toBe(body.batchId)
    expect(input.lease).toEqual(LEASE)
    expect(input.bodySha256).toBe(createHash("sha256").update(validBody).digest("hex"))
    expect(input.byteCount).toBe(Buffer.byteLength(validBody, "utf8"))
    expect(input.lineCount).toBe(3)
    expect(input.recordCount).toBe(3)
    expect(input.summaryRecordId).toBe(scanSummary.record_id)
    expect(input.records.map((r) => r.record_id)).toEqual([
      packageA.record_id,
      packageB.record_id,
      scanSummary.record_id,
    ])
    for (const record of input.records) {
      expect(record.sanitized_payload).not.toHaveProperty("endpoint")
    }
  })
})