import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"

import type { AuthUser } from "@/lib/auth/types"
import type { AuthorizedDocument, DigitalBrainReadScope } from "./read-service"

/** A required, content-free decision record. It is not evidence of delivery. */
export interface AuthorizedReadReceipt {
  receiptId: string
  action: "read_documents" | "search_documents"
  decision: "allow_candidate"
  reasonCode: "authorized"
  policyVersion: "epic30-local-v2" | "epic30-production-v1"
  tenantId: string
  workspaceId: string
  principalId: string
  actorRole: AuthUser["role"]
  sessionHash: string
  policyEpoch: number
  witnessHash: string
  queryHash: string | null
  occurredAt: string
}

export interface ReadReceiptInput {
  scope: DigitalBrainReadScope
  sessionId: string
  actorRole: AuthUser["role"]
  policyEpoch: number
  documents: readonly AuthorizedDocument[]
  /** Normalized synthetic search query; stored only as a keyed digest. */
  searchQuery?: string
  /** Explicit policy namespace; production callers must not emit local evidence. */
  policyVersion?: AuthorizedReadReceipt["policyVersion"]
  /** Per-run secret; never stored in the receipt table or sent to the browser. */
  witnessKey: Buffer
  /** Authenticated witness from the preceding page; content-free receipt chain. */
  priorWitnessHash?: string
  receiptId?: string
  occurredAt?: Date
}

export interface ReadReceiptWriter {
  persist(receipt: AuthorizedReadReceipt): Promise<{ receiptId: string; witnessHash: string }>
}

export type AuthorizedReadOperation = "read_documents" | "search_documents"

export interface AuthorizedReadCursorBoundary {
  updatedAt: string
  id: string
}

/**
 * Internal claims carried by a page cursor. The cursor is encrypted before it
 * leaves this module so the boundary ID and authority tuple are never
 * serialized in the browser-visible token.
 */
export interface AuthorizedReadCursorClaims {
  version: 1
  operation: AuthorizedReadOperation
  tenantId: string
  workspaceId: string
  principalId: string
  sessionHash: string
  actorRole: AuthUser["role"]
  policyEpoch: number
  pageSize: number
  boundary: AuthorizedReadCursorBoundary
  witnessHash: string
  queryHash: string | null
  issuedAt: string
}

export interface AuthorizedReadCursorInput {
  scope: DigitalBrainReadScope
  sessionId: string
  actorRole: AuthUser["role"]
  policyEpoch: number
  operation: AuthorizedReadOperation
  pageSize: number
  boundary: AuthorizedReadCursorBoundary
  witnessHash: string
  witnessKey: Buffer
  queryHash?: string | null
  issuedAt?: Date
}

export const AUTHORIZED_READ_CURSOR_MAX_LENGTH = 4096
export const AUTHORIZED_READ_CURSOR_MAX_AGE_MS = 60_000
export const AUTHORIZED_READ_PAGE_SIZE_DEFAULT = 50
export const AUTHORIZED_READ_PAGE_SIZE_MAX = 100

const CURSOR_PREFIX = "e30c1"
const CURSOR_AAD = Buffer.from("allura-epic30-read-cursor-v1")

function base64Url(value: Buffer): string {
  return value.toString("base64url")
}

function fromBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Synthetic read cursor refused")
  return Buffer.from(value, "base64url")
}

function cursorKey(witnessKey: Buffer): Buffer {
  return createHash("sha256").update(witnessKey).update("\0epic30-cursor-key-v1").digest()
}

function isRole(value: unknown): value is AuthUser["role"] {
  return value === "viewer" || value === "curator" || value === "admin"
}

function isOperation(value: unknown): value is AuthorizedReadOperation {
  return value === "read_documents" || value === "search_documents"
}

function isCanonicalDate(value: unknown): value is string {
  if (typeof value !== "string") return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}

function isHexDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function assertCursorClaims(value: unknown): asserts value is AuthorizedReadCursorClaims {
  if (!value || typeof value !== "object") throw new Error("Synthetic read cursor refused")
  const claims = value as Record<string, unknown>
  const boundary = claims.boundary
  if (!boundary || typeof boundary !== "object") throw new Error("Synthetic read cursor refused")
  const cursorBoundary = boundary as Record<string, unknown>
  const policyEpoch = claims.policyEpoch
  const pageSize = claims.pageSize
  if (claims.version !== 1 || !isOperation(claims.operation) ||
      typeof claims.tenantId !== "string" || !claims.tenantId.trim() || claims.tenantId.length > 256 ||
      typeof claims.workspaceId !== "string" || !claims.workspaceId.trim() || claims.workspaceId.length > 256 ||
      typeof claims.principalId !== "string" || !claims.principalId.trim() || claims.principalId.length > 256 ||
      !isHexDigest(claims.sessionHash) || !isRole(claims.actorRole) ||
      !Number.isSafeInteger(policyEpoch) || (policyEpoch as number) <= 0 ||
      !Number.isSafeInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > AUTHORIZED_READ_PAGE_SIZE_MAX ||
      typeof cursorBoundary.id !== "string" || !cursorBoundary.id.trim() || cursorBoundary.id.length > 512 ||
      !isCanonicalDate(cursorBoundary.updatedAt) || !isHexDigest(claims.witnessHash) ||
      (claims.queryHash !== null && !isHexDigest(claims.queryHash)) || !isCanonicalDate(claims.issuedAt)) {
    throw new Error("Synthetic read cursor refused")
  }
}

