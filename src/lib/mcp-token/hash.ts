import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// MCP bearer token hashing (DESIGN-BUMBLEBEE, AD-03).
//
// The raw token is shown to the user exactly once and NEVER stored. We persist an
// HMAC-SHA256 hash keyed by a server secret, plus a short prefix used as the lookup
// key. Verification is constant-time.

const TOKEN_NAMESPACE = "allura_mcp";
/** Chars of the random body kept in the (stored, unique) lookup prefix. */
const PREFIX_BODY_CHARS = 8;
/** Random bytes in the token body (base64url ≈ 43 chars for 32 bytes). */
const TOKEN_BYTES = 32;

export interface GeneratedToken {
  /** Full raw token — returned to the caller ONCE, never persisted. */
  raw: string;
  /** Stored lookup key, e.g. `allura_mcp_a1b2c3d4`. */
  prefix: string;
  /** HMAC-SHA256(secret, raw) as hex — the only thing persisted. */
  hash: string;
}

function getSecret(): string {
  const secret = process.env.ALLURA_MCP_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "ALLURA_MCP_TOKEN_SECRET must be set (>=16 chars) to mint or verify MCP tokens",
    );
  }
  return secret;
}

/** HMAC-SHA256(secret, raw) as a lowercase hex string. */
export function hashToken(raw: string): string {
  return createHmac("sha256", getSecret()).update(raw).digest("hex");
}

/** Mint a new token: returns the raw token (once), its prefix, and its hash. */
export function generateToken(): GeneratedToken {
  const body = randomBytes(TOKEN_BYTES).toString("base64url");
  const raw = `${TOKEN_NAMESPACE}_${body}`;
  const prefix = `${TOKEN_NAMESPACE}_${body.slice(0, PREFIX_BODY_CHARS)}`;
  return { raw, prefix, hash: hashToken(raw) };
}

/** Derive the lookup prefix from a presented raw token (for gateway lookup). */
export function prefixOf(raw: string): string {
  const body = raw.startsWith(`${TOKEN_NAMESPACE}_`)
    ? raw.slice(TOKEN_NAMESPACE.length + 1)
    : raw;
  return `${TOKEN_NAMESPACE}_${body.slice(0, PREFIX_BODY_CHARS)}`;
}

/** Constant-time compare of a presented token against a stored hash. */
export function verifyToken(raw: string, storedHash: string): boolean {
  const candidate = hashToken(raw);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
