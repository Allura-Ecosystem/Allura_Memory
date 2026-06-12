/**
 * Edge-Audit Helper (AD-42)
 *
 * Fire-and-forget audit event emission from Edge Runtime.
 *
 * Edge middleware cannot import pg directly. This helper fetches the
 * internal /api/trace endpoint (which runs in Node.js and has pg access)
 * using the x-internal-trace shared secret for authorization.
 *
 * Usage in proxy.ts:
 *   import { emitGatedAudit } from "./lib/auth/edge-audit";
 *   await emitGatedAudit(request, scopeName, status);
 *
 * The fire-and-forget pattern means the middleware never blocks on audit:
 * - If the trace endpoint is reachable, the event is recorded.
 * - If it's unreachable or slow, the middleware still returns the response.
 */

import type { NextRequest } from "next/server";

const TRACE_ENDPOINT = "/api/trace";
const INTERNAL_SECRET = "allura-trace-middleware";

// ── Gated Audit Event ─────────────────────────────────────────────────────────

export interface GatedAuditPayload {
  group_id: string;
  event_type: "api_request_gated";
  agent_id: string;
  status: string;
  metadata: {
    pathname: string;
    method: string;
    scopeName: string | null;
    authStatus: "authenticated" | "unauthenticated";
    role: string;
  };
}

/**
 * Emit an api_request_gated audit event for a governed request.
 *
 * Fire-and-forget via fetch to the internal trace endpoint.
 * Never throws — failures are silently logged to console.
 */
export function emitGatedAudit(
  request: NextRequest,
  scopeName: string | null,
  status: string,
  authStatus: "authenticated" | "unauthenticated",
  role: string,
  groupId: string = "allura-system",
): void {
  const url = new URL(TRACE_ENDPOINT, request.url);

  const payload: GatedAuditPayload = {
    group_id: groupId,
    event_type: "api_request_gated",
    agent_id: role === "admin" ? "admin" : role === "curator" ? "curator" : role === "viewer" ? "viewer" : "anonymous",
    status,
    metadata: {
      pathname: request.nextUrl.pathname,
      method: request.method,
      scopeName,
      authStatus,
      role,
    },
  };

  // Fire-and-forget — never await this promise
  fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-trace": INTERNAL_SECRET,
    },
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.error("[edge-audit] Failed to emit gated audit event:", err);
  });
}