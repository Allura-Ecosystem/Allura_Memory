import { randomUUID } from "node:crypto";
import type { AlluraScope } from "@allura/types";
import type { McpTokenRecord } from "@/lib/mcp-token/repository";

// Bumblebee step 2: server-side context injection (ADR-001).
// group_id + workspace_id + scopes come ONLY from the validated token. Any
// client-supplied group_id/workspace_id is never read here — the gateway builds
// the scope from the token alone.

export function injectContext(token: McpTokenRecord): AlluraScope {
  return {
    group_id: token.group_id,
    workspace_id: token.workspace_id,
    actor_id: token.agent_name,
    request_id: randomUUID(),
    scopes: token.scopes,
  };
}
