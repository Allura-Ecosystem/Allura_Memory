/**
 * Cross-Tenant Audit Test Engine — Story 22.6
 *
 * Creates synthetic tenants, seeds memories, runs cross-tenant queries,
 * verifies zero leakage, and cleans up.
 *
 * This is the test engine called by the /api/audit/cross-tenant endpoint.
 * It's also unit-tested directly in cross-tenant-audit.test.ts.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("server-side only");
}

import { getPool } from "@/lib/postgres/connection";
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id";
import { memory_search, memory_add } from "@/mcp/canonical-tools";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrossTenantAuditResult {
  /** Number of synthetic tenants created */
  tenants_tested: number;
  /** Queries run per tenant pair */
  queries_per_pair: number;
  /** Total cross-tenant queries executed */
  total_queries: number;
  /** Number of leaks found (should always be 0) */
  leaks_found: number;
  /** "pass" if no leaks, "fail" otherwise */
  status: "pass" | "fail";
  /** Details about any leaks found */
  leak_details: CrossTenantLeakDetail[];
  /** Timestamp */
  timestamp: string;
  /** Cleanup succeeded */
  cleanup_succeeded: boolean;
}

export interface CrossTenantLeakDetail {
  /** Source tenant (the querying tenant) */
  source_tenant: string;
  /** Target tenant (the tenant whose data leaked) */
  target_tenant: string;
  /** The query that caused the leak */
  query: string;
  /** Number of results that leaked */
  leaked_count: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SYNTHETIC_TENANT_COUNT = 5;
const MEMORIES_PER_TENANT = 10;
const QUERIES_PER_PAIR = 100;
const SYNTHETIC_PREFIX = "allura-audit-synth-";

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateSyntheticGroupId(index: number): string {
  return `${SYNTHETIC_PREFIX}${index}`;
}

function generateUniqueContent(tenantIndex: number, memIndex: number): string {
  return `Synthetic memory for tenant ${tenantIndex} item ${memIndex} — unique token: audit-${tenantIndex}-${memIndex}-${Date.now()}`;
}

// ── Main Audit Function ───────────────────────────────────────────────────────

/**
 * Run a cross-tenant audit.
 *
 * Steps:
 * 1. Create N synthetic tenants in the tenants table
 * 2. Seed M memories per tenant via memory_add
 * 3. For each tenant pair, run Q queries via memory_search from tenant A
 *    and verify no results from tenant B appear
 * 4. Clean up: delete synthetic tenants and their memories
 * 5. Return the audit result
 *
 * @param options - Optional overrides for testing
 * @returns CrossTenantAuditResult
 */
export async function runCrossTenantAudit(options?: {
  tenantCount?: number;
  memoriesPerTenant?: number;
  queriesPerPair?: number;
}): Promise<CrossTenantAuditResult> {
  const tenantCount = options?.tenantCount ?? SYNTHETIC_TENANT_COUNT;
  const memoriesPerTenant = options?.memoriesPerTenant ?? MEMORIES_PER_TENANT;
  const queriesPerPair = options?.queriesPerPair ?? QUERIES_PER_PAIR;

  const pool = getPool();
  const tenantIds: string[] = [];
  const leakDetails: CrossTenantLeakDetail[] = [];

  try {
    // ── Step 1: Create synthetic tenants ──────────────────────────────────

    for (let i = 0; i < tenantCount; i++) {
      const groupId = generateSyntheticGroupId(i);
      validateGroupId(groupId);
      tenantIds.push(groupId);

      await pool.query(
        `INSERT INTO tenants (group_id, name, description, owner_agent_id, config)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (group_id) DO NOTHING`,
        [
          groupId,
          `Audit Tenant ${i}`,
          `Synthetic tenant for cross-tenant audit`,
          "audit-system",
          JSON.stringify({}),
        ]
      );
    }

    // ── Step 2: Seed memories per tenant ──────────────────────────────────

    for (let t = 0; t < tenantCount; t++) {
      const groupId = tenantIds[t]!;
      for (let m = 0; m < memoriesPerTenant; m++) {
        const content = generateUniqueContent(t, m);
        await memory_add({
          group_id: groupId as any,
          user_id: "audit-agent",
          content,
          metadata: {
            source: "manual",
            audit_synthetic: true,
            tenant_index: t,
            memory_index: m,
          },
        });
      }
    }

    // ── Step 3: Run cross-tenant queries ──────────────────────────────────

    let totalQueries = 0;

    for (let sourceIdx = 0; sourceIdx < tenantCount; sourceIdx++) {
      for (let targetIdx = 0; targetIdx < tenantCount; targetIdx++) {
        if (sourceIdx === targetIdx) continue; // skip same-tenant

        const sourceTenant = tenantIds[sourceIdx]!;
        const targetTenant = tenantIds[targetIdx]!;

        // Run Q queries from source tenant, looking for target tenant's data
        for (let q = 0; q < queriesPerPair; q++) {
          // Query for the target tenant's unique token
          const query = `audit-${targetIdx}-${q % memoriesPerTenant}`;
          const searchResponse = await memory_search({
            query,
            group_id: sourceTenant as any,
            limit: 10,
            status: "all",
          });

          totalQueries++;

          // Check if any results contain the target tenant's unique token
          const leakedResults = (searchResponse.results ?? []).filter(
            (r) => r.content.includes(`audit-${targetIdx}-`)
          );

          if (leakedResults.length > 0) {
            leakDetails.push({
              source_tenant: sourceTenant,
              target_tenant: targetTenant,
              query,
              leaked_count: leakedResults.length,
            });
          }
        }
      }
    }

    return {
      tenants_tested: tenantCount,
      queries_per_pair: queriesPerPair,
      total_queries: totalQueries,
      leaks_found: leakDetails.length,
      status: leakDetails.length === 0 ? "pass" : "fail",
      leak_details: leakDetails,
      timestamp: new Date().toISOString(),
      cleanup_succeeded: false, // set after cleanup
    };
  } finally {
    // ── Step 4: Cleanup ───────────────────────────────────────────────────

    let cleanupSucceeded = true;
    for (const groupId of tenantIds) {
      try {
        // Delete memories for this synthetic tenant
        await pool.query(
          "DELETE FROM memory_events WHERE group_id = $1",
          [groupId]
        );
        // Delete the synthetic tenant
        await pool.query(
          "DELETE FROM tenants WHERE group_id = $1",
          [groupId]
        );
      } catch {
        cleanupSucceeded = false;
      }
    }

    // We need to update the result with cleanup status, but since we're in
    // finally, we re-throw or reconstruct. In practice, the caller (route)
    // handles this by catching and re-running cleanup if needed.
    // For the returned result, we patch it here:
    // This is handled by the route which wraps this function.
    void cleanupSucceeded; // referenced to avoid unused warning
  }

  // Unreachable — finally always runs, but TS needs a return
  throw new Error("unreachable");
}

/**
 * Run the audit with proper cleanup tracking.
 * This is the function the API route should call.
 */
export async function runCrossTenantAuditWithCleanup(
  options?: {
    tenantCount?: number;
    memoriesPerTenant?: number;
    queriesPerPair?: number;
  }
): Promise<CrossTenantAuditResult> {
  const tenantCount = options?.tenantCount ?? SYNTHETIC_TENANT_COUNT;
  const memoriesPerTenant = options?.memoriesPerTenant ?? MEMORIES_PER_TENANT;
  const queriesPerPair = options?.queriesPerPair ?? QUERIES_PER_PAIR;

  const pool = getPool();
  const tenantIds: string[] = [];
  const leakDetails: CrossTenantLeakDetail[] = [];
  let totalQueries = 0;

  try {
    // Create synthetic tenants
    for (let i = 0; i < tenantCount; i++) {
      const groupId = generateSyntheticGroupId(i);
      validateGroupId(groupId);
      tenantIds.push(groupId);

      await pool.query(
        `INSERT INTO tenants (group_id, name, description, owner_agent_id, config)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (group_id) DO NOTHING`,
        [
          groupId,
          `Audit Tenant ${i}`,
          `Synthetic tenant for cross-tenant audit`,
          "audit-system",
          JSON.stringify({}),
        ]
      );
    }

    // Seed memories
    for (let t = 0; t < tenantCount; t++) {
      const groupId = tenantIds[t]!;
      for (let m = 0; m < memoriesPerTenant; m++) {
        const content = generateUniqueContent(t, m);
        await memory_add({
          group_id: groupId as any,
          user_id: "audit-agent",
          content,
          metadata: {
            source: "manual",
            audit_synthetic: true,
            tenant_index: t,
            memory_index: m,
          },
        });
      }
    }

    // Run cross-tenant queries
    for (let sourceIdx = 0; sourceIdx < tenantCount; sourceIdx++) {
      for (let targetIdx = 0; targetIdx < tenantCount; targetIdx++) {
        if (sourceIdx === targetIdx) continue;

        const sourceTenant = tenantIds[sourceIdx]!;
        const targetTenant = tenantIds[targetIdx]!;

        for (let q = 0; q < queriesPerPair; q++) {
          const query = `audit-${targetIdx}-${q % memoriesPerTenant}`;
          const searchResponse = await memory_search({
            query,
            group_id: sourceTenant as any,
            limit: 10,
            status: "all",
          });

          totalQueries++;

          const leakedResults = (searchResponse.results ?? []).filter(
            (r) => r.content.includes(`audit-${targetIdx}-`)
          );

          if (leakedResults.length > 0) {
            leakDetails.push({
              source_tenant: sourceTenant,
              target_tenant: targetTenant,
              query,
              leaked_count: leakedResults.length,
            });
          }
        }
      }
    }

    return {
      tenants_tested: tenantCount,
      queries_per_pair: queriesPerPair,
      total_queries: totalQueries,
      leaks_found: leakDetails.length,
      status: leakDetails.length === 0 ? "pass" : "fail",
      leak_details: leakDetails,
      timestamp: new Date().toISOString(),
      cleanup_succeeded: false, // updated below
    };
  } finally {
    // Cleanup
    let cleanupSucceeded = true;
    for (const groupId of tenantIds) {
      try {
        await pool.query("DELETE FROM memory_events WHERE group_id = $1", [groupId]);
        await pool.query("DELETE FROM tenants WHERE group_id = $1", [groupId]);
      } catch {
        cleanupSucceeded = false;
      }
    }
    // Store cleanup result for the caller
    _lastCleanupSucceeded = cleanupSucceeded;
  }
}

// Module-level variable to track cleanup status across the finally block
let _lastCleanupSucceeded = false;

/**
 * Get the cleanup status from the last audit run.
 * Used by the route handler to patch the result.
 */
export function getLastCleanupSucceeded(): boolean {
  return _lastCleanupSucceeded;
}