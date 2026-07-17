/**
 * Coherence Monitor API — List Active Conflicts
 * Story 2.1
 *
 * GET /api/coherence/conflicts?group_id=allura-…
 *
 * Returns the list of active (unresolved) coherence conflicts for a tenant.
 * Requires viewer role (read-only). group_id is validated server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/api-auth";
import { captureException } from "@/lib/observability/sentry";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";
import { listActiveConflicts } from "@/lib/coherence/monitor";

export async function GET(request: NextRequest) {
  // Auth: viewer or above
  const roleCheck = requireRole(request, "viewer");
  if (!roleCheck.user) return unauthorizedResponse();
  if (!roleCheck.allowed) return forbiddenResponse(roleCheck);

  try {
    const url = new URL(request.url);
    const rawGroupId = url.searchParams.get("group_id");
    if (!rawGroupId) {
      return NextResponse.json(
        { error: "group_id query parameter is required" },
        { status: 400 }
      );
    }

    let groupId: string;
    try {
      groupId = validateGroupId(rawGroupId);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }

    const conflicts = await listActiveConflicts(groupId);
    return NextResponse.json({
      group_id: groupId,
      conflicts,
      count: conflicts.length,
    });
  } catch (error) {
    captureException(error, { tags: { route: "coherence/conflicts", method: "GET" } });
    console.error("Coherence conflicts API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}