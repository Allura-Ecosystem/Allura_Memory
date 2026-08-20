/**
 * RuVix ControlPlane - Tenant Isolation Policy
 * 
 * Migrated from src/lib/mcp/enforced-client.ts
 * 
 * This module provides tenant isolation enforcement through the controlPlane.
 * All operations must have a valid allura-* group_id.
 * 
 * DEPRECATION: src/lib/mcp/enforced-client.ts is now deprecated.
 * Use controlPlane syscalls or SDK wrapper instead.
 */

import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ALLURA_PREFIX - Required for all tenant IDs
 * ARCH-001: Enforce allura-* naming convention for tenant isolation
 */
const ALLURA_PREFIX = "allura-";

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that group_id follows allura-* naming convention
 * ARCH-001 compliance — now enforced directly by validateGroupId
 *
 * @param groupId - Group ID to validate (already validated by validateGroupId)
 * @throws GroupIdValidationError if invalid format
 * @deprecated Use validateGroupId directly — it now enforces the allura- prefix
 */
export function validateAlluraPrefix(groupId: string): void {
  // ARCH-001: validateGroupId now enforces allura- prefix, so this is a no-op
  // Kept for backward compatibility — will be removed in future cleanup
  if (!groupId.startsWith(ALLURA_PREFIX)) {
    throw new GroupIdValidationError(
      `group_id must use allura-* format (found: '${groupId}'). ` +
      `Example: allura-faith-meats`
    );
  }
}

/**
 * Validate group_id for controlPlane operations
 *
 * Combines existing validateGroupId() with allura-* prefix check.
 * ARCH-001: validateGroupId now enforces the prefix, so this is
 * effectively a passthrough but kept for explicitness.
 *
 * @param groupId - Group ID to validate
 * @returns Validated group_id
 * @throws GroupIdValidationError if invalid
 */
export function validateTenantIsolation(groupId: string): string {
  // validateGroupId now enforces ^allura- prefix (ARCH-001)
  return validateGroupId(groupId);
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT POLICY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tenant context for controlPlane operations
 */
export interface TenantContext {
  /** Validated group_id */
  group_id: string;
  
  /** Tenant name (derived from group_id) */
  tenant_name: string;
  
  /** Platform identifier */
  platform?: string;
  
  /** Additional tenant metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Extract tenant context from group_id
 * 
 * @param groupId - Validated group_id
 * @returns Tenant context
 */
export function extractTenantContext(groupId: string): TenantContext {
  const validated = validateTenantIsolation(groupId);
  
  // Extract tenant name from group_id (e.g., "allura-faith-meats" → "faith-meats")
  const tenantName = validated.replace(ALLURA_PREFIX, "");
  
  return {
    group_id: validated,
    tenant_name: tenantName,
  };
}

/**
 * Build tenant isolation claims for controlPlane proof
 * 
 * @param groupId - Group ID for isolation
 * @param actor - Actor making the request
 * @param auditContext - Additional audit context
 * @returns Claims object for controlPlane proof
 */
export function buildTenantIsolationClaims(
  groupId: string,
  actor: string,
  auditContext?: Record<string, unknown>
) {
  const tenantContext = extractTenantContext(groupId);
  
  return {
    group_id: tenantContext.group_id,
    audit_context: {
      tenant_name: tenantContext.tenant_name,
      actor,
      ...auditContext,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL_PLANE-NATIVE TENANT ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ControlPlane-native tenant enforcement
 * 
 * This class replaces EnforcedMcpClient with controlPlane-backed enforcement.
 * All operations flow through RuVix controlPlane syscalls.
 * 
 * Usage:
 * ```typescript
 * const tenant = new ControlPlaneTenantEnforcer('allura-faith-meats', 'agent-001');
 * 
 * // All operations automatically include tenant isolation
 * await tenant.callControlPlaneSyscall('mutate', { ... });
 * ```
 */
export class ControlPlaneTenantEnforcer {
  private readonly tenantContext: TenantContext;
  private readonly actor: string;

  constructor(groupId: string, actor: string) {
    this.tenantContext = extractTenantContext(groupId);
    this.actor = actor;
  }

  /**
   * Get validated group_id
   */
  getGroupId(): string {
    return this.tenantContext.group_id;
  }

  /**
   * Get tenant context
   */
  getTenantContext(): TenantContext {
    return { ...this.tenantContext };
  }

  /**
   * Build claims for controlPlane proof
   * 
   * @param auditContext - Additional audit context
   * @returns Claims object
   */
  buildClaims(auditContext?: Record<string, unknown>) {
    return buildTenantIsolationClaims(
      this.tenantContext.group_id,
      this.actor,
      auditContext
    );
  }

  /**
   * Call a controlPlane syscall with tenant isolation
   * 
   * @param syscallName - Syscall to invoke
   * @param args - Syscall arguments
   * @returns Syscall result
   */
  async callControlPlaneSyscall(
    syscallName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    // Import controlPlane dynamically to avoid circular dependency
    const { RuVixControlPlane } = await import("../ruvix");
    
    // Build context with tenant isolation
    const context = {
      actor: this.actor,
      group_id: this.tenantContext.group_id,
      permission_tier: "plugin" as const,
      audit_context: this.buildClaims().audit_context,
    };
    
    // Invoke syscall
    return RuVixControlPlane.syscall(syscallName, args, context);
  }
}

/**
 * Factory function to create controlPlane tenant enforcer
 * 
 * @param groupId - Tenant group ID
 * @param actor - Actor identifier
 * @returns ControlPlaneTenantEnforcer instance
 */
export function createControlPlaneTenantEnforcer(
  groupId: string,
  actor: string
): ControlPlaneTenantEnforcer {
  return new ControlPlaneTenantEnforcer(groupId, actor);
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKWARD COMPATIBILITY WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Backward compatibility wrapper for EnforcedMcpClient migration
 * 
 * This allows gradual migration from EnforcedMcpClient to controlPlane-native enforcement.
 * 
 * @deprecated Use ControlPlaneTenantEnforcer or controlPlane SDK directly
 */
export class EnforcedClientCompatWrapper {
  private readonly enforcer: ControlPlaneTenantEnforcer;

  constructor(groupId: string, actor: string) {
    this.enforcer = createControlPlaneTenantEnforcer(groupId, actor);
  }

  /**
   * Get validated group_id
   */
  getGroupId(): string {
    return this.enforcer.getGroupId();
  }

  /**
   * Call controlPlane syscall (replaces callTool)
   */
  async callControlPlaneSyscall(
    syscallName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    return this.enforcer.callControlPlaneSyscall(syscallName, args);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export { validateGroupId, GroupIdValidationError };
