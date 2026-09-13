import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { AuthUser } from "@/lib/auth/types";
import {
  APPROVAL_ERROR_STATUS,
  ApprovalError,
  approveEnrollment,
} from "@/lib/device-pairing/approval-service";
import { getAppPool } from "@/lib/postgres/connection";

const requestSchema = z.object({
  enrollment_transaction_id: z.string().min(1, "enrollment_transaction_id is required"),
  pkce_state: z.string().min(1, "pkce_state is required"),
});

/**
 * Test-only authority used exclusively by the Story 29.20 local E2E fixture.
 * This identity is deliberately fixed: request headers and bodies never supply
 * tenant, workspace, role, or principal authority.
 */
export const TEST_ONLY_APPROVAL_USER: Readonly<AuthUser> = Object.freeze({
  id: "user_device_pairing_e2e",
  email: "device-pairing-e2e@allura.test",
  name: "Device Pairing E2E Human",
  role: "curator",
  groupId: "allura-device-pairing-e2e",
  workspaceId: "ws_device_pairing_e2e",
  sessionId: "sess_device_pairing_e2e",
});

function isLocalTestPairingRuntime(): boolean {
  return process.env.NODE_ENV === "test"
    || (process.env.NODE_ENV === "development" && process.env.ALLURA_LOCAL_TEST_PAIRING_RUNTIME === "true");
}

function unavailable(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

/**
 * Story 29.20 local-E2E approval seam.
 *
 * This handler is intentionally separate from the production Clerk approval
 * route. It is inert outside Vitest's NODE_ENV=test and never accepts caller-
 * supplied identity/tenant context.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isLocalTestPairingRuntime()) return unavailable();

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "Request body must be form encoded" },
      { status: 400 },
    );
  }

  const form = await request.formData();
  const parsed = requestSchema.safeParse({
    enrollment_transaction_id: form.get("txn"),
    pkce_state: form.get("state"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  try {
    const result = await approveEnrollment(getAppPool(), {
      enrollment_transaction_id: parsed.data.enrollment_transaction_id,
      pkce_state: parsed.data.pkce_state,
      authUser: TEST_ONLY_APPROVAL_USER,
    });
    const response = NextResponse.redirect(result.callback.url, 303);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof ApprovalError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: APPROVAL_ERROR_STATUS[error.code] },
      );
    }
    throw error;
  }
}
