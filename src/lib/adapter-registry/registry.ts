/**
 * Adapter Registry Implementation
 *
 * Story 0: Adapter Source-of-Truth & Policy Registry
 *
 * Manages adapter declarations and provides operations for registration,
 * retrieval, and validation.
 */

import type {
  AdapterDeclaration,
  AdapterRegistry,
  RegistryValidationResult,
} from "./types"
import { AdapterNotFoundError, AdapterRegistryError } from "./types"

// ── Registry Instance ────────────────────────────────────────────────────────

/**
 * Create a new empty adapter registry
 */
export function createAdapterRegistry(): AdapterRegistry {
  return {
    adapters: [],
    byId: {},
    byRoute: {},
  }
}

// ── Adapter Operations ───────────────────────────────────────────────────────
//
// Required fields (Pike Review findings):
// - adapter_id, display_name, route, system_of_record (from interface)
// - read_policy (Pike finding: missing)
// - write_policy (Pike finding: missing)
// - degradation_behavior (Pike finding: missing)
//
// Route uniqueness: each route must be unique across registry (Pike finding)

/**
 * Validate an adapter declaration for required fields
 */
function validateAdapterFields(adapter: AdapterDeclaration): void {
  const errors: string[] = []

  // Check required fields
  if (!adapter.adapter_id) errors.push("adapter_id is required")
  if (!adapter.display_name) errors.push("display_name is required")
  if (!adapter.route) errors.push("route is required")
  if (!adapter.system_of_record) errors.push("system_of_record is required")
  if (!adapter.read_policy) errors.push("read_policy is required")
  if (!adapter.write_policy) errors.push("write_policy is required")
  if (!adapter.degradation_behavior) errors.push("degradation_behavior is required")

  if (errors.length > 0) {
    throw new AdapterRegistryError("validateFields", errors.join(", "), adapter.adapter_id)
  }
}

/**
 * Add an adapter to the registry
 *
 * @param registry - The registry to add to
 * @param adapter - The adapter declaration to add
 * @returns The added adapter
 * @throws AdapterRegistryError if validation fails or adapter_id/route already exists
 */
export function addAdapter(registry: AdapterRegistry, adapter: AdapterDeclaration): AdapterDeclaration {
  // Validate required fields (Pike: read_policy, write_policy, system_of_record, degradation_behavior)
  validateAdapterFields(adapter)

  // Check for duplicate adapter_id
  if (registry.byId[adapter.adapter_id]) {
    throw new AdapterRegistryError(
      "addAdapter",
      `Adapter ID already exists: ${adapter.adapter_id}`,
      adapter.adapter_id
    )
  }

  // Check for duplicate route (Pike: duplicate routes should be rejected)
  if (registry.byRoute[adapter.route]) {
    throw new AdapterRegistryError(
      "addAdapter",
      `Adapter route already exists: ${adapter.route}`,
      adapter.adapter_id
    )
  }

  // Add to adapters array
  registry.adapters.push(adapter)

  // Add to byId map
  registry.byId[adapter.adapter_id] = adapter

  // Add to byRoute map (unique route enforced)
  registry.byRoute[adapter.route] = adapter

  return adapter
}

/**
 * Get an adapter by its ID
 *
 * @param registry - The registry to search
 * @param adapterId - The adapter ID to find
 * @returns The adapter if found, null otherwise
 */
export function getAdapter(registry: AdapterRegistry, adapterId: string): AdapterDeclaration | null {
  return registry.byId[adapterId] ?? null
}

/**
 * Get an adapter by its route
 *
 * @param registry - The registry to search
 * @param route - The route to find
 * @returns The adapter if found, null otherwise
 */
export function getAdapterByRoute(registry: AdapterRegistry, route: string): AdapterDeclaration | null {
  return registry.byRoute[route] ?? null
}

/**
 * Get multiple adapters for a specific route
 *
 * @param registry - The registry to search
 * @param route - The route to find
 * @returns Array of adapters for that route
 */
