import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto"

import { getDashboardPrincipal } from "@/lib/auth/dashboard-principal"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"
import type { AuthUser } from "@/lib/auth/types"
import {
  type AuthorizedReadPage,
  type AuthorizedReadPageOptions,
  type AuthorizedSearchHit,
  type AuthorizedSearchPage,
  type AuthorizedWorkspaceReadResult,
  type DigitalBrainReadScope,
  mapAuthorizedWorkspaceProviderState,
} from "./read-service"
import { AUTHORIZED_READ_PAGE_SIZE_DEFAULT, AUTHORIZED_READ_PAGE_SIZE_MAX } from "./read-receipt"

const CURSOR_PREFIX = "e30p1"
const CURSOR_MAX_LENGTH = 4096
const CURSOR_MAX_AGE_MS = 60_000

interface ProductionCursorClaims {
  version: 1
  operation: "read_documents" | "search_documents"
  tenantId: string
  workspaceId: string
  principalId: string
  sessionHash: string
  actorRole: AuthUser["role"]
  policyEpoch: number
  pageSize: number
  boundary: { updatedAt: string; id: string }
  witnessHash: string
  queryHash: string | null
  issuedAt: string
}

interface ProductionAuthority {
  actorRole: AuthUser["role"]
  policyEpoch: number
}

interface ProductionRow {
  id: string
  group_id: string
  workspace_id: string
  owner_id: string
  department_id: string | null
  visibility: "private" | "department"
  title: string
  content: string
  updated_at: Date
}

interface ProductionQuery {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>
}

const AUTHORITY_SQL = `
  SELECT workspace_membership.policy_epoch, tenant_membership.role
  FROM brain_workspace_memberships AS workspace_membership
  JOIN memberships AS tenant_membership
    ON tenant_membership.group_id = workspace_membership.group_id
   AND tenant_membership.user_id = workspace_membership.user_id
  JOIN brain_membership_approvals AS approval
    ON approval.approval_id = workspace_membership.approval_id
   AND approval.group_id = workspace_membership.group_id
   AND approval.workspace_id = workspace_membership.workspace_id
   AND approval.subject_user_id = workspace_membership.user_id
  WHERE workspace_membership.group_id = $1
    AND workspace_membership.workspace_id = $2
    AND workspace_membership.user_id = $3
    AND workspace_membership.revoked_at IS NULL
    AND workspace_membership.approval_id IS NOT NULL
    AND approval.action = 'grant'
    AND approval.approver_role = 'workspace_membership_admin'
    AND approval.revoked_at IS NULL
    AND tenant_membership.removed_at IS NULL
`

function role(value: unknown): value is AuthUser["role"] {
  return value === "viewer" || value === "curator" || value === "admin"
}

function normalizePageSize(value: number | undefined): number {
  const pageSize = value ?? AUTHORIZED_READ_PAGE_SIZE_DEFAULT
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > AUTHORIZED_READ_PAGE_SIZE_MAX) {
    throw new Error("Production read page size refused")
  }
  return pageSize
}

function normalizeQuery(value: string): string {
  if (typeof value !== "string") throw new Error("Production search query refused")
  const query = value.trim().toLocaleLowerCase("en-US")
  if (query.length < 2 || query.length > 120 || /[\x00-\x1f\x7f]/.test(query)) {
    throw new Error("Production search query refused")
  }
  return query
}

function scopeFor(principal: AuthUser): DigitalBrainReadScope {
  if (!principal.id?.trim() || !principal.groupId?.trim() || !principal.workspaceId?.trim() ||
      !principal.sessionId?.trim() || !role(principal.role)) {
    throw new Error("Production read authority refused")
  }
  return { tenantId: principal.groupId, workspaceId: principal.workspaceId, principalId: principal.id }
}

