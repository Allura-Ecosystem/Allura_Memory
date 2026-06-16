import { prefixOf, verifyToken } from "@/lib/mcp-token/hash";
import { findByPrefix, touchLastUsed, type McpTokenRecord } from "@/lib/mcp-token/repository";

// Bumblebee step 1: validate a presented bearer token.
// Lookup by prefix, then constant-time hash verify; reject revoked/expired tokens.

export type TokenRejection =
  | "missing"
  | "malformed"
  | "not_found"
  | "invalid"
  | "expired"
  | "revoked";

export type TokenValidationResult =
  | { ok: true; token: McpTokenRecord }
  | { ok: false; reason: TokenRejection };

/** Extract the raw token from an `Authorization: Bearer <token>` header. */
export function extractBearer(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1].trim() : null;
}

export async function validateToken(raw: string | null): Promise<TokenValidationResult> {
  if (!raw) return { ok: false, reason: "missing" };

  const prefix = prefixOf(raw);
  if (!prefix) return { ok: false, reason: "malformed" };

  const token = await findByPrefix(prefix);
  if (!token) return { ok: false, reason: "not_found" };
  if (token.revoked_at) return { ok: false, reason: "revoked" };
  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (!verifyToken(raw, token.token_hash)) return { ok: false, reason: "invalid" };

  await touchLastUsed(token.id);
  return { ok: true, token };
}
