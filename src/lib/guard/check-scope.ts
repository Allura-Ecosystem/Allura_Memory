import { hasScope } from "@allura/rbac";
import { MEMORY_TOOLS, type ToolDef } from "@allura/mcp-server";
import type { Scope } from "@allura/types";

// Bumblebee step 3: scope gating. Each MCP tool declares a required scope in
// @allura/mcp-server; the agent's granted scopes must include it.

export function toolDef(name: string): ToolDef | undefined {
  return MEMORY_TOOLS.find((t) => t.name === name);
}

export type ScopeCheck =
  | { allowed: true; requiredScope: Scope }
  | { allowed: false; requiredScope?: Scope; reason: string };

export function checkToolScope(toolName: string, granted: Scope[]): ScopeCheck {
  const def = toolDef(toolName);
  if (!def) return { allowed: false, reason: `unknown tool: ${toolName}` };
  if (!hasScope(granted, def.requiredScope)) {
    return {
      allowed: false,
      requiredScope: def.requiredScope,
      reason: `missing required scope: ${def.requiredScope}`,
    };
  }
  return { allowed: true, requiredScope: def.requiredScope };
}
