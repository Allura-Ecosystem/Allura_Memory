import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { getAuthConfig } from "@/lib/auth/config";
import { createDeviceToken } from "@/lib/mcp-token/repository";
import { emitDeviceAudit } from "./audit";
import { hashAuthorizationCode } from "./authorization-code";
import { verifyPkceS256 } from "./pkce";
import { getDeviceAuthAudience, getDeviceAuthOrigin } from "./config";
import { parseSignatureInput, verifyDeviceSignature } from "./rfc9421";
import type { KeyAlgorithm } from "./rfc9421-types";
import { acquireDeviceCountLock, countApprovedDevices, getDeviceLimit } from "./device-limit";

export type CompletionErrorCode =
  | "ENROLLMENT_NOT_FOUND"
  | "ENROLLMENT_CONSUMED"
  | "ENROLLMENT_EXPIRED"
  | "ENROLLMENT_NOT_APPROVED"
  | "CODE_EXPIRED"
  | "COMPLETION_NONCE_EXPIRED"
  | "INVALID_CODE"
  | "COMPLETION_NONCE_MISMATCH"
  | "PKCE_MISMATCH"
  | "AUTH_INVALID"
  | "MEMBERSHIP_INACTIVE"
  | "WORKSPACE_NOT_FOUND"
  | "DEVICE_LIMIT_EXCEEDED";

export class CompletionError extends Error {
  constructor(public readonly code: CompletionErrorCode, message: string) {
    super(message);
    this.name = "CompletionError";
  }
}

export interface CompletePairingInput {
  enrollment_transaction_id: string;
  authorization_code: string;
  completion_nonce: string;
  pkce_verifier: string;
  request_target: string;
  request_body: Uint8Array;
  headers: {
    content_digest: string;
    purpose: string;
    audience: string;
    nonce: string;
    proof_id: string;
    signature_input: string;
    signature: string;
  };
}

export interface CompletePairingResult {
  device_id: string;
  access_token: string;
  expires_at: string;
  mcp_endpoint: string;
}

const requiredPairingComponents = [
  "@method",
  "@target-uri",
  "content-digest",
  "x-allura-purpose",
  "x-allura-audience",
  "x-allura-nonce",
  "x-allura-proof-id",
] as const;

function hasRequiredPairingComponents(coveredComponents: readonly string[]): boolean {
  const covered = new Set(coveredComponents.map((component) => component.toLowerCase()));
  return requiredPairingComponents.every((component) => covered.has(component));
}

function hasCurrentPairingSignatureWindow(created: number, expires: number, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return Number.isFinite(created) && Number.isFinite(expires) &&
    created <= nowSeconds && expires > nowSeconds && expires >= created;
}

function hashesMatch(expected: string | null | undefined, actual: string): boolean {
  if (!expected) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function resolveMcpEndpoint(): string {
  const base = new URL(getAuthConfig().ALLURA_MCP_BASE_URL);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("MCP gateway URL must use HTTP(S)");
  }
  return new URL("/mcp", base).toString();
}