function sameDigest(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex")
  const b = Buffer.from(right, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

export function hashAuthorizedReadSession(witnessKey: Buffer, sessionId: string): string {
  if (!Buffer.isBuffer(witnessKey) || witnessKey.length < 32 || !sessionId?.trim()) {
    throw new Error("Synthetic read cursor input refused")
  }
  return hmac(witnessKey, "epic30-session-v1", sessionId)
}

export function hashAuthorizedSearchQuery(witnessKey: Buffer, searchQuery: string): string {
  if (!Buffer.isBuffer(witnessKey) || witnessKey.length < 32 || !searchQuery?.trim()) {
    throw new Error("Synthetic read cursor input refused")
  }
  return hmac(witnessKey, "epic30-search-query-v1", searchQuery)
}

/** Create an opaque, authenticated, receipt-bound cursor for the next page. */
export function createAuthorizedReadCursor(input: AuthorizedReadCursorInput): string {
  const { scope, sessionId, actorRole, policyEpoch, operation, pageSize, boundary, witnessHash, witnessKey } = input
  if (!scope.tenantId?.trim() || !scope.workspaceId?.trim() || !scope.principalId?.trim() ||
      !sessionId?.trim() || !isRole(actorRole) || !isOperation(operation) ||
      !Number.isSafeInteger(policyEpoch) || policyEpoch <= 0 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > AUTHORIZED_READ_PAGE_SIZE_MAX ||
      !boundary || typeof boundary.id !== "string" || !boundary.id.trim() || boundary.id.length > 512 ||
      !isCanonicalDate(boundary.updatedAt) || !isHexDigest(witnessHash) ||
      !Buffer.isBuffer(witnessKey) || witnessKey.length < 32 ||
      (input.queryHash !== undefined && input.queryHash !== null && !isHexDigest(input.queryHash)) ||
      (input.issuedAt !== undefined && Number.isNaN(input.issuedAt.getTime()))) {
    throw new Error("Synthetic read cursor input refused")
  }
  const issuedAt = (input.issuedAt ?? new Date()).toISOString()
  const claims: AuthorizedReadCursorClaims = {
    version: 1,
    operation,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    principalId: scope.principalId,
    sessionHash: hashAuthorizedReadSession(witnessKey, sessionId),
    actorRole,
    policyEpoch,
    pageSize,
    boundary: { updatedAt: boundary.updatedAt, id: boundary.id },
    witnessHash,
    queryHash: input.queryHash ?? null,
    issuedAt,
  }
  const plaintext = Buffer.from(JSON.stringify(claims), "utf8")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", cursorKey(witnessKey), iv)
  cipher.setAAD(CURSOR_AAD)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const token = `${CURSOR_PREFIX}.${base64Url(iv)}.${base64Url(ciphertext)}.${base64Url(cipher.getAuthTag())}`
  if (token.length > AUTHORIZED_READ_CURSOR_MAX_LENGTH) throw new Error("Synthetic read cursor refused")
  return token
}

/** Decrypt and authenticate a cursor without disclosing any protected fields. */
export function decodeAuthorizedReadCursor(cursor: string, witnessKey: Buffer, now = new Date()): AuthorizedReadCursorClaims {
  if (typeof cursor !== "string" || cursor.length === 0 || cursor.length > AUTHORIZED_READ_CURSOR_MAX_LENGTH ||
      !Buffer.isBuffer(witnessKey) || witnessKey.length < 32) {
    throw new Error("Synthetic read cursor refused")
  }
  const parts = cursor.split(".")
  if (parts.length !== 4 || parts[0] !== CURSOR_PREFIX) throw new Error("Synthetic read cursor refused")
  try {
    const iv = fromBase64Url(parts[1])
    const ciphertext = fromBase64Url(parts[2])
    const tag = fromBase64Url(parts[3])
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error("bad cursor")
    const decipher = createDecipheriv("aes-256-gcm", cursorKey(witnessKey), iv)
    decipher.setAAD(CURSOR_AAD)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    const claims: unknown = JSON.parse(plaintext.toString("utf8"))
    assertCursorClaims(claims)
    if (Number.isNaN(now.getTime()) || now.getTime() - new Date(claims.issuedAt).getTime() > AUTHORIZED_READ_CURSOR_MAX_AGE_MS ||
        now.getTime() < new Date(claims.issuedAt).getTime()) throw new Error("stale cursor")
    return claims
  } catch {
    throw new Error("Synthetic read cursor refused")
  }
}

export function assertAuthorizedReadCursorMatches(
  claims: AuthorizedReadCursorClaims,
  input: {
    scope: DigitalBrainReadScope
    sessionId: string
    witnessKey: Buffer
    actorRole: AuthUser["role"]
    policyEpoch: number
    operation: AuthorizedReadOperation
    pageSize: number
    queryHash?: string | null
  },
): void {
  if (claims.tenantId !== input.scope.tenantId || claims.workspaceId !== input.scope.workspaceId ||
      claims.principalId !== input.scope.principalId || claims.actorRole !== input.actorRole ||
      claims.policyEpoch !== input.policyEpoch || claims.operation !== input.operation ||
      claims.pageSize !== input.pageSize ||
      !sameDigest(claims.sessionHash, hashAuthorizedReadSession(input.witnessKey, input.sessionId)) ||
      claims.queryHash !== (input.queryHash ?? null)) {
    throw new Error("Synthetic read cursor authority refused")
  }
}

function hmac(key: Buffer, domain: string, value: unknown): string {
  return createHmac("sha256", key).update(domain).update("\0").update(JSON.stringify(value)).digest("hex")
}

function assertInput(input: ReadReceiptInput): void {
  const { scope, sessionId, actorRole, policyEpoch, documents, witnessKey, priorWitnessHash, receiptId, occurredAt, searchQuery, policyVersion } = input
  if (!scope.tenantId?.trim() || !scope.workspaceId?.trim() || !scope.principalId?.trim() ||
      !sessionId?.trim() || !["viewer", "curator", "admin"].includes(actorRole) ||
      !Number.isSafeInteger(policyEpoch) || policyEpoch <= 0 ||
      !Buffer.isBuffer(witnessKey) || witnessKey.length < 32 ||
      (priorWitnessHash !== undefined && !isHexDigest(priorWitnessHash)) ||
      (receiptId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId)) ||
      (occurredAt !== undefined && Number.isNaN(occurredAt.getTime())) ||
      (searchQuery !== undefined && (searchQuery.length < 2 || searchQuery.length > 120 ||
        searchQuery !== searchQuery.trim().toLocaleLowerCase("en-US"))) ||
      (policyVersion !== undefined && policyVersion !== "epic30-local-v2" && policyVersion !== "epic30-production-v1")) {
    throw new Error("Synthetic read receipt input refused")
  }
  const seen = new Set<string>()
  for (const document of documents) {
    if (!document.id?.trim() || document.groupId !== scope.tenantId ||
        document.workspaceId !== scope.workspaceId || seen.has(document.id) ||
        !document.ownerId?.trim() || typeof document.title !== "string" ||
        typeof document.content !== "string" ||
        (document.visibility !== "private" && document.visibility !== "department") ||
        (document.visibility === "private" && document.departmentId !== null) ||
        (document.visibility === "department" && !document.departmentId?.trim()) ||
        !(document.updatedAt instanceof Date) || Number.isNaN(document.updatedAt.getTime())) {
      throw new Error("Synthetic read receipt document refused")
    }
    seen.add(document.id)
  }
}

export function createAuthorizedReadReceipt(input: ReadReceiptInput): AuthorizedReadReceipt {
  assertInput(input)
  const { scope, sessionId, actorRole, policyEpoch, documents, witnessKey, priorWitnessHash, searchQuery } = input
  const policyVersion = input.policyVersion ?? "epic30-local-v2"
  const sessionHash = hashAuthorizedReadSession(witnessKey, sessionId)
  const action = searchQuery === undefined ? "read_documents" : "search_documents"
  const queryHash = searchQuery === undefined ? null : hashAuthorizedSearchQuery(witnessKey, searchQuery)
  const witnessHash = hmac(witnessKey, "epic30-read-v2", {
    action,
    queryHash,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    principalId: scope.principalId,
    actorRole,
    policyVersion,
    sessionHash,
    policyEpoch,
    priorWitnessHash: priorWitnessHash ?? null,
    documents: documents.map((document) => ({
      id: document.id,
      ownerId: document.ownerId,
      departmentId: document.departmentId,
      visibility: document.visibility,
      title: document.title,
      content: document.content,
      updatedAt: document.updatedAt.toISOString(),
    })).sort((left, right) => left.id.localeCompare(right.id)),
  })
  return Object.freeze({
    receiptId: input.receiptId ?? randomUUID(),
    action,
    decision: "allow_candidate" as const,
    reasonCode: "authorized" as const,
    policyVersion,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    principalId: scope.principalId,
    actorRole,
    sessionHash,
    policyEpoch,
    witnessHash,
    queryHash,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
  })
}

/** A writer must acknowledge the exact committed receipt before disclosure. */
export async function persistAuthorizedReadReceipt(
  input: ReadReceiptInput,
  writer: ReadReceiptWriter,
): Promise<AuthorizedReadReceipt> {
  const receipt = createAuthorizedReadReceipt(input)
  const acknowledgement = await writer.persist(receipt)
  if (acknowledgement.receiptId !== receipt.receiptId || acknowledgement.witnessHash !== receipt.witnessHash) {
    throw new Error("Synthetic read receipt acknowledgement refused")
  }
  return receipt
}
