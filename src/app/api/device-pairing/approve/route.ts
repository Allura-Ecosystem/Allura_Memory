/**
 * Story 29.5 — Approval API: POST /api/device-pairing/approve
 *
 * Architecture §4.2 (approval contract), §4.2c (device limit),
 * §3.1 (device_enrollment_approve SECURITY DEFINER), §11.1 (post-approval
 * audit with approved tenant/principal), AD-65 (code stored as SHA-256),
 * AD-63 (callback allowlist), HIGH-F4 (pg_advisory_xact_lock).
 *
 * Accepts `enrollment_transaction_id` and `pkce_state` from the browser
 * (after Clerk sign-in); resolves the Clerk-authenticated AuthUser via
 * middleware headers; the server resolves active membership and workspace —
 * the client never supplies tenant authority (AC-02).
 *
 * Returns 200 with `{ authorization_code, completion_nonce, callback }` on
 * valid approval. Error outcomes:
 *   404 ENROLLMENT_NOT_FOUND
 *   410 ENROLLMENT_EXPIRED
 *   400 STATE_MISMATCH / CALLBACK_TYPE_DISABLED
 *   403 MEMBERSHIP_INACTIVE / WORKSPACE_NOT_FOUND
 *   409 DEVICE_LIMIT_EXCEEDED
 *
 * No changes to existing auth files.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppPool } from "@/lib/postgres/connection";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  approveEnrollment,
  ApprovalError,
  APPROVAL_ERROR_STATUS,
} from "@/lib/device-pairing/approval-service";

const requestSchema = z.object({
  enrollment_transaction_id: z.string().min(1, "enrollment_transaction_id is required"),
  pkce_state: z.string().min(1, "pkce_state is required"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  // §4.2 step 1: Resolve the Clerk-authenticated AuthUser via middleware
  // headers. Server resolves authority — client never supplies tenant.
  const authUser = getAuthUser(request);
  if (!authUser) {
    return NextResponse.json(
      { error: "Authentication required", statusCode: 401 },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: first?.message },
      { status: 400 },
    );
  }

  try {
    const pool = getAppPool();
    const result = await approveEnrollment(pool, {
      enrollment_transaction_id: parsed.data.enrollment_transaction_id,
      pkce_state: parsed.data.pkce_state,
      authUser,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ApprovalError) {
      const status = APPROVAL_ERROR_STATUS[error.code];
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status },
      );
    }
    console.error("[device-pairing/approve] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}