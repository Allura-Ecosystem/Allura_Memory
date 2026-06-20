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
 *   emitGatedAudit(request, scopeName, verdict, authStatus, role);
 *
 * The fire-and-forget pattern means the middleware never blocks on audit:
 * - If the trace endpoint is reachable, the event is recorded.
 * - If it's unreachable or slow, the middleware still returns the response.
 *
 * IMPORTANT (chk_events_valid_status): the auth verdict ("authorized" |
 * "unauthorized" | "forbidden") is NOT a valid events.status. The events table
 * CHECK constraint chk_events_valid_status only permits
 * 'pending' | 'completed' | 'failed' | 'cancelled'. We therefore map the verdict
 * to a valid status via verdictToStatus() and preserve the fine-grained verdict
 * in metadata.verdict so no audit fidelity is lost.
 */

import type { NextRequest } from "next/server";
import type { EventStatus } from "@/lib/postgres/queries/insert-trace";

const TRACE_ENDPOINT = "/api/trace";
const INTERNAL_SECRET = "allura-trace-middleware";

// ── Gated Audit Event ─────────────────────────────────────────────────────────

/** Authorization verdict for a governed request. */
export type AuthVerdict = "authorized" | "unauthorized" | "forbidden";

export interface GatedAuditPayload {
  group_id: string;
  event_type: "api_request_gated";
  agent_id: string;
  /** Constraint-valid events.status (see verdictToStatus). */
  status: EventStatus;
  metadata: {
    pathname: string;
    method: string;
    scopeName: string | null;
    authStatus: "authenticated" | "unauthenticated";
    role: string;
    /** Fine-grained auth verdict, preserved since status is coarse. */
    verdict: string;
  };
}

/**
 * Map an authorization verdict to a constraint-valid events.status.
 *
 * Only 'pending' | 'completed' | 'failed' | 'cancelled' satisfy
 * chk_events_valid_status. An allowed request completed the gate; a denied
 * request (unauthorized / forbidden / anything else) did not pass it.
 */
export function verdictToStatus(verdict: string): EventStatus {
  return verdict === "authorized" ? "completed" : "failed";
}

/** Build the api_request_gated payload (pure — exported for testing). */
export function buildGatedAuditPayload(
  request: NextRequest,
  scopeName: string | null,
  verdict: string,
  authStatus: "authenticated" | "unauthenticated",
  role: string,
  groupId: string = "allura-system",
): GatedAuditPayload {
  return {
    group_id: groupId,
    event_type: "api_request_gated",
    agent_id:
      role === "admin"
        ? "admin"
        : role === "curator"
          ? "curator"
          : role === "viewer"
            ? "viewer"
            : "anonymous",
    status: verdictToStatus(verdict),
    metadata: {
      pathname: request.nextUrl.pathname,
      method: request.method,
      scopeName,
      authStatus,
      role,
      verdict,
    },
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
  verdict: string,
  authStatus: "authenticated" | "unauthenticated",
  role: string,
  groupId: string = "allura-system",
): void {
  const url = new URL(TRACE_ENDPOINT, request.url);
  const payload = buildGatedAuditPayload(request, scopeName, verdict, authStatus, role, groupId);

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
