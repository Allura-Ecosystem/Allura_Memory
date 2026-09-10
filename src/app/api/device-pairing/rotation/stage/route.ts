
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicKey, type KeyObject } from "node:crypto";
import { extractStructuredSignatureValue, parseSignatureInput } from "@/lib/device-pairing/rfc9421";
import type { KeyAlgorithm } from "@/lib/device-pairing/rfc9421-types";
import { RotationError, stageRotation } from "@/lib/device-pairing/rotation-service";
import { getAppPool } from "@/lib/postgres/connection";

function loadPublicKey(value: string): KeyObject {
  if (value.startsWith("-----BEGIN PUBLIC KEY-----")) return createPublicKey(value);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("Invalid SPKI encoding");
  return createPublicKey({ key: Buffer.from(value, "base64"), format: "der", type: "spki" });
}

function isValidPublicKey(value: string): boolean {
  try { loadPublicKey(value); return true; } catch { return false; }
}

function matchesAlgorithm(key: KeyObject, algorithm: KeyAlgorithm): boolean {
  if (algorithm === "ecdsa-p256") {
    return key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1";
  }
  if (algorithm === "ed25519") return key.asymmetricKeyType === "ed25519";
  return (key.asymmetricKeyType === "rsa" || key.asymmetricKeyType === "rsa-pss") &&
    key.asymmetricKeyDetails?.modulusLength === 2048;
}

const bodySchema = z.object({
  device_id: z.string().min(1),
  new_public_key: z.string().min(1).max(16_384).refine(isValidPublicKey),
  new_key_id: z.string().min(1).max(256).regex(/^[A-Za-z0-9._:-]+$/),
  new_key_algo: z.enum(["ecdsa-p256", "ed25519", "rsa-pss-2048"]),
  idempotency_key: z.string().min(1).max(256),
}).strip().superRefine((value, ctx) => {
  try {
    if (!matchesAlgorithm(loadPublicKey(value.new_public_key), value.new_key_algo as KeyAlgorithm)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["new_public_key"], message: "Public key does not match new_key_algo" });
    }
  } catch {
    // The field-level refinement reports malformed public-key input.
  }
});
const headerNames = ["content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id", "x-allura-device-id", "x-allura-key-generation", "signature-input", "signature"] as const;

export async function POST(request: Request): Promise<NextResponse> {
  const raw = new Uint8Array(await request.arrayBuffer());
  let parsed: z.infer<typeof bodySchema>;
  try { parsed = bodySchema.parse(JSON.parse(new TextDecoder().decode(raw))); }
  catch { return NextResponse.json({ error: "INVALID_REQUEST", message: "Invalid rotation stage request" }, { status: 400 }); }
  const headers = Object.fromEntries(headerNames.map((name) => [name, request.headers.get(name)?.trim() || ""]));
  if (Object.values(headers).some((value) => !value)) return NextResponse.json({ error: "AUTH_INVALID", message: "RFC 9421 proof headers are required" }, { status: 401 });
  let signature: string;
  try { signature = extractStructuredSignatureValue(headers.signature, parseSignatureInput(headers["signature-input"]).label); }
  catch { return NextResponse.json({ error: "AUTH_INVALID", message: "RFC 9421 Signature header is invalid" }, { status: 401 }); }
  try {
    const url = new URL(request.url);
    const result = await stageRotation(getAppPool(), {
      ...parsed, new_key_algo: parsed.new_key_algo as KeyAlgorithm, request_target: `${url.pathname}${url.search}`, request_body: raw,
      headers: { content_digest: headers["content-digest"], purpose: headers["x-allura-purpose"], audience: headers["x-allura-audience"], nonce: headers["x-allura-nonce"], proof_id: headers["x-allura-proof-id"], device_id: headers["x-allura-device-id"], key_generation: headers["x-allura-key-generation"], signature_input: headers["signature-input"], signature },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RotationError) {
      const status = error.code === "DEVICE_NOT_APPROVED" ? 403 : 401;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    throw error;
  }
}
