import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { emitDeviceAudit } from "@/lib/device-pairing/audit";
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
  AUTH_EXPIRED: 401,
  AUTH_INVALID: 401,
  MEMBERSHIP_INACTIVE: 403,
  WORKSPACE_LOCKED: 403,
  WORKSPACE_NOT_FOUND: 403,
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestBody = new Uint8Array(await request.arrayBuffer());
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(requestBody));
  } catch {
    await auditRouteDenial(undefined, undefined, "INVALID_REQUEST");
    return NextResponse.json({ error: "INVALID_REQUEST", message: "Request body must be valid JSON" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const candidate = body && typeof body === "object" ? body as Record<string, unknown> : {};
    await auditRouteDenial(
      typeof candidate.device_id === "string" ? candidate.device_id : undefined,
      typeof candidate.challenge_id === "string" ? candidate.challenge_id : undefined,
      "INVALID_REQUEST",
    );
    return NextResponse.json({ error: "INVALID_REQUEST", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const contentDigest = requiredHeader(request, "content-digest");
  const purpose = requiredHeader(request, "x-allura-purpose");
  const audience = requiredHeader(request, "x-allura-audience");
  const nonce = requiredHeader(request, "x-allura-nonce");
  const proofId = requiredHeader(request, "x-allura-proof-id");
  const signatureInput = requiredHeader(request, "signature-input");
  const signature = requiredHeader(request, "signature");
  if (!contentDigest || !purpose || !audience || !nonce || !proofId || !signatureInput || !signature) {
    await auditRouteDenial(parsed.data.device_id, parsed.data.challenge_id, "AUTH_INVALID");
    return NextResponse.json({ error: "AUTH_INVALID", message: "RFC 9421 proof headers are required" }, { status: 401 });
  }

  let signatureValue: string;
  try {
    signatureValue = extractStructuredSignatureValue(signature, parseSignatureInput(signatureInput).label);
  } catch {
    await auditRouteDenial(parsed.data.device_id, parsed.data.challenge_id, "AUTH_INVALID");
    return NextResponse.json({ error: "AUTH_INVALID", message: "RFC 9421 signature headers are invalid" }, { status: 401 });
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
        await auditRouteDenial(parsed.data.device_id, parsed.data.challenge_id, error.code);
      }
      return NextResponse.json({ error: error.code, message: error.message }, { status: errorStatus[error.code] });
    }
    console.error("Device exchange route failed", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Exchange is unavailable" }, { status: 500 });
  }
}
