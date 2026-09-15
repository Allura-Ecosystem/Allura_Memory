import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { GroupIdValidationError } from "@/lib/validation/group-id";
import { revokeToken } from "@/lib/mcp-token/repository";

// Revoke an MCP token (DESIGN-BUMBLEBEE, F7/B6). Admin-only. Idempotent: revoking
// an already-revoked token is a no-op.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const rc = requireRole(request, "admin");
  if (!rc.user) return unauthorizedResponse();
  if (!rc.allowed) return forbiddenResponse(rc);
  try {
    const { id } = await params;
    const revoked = await revokeToken(id, rc.user.groupId);
    if (!revoked) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof GroupIdValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("token revoke error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
