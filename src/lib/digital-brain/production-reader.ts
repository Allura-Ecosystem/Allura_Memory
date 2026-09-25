import { getDashboardPrincipal } from "@/lib/auth/dashboard-principal"
import type { AuthUser } from "@/lib/auth/types"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"
import { isCanonicalDocumentId, validateCanonicalDocumentIds } from "./document-id"
import type { ProductionAuthorizedReadSnapshot } from "./production-ask"
import {
  assertAuthorizedReadCursorMatches,
  AUTHORIZED_READ_PAGE_SIZE_DEFAULT,
  AUTHORIZED_READ_PAGE_SIZE_MAX,
  type AuthorizedReadCursorClaims,
  createAuthorizedReadCursor,
  createAuthorizedReadReceipt,
  decodeAuthorizedReadCursor,
  hashAuthorizedSearchQuery,
  persistAuthorizedReadReceipt,
  type ReadReceiptWriter,
} from "./read-receipt"
import {
  type AuthorizedDocument,
  type AuthorizedReadPage,
  type AuthorizedReadPageOptions,
  type AuthorizedSearchHit,
  type AuthorizedSearchPage,
  type AuthorizedWorkspaceReadResult,
  type DigitalBrainReadScope,
  mapAuthorizedWorkspaceProviderState,
} from "./read-service"

type ProductionCursorClaims = AuthorizedReadCursorClaims

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
   AND approval.policy_epoch = workspace_membership.policy_epoch
  WHERE workspace_membership.group_id = $1
    AND workspace_membership.workspace_id = $2
    AND workspace_membership.user_id = $3
    AND workspace_membership.revoked_at IS NULL
    AND workspace_membership.approval_id IS NOT NULL
    AND approval.action = 'grant'
    AND approval.approver_role = 'workspace_membership_admin'
    AND approval.verified_at IS NOT NULL
    AND approval.revoked_at IS NULL
    AND approval.consumed_at IS NOT NULL
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

type AuthorizedDocumentLike = AuthorizedDocument

function compareIds(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
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
    .filter(isCanonicalDocumentId)
}

