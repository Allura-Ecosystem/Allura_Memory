import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/postgres/connection";
import {
  ChallengeError,
  issueChallenge,
  type ChallengeInput,
} from "@/lib/device-pairing/challenge-service";

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
      { error: "INVALID_CHALLENGE_REQUEST", message: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_CHALLENGE_REQUEST", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  try {
    const result = await issueChallenge(getPool(), parsed.data satisfies ChallengeInput);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ChallengeError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 403 });
    }
    console.error("[device-pairing/challenge] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
