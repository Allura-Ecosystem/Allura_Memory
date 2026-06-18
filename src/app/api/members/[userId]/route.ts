import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { GroupIdValidationError } from "@/lib/validation/group-id"
import { removeMember, setMemberRole } from "@/lib/membership/repository"
import type { AlluraRole } from "@/lib/auth/types"

const VALID_ROLES = new Set<AlluraRole>(["admin", "curator", "viewer"])

function handle(error: unknown): NextResponse {
  if (error instanceof GroupIdValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  console.error("members/[userId] API error:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const rc = requireRole(request, "admin")
  if (!rc.user) return unauthorizedResponse()
  if (!rc.allowed) return forbiddenResponse(rc)
  try {
    const { userId } = await params
    const body = await request.json()
    const role: AlluraRole = body?.role
    if (!VALID_ROLES.has(role)) {
      return NextResponse.json({ error: `unknown role: ${role}` }, { status: 400 })
    }
    const member = await setMemberRole(rc.user.groupId, userId, role, rc.user.id)
    if (!member) {
      return NextResponse.json({ error: "member not found" }, { status: 404 })
    }
    return NextResponse.json({ member })
  } catch (error) {
    return handle(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const rc = requireRole(request, "admin")
  if (!rc.user) return unauthorizedResponse()
  if (!rc.allowed) return forbiddenResponse(rc)
  try {
    const { userId } = await params
    const removed = await removeMember(rc.user.groupId, userId, rc.user.id)
    if (!removed) {
      return NextResponse.json({ error: "member not found" }, { status: 404 })
    }
    return NextResponse.json({ removed: true })
  } catch (error) {
    return handle(error)
  }
}
