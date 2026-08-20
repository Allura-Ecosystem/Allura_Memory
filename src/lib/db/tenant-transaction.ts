import { getPool } from "@/lib/postgres/connection";

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

  const resolvedPool = pool ?? getPool();
  const client = await resolvedPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.current_group_id = '${context.tenantId.replace(/'/g, "''")}'`);
    // Migration 08 already uses app.current_group_id; set app.current_tenant as an alias for forward compatibility.
    await client.query(`SET LOCAL app.current_tenant = '${context.tenantId.replace(/'/g, "''")}'`);
    await client.query(`SET LOCAL app.current_principal = '${context.principalId.replace(/'/g, "''")}'`);
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
