if (typeof window !== "undefined") throw new Error("server-side only")

import { randomUUID } from "node:crypto"

import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { getAppPool } from "@/lib/postgres/connection"
import { createBatchStore } from "./batch-store"
import { type IngestLease, ingestScannerBatch, type PersistBatchInput } from "./ingest-pipeline"
import {
  type BoundRunnerAuthority,
  BUMBLEBEE_LEASE_ERROR,
  type BumblebeeTokenAudience,
  type PersistLeaseInput,
  tokenPrefix,
  verifyBumblebeeToken,
} from "./lease-authority"
import { authorizeBumblebeeRoute, BUMBLEBEE_AUTH_ERROR } from "./source-authority"

export interface BootstrapCredential {
  credential_id?: string
  lease_id?: string
  group_id: string
  workspace_id: string
  source_id?: string
  source_revision_id?: string
  profile?: "baseline" | "project" | "deep"
  mode?: "inventory" | "findings-only"
  ecosystems?: string[]
  token_hash: string
  expires_at: Date | string | null
  revoked_at: Date | string | null
}

function dateOrNull(value: Date | string | null): Date | null {
  return value === null ? null : value instanceof Date ? value : new Date(value)
}

function bearer(request: Request): string {
  const match = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")
  if (!match) throw new Error(BUMBLEBEE_LEASE_ERROR.invalidToken)
  return match[1]
}

async function bootstrap(raw: string, audience: BumblebeeTokenAudience): Promise<BootstrapCredential> {
  const prefix = tokenPrefix(raw, audience)
  const functionName = audience === "bumblebee_runner"
    ? "app.bumblebee_bootstrap_runner"
    : "app.bumblebee_bootstrap_ingest"
  const result = await getAppPool().query<BootstrapCredential>(`SELECT * FROM ${functionName}($1)`, [prefix])
  const record = result.rows[0]
  if (!record || !verifyBumblebeeToken(raw, record.token_hash)) throw new Error(BUMBLEBEE_LEASE_ERROR.invalidToken)
  authorizeBumblebeeRoute({
    audience,
    authMethod: "plugin_token",
    expiresAt: dateOrNull(record.expires_at),
    revokedAt: dateOrNull(record.revoked_at),
  }, audience === "bumblebee_runner" ? "runs" : "ingest")
  return record
}

export async function authenticateBumblebeeRequest(request: Request, audience: BumblebeeTokenAudience) {
  const rawToken = bearer(request)
  await bootstrap(rawToken, audience)
  return { rawToken }
}

export async function authenticateRunnerForSource(
  rawToken: string,
  sourceId: string,
  sourceRevisionId: string,
): Promise<BoundRunnerAuthority> {
  const credential = await bootstrap(rawToken, "bumblebee_runner")
  if (!credential.credential_id) throw new Error(BUMBLEBEE_AUTH_ERROR.credentialClass)
  return withTenantTransaction({
    tenantId: credential.group_id,
    workspaceId: credential.workspace_id,
    principalId: credential.credential_id,
  }, async (client) => {
    const result = await client.query<{
      source_id: string
      source_revision_id: string
    }>(`SELECT source_id, source_revision_id FROM bumblebee_sources
       WHERE source_id = $1 AND source_revision_id = $2
         AND runner_credential_id = $3 AND disabled_at IS NULL`,
    [sourceId, sourceRevisionId, credential.credential_id])
    const source = result.rows[0]
    if (!source) throw new Error(BUMBLEBEE_LEASE_ERROR.sourceRevisionMismatch)
    return {
      credentialId: credential.credential_id!,
      groupId: credential.group_id,
      workspaceId: credential.workspace_id,
      sourceId: source.source_id,
      sourceRevisionId: source.source_revision_id,
    }
  }, getAppPool())
}