function mapRow(value: unknown, scope: DigitalBrainReadScope): AuthorizedDocumentLike | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== "string" || !row.id.trim() || row.group_id !== scope.tenantId ||
      row.workspace_id !== scope.workspaceId || typeof row.owner_id !== "string" || !row.owner_id.trim() ||
      (row.department_id !== null && typeof row.department_id !== "string") ||
      (row.visibility !== "private" && row.visibility !== "department") ||
      typeof row.title !== "string" || typeof row.content !== "string" || !(row.updated_at instanceof Date) ||
      Number.isNaN(row.updated_at.getTime()) ||
      (row.visibility === "private" ? row.department_id !== null : !row.department_id?.trim())) return null
  return {
    id: row.id, groupId: row.group_id, workspaceId: row.workspace_id, ownerId: row.owner_id,
    departmentId: row.department_id, visibility: row.visibility, title: row.title,
    content: row.content, updatedAt: row.updated_at,
  }
}

type AuthorizedDocumentLike = {
  id: string
  groupId: string
  workspaceId: string
  ownerId: string
  departmentId: string | null
  visibility: "private" | "department"
  title: string
  content: string
  updatedAt: Date
}

function compareIds(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
}

function sortDocuments<T extends { id: string; updatedAt: Date }>(documents: readonly T[]): T[] {
  return [...documents].sort((left, right) =>
    right.updatedAt.getTime() - left.updatedAt.getTime() || compareIds(left.id, right.id))
}

function isAfterBoundary(document: { id: string; updatedAt: Date }, boundary: ProductionCursorClaims["boundary"] | null): boolean {
  if (!boundary) return true
  const boundaryTime = new Date(boundary.updatedAt).getTime()
  return document.updatedAt.getTime() < boundaryTime ||
    (document.updatedAt.getTime() === boundaryTime && compareIds(document.id, boundary.id) > 0)
}

function digest(key: Buffer, domain: string, value: unknown): string {
  return createHmac("sha256", key).update(domain).update("\0").update(JSON.stringify(value)).digest("hex")
}

function cipherKey(key: Buffer): Buffer {
  return createHash("sha256").update(key).update("\0allura-production-reader-v1").digest()
}

function assertCursorClaims(value: unknown): asserts value is ProductionCursorClaims {
  if (!value || typeof value !== "object") throw new Error("Production read cursor refused")
  const claims = value as Record<string, unknown>
  const boundary = claims.boundary
  if (!boundary || typeof boundary !== "object") throw new Error("Production read cursor refused")
  const cursorBoundary = boundary as Record<string, unknown>
  if (claims.version !== 1 || (claims.operation !== "read_documents" && claims.operation !== "search_documents") ||
      typeof claims.tenantId !== "string" || !claims.tenantId.trim() || claims.tenantId.length > 256 ||
      typeof claims.workspaceId !== "string" || !claims.workspaceId.trim() || claims.workspaceId.length > 256 ||
      typeof claims.principalId !== "string" || !claims.principalId.trim() || claims.principalId.length > 256 ||
      !/^[a-f0-9]{64}$/.test(String(claims.sessionHash)) || !role(claims.actorRole) ||
      !Number.isSafeInteger(claims.policyEpoch) || Number(claims.policyEpoch) <= 0 ||
      !Number.isSafeInteger(claims.pageSize) || Number(claims.pageSize) < 1 || Number(claims.pageSize) > AUTHORIZED_READ_PAGE_SIZE_MAX ||
      typeof cursorBoundary.id !== "string" || !cursorBoundary.id.trim() || cursorBoundary.id.length > 512 ||
      typeof cursorBoundary.updatedAt !== "string" || Number.isNaN(new Date(cursorBoundary.updatedAt).getTime()) ||
      !/^[a-f0-9]{64}$/.test(String(claims.witnessHash)) ||
      (claims.queryHash !== null && !/^[a-f0-9]{64}$/.test(String(claims.queryHash))) ||
      typeof claims.issuedAt !== "string" || Number.isNaN(new Date(claims.issuedAt).getTime())) {
    throw new Error("Production read cursor refused")
  }
}

function encodeCursor(claims: ProductionCursorClaims, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", cipherKey(key), iv)
  cipher.setAAD(Buffer.from("allura-production-reader-v1"))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()])
  const token = `${CURSOR_PREFIX}.${iv.toString("base64url")}.${encrypted.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`
  if (token.length > CURSOR_MAX_LENGTH) throw new Error("Production read cursor refused")
  return token
}

