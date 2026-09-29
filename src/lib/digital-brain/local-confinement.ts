import type { DigitalBrainReadScope } from "./read-service"

export function assertSyntheticTarget(env: NodeJS.ProcessEnv = process.env): string {
  const run = env.ALLURA_EPIC30_RUN_ID ?? ""
  if (env.NODE_ENV === "production" || env.ALLURA_EPIC30_LOCAL_DB !== "enabled" ||
      env.POSTGRES_HOST !== "127.0.0.1" || env.POSTGRES_PORT !== "5444" ||
      !/^[a-f0-9]{32}$/.test(run) || env.POSTGRES_DB !== `allura_epic30_read_${run}` ||
      env.POSTGRES_APP_USER !== "allura_app" || !!env.POSTGRES_APP_OPTIONS) {
    throw new Error("Synthetic database target refused")
  }
  return run
}

export function isSyntheticScope(scope: DigitalBrainReadScope): boolean {
  return scope.tenantId === "allura-epic30-local" && scope.workspaceId === "epic30-local-workspace" &&
    ["owner-user", "other-user", "admin-user", "department-user", "finance-user", "contractor-user", "revoked-user"].includes(scope.principalId)
}

/** Invoker identity is inspected OUTSIDE the definer's dataset check. */
export async function verifySyntheticSession(query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>, run: string): Promise<void> {
  const result = await query(`SELECT current_user, session_user,
    NOT rolsuper AND NOT rolbypassrls AS restricted,
    row_security_active('public.brain_documents')
      AND row_security_active('public.brain_workspace_memberships')
      AND row_security_active('public.brain_department_memberships') AS rls,
    current_database() = $1 AS database_ok,
    epic30_local.verify_dataset($2) AS dataset_ok
    FROM pg_catalog.pg_roles WHERE rolname = current_user`, [`allura_epic30_read_${run}`, run])
  const row = result.rows[0] as Record<string, unknown> | undefined
  if (result.rows.length !== 1 || row?.current_user !== "allura_app" || row.session_user !== "allura_app" ||
      row.restricted !== true || row.rls !== true || row.database_ok !== true || row.dataset_ok !== true) {
    throw new Error("Synthetic database session or dataset refused")
  }
}