export async function authenticateIngestLease(request: Request): Promise<{ lease: IngestLease }> {
  const credential = await bootstrap(bearer(request), "bumblebee_ingest")
  if (!nonEmpty(credential.lease_id) || !nonEmpty(credential.group_id) || !nonEmpty(credential.workspace_id) ||
    !nonEmpty(credential.source_id) || !nonEmpty(credential.source_revision_id)) {
    throw new Error(BUMBLEBEE_LEASE_ERROR.invalidToken)
  }
  if (!isIngestProfile(credential.profile) || !isIngestMode(credential.mode) ||
    !Array.isArray(credential.ecosystems) || credential.ecosystems.length === 0 ||
    credential.ecosystems.some((ecosystem) => !nonEmpty(ecosystem))) {
    throw new Error(BUMBLEBEE_AUTH_ERROR.credentialClass)
  }
  return {
    lease: {
      groupId: credential.group_id,
      workspaceId: credential.workspace_id,
      sourceId: credential.source_id,
      sourceRevisionId: credential.source_revision_id,
      leaseId: credential.lease_id,
      profile: credential.profile,
      mode: credential.mode,
      ecosystems: credential.ecosystems,
    },
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isIngestProfile(value: unknown): value is "baseline" | "project" | "deep" {
  return value === "baseline" || value === "project" || value === "deep"
}

function isIngestMode(value: unknown): value is "inventory" | "findings-only" {
  return value === "inventory" || value === "findings-only"
}

export type ScopedIngestStore = Awaited<ReturnType<typeof createBatchStore>>

export async function createScopedIngestStore(lease: IngestLease): Promise<ScopedIngestStore> {
  const withinLeaseScope = async <T>(operation: (store: ScopedIngestStore) => Promise<T>): Promise<T> =>
    withTenantTransaction({
      tenantId: lease.groupId,
      workspaceId: lease.workspaceId,
      principalId: `bumblebee-ingest:${lease.leaseId}`,
    }, async (client) => operation(await createBatchStore({ pool: client, transactional: false })), getAppPool())

  return {
    findExistingBatch: ({ bodySha256 }) => withinLeaseScope((store) =>
      store.findExistingBatch({ lease, bodySha256 })),
    findConflictingBatch: () => withinLeaseScope((store) => store.findConflictingBatch({ lease })),
    persistBatch: (input) => withinLeaseScope((store) =>
      store.persistBatch({ ...input, lease })),
  }
}

export function createProductionIngest(deps: {
  authenticateLease: (request: Request) => Promise<{ lease: IngestLease }>
  createScopedStore: (lease: IngestLease) => Promise<ScopedIngestStore>
  pipeline?: typeof ingestScannerBatch
  prePipeline?: (request: Request) => void
}) {
  const pipeline = deps.pipeline ?? ingestScannerBatch
  return async (request: Request) => {
    if (deps.prePipeline) deps.prePipeline(request)
    return pipeline(request, {
      authenticate: async (candidate) => deps.authenticateLease(candidate),
      findExistingBatch: async ({ lease, bodySha256 }) =>
        (await deps.createScopedStore(lease)).findExistingBatch({ lease, bodySha256 }),
      findConflictingBatch: async ({ lease }) =>
        (await deps.createScopedStore(lease)).findConflictingBatch({ lease }),
      persistBatch: async (input: PersistBatchInput) =>
        (await deps.createScopedStore(input.lease)).persistBatch(input),
    })
  }
}

export async function persistScanLease(input: PersistLeaseInput): Promise<{ leaseId: string; generation: number }> {
  const leaseId = randomUUID()
  return withTenantTransaction({
    tenantId: input.groupId,
    workspaceId: input.workspaceId,
    principalId: input.credentialId,
  }, async (client) => {
    const result = await client.query<{ generation: string }>(
      `SELECT app.issue_bumblebee_scan_lease($1,$2,$3,$4,$5,$6,$7) AS generation`,
      [input.sourceId, input.sourceRevisionId, input.credentialId, leaseId,
        input.ingestTokenPrefix, input.ingestTokenHash, input.expiresAt],
    )
    return { leaseId, generation: Number(result.rows[0].generation) }
  }, getAppPool())
}
