/**
 * Story 29.3 — Authorization Code and Completion Nonce utilities.
 *
 * Architecture reference: Epic 29 §4.2 step 10-11, §4.2b, §8.2, AD-65.
 *
 * Pure functions only — no DB, no API route, no network, no persistent storage.
 *
 * Key invariants:
 * - The authorization code is 256-bit (32 bytes), base64url-encoded, and
 *   shown to the browser exactly once via the approve callback. The server
 *   stores ONLY `SHA-256(code)` as hex (`authorization_code_hash`) — never
 *   the raw code (§4.2 step 10, NFR1, AC-25).
 * - The completion nonce is 32 bytes, base64url-encoded, and bound to
 *   `(authorization_code_hash, enrollment_id, public_key)` via a SHA-256
 *   `bindingDigest` (§4.2 step 11). It has a 60-second TTL.
 * - Replay is rejected: a consumed nonce cannot be re-bound to a fresh code
 *   because the bindingDigest would not match the expected inputs.
 * - No raw code or verifier is ever serialized into a log/event (NFR1, AC-25).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Authorization code entropy: 256 bits (32 bytes). */
const AUTHORIZATION_CODE_BYTES = 32;
/** Completion nonce entropy: 256 bits (32 bytes). */
const COMPLETION_NONCE_BYTES = 32;
/** Default completion nonce TTL: 60 seconds (§4.2 step 11, architecture §8.2). */
export const DEFAULT_COMPLETION_NONCE_TTL_MS = 60_000;

/**
 * A bound completion nonce. The `bindingDigest` is the SHA-256 hex of the
 * canonical binding input `(nonce, authorization_code_hash, enrollment_id,
 * public_key)`. The server stores the nonce and its expiry; the bindingDigest
 * is recomputed at `/complete` and compared to detect tampering or replay.
 */
export interface CompletionNonceBinding {
  /** The base64url nonce value (also stored on the enrollment row). */
  nonce: string;
  /** SHA-256(code) as hex — the only storable form of the code. */
  authorizationCodeHash: string;
  /** The enrollment transaction ID this nonce is bound to. */
  enrollmentId: string;
  /** The device public key (PEM or base64 SPKI DER) this nonce is bound to. */
  publicKey: string;
  /** SHA-256 hex of the canonical binding input — tamper/replay detection. */
  bindingDigest: string;
}

/**
 * Generate a 256-bit authorization code as base64url (no padding).
 *
 * The raw code is returned to the caller ONCE (to place in the approve
 * callback URL) and is NEVER persisted. The server stores only
 * `hashAuthorizationCode(code)` (§4.2 step 10).
 */
export function generateAuthorizationCode(): string {
  return randomBytes(AUTHORIZATION_CODE_BYTES).toString("base64url");
}

/**
 * Hash an authorization code with SHA-256, returning a lowercase hex digest.
 *
 * This is the ONLY form of the code that may be persisted to the
 * `authorization_code_hash` column (§4.2 step 10, NFR1, AC-25).
 */
export function hashAuthorizationCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Generate a 32-byte completion nonce as base64url (no padding).
 *
 * The nonce is bound to `(authorization_code_hash, enrollment_id, public_key)`
 * via `bindCompletionNonce` and has a 60-second TTL (§4.2 step 11).
 */
export function generateCompletionNonce(): string {
  return randomBytes(COMPLETION_NONCE_BYTES).toString("base64url");
}

/**
 * Bind a completion nonce to `(authorization_code_hash, enrollment_id,
 * public_key)` (architecture §4.2 step 11).
 *
 * Returns a `CompletionNonceBinding` whose `bindingDigest` is the SHA-256 hex
 * of the canonical binding input. At `/complete`, the server recomputes the
 * digest from the presented nonce + the expected stored values and compares
 * it to the presented `bindingDigest` to detect tampering or replay.
 */
export function bindCompletionNonce(input: {
  nonce: string;
  authorizationCodeHash: string;
  enrollmentId: string;
  publicKey: string;
}): CompletionNonceBinding {
  const canonical = canonicalBindingInput(
    input.nonce,
    input.authorizationCodeHash,
    input.enrollmentId,
    input.publicKey,
  );
  const bindingDigest = createHash("sha256").update(canonical).digest("hex");
  return {
    nonce: input.nonce,
    authorizationCodeHash: input.authorizationCodeHash,
    enrollmentId: input.enrollmentId,
    publicKey: input.publicKey,
    bindingDigest,
  };
}

/**
 * Verify a presented completion nonce binding against the expected stored
 * values, the issuance time, and the TTL.
 *
 * Returns `{ valid: true, reason: "ok" }` only if ALL of the following hold:
 *   1. The presented `bindingDigest` matches the recomputed digest of
 *      `(presented.nonce, expected.authorizationCodeHash, expected.enrollmentId,
 *      expected.publicKey)` — i.e. the nonce is genuinely bound to the right
 *      code/enrollment/PK (§4.2 step 11).
 *   2. The nonce has not expired (`now - issuedAt <= ttlMs`).
 *
 * Returns `{ valid: false, reason }` otherwise:
 *   - `"expired"` — the nonce is past its TTL.
 *   - `"binding_mismatch"` — the binding digest does not match, indicating
 *     tampering, replay, or a wrong code/enrollment/PK.
 *
 * Comparison of digests is constant-time to avoid timing oracles.
 */
export function verifyCompletionNonceBinding(input: {
  presented: CompletionNonceBinding;
  expected: {
    authorizationCodeHash: string;
    enrollmentId: string;
    publicKey: string;
  };
  /** Epoch ms when the nonce was issued (stored as `completion_nonce_expires_at`). */
  issuedAt: number;
  /** Current epoch ms (injected for testability). */
  now: number;
  /** TTL in ms; defaults to 60s (§4.2 step 11). */
  ttlMs?: number;
}): { valid: boolean; reason: "ok" | "expired" | "binding_mismatch" } {
  const ttl = input.ttlMs ?? DEFAULT_COMPLETION_NONCE_TTL_MS;

  // 1. Expiry check
  if (input.now - input.issuedAt > ttl) {
    return { valid: false, reason: "expired" };
  }

  // 2. Binding integrity: recompute the digest from the presented nonce +
  //    the EXPECTED stored values, and compare to the presented digest.
  const expectedCanonical = canonicalBindingInput(
    input.presented.nonce,
    input.expected.authorizationCodeHash,
    input.expected.enrollmentId,
    input.expected.publicKey,
  );
  const expectedDigest = createHash("sha256")
    .update(expectedCanonical)
    .digest("hex");

  const a = Buffer.from(input.presented.bindingDigest, "hex");
  const b = Buffer.from(expectedDigest, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "binding_mismatch" };
  }

  return { valid: true, reason: "ok" };
}

/**
 * Canonical binding input: a deterministic, length-prefixed concatenation of
 * the bound fields. Length-prefixing prevents field-boundary ambiguity
 * (e.g. enrollment_id="a", publicKey="bc" vs enrollment_id="ab", publicKey="c").
 */
function canonicalBindingInput(
  nonce: string,
  authorizationCodeHash: string,
  enrollmentId: string,
  publicKey: string,
): string {
  return [
    nonce.length,
    nonce,
    authorizationCodeHash.length,
    authorizationCodeHash,
    enrollmentId.length,
    enrollmentId,
    publicKey.length,
    publicKey,
  ].join(":");
}