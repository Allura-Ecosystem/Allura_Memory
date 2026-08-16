// @allura/mcp-server — MCP Gateway tool registry (scaffold stub).
//
// The real gateway (DESIGN-MCP-GATEWAY) validates a bearer MCP token via
// Allura Guard, injects the org `group_id` (never client-supplied, ADR-001),
// checks scopes, then executes the memory tool and writes an audit event.
// Workspace restrictions remain deferred until a canonical handler enforces them.
// This stub only declares the tool registry and scope gating.

import type { AlluraScope, Scope } from "@allura/types";

export interface ToolDef {
  name: string;
  requiredScope: Scope;
  requiresElevatedRole?: boolean;
}

/** One authoritative policy map for every gateway-visible tool. */
export const TOOL_POLICIES: Readonly<Record<string, ToolDef>> = {
  memory_add: { name: "memory_add", requiredScope: "memory:write" },
  memory_search: { name: "memory_search", requiredScope: "memory:read" },
  memory_get: { name: "memory_get", requiredScope: "memory:read" },
  memory_list: { name: "memory_list", requiredScope: "memory:read" },
  memory_delete: { name: "memory_delete", requiredScope: "memory:delete" },
  memory_promote: { name: "memory_promote", requiredScope: "memory:promote" },
  memory_update: { name: "memory_update", requiredScope: "memory:write" },
  memory_export: { name: "memory_export", requiredScope: "memory:read" },
  memory_restore: { name: "memory_restore", requiredScope: "memory:write" },
  memory_list_deleted: { name: "memory_list_deleted", requiredScope: "memory:read" },
  memory_cleanup: { name: "memory_cleanup", requiredScope: "admin:budget" },
  governance_list_policies: { name: "governance_list_policies", requiredScope: "audit:read" },
  governance_get_policy: { name: "governance_get_policy", requiredScope: "audit:read" },
  governance_check_gate: { name: "governance_check_gate", requiredScope: "audit:read" },
  governance_update_policy: { name: "governance_update_policy", requiredScope: "review:approve", requiresElevatedRole: true },
  governance_audit_log: { name: "governance_audit_log", requiredScope: "audit:read" },
  governance_curator_pass: { name: "governance_curator_pass", requiredScope: "review:approve", requiresElevatedRole: true },
  governance_proposal_approve: { name: "governance_proposal_approve", requiredScope: "review:approve", requiresElevatedRole: true },
  governance_proposal_reject: { name: "governance_proposal_reject", requiredScope: "review:reject", requiresElevatedRole: true },
  receipt_create: { name: "receipt_create", requiredScope: "receipt:create" },
  audit_query_events: { name: "audit_query_events", requiredScope: "audit:read" },
  audit_health_report: { name: "audit_health_report", requiredScope: "audit:read" },
  audit_agent_activity: { name: "audit_agent_activity", requiredScope: "audit:read" },
  audit_invariant_check: { name: "audit_invariant_check", requiredScope: "audit:read" },
};

export const MEMORY_TOOLS: ToolDef[] = Object.values(TOOL_POLICIES);

export function getToolPolicy(toolName: string): ToolDef | undefined {
  return TOOL_POLICIES[toolName];
}

/** Tools an agent may see/call given its granted scopes (least privilege). */
export function toolsForScopes(granted: Scope[]): ToolDef[] {
  return MEMORY_TOOLS.filter((t) => granted.includes(t.requiredScope));
}

/**
 * Server-side scope resolution. In the real gateway, group_id comes from the
 * validated token, NOT from the request body. workspace_id enforcement is
 * deferred and non-enforced in this scaffold until a canonical handler consumes
 * it end to end. Any client-supplied scope is dropped here (ADR-001).
 */
export function resolveInjectedScope(injected: AlluraScope): AlluraScope {
  return injected;
}
