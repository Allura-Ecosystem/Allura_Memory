import { describe, expect, it, vi } from "vitest"
import { readFile } from "node:fs/promises"

const state = vi.hoisted(() => ({
  credential: {} as Record<string, unknown>,
  client: { query: vi.fn(async () => ({ rows: [] })) },
  transaction: vi.fn(),
  appPool: {
    query: vi.fn<(text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>(async () => ({ rows: [] })),
  },
  batchStore: {
    findExistingBatch: vi.fn(async () => null),
    findConflictingBatch: vi.fn(async () => null),
    persistBatch: vi.fn(async () => undefined),
  },
}))

vi.mock("@/lib/postgres/connection", () => ({
  getAppPool: vi.fn(() => state.appPool),
}))
vi.mock("@/lib/db/tenant-transaction", () => ({
  withTenantTransaction: state.transaction,
}))
vi.mock("../batch-store", () => ({
  createBatchStore: vi.fn(async () => state.batchStore),
}))
vi.mock("../lease-authority", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lease-authority")>(),
  tokenPrefix: vi.fn(() => "bmb_ingest_prefix"),
  verifyBumblebeeToken: vi.fn(() => true),
}))
vi.mock("../source-authority", async (importOriginal) => ({
  ...await importOriginal<typeof import("../source-authority")>(),
  authorizeBumblebeeRoute: vi.fn(),
}))

import type { IngestLease } from "../ingest-pipeline"
import { BUMBLEBEE_LEASE_ERROR } from "../lease-authority"
import {
  authenticateIngestLease,
  createProductionIngest,
  createScopedIngestStore,
} from "../lease-repository"
import { BUMBLEBEE_AUTH_ERROR } from "../source-authority"

const LEASE: IngestLease = {
  groupId: "allura-group-1",
  workspaceId: "workspace-1",
  sourceId: "source-1",
  sourceRevisionId: "revision-1",
  leaseId: "lease-1",
  profile: "deep",
  mode: "findings-only",
  ecosystems: ["npm", "python"],
}

function credential(overrides: Record<string, unknown> = {}) {
  state.credential = {
    group_id: LEASE.groupId,
    workspace_id: LEASE.workspaceId,
    lease_id: LEASE.leaseId,
    source_id: LEASE.sourceId,
    source_revision_id: LEASE.sourceRevisionId,
    profile: LEASE.profile,
    mode: LEASE.mode,
    ecosystems: LEASE.ecosystems,
    token_hash: "digest",
    expires_at: null,
    revoked_at: null,
    ...overrides,
  }
  state.appPool.query.mockResolvedValue({ rows: [state.credential] })
}

function request() {
  return new Request("http://localhost/api/plugins/bumblebee/ingest", {
    headers: { authorization: "Bearer bmb_ingest_prefix_secret" },
  })
}

describe("Bumblebee production ingest runtime", () => {
  it("rejects ingest bootstrap rows missing required lease contract fields", async () => {
    credential({ profile: undefined })
    await expect(authenticateIngestLease(request())).rejects.toThrow(BUMBLEBEE_AUTH_ERROR.credentialClass)

    credential({ lease_id: undefined })
    await expect(authenticateIngestLease(request())).rejects.toThrow(BUMBLEBEE_LEASE_ERROR.invalidToken)
  })

  it("returns the source-bound profile, mode, and ecosystems from a valid ingest credential", async () => {
    credential()
    await expect(authenticateIngestLease(request())).resolves.toEqual({ lease: LEASE })
  })

  it("runs every batch-store operation in the authenticated lease tenant scope", async () => {
    state.appPool.query.mockClear()
    state.transaction.mockClear()
    state.transaction.mockImplementation(async (_context: unknown, callback: (client: typeof state.client) => Promise<unknown>) => callback(state.client))
    const store = await createScopedIngestStore(LEASE)
    await store.findExistingBatch({ lease: LEASE, bodySha256: "body" })
    await store.findConflictingBatch({ lease: LEASE })
    await store.persistBatch({
      lease: LEASE, batchId: "batch", bodySha256: "body", byteCount: 1, lineCount: 1,
      recordCount: 1, records: [], summaryRecordId: "summary",
    })

    expect(state.transaction).toHaveBeenCalledTimes(3)
    for (const [context, _callback, pool] of state.transaction.mock.calls) {
      expect(context).toEqual({
        tenantId: LEASE.groupId,
        workspaceId: LEASE.workspaceId,
        principalId: `bumblebee-ingest:${LEASE.leaseId}`,
      })
      expect(pool).toBe(state.appPool)
    }
    expect(state.appPool.query).not.toHaveBeenCalled()
  })

  it("passes the authenticated lease contract into the production ingest pipeline seam", async () => {
    const authenticateLease = vi.fn(async () => ({ lease: LEASE }))
    const createScopedStore = vi.fn(async () => state.batchStore)
    const pipeline = vi.fn(async (_request: Request, deps: {
      authenticate(request: Request, audience: "bumblebee_ingest"): Promise<{ lease: IngestLease }>
    }) => {
      const result = await deps.authenticate(request(), "bumblebee_ingest")
      expect(result.lease).toEqual(LEASE)
      return new Response(null, { status: 201 })
    })

    const response = await createProductionIngest({ authenticateLease, createScopedStore, pipeline })(request())
    expect(response.status).toBe(201)
    expect(authenticateLease).toHaveBeenCalled()
  })

  it("ships migration 49 with a source-bound secure bootstrap contract", async () => {
    const migration = await readFile("docker/postgres-init/49-bumblebee-ingest-bootstrap-contract.sql", "utf8")
    expect(migration).toMatch(/DROP FUNCTION IF EXISTS app\.bumblebee_bootstrap_ingest\(TEXT\)[\s\S]*CREATE OR REPLACE FUNCTION app\.bumblebee_bootstrap_ingest/)
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION app\.bumblebee_bootstrap_ingest\(p_prefix TEXT\)/)
    expect(migration).toMatch(/JOIN public\.bumblebee_sources AS s/)
    expect(migration).toMatch(/l\.group_id = s\.group_id[\s\S]*l\.workspace_id = s\.workspace_id[\s\S]*l\.source_id = s\.source_id[\s\S]*l\.source_revision_id = s\.source_revision_id/)
    expect(migration).toMatch(/s\.profile[\s\S]*s\.mode[\s\S]*s\.ecosystems/)
    expect(migration).toMatch(/AND s\.disabled_at IS NULL/)
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = pg_catalog/)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC[\s\S]*GRANT EXECUTE ON FUNCTION[\s\S]*TO allura_app/)
    expect(migration).toMatch(/schema_versions[\s\S]*049/)
  })
})
