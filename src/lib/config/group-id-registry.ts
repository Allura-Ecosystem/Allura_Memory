/**
 * Group ID Registry Loader — Story 20.1
 *
 * Reads `.opencode/config/group-id-registry.yaml` and exposes:
 *   - getDefaultGroupId(agentId): string
 *   - getAllowedGroupIds(agentId): string[]
 *
 * Validates every group_id in the registry against ^allura-[a-z0-9-]+$ at load
 * time. Fails closed (throws) on invalid format.
 *
 * Server-side only — the registry file is not shipped to the browser.
 */

if (typeof window !== "undefined") {
  throw new Error("group-id-registry.ts is server-side only");
}

import { readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentRegistryEntry {
  id: string;
  default_group_id: string;
  allowed_group_ids: string[];
}

export interface GroupIdRegistry {
  agents: AgentRegistryEntry[];
  fallback_group_id: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const GROUP_ID_PATTERN = /^allura-[a-z0-9-]+$/;
const DEFAULT_FALLBACK = "allura-system";
const REGISTRY_PATH = join(
  process.cwd(),
  ".opencode",
  "config",
  "group-id-registry.yaml"
);

// ── Registry Loading ────────────────────────────────────────────────────────

let cachedRegistry: GroupIdRegistry | null = null;
let cachedPath: string | null = null;

/**
 * Validate a single group_id against the required pattern.
 * Throws on invalid format — fail closed.
 */
function validateRegistryGroupId(groupId: string, context: string): void {
  if (typeof groupId !== "string" || groupId.length === 0) {
    throw new Error(
      `[group-id-registry] Invalid group_id in ${context}: empty or non-string`
    );
  }
  if (!GROUP_ID_PATTERN.test(groupId)) {
    throw new Error(
      `[group-id-registry] Invalid group_id in ${context}: '${groupId}' does not match ^allura-[a-z0-9-]+$`
    );
  }
}

/**
 * Load and validate the registry from disk.
 * Cached after first load for the default path; custom paths are not cached.
 * Use `reloadRegistry()` to force re-read.
 */
export function loadRegistry(registryPath: string = REGISTRY_PATH): GroupIdRegistry {
  // Return cache only when the same path was previously loaded
  if (cachedRegistry && registryPath === cachedPath) return cachedRegistry;

  const fileContent = readFileSync(registryPath, "utf-8");
  const parsed = parseYaml(fileContent) as GroupIdRegistry;

  if (!parsed || !Array.isArray(parsed.agents)) {
    throw new Error("[group-id-registry] Registry file is missing 'agents' array");
  }

  // Validate fallback
  const fallback = parsed.fallback_group_id || DEFAULT_FALLBACK;
  validateRegistryGroupId(fallback, "fallback_group_id");

  // Validate every agent entry
  for (const entry of parsed.agents) {
    if (!entry.id || typeof entry.id !== "string") {
      throw new Error(
        `[group-id-registry] Agent entry missing 'id' field: ${JSON.stringify(entry)}`
      );
    }

    validateRegistryGroupId(
      entry.default_group_id,
      `agent '${entry.id}' default_group_id`
    );

    if (!Array.isArray(entry.allowed_group_ids) || entry.allowed_group_ids.length === 0) {
      throw new Error(
        `[group-id-registry] Agent '${entry.id}' has no allowed_group_ids`
      );
    }

    for (const gid of entry.allowed_group_ids) {
      validateRegistryGroupId(gid, `agent '${entry.id}' allowed_group_ids`);
    }

    // Ensure default is in the allowed list
    if (!entry.allowed_group_ids.includes(entry.default_group_id)) {
      throw new Error(
        `[group-id-registry] Agent '${entry.id}' default_group_id '${entry.default_group_id}' is not in allowed_group_ids`
      );
    }
  }

  cachedRegistry = parsed;
  cachedPath = registryPath;
  return cachedRegistry;
}

/**
 * Force re-read the registry from disk (clears cache).
 */
export function reloadRegistry(registryPath: string = REGISTRY_PATH): GroupIdRegistry {
  cachedRegistry = null;
  cachedPath = null;
  return loadRegistry(registryPath);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the default group_id for an agent.
 * Returns the fallback (allura-system) if the agent is not in the registry.
 */
export function getDefaultGroupId(agentId: string, registryPath?: string): string {
  const registry = loadRegistry(registryPath ?? REGISTRY_PATH);
  const entry = registry.agents.find((a) => a.id === agentId);
  return entry?.default_group_id ?? registry.fallback_group_id;
}

/**
 * Get all allowed group_ids for an agent.
 * Returns [fallback] if the agent is not in the registry.
 */
export function getAllowedGroupIds(agentId: string, registryPath?: string): string[] {
  const registry = loadRegistry(registryPath ?? REGISTRY_PATH);
  const entry = registry.agents.find((a) => a.id === agentId);
  if (!entry) return [registry.fallback_group_id];
  return [...entry.allowed_group_ids];
}

/**
 * Check if an agent is allowed to access a specific group_id.
 */
export function isAgentAllowedGroupId(
  agentId: string,
  groupId: string,
  registryPath?: string
): boolean {
  return getAllowedGroupIds(agentId, registryPath).includes(groupId);
}

/**
 * Get the full registry (for debugging / inspection).
 */
export function getRegistry(registryPath?: string): GroupIdRegistry {
  return loadRegistry(registryPath ?? REGISTRY_PATH);
}