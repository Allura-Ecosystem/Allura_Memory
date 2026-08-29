import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * AC-6/AC-19: production ingestion is HTTPS-only with explicit trusted-proxy
 * scheme handling. Pike's finding: the previous implementation treated an
 * *absent* x-forwarded-proto header as "pass" (fail-open). These tests prove
 * the fixed decision matrix in `enforceHttps` (fail-closed) and, separately,
 * that the real route wiring actually rejects/accepts requests end-to-end --
 * not just that the isolated function has the right shape.
 */

function prodRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", headers })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("enforceHttps (behavioural decision matrix)", () => {
  it("non-production: never enforces, any scheme/header combination passes", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const { enforceHttps } = await import("@/app/api/plugins/bumblebee/ingest/route")
    expect(() => enforceHttps(prodRequest("http://localhost/api/plugins/bumblebee/ingest"))).not.toThrow()
  })

  it("production + x-forwarded-proto: http -> rejected (pre-existing behaviour, preserved)", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { enforceHttps } = await import("@/app/api/plugins/bumblebee/ingest/route")
    const request = prodRequest("http://ingest.example/api/plugins/bumblebee/ingest", {
      "x-forwarded-proto": "http",
    })
    expect(() => enforceHttps(request)).toThrow("BUMBLEBEE_INGEST_HTTPS_REQUIRED")
  })

  it("production + header entirely absent -> REJECTED (the fail-open defect, now closed)", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { enforceHttps } = await import("@/app/api/plugins/bumblebee/ingest/route")
    const request = prodRequest("http://ingest.example/api/plugins/bumblebee/ingest")
    expect(request.headers.get("x-forwarded-proto")).toBeNull()
    expect(() => enforceHttps(request)).toThrow("BUMBLEBEE_INGEST_HTTPS_REQUIRED")
  })

  it("production + x-forwarded-proto: https WITHOUT BUMBLEBEE_TRUST_PROXY -> rejected (header alone is not authority)", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BUMBLEBEE_TRUST_PROXY", "false")
    const { enforceHttps } = await import("@/app/api/plugins/bumblebee/ingest/route")
    const request = prodRequest("http://ingest.example/api/plugins/bumblebee/ingest", {
      "x-forwarded-proto": "https",
    })
    expect(() => enforceHttps(request)).toThrow("BUMBLEBEE_INGEST_HTTPS_REQUIRED")
  })

  it("production + x-forwarded-proto: https WITH BUMBLEBEE_TRUST_PROXY=true -> accepted", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BUMBLEBEE_TRUST_PROXY", "true")
    const { enforceHttps } = await import("@/app/api/plugins/bumblebee/ingest/route")
    const request = prodRequest("http://ingest.example/api/plugins/bumblebee/ingest", {
      "x-forwarded-proto": "https",
    })
    expect(() => enforceHttps(request)).not.toThrow()
  })

  it("production + the request's own URL scheme is https -> accepted without any header or flag", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { enforceHttps } = await import("@/app/api/plugins/bumblebee/ingest/route")
    const request = prodRequest("https://ingest.example/api/plugins/bumblebee/ingest")
    expect(() => enforceHttps(request)).not.toThrow()
  })

  it("loopback + explicit BUMBLEBEE_ALLOW_LOOPBACK_INGEST=true -> accepted", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BUMBLEBEE_ALLOW_LOOPBACK_INGEST", "true")
    const { enforceHttps } = await import("@/app/api/plugins/bumblebee/ingest/route")
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const request = prodRequest(`http://${host}/api/plugins/bumblebee/ingest`)
      expect(() => enforceHttps(request)).not.toThrow()
    }
  })

  it("loopback WITHOUT the flag -> rejected (no implicit loopback bypass)", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { enforceHttps } = await import("@/app/api/plugins/bumblebee/ingest/route")
    const request = prodRequest("http://localhost/api/plugins/bumblebee/ingest")
    expect(() => enforceHttps(request)).toThrow("BUMBLEBEE_INGEST_HTTPS_REQUIRED")
  })

  it("the loopback flag alone does not bypass for a non-loopback host", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BUMBLEBEE_ALLOW_LOOPBACK_INGEST", "true")
    const { enforceHttps } = await import("@/app/api/plugins/bumblebee/ingest/route")
    const request = prodRequest("http://ingest.example/api/plugins/bumblebee/ingest")
    expect(() => enforceHttps(request)).toThrow("BUMBLEBEE_INGEST_HTTPS_REQUIRED")
  })
})