function decodeCursor(cursor: string | undefined, key: Buffer): ProductionCursorClaims | null {
  if (cursor === undefined) return null
  if (typeof cursor !== "string" || cursor.length === 0 || cursor.length > CURSOR_MAX_LENGTH) throw new Error("Production read cursor refused")
  const parts = cursor.split(".")
  if (parts.length !== 4 || parts[0] !== CURSOR_PREFIX) throw new Error("Production read cursor refused")
  try {
    const iv = Buffer.from(parts[1], "base64url")
    const ciphertext = Buffer.from(parts[2], "base64url")
    const tag = Buffer.from(parts[3], "base64url")
    if (iv.length !== 12 || ciphertext.length === 0 || tag.length !== 16) throw new Error("bad cursor")
    const decipher = createDecipheriv("aes-256-gcm", cipherKey(key), iv)
    decipher.setAAD(Buffer.from("allura-production-reader-v1"))
    decipher.setAuthTag(tag)
    const claims: unknown = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"))
    assertCursorClaims(claims)
    const issued = new Date(claims.issuedAt).getTime()
    const now = Date.now()
    if (now < issued || now - issued > CURSOR_MAX_AGE_MS) throw new Error("stale cursor")
    return claims
  } catch {
    throw new Error("Production read cursor refused")
  }
}

function assertCursorAuthority(
  claims: ProductionCursorClaims | null,
  scope: DigitalBrainReadScope,
  principal: AuthUser,
  authority: ProductionAuthority,
  operation: ProductionCursorClaims["operation"],
  pageSize: number,
  queryHash: string | null,
  key: Buffer,
): void {
  if (!claims) return
  if (claims.tenantId !== scope.tenantId || claims.workspaceId !== scope.workspaceId || claims.principalId !== scope.principalId ||
      claims.actorRole !== principal.role || claims.policyEpoch !== authority.policyEpoch || claims.operation !== operation ||
      claims.pageSize !== pageSize || claims.queryHash !== queryHash ||
      claims.sessionHash !== digest(key, "production-session-v1", principal.sessionId)) throw new Error("Production read cursor authority refused")
}

function witnessHash(
  key: Buffer,
  scope: DigitalBrainReadScope,
  principal: AuthUser,
  authority: ProductionAuthority,
  operation: ProductionCursorClaims["operation"],
  queryHash: string | null,
  documents: readonly AuthorizedDocumentLike[],
  total: number,
): string {
  return digest(key, "production-witness-v1", {
    scope, sessionHash: digest(key, "production-session-v1", principal.sessionId), actorRole: authority.actorRole,
    policyEpoch: authority.policyEpoch, operation, queryHash, total,
    documents: documents.map((document) => ({ ...document, updatedAt: document.updatedAt.toISOString() })),
  })
}

function hit(document: AuthorizedDocumentLike, query: string): AuthorizedSearchHit {
  const title = document.title.toLocaleLowerCase("en-US")
  const content = document.content.toLocaleLowerCase("en-US")
  const titleMatch = title.includes(query)
  const index = content.indexOf(query)
  const start = index < 0 ? 0 : Math.max(0, index - 60)
  return { documentId: document.id, title: document.title, snippet: titleMatch && index < 0 ? "" : document.content.slice(start, start + 160), updatedAt: document.updatedAt }
}

function referencedIds(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]\r\n]{1,200})\]\]/g)]
    .map((match) => match[1])
    .filter((id) => id.trim() === id && id.length > 0 && !/[\x00-\x1f\x7f]/.test(id) && !id.includes("|") && !id.includes("[[") && !id.includes("]]"))
}

export interface ProductionDocumentLinks {
  documentId: string
  title: string
  links: Array<{ documentId: string; title: string }>
  backlinks: Array<{ documentId: string; title: string }>
}

export interface ProductionCitation { documentId: string; title: string }
export interface ProductionDerivativeSources { sources: ProductionCitation[] }

