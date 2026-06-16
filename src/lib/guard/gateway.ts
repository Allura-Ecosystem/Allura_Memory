import type { AlluraScope } from "@allura/types";
import { auditGateway } from "./audit";
import { checkToolScope } from "./check-scope";
import { injectContext } from "./inject-context";
import { extractBearer, validateToken } from "./validate-token";

// Bumblebee gateway pipeline: validate → inject → check scope → audit.
// Every outcome (permit or deny) writes an append-only audit event.

export type AuthorizeResult =
  | { ok: true; scope: AlluraScope }
  | { ok: false; status: 401 | 403; reason: string };

/**
 * Authorize an MCP tool call from a bearer Authorization header.
 * On success returns the server-injected AlluraScope (never client-supplied).
 */
export async function authorizeToolCall(
  authorization: string | null,
  toolName: string,
): Promise<AuthorizeResult> {
  const raw = extractBearer(authorization);
  const validation = await validateToken(raw);

  if (!validation.ok) {
    await auditGateway({
      decision: "deny",
      action: toolName || "auth",
      tokenPrefix: raw ? raw.slice(0, 16) : undefined,
      reason: `token ${validation.reason}`,
    });
    return { ok: false, status: 401, reason: `token ${validation.reason}` };
  }

  const scope = injectContext(validation.token);
  const scopeCheck = checkToolScope(toolName, scope.scopes);

  if (!scopeCheck.allowed) {
    await auditGateway({
      decision: "deny",
      action: toolName,
      scope,
      tokenPrefix: validation.token.token_prefix,
      reason: scopeCheck.reason,
    });
    return { ok: false, status: 403, reason: scopeCheck.reason };
  }

  await auditGateway({
    decision: "permit",
    action: toolName,
    scope,
    tokenPrefix: validation.token.token_prefix,
  });
  return { ok: true, scope };
}
