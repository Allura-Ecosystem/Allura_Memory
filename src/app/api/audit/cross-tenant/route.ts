/**
 * Cross-Tenant Audit Endpoint — GET /api/audit/cross-tenant
 *
 * Story 22.6: Admin-only endpoint that runs an automated cross-tenant
 * leakage test. Creates synthetic tenants, seeds memories, runs 100
 * queries per tenant pair, verifies zero leakage, and cleans up.
 *
 * Response: {
 *   tenants_tested, queries_per_pair, total_queries,
 *   leaks_found, status, leak_details, timestamp, cleanup_succeeded
 * }
 *
 * Returns 200 on pass, 500 on fail (leaks found).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/api-auth";
import {
  runCrossTenantAuditWithCleanup,
  getLastCleanupSucceeded,
} from "@/lib/audit/cross-tenant-test";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth: require admin role
  const roleCheck = requireRole(request, "admin");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    // Parse optional query params for overriding defaults
    const url = new URL(request.url);
    const tenantCount = url.searchParams.get("tenants")
      ? parseInt(url.searchParams.get("tenants")!, 10)
      : undefined;
    const memoriesPerTenant = url.searchParams.get("memories")
      ? parseInt(url.searchParams.get("memories")!, 10)
      : undefined;
    const queriesPerPair = url.searchParams.get("queries")
      ? parseInt(url.searchParams.get("queries")!, 10)
      : undefined;

    // Run the audit
    const result = await runCrossTenantAuditWithCleanup({
      tenantCount,
      memoriesPerTenant,
      queriesPerPair,
    });

    // Patch cleanup status
    result.cleanup_succeeded = getLastCleanupSucceeded();

    if (result.status === "fail") {
      // Leaks found — return 500 with details
      console.error("[Cross-Tenant Audit] LEAK DETECTED:", result.leak_details);
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[Cross-Tenant Audit] Failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        error: message,
        status: "fail",
        leaks_found: -1,
        leak_details: [],
      },
      { status: 500 }
    );
  }
}