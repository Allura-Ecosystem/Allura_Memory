/**
 * Story 29.4 — Enrollment API: POST /api/device-pairing/enroll
 *
 * Architecture §4.1 (enrollment contract), §3.1 (device_enrollment_create
 * SECURITY DEFINER), §11.1 (pre-human audit, fail-closed), AD-65 (verifier
 * never in URL), AD-63 (callback allowlist).
 *
 * Accepts a device public key, PKCE code_challenge, and state from the desktop
 * bridge; creates a PENDING enrollment transaction (10-minute TTL, no tenant
 * authority); audits DEVICE_ENROLL_REQUESTED with group_id='allura-system',
 * agent_id='device-enrollment'; returns {enrollment_transaction_id,
 * pairing_url, expires_at}.
 *
 * The pairing_url contains only `txn` and `state` — the PKCE verifier is
 * never in the URL (AD-65).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/postgres/connection";
import {
  EnrollmentValidationError,
  createEnrollment,
  type EnrollmentInput,
} from "@/lib/device-pairing/enrollment-service";

const requestSchema = z.object({
  device_label: z.string().min(1, "device_label is required"),
  callback_type: z.string().min(1, "callback_type is required"),
  pkce_code_challenge: z.string().min(1, "pkce_code_challenge is required"),
  pkce_code_challenge_method: z.string().min(1, "pkce_code_challenge_method is required"),
  pkce_state: z.string().min(1, "pkce_state is required"),
  public_key: z.string().min(1, "public_key is required"),
  key_id: z.string().min(1, "key_id is required"),
  key_algorithm: z.string().min(1, "key_algorithm is required"),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_PKCE", message: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    // Map schema failures to the most relevant error code
    const field = first?.path[0] as string | undefined;
    let code = "INVALID_PKCE";
    if (field === "public_key" || field === "key_id") code = "INVALID_PUBLIC_KEY";
    if (field === "key_algorithm") code = "INVALID_KEY_ALGORITHM";
    return NextResponse.json({ error: code, message: first?.message }, { status: 400 });
  }

  const input: EnrollmentInput = parsed.data;

  try {
    const pool = getPool();
    const result = await createEnrollment(pool, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof EnrollmentValidationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    console.error("[device-pairing/enroll] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}