/**
 * Story 29.2 — RFC 9421 Canonical Signing Envelope — Verifier and Helpers.
 *
 * Architecture reference: Epic 29 §4.4, AD-64, AD-60.
 *
 * Pure functions only — no DB, no API route, no network.
 * The server uses these to verify device proof-of-possession signatures
 * for all 5 purposes: pairing_complete, exchange, rotation_stage,
 * rotation_activate, recovery_status.
 *
 * Key invariants (architecture §4.4):
 * - @target-uri is reconstructed from ALLURA_DEVICE_AUTH_ORIGIN, NOT Host.
 * - Audience is ALLURA_DEVICE_AUTH_AUDIENCE, NOT the MCP endpoint.
 * - Content-Digest is RFC 9530: sha-256=:<standard base64>:
 * - Signature uses standard base64, NOT base64url.
 * - ECDSA P-256 signatures are IEEE P1363 fixed r‖s (64 bytes).
 * - Ed25519 signatures are raw 64 bytes.
 * - RSA-PSS-2048 signatures are 256 bytes.
 * - No private key is ever parsed by the verifier (NFR1).
 */
import { createHash, timingSafeEqual } from "node:crypto";

import type {
  DeviceProof,
  KeyAlgorithm,
  SignatureParams,
  SigningPurpose,
  VerifyResult,
} from "./rfc9421-types";

// ── Content-Digest (RFC 9530) ─────────────────────────────────────────────

/**
 * Compute the RFC 9530 Content-Digest header value for a request body.
 *
 * Format: `sha-256=:<standard base64 of SHA-256(body)>:`
 * Uses standard base64, NOT base64url (architecture §4.4).
 */
export function computeContentDigest(body: Uint8Array): string {
  const hash = createHash("sha256").update(body).digest("base64");
  return `sha-256=:${hash}:`;
}

/**
 * Verify an RFC 9530 Content-Digest header against the actual request body.
 *
 * Returns `true` only if the header is well-formed, uses `sha-256`,
 * and the SHA-256 of `body` matches the embedded digest.
 * Uses timingSafeEqual to avoid timing oracles on the digest comparison.
 */
export function verifyContentDigest(
  body: Uint8Array,
  digestHeader: string,
): boolean {
  const match = /^sha-256=:([A-Za-z0-9+/]+={0,2}):$/.exec(digestHeader);
  if (!match) {
    return false;
  }
  const expectedB64 = match[1];
  const actualHash = createHash("sha256").update(body).digest();
  const expectedHash = Buffer.from(expectedB64, "base64");

  if (actualHash.length !== expectedHash.length) {
    return false;
  }
  return timingSafeEqual(actualHash, expectedHash);
}

// ── @target-uri reconstruction ─────────────────────────────────────────────

/**
 * Reconstruct the RFC 9421 `@target-uri` from the configured origin and
 * the request target (path + query).
 *
 * Architecture §4.4 / AD-64: the origin comes from `ALLURA_DEVICE_AUTH_ORIGIN`,
 * NOT from the untrusted `Host` header. This prevents a proxy that rewrites
 * `Host` from causing the server to verify a signature over a different URI
 * than the client signed.
 *
 * The `origin` argument is injected so the verifier remains pure and testable
 * without reading `process.env` directly.
 */
export function reconstructTargetUri(
  origin: string,
  requestTarget: string,
): string {
  // Normalize: strip trailing slash from origin, ensure target starts with /
  const normalizedOrigin = origin.endsWith("/")
    ? origin.slice(0, -1)
    : origin;
  const normalizedTarget = requestTarget.startsWith("/")
    ? requestTarget
    : `/${requestTarget}`;
  return `${normalizedOrigin}${normalizedTarget}`;
}

// ── ECDSA P-256 DER → P1363 normalization ──────────────────────────────────

/**
 * Convert an ASN.1 DER-encoded ECDSA signature to IEEE P1363 fixed r‖s (64 bytes
 * for P-256).
 *
 * Architecture §4.4: "The bridge/adapter MUST normalize the ECDSA signature
 * from ASN.1 DER (the form most crypto libraries produce) to the fixed 64-byte
 * r‖s concatenation (IEEE P1363 / RFC 4754) before RFC 9421 base64 encoding."
 *
 * The server receives the 64-byte P1363 form. This helper exists so the
 * verifier can handle adapters that accidentally send DER, and so test
 * vectors can include a DER→P1363 normalization case.
 *
 * Throws if the DER structure is malformed or the integers are not exactly
 * 32 bytes each (after leading-zero stripping) for P-256.
 */
