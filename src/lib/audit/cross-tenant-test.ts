/**
 * Cross-tenant audit entry points.
 *
 * Synthetic writes require one verified workspace-bound principal per tenant.
 * This helper has no such authority, so it deliberately remains unavailable
 * rather than fabricating scope tuples for canonical memory_add.
 */

export interface CrossTenantAuditResult {
  tenants_tested: number;
  queries_per_pair: number;
  total_queries: number;
  leaks_found: number;
  status: "pass" | "fail";
  leak_details: CrossTenantLeakDetail[];
  timestamp: string;
  cleanup_succeeded: boolean;
}

export interface CrossTenantLeakDetail {
  source_tenant: string;
  target_tenant: string;
  query: string;
  leaked_count: number;
}

export interface CrossTenantAuditOptions {
  tenantCount?: number;
  memoriesPerTenant?: number;
  queriesPerPair?: number;
}

const FAIL_CLOSED_MESSAGE = "cross-tenant audit memory seeding requires verified workspace principals and is unavailable to direct helpers";

export class CrossTenantAuditUnavailableError extends Error {
  readonly statusCode = 503;
  constructor() {
    super(FAIL_CLOSED_MESSAGE);
    this.name = "CrossTenantAuditUnavailableError";
  }
}

export async function runCrossTenantAudit(_options?: CrossTenantAuditOptions): Promise<CrossTenantAuditResult> {
  throw new CrossTenantAuditUnavailableError();
}

export async function runCrossTenantAuditWithCleanup(_options?: CrossTenantAuditOptions): Promise<CrossTenantAuditResult> {
  throw new CrossTenantAuditUnavailableError();
}

export function getLastCleanupSucceeded(): boolean {
  return false;
}
