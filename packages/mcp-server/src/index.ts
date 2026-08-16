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
}

export const MEMORY_TOOLS: ToolDef[] = [
  { name: "memory_add", requiredScope: "memory:write" },
  { name: "memory_search", requiredScope: "memory:read" },
  { name: "memory_get", requiredScope: "memory:read" },
  { name: "memory_list", requiredScope: "memory:read" },
  { name: "memory_delete", requiredScope: "memory:delete" },
  { name: "memory_promote", requiredScope: "memory:promote" },
  { name: "memory_update", requiredScope: "memory:write" },
  { name: "memory_export", requiredScope: "memory:read" },
  { name: "memory_restore", requiredScope: "memory:write" },
  { name: "memory_list_deleted", requiredScope: "memory:read" },
  { name: "memory_cleanup", requiredScope: "admin:budget" },
  { name: "governance_list_policies", requiredScope: "audit:read" },
  { name: "governance_get_policy", requiredScope: "audit:read" },
  { name: "governance_check_gate", requiredScope: "audit:read" },
  { name: "governance_update_policy", requiredScope: "review:approve" },
  { name: "governance_audit_log", requiredScope: "audit:read" },
  { name: "audit_query_events", requiredScope: "audit:read" },
  { name: "audit_health_report", requiredScope: "audit:read" },
  { name: "audit_agent_activity", requiredScope: "audit:read" },
  { name: "audit_invariant_check", requiredScope: "audit:read" },
  { name: "receipt_create", requiredScope: "receipt:create" },
];

/** Tools an agent may see/call given its granted scopes (least privilege). */
export function toolsForScopes(granted: Scope[]): ToolDef[] {
  return MEMORY_TOOLS.filter((t) => granted.includes(t.requiredScope));
}

/**
 * Server-side scope resolution. In the real gateway, group_id + workspace_id come
 * from the validated token, NOT from the request body. Any client-supplied scope
 * is dropped here (ADR-001).
 */
export function resolveInjectedScope(injected: AlluraScope): AlluraScope {
  return injected;
}
