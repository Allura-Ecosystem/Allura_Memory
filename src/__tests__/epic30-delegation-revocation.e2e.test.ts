import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { extractBearer, validateToken } from "@/lib/guard/validate-token"
import { createToken, revokeToken } from "@/lib/mcp-token/repository"
import { closePool, getPool } from "@/lib/postgres/connection"
import { provisionSyntheticDatabase } from "../../scripts/epic30/synthetic-database"

/**
 * Story 30.5 — delegation revocation on reused credential-validation pooled connections.
 *
 * The 2026-09-25 timed workspace-revocation evidence proved pooled membership
 * revocation and explicitly listed delegation revocation authority and timing
 * as not proved. This file closes that gap on the real validation path:
 *
 *  - the delegation credential is a real `mcp_tokens` row minted through the
 *    production `createToken` repository (HMAC hash, unique prefix);
 *  - every lookup goes through the production `validateToken` path
 *    (`findByPrefix` → hash verify → revoked/expiry checks) on the production
 *    `getPool()` singleton, rebound to the per-run disposable synthetic
 *    database, mirroring the gateway's privileged credential-lookup role;
 *  - revocation is the production `revokeToken` command;
 *  - pooled reuse is proven by PostgreSQL backend-PID equality: the runner
 *    pins POSTGRES_POOL_MAX=1 before module load, so the singleton validation
 *    pool owns exactly one connection, and the same backend PID must serve
 *    the mint, the pre-revocation allow, the revocation and the denial.
 *
 * Scope receipt (accuracy over reach): the delegation-credential validation
 * path is NOT bound to the restricted workspace transaction — the gateway
 * resolves principals per request through the credential-lookup pool before
 * any tool runs, and `mcp_tokens` RLS applies to `allura_app`, not to the
 * privileged lookup role. This proves revocation denial on a reused
 * credential-validation pooled connection, not inside a restricted workspace
 * transaction. Non-device credentials only: paired-device token revocation
 * (`revokeDeviceTokensForMembershipChange`) has its own live lane.
 */

const GROUP = "allura-epic30-local"
const WORKSPACE = "epic30-local-workspace"
const ORDINARY_READ_BOUND_MS = 60_000

const ENV_KEYS = [
  "POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DB",
  "POSTGRES_USER", "POSTGRES_PASSWORD",
  "POSTGRES_APP_USER", "POSTGRES_APP_PASSWORD",
] as const

function patchConnectionEnv(database: Awaited<ReturnType<typeof provisionSyntheticDatabase>>): () => void {
  const saved: Record<string, string | undefined> = {}
  const values: Record<string, string> = {
    POSTGRES_HOST: "127.0.0.1",
    POSTGRES_PORT: "5444",
    POSTGRES_DB: database.databaseName,
    // Mirror the gateway's credential-lookup role: the cluster owner injected
    // by the approved runner environment, never a discovered credential.
    POSTGRES_USER: process.env.POSTGRES_USER ?? "",
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? "",
    POSTGRES_APP_USER: database.appEnvironment.POSTGRES_APP_USER,
    POSTGRES_APP_PASSWORD: database.appEnvironment.POSTGRES_APP_PASSWORD,
  }
  for (const key of ENV_KEYS) { saved[key] = process.env[key]; process.env[key] = values[key] }
  return () => {
    for (const key of ENV_KEYS) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe("Epic 30 delegation revocation on reused credential-validation pooled connections", () => {
  let database: Awaited<ReturnType<typeof provisionSyntheticDatabase>>

  beforeAll(async () => {
    if (!process.env.POSTGRES_USER || !process.env.POSTGRES_PASSWORD) {
      throw new Error("Epic30 delegation revocation requires the approved runner-injected owner credentials")
    }
    if (!process.env.ALLURA_MCP_TOKEN_SECRET) {
      throw new Error("Epic30 delegation revocation requires a test-only ALLURA_MCP_TOKEN_SECRET")
    }
    // The reused-pooled-connection claim below is only structurally guaranteed
    // when the validation pool owns exactly one connection. Assert the runner
    // actually pinned it instead of relying on incidental sequential
    // scheduling under the default pool size.
    if (process.env.POSTGRES_POOL_MAX !== "1") {
      throw new Error("Epic30 delegation revocation requires POSTGRES_POOL_MAX=1 for the reused-connection proof")
    }
    // Clear any stale singleton from earlier live files before rebinding.
    await closePool()
    database = await provisionSyntheticDatabase()
  }, 90_000)

  afterAll(async () => { if (database) await database.close(true) }, 30_000)

  async function singletonBackendPid(): Promise<number> {
    const result = await getPool().query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    return Number(result.rows[0]?.pid)
  }

  it("denies a revoked delegation credential on the same reused pooled connection", async () => {
    const restore = patchConnectionEnv(database)
    try {
      await closePool()
      const created = await createToken({
        group_id: GROUP,
        workspace_id: WORKSPACE,
        agent_name: "epic30-delegation-proof",
        scopes: ["memory:read"],
      })
      expect(created.record.revoked_at).toBeNull()

      // Pre-revocation: the real validation path allows the credential.
      const pidBefore = await singletonBackendPid()
      const allowed = await validateToken(extractBearer(`Bearer ${created.raw}`))
      expect(allowed).toMatchObject({ ok: true })

      // Authoritative revocation through the production command.
      const startedAt = performance.now()
      expect(await revokeToken(created.record.id, GROUP)).toBe(true)

      // Reused pooled connection: same backend PID, immediate denial.
      const denied = await validateToken(extractBearer(`Bearer ${created.raw}`))
      const elapsedMs = performance.now() - startedAt
      const pidAfter = await singletonBackendPid()
      expect(denied).toEqual({ ok: false, reason: "revoked" })
      expect(pidAfter).toBe(pidBefore)
      expect(elapsedMs).toBeLessThanOrEqual(ORDINARY_READ_BOUND_MS)

      console.info("Epic30 measured delegation revocation (reused)", JSON.stringify({
        reusedBackendPid: pidAfter, reusedElapsedMs: elapsedMs,
        ordinaryReadBoundMs: ORDINARY_READ_BOUND_MS,
      }))
    } finally {
      await closePool()
      restore()
    }
  }, 30_000)

  it("denies the revoked delegation credential on a fresh pooled connection", async () => {
    const restore = patchConnectionEnv(database)
    try {
      await closePool()
      const created = await createToken({
        group_id: GROUP,
        workspace_id: WORKSPACE,
        agent_name: "epic30-delegation-proof-fresh",
        scopes: ["memory:read"],
      })
      expect(await revokeToken(created.record.id, GROUP)).toBe(true)
      const stalePid = await singletonBackendPid()

      // Force a genuinely new validation-pool connection after revocation.
      const startedAt = performance.now()
      await closePool()
      const denied = await validateToken(extractBearer(`Bearer ${created.raw}`))
      const elapsedMs = performance.now() - startedAt
      const freshPid = await singletonBackendPid()
      expect(denied).toEqual({ ok: false, reason: "revoked" })
      expect(freshPid).not.toBe(stalePid)
      expect(elapsedMs).toBeLessThanOrEqual(ORDINARY_READ_BOUND_MS)

      console.info("Epic30 measured delegation revocation (fresh)", JSON.stringify({
        staleBackendPid: stalePid, freshBackendPid: freshPid, freshElapsedMs: elapsedMs,
        ordinaryReadBoundMs: ORDINARY_READ_BOUND_MS,
      }))
    } finally {
      await closePool()
      restore()
    }
  }, 30_000)
})