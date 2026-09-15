/**
 * Story 29.4 — Enrollment service.
 *
 * Architecture §4.1 (enrollment contract), §3.1 (device_enrollment_create
 * SECURITY DEFINER), §11.1 (pre-human audit, fail-closed), AD-65 (verifier
 * never in URL), AD-63 (callback allowlist).
 *
 * Responsibilities:
 *  - Validate PKCE `code_challenge` (RFC 7636 S256) and `pkce_state` are present
 *    and well-formed.
 *  - Validate `key_algorithm` is in the server-accepted set.
 *  - Validate `callback_type` against the deployment allowlist.
 *  - Insert a `device_enrollments` PENDING row by calling the
 *    `device_enrollment_create()` SECURITY DEFINER function. No
 *    group_id/workspace_id/principal_id is set — the table carries no tenant
 *    authority before approval (CHECK constraint `chk_enroll_pending_no_auth`).
 *  - Emit `DEVICE_ENROLL_REQUESTED` audit with `group_id = "allura-system"`,
 *    `agent_id = "device-enrollment"` transactionally (fail-closed).
 *  - Construct the pairing URL containing `txn` and `state` only — the PKCE
 *    verifier is never in the URL (AD-65, §4.1 step 5).
 *
 * Non-goals (Story 29.4 scope):
 *  - No `/approve`, `/complete`, Clerk integration, or device limit check.
 */