/**
 * Route-level (not just function-level): wires up the real POST handler
 * from route.ts, with only the DB/auth boundary mocked (same seam
 * `ingest-runtime.test.ts` mocks), plus the pipeline stubbed so we can
 * distinguish "rejected before the pipeline ran" from "reached the
 * pipeline". `BUMBLEBEE_INGEST_HTTPS_REQUIRED` is allowlisted in
 * `PUBLIC_ERRORS` (lease-routes.ts) to 426 Upgrade Required -- a policy
 * refusal, not a generic 503 -- so these tests assert the real status and
 * error code rather than "not 202".
 */
describe("POST /api/plugins/bumblebee/ingest (route wiring, HTTPS gate)", () => {
  const validCredential = {
    credential_id: "cred-1",
    lease_id: "lease-1",
    group_id: "allura-group-1",
    workspace_id: "workspace-1",
    source_id: "source-1",
    source_revision_id: "revision-1",
    profile: "baseline",
    mode: "inventory",
    ecosystems: ["npm"],
    token_hash: "digest",
    expires_at: null,
    revoked_at: null,
  }

  async function loadRouteWithMocks() {
    vi.resetModules()
    vi.doMock("@/lib/postgres/connection", () => ({
      getAppPool: vi.fn(() => ({ query: vi.fn(async () => ({ rows: [validCredential] })) })),
    }))
    vi.doMock("@/lib/db/tenant-transaction", () => ({
      withTenantTransaction: vi.fn(async (_ctx: unknown, callback: (client: unknown) => Promise<unknown>) =>
        callback({ query: vi.fn(async () => ({ rows: [] })) })),
    }))
    vi.doMock("@/lib/bumblebee/batch-store", () => ({
      createBatchStore: vi.fn(async () => ({
        findExistingBatch: vi.fn(async () => null),
        findConflictingBatch: vi.fn(async () => null),
        persistBatch: vi.fn(async () => undefined),
      })),
    }))
    vi.doMock("@/lib/bumblebee/lease-authority", async (importOriginal) => ({
      ...await importOriginal<typeof import("@/lib/bumblebee/lease-authority")>(),
      tokenPrefix: vi.fn(() => "bmb_ingest_prefix"),
      verifyBumblebeeToken: vi.fn(() => true),
    }))
    vi.doMock("@/lib/bumblebee/source-authority", async (importOriginal) => ({
      ...await importOriginal<typeof import("@/lib/bumblebee/source-authority")>(),
      authorizeBumblebeeRoute: vi.fn(),
    }))
    // Reached only if enforceHttps allows the request through -- proves the
    // "accepted" branch actually wires into the ingest pipeline, not just
    // that it fails to throw.
    vi.doMock("@/lib/bumblebee/ingest-pipeline", async (importOriginal) => ({
      ...await importOriginal<typeof import("@/lib/bumblebee/ingest-pipeline")>(),
      ingestScannerBatch: vi.fn(async () => Response.json({ reachedPipeline: true }, { status: 202 })),
    }))
    return import("@/app/api/plugins/bumblebee/ingest/route")
  }

  function authedRequest(url: string, headers: Record<string, string> = {}): Request {
    return new Request(url, {
      method: "POST",
      headers: { authorization: "Bearer bmb_ingest_prefix_secret", ...headers },
    })
  }

  it("rejects with the header absent in production before ever reaching the pipeline", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { POST } = await loadRouteWithMocks()
    const response = await POST(authedRequest("http://ingest.example/api/plugins/bumblebee/ingest"))
    expect(response.status).toBe(426)
    const body = await response.json() as { error: string }
    expect(body.error).toBe("BUMBLEBEE_INGEST_HTTPS_REQUIRED")
  })

  it("reaches the pipeline once BUMBLEBEE_TRUST_PROXY + x-forwarded-proto: https are both present", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BUMBLEBEE_TRUST_PROXY", "true")
    const { POST } = await loadRouteWithMocks()
    const response = await POST(authedRequest("http://ingest.example/api/plugins/bumblebee/ingest", {
      "x-forwarded-proto": "https",
    }))
    expect(response.status).toBe(202)
    const body = await response.json() as { reachedPipeline: boolean }
    expect(body.reachedPipeline).toBe(true)
  })
})
