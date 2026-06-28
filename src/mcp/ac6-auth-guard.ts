/**
 * AC6 Auth Guard — HTTP Layer + Per-Call Group ID Injection
 *
 * Two responsibilities:
 *
 * 1. resolveAc6SessionCtx (called at MCP session init — the initialize request):
 *    Establishes {email, path} for the session. JWT is verified here.
 *    - direct path: Cf-Access-Jwt-Assertion present → verify JWT → email
 *    - chat path:   X-Allura-Internal-Token matches ALLURA_INTERNAL_CHAT_TOKEN
 *    - dev path:    ALLURA_MCP_AUTH_TOKEN set → synthetic dev identity
 *    - default-deny: no credential matched → 403
 *
 * 2. resolveAndInjectGroupId (called per tool call, inside createMcpServer):
 *    Resolves the authorized group_id from the session context + client args,
 *    then injects it server-side. The client's group_id is never trusted beyond
 *    the membership check.
 *
 * Path classification (in priority order):
 *   1. dev-mode       — ALLURA_MCP_AUTH_TOKEN set (exits early, never reaches prod)
 *   2. direct-MCP     — Cf-Access-Jwt-Assertion present → JWT enforcement
 *   3. chat (internal)— X-Allura-Internal-Token matches ALLURA_INTERNAL_CHAT_TOKEN
 *   4. default-deny   — no credential → 403 auth_no_jwt
 *
 * Env vars:
 *   CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD  — see src/lib/auth/cf-access-jwt.ts
 *   ALLURA_MCP_AUTH_TOKEN                 — dev-only bypass (blocked in prod)
 *   ALLURA_INTERNAL_CHAT_TOKEN            — pre-shared secret for mcpo → Brain hop
 *                                           (Hightower wires into mcpo deployment)
 */

import { timingSafeEqual } from "crypto";
import type { IncomingMessage } from "http";
import { CfAccessJwtError, verifyCfAccessJwt } from "@/lib/auth/cf-access-jwt.js";
import {
  AC6Error,
  CHAT_PINNED_GROUP_ID,
  DEV_GROUP_ID,
  resolveGroupId,
  assertChatGroupId,
  buildAC6McpError,
  type AC6ErrorCode,
} from "@/lib/auth/tenant-resolver.js";

export type { AC6ErrorCode };
export { AC6Error, CHAT_PINNED_GROUP_ID, DEV_GROUP_ID, buildAC6McpError };

// ── Types ─────────────────────────────────────────────────────────────────────

export type AC6Path = "direct" | "chat" | "dev";

/**
 * Per-session auth context, established at MCP initialize and baked into the
 * server closure by createMcpServer(sessionCtx).
 *
 * group_id is NOT stored here — it is resolved fresh per tool call from
 * memberships so that per-call group_id selection (multi-tenant clients) works
 * correctly without requiring session reconnection.
 */
