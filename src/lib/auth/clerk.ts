/**
 * Clerk Integration Helpers
 *
 * Provides Clerk-specific auth utilities for Allura Memory.
 * Production authority is fail closed. DevAuthProvider is available only in
 * explicitly configured non-production environments.
 *
 * Reference: Phase 7 benchmark — Clerk SSO + RBAC
 *
 * IMPORTANT: This module does NOT import @clerk/nextjs directly.
 * It defines the integration layer that will use Clerk when installed.
 * The actual Clerk imports happen in middleware.ts and layout components
 * where @clerk/nextjs is conditionally imported.
 */

import { validateGroupId } from "@/lib/validation/group-id";
import { isValidRole } from "./roles";
import type { AlluraRole, AuthUser, ClerkAlluraMetadata, ClerkPublicMetadata } from "./types";

// ── Clerk Metadata Access ──────────────────────────────────────────────────

/**
 * Extract fail-closed Allura authority from Clerk's custom `allura` session claim.
 *
 * Clerk's session token template maps `allura` from
 * `{{user.public_metadata.allura}}`:
 * ```json
 * {
 *   "allura": {
 *     "role": "curator",
 *     "groupId": "allura-acme",
 *     "workspaceId": "workspace-a"
 *   }
 * }
 * ```
 *
 * @param claim - Value of `auth().sessionClaims.allura`
 * @returns Parsed role, groupId, and workspaceId
 * @throws when any authority field is absent or malformed
 */
export function extractAlluraMetadata(claim: ClerkAlluraMetadata | null | undefined): {
  role: AlluraRole;
  groupId: string;
  workspaceId: string;
} {
  if (!claim) {
    throw new Error("Clerk session claim is missing Allura authority");
  }

  if (!isValidRole(claim.role)) {
    throw new Error("Clerk session claim contains an invalid Allura role");
  }

  const groupId = validateGroupId(claim.groupId);
  const workspaceId = claim.workspaceId;
  if (typeof workspaceId !== "string" || workspaceId.trim() === "" || /[\u0000-\u001f\u007f]/.test(workspaceId)) {
    throw new Error("Clerk session claim contains an invalid workspace ID");
  }

  return { role: claim.role, groupId, workspaceId };
}

// ── Auth User Construction ──────────────────────────────────────────────────

/**
 * Build an AuthUser from Clerk user data.
 *
 * This is the canonical way to construct an AuthUser from Clerk.
 * Used in middleware and server actions.
 *
 * @param params - Clerk user fields
 * @returns AuthUser with strictly validated Clerk authority metadata
 */
export function buildAuthUser(params: {
  id: string;
  email: string;
  name?: string;
  imageUrl?: string;
  publicMetadata: ClerkPublicMetadata;
}): AuthUser {
  const { role, groupId, workspaceId } = extractAlluraMetadata(params.publicMetadata.allura);

  return {
    id: params.id,
    email: params.email,
    name: params.name,
    role,
    groupId,
    workspaceId,
    imageUrl: params.imageUrl,
  };
}

// ── Clerk Configuration ─────────────────────────────────────────────────────

/**
 * Check if Clerk is configured and available.
 *
 * Returns true when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set.
 * In development without Clerk, the DevAuthProvider is used instead.
 */
export function isClerkConfigured(): boolean {
  return typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string"
    && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0
    && typeof process.env.CLERK_SECRET_KEY === "string"
    && process.env.CLERK_SECRET_KEY.length > 0;
}

/**
 * Get the Clerk publishable key from environment.
 *
 * @throws Error if Clerk is not configured
 */
export function getClerkPublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. " +
      "Configure Clerk or use DevAuthProvider for local development."
    );
  }
  return key;
}

// ── Clerk Metadata Mutation ─────────────────────────────────────────────────

/**
 * Build the Clerk publicMetadata payload for setting a user's role.
 *
 * This is used by admin routes to update user roles.
 * The actual Clerk API call is made server-side.
 *
 * @param role - The role to assign
 * @param groupId - The tenant group_id
 * @param workspaceId - The workspace sub-scope
 * @returns Clerk publicMetadata.allura payload
 */
export function buildClerkMetadataPayload(
  role: AlluraRole,
  groupId: string,
  workspaceId: string,
): ClerkAlluraMetadata {
  // Validate group_id before storing
  validateGroupId(groupId);

  if (workspaceId.trim() === "" || /[\u0000-\u001f\u007f]/.test(workspaceId)) {
    throw new Error("Cannot set Clerk metadata with invalid workspaceId");
  }

  return { role, groupId, workspaceId };
}
