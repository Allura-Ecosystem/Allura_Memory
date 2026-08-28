if (typeof window !== "undefined") throw new Error("server-side only")

import { createHash } from "node:crypto"

import { assertSupportedScanContract, BUMBLEBEE_UPSTREAM_PIN } from "./upstream-contract"

export const BUMBLEBEE_AUTH_ERROR = Object.freeze({
  credentialClass: "BUMBLEBEE_AUTH_CREDENTIAL_CLASS_FORBIDDEN",
  audience: "BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN",
  revoked: "BUMBLEBEE_AUTH_REVOKED",
  expired: "BUMBLEBEE_AUTH_EXPIRED",
} as const)

export const BUMBLEBEE_SOURCE_ERROR = Object.freeze({
  catalogRequired: "BUMBLEBEE_SOURCE_CATALOG_REQUIRED",
  invalidDigest: "BUMBLEBEE_SOURCE_INVALID_DIGEST",
  invalidScope: "BUMBLEBEE_SOURCE_INVALID_SCOPE",
  scannerPin: "BUMBLEBEE_SOURCE_SCANNER_PIN_MISMATCH",
  invalidRetention: "BUMBLEBEE_SOURCE_INVALID_RETENTION",
} as const)

export type BumblebeeAudience = "bumblebee_runner" | "bumblebee_ingest"
export type BumblebeeRouteClass = "runs" | "ingest" | "mcp" | "browser"

export interface BumblebeePluginCredential {
  readonly audience: BumblebeeAudience
  readonly authMethod: "plugin_token" | "shared_token" | "dev_local"
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
}

const ROUTE_AUDIENCE: Readonly<Partial<Record<BumblebeeRouteClass, BumblebeeAudience>>> = Object.freeze({
  runs: "bumblebee_runner",
  ingest: "bumblebee_ingest",
})

export function authorizeBumblebeeRoute(
  credential: BumblebeePluginCredential,
  route: BumblebeeRouteClass,
  now = new Date(),
): BumblebeeAudience {
  if (credential.authMethod !== "plugin_token") throw new Error(BUMBLEBEE_AUTH_ERROR.credentialClass)
  if (credential.revokedAt !== null) throw new Error(BUMBLEBEE_AUTH_ERROR.revoked)
  const expiry = credential.expiresAt?.getTime() ?? null
  if (credential.audience === "bumblebee_ingest" &&
      (expiry === null || !Number.isFinite(expiry) || expiry <= now.getTime())) {
    throw new Error(BUMBLEBEE_AUTH_ERROR.expired)
  }
  if (expiry !== null && (!Number.isFinite(expiry) || expiry <= now.getTime())) {
    throw new Error(BUMBLEBEE_AUTH_ERROR.expired)
  }
  if (ROUTE_AUDIENCE[route] !== credential.audience) throw new Error(BUMBLEBEE_AUTH_ERROR.audience)
  return credential.audience
}

export interface BumblebeeSourceRevisionInput {
  readonly groupId: string
  readonly workspaceId: string
  readonly sourceId: string
  readonly endpointDeviceId: string
  readonly runnerCredentialId: string
  readonly runnerAudience: "bumblebee_runner"
  readonly scanner: {
    readonly tag: string
    readonly commit: string
    readonly tree: string
    readonly artifactSha256: string
    readonly schemaVersion: string
  }
  readonly profile: "baseline" | "project" | "deep"
  readonly mode: "inventory" | "findings-only"
  readonly findingsEnabled: boolean
  readonly rootConfigDigest: string
  readonly ecosystems: readonly string[]
  readonly allUsers: boolean
  readonly freshnessTtlSeconds: number
  readonly retentionDays: number
  readonly classification: "internal" | "confidential" | "restricted"
  readonly redactionPolicy: string
  readonly catalogRevisionId: string | null
  readonly catalogDigest: string | null
}

export type BumblebeeSourceRevision = Readonly<BumblebeeSourceRevisionInput & {
  readonly scanner: Readonly<BumblebeeSourceRevisionInput["scanner"]>
  readonly ecosystems: readonly string[]
  readonly revisionDigest: string
}>

const GROUP_ID = /^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
const SHA256 = /^[a-f0-9]{64}$/

function requireNonEmpty(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(BUMBLEBEE_SOURCE_ERROR.invalidScope)
  return normalized
}

function canonicalRevision(input: BumblebeeSourceRevisionInput): string {
  return JSON.stringify([
    input.groupId,
    input.workspaceId,
    input.sourceId,
    input.endpointDeviceId,
    input.runnerCredentialId,
    input.runnerAudience,
    input.scanner.tag,
    input.scanner.commit,
    input.scanner.tree,
    input.scanner.artifactSha256,
    input.scanner.schemaVersion,
    input.profile,
    input.mode,
    input.findingsEnabled,
    input.rootConfigDigest,
    [...input.ecosystems],
    input.allUsers,
    input.freshnessTtlSeconds,
    input.retentionDays,
    input.classification,
    input.redactionPolicy,
    input.catalogRevisionId,
    input.catalogDigest,
  ])
}

export function createSourceRevision(input: BumblebeeSourceRevisionInput): BumblebeeSourceRevision {
  if (!GROUP_ID.test(input.groupId)) throw new Error(BUMBLEBEE_SOURCE_ERROR.invalidScope)
  for (const value of [input.workspaceId, input.sourceId, input.endpointDeviceId, input.runnerCredentialId, input.redactionPolicy]) {
    requireNonEmpty(value)
  }
  if (input.runnerAudience !== "bumblebee_runner") throw new Error(BUMBLEBEE_AUTH_ERROR.audience)
  if (
    input.scanner.tag !== BUMBLEBEE_UPSTREAM_PIN.tag ||
    input.scanner.commit !== BUMBLEBEE_UPSTREAM_PIN.commit ||
    input.scanner.tree !== BUMBLEBEE_UPSTREAM_PIN.tree
  ) throw new Error(BUMBLEBEE_SOURCE_ERROR.scannerPin)
  if (!SHA256.test(input.scanner.artifactSha256) || !SHA256.test(input.rootConfigDigest)) {
    throw new Error(BUMBLEBEE_SOURCE_ERROR.invalidDigest)
  }
  const findingsEnabled = input.findingsEnabled || input.mode === "findings-only"
  if (findingsEnabled && (!input.catalogRevisionId || !input.catalogDigest)) {
    throw new Error(BUMBLEBEE_SOURCE_ERROR.catalogRequired)
  }
  if (input.catalogDigest !== null && !SHA256.test(input.catalogDigest)) {
    throw new Error(BUMBLEBEE_SOURCE_ERROR.invalidDigest)
  }
  if (!Number.isInteger(input.freshnessTtlSeconds) || input.freshnessTtlSeconds <= 0 ||
      !Number.isInteger(input.retentionDays) || input.retentionDays <= 0) {
    throw new Error(BUMBLEBEE_SOURCE_ERROR.invalidRetention)
  }

  const contract = assertSupportedScanContract({
    schemaVersion: input.scanner.schemaVersion,
    profile: input.profile,
    mode: input.mode,
    findingsEnabled: input.findingsEnabled,
    ecosystems: input.ecosystems,
  })
  const scanner = Object.freeze({ ...input.scanner })
  const normalized = {
    ...input,
    scanner,
    ecosystems: Object.freeze([...contract.ecosystems]) as readonly string[],
  }
  const revisionDigest = createHash("sha256").update(canonicalRevision(normalized)).digest("hex")
  return Object.freeze({ ...normalized, revisionDigest })
}
