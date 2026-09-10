import type { Pool } from "pg";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { emitDeviceAudit } from "./audit";
import { getDeviceAuthAudience, getDeviceAuthOrigin } from "./config";
import { parseSignatureInput, verifyDeviceSignature } from "./rfc9421";
import type { KeyAlgorithm } from "./rfc9421-types";

export type RotationErrorCode = "AUTH_EXPIRED" | "AUTH_INVALID" | "DEVICE_NOT_APPROVED";

export class RotationError extends Error {
  constructor(public readonly code: RotationErrorCode, message: string) {
    super(message);
    this.name = "RotationError";
  }
}

export interface StageRotationInput {
  device_id: string;
  new_public_key: string;
  new_key_id: string;
  new_key_algo: KeyAlgorithm;
  idempotency_key: string;
  request_target: string;
  request_body: Uint8Array;
  headers: {
    content_digest: string;
    purpose: string;
    audience: string;
    nonce: string;
    proof_id: string;
    device_id: string;
    key_generation: string;
    signature_input: string;
    signature: string;
  };
}

export interface StageRotationResult {
  receipt_id: string;
  rotation_receipt: {
    device_id: string;
    new_key_id: string;
    issued_at: string;
    grace_expires_at: null;
    signature: string;
  };
}

const requiredComponents = [
  "@method", "@target-uri", "content-digest", "x-allura-purpose",
  "x-allura-audience", "x-allura-nonce", "x-allura-proof-id",
  "x-allura-device-id", "x-allura-key-generation",
];

function matches(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hasCoverage(components: readonly string[]): boolean {
  const covered = new Set(components.map((component) => component.toLowerCase()));
  return requiredComponents.every((component) => covered.has(component));
}

function hasCurrentSignatureWindow(
  created: number,
  expires: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  return Number.isFinite(created) && Number.isFinite(expires) &&
    created <= nowSeconds && expires > nowSeconds && expires >= created;
}

function isStoredRotationReceipt(value: unknown, pendingPublicKey: string, pendingKeyAlgo: KeyAlgorithm): value is StageRotationResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const receipt = record.rotation_receipt;
  if (!receipt || typeof receipt !== "object") return false;
  const nested = receipt as Record<string, unknown>;
  if (typeof record.receipt_id !== "string" || typeof nested.device_id !== "string" ||
    typeof nested.new_key_id !== "string" || typeof nested.issued_at !== "string" ||
    nested.grace_expires_at !== null || typeof nested.signature !== "string") return false;
  return matches(nested.signature, receiptSignature({
    receipt_id: record.receipt_id,
    device_id: nested.device_id,
    new_key_id: nested.new_key_id,
    issued_at: nested.issued_at,
    grace_expires_at: null,
  }, pendingPublicKey, pendingKeyAlgo));
}

function rotationReceiptKey(): Buffer {
  const rootSecret = process.env.ALLURA_MCP_TOKEN_SECRET;
  if (!rootSecret || rootSecret.length < 16) throw new Error("ALLURA_MCP_TOKEN_SECRET must be configured with at least 16 characters for rotation receipts");
  return createHmac("sha256", rootSecret).update("allura/device-pairing/rotation-receipt/v1").digest();
}

function canonicalReceipt(
  payload: Omit<StageRotationResult["rotation_receipt"], "signature"> & { receipt_id: string },
  pendingPublicKey: string,
  pendingKeyAlgo: KeyAlgorithm,
): string {
  const publicKeyDigest = createHash("sha256").update(pendingPublicKey).digest("base64url");
  return [payload.receipt_id, payload.device_id, payload.new_key_id, payload.issued_at, "", publicKeyDigest, pendingKeyAlgo].join("\n");
}

function receiptSignature(
  payload: Omit<StageRotationResult["rotation_receipt"], "signature"> & { receipt_id: string },
  pendingPublicKey: string,
  pendingKeyAlgo: KeyAlgorithm,
): string {
  return createHmac("sha256", rotationReceiptKey()).update(canonicalReceipt(payload, pendingPublicKey, pendingKeyAlgo)).digest("base64url");
}

