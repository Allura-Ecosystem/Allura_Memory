import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { describe, expect, it, vi } from "vitest"

import type { ParsedIngestBatch } from "../ingest"
import { createIngestHandler } from "../lease-routes"
import { BUMBLEBEE_INGEST_ERROR, BUMBLEBEE_INGEST_LIMITS, parseIngestRequest } from "../ingest"

const authority = Object.freeze({
  rawToken: "bmb_ingest_abcdefgh_body",
  groupId: "allura-ingest",
  workspaceId: "workspace-1",
  sourceId: "source-1",
  sourceRevisionId: "revision-1",
  leaseId: "lease-1",
})

function packageRecord() {
  const parts = ["baseline", "npm", "safe-package", "1.2.3", "", "", "", "npm", "lockfile", "/private/project/package-lock.json", "", "false", "", "high", "", ""]
  const digest = createHash("sha256").update(`package\0${parts.join("\x1e")}`).digest("hex")
  return {
    record_type: "package",
    record_id: `package:${digest}`,
    schema_version: "0.1.0",
    scanner_name: "bumblebee",
    scanner_version: "v0.1.2",
    run_id: "0123456789abcdef0123456789abcdef",
    scan_time: "2026-08-28T12:00:00.000Z",
    endpoint: { hostname: "private-host", os: "linux", arch: "amd64", username: "secret-user", uid: "1000", device_id: "device-1" },
    profile: "baseline",
    ecosystem: "npm",
    package_name: "safe-package",
    normalized_name: "safe-package",
    version: "1.2.3",
    package_manager: "npm",
    source_type: "lockfile",
    source_file: "/private/project/package-lock.json",
    has_lifecycle_scripts: false,
    confidence: "high",
  }
}

function summaryRecord() {
  const parts = ["baseline", "complete", "2026-08-28T12:00:00.000Z", "2026-08-28T12:00:05.000Z", "", "", "1", "0", "0", "0", "0", "1", "false", "5", "0", "0", "0", "0", ""]
  const digest = createHash("sha256").update(`scan_summary\0${parts.join("\x1e")}`).digest("hex")
  return {
    record_type: "scan_summary",
    record_id: `scan_summary:${digest}`,
    schema_version: "0.1.0",
    scanner_name: "bumblebee",
    scanner_version: "v0.1.2",
    run_id: "0123456789abcdef0123456789abcdef",
    scan_time: "2026-08-28T12:00:00.000Z",
    endpoint: { hostname: "private-host", os: "linux", arch: "amd64", username: "secret-user", uid: "1000", device_id: "device-1" },
    profile: "baseline",
    end_time: "2026-08-28T12:00:05.000Z",
    status: "complete",
    package_records_emitted: 1,
    findings_emitted: 0,
    duplicates: 0,
    diagnostics_count: 0,
    files_considered: 1,
    timed_out: false,
    duration_ms: 5,
  }
}

