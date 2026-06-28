/**
 * Cloudflare Access JWT Verification (AC6 — Rule 4.1.1)
 *
 * Verifies the `Cf-Access-Jwt-Assertion` header signature against the
 * Cloudflare Access team cert (JWKS). Caches the JWKS in-process for 5 min
 * to avoid hammering the certs endpoint on every MCP tool call.
 *
 * Env vars required:
 *   CF_ACCESS_TEAM_DOMAIN  — e.g. "myfarm.cloudflareaccess.com"
 *   CF_ACCESS_AUD          — Application Audience tag from the Access dashboard
 */

// ── JWKS Cache ───────────────────────────────────────────────────────────────

interface JwkKey {
  kid?: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
  use?: string;
}

interface JwksResponse {
  keys: JwkKey[];
}

interface JwksCache {
  keys: JwkKey[];
  fetchedAt: number;
}

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let jwksCache: JwksCache | null = null;

/**
 * Fetch and cache JWKS from the Cloudflare Access team domain.
 * Throws if CF_ACCESS_TEAM_DOMAIN is not configured or the fetch fails.
 */
export async function fetchJwks(): Promise<JwkKey[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }

  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  if (!teamDomain) {
    throw new CfAccessJwtError(
      "CF_ACCESS_TEAM_DOMAIN is not configured — cannot verify Cf-Access-Jwt-Assertion",
      "config_missing"
    );
  }

  const certsUrl = `https://${teamDomain}/cdn-cgi/access/certs`;

  let response: Response;
  try {
    response = await fetch(certsUrl, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    throw new CfAccessJwtError(
      `Failed to fetch Cloudflare Access JWKS from ${certsUrl}: ${err instanceof Error ? err.message : String(err)}`,
      "jwks_fetch_failed"
    );
  }

  if (!response.ok) {
    throw new CfAccessJwtError(
      `JWKS fetch returned HTTP ${response.status} from ${certsUrl}`,
      "jwks_fetch_failed"
    );
  }

  let jwks: JwksResponse;
  try {
    jwks = (await response.json()) as JwksResponse;
  } catch {
    throw new CfAccessJwtError("JWKS response is not valid JSON", "jwks_fetch_failed");
  }

  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
    throw new CfAccessJwtError("JWKS response contains no keys", "jwks_fetch_failed");
  }

  jwksCache = { keys: jwks.keys, fetchedAt: now };
  return jwks.keys;
}

/** Invalidate the JWKS cache (used in tests). */
export function invalidateJwksCache(): void {
  jwksCache = null;
}

// ── JWT Verification ──────────────────────────────────────────────────────────

export class CfAccessJwtError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "CfAccessJwtError";
  }
}

export interface CfAccessClaims {
  sub: string;
  email: string;
  aud: string | string[];
  exp: number;
  iat: number;
  iss?: string;
}

function base64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  // Convert base64url → base64
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  // Pad to multiple of 4
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtPart(part: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(base64urlDecode(part)));
  } catch {
    return null;
  }
}

/**
 * Verify a Cloudflare Access JWT assertion.
 *
 * Validates:
 * - Structure (3-part, RS256)
 * - Signature against JWKS
 * - `aud` claim against CF_ACCESS_AUD
 * - `exp` claim (not expired)
 *
 * Returns verified claims including `email`.
 */
export async function verifyCfAccessJwt(token: string): Promise<CfAccessClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new CfAccessJwtError("Malformed JWT: expected 3 parts", "auth_invalid_token");
  }

  const [headerB64, payloadB64, sigB64] = parts;

  const header = decodeJwtPart(headerB64) as { alg?: string; kid?: string } | null;
  if (!header || typeof header !== "object") {
    throw new CfAccessJwtError("Malformed JWT: cannot decode header", "auth_invalid_token");
  }
  if (header.alg !== "RS256") {
    throw new CfAccessJwtError(
      `Unsupported JWT algorithm: ${header.alg}. Only RS256 is accepted.`,
      "auth_invalid_token"
    );
  }

  const payload = decodeJwtPart(payloadB64) as CfAccessClaims | null;
  if (!payload || typeof payload !== "object") {
    throw new CfAccessJwtError("Malformed JWT: cannot decode payload", "auth_invalid_token");
  }

  // ── Expiry check ──
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new CfAccessJwtError("JWT is expired", "auth_invalid_token");
  }

  // ── Audience check (MANDATORY — absent env = fail closed) ──
  // Never treat a missing CF_ACCESS_AUD as permissive. A JWT from a different
  // Cloudflare Access app on the same team would otherwise be accepted.
  const cfAud = process.env.CF_ACCESS_AUD;
  if (!cfAud) {
    throw new CfAccessJwtError(
      "CF_ACCESS_AUD is not configured — cannot verify JWT audience. " +
        "Set CF_ACCESS_AUD to your Cloudflare Access application audience tag.",
      "config_missing"
    );
  }
  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audList.includes(cfAud)) {
    throw new CfAccessJwtError(
      `JWT audience mismatch: expected ${cfAud}`,
      "auth_invalid_token"
    );
  }
  // TODO(hardening-3): verify iss claim against CF_ACCESS_TEAM_DOMAIN (Pike finding #3)

  // ── Email claim ──
  if (!payload.email || typeof payload.email !== "string") {
    throw new CfAccessJwtError(
      "JWT missing email claim",
      "auth_missing_email"
    );
  }

  // ── Signature verification ──
  const keys = await fetchJwks();
  const matchingKey = header.kid
    ? keys.find((k) => k.kid === header.kid)
    : keys.find((k) => k.kty === "RSA");

  if (!matchingKey) {
    // kid mismatch: try refreshing the cache once
    invalidateJwksCache();
    const freshKeys = await fetchJwks();
    const retryKey = header.kid
      ? freshKeys.find((k) => k.kid === header.kid)
      : freshKeys.find((k) => k.kty === "RSA");
    if (!retryKey) {
      throw new CfAccessJwtError(
        `No JWKS key found for kid=${header.kid ?? "(none)"}`,
        "auth_invalid_token"
      );
    }
    return verifySignatureAndReturn(retryKey, headerB64, payloadB64, sigB64, payload);
  }

  return verifySignatureAndReturn(matchingKey, headerB64, payloadB64, sigB64, payload);
}

async function verifySignatureAndReturn(
  jwkKey: JwkKey,
  headerB64: string,
  payloadB64: string,
  sigB64: string,
  claims: CfAccessClaims
): Promise<CfAccessClaims> {
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await globalThis.crypto.subtle.importKey(
      "jwk",
      jwkKey as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  } catch (err) {
    throw new CfAccessJwtError(
      `Failed to import JWK for signature verification: ${err instanceof Error ? err.message : String(err)}`,
      "auth_invalid_token"
    );
  }

  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlDecode(sigB64);

  let valid: boolean;
  try {
    valid = await globalThis.crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      message
    );
  } catch (err) {
    throw new CfAccessJwtError(
      `Signature verification threw: ${err instanceof Error ? err.message : String(err)}`,
      "auth_invalid_token"
    );
  }

  if (!valid) {
    throw new CfAccessJwtError("JWT signature is invalid", "auth_invalid_token");
  }

  return claims;
}