export interface AC6SessionCtx {
  /** Verified email. "internal@mcpo.chat" for chat path; "dev@allura-dev" for dev. */
  email: string;
  /** Surface classification — drives per-call enforcement logic. */
  path: AC6Path;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the client-supplied group_id from tool call arguments.
 * Returns null if absent or not a string.
 */
export function extractClientGroupId(args: unknown): string | null {
  if (args && typeof args === "object" && "group_id" in args) {
    const gid = (args as Record<string, unknown>).group_id;
    return typeof gid === "string" ? gid : null;
  }
  return null;
}

// ── Dev-mode detection ────────────────────────────────────────────────────────

// Read once at module load — consistent across requests in the same process.
const DEV_TOKEN = process.env.ALLURA_MCP_AUTH_TOKEN ?? "";

function isDevMode(): boolean {
  return DEV_TOKEN.length > 0;
}

// ── Chat internal token (pre-shared secret for mcpo → Brain hop) ──────────────

const INTERNAL_CHAT_TOKEN = process.env.ALLURA_INTERNAL_CHAT_TOKEN ?? "";

/**
 * Timing-safe check for the X-Allura-Internal-Token header.
 * Returns false immediately if ALLURA_INTERNAL_CHAT_TOKEN is not configured —
 * an unconfigured secret never grants trusted access.
 */
function hasValidInternalChatToken(req: IncomingMessage): boolean {
  if (!INTERNAL_CHAT_TOKEN) return false;

  const raw = req.headers["x-allura-internal-token"];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (!provided) return false;

  const expectedBuf = Buffer.from(INTERNAL_CHAT_TOKEN, "utf-8");
  const providedBuf = Buffer.from(provided, "utf-8");
  // Length check first; timingSafeEqual requires equal-length buffers.
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// ── Session Context Resolution (called at initialize) ─────────────────────────

/**
 * Establish the AC6 session context at MCP session initialization.
 *
 * Decision tree (in priority order):
 *
 *   1. dev-mode (ALLURA_MCP_AUTH_TOKEN set):
 *      → Synthetic identity: dev@allura-dev / group_id=allura-dev.
 *        validateBearerAuth upstream already handled wrong-token rejection.
 *
 *   2. Cf-Access-Jwt-Assertion present → direct-MCP path
 *      → Verify JWT signature, aud, exp. Extract email.
 *
 *   3. X-Allura-Internal-Token matches ALLURA_INTERNAL_CHAT_TOKEN → chat path
 *      → Pinned to allura-faithmeats. Per-call override attempts rejected
 *        in resolveAndInjectGroupId.
 *
 *   4. Default-deny: no credential matched
 *      → AC6Error auth_no_jwt (403). Never auto-pin to any tenant.
 *
 * @throws AC6Error on any auth failure
 */
export async function resolveAc6SessionCtx(req: IncomingMessage): Promise<AC6SessionCtx> {
  // ── 1. Dev bypass ──────────────────────────────────────────────────────────
  if (isDevMode()) {
    // Synthetic identity. group_id always allura-dev (Brooks override: NOT allura-system).
    return { email: "dev@allura-dev", path: "dev" };
  }

  // ── 2. Direct-MCP path: Cloudflare Access JWT ─────────────────────────────
  const jwtHeader = req.headers["cf-access-jwt-assertion"];
  const jwtToken = Array.isArray(jwtHeader) ? jwtHeader[0] : jwtHeader;

  if (jwtToken) {
    let email: string;
    try {
      const claims = await verifyCfAccessJwt(jwtToken);
      email = claims.email;
    } catch (err) {
      if (err instanceof CfAccessJwtError) {
        throw new AC6Error(err.message, err.code as AC6ErrorCode, 403);
      }
      throw new AC6Error(
        `JWT verification failed: ${err instanceof Error ? err.message : String(err)}`,
        "auth_invalid_token",
        403
      );
    }
    return { email, path: "direct" };
  }

  // ── 3. Chat path: pre-shared internal token (mcpo → Brain) ────────────────
  // DEPLOY NOTE (Hightower): mcpo must send this header on every request to
  // the Brain MCP. See ALLURA_INTERNAL_CHAT_TOKEN in .env.example.
  if (hasValidInternalChatToken(req)) {
    return { email: "internal@mcpo.chat", path: "chat" };
  }

  // ── 4. Default-deny ────────────────────────────────────────────────────────
  // No credential matched. Never auto-pin to any tenant on bare JWT absence.
  throw new AC6Error(
    "Missing authentication: provide Cf-Access-Jwt-Assertion (direct MCP) " +
      "or X-Allura-Internal-Token (internal chat hop)",
    "auth_no_jwt",
    403
  );
}

// ── Per-Tool-Call Group ID Resolution + Injection ─────────────────────────────

/**
 * Resolve the server-authoritative group_id for a tool call and inject it
 * into the args, replacing whatever the client sent.
 *
 * AC6 Rules enforced:
 *   4.1.2 — default tenant from memberships when client omits group_id
 *   4.1.3 — membership check for explicit group_id; system tenant blocked
 *   4.2.1 — chat path pinned to allura-faithmeats; overrides rejected
 *
 * Called inside createMcpServer's CallToolRequestSchema handler.
 *
 * @param rawArgs    Tool call arguments from the MCP client (may include group_id)
 * @param sessionCtx Auth context established at session init
 * @returns          New args object with group_id replaced by the server value
 * @throws AC6Error  On any authorization failure
 */
export async function resolveAndInjectGroupId(
  rawArgs: Record<string, unknown>,
  sessionCtx: AC6SessionCtx
): Promise<Record<string, unknown>> {
  const clientGroupId = extractClientGroupId(rawArgs);

  let resolvedGroupId: string;

  switch (sessionCtx.path) {
    case "chat":
      // Rule 4.2.1: chat surface is pinned. Reject any non-faithmeats group_id.
      assertChatGroupId(clientGroupId);
      resolvedGroupId = CHAT_PINNED_GROUP_ID;
      break;

    case "dev":
      // Dev mode: always allura-dev regardless of what client sends.
      resolvedGroupId = DEV_GROUP_ID;
      break;

    case "direct":
      // Rules 4.1.2 / 4.1.3: validate client's group_id against memberships.
      // TODO(perf): cache memberships per session to avoid one DB call per tool call.
      // For now, the query is fast (indexed on email) and sessions are short-lived.
      resolvedGroupId = await resolveGroupId(sessionCtx.email, clientGroupId ?? null);
      break;

    default: {
      const _exhaustive: never = sessionCtx.path;
      throw new AC6Error(`Unknown AC6 path: ${_exhaustive}`, "auth_no_jwt", 403);
    }
  }

  return { ...rawArgs, group_id: resolvedGroupId };
}
