/**
 * AC6 Tenant Resolver
 *
 * Implements the group_id enforcement rules from AC6 ADR §4 and §5:
 *   Rule 4.1.2 — resolve target group_id (default vs explicit)
 *   Rule 4.1.3 — authorization check (membership + system tenant guard)
 *
 * Used by both the HTTP-layer guard (ac6-auth-guard.ts) and the MCP
 * tool call interceptor (canonical-http-gateway.ts).
 *
 * Does NOT perform JWT verification — that is handled upstream by
 * cf-access-jwt.ts before this code is called.
 */

import { getMembershipsForEmail, type Membership } from "./memberships.js";
import { isValidGroupId } from "@/lib/validation/group-id.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Tenants that can never be requested by a human (AC6 Rule 4.1.3). */
const SYSTEM_TENANTS = new Set(["allura-system"]);

/** Legacy group_ids that are permanently blocked (AC6 §2.2). */
const LEGACY_BLOCKLIST = new Set(["allura-roninmemory", "allura-team-ram"]);

/** group_id used by the chat surface (pinned, never client-controlled). */
export const CHAT_PINNED_GROUP_ID = "allura-faithmeats";

/** Synthetic group_id used in dev-bypass mode (Brooks override: NOT allura-system). */
export const DEV_GROUP_ID = "allura-dev";

// ── Error Types ───────────────────────────────────────────────────────────────

export type AC6ErrorCode =
  | "auth_no_jwt"
  | "auth_invalid_token"
  | "auth_missing_email"
  | "auth_no_default_tenant"
  | "auth_group_not_allowed"
  | "auth_system_tenant_forbidden"
  | "auth_legacy_tenant_blocked"
  | "auth_invalid_group_id_format"
  | "chat_invalid_group_override";

export class AC6Error extends Error {
  constructor(
    message: string,
    public readonly code: AC6ErrorCode,
    public readonly httpStatus: 400 | 401 | 403
  ) {
    super(message);
    this.name = "AC6Error";
  }
}

/**
 * Build the MCP JSON-RPC error envelope per AC6 §5.2.
 */
export function buildAC6McpError(
  error: AC6Error,
  email: string,
  groupId: string | null,
  hint?: string
): object {
  return {
    jsonrpc: "2.0",
    error: {
      code: -32603,
      message: error.message,
      data: {
        error_code: error.code,
        email,
        group_id: groupId,
        ...(hint ? { hint } : {}),
      },
    },
    id: null,
  };
}

// ── Core Resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve and authorize the effective group_id for a verified identity.
 *
 * Rules applied (AC6 §4.1.2 / §4.1.3):
 * 1. If requestedGroupId is in the legacy blocklist → reject auth_legacy_tenant_blocked
 * 2. If requestedGroupId is a system tenant → reject auth_system_tenant_forbidden
 * 3. If requestedGroupId fails format validation → reject auth_invalid_group_id_format
 * 4. If requestedGroupId is provided:
 *    - Check email is a member of that group_id → allow or auth_group_not_allowed
 * 5. If requestedGroupId is omitted:
 *    - Use the is_default = true membership; none → auth_no_default_tenant
 *
 * @param email         Verified email from Cloudflare Access JWT
 * @param requestedGroupId  group_id supplied by client, or null/undefined
 * @returns             The server-resolved, authorized group_id
 * @throws AC6Error     On any authorization failure
 */
export async function resolveGroupId(
  email: string,
  requestedGroupId: string | null | undefined
): Promise<string> {
  // ── 1. Legacy blocklist (before DB call) ───────────────────────────────────
  if (requestedGroupId && LEGACY_BLOCKLIST.has(requestedGroupId)) {
    throw new AC6Error(
      `Tenant '${requestedGroupId}' is permanently blocked (legacy namespace)`,
      "auth_legacy_tenant_blocked",
      403
    );
  }

  // ── 2. System tenant guard ─────────────────────────────────────────────────
  if (requestedGroupId && SYSTEM_TENANTS.has(requestedGroupId)) {
    throw new AC6Error(
      "Human access to allura-system is forbidden",
      "auth_system_tenant_forbidden",
      403
    );
  }

  // ── 3. Format validation ───────────────────────────────────────────────────
  if (requestedGroupId !== null && requestedGroupId !== undefined) {
    if (!isValidGroupId(requestedGroupId)) {
      throw new AC6Error(
        `Invalid group_id format: '${requestedGroupId}' (must match ^allura-[a-z0-9-]+$)`,
        "auth_invalid_group_id_format",
        400
      );
    }
  }

  // ── 4 / 5. Membership lookup ───────────────────────────────────────────────
  let memberships: Membership[];
  try {
    memberships = await getMembershipsForEmail(email);
  } catch (err) {
    // Propagate AC6Error from membership lookup; wrap anything else
    if (err instanceof AC6Error) throw err;
    throw new AC6Error(
      `Membership lookup failed for ${email}: ${err instanceof Error ? err.message : String(err)}`,
      "auth_group_not_allowed",
      403
    );
  }

  if (requestedGroupId) {
    // ── Explicit group_id: must be in memberships ──────────────────────────
    const allowed = memberships.some((m) => m.group_id === requestedGroupId);
    if (!allowed) {
      throw new AC6Error(
        `${email} is not a member of ${requestedGroupId}`,
        "auth_group_not_allowed",
        403
      );
    }
    return requestedGroupId;
  } else {
    // ── Default group_id ───────────────────────────────────────────────────
    const defaultMembership = memberships.find((m) => m.is_default);
    if (!defaultMembership) {
      throw new AC6Error(
        `No default tenant configured for ${email}`,
        "auth_no_default_tenant",
        400
      );
    }
    return defaultMembership.group_id;
  }
}

// ── Chat Path Guard ───────────────────────────────────────────────────────────

/**
 * Enforce the chat surface pin (AC6 Rule 4.2.1).
 *
 * The chat surface (OpenWebUI → mcpo → Brain MCP) is always pinned to
 * CHAT_PINNED_GROUP_ID. If the client has somehow passed a different
 * group_id in the tool args, reject with chat_invalid_group_override.
 *
 * @param clientGroupId  group_id from tool call args (may be undefined)
 * @throws AC6Error if clientGroupId is set to anything other than the pinned value
 */
export function assertChatGroupId(clientGroupId: string | null | undefined): void {
  if (clientGroupId !== null && clientGroupId !== undefined && clientGroupId !== CHAT_PINNED_GROUP_ID) {
    throw new AC6Error(
      `Chat surface is pinned to ${CHAT_PINNED_GROUP_ID}`,
      "chat_invalid_group_override",
      400
    );
  }
}