export function normalizeEcdsaP1363(derSignature: Uint8Array): Uint8Array {
  const der = Buffer.from(derSignature);
  // ASN.1 SEQUENCE: 0x30 <len> <body>
  if (der[0] !== 0x30) {
    throw new Error("DER signature does not start with SEQUENCE (0x30)");
  }
  // Parse SEQUENCE length (support short form only — ECDSA P-256 DER is always < 128)
  let offset = 1;
  const seqLenByte = der[offset++];
  let seqLen = seqLenByte;
  if (seqLenByte & 0x80) {
    const numBytes = seqLenByte & 0x7f;
    seqLen = 0;
    for (let i = 0; i < numBytes; i++) {
      seqLen = (seqLen << 8) | der[offset++];
    }
  }
  if (offset + seqLen !== der.length) {
    throw new Error("DER SEQUENCE length mismatch");
  }

  // Parse INTEGER r
  if (der[offset] !== 0x02) {
    throw new Error("Expected INTEGER for r");
  }
  offset++;
  const rLen = der[offset++];
  const rBytes = der.subarray(offset, offset + rLen);
  offset += rLen;

  // Parse INTEGER s
  if (der[offset] !== 0x02) {
    throw new Error("Expected INTEGER for s");
  }
  offset++;
  const sLen = der[offset++];
  const sBytes = der.subarray(offset, offset + sLen);
  offset += sLen;

  if (offset !== der.length) {
    throw new Error("Trailing bytes after DER signature");
  }

  // Strip leading zero padding bytes (ASN.1 adds a 0x00 to keep integers positive)
  const rStripped = stripLeadingZero(rBytes);
  const sStripped = stripLeadingZero(sBytes);

  // P-256: r and s are 32 bytes each → 64-byte P1363
  if (rStripped.length > 32 || sStripped.length > 32) {
    throw new Error(
      `ECDSA P-256 r/s exceeds 32 bytes (r=${rStripped.length}, s=${sStripped.length})`,
    );
  }

  const result = Buffer.alloc(64);
  rStripped.copy(result, 32 - rStripped.length);
  sStripped.copy(result, 64 - sStripped.length);
  return result;
}

function stripLeadingZero(bytes: Buffer): Buffer {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) {
    start++;
  }
  return bytes.subarray(start);
}

// ── RFC 9421 Signature-Input parsing ───────────────────────────────────────

/**
 * Parse a Signature-Input header into structured `SignatureParams`.
 *
 * Example input:
 *   sig1=("@method" "@target-uri" "content-digest" "x-allura-purpose");created=1234;expires=1235;keyid="kid";alg="ecdsa-p256"
 */
export function parseSignatureInput(header: string): SignatureParams {
  // Extract label before '='
  const eqIdx = header.indexOf("=");
  if (eqIdx < 0) {
    throw new Error("Signature-Input missing label delimiter '='");
  }
  const label = header.slice(0, eqIdx).trim();
  const rest = header.slice(eqIdx + 1);

  // Extract covered components (the quoted list before the first ';')
  const firstSemi = rest.indexOf(";");
  if (firstSemi < 0) {
    throw new Error("Signature-Input missing signature parameters");
  }
  const componentsStr = rest.slice(0, firstSemi);
  const paramsStr = rest.slice(firstSemi + 1);

  const coveredComponents: string[] = [];
  const componentRegex = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = componentRegex.exec(componentsStr)) !== null) {
    coveredComponents.push(m[1]);
  }

  // Parse key=value parameters
  const created = extractParam(paramsStr, "created");
  const expires = extractParam(paramsStr, "expires");
  const keyid = extractParam(paramsStr, "keyid");
  const alg = extractParam(paramsStr, "alg");

  if (created === undefined || expires === undefined) {
    throw new Error("Signature-Input missing created/expires parameters");
  }

  return {
    label,
    coveredComponents,
    created: Number(created),
    expires: Number(expires),
    keyid: keyid ?? "",
    alg: alg ?? "",
  };
}

function extractParam(params: string, name: string): string | undefined {
  // Match name=<value> where value may be quoted or numeric.
  // The name may appear at the start or after a ';' separator.
  const re = new RegExp(`(?:^|;)${name}=([^;\\s]+)`, "i");
  const m = re.exec(params);
  if (!m) return undefined;
  return m[1].replace(/^"|"$/g, "");
}