describe("Story 26.7 HTTPS NDJSON ingest route", () => {
  it("authenticates an HTTPS request and atomically forwards a strict sanitized batch", async () => {
    const persist = vi.fn(async () => ({ receiptId: "receipt-1", replayed: false }))
    const record = packageRecord()
    const handler = createIngestHandler({ authenticate: vi.fn(async () => authority), persist })

    const response = await handler(new Request("https://allura.example/api/plugins/bumblebee/ingest", {
      method: "POST",
      headers: { authorization: "Bearer ignored", "content-type": "application/x-ndjson" },
      body: `${JSON.stringify(record)}\n`,
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ receiptId: "receipt-1", replayed: false })
    expect(persist).toHaveBeenCalledOnce()
    const accepted = persist.mock.calls[0][0]
    expect(accepted.authority).toEqual({
      groupId: authority.groupId,
      workspaceId: authority.workspaceId,
      sourceId: authority.sourceId,
      sourceRevisionId: authority.sourceRevisionId,
      leaseId: authority.leaseId,
    })
    expect(JSON.stringify(accepted)).not.toContain(authority.rawToken)
    expect(accepted.records).toHaveLength(1)
    expect(accepted.records[0].sanitized).toEqual({
      record_type: "package", record_id: record.record_id, schema_version: "0.1.0",
      scanner_name: "bumblebee", scanner_version: "v0.1.2", run_id: "0123456789abcdef0123456789abcdef",
      scan_time: "2026-08-28T12:00:00.000Z", profile: "baseline", ecosystem: "npm",
      package_name: "safe-package", normalized_name: "safe-package", version: "1.2.3",
      package_manager: "npm", source_type: "lockfile", has_lifecycle_scripts: false,
      confidence: "high", endpoint: { os: "linux", arch: "amd64", device_id: "device-1" },
    })
    expect(JSON.stringify(accepted)).not.toContain("private-host")
    expect(JSON.stringify(accepted)).not.toContain("secret-user")
    expect(JSON.stringify(accepted)).not.toContain("package-lock.json")
  })

  it("never reads, decompresses, parses, or checks transport before authentication succeeds", async () => {
    const arrayBuffer = vi.fn(() => { throw new Error("must not read") })
    const persist = vi.fn()
    const response = await createIngestHandler({
      authenticate: async () => { throw new Error("BUMBLEBEE_AUTH_INVALID") }, persist,
    })({ url: "http://public.example/ingest", headers: new Headers(), arrayBuffer } as unknown as Request)
    expect(response.status).toBe(401)
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it("accepts bounded gzip after authentication and hashes exact wire and expanded bodies", async () => {
    const expanded = Buffer.from(`${JSON.stringify(packageRecord())}\n`)
    const wire = gzipSync(expanded)
    const persist = vi.fn(async (_batch: ParsedIngestBatch) => ({ receiptId: "gzip-receipt", replayed: false }))
    const response = await createIngestHandler({ authenticate: async () => authority, persist })(new Request(
      "https://allura.example/api/plugins/bumblebee/ingest", { method: "POST", headers: {
        "content-type": "application/x-ndjson", "content-encoding": "gzip",
      }, body: wire },
    ))
    expect(response.status).toBe(201)
    expect(persist.mock.calls[0][0]).toMatchObject({
      bodySha256: createHash("sha256").update(wire).digest("hex"),
      expandedSha256: createHash("sha256").update(expanded).digest("hex"),
      compressedBytes: wire.byteLength, expandedBytes: expanded.byteLength,
    })
  })

  it.each([
    ["http://public.example/ingest", { "content-type": "application/x-ndjson" }, "BUMBLEBEE_INGEST_HTTPS_REQUIRED", 400],
    ["https://allura.example/ingest", { "content-type": "application/json" }, "BUMBLEBEE_INGEST_MEDIA_TYPE_UNSUPPORTED", 415],
    ["https://allura.example/ingest", { "content-type": "application/x-ndjson", "content-encoding": "br" }, "BUMBLEBEE_INGEST_ENCODING_UNSUPPORTED", 415],
  ])("fails closed for transport/media/encoding: %s", async (url, headers, code, status) => {
    const persist = vi.fn()
    const response = await createIngestHandler({ authenticate: async () => authority, persist })(new Request(url, {
      method: "POST", headers, body: `${JSON.stringify(packageRecord())}\n`,
    }))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: code })
    expect(persist).not.toHaveBeenCalled()
  })

  it("does not touch the body when authentication fails", async () => {
    let touched = false
    const request = {
      url: "https://allura.example/api/plugins/bumblebee/ingest",
      headers: new Headers({ authorization: "Bearer bad" }),
      get body() { touched = true; throw new Error("body touched") },
      arrayBuffer() { touched = true; throw new Error("body touched") },
    } as unknown as Request
    const handler = createIngestHandler({
      authenticate: vi.fn(async () => { throw new Error("BUMBLEBEE_AUTH_INVALID") }),
      persist: vi.fn(),
    })
    expect((await handler(request)).status).toBe(401)
    expect(touched).toBe(false)
  })

  it.each([
    ["http://allura.example/ingest", {}, 400],
    ["http://allura.example/ingest", { "x-forwarded-proto": "https" }, 400],
    ["https://allura.example/ingest", {}, 201],
  ])("enforces explicit HTTPS policy for %s", async (url, extraHeaders, status) => {
    const old = process.env.BUMBLEBEE_TRUST_PROXY
    delete process.env.BUMBLEBEE_TRUST_PROXY
    const handler = createIngestHandler({ authenticate: vi.fn(async () => authority), persist: vi.fn(async () => ({ receiptId: "r", replayed: false })) })
    const response = await handler(new Request(url, { method: "POST", headers: { "content-type": "application/x-ndjson", ...extraHeaders }, body: `${JSON.stringify(packageRecord())}\n` }))
    expect(response.status).toBe(status)
    if (old !== undefined) process.env.BUMBLEBEE_TRUST_PROXY = old
  })

  it("honors forwarded HTTPS only when proxy trust is explicit and allows insecure loopback only in test", async () => {
    const oldTrust = process.env.BUMBLEBEE_TRUST_PROXY
    const oldLoop = process.env.BUMBLEBEE_ALLOW_INSECURE_LOOPBACK_TEST
    process.env.BUMBLEBEE_TRUST_PROXY = "true"
    const body = `${JSON.stringify(packageRecord())}\n`
    await expect(parseIngestRequest(new Request("http://allura.example/i", { method: "POST", headers: { "content-type": "application/x-ndjson", "x-forwarded-proto": "https" }, body }), authority)).resolves.toBeTruthy()
    process.env.BUMBLEBEE_TRUST_PROXY = "false"
    process.env.BUMBLEBEE_ALLOW_INSECURE_LOOPBACK_TEST = "true"
    await expect(parseIngestRequest(new Request("http://127.0.0.1/i", { method: "POST", headers: { "content-type": "application/x-ndjson" }, body }), authority)).resolves.toBeTruthy()
    if (oldTrust === undefined) delete process.env.BUMBLEBEE_TRUST_PROXY; else process.env.BUMBLEBEE_TRUST_PROXY = oldTrust
    if (oldLoop === undefined) delete process.env.BUMBLEBEE_ALLOW_INSECURE_LOOPBACK_TEST; else process.env.BUMBLEBEE_ALLOW_INSECURE_LOOPBACK_TEST = oldLoop
  })

  it.each([
    [{ "content-type": "application/json" }, BUMBLEBEE_INGEST_ERROR.mediaType, 415],
    [{ "content-type": "application/x-ndjson", "content-encoding": "br" }, BUMBLEBEE_INGEST_ERROR.encoding, 415],
  ])("rejects unsupported media and encoding", async (headers, code, status) => {
    const handler = createIngestHandler({ authenticate: vi.fn(async () => authority), persist: vi.fn() })
    const response = await handler(new Request("https://allura.example/i", { method: "POST", headers, body: "{}\n" }))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: code })
  })

  it("counts streamed compressed bytes and stops at the wire limit", async () => {
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(300_000)) } })
    const request = new Request("https://allura.example/i", { method: "POST", headers: { "content-type": "application/x-ndjson" }, body: stream, duplex: "half" } as RequestInit)
    await expect(parseIngestRequest(request, authority)).rejects.toThrow(BUMBLEBEE_INGEST_ERROR.compressedLimit)
    expect(pulls).toBeLessThan(10)
  })

  it("distinguishes malformed gzip from expanded gzip overflow", async () => {
    const malformed = new Request("https://allura.example/i", { method: "POST", headers: { "content-type": "application/x-ndjson", "content-encoding": "gzip" }, body: new Uint8Array([1, 2, 3]) })
    await expect(parseIngestRequest(malformed, authority)).rejects.toThrow(BUMBLEBEE_INGEST_ERROR.invalidGzip)
    const bomb = gzipSync(Buffer.alloc(BUMBLEBEE_INGEST_LIMITS.expandedBytes + 1, 32))
    const overflow = new Request("https://allura.example/i", { method: "POST", headers: { "content-type": "application/x-ndjson", "content-encoding": "gzip" }, body: bomb })
    await expect(parseIngestRequest(overflow, authority)).rejects.toThrow(BUMBLEBEE_INGEST_ERROR.expandedLimit)
  })

  it("requires at most one scan summary and requires it to trail its run", async () => {
    const parse = (records: unknown[]) => parseIngestRequest(new Request("https://allura.example/i", {
      method: "POST",
      headers: { "content-type": "application/x-ndjson" },
      body: `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    }), authority)
    await expect(parse([packageRecord(), summaryRecord()])).resolves.toMatchObject({ lineCount: 2 })
    await expect(parse([summaryRecord(), packageRecord()])).rejects.toThrow(BUMBLEBEE_INGEST_ERROR.invalidRecord)
    await expect(parse([summaryRecord(), summaryRecord()])).rejects.toThrow(BUMBLEBEE_INGEST_ERROR.invalidRecord)
  })

  it("rejects malformed NDJSON, wrong pinned scanner, run id, enum drift, and mixed runs", async () => {
    const cases: string[] = ["{\n"]
    for (const mutate of [
      (r: ReturnType<typeof packageRecord>) => { r.scanner_version = "v0.1.3" },
      (r: ReturnType<typeof packageRecord>) => { r.run_id = "run-1" },
      (r: ReturnType<typeof packageRecord>) => { r.ecosystem = "agent-skill" },
    ]) { const r = packageRecord(); mutate(r); cases.push(`${JSON.stringify(r)}\n`) }
    const other = packageRecord(); other.run_id = "abcdefabcdefabcdefabcdefabcdefab"
    cases.push(`${JSON.stringify(packageRecord())}\n${JSON.stringify(other)}\n`)
    for (const body of cases) {
      await expect(parseIngestRequest(new Request("https://allura.example/i", { method: "POST", headers: { "content-type": "application/x-ndjson" }, body }), authority)).rejects.toThrow(/BUMBLEBEE_INGEST_INVALID_(NDJSON|RECORD)/)
    }
  })

  it("maps replay, conflict, unknown DB failure safely and never leaks secrets", async () => {
    const body = `${JSON.stringify(packageRecord())}\n`
    for (const [failure, expectedStatus, expectedBody] of [
      [null, 200, { receiptId: "same", replayed: true }],
      [new Error(BUMBLEBEE_INGEST_ERROR.recordConflict), 409, { error: BUMBLEBEE_INGEST_ERROR.recordConflict }],
      [new Error("postgres secret=canary-password"), 503, { error: "BUMBLEBEE_SERVICE_UNAVAILABLE" }],
    ] as const) {
      const persist = failure ? vi.fn(async () => { throw failure }) : vi.fn(async () => expectedBody)
      const response = await createIngestHandler({ authenticate: vi.fn(async () => authority), persist })(new Request("https://allura.example/i", { method: "POST", headers: { "content-type": "application/x-ndjson", authorization: "Bearer canary-token" }, body }))
      expect(response.status).toBe(expectedStatus)
      expect(await response.json()).toEqual(expectedBody)
      expect(JSON.stringify(expectedBody)).not.toContain("canary")
    }
  })
})
