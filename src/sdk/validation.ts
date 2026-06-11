/**
 * @allura/sdk — Client-Side Validation
 * Story 12.3: group_id and input validation before any network call.
 *
 * These helpers are environment-agnostic and must not import server-only modules.
 */

import { AlluraSDKError } from "./types"

// ── group_id Validation ───────────────────────────────────────────────────────

/**
 * Validates that a group_id conforms to the allura-* tenant namespace.
 *
 * Pattern: ^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$
 *
 * Valid examples:   "allura-system", "allura-my-project", "allura-abc123"
 * Invalid examples: "roninclaw-system", "allura-", "ALLURA-system", "allura"
 *
 * @throws AlluraSDKError with code INVALID_GROUP_ID if validation fails
 */
export function validateGroupId(groupId: string): void {
  if (!/^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(groupId)) {
    throw new AlluraSDKError(
      `Invalid group_id: "${groupId}". Must match ^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$ — no trailing hyphens (e.g. "allura-system", "allura-my-project")`,
      400,
      "INVALID_GROUP_ID",
    )
  }
}

// ── Required Field Validation ─────────────────────────────────────────────────

/**
 * Asserts that a required string field is non-empty.
 *
 * @throws AlluraSDKError with code MISSING_REQUIRED_FIELD
 */
export function requireField(value: string | undefined | null, fieldName: string): string {
  if (!value || value.trim().length === 0) {
    throw new AlluraSDKError(`"${fieldName}" is required and must be a non-empty string`, 400, "MISSING_REQUIRED_FIELD")
  }
  return value
}
