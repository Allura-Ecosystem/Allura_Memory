import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { GroupIdValidationError } from "@/lib/validation/group-id";
import { createWorkspace, listWorkspacesForGroup } from "@/lib/workspace/repository";

// Admin/workspace management (DESIGN-AUTH, F2). group_id always comes from the
// authenticated identity — never the request body (ADR-001). GET is viewer+; POST
// (create) requires admin.

function handle(error: unknown): NextResponse {
  if (error instanceof GroupIdValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("workspaces API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rc = requireRole(request, "viewer");
  if (!rc.user) return unauthorizedResponse();
  if (!rc.allowed) return forbiddenResponse(rc);
  try {
    const workspaces = await listWorkspacesForGroup(rc.user.groupId);
    return NextResponse.json({ workspaces });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rc = requireRole(request, "admin");
  if (!rc.user) return unauthorizedResponse();
  if (!rc.allowed) return forbiddenResponse(rc);
  try {
    const body = await request.json();
    if (!body?.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const workspace = await createWorkspace({
      group_id: rc.user.groupId,
      name: body.name,
      created_by: rc.user.id,
    });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return handle(error);
  }
}
