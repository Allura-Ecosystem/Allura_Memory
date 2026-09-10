import { NextResponse } from "next/server";
import { z } from "zod";
import { extractStructuredSignatureValue, parseSignatureInput } from "@/lib/device-pairing/rfc9421";
import { activateRotation, RotationError } from "@/lib/device-pairing/rotation-service";
import { getAppPool } from "@/lib/postgres/connection";

const bodySchema = z.object({
  device_id: z.string().min(1),
  receipt_id: z.string().min(1).max(256),
  idempotency_key: z.string().min(1).max(256),
}).strip();
const headerNames = ["content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id", "x-allura-device-id", "x-allura-key-generation", "signature-input", "signature"] as const;

export async function POST(request: Request): Promise<NextResponse> {
  const raw = new Uint8Array(await request.arrayBuffer());
  let parsed: z.infer<typeof bodySchema>;
  try { parsed = bodySchema.parse(JSON.parse(new TextDecoder().decode(raw))); }
  catch { return NextResponse.json({ error: "INVALID_REQUEST", message: "Invalid rotation activate request" }, { status: 400 }); }
  const headers = Object.fromEntries(headerNames.map((name) => [name, request.headers.get(name)?.trim() || ""]));
  if (Object.values(headers).some((value) => !value)) return NextResponse.json({ error: "AUTH_INVALID", message: "RFC 9421 proof headers are required" }, { status: 401 });
  let signature: string;
  try { signature = extractStructuredSignatureValue(headers.signature, parseSignatureInput(headers["signature-input"]).label); }
  catch { return NextResponse.json({ error: "AUTH_INVALID", message: "RFC 9421 Signature header is invalid" }, { status: 401 }); }
  try {
    const url = new URL(request.url);
    const result = await activateRotation(getAppPool(), {
      ...parsed, request_target: `${url.pathname}${url.search}`, request_body: raw,
      headers: { content_digest: headers["content-digest"], purpose: headers["x-allura-purpose"], audience: headers["x-allura-audience"], nonce: headers["x-allura-nonce"], proof_id: headers["x-allura-proof-id"], device_id: headers["x-allura-device-id"], key_generation: headers["x-allura-key-generation"], signature_input: headers["signature-input"], signature },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RotationError) {
      const status = error.code === "DEVICE_NOT_APPROVED" ? 403 : error.code === "NO_PENDING_KEY" ? 409 : 401;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    throw error;
  }
}
