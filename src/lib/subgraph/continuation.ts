import "server-only"

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"
import {
  type EffectiveSubgraphBudgets,
  FOCUSED_SUBGRAPH_CONTRACT_VERSION,
  type NormalizedSubgraphQuery,
  type SubgraphContinuationClaims,
  SubgraphContinuationClaimsSchema,
} from "./contract"

const TOKEN_VERSION = "g1"
const TOKEN_AAD = Buffer.from(`allura:focused-subgraph:continuation:${FOCUSED_SUBGRAPH_CONTRACT_VERSION}`, "utf8")
const TOKEN_TTL_MS = 15 * 60 * 1000

export class SubgraphContinuationError extends Error {
  constructor(readonly reason: "malformed" | "expired" | "authority" | "conflict", message: string) {
    super(message)
    this.name = "SubgraphContinuationError"
  }
}

export function hashSubgraphBinding(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function subgraphContinuationKey(masterSecret: Buffer, keyVersion: number): Buffer {
  if (!Buffer.isBuffer(masterSecret) || masterSecret.length < 32) {
    throw new Error("Focused subgraph continuation secret must contain at least 32 bytes")
  }
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new Error("Focused subgraph key version is invalid")
  return Buffer.from(hkdfSync("sha256", masterSecret, Buffer.from(`key:${keyVersion}`), TOKEN_AAD, 32))
}

export function createSubgraphContinuation(
  claims: SubgraphContinuationClaims,
  masterSecret: Buffer,
): string {
  const parsed = SubgraphContinuationClaimsSchema.parse(claims)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", subgraphContinuationKey(masterSecret, parsed.keyVersion), iv)
  cipher.setAAD(TOKEN_AAD)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsed), "utf8"), cipher.final()])
  return [TOKEN_VERSION, String(parsed.keyVersion), iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".")
}

export function decodeSubgraphContinuation(
  token: string,
  masterSecret: Buffer,
  options: { now?: Date; acceptedKeyVersions?: readonly number[] } = {},
): SubgraphContinuationClaims {
  try {
    const [version, rawKeyVersion, rawIv, rawCiphertext, rawTag, ...extra] = token.split(".")
    const keyVersion = Number(rawKeyVersion)
    if (version !== TOKEN_VERSION || extra.length > 0 || !rawIv || !rawCiphertext || !rawTag || !Number.isSafeInteger(keyVersion) || keyVersion < 1) {
      throw new Error("shape")
    }
    if (options.acceptedKeyVersions && !options.acceptedKeyVersions.includes(keyVersion)) throw new Error("key")
    const iv = Buffer.from(rawIv, "base64url")
    const ciphertext = Buffer.from(rawCiphertext, "base64url")
    const tag = Buffer.from(rawTag, "base64url")
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error("encoding")
    const decipher = createDecipheriv("aes-256-gcm", subgraphContinuationKey(masterSecret, keyVersion), iv)
    decipher.setAAD(TOKEN_AAD)
    decipher.setAuthTag(tag)
    const claims = SubgraphContinuationClaimsSchema.parse(JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")))
    if (claims.keyVersion !== keyVersion) throw new Error("key binding")
    if (Date.parse(claims.expiresAt) <= (options.now ?? new Date()).getTime()) {
      throw new SubgraphContinuationError("expired", "Focused subgraph continuation expired")
    }
    return claims
  } catch (error) {
    if (error instanceof SubgraphContinuationError) throw error
    throw new SubgraphContinuationError("malformed", "Focused subgraph continuation is invalid")
  }
}

function equalDigest(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex")
  const rightBytes = Buffer.from(right, "hex")
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

export function assertSubgraphContinuationBindings(
  claims: SubgraphContinuationClaims,
  expected: {
    tenantId: string
    workspaceId: string
    principalId: string
    sessionHash: string
    role: SubgraphContinuationClaims["role"]
    policyEpoch: number
    routePolicyVersion: string
    normalizedQueryHash: string
    effectiveBudgets: EffectiveSubgraphBudgets
    graphRevision: number
  },
): void {
  if (claims.tenantId !== expected.tenantId || claims.workspaceId !== expected.workspaceId ||
      claims.principalId !== expected.principalId || claims.role !== expected.role ||
      !equalDigest(claims.sessionHash, expected.sessionHash)) {
    throw new SubgraphContinuationError("authority", "Focused subgraph continuation authority changed")
  }
  const budgetsMatch = (Object.keys(expected.effectiveBudgets) as Array<keyof EffectiveSubgraphBudgets>)
    .every((key) => claims.effectiveBudgets[key] === expected.effectiveBudgets[key])
  if (claims.policyEpoch !== expected.policyEpoch || claims.routePolicyVersion !== expected.routePolicyVersion ||
      !equalDigest(claims.normalizedQueryHash, expected.normalizedQueryHash) || !budgetsMatch) {
    throw new SubgraphContinuationError("conflict", "Focused subgraph continuation policy or query changed")
  }
  if (claims.graphRevision !== expected.graphRevision) {
    throw new SubgraphContinuationError("conflict", "Focused subgraph snapshot changed")
  }
}

export function continuationTimes(now = new Date()): { issuedAt: string; expiresAt: string } {
  return { issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString() }
}

export function queryWithoutContinuation(query: NormalizedSubgraphQuery): NormalizedSubgraphQuery {
  return { ...query, continuation: null }
}
