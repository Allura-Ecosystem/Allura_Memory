if (typeof window !== "undefined") throw new Error("server-side only")

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const PREFIX_BODY_CHARS = 8
const TOKEN_BYTES = 32
const MAX_LEASE_SECONDS = 300

export const BUMBLEBEE_LEASE_ERROR = Object.freeze({
  invalidDuration: "BUMBLEBEE_LEASE_INVALID_DURATION",
  sourceRevisionMismatch: "BUMBLEBEE_LEASE_SOURCE_REVISION_MISMATCH",
  invalidToken: "BUMBLEBEE_AUTH_INVALID",
  wrongAudience: "BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN",
} as const)

export type BumblebeeTokenAudience = "bumblebee_runner" | "bumblebee_ingest"

export interface BoundRunnerAuthority {
  credentialId: string
  groupId: string
  workspaceId: string
  sourceId: string
  sourceRevisionId: string
}

export interface PersistLeaseInput extends BoundRunnerAuthority {
  expiresAt: Date
  ingestTokenPrefix: string
  ingestTokenHash: string
}

export interface LeaseAuthorityDependencies {
  authenticateRunner(rawToken: string, sourceRevisionId: string): Promise<BoundRunnerAuthority>
  persistLease(input: PersistLeaseInput): Promise<{ leaseId: string; generation: number }>
  now?(): Date
}

export interface IssueScanLeaseInput {
  runnerToken: string
  sourceRevisionId: string
  durationSeconds: number
}

function secret(): string {
  const value = process.env.BUMBLEBEE_TOKEN_SECRET
  if (!value || value.length < 16) throw new Error("BUMBLEBEE_TOKEN_SECRET must be set (>=16 chars)")
  return value
}

export function tokenPrefix(raw: string, audience: BumblebeeTokenAudience): string {
  const namespace = `bmb_${audience === "bumblebee_runner" ? "runner" : "ingest"}_`
  const oppositeNamespace = audience === "bumblebee_runner" ? "bmb_ingest_" : "bmb_runner_"
  if (raw.startsWith(oppositeNamespace)) throw new Error(BUMBLEBEE_LEASE_ERROR.wrongAudience)
  if (!raw.startsWith(namespace)) throw new Error(BUMBLEBEE_LEASE_ERROR.invalidToken)
  return `${namespace}${raw.slice(namespace.length, namespace.length + PREFIX_BODY_CHARS)}`
}

export function hashBumblebeeToken(raw: string): string {
  return createHmac("sha256", secret()).update(raw).digest("hex")
}

export function verifyBumblebeeToken(raw: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashBumblebeeToken(raw), "hex")
  const stored = Buffer.from(storedHash, "hex")
  if (candidate.length !== stored.length) {
    timingSafeEqual(candidate, candidate)
    return false
  }
  return timingSafeEqual(candidate, stored)
}

function mintIngestToken(): { raw: string; prefix: string; hash: string } {
  const body = randomBytes(TOKEN_BYTES).toString("base64url")
  const raw = `bmb_ingest_${body}`
  return { raw, prefix: tokenPrefix(raw, "bumblebee_ingest"), hash: hashBumblebeeToken(raw) }
}

export async function issueScanLease(input: IssueScanLeaseInput, deps: LeaseAuthorityDependencies) {
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > MAX_LEASE_SECONDS) {
    throw new Error(BUMBLEBEE_LEASE_ERROR.invalidDuration)
  }
  const authority = await deps.authenticateRunner(input.runnerToken, input.sourceRevisionId)
  if (authority.sourceRevisionId !== input.sourceRevisionId) {
    throw new Error(BUMBLEBEE_LEASE_ERROR.sourceRevisionMismatch)
  }
  const now = deps.now?.() ?? new Date()
  const expiresAt = new Date(now.getTime() + input.durationSeconds * 1000)
  const token = mintIngestToken()
  const persisted = await deps.persistLease({
    ...authority,
    expiresAt,
    ingestTokenPrefix: token.prefix,
    ingestTokenHash: token.hash,
  })
  return Object.freeze({
    leaseId: persisted.leaseId,
    generation: persisted.generation,
    expiresAt,
    ingestToken: token.raw,
    groupId: authority.groupId,
    workspaceId: authority.workspaceId,
    sourceId: authority.sourceId,
    sourceRevisionId: authority.sourceRevisionId,
  })
}
