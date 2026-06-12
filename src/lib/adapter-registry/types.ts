/**
 * Adapter Registry Types
 *
 * Story 0: Adapter Source-of-Truth & Policy Registry
 *
 * Defines the core contract for adapter declarations and registry operations.
 */

// ── Policy Types ─────────────────────────────────────────────────────────────

/**
 * Minimum role required for read operations
 */
export type ReadRoleType = "authenticated" | "public"

export type ReadMinRole = "viewer" | "editor" | "admin"

export interface ReadPolicy {
  type: ReadRoleType
  min_role: ReadMinRole
}

/**
 * Minimum role required for write operations, with audit option
 */
export type WriteRoleType = "authenticated" | "public"

export type WriteMinRole = "viewer" | "editor" | "admin"

export interface WritePolicy {
  type: WriteRoleType
  min_role: WriteMinRole
  audit?: boolean
}

/**
 * Scope of memory access
 */
export type MemoryScope = "group" | "user" | "global"

/**
 * Evidence collection policy
 */
export type EvidencePolicy = "full" | "minimal" | "none"

/**
 * Behavior when adapter is degraded/unavailable
 */
export type DegradationBehavior = "error" | "warn" | "graceful" | "fallback"

/**
 * System of record type
 */
export type SystemOfRecord = "notion" | "allura-brain" | "resource-manifest" | "agent-runs" | "telemetry" | "command" | "governance" | "scheduled-tasks"

// ── Adapter Declaration ──────────────────────────────────────────────────────

/**
 * Single adapter declaration in the registry
 *
 * Each route must have at least one AdapterDeclaration.
 */
export interface AdapterDeclaration {
  /** Unique adapter identifier */
  adapter_id: string

  /** Friendly display name */
  display_name: string

  /** API route this adapter handles */
  route: string

  /** System of record (Notion, Allura Brain, etc.) */
  system_of_record: SystemOfRecord

  /** Read access policy */
  read_policy: ReadPolicy

  /** Write access policy */
  write_policy: WritePolicy

  /** Memory access scope */
  memory_scope: MemoryScope

  /** Evidence collection policy */
  evidence_policy: EvidencePolicy

  /** Degradation behavior when adapter unavailable */
  degradation_behavior: DegradationBehavior

  /** List of approved actions for this adapter */
  approved_actions: string[]

  /** List of prohibited actions for this adapter */
  prohibited_actions: string[]
}

// ── Registry Types ───────────────────────────────────────────────────────────

/**
 * Registry of all adapters
 */
export interface AdapterRegistry {
  /** Array of all adapters */
  adapters: AdapterDeclaration[]

  /** Map of adapter_id → adapter */
  byId: Record<string, AdapterDeclaration | null>

  /** Map of route → first adapter on that route */
  byRoute: Record<string, AdapterDeclaration | null>
}

/**
 * Registry validation result
 */
export interface RegistryValidationResult {
  /** Whether registry is valid */
  valid: boolean

  /** List of validation errors */
  errors: string[]
}

// ── Error Types ──────────────────────────────────────────────────────────────

/**
 * Error thrown when adapter registry operations fail
 */
export class AdapterRegistryError extends Error {
  public readonly operation: string
  public readonly adapterId?: string

  constructor(operation: string, message: string, adapterId?: string) {
    super(`[AdapterRegistry:${operation}] ${message}${adapterId ? ` (adapter_id=${adapterId})` : ""}`)
    this.name = "AdapterRegistryError"
    this.operation = operation
    this.adapterId = adapterId
  }
}

/**
 * Error thrown when adapter is not found
 */
export class AdapterNotFoundError extends AdapterRegistryError {
  constructor(adapterId: string) {
    super("getAdapter", `Adapter not found: ${adapterId}`, adapterId)
    this.name = "AdapterNotFoundError"
  }
}
