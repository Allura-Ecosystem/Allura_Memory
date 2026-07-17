/**
 * Coherence Monitor API — Resolve Conflict
 * Story 2.1
 *
 * POST /api/coherence/resolve
 *
 * Body:
 *   {
 *     "conflict_id": 42,
 *     "group_id": "allura-…",
 *     "action": "supersede" | "dismiss" | "merge",
 *     "rationale": "human-readable reason"
 *   }
 *
 * Requires curator role. The curator_id is taken from the authenticated
 * session, never from the request body (anti-spoofing, same pattern as
 * /api/curator/approve).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/api-auth";
import { captureException } from "@/lib/observability/sentry";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";
import { resolveConflict } from "@/lib/coherence/monitor";

const VALID_ACTIONS = new Set(["supersede", "dismiss", "merge"]);

export async function POST(request: NextRequest) {
  // Auth: curator or above
  const roleCheck = requireRole(request, "curator");
  if (!roleCheck.user) return unauthorizedResponse();
  if (!roleCheck.allowed) return forbiddenResponse(roleCheck);

  const curatorId = roleCheck.user.id;

  try {
    const body = await request.json();

    // Validate required fields
    if (body.conflict_id === undefined || body.conflict_id === null) {
      return NextResponse.json(
        { error: "conflict_id is required" },
        { status: 400 }
      );
    }
    if (!body.group_id) {
      return NextResponse.json(
        { error: "group_id is required" },
        { status: 400 }
      );
    }
    if (!body.action || !VALID_ACTIONS.has(body.action)) {
      return NextResponse.json(
        { error: "action must be one of: supersede, dismiss, merge" },
        { status: 400 }
      );
    }
    if (!body.rationale || typeof body.rationale !== "string" || body.rationale.trim().length === 0) {
      return NextResponse.json(
        { error: "rationale is required for coherence conflict resolution" },
        { status: 400 }
      );
    }

    let groupId: string;
    try {
      groupId = validateGroupId(body.group_id);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }

    const conflictId = Number(body.conflict_id);
    if (!Number.isInteger(conflictId) || conflictId <= 0) {
      return NextResponse.json(
        { error: "conflict_id must be a positive integer" },
        { status: 400 }
      );
    }

    const { updated, status } = await resolveConflict({
      conflict_id: conflictId,
      group_id: groupId,
      action: body.action,
      curator_id: curatorId,
      rationale: body.rationale,
    });

    if (!updated) {
      return NextResponse.json(
        {
          error: "Conflict not found, not active, or not in this tenant scope",
          conflict_id: conflictId,
          group_id: groupId,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      conflict_id: conflictId,
      group_id: groupId,
      action: body.action,
      resulting_status: status,
      resolved_by: curatorId,
      rationale: body.rationale,
    });
  } catch (error) {
    captureException(error, { tags: { route: "coherence/resolve", method: "POST" } });
    console.error("Coherence resolve API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}