import { getAppPool, getPool } from "@/lib/postgres/connection";
import type { ResolvedWorkspaceScope } from "./workspace-scope";

/**
 * Transaction-local principal and tenant context for PostgreSQL RLS.
 *
 * Every tenant-aware query must run inside one of these helpers so that
 * `app.current_tenant()` and `app.current_principal()` are set in the database
 * session before the operation. The helpers reset the settings when the
 * transaction completes so pooled connections cannot leak context.
 */

export interface TenantContext {
  tenantId: string;
  principalId: string;
  /** Optional for legacy group-scoped tables; required by workspace-scoped tables. */
  workspaceId?: string;
}

function validateTenantId(tenantId: string): void {
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("tenantId is required and must be a non-empty string");
  }
  if (!/^allura-[a-z0-9_-]+$/.test(tenantId)) {
    throw new Error(`tenantId must match the allura-* convention; got "${tenantId}"`);
  }
}

function validatePrincipalId(principalId: string): void {
  if (!principalId || typeof principalId !== "string") {
    throw new Error("principalId is required and must be a non-empty string");
  }
}

function validateWorkspaceId(workspaceId: string): void {
  if (!workspaceId || typeof workspaceId !== "string") {
    throw new Error("workspaceId is required and must be a non-empty string");
  }
}

/**
 * Run a callback inside a database transaction that has tenant/principal context
 * set. The context is reset (back to empty) when the client is released.
 */
export async function withTenantTransaction<T>(
  context: TenantContext,
  callback: (client: import("pg").PoolClient) => Promise<T>,
  pool?: import("pg").Pool,
): Promise<T> {
  validateTenantId(context.tenantId);
  validatePrincipalId(context.principalId);
  if (context.workspaceId !== undefined) {
    validateWorkspaceId(context.workspaceId);
  }

  const resolvedPool = pool ?? getPool();
  const client = await resolvedPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.current_group_id = '${context.tenantId.replace(/'/g, "''")}'`);
    // Migration 08 already uses app.current_group_id; set app.current_tenant as an alias for forward compatibility.
    await client.query(`SET LOCAL app.current_tenant = '${context.tenantId.replace(/'/g, "''")}'`);
    await client.query(`SET LOCAL app.current_principal = '${context.principalId.replace(/'/g, "''")}'`);
    if (context.workspaceId !== undefined) {
      await client.query(`SET LOCAL app.current_workspace_id = '${context.workspaceId.replace(/'/g, "''")}'`);
    }
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    // Reset tenant context before returning the client to the pool.
    await client.query("SET LOCAL app.current_group_id = ''").catch(() => undefined);
    await client.query("SET LOCAL app.current_tenant = ''").catch(() => undefined);
    await client.query("SET LOCAL app.current_principal = ''").catch(() => undefined);
    await client.query("SET LOCAL app.current_workspace_id = ''").catch(() => undefined);
    client.release();
  }
}

export async function withWorkspaceTransaction<T>(
  scope: ResolvedWorkspaceScope,
  callback: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  // Production workspace operations always use the managed restricted app role.
  return withTenantTransaction(
    { tenantId: scope.tenantId, workspaceId: scope.workspaceId, principalId: scope.principalId },
    callback,
    getAppPool(),
  );
}

/**
 * Execute an authorized graph read on the restricted application pool.
 *
 * The isolation and read-only attributes are declared on BEGIN so PostgreSQL
 * applies them before any statement can observe data. Transaction-local scope
 * is set with parameterized set_config calls; no authority value is interpolated
 * into SQL and pooled sessions cannot retain it after COMMIT/ROLLBACK.
 */
export async function withRestrictedWorkspaceReadTransaction<T>(
  scope: ResolvedWorkspaceScope,
  callback: (client: import("pg").PoolClient) => Promise<T>,
  pool: import("pg").Pool = getAppPool(),
): Promise<T> {
  validateTenantId(scope.tenantId);
  validateWorkspaceId(scope.workspaceId);
  validatePrincipalId(scope.principalId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query(
      `SELECT set_config('app.current_group_id', $1, true),
              set_config('app.current_tenant', $1, true),
              set_config('app.current_workspace_id', $2, true),
              set_config('app.current_principal', $3, true)`,
      [scope.tenantId, scope.workspaceId, scope.principalId],
    );
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Convenience helper for a single query inside a tenant context.
 */
export async function tenantQuery<T extends import("pg").QueryResultRow = import("pg").QueryResultRow>(
  context: TenantContext,
  sql: string,
  values?: unknown[],
  pool?: import("pg").Pool,
): Promise<import("pg").QueryResult<T>> {
  return withTenantTransaction(context, (client) => client.query<T>(sql, values), pool);
}
