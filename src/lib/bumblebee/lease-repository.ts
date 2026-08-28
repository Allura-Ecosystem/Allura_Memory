if (typeof window !== "undefined") throw new Error("server-side only")

import { randomUUID } from "node:crypto"

import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { getAppPool } from "@/lib/postgres/connection"
import {
  type BoundRunnerAuthority,
  BUMBLEBEE_LEASE_ERROR,
  type BumblebeeTokenAudience,
  type PersistLeaseInput,
  tokenPrefix,
  verifyBumblebeeToken,
} from "./lease-authority"
import { authorizeBumblebeeRoute, BUMBLEBEE_AUTH_ERROR } from "./source-authority"

interface BootstrapCredential {
  credential_id?: string
  lease_id?: string
  group_id: string
  workspace_id: string
  source_id?: string
  source_revision_id?: string
  token_hash: string
  expires_at: Date | string | null
  revoked_at: Date | string | null
}

export interface BoundIngestAuthority {
  groupId: string
  workspaceId: string
  sourceId: string
  sourceRevisionId: string
  leaseId: string
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
  const bound = await bootstrap(rawToken, audience)
  if (audience === "bumblebee_ingest") {
    if (!bound.lease_id || !bound.source_id || !bound.source_revision_id) {
      throw new Error(BUMBLEBEE_AUTH_ERROR.credentialClass)
    }
    return {
      groupId: bound.group_id,
      workspaceId: bound.workspace_id,
      sourceId: bound.source_id,
      sourceRevisionId: bound.source_revision_id,
      leaseId: bound.lease_id,
    } satisfies BoundIngestAuthority
  }
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
