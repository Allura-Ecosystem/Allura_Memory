import { NextRequest, NextResponse } from "next/server"

import { getAuthUser } from "@/lib/auth/api-auth"
import { listApprovedDevices } from "@/lib/device-pairing/revocation-service"
import { getAppPool } from "@/lib/postgres/connection"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authUser = await getAuthUser(request)
  if (!authUser) return NextResponse.json({ error: "AUTH_REQUIRED", message: "Authentication is required" }, { status: 401 })
  try {
    return NextResponse.json({ devices: await listApprovedDevices(getAppPool(), authUser) })
  } catch (error) {
    console.error("[device-pairing/devices] error:", error)
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Unable to list devices" }, { status: 500 })
  }
}
