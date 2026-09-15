/**
 * Cross-Tenant Audit Endpoint — GET /api/audit/cross-tenant
 *
 * Admin-only endpoint reserved for an automated cross-tenant leakage audit.
 * It currently returns 503 for authenticated admins because no verified
 * cross-workspace audit principal exists to seed synthetic data safely.
 *
 * Response: {
 *   tenants_tested, queries_per_pair, total_queries,
 *   leaks_found, status, leak_details, timestamp, cleanup_succeeded
 * }
 *
 * Returns 503 until the required audit authority is implemented.
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
  CrossTenantAuditUnavailableError,
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
    if (error instanceof CrossTenantAuditUnavailableError) {
      return NextResponse.json(
        {
          error: "Cross-tenant synthetic audit is unavailable without verified cross-workspace audit principals",
          status: "unavailable",
          leaks_found: null,
          leak_details: [],
          cleanup_succeeded: getLastCleanupSucceeded(),
        },
        { status: 503 },
      );
    }
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
