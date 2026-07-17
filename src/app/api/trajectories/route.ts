/**
 * GET /api/trajectories
 *
 * List agent trajectory records (SONA — Story 1.3).
 *
 * Query Parameters:
 * - group_id: Required tenant namespace (format: allura-*)
 * - agent_id: Optional filter by agent identifier
 * - action: Optional filter by canonical action (memory_add, memory_search, ...)
 * - task_type: Optional filter by task taxonomy bucket
 * - success: Optional boolean filter
 * - from: Optional ISO 8601 start date
 * - to: Optional ISO 8601 end date
 * - limit: Max rows (default 100, max 10000)
 * - offset: Pagination offset
 *
 * Auth: requires viewer role or above.
 */

import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { queryTrajectories, type TaskType, type TrajectoryAction } from "@/lib/sona/trajectory-engine";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

const VALID_ACTIONS = new Set<TrajectoryAction>([
  "memory_add",
  "memory_search",
  "memory_get",
  "memory_list",
  "memory_list_deleted",
  "memory_delete",
  "memory_update",
  "memory_promote",
  "memory_restore",
  "memory_export",
  "curator_approve",
  "curator_reject",
  "curator_score",
  "curator_propose",
]);

const VALID_TASK_TYPES = new Set<TaskType>([
  "ingest",
  "retrieve",
  "curate",
  "govern",
  "lifecycle",
  "unknown",
]);

function parseBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const roleCheck = requireRole(request, "viewer");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    const { searchParams } = new URL(request.url);

    // ── Validate group_id (tenant isolation) ──
    const groupIdParam = searchParams.get("group_id") ?? "";
    let group_id: string;
    try {
      group_id = validateGroupId(groupIdParam);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }

    // ── Parse filters ──
    const action = searchParams.get("action") ?? undefined;
    if (action && !VALID_ACTIONS.has(action as TrajectoryAction)) {
      return NextResponse.json(
        { error: `Invalid action: '${action}'` },
        { status: 400 }
      );
    }

    const task_type = searchParams.get("task_type") ?? undefined;
    if (task_type && !VALID_TASK_TYPES.has(task_type as TaskType)) {
      return NextResponse.json(
        { error: `Invalid task_type: '${task_type}'` },
        { status: 400 }
      );
    }

    const successParam = searchParams.get("success");
    const success = parseBoolean(successParam);
    if (successParam !== null && success === undefined) {
      return NextResponse.json(
        { error: `Invalid success value: '${successParam}'. Use 'true' or 'false'` },
        { status: 400 }
      );
    }

    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    if (isNaN(limit) || limit < 1) {
      return NextResponse.json(
        { error: `Invalid limit: '${limitParam}'` },
        { status: 400 }
      );
    }

    const offsetParam = searchParams.get("offset");
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    if (isNaN(offset) || offset < 0) {
      return NextResponse.json(
        { error: `Invalid offset: '${offsetParam}'` },
        { status: 400 }
      );
    }

    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    if (from && isNaN(Date.parse(from))) {
      return NextResponse.json(
        { error: `Invalid 'from' date: '${from}'` },
        { status: 400 }
      );
    }
    if (to && isNaN(Date.parse(to))) {
      return NextResponse.json(
        { error: `Invalid 'to' date: '${to}'` },
        { status: 400 }
      );
    }

    const result = await queryTrajectories({
      group_id,
      agent_id: searchParams.get("agent_id") ?? undefined,
      action: action as TrajectoryAction | undefined,
      task_type: task_type as TaskType | undefined,
      success,
      from,
      to,
      limit,
      offset,
    });

    return NextResponse.json({
      trajectories: result.rows,
      pagination: {
        total: result.total,
        limit,
        offset,
        has_more: offset + result.rows.length < result.total,
      },
    });
  } catch (error) {
    console.error("[/api/trajectories] Failed to fetch trajectories:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch trajectories";
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 }
    );
  }
}