// ── RFC 9421 signature base string construction ────────────────────────────

/**
 * Build the RFC 9421 signature base string from the covered components.
 *
 * Each line is `<component-name>: <component-value>\n`.
 * Derived components use `@` prefix. The final line is
 * `"@signature-params": <Signature-Input params portion>`.
 *
 * Architecture §4.4: covers `@method`, `@target-uri`, `content-digest`,
 * and the `x-allura-*` custom headers.
 */
export function buildSignatureBaseString(
  method: string,
  targetUri: string,
  contentDigestHeader: string,
  headers: Record<string, string | undefined>,
  coveredComponents: readonly string[],
  signatureParamsRaw: string,
): string {
  const lines: string[] = [];

  for (const component of coveredComponents) {
    if (component.startsWith("@")) {
      // Derived component
      switch (component) {
        case "@method":
          lines.push(`"@method": ${method.toLowerCase()}`);
          break;
        case "@target-uri":
          lines.push(`"@target-uri": ${targetUri}`);
          break;
        default:
          throw new Error(`Unsupported derived component: ${component}`);
      }
    } else if (component === "content-digest") {
      lines.push(`"content-digest": ${contentDigestHeader}`);
    } else {
      // Custom header — strip the quotes, look up in headers map
      const value = headers[component];
      if (value === undefined) {
        throw new Error(
          `Covered component "${component}" not present in headers`,
        );
      }
      lines.push(`"${component}": ${value}`);
    }
  }

  // Final line: @signature-params
  lines.push(`"@signature-params": ${signatureParamsRaw}`);

  return `${lines.join("\n")}\n`;
}

/**
 * Extract the raw signature-params portion from a Signature-Input header.
 * This is the RFC 9421 inner-list plus parameters after the signature label.
 * The covered-components list is part of the @signature-params value.
 */
export function extractSignatureParamsRaw(signatureInputHeader: string): string {
  const eqIdx = signatureInputHeader.indexOf("=");
  if (eqIdx < 0) {
    throw new Error("Signature-Input missing label delimiter '='");
  }
  return signatureInputHeader.slice(eqIdx + 1).trim();
}

// ── Signature verification ─────────────────────────────────────────────────

/**
 * Verify a device proof-of-possession signature using the RFC 9421 envelope.
 *
 * This is the canonical verifier for all 5 purposes. It:
 * 1. Verifies the Content-Digest (RFC 9530) against the request body.
 * 2. Reconstructs @target-uri from the configured origin (NOT Host).
 * 3. Checks the audience matches the configured device-auth audience.
 * 4. Builds the RFC 9421 signature base string.
 * 5. Verifies the signature against the public key using the declared algorithm.
 *
 * `origin` and `expectedAudience` are injected so the function stays pure
 * and testable without reading `process.env`.
 */
export function verifyDeviceSignature(
  proof: DeviceProof,
  origin: string,
  expectedAudience: string,
): VerifyResult {
  // 1. Content-Digest verification (MITM body swap rejection)
  if (!verifyContentDigest(proof.body, proof.contentDigestHeader)) {
    return { valid: false, reason: "content-digest mismatch" };
  }

  // 2. Audience check
  if (proof.audience !== expectedAudience) {
    return { valid: false, reason: "audience mismatch" };
  }

  // Parse the transmitted header here rather than trusting caller-provided
  // metadata. Its alg parameter is covered by @signature-params and must match
  // the enrolled key algorithm before a cryptographic verification is attempted.
  let signatureParams: SignatureParams;
  try {
    signatureParams = parseSignatureInput(proof.signatureInputHeader);
  } catch (e) {
    return {
      valid: false,
      reason: `signature input error: ${(e as Error).message}`,
    };
  }
  if (signatureParams.alg !== proof.keyAlgorithm) {
    return { valid: false, reason: "signature algorithm mismatch" };
  }

  // 3. @target-uri reconstruction from configured origin
  const targetUri = reconstructTargetUri(origin, proof.requestTarget);

  // 4. Build the signature base string
  const headersMap: Record<string, string | undefined> = {
    "x-allura-purpose": proof.purpose,
    "x-allura-audience": proof.audience,
    "x-allura-nonce": proof.nonce,
    "x-allura-proof-id": proof.proofId,
    "x-allura-device-id": proof.deviceId,
    "x-allura-key-generation": proof.keyGeneration?.toString(),
  };

  const sigParamsRaw = extractSignatureParamsRaw(proof.signatureInputHeader);

  let baseString: string;
  try {
    baseString = buildSignatureBaseString(
      proof.method,
      targetUri,
      proof.contentDigestHeader,
      headersMap,
      signatureParams.coveredComponents,
      sigParamsRaw,
    );
  } catch (e) {
    return {
      valid: false,
      reason: `signature base string error: ${(e as Error).message}`,
    };
  }

  // 5. Decode the signature from standard base64
  let sigBytes: Buffer;
  try {
    sigBytes = Buffer.from(proof.signatureHeader, "base64");
  } catch {
    return { valid: false, reason: "signature decode error" };
  }

  // 6. Verify the signature
  const data = Buffer.from(baseString, "utf8");
  const ok = verifySignatureRaw(
    proof.keyAlgorithm,
    data,
    sigBytes,
    proof.publicKey,
  );

  if (!ok) {
    return { valid: false, reason: "signature verification failed" };
  }

  return {
    valid: true,
    purpose: proof.purpose,
    deviceId: proof.deviceId,
    keyGeneration: proof.keyGeneration,
  };
}

