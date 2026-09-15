import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getAuthUser } from "@/lib/auth/api-auth"
import { markLostDevice, REVOCATION_ERROR_STATUS, RevocationError } from "@/lib/device-pairing/revocation-service"
import { getAppPool } from "@/lib/postgres/connection"

const bodySchema = z.object({ device_id: z.string().min(1) }).strip()

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authUser = await getAuthUser(request)
  if (!authUser) return NextResponse.json({ error: "AUTH_REQUIRED", message: "Authentication is required" }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", message: "device_id is required" }, { status: 400 })

  try {
    return NextResponse.json(await markLostDevice(getAppPool(), { device_id: parsed.data.device_id, authUser }))
  } catch (error) {
    if (error instanceof RevocationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: REVOCATION_ERROR_STATUS[error.code] })
    }
    console.error("[device-pairing/mark-lost] error:", error)
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Unable to mark device lost" }, { status: 500 })
  }
}
