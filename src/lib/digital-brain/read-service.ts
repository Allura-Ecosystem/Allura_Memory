import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { getAppPool } from "@/lib/postgres/connection"
import type { AuthUser } from "@/lib/auth/types"
import { createAuthorizedReadReceipt, persistAuthorizedReadReceipt } from "./read-receipt"
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
  ORDER BY document.updated_at DESC, document.id
`

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
  authorizedDepartmentIds?: ReadonlySet<string>,
): boolean {
  if (row.group_id !== scope.tenantId || row.workspace_id !== scope.workspaceId) return false
  if (row.authorized_tenant !== true) return false
  if (row.authorized_workspace !== true) return false
  if (row.visibility === "private") return row.owner_id === scope.principalId
  if (!row.department_id) return false

  return authorizedDepartmentIds
    ? authorizedDepartmentIds.has(row.department_id)
    : row.authorized_department === true
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

/**
 * Execute the disclosure query inside an already established restricted-role
 * transaction. Exported for hermetic and live-RLS tests; application callers
 * use readAuthorizedDocuments(), which establishes that transaction itself.
 */
export async function readAuthorizedDocumentsInRestrictedTransaction(
  scope: DigitalBrainReadEnvelope,
  query: Queryable["query"],
  authorizedDepartmentIds?: ReadonlySet<string>,
): Promise<AuthorizedDocument[]> {
  if (!scope || scope[READ_ENVELOPE_BRAND] !== true || !scope.sessionId?.trim() ||
      !["viewer", "curator", "admin"].includes(scope.role) ||
      !Number.isSafeInteger(scope.policyEpoch) || scope.policyEpoch <= 0) return []
  const result = await query(AUTHORIZED_DOCUMENTS_SQL, [
    scope.tenantId,
    scope.workspaceId,
    scope.principalId,
    scope.policyEpoch,
  ])

  return result.rows
    .filter(isDocumentRow)
    .filter((row) => canDisclose(row, scope, authorizedDepartmentIds))
    .map(mapDocument)
}

/**
 * Read the current principal's owner-only and approved-department documents.
 *
 * This application entry point always establishes a restricted app-role
 * transaction. SQL authorizes candidates before returning them; the row mapper
 * checks the exact scope and resource policy again before disclosure.
 */
export async function readAuthorizedDocuments(
  scope: DigitalBrainReadScope,
): Promise<AuthorizedDocument[]> {
  // Re-read the principal from the server auth provider at the service boundary.
  // Caller-supplied user objects and browser headers cannot issue this envelope.
  const { getDashboardPrincipal } = await import("@/lib/auth/dashboard-principal")
  const principal = await getDashboardPrincipal()
  if (!principal || principal.id !== scope.principalId || principal.groupId !== scope.tenantId ||
      principal.workspaceId !== scope.workspaceId || !principal.sessionId?.trim()) {
    throw new Error("Synthetic read authority refused")
  }
  const { assertSyntheticTarget, isSyntheticScope, verifySyntheticSession } = await import("./local-confinement")
  const run = assertSyntheticTarget()
  if (!isSyntheticScope(scope)) return []
  const pool = getAppPool()
  // A process-global pool may predate this request's environment; inspect its actual target before connect.
  if (pool.options.host !== "127.0.0.1" || pool.options.port !== 5444 ||
      pool.options.database !== `allura_epic30_read_${run}` || pool.options.user !== "allura_app" || pool.options.options) {
    throw new Error("Synthetic cached pool target refused")
  }
  const encodedKey = process.env.ALLURA_EPIC30_RECEIPT_KEY ?? ""
  const witnessKey = Buffer.from(encodedKey, "base64url")
  if (witnessKey.length !== 32 || witnessKey.toString("base64url") !== encodedKey) {
    throw new Error("Synthetic read receipt key refused")
  }
  async function readCurrent(currentPrincipal: AuthUser) {
    return withTenantTransaction(scope, async (client) => {
      await verifySyntheticSession(client.query.bind(client), run)
      const membership = await client.query(CURRENT_WORKSPACE_AUTHORITY_SQL, [
        scope.tenantId, scope.workspaceId, scope.principalId,
      ])
      if (membership.rows.length !== 1) return null
      const envelope = issueReadEnvelope(scope, currentPrincipal, membership.rows[0])
      const documents = await readAuthorizedDocumentsInRestrictedTransaction(envelope, client.query.bind(client))
      return { documents, policyEpoch: envelope.policyEpoch, actorRole: envelope.role }
    }, pool)
  }
  const candidate = await readCurrent(principal)
  if (!candidate) return []
  const receipt = await persistAuthorizedReadReceipt({
    scope, sessionId: principal.sessionId, actorRole: candidate.actorRole, policyEpoch: candidate.policyEpoch,
    documents: candidate.documents, witnessKey,
  }, { persist: persistSyntheticReadReceipt })
  // Receipt is committed before the second restricted read. Any concurrent
  // revocation or document change denies instead of disclosing stale candidates.
  const refreshedPrincipal = await getDashboardPrincipal()
  if (!refreshedPrincipal || refreshedPrincipal.id !== principal.id ||
      refreshedPrincipal.groupId !== principal.groupId || refreshedPrincipal.workspaceId !== principal.workspaceId ||
      refreshedPrincipal.sessionId !== principal.sessionId || refreshedPrincipal.role !== principal.role) {
    throw new Error("Synthetic read authority changed")
  }
  const current = await readCurrent(refreshedPrincipal)
  if (!current || current.policyEpoch !== candidate.policyEpoch || current.actorRole !== candidate.actorRole ||
      createAuthorizedReadReceipt({
        scope, sessionId: refreshedPrincipal.sessionId, actorRole: current.actorRole, policyEpoch: current.policyEpoch,
        documents: current.documents, witnessKey, receiptId: receipt.receiptId,
        occurredAt: new Date(receipt.occurredAt),
      }).witnessHash !== receipt.witnessHash) {
    throw new Error("Synthetic read authority changed")
  }
  return current.documents
}

/** Test-only issuer; absent from development and production runtimes. */
export const epic30ReadTestOnly = process.env.NODE_ENV === "test"
  ? Object.freeze({ issueReadEnvelope })
  : null