import type { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { emitDeviceAudit } from "./audit";
import {
  getDeviceAuthOrigin,
  getEnrollmentTtlMs,
  getPairingCallbackAllowlist,
} from "./config";
import { validateDevicePublicKey } from "./rfc9421";
import type { KeyAlgorithm } from "./rfc9421-types";

/** Server-accepted public-key algorithms (architecture §4.1 step 2, §9.1). */
export const ACCEPTED_KEY_ALGORITHMS = new Set([
  "ecdsa-p256",
  "ed25519",
  "rsa-pss-2048",
]);

/** RFC 7636 S256 is the only supported challenge method. */
const REQUIRED_CHALLENGE_METHOD = "S256";

/** Pre-human enrollment audit identity (MED-F3, AR11). */
const PREHUMAN_GROUP_ID = "allura-system";
const PREHUMAN_AGENT_ID = "device-enrollment";

/** Enrollment request body after validation. */
export interface EnrollmentInput {
  device_label: string;
  callback_type: string;
  callback_uri: string;
  pkce_code_challenge: string;
  pkce_code_challenge_method: string;
  pkce_state: string;
  public_key: string;
  key_id: string;
  key_algorithm: string;
}

/** Result of a successful enrollment creation. */
export interface EnrollmentResult {
  enrollment_transaction_id: string;
  pairing_url: string;
  expires_at: string;
}

/** Validation error codes (architecture §4.1 error codes). */
export type EnrollmentErrorCode =
  | "INVALID_PKCE"
  | "INVALID_PUBLIC_KEY"
  | "INVALID_KEY_ALGORITHM"
  | "INVALID_CALLBACK_URI"
  | "CALLBACK_TYPE_DISABLED";

export class EnrollmentValidationError extends Error {
  constructor(
    public readonly code: EnrollmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EnrollmentValidationError";
  }
}

/**
 * Compute a short SHA-256 fingerprint of the public key for audit metadata
 * (architecture §11.1 — `key_fingerprint`). Uses the first 16 hex chars of
 * SHA-256(PEM). Never logs the key itself.
 */
function keyFingerprint(publicKey: string): string {
  return createHash("sha256").update(publicKey).digest("hex").slice(0, 16);
}

/**
 * Validate the enrollment input fields.
 *
 * Architecture §4.1 step 1-3:
 *  1. Validate `pkce_code_challenge` (RFC 7636 S256) and `pkce_state`.
 *  2. Validate `key_algorithm` is in the server-accepted set.
 *  3. Validate `callback_type` against the deployment allowlist.
 */
export function validateEnrollmentInput(input: EnrollmentInput): void {
  // 1. PKCE validation
  if (!input.pkce_code_challenge || input.pkce_code_challenge.trim() === "") {
    throw new EnrollmentValidationError("INVALID_PKCE", "pkce_code_challenge is required");
  }
  // RFC 7636 S256: SHA-256 digest encoded as unpadded base64url is exactly 43 chars.
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.pkce_code_challenge)) {
    throw new EnrollmentValidationError(
      "INVALID_PKCE",
      "pkce_code_challenge must be an unpadded 43-character S256 base64url value",
    );
  }
  if (
    !input.pkce_code_challenge_method ||
    input.pkce_code_challenge_method !== REQUIRED_CHALLENGE_METHOD
  ) {
    throw new EnrollmentValidationError(
      "INVALID_PKCE",
      `pkce_code_challenge_method must be ${REQUIRED_CHALLENGE_METHOD}`,
    );
  }
  if (!input.pkce_state || input.pkce_state.trim() === "") {
    throw new EnrollmentValidationError("INVALID_PKCE", "pkce_state is required");
  }
  if (input.pkce_state.length < 16) {
    throw new EnrollmentValidationError(
      "INVALID_PKCE",
      "pkce_state must be at least 16 characters",
    );
  }
  if (!input.device_label || input.device_label.trim() === "") {
    throw new EnrollmentValidationError("INVALID_PKCE", "device_label is required");
  }

  // 2. Public key validation
  if (!input.public_key || input.public_key.trim() === "") {
    throw new EnrollmentValidationError("INVALID_PUBLIC_KEY", "public_key is required");
  }
  const publicKey = input.public_key.trim();
  if (!input.key_id || input.key_id.trim() === "") {
    throw new EnrollmentValidationError("INVALID_PUBLIC_KEY", "key_id is required");
  }

  // 3. Key algorithm validation
  if (!input.key_algorithm || !ACCEPTED_KEY_ALGORITHMS.has(input.key_algorithm)) {
    throw new EnrollmentValidationError(
      "INVALID_KEY_ALGORITHM",
      `key_algorithm must be one of: ${[...ACCEPTED_KEY_ALGORITHMS].join(", ")}`,
    );
  }

  // Use the RFC 9421 key loader as the single enrollment authority. It admits
  // only algorithm-compatible SPKI PEM or canonical standard-base64 SPKI DER.
  // JWK is intentionally not a server enrollment format.
  const keyAlgorithm = input.key_algorithm as KeyAlgorithm;
  if (!validateDevicePublicKey(keyAlgorithm, publicKey)) {
    const message = publicKey.startsWith("{")
      ? "public_key must be a valid SPKI PEM or standard-base64 SPKI DER; JWK is not supported"
      : "public_key must be a valid SPKI PEM or standard-base64 SPKI DER";
    throw new EnrollmentValidationError("INVALID_PUBLIC_KEY", message);
  }

  // 4. Callback type allowlist (AD-63, LOW-F4)
  const allowlist = getPairingCallbackAllowlist();
  if (!allowlist.includes(input.callback_type)) {
    throw new EnrollmentValidationError(
      "CALLBACK_TYPE_DISABLED",
      `callback_type '${input.callback_type}' is not enabled for this deployment`,
    );
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(input.callback_uri);
  } catch {
    throw new EnrollmentValidationError(
      "INVALID_CALLBACK_URI",
      "callback_uri must be a valid absolute URI",
    );
  }
  if (
    input.callback_type === "deep_link" &&
    input.callback_uri !== "allura-pairing://complete"
  ) {
    throw new EnrollmentValidationError(
      "INVALID_CALLBACK_URI",
      "deep_link callback_uri must be allura-pairing://complete",
    );
  }
  if (
    input.callback_type === "loopback" &&
    (
      callbackUrl.protocol !== "http:" ||
      callbackUrl.hostname !== "127.0.0.1" ||
      callbackUrl.pathname !== "/callback" ||
      callbackUrl.search !== "" ||
      callbackUrl.hash !== "" ||
      callbackUrl.username !== "" ||
      callbackUrl.password !== "" ||
      !/^(?:4915[2-9]|491[6-9][0-9]|49[2-9][0-9]{2}|5[0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/.test(callbackUrl.port)
    )
  ) {
    throw new EnrollmentValidationError(
      "INVALID_CALLBACK_URI",
      "loopback callback_uri must target http://127.0.0.1:<ephemeral-port>/callback",
    );
  }
}

/**
 * Construct the pairing URL (architecture §4.1 step 5, AD-65).
 *
 * The URL contains `txn` and `state` only — the PKCE verifier is never in the
 * URL. The origin is the configured device-auth origin
 * (`ALLURA_DEVICE_AUTH_ORIGIN`).
 */
export function buildPairingUrl(
  origin: string,
  enrollmentTransactionId: string,
  pkceState: string,
): string {
  const base = origin.replace(/\/$/, "");
  const url = new URL(`${base}/pair`);
  url.searchParams.set("txn", enrollmentTransactionId);
  url.searchParams.set("state", pkceState);
  return url.toString();
}

/**
 * Create an enrollment transaction.
 *
 * Runs the `device_enrollment_create()` SECURITY DEFINER function and the
 * `DEVICE_ENROLL_REQUESTED` audit insert inside the same PostgreSQL
 * transaction (fail-closed: if either fails, the transaction rolls back).
 *
 * The caller supplies the pool; this function opens a client, begins a
 * transaction, calls the function, emits audit, and commits.
 */
export async function createEnrollment(
  pool: Pool,
  input: EnrollmentInput,
  options?: { now?: () => Date; uuid?: () => string },
): Promise<EnrollmentResult> {
  // Validate before touching the DB
  validateEnrollmentInput(input);

  const now = options?.now ? options.now() : new Date();
  const enrollmentTransactionId = `enroll_${options?.uuid ? options.uuid() : randomUUID()}`;
  const ttlMs = getEnrollmentTtlMs();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const origin = getDeviceAuthOrigin();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Call device_enrollment_create() SECURITY DEFINER function (§3.1).
    // No group_id/workspace_id/principal_id is passed — the PENDING row
    // carries no tenant authority (chk_enroll_pending_no_auth CHECK).
    await client.query(
      "SELECT device_enrollment_create($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [
        enrollmentTransactionId,
        input.device_label,
        input.public_key,
        input.key_id,
        input.key_algorithm,
        input.pkce_code_challenge,
        input.pkce_code_challenge_method,
        input.pkce_state,
        input.callback_type,
        input.callback_uri,
        expiresAt,
      ],
    );

    // Emit DEVICE_ENROLL_REQUESTED audit (§11.1, MED-F3, AR11).
    // Pre-human: group_id=allura-system, agent_id=device-enrollment.
    // Fail-closed: if this throws, the BEGIN above rolls back.
    await emitDeviceAudit(client, {
      group_id: PREHUMAN_GROUP_ID,
      event_type: "DEVICE_ENROLL_REQUESTED",
      agent_id: PREHUMAN_AGENT_ID,
      metadata: {
        enrollment_transaction_id: enrollmentTransactionId,
        device_label: input.device_label,
        key_fingerprint: keyFingerprint(input.public_key),
        callback_type: input.callback_type,
        key_algorithm: input.key_algorithm,
      },
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const pairingUrl = buildPairingUrl(origin, enrollmentTransactionId, input.pkce_state);

  return {
    enrollment_transaction_id: enrollmentTransactionId,
    pairing_url: pairingUrl,
    expires_at: expiresAt.toISOString(),
  };
}