export class ProductionAuthorizedReadProvider {
  private readonly cursorKey: Buffer

  constructor(cursorKey: Buffer) {
    if (!Buffer.isBuffer(cursorKey) || cursorKey.length < 32) throw new Error("Production read cursor key refused")
    this.cursorKey = Buffer.from(cursorKey)
  }

  private async principal(): Promise<{ principal: AuthUser; scope: DigitalBrainReadScope }> {
    const principal = await getDashboardPrincipal()
    if (!principal) throw new Error("Production read authority refused")
    return { principal, scope: scopeFor(principal) }
  }

  private async authority(scope: DigitalBrainReadScope): Promise<ProductionAuthority> {
    return withWorkspaceTransaction(scope, async (client) => {
      const result = await client.query<{ policy_epoch: string | number; role: string }>(AUTHORITY_SQL, [scope.tenantId, scope.workspaceId, scope.principalId])
      const row = result.rows[0]
      if (!row || !role(row.role) || !Number.isSafeInteger(Number(row.policy_epoch)) || Number(row.policy_epoch) <= 0) {
        throw new Error("Production read authority refused")
      }
      return { actorRole: row.role, policyEpoch: Number(row.policy_epoch) }
    })
  }

  private async candidate(scope: DigitalBrainReadScope, options: {
    operation: ProductionCursorClaims["operation"]
    query?: string
    boundary: ProductionCursorClaims["boundary"] | null
    pageSize: number
  }): Promise<{ authority: ProductionAuthority; documents: AuthorizedDocumentLike[]; total: number }> {
    return withWorkspaceTransaction(scope, async (client) => {
      const authorityResult = await client.query<{ policy_epoch: string | number; role: string }>(AUTHORITY_SQL, [scope.tenantId, scope.workspaceId, scope.principalId])
      const authorityRow = authorityResult.rows[0]
      if (!authorityRow || !role(authorityRow.role) || Number(authorityRow.policy_epoch) <= 0) throw new Error("Production read authority refused")
      const authority = { actorRole: authorityRow.role, policyEpoch: Number(authorityRow.policy_epoch) }
      const where = options.query === undefined ? "" : " AND (LOWER(document.title) LIKE $3 OR LOWER(document.content) LIKE $3)"
      const boundary = options.boundary
      const boundarySql = boundary ? ` AND (document.updated_at < $${options.query === undefined ? 3 : 4}::timestamptz
        OR (document.updated_at = $${options.query === undefined ? 3 : 4}::timestamptz
          AND (document.id COLLATE "C") > ($${options.query === undefined ? 4 : 5}::text COLLATE "C")))` : ""
      const baseParams: unknown[] = [scope.tenantId, scope.workspaceId]
      if (options.query !== undefined) baseParams.push(`%${options.query}%`)
      if (boundary) baseParams.push(boundary.updatedAt, boundary.id)
      const limitParameter = baseParams.length + 1
      const rows = await client.query<ProductionRow>(`SELECT document.id, document.group_id, document.workspace_id, document.owner_id,
        document.department_id, document.visibility, document.title, document.content, document.updated_at
        FROM brain_documents AS document
        WHERE document.group_id = $1 AND document.workspace_id = $2${where}${boundarySql}
        ORDER BY document.updated_at DESC, document.id COLLATE "C"
        LIMIT $${limitParameter}`, [...baseParams, options.pageSize + 1])
      const mappedRows = rows.rows.map((row) => mapRow(row, scope))
      if (mappedRows.some((document) => document === null)) throw new Error("Production document row refused")
      const documents = mappedRows as AuthorizedDocumentLike[]
      let total = documents.length
      if (options.query !== undefined) {
        const count = await client.query<{ total: number | string }>(`SELECT COUNT(*)::int AS total FROM brain_documents AS document
          WHERE document.group_id = $1 AND document.workspace_id = $2${where}`, [scope.tenantId, scope.workspaceId, `%${options.query}%`])
        total = Number(count.rows[0]?.total ?? 0)
      }
      return { authority, documents, total }
    })
  }