export function getAdaptersByRoute(registry: AdapterRegistry, route: string): AdapterDeclaration[] {
  return registry.adapters.filter((a) => a.route === route)
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate registry integrity
 *
 * Checks:
 * - No duplicate adapter_ids
 * - All required fields present
 * - Route format validation
 * - Policy type validation
 *
 * @param registry - The registry to validate
 * @returns Validation result with errors if any
 */
export function validateRegistry(registry: AdapterRegistry): RegistryValidationResult {
  const errors: string[] = []

  // Check for duplicate adapter_ids
  const seenIds = new Set<string>()
  for (const adapter of registry.adapters) {
    if (seenIds.has(adapter.adapter_id)) {
      errors.push(`Duplicate adapter_id: ${adapter.adapter_id}`)
    }
    seenIds.add(adapter.adapter_id)

    // Validate required fields
    if (!adapter.adapter_id || !adapter.display_name || !adapter.route) {
      errors.push(`Missing required fields in adapter: ${adapter.adapter_id || "(unnamed)"}`)
    }

    // Validate required fields (Pike: check for null/undefined, not just falsy)
    // Note: adapter_id, display_name, route already checked above (line 161-163)
    // Additional checks for missing complex fields
    if (!adapter.system_of_record) {
      errors.push(`Missing required fields in adapter: ${adapter.adapter_id || "(unnamed)"}`)
    }
    if (!adapter.read_policy) {
      errors.push(`Missing required fields in adapter: ${adapter.adapter_id || "(unnamed)"}`)
    }
    if (!adapter.write_policy) {
      errors.push(`Missing required fields in adapter: ${adapter.adapter_id || "(unnamed)"}`)
    }
    if (!adapter.degradation_behavior) {
      errors.push(`Missing required fields in adapter: ${adapter.adapter_id || "(unnamed)"}`)
    }

    // Validate route format (must start with /)
    if (adapter.route && !adapter.route.startsWith("/")) {
      errors.push(`Invalid route format: ${adapter.route}`)
    }

    // Validate policy types
    if (adapter.read_policy) {
      if (adapter.read_policy.type !== "authenticated" && adapter.read_policy.type !== "public") {
        errors.push(`Invalid read_policy.type in ${adapter.adapter_id}: ${adapter.read_policy.type}`)
      }
      if (!["viewer", "editor", "admin"].includes(adapter.read_policy.min_role)) {
        errors.push(`Invalid read_policy.min_role in ${adapter.adapter_id}: ${adapter.read_policy.min_role}`)
      }
    }

    if (adapter.write_policy) {
      if (adapter.write_policy.type !== "authenticated" && adapter.write_policy.type !== "public") {
        errors.push(`Invalid write_policy.type in ${adapter.adapter_id}: ${adapter.write_policy.type}`)
      }
      if (!["viewer", "editor", "admin"].includes(adapter.write_policy.min_role)) {
        errors.push(`Invalid write_policy.min_role in ${adapter.adapter_id}: ${adapter.write_policy.min_role}`)
      }
    }

    // Validate memory_scope
    if (!["group", "user", "global"].includes(adapter.memory_scope)) {
      errors.push(`Invalid memory_scope in ${adapter.adapter_id}: ${adapter.memory_scope}`)
    }

    // Validate evidence_policy
    if (!["full", "minimal", "none"].includes(adapter.evidence_policy)) {
      errors.push(`Invalid evidence_policy in ${adapter.adapter_id}: ${adapter.evidence_policy}`)
    }

    // Validate degradation_behavior
    if (!["error", "warn", "graceful", "fallback"].includes(adapter.degradation_behavior)) {
      errors.push(`Invalid degradation_behavior in ${adapter.adapter_id}: ${adapter.degradation_behavior}`)
    }

    // Validate system_of_record
    if (!["notion", "allura-brain", "resource-manifest", "agent-runs", "telemetry", "command", "governance", "scheduled-tasks"].includes(adapter.system_of_record)) {
      errors.push(`Invalid system_of_record in ${adapter.adapter_id}: ${adapter.system_of_record}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate a single adapter declaration
 *
 * @param adapter - The adapter to validate
 * @returns True if valid, false otherwise
 */
export function validateAdapter(adapter: AdapterDeclaration): boolean {
  const registry = createAdapterRegistry()
  try {
    addAdapter(registry, adapter)
    const result = validateRegistry(registry)
    return result.valid && result.errors.length === 0
  } catch (e) {
    return false
  }
}

// ── Default Adapters ─────────────────────────────────────────────────────────

/**
 * Seed the registry with the default adapter declarations for Story 0
 *
 * Adapters:
 * - Notion Work Board (/work-board)
 * - Allura Brain (/allura)
 * - Resource Manifest (/resources)
 * - Agent Runs (/agents)
 * - Telemetry (/telemetry)
 * - Command Overview (/command)
 * - Governance (/dashboard/governance)
 * - Scheduled Tasks (/dashboard/scheduled-tasks)
 */
export function seedDefaultAdapters(): AdapterDeclaration[] {
  return [
    // Notion Work Board
    {
      adapter_id: "notion-work-board",
      display_name: "Notion Work Board",
      route: "/work-board",
      system_of_record: "notion",
      read_policy: {
        type: "authenticated",
        min_role: "viewer",
      },
      write_policy: {
        type: "authenticated",
        min_role: "editor",
        audit: true,
      },
      memory_scope: "group",
      evidence_policy: "full",
      degradation_behavior: "error",
      approved_actions: ["read", "create", "update"],
      prohibited_actions: ["delete", "export"],
    },

    // Allura Brain
    {
      adapter_id: "allura-brain",
      display_name: "Allura Brain",
      route: "/allura",
      system_of_record: "allura-brain",
      read_policy: {
        type: "authenticated",
        min_role: "viewer",
      },
      write_policy: {
        type: "authenticated",
        min_role: "admin",
        audit: true,
      },
      memory_scope: "group",
      evidence_policy: "full",
      degradation_behavior: "warn",
      approved_actions: ["read", "search", "promote"],
      prohibited_actions: ["bulk_export"],
    },

    // Resource Manifest
    {
      adapter_id: "resource-manifest",
      display_name: "Resource Manifest",
      route: "/resources",
      system_of_record: "resource-manifest",
      read_policy: {
        type: "authenticated",
        min_role: "viewer",
      },
      write_policy: {
        type: "authenticated",
        min_role: "editor",
        audit: false,
      },
      memory_scope: "group",
      evidence_policy: "minimal",
      degradation_behavior: "graceful",
      approved_actions: ["read", "list"],
      prohibited_actions: ["write", "modify"],
    },

    // Agent Runs
    {
      adapter_id: "agent-runs",
      display_name: "Agent Runs",
      route: "/agents",
      system_of_record: "agent-runs",
      read_policy: {
        type: "authenticated",
        min_role: "viewer",
      },
      write_policy: {
        type: "authenticated",
        min_role: "admin",
        audit: true,
      },
      memory_scope: "group",
      evidence_policy: "full",
      degradation_behavior: "error",
      approved_actions: ["read", "trace"],
      prohibited_actions: ["modify", "delete"],
    },

    // Telemetry
    {
      adapter_id: "telemetry",
      display_name: "Telemetry",
      route: "/telemetry",
      system_of_record: "telemetry",
      read_policy: {
        type: "authenticated",
        min_role: "viewer",
      },
      write_policy: {
        type: "authenticated",
        min_role: "admin",
        audit: true,
      },
      memory_scope: "global",
      evidence_policy: "full",
      degradation_behavior: "warn",
      approved_actions: ["read", "metrics"],
      prohibited_actions: ["write", "configure"],
    },

    // Command Overview
    {
      adapter_id: "command-overview",
      display_name: "Command Overview",
      route: "/command",
      system_of_record: "command",
      read_policy: {
        type: "authenticated",
        min_role: "viewer",
      },
      write_policy: {
        type: "authenticated",
        min_role: "editor",
        audit: true,
      },
      memory_scope: "group",
      evidence_policy: "full",
      degradation_behavior: "fallback",
      approved_actions: ["read", "aggregate"],
      prohibited_actions: ["raw_write", "unfiltered_export"],
    },

    // Governance
    {
      adapter_id: "governance",
      display_name: "Governance",
      route: "/dashboard/governance",
      system_of_record: "governance",
      read_policy: {
        type: "authenticated",
        min_role: "viewer",
      },
      write_policy: {
        type: "authenticated",
        min_role: "admin",
        audit: true,
      },
      memory_scope: "group",
      evidence_policy: "full",
      degradation_behavior: "warn",
      approved_actions: ["read", "approve", "reject"],
      prohibited_actions: ["bulk_delete", "unfiltered_export"],
    },

    // Scheduled Tasks
    {
      adapter_id: "scheduled-tasks",
      display_name: "Scheduled Tasks",
      route: "/dashboard/scheduled-tasks",
      system_of_record: "scheduled-tasks",
      read_policy: {
        type: "authenticated",
        min_role: "viewer",
      },
      write_policy: {
        type: "authenticated",
        min_role: "admin",
        audit: true,
      },
      memory_scope: "global",
      evidence_policy: "full",
      degradation_behavior: "warn",
      approved_actions: ["read", "metrics"],
      prohibited_actions: ["write", "configure"],
    },
  ]
}

// ── Registry Factory ─────────────────────────────────────────────────────────

/**
 * Create a registry pre-seeded with default adapters
 *
 * @returns A populated adapter registry
 */
export function createDefaultRegistry(): AdapterRegistry {
  const registry = createAdapterRegistry()
  seedDefaultAdapters().forEach((adapter) => {
    addAdapter(registry, adapter)
  })
  return registry
}

// ── Export Types ─────────────────────────────────────────────────────────────

export type {
  AdapterNotFoundError,
  AdapterRegistryError,
}
