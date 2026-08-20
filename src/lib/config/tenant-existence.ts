/**
 * Tenant Existence Validation
 *
 * Story 22.1: Validates that a group_id is registered in the `tenants`
 * table before allowing controlPlane writes. Fail closed if tenant not registered.
 *
 * This module is used by the controlPlane target-resolver to enforce that only
 * registered tenants can write to the database.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("server-side only");
}

import { getPool } from "@/lib/postgres/connection";
import { validateGroupId } from "@/lib/validation/group-id";

export interface TenantRecord {
  group_id: string;
  name: string;
  description: string;
  owner_agent_id: string;
  config: Record<string, unknown>;
  active: boolean;
  created_at: Date;
}

/**
 * Check whether a group_id exists in the tenants table.
 *
 * @param groupId - The group_id to check (validated for format first)
 * @returns true if the tenant exists and is active, false otherwise
 * @throws GroupIdValidationError if the group_id format is invalid
 */
export async function isRegisteredTenant(groupId: string): Promise<boolean> {
  const validated = validateGroupId(groupId);
  const pool = getPool();
  const result = await pool.query(
    "SELECT 1 FROM tenants WHERE group_id = $1 AND active = TRUE",
    [validated]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get a tenant record by group_id.
 *
 * @param groupId - The group_id to look up
 * @returns The tenant record or null if not found
 * @throws GroupIdValidationError if the group_id format is invalid
 */
export async function getTenant(groupId: string): Promise<TenantRecord | null> {
  const validated = validateGroupId(groupId);
  const pool = getPool();
  const result = await pool.query(
    "SELECT group_id, name, description, owner_agent_id, config, active, created_at FROM tenants WHERE group_id = $1",
    [validated]
  );
  if ((result.rowCount ?? 0) === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    group_id: row["group_id"] as string,
    name: row["name"] as string,
    description: row["description"] as string,
    owner_agent_id: row["owner_agent_id"] as string,
    config: (row["config"] as Record<string, unknown>) ?? {},
    active: row["active"] as boolean,
    created_at: row["created_at"] as Date,
  };
}

/**
 * Validate that a group_id is a registered, active tenant.
 * Throws a descriptive error if the tenant is not registered or inactive.
 *
 * @param groupId - The group_id to validate
 * @throws Error if the tenant is not registered or inactive
 */
export async function assertRegisteredTenant(groupId: string): Promise<void> {
  const validated = validateGroupId(groupId);
  const pool = getPool();
  const result = await pool.query(
    "SELECT active FROM tenants WHERE group_id = $1",
    [validated]
  );
  if ((result.rowCount ?? 0) === 0) {
    throw new Error(
      `group_id '${validated}' is not a registered tenant. Run POST /api/tenants to register.`
    );
  }
  const active = result.rows[0]["active"] as boolean;
  if (!active) {
    throw new Error(`Tenant '${validated}' is inactive.`);
  }
}