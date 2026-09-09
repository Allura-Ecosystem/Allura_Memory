import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppPool } from "@/lib/postgres/connection";
import { completePairing, CompletionError, type CompletionErrorCode } from "@/lib/device-pairing/complete-service";
import { extractStructuredSignatureValue, parseSignatureInput } from "@/lib/device-pairing/rfc9421";
import { emitDeviceAudit } from "@/lib/device-pairing/audit";

const completionErrorStatus: Record<CompletionErrorCode, number> = {
  ENROLLMENT_NOT_FOUND: 404,
  ENROLLMENT_CONSUMED: 409,
  ENROLLMENT_EXPIRED: 410,
  ENROLLMENT_NOT_APPROVED: 409,
  CODE_EXPIRED: 410,
  COMPLETION_NONCE_EXPIRED: 410,
  INVALID_CODE: 400,
  COMPLETION_NONCE_MISMATCH: 400,
  PKCE_MISMATCH: 400,
  AUTH_INVALID: 401,
  MEMBERSHIP_INACTIVE: 403,
  WORKSPACE_NOT_FOUND: 403,
  DEVICE_LIMIT_EXCEEDED: 409,
};

const requestSchema = z.object({
  enrollment_transaction_id: z.string().min(1),
  authorization_code: z.string().min(1),
  pkce_verifier: z.string().min(1),
  completion_nonce: z.string().min(1),
});

function requiredHeader(request: NextRequest, name: string): string | null {
  const value = request.headers.get(name);
  return value?.trim() || null;
}

async function auditRouteDenial(enrollmentTransactionId: string, reasonCode: string): Promise<void> {
  const client = await getAppPool().connect();
  try {
    await emitDeviceAudit(client, {
      group_id: "allura-system",
      event_type: "DEVICE_ENROLL_DENIED",
      agent_id: "device-enrollment",
      metadata: { enrollment_transaction_id: enrollmentTransactionId, reason_code: reasonCode },
    });
  } finally {
    client.release();
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestBody = new Uint8Array(await request.arrayBuffer());
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(requestBody));
  } catch {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const contentDigest = requiredHeader(request, "content-digest");
  const purpose = requiredHeader(request, "x-allura-purpose");
  const audience = requiredHeader(request, "x-allura-audience");
  const nonce = requiredHeader(request, "x-allura-nonce");
  const proofId = requiredHeader(request, "x-allura-proof-id");
  const signatureInput = requiredHeader(request, "signature-input");
  const signature = requiredHeader(request, "signature");
  if (!contentDigest || !purpose || !audience || !nonce || !proofId || !signatureInput || !signature) {
    await auditRouteDenial(parsed.data.enrollment_transaction_id, "AUTH_INVALID");
    return NextResponse.json(
      { error: "AUTH_INVALID", message: "RFC 9421 proof headers are required" },
      { status: 401 },
    );
  }

  let signatureValue: string;
  try {
    signatureValue = extractStructuredSignatureValue(signature, parseSignatureInput(signatureInput).label);
  } catch {
    await auditRouteDenial(parsed.data.enrollment_transaction_id, "AUTH_INVALID");
    return NextResponse.json(
      { error: "AUTH_INVALID", message: "RFC 9421 signature headers are invalid" },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const result = await completePairing(getAppPool(), {
      ...parsed.data,
      request_target: `${url.pathname}${url.search}`,
      request_body: requestBody,
      headers: {
        content_digest: contentDigest,
        purpose,
        audience,
        nonce,
        proof_id: proofId,
        signature_input: signatureInput,
        signature: signatureValue,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CompletionError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: completionErrorStatus[error.code] },
      );
    }
    throw error;
  }

  return NextResponse.json(
    { error: "NOT_IMPLEMENTED", message: "Completion verification is not available" },
    { status: 501 },
  );
}
