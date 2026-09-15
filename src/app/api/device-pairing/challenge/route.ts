import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ChallengeError,
  type ChallengeInput,
  issueChallenge,
} from "@/lib/device-pairing/challenge-service";
import {
  DevicePairingErrorCode,
  devicePairingErrorResponse,
} from "@/lib/device-pairing/error-codes";
import { getPool } from "@/lib/postgres/connection";

const requestSchema = z.object({
  device_id: z.string().min(1, "device_id is required"),
  purpose: z.enum(["exchange", "rotation_stage", "rotation_activate", "recovery_status"]),
}).strip();

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      devicePairingErrorResponse(DevicePairingErrorCode.INVALID_CHALLENGE_REQUEST, "Request body must be valid JSON"),
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      devicePairingErrorResponse(
        DevicePairingErrorCode.INVALID_CHALLENGE_REQUEST,
        parsed.error.issues[0]?.message ?? "Invalid challenge request",
      ),
      { status: 400 },
    );
  }

  try {
    const result = await issueChallenge(getPool(), parsed.data satisfies ChallengeInput);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ChallengeError) {
      return NextResponse.json(devicePairingErrorResponse(error.code, error.message), { status: 403 });
    }
    console.error("[device-pairing/challenge] error:", error);
    return NextResponse.json(
      devicePairingErrorResponse(DevicePairingErrorCode.INTERNAL_ERROR, "Internal server error"),
      { status: 500 },
    );
  }
}
