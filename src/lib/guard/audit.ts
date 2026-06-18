import type { AlluraScope } from "@allura/types";
import { insertEvent } from "@/lib/postgres/queries/insert-trace";

// Bumblebee step 4: append-only audit of EVERY gateway decision — permit and deny.
// Writes through the canonical insertEvent path (never a direct mutation).

export type GatewayDecision = "permit" | "deny";

export interface GatewayAuditInput {
  decision: GatewayDecision;
  /** Tool name, or "auth" for token-validation failures before a tool is known. */
  action: string;
  /** Present once the token is validated and context injected. */
  scope?: AlluraScope;
  /** Fallback group when there is no validated scope (bad/missing token). */
  groupId?: string;
  tokenPrefix?: string;
  reason?: string;
}

export async function auditGateway(input: GatewayAuditInput): Promise<void> {
  // Security log lands under the org scope when known; platform tier otherwise.
  const group_id = input.scope?.group_id ?? input.groupId ?? "allura-system";

  await insertEvent({
    group_id,
    event_type: input.decision === "permit" ? "mcp_gateway_permit" : "mcp_gateway_deny",
    agent_id: input.scope?.actor_id ?? "unknown-agent",
    status: "completed",
    metadata: {
      source: "bumblebee",
      decision: input.decision,
      action: input.action,
      workspace_id: input.scope?.workspace_id ?? null,
      token_prefix: input.tokenPrefix ?? null,
      scopes: input.scope?.scopes ?? null,
      request_id: input.scope?.request_id ?? null,
      reason: input.reason ?? null,
    },
  });
}