function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function literalLike(value: string): string {
  return `%${escapeLikeLiteral(value)}%`
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
  private readonly receiptWriter: ReadReceiptWriter

  constructor(cursorKey: Buffer, receiptWriter: ReadReceiptWriter) {
    if (!Buffer.isBuffer(cursorKey) || cursorKey.length < 32) throw new Error("Production read cursor key refused")
    if (!receiptWriter || typeof receiptWriter.persist !== "function") throw new Error("Production read receipt writer refused")
    this.cursorKey = Buffer.from(cursorKey)
    this.receiptWriter = receiptWriter
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
      const where = options.query === undefined ? "" : " AND (LOWER(document.title) LIKE $3 ESCAPE E'\\\\' OR LOWER(document.content) LIKE $3 ESCAPE E'\\\\')"
      const boundary = options.boundary
      const boundarySql = boundary ? ` AND (document.updated_at < $${options.query === undefined ? 3 : 4}::timestamptz
        OR (document.updated_at = $${options.query === undefined ? 3 : 4}::timestamptz
          AND (document.id COLLATE "C") > ($${options.query === undefined ? 4 : 5}::text COLLATE "C")))` : ""
      const baseParams: unknown[] = [scope.tenantId, scope.workspaceId]
      if (options.query !== undefined) baseParams.push(literalLike(options.query))
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
          WHERE document.group_id = $1 AND document.workspace_id = $2${where}`, [scope.tenantId, scope.workspaceId, literalLike(options.query)])
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
    priorWitnessHash?: string
  }): Promise<{ authority: ProductionAuthority; documents: AuthorizedDocumentLike[]; total: number; hasMore: boolean; witnessHash: string }> {
    const pageSize = normalizePageSize(options.pageSize)
    const queryHash = options.query === undefined ? null : hashAuthorizedSearchQuery(this.cursorKey, options.query)
    const cursorClaims = options.cursor === undefined ? null : decodeAuthorizedReadCursor(options.cursor, this.cursorKey)
    if (cursorClaims && options.priorWitnessHash) throw new Error("Production read witness chain refused")
    if (options.priorWitnessHash !== undefined && !/^[a-f0-9]{64}$/.test(options.priorWitnessHash)) {
      throw new Error("Production read witness chain refused")
    }
    const priorWitnessHash = cursorClaims?.witnessHash ?? options.priorWitnessHash
    const assertCursor = (authority: ProductionAuthority, currentPrincipal: AuthUser): void => {
      if (!cursorClaims) return
      assertAuthorizedReadCursorMatches(cursorClaims, {
        scope,
        sessionId: currentPrincipal.sessionId!,
        witnessKey: this.cursorKey,
        actorRole: authority.actorRole,
        policyEpoch: authority.policyEpoch,
        operation: options.operation,
        pageSize,
        queryHash,
      })
    }
    const preflightAuthority = await this.authority(scope)
    if (preflightAuthority.actorRole !== principal.role) throw new Error("Production read authority refused")
    assertCursor(preflightAuthority, principal)
    const first = await this.candidate(scope, { operation: options.operation, query: options.query, boundary: cursorClaims?.boundary ?? null, pageSize })
    assertCursor(first.authority, principal)
    if (first.authority.actorRole !== principal.role) throw new Error("Production read authority refused")
    const firstPage = first.documents.slice(0, pageSize)
    const receipt = await persistAuthorizedReadReceipt({
      scope,
      sessionId: principal.sessionId!,
      actorRole: first.authority.actorRole,
      policyEpoch: first.authority.policyEpoch,
      documents: firstPage,
      witnessKey: this.cursorKey,
      priorWitnessHash,
      searchQuery: options.query,
      policyVersion: "epic30-production-v1",
    }, this.receiptWriter)
    const refreshedPrincipal = await getDashboardPrincipal()
    if (!refreshedPrincipal || refreshedPrincipal.id !== principal.id ||
        refreshedPrincipal.groupId !== principal.groupId || refreshedPrincipal.workspaceId !== principal.workspaceId ||
        refreshedPrincipal.sessionId !== principal.sessionId || refreshedPrincipal.role !== principal.role) {
      throw new Error("Production read authority changed")
    }
    const current = await this.candidate(scope, { operation: options.operation, query: options.query, boundary: cursorClaims?.boundary ?? null, pageSize })
    assertCursor(current.authority, refreshedPrincipal)
    const currentPage = current.documents.slice(0, pageSize)
    const currentReceipt = createAuthorizedReadReceipt({
      scope,
      sessionId: refreshedPrincipal.sessionId!,
      actorRole: current.authority.actorRole,
      policyEpoch: current.authority.policyEpoch,
      documents: currentPage,
      witnessKey: this.cursorKey,
      priorWitnessHash,
      searchQuery: options.query,
      policyVersion: "epic30-production-v1",
      receiptId: receipt.receiptId,
      occurredAt: new Date(receipt.occurredAt),
    })
    if (current.authority.actorRole !== first.authority.actorRole ||
        current.authority.policyEpoch !== first.authority.policyEpoch || current.total !== first.total ||
        currentReceipt.witnessHash !== receipt.witnessHash || currentReceipt.queryHash !== receipt.queryHash) {
      throw new Error("Production read authority changed")
    }
    return { authority: current.authority, documents: currentPage, total: current.total,
      hasMore: current.documents.length > pageSize, witnessHash: receipt.witnessHash }
  }

  async readDocumentsPage(options: AuthorizedReadPageOptions = {}): Promise<AuthorizedReadPage> {
    const { principal, scope } = await this.principal()
    const result = await this.page(scope, principal, { ...options, operation: "read_documents" })
    const nextCursor = result.hasMore && result.documents.length > 0 ? createAuthorizedReadCursor({
      scope, sessionId: principal.sessionId!, operation: "read_documents",
      actorRole: result.authority.actorRole, policyEpoch: result.authority.policyEpoch, pageSize: normalizePageSize(options.pageSize),
      boundary: { updatedAt: result.documents[result.documents.length - 1].updatedAt.toISOString(), id: result.documents[result.documents.length - 1].id },
      witnessHash: result.witnessHash, witnessKey: this.cursorKey, queryHash: null,
    }) : null
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

  /**
   * Ask-only adapter that exposes the complete server-derived authority tuple
   * and the final receipt-chain witness without accepting caller authority.
   */
  async readAuthorizedSnapshot(
    expectedScope: DigitalBrainReadScope,
    priorReceiptWitnessHash?: string,
  ): Promise<ProductionAuthorizedReadSnapshot> {
    const { principal, scope } = await this.principal()
    if (scope.tenantId !== expectedScope.tenantId || scope.workspaceId !== expectedScope.workspaceId ||
        scope.principalId !== expectedScope.principalId) throw new Error("Production Ask authority refused")
    const documents: AuthorizedDocumentLike[] = []
    let cursor: string | undefined
    let firstAuthority: ProductionAuthority | null = null
    let finalWitnessHash = ""
    do {
      const result = await this.page(scope, principal, {
        operation: "read_documents", pageSize: AUTHORIZED_READ_PAGE_SIZE_MAX, cursor,
        priorWitnessHash: cursor ? undefined : priorReceiptWitnessHash,
      })
      if (firstAuthority && (result.authority.actorRole !== firstAuthority.actorRole ||
          result.authority.policyEpoch !== firstAuthority.policyEpoch)) {
        throw new Error("Production Ask authority changed")
      }
      firstAuthority ??= result.authority
      documents.push(...result.documents)
      finalWitnessHash = result.witnessHash
      cursor = result.hasMore && result.documents.length > 0 ? createAuthorizedReadCursor({
        scope, sessionId: principal.sessionId!, operation: "read_documents",
        actorRole: result.authority.actorRole, policyEpoch: result.authority.policyEpoch,
        pageSize: AUTHORIZED_READ_PAGE_SIZE_MAX,
        boundary: {
          updatedAt: result.documents[result.documents.length - 1].updatedAt.toISOString(),
          id: result.documents[result.documents.length - 1].id,
        },
        witnessHash: result.witnessHash, witnessKey: this.cursorKey, queryHash: null,
      }) : undefined
    } while (cursor)
    if (!firstAuthority || !finalWitnessHash) throw new Error("Production Ask receipt witness refused")
    return {
      authority: {
        tenantId: scope.tenantId, workspaceId: scope.workspaceId, principalId: scope.principalId,
        sessionId: principal.sessionId!, actorRole: firstAuthority.actorRole,
        policyEpoch: firstAuthority.policyEpoch, receiptWitnessHash: finalWitnessHash,
        priorReceiptWitnessHash: priorReceiptWitnessHash ?? null,
        decision: "authorized",
      },
      documents,
    }
  }

  async searchDocumentsPage(rawQuery: string, options: AuthorizedReadPageOptions = {}): Promise<AuthorizedSearchPage> {
    const query = normalizeQuery(rawQuery)
    const { principal, scope } = await this.principal()
    const result = await this.page(scope, principal, { ...options, operation: "search_documents", query })
    const nextCursor = result.hasMore && result.documents.length > 0 ? createAuthorizedReadCursor({
      scope, sessionId: principal.sessionId!, operation: "search_documents",
      actorRole: result.authority.actorRole, policyEpoch: result.authority.policyEpoch, pageSize: normalizePageSize(options.pageSize),
      boundary: { updatedAt: result.documents[result.documents.length - 1].updatedAt.toISOString(), id: result.documents[result.documents.length - 1].id },
      witnessHash: result.witnessHash, witnessKey: this.cursorKey,
      queryHash: hashAuthorizedSearchQuery(this.cursorKey, query),
    }) : null
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
    if (!isCanonicalDocumentId(focusId)) throw new Error("Production link focus refused")
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
    try { validateCanonicalDocumentIds(citationIds, { allowEmpty: true }) } catch { throw new Error("Production citation IDs refused") }
    const documents = await this.readDocuments()
    const byId = new Map(documents.map((document) => [document.id, document]))
    return [...new Set(citationIds)].map((id) => byId.get(id)).filter((document): document is AuthorizedDocumentLike => Boolean(document)).map((document) => ({ documentId: document.id, title: document.title }))
  }

  async derivativeSources(sourceIds: readonly string[]): Promise<ProductionDerivativeSources | null> {
    try { validateCanonicalDocumentIds(sourceIds) } catch { throw new Error("Production derivative source IDs refused") }
    const documents = await this.readDocuments()
    const byId = new Map(documents.map((document) => [document.id, document]))
    const uniqueIds = [...new Set(sourceIds)]
    if (uniqueIds.some((id) => !byId.has(id))) return null
    return { sources: uniqueIds.map((id) => ({ documentId: id, title: byId.get(id)!.title })) }
  }
}
