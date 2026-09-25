import type { AuthUser } from "@/lib/auth/types"
import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { getAppPool } from "@/lib/postgres/connection"
import {
  assertAuthorizedReadCursorMatches,
  AUTHORIZED_READ_PAGE_SIZE_DEFAULT,
  AUTHORIZED_READ_PAGE_SIZE_MAX,
  type AuthorizedReadCursorClaims,
  type AuthorizedReadOperation,
  createAuthorizedReadCursor,
  createAuthorizedReadReceipt,
  decodeAuthorizedReadCursor,
  hashAuthorizedSearchQuery,
  persistAuthorizedReadReceipt,
} from "./read-receipt"
import { persistSyntheticReadReceipt } from "./read-receipt-writer"

const READ_ENVELOPE_BRAND = Symbol("epic30-read-envelope")

export interface DigitalBrainReadScope {
  tenantId: string
  workspaceId: string
  principalId: string
  /** Administrative roles never widen content authority. */
  roles?: readonly string[]
}

interface DigitalBrainReadEnvelope extends DigitalBrainReadScope {
  readonly [READ_ENVELOPE_BRAND]: true
  sessionId: string
  role: AuthUser["role"]
  policyEpoch: number
}

export interface AuthorizedDocument {
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

export interface AuthorizedReadPage {
  documents: AuthorizedDocument[]
  nextCursor: string | null
  hasMore: boolean
}

export interface AuthorizedReadPageOptions {
  cursor?: string
  pageSize?: number
}

export type AuthorizedWorkspaceReadState =
  | "empty"
  | "complete"
  | "forbidden"
  | "conflict"
  | "degraded"
  | "unavailable"

export interface AuthorizedWorkspaceReadResult {
  state: AuthorizedWorkspaceReadState
  documents: AuthorizedDocument[]
}

class AuthorizedWorkspaceStateError extends Error {
  constructor(
    readonly state: Exclude<AuthorizedWorkspaceReadState, "empty" | "complete" | "degraded">,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "AuthorizedWorkspaceStateError"
  }
}

export interface AuthorizedSearchPage {
  total: number
  hits: AuthorizedSearchHit[]
  nextCursor: string | null
  hasMore: boolean
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

interface DocumentRow {
  id: string
  group_id: string
  workspace_id: string
  owner_id: string
  department_id: string | null
  visibility: "private" | "department"
  title: string
  content: string
  updated_at: Date
  authorized_department: boolean
  authorized_tenant: boolean
  authorized_workspace: boolean
}

const AUTHORIZED_DOCUMENTS_SQL = `
  SELECT
    document.id,
    document.group_id,
    document.workspace_id,
    document.owner_id,
    document.department_id,
    document.visibility,
    document.title,
    document.content,
    document.updated_at,
    EXISTS (
      SELECT 1 FROM memberships AS tenant_membership
      WHERE tenant_membership.group_id = document.group_id
        AND tenant_membership.user_id = $3
        AND tenant_membership.removed_at IS NULL
    ) AS authorized_tenant,
    EXISTS (
      SELECT 1 FROM brain_workspace_memberships AS workspace_membership
      WHERE workspace_membership.group_id = document.group_id
        AND workspace_membership.workspace_id = document.workspace_id
        AND workspace_membership.user_id = $3
        AND workspace_membership.revoked_at IS NULL
        AND workspace_membership.policy_epoch = $4::bigint
    ) AS authorized_workspace,
    EXISTS (
      SELECT 1
      FROM brain_department_memberships AS membership
      WHERE membership.group_id = document.group_id
        AND membership.workspace_id = document.workspace_id
        AND membership.department_id = document.department_id
        AND membership.user_id = $3
        AND membership.revoked_at IS NULL
    ) AS authorized_department
  FROM brain_documents AS document
  WHERE document.group_id = $1
    AND document.workspace_id = $2
    AND EXISTS (
      SELECT 1 FROM memberships AS tenant_membership
      WHERE tenant_membership.group_id = document.group_id
        AND tenant_membership.user_id = $3
        AND tenant_membership.removed_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM brain_workspace_memberships AS workspace_membership
      WHERE workspace_membership.group_id = document.group_id
        AND workspace_membership.workspace_id = document.workspace_id
        AND workspace_membership.user_id = $3
        AND workspace_membership.revoked_at IS NULL
        AND workspace_membership.policy_epoch = $4::bigint
    )
    AND (
      (document.visibility = 'private' AND document.owner_id = $3)
      OR (
        document.visibility = 'department'
        AND EXISTS (
          SELECT 1
          FROM brain_department_memberships AS membership
          WHERE membership.group_id = document.group_id
            AND membership.workspace_id = document.workspace_id
            AND membership.department_id = document.department_id
            AND membership.user_id = $3
            AND membership.revoked_at IS NULL
        )
      )
    )
`

const AUTHORIZED_DOCUMENTS_ORDER_SQL = ` ORDER BY document.updated_at DESC, document.id COLLATE "C"`

const CURRENT_WORKSPACE_AUTHORITY_SQL = `
  SELECT workspace_membership.policy_epoch, tenant_membership.role
  FROM brain_workspace_memberships AS workspace_membership
  JOIN memberships AS tenant_membership
    ON tenant_membership.group_id = workspace_membership.group_id
   AND tenant_membership.user_id = workspace_membership.user_id
  WHERE workspace_membership.group_id = $1
    AND workspace_membership.workspace_id = $2
    AND workspace_membership.user_id = $3
    AND workspace_membership.revoked_at IS NULL
    AND tenant_membership.removed_at IS NULL
`

function issueReadEnvelope(
  scope: DigitalBrainReadScope,
  principal: AuthUser,
  membership: unknown,
): DigitalBrainReadEnvelope {
  if (principal.id !== scope.principalId || principal.groupId !== scope.tenantId ||
      principal.workspaceId !== scope.workspaceId || !principal.sessionId?.trim() ||
      !["viewer", "curator", "admin"].includes(principal.role)) {
    throw new Error("Synthetic read authority refused")
  }
  if (!membership || typeof membership !== "object") throw new Error("Synthetic read authority refused")
  const row = membership as Record<string, unknown>
  const epoch = Number(row.policy_epoch)
  if (!Number.isSafeInteger(epoch) || epoch <= 0 || row.role !== principal.role) {
    throw new Error("Synthetic read authority refused")
  }
  return Object.freeze({
    [READ_ENVELOPE_BRAND]: true as const,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    principalId: scope.principalId,
    sessionId: principal.sessionId,
    role: principal.role,
    policyEpoch: epoch,
  })
}

function isDocumentRow(value: unknown): value is DocumentRow {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  const commonFieldsAreValid =
    typeof row.id === "string" &&
    typeof row.group_id === "string" &&
    typeof row.workspace_id === "string" &&
    typeof row.owner_id === "string" &&
    (row.department_id === null || typeof row.department_id === "string") &&
    typeof row.title === "string" &&
    typeof row.content === "string" &&
    row.updated_at instanceof Date

  return commonFieldsAreValid && (row.visibility === "private" || row.visibility === "department")
}

function canDisclose(
  row: DocumentRow,
  scope: DigitalBrainReadScope,
): boolean {
  if (row.group_id !== scope.tenantId || row.workspace_id !== scope.workspaceId) return false
  if (row.authorized_tenant !== true) return false
  if (row.authorized_workspace !== true) return false
  if (row.visibility === "private") return row.owner_id === scope.principalId
  if (!row.department_id) return false

  return row.authorized_department === true
}

function mapDocument(row: DocumentRow): AuthorizedDocument {
  return {
    id: row.id,
    groupId: row.group_id,
    workspaceId: row.workspace_id,
    ownerId: row.owner_id,
    departmentId: row.department_id,
    visibility: row.visibility,
    title: row.title,
    content: row.content,
    updatedAt: row.updated_at,
  }
}

interface ReadPaginationQuery {
  pageSize: number
  claims: AuthorizedReadCursorClaims | null
}

function normalizePageSize(value: number | undefined): number {
  const pageSize = value ?? AUTHORIZED_READ_PAGE_SIZE_DEFAULT
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > AUTHORIZED_READ_PAGE_SIZE_MAX) {
    throw new Error("Synthetic read page size refused")
  }
  return pageSize
}

function buildAuthorizedDocumentsQuery(pagination?: ReadPaginationQuery): { sql: string; paramsSuffix: unknown[] } {
  if (!pagination) return { sql: `${AUTHORIZED_DOCUMENTS_SQL}${AUTHORIZED_DOCUMENTS_ORDER_SQL}`, paramsSuffix: [] }
  const { pageSize, claims } = pagination
  const suffix = claims
    ? ` AND (document.updated_at < $5::timestamptz
        OR (document.updated_at = $5::timestamptz
          AND (document.id COLLATE "C") > ($6::text COLLATE "C")))
        ${AUTHORIZED_DOCUMENTS_ORDER_SQL} LIMIT $7`
    : `${AUTHORIZED_DOCUMENTS_ORDER_SQL} LIMIT $5`
  return {
    sql: `${AUTHORIZED_DOCUMENTS_SQL}${suffix}`,
    paramsSuffix: claims ? [claims.boundary.updatedAt, claims.boundary.id, pageSize + 1] : [pageSize + 1],
  }
}

function compareCanonicalDocumentIds(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
}

function sortDocuments(documents: AuthorizedDocument[]): AuthorizedDocument[] {
  return [...documents].sort((left, right) => {
    const byUpdatedAt = right.updatedAt.getTime() - left.updatedAt.getTime()
    return byUpdatedAt || compareCanonicalDocumentIds(left.id, right.id)
  })
}

function pageDocuments(documents: AuthorizedDocument[], pageSize: number): { documents: AuthorizedDocument[]; hasMore: boolean } {
  const ordered = sortDocuments(documents)
  return { documents: ordered.slice(0, pageSize), hasMore: ordered.length > pageSize }
}

/**
 * Execute the disclosure query inside an already established restricted-role
 * transaction. Exported for hermetic and live-RLS tests; application callers
 * use readAuthorizedDocuments(), which establishes that transaction itself.
 */
export async function readAuthorizedDocumentsInRestrictedTransaction(
  scope: DigitalBrainReadEnvelope,
  query: Queryable["query"],
  pagination?: ReadPaginationQuery,
): Promise<AuthorizedDocument[]> {
  if (!scope || scope[READ_ENVELOPE_BRAND] !== true || !scope.sessionId?.trim() ||
      !["viewer", "curator", "admin"].includes(scope.role) ||
      !Number.isSafeInteger(scope.policyEpoch) || scope.policyEpoch <= 0) return []
  const built = buildAuthorizedDocumentsQuery(pagination)
  const result = await query(built.sql, [
    scope.tenantId,
    scope.workspaceId,
    scope.principalId,
    scope.policyEpoch,
    ...built.paramsSuffix,
  ])

  const documents = result.rows
    .filter(isDocumentRow)
    .filter((row) => canDisclose(row, scope))
    .map(mapDocument)
  return pagination ? pageDocuments(documents, pagination.pageSize).documents : documents
}

async function readAuthorizedDocumentsPageInRestrictedTransaction(
  scope: DigitalBrainReadEnvelope,
  query: Queryable["query"],
  pagination: ReadPaginationQuery,
): Promise<AuthorizedReadPage> {
  if (!scope || scope[READ_ENVELOPE_BRAND] !== true || !scope.sessionId?.trim() ||
      !["viewer", "curator", "admin"].includes(scope.role) ||
      !Number.isSafeInteger(scope.policyEpoch) || scope.policyEpoch <= 0) {
    return { documents: [], nextCursor: null, hasMore: false }
  }
  const built = buildAuthorizedDocumentsQuery(pagination)
  const result = await query(built.sql, [
    scope.tenantId,
    scope.workspaceId,
    scope.principalId,
    scope.policyEpoch,
    ...built.paramsSuffix,
  ])
  const documents = result.rows
    .filter(isDocumentRow)
    .filter((row) => canDisclose(row, scope))
    .map(mapDocument)
  const page = pageDocuments(documents, pagination.pageSize)
  return { documents: page.documents, nextCursor: null, hasMore: page.hasMore }
}

/**
 * Read the current principal's owner-only and approved-department documents.
 *
 * This application entry point always establishes a restricted app-role
 * transaction. SQL authorizes candidates before returning them; the row mapper
 * checks the exact scope and resource policy again before disclosure.
 */
interface AuthorizedReadSnapshot {
  documents: AuthorizedDocument[]
  principal: AuthUser
  policyEpoch: number
  hasMore: boolean
  nextCursor: string | null
}

interface AuthorizedSnapshotOptions {
  cursor?: string
  pageSize?: number
  operation?: AuthorizedReadOperation
  queryHash?: string | null
  keysetDocuments?: boolean
}

async function readAuthorizedSnapshot(
  scope: DigitalBrainReadScope,
  options?: AuthorizedSnapshotOptions,
): Promise<AuthorizedReadSnapshot | null> {
  // Re-read the principal from the server auth provider at the service boundary.
  // Caller-supplied user objects and browser headers cannot issue this envelope.
  const { getDashboardPrincipal } = await import("@/lib/auth/dashboard-principal")
  const principal = await getDashboardPrincipal()
  if (!principal || principal.id !== scope.principalId || principal.groupId !== scope.tenantId ||
      principal.workspaceId !== scope.workspaceId || !principal.sessionId?.trim()) {
    throw new AuthorizedWorkspaceStateError("forbidden", "Synthetic read authority refused")
  }
  const { assertSyntheticTarget, isSyntheticScope, verifySyntheticSession } = await import("./local-confinement")
  let run: string
  try {
    run = assertSyntheticTarget()
  } catch (error) {
    throw new AuthorizedWorkspaceStateError("unavailable", "Synthetic read target unavailable", { cause: error })
  }
  if (!isSyntheticScope(scope)) return null
  const pool = getAppPool()
  // A process-global pool may predate this request's environment; inspect its actual target before connect.
  if (pool.options.host !== "127.0.0.1" || pool.options.port !== 5444 ||
      pool.options.database !== `allura_epic30_read_${run}` || pool.options.user !== "allura_app" || pool.options.options) {
    throw new AuthorizedWorkspaceStateError("unavailable", "Synthetic cached pool target refused")
  }
  const encodedKey = process.env.ALLURA_EPIC30_RECEIPT_KEY ?? ""
  const witnessKey = Buffer.from(encodedKey, "base64url")
  if (witnessKey.length !== 32 || witnessKey.toString("base64url") !== encodedKey) {
    throw new AuthorizedWorkspaceStateError("unavailable", "Synthetic read receipt key refused")
  }
  const pageSize = options ? normalizePageSize(options.pageSize) : AUTHORIZED_READ_PAGE_SIZE_DEFAULT
  const operation = options?.operation ?? "read_documents"
  const cursorClaims = options && options.cursor !== undefined
    ? decodeAuthorizedReadCursor(options.cursor, witnessKey)
    : null
  if (options && operation === "search_documents" && !options.queryHash) {
    throw new Error("Synthetic search cursor authority refused")
  }
  const pagination = options && options.keysetDocuments
    ? { pageSize, claims: cursorClaims }
    : undefined
  async function readCurrent(currentPrincipal: AuthUser) {
    return withTenantTransaction(scope, async (client) => {
      await verifySyntheticSession(client.query.bind(client), run)
      const membership = await client.query(CURRENT_WORKSPACE_AUTHORITY_SQL, [
        scope.tenantId, scope.workspaceId, scope.principalId,
      ])
      if (membership.rows.length !== 1) return null
      let envelope: DigitalBrainReadEnvelope
      try {
        envelope = issueReadEnvelope(scope, currentPrincipal, membership.rows[0])
      } catch (error) {
        throw new AuthorizedWorkspaceStateError("forbidden", "Synthetic read authority refused", { cause: error })
      }
      if (cursorClaims) {
        assertAuthorizedReadCursorMatches(cursorClaims, {
          scope,
          sessionId: currentPrincipal.sessionId!,
          witnessKey,
          actorRole: envelope.role,
          policyEpoch: envelope.policyEpoch,
          operation,
          pageSize,
          queryHash: options?.queryHash,
        })
      }
      const documents = pagination
        ? await readAuthorizedDocumentsPageInRestrictedTransaction(envelope, client.query.bind(client), pagination)
        : { documents: await readAuthorizedDocumentsInRestrictedTransaction(envelope, client.query.bind(client)), nextCursor: null, hasMore: false }
      return { documents: documents.documents, hasMore: documents.hasMore, policyEpoch: envelope.policyEpoch, actorRole: envelope.role }
    }, pool)
  }
  const candidate = await readCurrent(principal)
  if (!candidate) return null
  const receipt = await persistAuthorizedReadReceipt({
    scope, sessionId: principal.sessionId, actorRole: candidate.actorRole, policyEpoch: candidate.policyEpoch,
    documents: candidate.documents, witnessKey, priorWitnessHash: cursorClaims?.witnessHash,
  }, { persist: persistSyntheticReadReceipt })
  // Receipt is committed before the second restricted read. Any concurrent
  // revocation or document change denies instead of disclosing stale candidates.
  const refreshedPrincipal = await getDashboardPrincipal()
  if (!refreshedPrincipal || refreshedPrincipal.id !== principal.id ||
      refreshedPrincipal.groupId !== principal.groupId || refreshedPrincipal.workspaceId !== principal.workspaceId ||
      refreshedPrincipal.sessionId !== principal.sessionId || refreshedPrincipal.role !== principal.role) {
    throw new AuthorizedWorkspaceStateError("conflict", "Synthetic read authority changed")
  }
  const current = await readCurrent(refreshedPrincipal)
  if (!current || current.policyEpoch !== candidate.policyEpoch || current.actorRole !== candidate.actorRole ||
      createAuthorizedReadReceipt({
        scope, sessionId: refreshedPrincipal.sessionId, actorRole: current.actorRole, policyEpoch: current.policyEpoch,
        documents: current.documents, witnessKey, priorWitnessHash: cursorClaims?.witnessHash, receiptId: receipt.receiptId,
        occurredAt: new Date(receipt.occurredAt),
      }).witnessHash !== receipt.witnessHash) {
    throw new AuthorizedWorkspaceStateError("conflict", "Synthetic read authority changed")
  }
  const nextCursor = current.hasMore && current.documents.length > 0
    ? createAuthorizedReadCursor({
      scope,
      sessionId: refreshedPrincipal.sessionId!,
      actorRole: current.actorRole,
      policyEpoch: current.policyEpoch,
      operation,
      pageSize,
      boundary: {
        updatedAt: current.documents[current.documents.length - 1].updatedAt.toISOString(),
        id: current.documents[current.documents.length - 1].id,
      },
      witnessHash: receipt.witnessHash,
      witnessKey,
      queryHash: options?.queryHash,
    })
    : null
  return { documents: current.documents, principal: refreshedPrincipal, policyEpoch: current.policyEpoch,
    hasMore: current.hasMore, nextCursor }
}

export function readAuthorizedDocuments(scope: DigitalBrainReadScope): Promise<AuthorizedDocument[]>
export function readAuthorizedDocuments(scope: DigitalBrainReadScope, options: AuthorizedReadPageOptions): Promise<AuthorizedReadPage>
export async function readAuthorizedDocuments(
  scope: DigitalBrainReadScope,
  options?: AuthorizedReadPageOptions,
): Promise<AuthorizedDocument[] | AuthorizedReadPage> {
  if (options !== undefined) return readAuthorizedDocumentsPage(scope, options)
  return (await readAuthorizedSnapshot(scope))?.documents ?? []
}

/**
 * Content-free server boundary for the My Work shell. Known authority and
 * fixture failures are classified without exposing their cause; unexpected
 * database or receipt failures fail closed as a degraded dependency.
 */
export async function readAuthorizedWorkspaceState(
  scope: DigitalBrainReadScope,
): Promise<AuthorizedWorkspaceReadResult> {
  try {
    const snapshot = await readAuthorizedSnapshot(scope)
    if (!snapshot) return { state: "forbidden", documents: [] }
    return {
      state: snapshot.documents.length === 0 ? "empty" : "complete",
      documents: snapshot.documents,
    }
  } catch (error) {
    if (error instanceof AuthorizedWorkspaceStateError) {
      return { state: error.state, documents: [] }
    }
    return { state: "degraded", documents: [] }
  }
}

export async function readAuthorizedDocumentsPage(
  scope: DigitalBrainReadScope,
  options: AuthorizedReadPageOptions = {},
): Promise<AuthorizedReadPage> {
  const snapshot = await readAuthorizedSnapshot(scope, {
    cursor: options.cursor,
    pageSize: options.pageSize,
    operation: "read_documents",
    keysetDocuments: true,
  })
  return snapshot
    ? { documents: snapshot.documents, nextCursor: snapshot.nextCursor, hasMore: snapshot.hasMore }
    : { documents: [], nextCursor: null, hasMore: false }
}

export interface AuthorizedSearchHit {
  documentId: string
  title: string
  snippet: string
  updatedAt: Date
}

function normalizeSearchQuery(query: string): string {
  if (typeof query !== "string") throw new Error("Synthetic search query refused")
  const normalized = query.trim().toLocaleLowerCase("en-US")
  if (normalized.length < 2 || normalized.length > 120 || /[\x00-\x1f\x7f]/.test(normalized)) {
    throw new Error("Synthetic search query refused")
  }
  return normalized
}

function searchDocuments(documents: readonly AuthorizedDocument[], query: string) {
  const matches = sortDocuments(documents.filter((document) =>
    document.title.toLocaleLowerCase("en-US").includes(query) ||
    document.content.toLocaleLowerCase("en-US").includes(query)))
  const hits: AuthorizedSearchHit[] = matches.map((document) => {
    const titleMatches = document.title.toLocaleLowerCase("en-US").includes(query)
    const index = document.content.toLocaleLowerCase("en-US").indexOf(query)
    const start = index < 0 ? 0 : Math.max(0, index - 60)
    return {
      documentId: document.id,
      title: document.title,
      snippet: titleMatches && index < 0 ? "" : document.content.slice(start, start + 160),
      updatedAt: document.updatedAt,
    }
  })
  return { matches, hits }
}

function afterCursor(document: AuthorizedDocument, claims: AuthorizedReadCursorClaims | null): boolean {
  if (!claims) return true
  const boundaryTime = new Date(claims.boundary.updatedAt).getTime()
  const updatedTime = document.updatedAt.getTime()
  return updatedTime < boundaryTime ||
    (updatedTime === boundaryTime && compareCanonicalDocumentIds(document.id, claims.boundary.id) > 0)
}

/** Synthetic-only receipt-bound search page; production search remains quarantined. */
export async function searchAuthorizedDocumentsPage(
  scope: DigitalBrainReadScope,
  rawQuery: string,
  options: AuthorizedReadPageOptions = {},
): Promise<AuthorizedSearchPage> {
  const query = normalizeSearchQuery(rawQuery)
  const pageSize = normalizePageSize(options.pageSize)
  const encodedKey = process.env.ALLURA_EPIC30_RECEIPT_KEY ?? ""
  const witnessKey = Buffer.from(encodedKey, "base64url")
  if (witnessKey.length !== 32 || witnessKey.toString("base64url") !== encodedKey) {
    throw new Error("Synthetic search receipt key refused")
  }
  const queryHash = hashAuthorizedSearchQuery(witnessKey, query)
  const cursorClaims = options.cursor !== undefined ? decodeAuthorizedReadCursor(options.cursor, witnessKey) : null
  if (cursorClaims && (cursorClaims.operation !== "search_documents" || cursorClaims.queryHash !== queryHash)) {
    throw new Error("Synthetic search cursor authority refused")
  }
  const snapshotOptions: AuthorizedSnapshotOptions = {
    cursor: options.cursor,
    pageSize,
    operation: "search_documents",
    queryHash,
    keysetDocuments: false,
  }
  const candidate = await readAuthorizedSnapshot(scope, snapshotOptions)
  if (!candidate) return { total: 0, hits: [], nextCursor: null, hasMore: false }
  const candidateResults = searchDocuments(candidate.documents.filter((document) => afterCursor(document, cursorClaims)), query)
  const candidatePage = pageDocuments(candidateResults.matches, pageSize)
  const receipt = await persistAuthorizedReadReceipt({
    scope, sessionId: candidate.principal.sessionId!, actorRole: candidate.principal.role,
    policyEpoch: candidate.policyEpoch, documents: candidatePage.documents, witnessKey, searchQuery: query,
    priorWitnessHash: cursorClaims?.witnessHash,
  }, { persist: persistSyntheticReadReceipt })
  const current = await readAuthorizedSnapshot(scope, snapshotOptions)
  if (!current || current.principal.sessionId !== candidate.principal.sessionId ||
      current.principal.role !== candidate.principal.role || current.policyEpoch !== candidate.policyEpoch) {
    throw new Error("Synthetic search authority changed")
  }
  const currentResults = searchDocuments(current.documents.filter((document) => afterCursor(document, cursorClaims)), query)
  const currentAllResults = searchDocuments(current.documents, query)
  const currentPage = pageDocuments(currentResults.matches, pageSize)
  const currentWitness = createAuthorizedReadReceipt({
    scope, sessionId: current.principal.sessionId!, actorRole: current.principal.role,
    policyEpoch: current.policyEpoch, documents: currentPage.documents, witnessKey,
    priorWitnessHash: cursorClaims?.witnessHash, searchQuery: query,
    receiptId: receipt.receiptId, occurredAt: new Date(receipt.occurredAt),
  })
  if (currentWitness.witnessHash !== receipt.witnessHash || currentWitness.queryHash !== receipt.queryHash) {
    throw new Error("Synthetic search authority changed")
  }
  const nextCursor = currentPage.hasMore && currentPage.documents.length > 0
    ? createAuthorizedReadCursor({
      scope,
      sessionId: current.principal.sessionId!,
      actorRole: current.principal.role,
      policyEpoch: current.policyEpoch,
      operation: "search_documents",
      pageSize,
      boundary: {
        updatedAt: currentPage.documents[currentPage.documents.length - 1].updatedAt.toISOString(),
        id: currentPage.documents[currentPage.documents.length - 1].id,
      },
      witnessHash: receipt.witnessHash,
      witnessKey,
      queryHash,
    })
    : null
  return {
    total: currentAllResults.hits.length,
    hits: currentResults.hits.slice(0, pageSize),
    nextCursor,
    hasMore: currentPage.hasMore,
  }
}

/** Synthetic-only search candidate; not a production API or policy approval. */
export function searchAuthorizedDocuments(scope: DigitalBrainReadScope, rawQuery: string): Promise<{ total: number; hits: AuthorizedSearchHit[] }>
export function searchAuthorizedDocuments(scope: DigitalBrainReadScope, rawQuery: string, options: AuthorizedReadPageOptions): Promise<AuthorizedSearchPage>
export async function searchAuthorizedDocuments(
  scope: DigitalBrainReadScope,
  rawQuery: string,
  options?: AuthorizedReadPageOptions,
): Promise<{ total: number; hits: AuthorizedSearchHit[] } | AuthorizedSearchPage> {
  if (options !== undefined) return searchAuthorizedDocumentsPage(scope, rawQuery, options)
  const query = normalizeSearchQuery(rawQuery)
  const candidate = await readAuthorizedSnapshot(scope)
  if (!candidate) return { total: 0, hits: [] }
  const encodedKey = process.env.ALLURA_EPIC30_RECEIPT_KEY ?? ""
  const witnessKey = Buffer.from(encodedKey, "base64url")
  if (witnessKey.length !== 32 || witnessKey.toString("base64url") !== encodedKey) {
    throw new Error("Synthetic search receipt key refused")
  }
  const candidateResults = searchDocuments(candidate.documents, query)
  const receipt = await persistAuthorizedReadReceipt({
    scope, sessionId: candidate.principal.sessionId!, actorRole: candidate.principal.role,
    policyEpoch: candidate.policyEpoch, documents: candidateResults.matches, witnessKey,
    searchQuery: query,
  }, { persist: persistSyntheticReadReceipt })
  const current = await readAuthorizedSnapshot(scope)
  if (!current || current.principal.sessionId !== candidate.principal.sessionId ||
      current.principal.role !== candidate.principal.role || current.policyEpoch !== candidate.policyEpoch) {
    throw new Error("Synthetic search authority changed")
  }
  const currentResults = searchDocuments(current.documents, query)
  const currentWitness = createAuthorizedReadReceipt({
    scope, sessionId: current.principal.sessionId!, actorRole: current.principal.role,
    policyEpoch: current.policyEpoch, documents: currentResults.matches, witnessKey,
    searchQuery: query, receiptId: receipt.receiptId, occurredAt: new Date(receipt.occurredAt),
  })
  if (currentWitness.witnessHash !== receipt.witnessHash || currentWitness.queryHash !== receipt.queryHash) {
    throw new Error("Synthetic search authority changed")
  }
  return { total: currentResults.hits.length, hits: currentResults.hits }
}

/** Test-only issuer; absent from development and production runtimes. */
export const epic30ReadTestOnly = process.env.NODE_ENV === "test"
  ? Object.freeze({ issueReadEnvelope })
  : null