  private async page(scope: DigitalBrainReadScope, principal: AuthUser, options: {
    operation: ProductionCursorClaims["operation"]
    query?: string
    pageSize?: number
    cursor?: string
  }): Promise<{ authority: ProductionAuthority; documents: AuthorizedDocumentLike[]; total: number; hasMore: boolean; cursorClaims: ProductionCursorClaims | null }> {
    const pageSize = normalizePageSize(options.pageSize)
    const queryHash = options.query === undefined ? null : digest(this.cursorKey, "production-query-v1", options.query)
    const cursorClaims = decodeCursor(options.cursor, this.cursorKey)
    const preflightAuthority = await this.authority(scope)
    if (preflightAuthority.actorRole !== principal.role) throw new Error("Production read authority refused")
    assertCursorAuthority(cursorClaims, scope, principal, preflightAuthority, options.operation, pageSize, queryHash, this.cursorKey)
    const first = await this.candidate(scope, { operation: options.operation, query: options.query, boundary: cursorClaims?.boundary ?? null, pageSize })
    assertCursorAuthority(cursorClaims, scope, principal, first.authority, options.operation, pageSize, queryHash, this.cursorKey)
    if (first.authority.actorRole !== principal.role) throw new Error("Production read authority refused")
    const firstPage = first.documents.slice(0, pageSize)
    const current = await this.candidate(scope, { operation: options.operation, query: options.query, boundary: cursorClaims?.boundary ?? null, pageSize })
    assertCursorAuthority(cursorClaims, scope, principal, current.authority, options.operation, pageSize, queryHash, this.cursorKey)
    const currentPage = current.documents.slice(0, pageSize)
    const firstWitness = witnessHash(this.cursorKey, scope, principal, first.authority, options.operation, queryHash, firstPage, first.total)
    const currentWitness = witnessHash(this.cursorKey, scope, principal, current.authority, options.operation, queryHash, currentPage, current.total)
    if (firstWitness !== currentWitness) throw new Error("Production read authority changed")
    return { authority: current.authority, documents: currentPage, total: current.total, hasMore: current.documents.length > pageSize, cursorClaims }
  }

  async readDocumentsPage(options: AuthorizedReadPageOptions = {}): Promise<AuthorizedReadPage> {
    const { principal, scope } = await this.principal()
    const result = await this.page(scope, principal, { ...options, operation: "read_documents" })
    const nextCursor = result.hasMore && result.documents.length > 0 ? encodeCursor({
      version: 1, operation: "read_documents", tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      principalId: scope.principalId, sessionHash: digest(this.cursorKey, "production-session-v1", principal.sessionId),
      actorRole: result.authority.actorRole, policyEpoch: result.authority.policyEpoch, pageSize: normalizePageSize(options.pageSize),
      boundary: { updatedAt: result.documents[result.documents.length - 1].updatedAt.toISOString(), id: result.documents[result.documents.length - 1].id },
      witnessHash: witnessHash(this.cursorKey, scope, principal, result.authority, "read_documents", null, result.documents, result.total),
      queryHash: null, issuedAt: new Date().toISOString(),
    }, this.cursorKey) : null
    return { documents: result.documents, nextCursor, hasMore: result.hasMore }
  }

