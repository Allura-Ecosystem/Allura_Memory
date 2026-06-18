import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { GroupIdValidationError } from "@/lib/validation/group-id"
import { addMember, listMembers } from "@/lib/membership/repository"
import type { AlluraRole } from "@/lib/auth/types"

// Team membership administration. Admin-only. group_id is server-injected from
// the authenticated user; the client can never supply it.

const VALID_ROLES = new Set<AlluraRole>(["admin", "curator", "viewer"])

function handle(error: unknown): NextResponse {
  if (error instanceof GroupIdValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  console.error("members API error:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rc = requireRole(request, "admin")
  if (!rc.user) return unauthorizedResponse()
  if (!rc.allowed) return forbiddenResponse(rc)
  try {
    const members = await listMembers(rc.user.groupId)
    return NextResponse.json({ members })
  } catch (error) {
    return handle(error)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rc = requireRole(request, "admin")
  if (!rc.user) return unauthorizedResponse()
  if (!rc.allowed) return forbiddenResponse(rc)
  try {
    const body = await request.json()
    if (!body?.user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 })
    }
    const role: AlluraRole = body.role ?? "viewer"
    if (!VALID_ROLES.has(role)) {
      return NextResponse.json({ error: `unknown role: ${role}` }, { status: 400 })
    }
    const member = await addMember({
      group_id: rc.user.groupId,
      user_id: String(body.user_id),
      email: body.email ?? null,
      role,
      invited_by: rc.user.id,
    })
    return NextResponse.json({ member }, { status: 201 })
  } catch (error) {
    return handle(error)
  }
}
