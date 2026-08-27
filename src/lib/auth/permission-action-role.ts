import type { AlluraRole, PermissionAction } from "./types";

/**
 * Canonical binding from declarative read capabilities to permission actions.
 * Module registries may consume this authority but may not introduce their own
 * capability-to-role map.
 */
export const READ_CAPABILITY_ACTIONS: Readonly<Record<string, PermissionAction>> = Object.freeze({
  "read:inventory": "inventory:read",
  "read:exposures": "exposure:read",
  "read:receipts": "receipt:read",
});

export function actionForReadCapability(capability: string): PermissionAction | undefined {
  return READ_CAPABILITY_ACTIONS[capability];
}

/**
 * Minimum AlluraRole that may perform each PermissionAction.
 *
 * Kept free of Next.js dependencies so runtime authorization and the static
 * route-manifest validator use the same fail-closed action floor.
 */
export const ACTION_MINIMUM_ROLE: Readonly<Record<string, AlluraRole>> = {
  // Reads
  "memory:read": "viewer",
  "audit:read": "viewer",
  "policy:evaluate": "viewer",
  "inventory:read": "curator",
  "exposure:read": "curator",
  "receipt:read": "curator",

  // Mutations / governance decisions
  "memory:write": "curator",
  "approval:decide": "curator",
  "audit:export": "curator",
  "work_item:create": "curator",
  "evidence:attach": "curator",
  "adapter:report_status": "curator",
  "team:assign_member": "curator",

  // Tenant, identity and policy administration
  "memory:delete": "admin",
  "team:create": "admin",
  "team:update": "admin",
  "role:define": "admin",
  "role:assign": "admin",
  "policy:manage": "admin",
};

/** Unknown/open-union actions fail closed to admin. */
export function minimumRoleForAction(action: PermissionAction): AlluraRole {
  return ACTION_MINIMUM_ROLE[action] ?? "admin";
}
