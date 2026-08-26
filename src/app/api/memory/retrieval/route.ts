/**
 * Controlled Retrieval API — F10, F11
 *
 * POST /api/memory/retrieval - Retrieve approved knowledge through the controlled retrieval layer.
 *
 * This is the sole endpoint agents should use to retrieve knowledge.
 * Agents MUST NOT query PostgreSQL or Neo4j directly (AD-19).
 *
 * Reference: docs/allura/DESIGN-MEMORY-SYSTEM.md §Retrieval Layer
 */

import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import {
  RetrievalError,
  type RetrievalRequest,
  retrieveKnowledge,
} from "@/lib/memory/retrieval-layer";
import { captureException } from "@/lib/observability/sentry";

/**
 * POST /api/memory/retrieval
 *
 * Request body:
 * - group_id: Required tenant identifier
 * - agent_id: Required agent identifier (for audit)
 * - query: Required search query
 * - mode: 'semantic' | 'structured' | 'hybrid' | 'traces' (default: hybrid)
 * - scope: { project: true, global: true }
 * - include_traces: boolean (default: false, policy-gated)
 * - filters: { status, source_type, min_confidence, max_confidence, since, until }
 * - limit: number (default: 10)
 */
export async function POST(
  request: NextRequest,
  _context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  // Auth: require viewer or above role
  const roleCheck = requireRole(request, "viewer");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    const body = await request.json();
    const workspaceId = roleCheck.user.workspaceId;
    if (!workspaceId) {
      return unauthorizedResponse("Authenticated workspace scope is required");
    }
    const authority = {
      group_id: roleCheck.user.groupId,
      workspace_id: workspaceId,
      agent_id: roleCheck.user.id,
    };
    for (const key of ["group_id", "workspace_id", "agent_id"] as const) {
      if (body[key] !== undefined && body[key] !== authority[key]) {
        return NextResponse.json({ error: `Forged ${key} scope is forbidden` }, { status: 403 });
      }
    }

    const retrievalRequest: RetrievalRequest = {
      ...authority,
      query: body.query,
      mode: body.mode,
      scope: body.scope,
      include_traces: body.include_traces,
      filters: body.filters,
      limit: body.limit,
    };

    const response = await retrieveKnowledge(retrievalRequest);

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof RetrievalError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    captureException(error, {
      tags: { route: "/api/memory/retrieval", method: "POST" },
    });
    console.error("Failed to process retrieval query:", error);
    return NextResponse.json(
      { error: "Failed to process retrieval query" },
      { status: 500 }
    );
  }
}
