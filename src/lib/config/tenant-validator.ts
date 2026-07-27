/**
 * Tenant Validator — MCP Startup Validation
 *
 * Story 22.3: Validates DEFAULT_GROUP_ID against the tenants table at MCP
 * server startup. If the tenant is not registered or inactive, the server
 * fails closed with a clear error message.
 *
 * Validation runs after the database connection is established but before
 * MCP tool registration. This prevents an unregistered tenant from silently
 * creating memories in an unregistered namespace.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("server-side only");
}

import { getPool } from "@/lib/postgres/connection";
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id";

export const DEFAULT_FALLBACK_GROUP_ID = "allura-system";

export class TenantValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantValidationError";
  }
}

export interface TenantValidationResult {
  ok: boolean;
  groupId: string;
  warning?: string;
  error?: string;
}

/**
 * Resolve the effective DEFAULT_GROUP_ID from the environment.
 *
 * If the env var is not set, falls back to `allura-system` with a warning
 * (not a crash). This matches AC-5.
 */
export function resolveDefaultGroupId(): { groupId: string; warning?: string } {
  const raw = process.env.DEFAULT_GROUP_ID;
  if (!raw || raw.trim().length === 0) {
    return {
      groupId: DEFAULT_FALLBACK_GROUP_ID,
      warning: `DEFAULT_GROUP_ID env var is not set. Falling back to '${DEFAULT_FALLBACK_GROUP_ID}'. Set DEFAULT_GROUP_ID to suppress this warning.`,
    };
  }
  return { groupId: raw.trim() };
}

/**
 * Validate that a group_id is a registered, active tenant in the tenants table.
 *
 * This is the core startup validation function. It:
 *   1. Validates the group_id format
 *   2. Queries the tenants table for existence + active status
 *   3. Throws TenantValidationError if not registered or inactive
 *
 * @param groupId - The group_id to validate (typically from DEFAULT_GROUP_ID)
 * @throws TenantValidationError if the tenant is not registered or inactive
 * @throws GroupIdValidationError if the group_id format is invalid
 */
export async function validateTenantAtStartup(groupId: string): Promise<void> {
  // Step 1: Validate format
  const validated = validateGroupId(groupId);

  // Step 2: Query tenants table
  const pool = getPool();
  const result = await pool.query(
    "SELECT active FROM tenants WHERE group_id = $1",
    [validated]
  );

  // Step 3: Fail closed if not found
  if ((result.rowCount ?? 0) === 0) {
    throw new TenantValidationError(
      `DEFAULT_GROUP_ID '${validated}' is not a registered tenant. Run POST /api/tenants to register.`
    );
  }

  // Step 4: Fail closed if inactive
  const active = result.rows[0]["active"] as boolean;
  if (!active) {
    throw new TenantValidationError(`Tenant '${validated}' is inactive.`);
  }
}

/**
 * Resolve and validate the startup tenant in one call.
 *
 * This is the main entry point for MCP startup. It:
 *   1. Resolves DEFAULT_GROUP_ID (with fallback warning)
 *   2. Validates against the tenants table
 *   3. Returns the validated group_id or throws
 *
 * @returns The validated group_id and any warning message
 * @throws TenantValidationError if the tenant is not registered or inactive
 */
export async function resolveAndValidateStartupTenant(): Promise<{
  groupId: string;
  warning?: string;
}> {
  const { groupId, warning } = resolveDefaultGroupId();

  if (warning) {
    console.warn(`[tenant-validator] ${warning}`);
  }

  await validateTenantAtStartup(groupId);

  return { groupId, warning };
}