/**
 * Low-level signature verification for a given algorithm.
 *
 * The public key is accepted as SPKI PEM or standard-base64 SPKI DER
 * (the format stored in `device_enrollments.public_key` / `paired_devices.current_public_key`).
 */
function verifySignatureRaw(
  algorithm: KeyAlgorithm,
  data: Buffer,
  signature: Buffer,
  publicKey: string,
): boolean {
  const keyObject = loadPublicKey(publicKey);
  try {
    switch (algorithm) {
      case "ecdsa-p256": {
        // ECDSA P-256 with SHA-256, IEEE P1363 r‖s encoding
        // The signature is expected to be 64 bytes (P1363).
        // If it's DER (70-72 bytes), normalize it first.
        let sigToVerify = signature;
        if (signature.length !== 64) {
          try {
            sigToVerify = Buffer.from(normalizeEcdsaP1363(signature));
          } catch {
            return false;
          }
        }
        if (sigToVerify.length !== 64) {
          return false;
        }
        return verifyOneShot("SHA256", data, {
          key: keyObject,
          dsaEncoding: "ieee-p1363",
        }, sigToVerify);
      }
      case "ed25519":
        // Ed25519: raw 64-byte signature, algorithm is null
        if (signature.length !== 64) {
          return false;
        }
        return verifyOneShot(null, data, keyObject, signature);
      case "rsa-pss-2048": {
        // RSA-PSS-2048 with SHA-256
        if (signature.length !== 256) {
          return false;
        }
        return verifyOneShot("RSA-SHA256", data, {
          key: keyObject,
          padding: 1, // RSA_PKCS1_PSS_PADDING
          saltLength: 3, // RSA_PSS_SALTLEN_DIGEST
        }, signature);
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Load a public key from SPKI PEM or standard-base64 SPKI DER.
 *
 * The `device_enrollments.public_key` / `paired_devices.current_public_key`
 * columns store the public key as text. We accept:
 * - SPKI PEM (`-----BEGIN PUBLIC KEY-----...`)
 * - Standard base64 of SPKI DER
 */
function loadPublicKey(publicKey: string): import("node:crypto").KeyObject {
  const crypto = require("node:crypto") as typeof import("node:crypto");
  if (publicKey.includes("-----BEGIN")) {
    return crypto.createPublicKey(publicKey);
  }
  // Assume standard base64 of SPKI DER
  const der = Buffer.from(publicKey, "base64");
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
}

/**
 * Wrapper around crypto.verify that handles the Node 22 API
 * (algorithm as first arg, data as second, key/options as third, signature as fourth).
 */
function verifyOneShot(
  algorithm: string | null,
  data: Buffer,
  keyOrOptions: import("node:crypto").KeyObject | { key: import("node:crypto").KeyObject; dsaEncoding?: string; padding?: number; saltLength?: number },
  signature: Buffer,
): boolean {
  const crypto = require("node:crypto") as typeof import("node:crypto");
  try {
    return crypto.verify(algorithm, data, keyOrOptions as import("node:crypto").VerifyKeyObjectInput, signature);
  } catch {
    return false;
  }
}