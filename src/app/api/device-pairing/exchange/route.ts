import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { emitDeviceAudit } from "@/lib/device-pairing/audit";
import {
  DevicePairingErrorCode,
  devicePairingErrorResponse,
} from "@/lib/device-pairing/error-codes";
import {
  ExchangeError,
  type ExchangeErrorCode,
  exchangeToken,
} from "@/lib/device-pairing/exchange-service";
import { extractStructuredSignatureValue, parseSignatureInput } from "@/lib/device-pairing/rfc9421";
import { getAppPool } from "@/lib/postgres/connection";

const requestSchema = z.object({
  device_id: z.string().min(1),
  challenge_id: z.string().min(1),
}).strict();

const errorStatus: Record<ExchangeErrorCode, number> = {
  [DevicePairingErrorCode.AUTH_EXPIRED]: 401,
  [DevicePairingErrorCode.AUTH_INVALID]: 403,
  [DevicePairingErrorCode.KEY_EXPIRED]: 403,
  [DevicePairingErrorCode.MEMBERSHIP_INACTIVE]: 403,
  [DevicePairingErrorCode.WORKSPACE_LOCKED]: 403,
  [DevicePairingErrorCode.WORKSPACE_NOT_FOUND]: 403,
  [DevicePairingErrorCode.DEVICE_NOT_APPROVED]: 403,
};

function requiredHeader(request: NextRequest, name: string): string | null {
  const value = request.headers.get(name);
  return value?.trim() || null;
}

async function auditRouteDenial(
  deviceId: string | undefined,
  challengeId: string | undefined,
  reasonCode: "AUTH_INVALID" | "AUTH_EXPIRED" | "INVALID_REQUEST",
): Promise<void> {
  const client = await getAppPool().connect();
  let committed = false;
  const metadata: Record<string, string> = { reason_code: reasonCode };
  if (deviceId !== undefined) metadata.device_id = deviceId;
  if (challengeId !== undefined) metadata.challenge_id = challengeId;
  try {
    await client.query("BEGIN");
    await emitDeviceAudit(client, {
      group_id: "allura-system",
      workspace_id: null,
      event_type: "DEVICE_EXCHANGE_DENIED",
      agent_id: "device-enrollment",
      metadata,
      status: "failed",
    });
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function auditDenialOrInternalResponse(
  deviceId: string | undefined,
  challengeId: string | undefined,
  reasonCode: "AUTH_INVALID" | "AUTH_EXPIRED" | "INVALID_REQUEST",
): Promise<NextResponse | undefined> {
  try {
    await auditRouteDenial(deviceId, challengeId, reasonCode);
    return undefined;
  } catch (error) {
    console.error("Device exchange denial audit failed", error);
    return NextResponse.json(
      devicePairingErrorResponse(DevicePairingErrorCode.INTERNAL_ERROR, "Exchange is unavailable"),
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestBody = new Uint8Array(await request.arrayBuffer());
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(requestBody));
  } catch {
    const auditFailure = await auditDenialOrInternalResponse(undefined, undefined, "INVALID_REQUEST");
    if (auditFailure) return auditFailure;
    return NextResponse.json(
      devicePairingErrorResponse(DevicePairingErrorCode.INVALID_REQUEST, "Request body must be valid JSON"),
      { status: 400 },
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const candidate = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const auditFailure = await auditDenialOrInternalResponse(
      typeof candidate.device_id === "string" ? candidate.device_id : undefined,
      typeof candidate.challenge_id === "string" ? candidate.challenge_id : undefined,
      "INVALID_REQUEST",
    );
    if (auditFailure) return auditFailure;
    return NextResponse.json(
      devicePairingErrorResponse(DevicePairingErrorCode.INVALID_REQUEST, parsed.error.issues[0]?.message),
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
    const auditFailure = await auditDenialOrInternalResponse(parsed.data.device_id, parsed.data.challenge_id, "AUTH_INVALID");
    if (auditFailure) return auditFailure;
    return NextResponse.json(
      devicePairingErrorResponse(DevicePairingErrorCode.AUTH_INVALID, "RFC 9421 proof headers are required"),
      { status: 403 },
    );
  }

  let signatureValue: string;
  try {
    signatureValue = extractStructuredSignatureValue(signature, parseSignatureInput(signatureInput).label);
  } catch {
    const auditFailure = await auditDenialOrInternalResponse(parsed.data.device_id, parsed.data.challenge_id, "AUTH_INVALID");
    if (auditFailure) return auditFailure;
    return NextResponse.json(
      devicePairingErrorResponse(DevicePairingErrorCode.AUTH_INVALID, "RFC 9421 signature headers are invalid"),
      { status: 403 },
    );
  }

  try {
    const url = new URL(request.url);
    const result = await exchangeToken(getAppPool(), {
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
    if (error instanceof ExchangeError) {
      if (error.code === "AUTH_INVALID" || error.code === "AUTH_EXPIRED") {
        const auditFailure = await auditDenialOrInternalResponse(parsed.data.device_id, parsed.data.challenge_id, error.code);
        if (auditFailure) return auditFailure;
      }
      return NextResponse.json(devicePairingErrorResponse(error.code, error.message), { status: errorStatus[error.code] });
    }
    console.error("Device exchange route failed", error);
    return NextResponse.json(
      devicePairingErrorResponse(DevicePairingErrorCode.INTERNAL_ERROR, "Exchange is unavailable"),
      { status: 500 },
    );
  }
}