export async function completePairing(
  pool: Pool,
  input: CompletePairingInput,
): Promise<CompletePairingResult> {
  const mcpEndpoint = resolveMcpEndpoint();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      "SELECT * FROM device_enrollment_lock_for_complete($1)",
      [input.enrollment_transaction_id],
    );
    if (locked.rows.length === 0) {
      throw new CompletionError("ENROLLMENT_NOT_FOUND", "Enrollment transaction not found");
    }

    const enrollment = locked.rows[0] as {
      state?: string | null;
      display_label?: string | null;
      authorization_code_expires_at?: string | null;
      completion_nonce_expires_at?: string | null;
      authorization_code_hash?: string | null;
      completion_nonce?: string | null;
      pkce_code_challenge?: string | null;
      public_key?: string | null;
      key_id?: string | null;
      key_algo?: KeyAlgorithm | null;
      approved_principal_id?: string | null;
      approved_group_id?: string | null;
      approved_workspace_id?: string | null;
    };
    if (enrollment.state === "CONSUMED") {
      throw new CompletionError("ENROLLMENT_CONSUMED", "Enrollment has already been consumed");
    }
    if (enrollment.state === "EXPIRED") {
      throw new CompletionError("ENROLLMENT_EXPIRED", "Enrollment has expired");
    }
    if (enrollment.state !== "APPROVED") {
      throw new CompletionError("ENROLLMENT_NOT_APPROVED", "Enrollment is not approved for completion");
    }
    if (enrollment.authorization_code_expires_at != null &&
      new Date(enrollment.authorization_code_expires_at).getTime() <= Date.now()) {
      const expiry = await client.query<{ expired: boolean }>(
        "SELECT device_enrollment_expire($1) AS expired",
        [input.enrollment_transaction_id],
      );
      if (!expiry.rows[0]?.expired) {
        throw new CompletionError("ENROLLMENT_EXPIRED", "Enrollment expiration transition did not occur");
      }
      await emitDeviceAudit(client, {
        group_id: "allura-system",
        event_type: "DEVICE_ENROLL_EXPIRED",
        agent_id: "device-enrollment",
        metadata: { enrollment_transaction_id: input.enrollment_transaction_id, reason_code: "CODE_EXPIRED" },
      });
      throw new CompletionError("CODE_EXPIRED", "Authorization code has expired");
    }
    if (enrollment.completion_nonce_expires_at != null &&
      new Date(enrollment.completion_nonce_expires_at).getTime() <= Date.now()) {
      const expiry = await client.query<{ expired: boolean }>(
        "SELECT device_enrollment_expire($1) AS expired",
        [input.enrollment_transaction_id],
      );
      if (!expiry.rows[0]?.expired) {
        throw new CompletionError("ENROLLMENT_EXPIRED", "Enrollment expiration transition did not occur");
      }
      await emitDeviceAudit(client, {
        group_id: "allura-system",
        event_type: "DEVICE_ENROLL_EXPIRED",
        agent_id: "device-enrollment",
        metadata: { enrollment_transaction_id: input.enrollment_transaction_id, reason_code: "COMPLETION_NONCE_EXPIRED" },
      });
      throw new CompletionError("COMPLETION_NONCE_EXPIRED", "Completion nonce has expired");
    }

    if (!hashesMatch(enrollment.authorization_code_hash, hashAuthorizationCode(input.authorization_code))) {
      throw new CompletionError("INVALID_CODE", "Authorization code is invalid");
    }
    if (!hashesMatch(enrollment.completion_nonce, input.completion_nonce)) {
      throw new CompletionError("COMPLETION_NONCE_MISMATCH", "Completion nonce does not match");
    }
    if (!verifyPkceS256(input.pkce_verifier, enrollment.pkce_code_challenge ?? "")) {
      throw new CompletionError("PKCE_MISMATCH", "PKCE verifier does not match");
    }
    if (!enrollment.public_key || !enrollment.key_id || !enrollment.key_algo) {
      throw new CompletionError("AUTH_INVALID", "Enrollment signing authority is invalid");
    }

    let signatureParams;
    try {
      signatureParams = parseSignatureInput(input.headers.signature_input);
    } catch {
      throw new CompletionError("AUTH_INVALID", "RFC 9421 signature input is invalid");
    }
    if (!hasRequiredPairingComponents(signatureParams.coveredComponents) ||
      !hasCurrentPairingSignatureWindow(signatureParams.created, signatureParams.expires)) {
      throw new CompletionError("AUTH_INVALID", "RFC 9421 pairing_complete proof has invalid coverage or validity window");
    }
    const proof = verifyDeviceSignature({
      method: "POST",
      requestTarget: input.request_target,
      body: input.request_body,
      contentDigestHeader: input.headers.content_digest,
      purpose: input.headers.purpose as "pairing_complete",
      audience: input.headers.audience,
      nonce: input.headers.nonce,
      proofId: input.headers.proof_id,
      signatureInputHeader: input.headers.signature_input,
      signatureHeader: input.headers.signature,
      publicKey: enrollment.public_key,
      keyAlgorithm: enrollment.key_algo,
      signatureParams,
    }, getDeviceAuthOrigin(), getDeviceAuthAudience());
    if (!proof.valid || proof.purpose !== "pairing_complete" ||
      !hashesMatch(enrollment.completion_nonce, input.headers.nonce) ||
      input.headers.proof_id !== input.enrollment_transaction_id ||
      input.headers.purpose !== "pairing_complete" ||
      signatureParams.keyid !== enrollment.key_id) {
      throw new CompletionError("AUTH_INVALID", "RFC 9421 pairing_complete proof is invalid");
    }
    if (!enrollment.approved_principal_id || !enrollment.approved_group_id || !enrollment.approved_workspace_id) {
      throw new CompletionError("AUTH_INVALID", "Enrollment approval authority is invalid");
    }
    await client.query("SELECT set_config('app.current_group_id', $1, true)", [enrollment.approved_group_id]);
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [enrollment.approved_group_id]);
    await client.query("SELECT set_config('app.current_principal', $1, true)", [enrollment.approved_principal_id]);
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [enrollment.approved_workspace_id]);
    await acquireDeviceCountLock(
      client,
      enrollment.approved_group_id,
      enrollment.approved_workspace_id,
      enrollment.approved_principal_id,
    );
    const membership = await client.query<{ role: string }>(
      "SELECT role FROM memberships WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL FOR UPDATE",
      [enrollment.approved_group_id, enrollment.approved_principal_id],
    );
    if (membership.rows.length === 0) {
      throw new CompletionError("MEMBERSHIP_INACTIVE", "Approved principal no longer has active membership");
    }
    const workspace = await client.query<{ lock_mode: string }>(
      "SELECT lock_mode FROM workspaces WHERE workspace_id = $1 AND group_id = $2",
      [enrollment.approved_workspace_id, enrollment.approved_group_id],
    );
    if (workspace.rows.length === 0) {
      throw new CompletionError("WORKSPACE_NOT_FOUND", "Approved workspace no longer exists");
    }
    const approvedDeviceCount = await countApprovedDevices(
      client,
      enrollment.approved_group_id,
      enrollment.approved_workspace_id,
      enrollment.approved_principal_id,
    );
    const deviceLimit = getDeviceLimit();
    if (approvedDeviceCount >= deviceLimit) {
      throw new CompletionError("DEVICE_LIMIT_EXCEEDED", `Device limit (${deviceLimit}) reached`);
    }

    const deviceId = `dev_${randomUUID()}`;
    const pairedDevice = await client.query<{ id: string }>(
      `INSERT INTO paired_devices
         (id, principal_id, group_id, workspace_id, display_label,
          current_public_key, current_key_id, current_key_algo, enrollment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        deviceId,
        enrollment.approved_principal_id,
        enrollment.approved_group_id,
        enrollment.approved_workspace_id,
        enrollment.display_label ?? "Paired device",
        enrollment.public_key,
        enrollment.key_id,
        enrollment.key_algo,
        input.enrollment_transaction_id,
      ],
    );
    const pairedDeviceId = pairedDevice.rows[0]?.id;
    if (!pairedDeviceId) throw new Error("Paired device insert did not return an id");

    const token = await createDeviceToken(client, {
      paired_device_id: pairedDeviceId,
      membership_role: membership.rows[0]?.role ?? "",
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    if (!token.record.expires_at) throw new Error("Device token must have an expiry");

    await emitDeviceAudit(client, {
      group_id: enrollment.approved_group_id,
      workspace_id: enrollment.approved_workspace_id,
      event_type: "DEVICE_PAIRING_COMPLETE",
      agent_id: enrollment.approved_principal_id,
      metadata: {
        enrollment_transaction_id: input.enrollment_transaction_id,
        paired_device_id: pairedDeviceId,
      },
    });
    await client.query("SELECT device_enrollment_consume($1)", [input.enrollment_transaction_id]);
    await client.query("COMMIT");
    return {
      device_id: pairedDeviceId,
      access_token: token.raw,
      expires_at: token.record.expires_at,
      mcp_endpoint: mcpEndpoint,
    };
  } catch (error) {
    const persistsExpiry = error instanceof CompletionError &&
      (error.code === "CODE_EXPIRED" || error.code === "COMPLETION_NONCE_EXPIRED");
    await client.query(persistsExpiry ? "COMMIT" : "ROLLBACK");
    if (error instanceof CompletionError && !persistsExpiry && error.code !== "ENROLLMENT_NOT_FOUND") {
      await emitDeviceAudit(client, {
        group_id: "allura-system",
        event_type: "DEVICE_ENROLL_DENIED",
        agent_id: "device-enrollment",
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
          reason_code: error.code,
        },
      });
    }
    throw error;
  } finally {
    client.release();
  }
}