export async function stageRotation(pool: Pool, input: StageRotationInput): Promise<StageRotationResult> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const route = await client.query<{ group_id: string | null }>("SELECT resolve_device_route($1) AS group_id", [input.device_id]);
    const groupId = route.rows[0]?.group_id;
    if (!groupId) throw new RotationError("DEVICE_NOT_APPROVED", "Device is not approved");
    await client.query("SELECT set_config('app.current_group_id', $1, true)", [groupId]);
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [groupId]);

    const locked = await client.query<{
      id: string; group_id: string; workspace_id: string; principal_id: string; lifecycle_state: string;
      current_public_key: string; current_key_id: string; current_key_algo: KeyAlgorithm; key_generation: number;
      pending_next_public_key: string | null; pending_next_key_id: string | null;
      pending_next_key_algo: KeyAlgorithm | null;
      rotation_idempotency_key: string | null; rotation_receipt: StageRotationResult | null;
    }>(`SELECT id, group_id, workspace_id, principal_id, lifecycle_state, current_public_key, current_key_id,
          current_key_algo, key_generation, pending_next_public_key, pending_next_key_id, pending_next_key_algo, rotation_idempotency_key, rotation_receipt
        FROM paired_devices WHERE id = $1 FOR UPDATE`, [input.device_id]);
    const device = locked.rows[0];
    if (!device || device.lifecycle_state !== "APPROVED") throw new RotationError("DEVICE_NOT_APPROVED", "Device is not approved");
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [device.workspace_id]);
    await client.query("SELECT set_config('app.current_principal', $1, true)", [device.principal_id]);

    const isReplay = device.rotation_idempotency_key === input.idempotency_key && typeof device.pending_next_public_key === "string";
    if (isReplay) {
      const receipt = device.rotation_receipt;
      if (device.pending_next_key_algo === null || !isStoredRotationReceipt(receipt, device.pending_next_public_key!, device.pending_next_key_algo) || receipt.rotation_receipt.device_id !== device.id ||
        receipt.rotation_receipt.new_key_id !== device.pending_next_key_id ||
        input.new_public_key !== device.pending_next_public_key || input.new_key_id !== device.pending_next_key_id ||
        input.new_key_algo !== device.pending_next_key_algo) {
        throw new RotationError("AUTH_INVALID", "Persisted rotation receipt is unavailable or invalid");
      }
    }
    if (!isReplay && device.pending_next_public_key) {
      throw new RotationError("AUTH_INVALID", "Device rotation is already staged");
    }

    const challenge = await client.query<{ id: string; nonce: string; audience: string; purpose: string; expires_at: string; consumed_at: string | null }>(
      `SELECT id, nonce, audience, purpose, expires_at, consumed_at FROM device_challenges
       WHERE id = $1 AND paired_device_id = $2 FOR UPDATE`, [input.headers.proof_id, device.id]);
    const row = challenge.rows[0];
    if (!row || row.purpose !== "rotation_stage" || new Date(row.expires_at).getTime() <= Date.now() ||
      !matches(row.nonce, input.headers.nonce) || !matches(row.audience, input.headers.audience) ||
      (!isReplay && row.consumed_at !== null)) {
      throw new RotationError("AUTH_EXPIRED", "Rotation challenge is expired or invalid");
    }
    let params;
    try { params = parseSignatureInput(input.headers.signature_input); } catch { throw new RotationError("AUTH_INVALID", "RFC 9421 signature input is invalid"); }
    if (!hasCoverage(params.coveredComponents) || !hasCurrentSignatureWindow(params.created, params.expires) ||
      input.headers.purpose !== "rotation_stage" ||
      input.headers.device_id !== device.id || Number(input.headers.key_generation) !== device.key_generation ||
      params.keyid !== device.current_key_id) throw new RotationError("AUTH_INVALID", "RFC 9421 rotation_stage proof is invalid");
    const proof = verifyDeviceSignature({ method: "POST", requestTarget: input.request_target, body: input.request_body,
      contentDigestHeader: input.headers.content_digest, purpose: "rotation_stage", audience: input.headers.audience,
      nonce: input.headers.nonce, proofId: input.headers.proof_id, deviceId: input.headers.device_id,
      keyGeneration: device.key_generation, signatureInputHeader: input.headers.signature_input, signatureHeader: input.headers.signature,
      publicKey: device.current_public_key, keyAlgorithm: device.current_key_algo, signatureParams: params }, getDeviceAuthOrigin(), getDeviceAuthAudience());
    if (!proof.valid || proof.purpose !== "rotation_stage") throw new RotationError("AUTH_INVALID", "RFC 9421 rotation_stage proof is invalid");

    if (isReplay) {
      await client.query("COMMIT");
      committed = true;
      return device.rotation_receipt!;
    }

    const consumed = await client.query<{ id: string }>(
      "UPDATE device_challenges SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL RETURNING id",
      [row.id],
    );
    if (!consumed.rows[0]) throw new RotationError("AUTH_EXPIRED", "Rotation challenge is expired or invalid");
    const receiptId = `rot_${randomUUID()}`;
    const issuedAt = new Date().toISOString();
    const receipt = { device_id: device.id, new_key_id: input.new_key_id, issued_at: issuedAt, grace_expires_at: null };
    const result: StageRotationResult = { receipt_id: receiptId, rotation_receipt: { ...receipt, signature: receiptSignature({ receipt_id: receiptId, ...receipt }, input.new_public_key, input.new_key_algo) } };
    await client.query(`UPDATE paired_devices SET pending_next_public_key = $1, pending_next_key_id = $2,
      pending_next_key_algo = $3, rotation_idempotency_key = $4, rotation_receipt = $5::jsonb WHERE id = $6`,
      [input.new_public_key, input.new_key_id, input.new_key_algo, input.idempotency_key, JSON.stringify(result), device.id]);
    await emitDeviceAudit(client, { group_id: groupId, workspace_id: device.workspace_id, event_type: "DEVICE_ROTATION_STAGED", agent_id: device.principal_id,
      metadata: { device_id: device.id, challenge_id: row.id, new_key_id: input.new_key_id, receipt_id: receiptId } });
    await client.query("COMMIT"); committed = true;
    return result;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