  async readDocuments(): Promise<AuthorizedDocumentLike[]> {
    const documents: AuthorizedDocumentLike[] = []
    let cursor: string | undefined
    do {
      const page = await this.readDocumentsPage({ pageSize: AUTHORIZED_READ_PAGE_SIZE_MAX, cursor })
      documents.push(...page.documents)
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return documents
  }

  async searchDocumentsPage(rawQuery: string, options: AuthorizedReadPageOptions = {}): Promise<AuthorizedSearchPage> {
    const query = normalizeQuery(rawQuery)
    const { principal, scope } = await this.principal()
    const result = await this.page(scope, principal, { ...options, operation: "search_documents", query })
    const nextCursor = result.hasMore && result.documents.length > 0 ? encodeCursor({
      version: 1, operation: "search_documents", tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      principalId: scope.principalId, sessionHash: digest(this.cursorKey, "production-session-v1", principal.sessionId),
      actorRole: result.authority.actorRole, policyEpoch: result.authority.policyEpoch, pageSize: normalizePageSize(options.pageSize),
      boundary: { updatedAt: result.documents[result.documents.length - 1].updatedAt.toISOString(), id: result.documents[result.documents.length - 1].id },
      witnessHash: witnessHash(this.cursorKey, scope, principal, result.authority, "search_documents", digest(this.cursorKey, "production-query-v1", query), result.documents, result.total),
      queryHash: digest(this.cursorKey, "production-query-v1", query), issuedAt: new Date().toISOString(),
    }, this.cursorKey) : null
    return { total: result.total, hits: result.documents.map((document) => hit(document, query)), nextCursor, hasMore: result.hasMore }
  }

  async searchDocuments(rawQuery: string): Promise<{ total: number; hits: AuthorizedSearchHit[] }> {
    const hits: AuthorizedSearchHit[] = []
    let cursor: string | undefined
    let total = 0
    do {
      const page = await this.searchDocumentsPage(rawQuery, { pageSize: AUTHORIZED_READ_PAGE_SIZE_MAX, cursor })
      total = page.total
      hits.push(...page.hits)
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return { total, hits }
  }

  async workspaceState(): Promise<AuthorizedWorkspaceReadResult> {
    try {
      const { scope } = await this.principal()
      const documents = await this.readDocuments()
      return mapAuthorizedWorkspaceProviderState(scope, { state: documents.length === 0 ? "empty" : "complete", documents })
    } catch {
      return { state: "unavailable", documents: [] }
    }
  }

  async documentLinks(focusId: string): Promise<ProductionDocumentLinks | null> {
    if (typeof focusId !== "string" || !focusId.trim() || focusId.length > 200 || /[\x00-\x1f\x7f]/.test(focusId) || focusId.includes("|") || focusId.includes("[[") || focusId.includes("]]")) throw new Error("Production link focus refused")
    const documents = await this.readDocuments()
    const byId = new Map(documents.map((document) => [document.id, document]))
    const focus = byId.get(focusId)
    if (!focus) return null
    const endpoint = (document: AuthorizedDocumentLike) => ({ documentId: document.id, title: document.title })
    const byTitle = (left: { documentId: string; title: string }, right: { documentId: string; title: string }) => left.title.localeCompare(right.title) || compareIds(left.documentId, right.documentId)
    const links = [...new Set(referencedIds(focus.content))].map((id) => byId.get(id)).filter((document): document is AuthorizedDocumentLike => Boolean(document && document.id !== focusId)).map(endpoint).sort(byTitle)
    const backlinks = documents.filter((document) => document.id !== focusId && referencedIds(document.content).includes(focusId)).map(endpoint).sort(byTitle)
    return { ...endpoint(focus), links, backlinks }
  }

  async citations(citationIds: readonly string[]): Promise<ProductionCitation[]> {
    if (!Array.isArray(citationIds) || citationIds.length > 200 || citationIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 200)) throw new Error("Production citation IDs refused")
    const documents = await this.readDocuments()
    const byId = new Map(documents.map((document) => [document.id, document]))
    return [...new Set(citationIds)].map((id) => byId.get(id)).filter((document): document is AuthorizedDocumentLike => Boolean(document)).map((document) => ({ documentId: document.id, title: document.title }))
  }

  async derivativeSources(sourceIds: readonly string[]): Promise<ProductionDerivativeSources | null> {
    if (!Array.isArray(sourceIds) || sourceIds.length === 0 || sourceIds.length > 200 || sourceIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 200)) throw new Error("Production derivative source IDs refused")
    const documents = await this.readDocuments()
    const byId = new Map(documents.map((document) => [document.id, document]))
    const uniqueIds = [...new Set(sourceIds)]
    if (uniqueIds.some((id) => !byId.has(id))) return null
    return { sources: uniqueIds.map((id) => ({ documentId: id, title: byId.get(id)!.title })) }
  }
}
