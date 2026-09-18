import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { getAppPool } from "@/lib/postgres/connection"

export interface DigitalBrainReadScope {
  tenantId: string
  workspaceId: string
  principalId: string
  /** Administrative roles never widen content authority. */
  roles?: readonly string[]
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
  scope: DigitalBrainReadScope,
  query: Queryable["query"],
  authorizedDepartmentIds?: ReadonlySet<string>,
): Promise<AuthorizedDocument[]> {
  const result = await query(AUTHORIZED_DOCUMENTS_SQL, [
    scope.tenantId,
    scope.workspaceId,
    scope.principalId,
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
  const { assertSyntheticTarget, isSyntheticScope, verifySyntheticSession } = await import("./local-confinement")
  const run = assertSyntheticTarget()
  if (!isSyntheticScope(scope)) return []
  const pool = getAppPool()
  // A process-global pool may predate this request's environment; inspect its actual target before connect.
  if (pool.options.host !== "127.0.0.1" || pool.options.port !== 5444 ||
      pool.options.database !== `allura_epic30_read_${run}` || pool.options.user !== "allura_app" || pool.options.options) {
    throw new Error("Synthetic cached pool target refused")
  }
  return withTenantTransaction(scope, async (client) => {
    await verifySyntheticSession(client.query.bind(client), run)
    return readAuthorizedDocumentsInRestrictedTransaction(scope, client.query.bind(client))
  }, pool)
}
