import { z } from "zod";

import {
  CANONICAL_ROLE_IDS,
  type PermissionPrincipalKind,
  type PermissionProfile,
  type RoleId,
} from "./types";

const RoleIdSchema = z.enum(CANONICAL_ROLE_IDS);
const PrincipalKindSchema = z.enum(["human", "service", "agent"]);

export const PermissionProfileSchema = z.object({
  id: z.string().min(1),
  group_id: z.string().regex(/^allura-[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string(),
  role_ids: z.array(RoleIdSchema).min(1),
  allowed_actions: z.array(z.string().min(1)),
  memory_scope: z.array(z.string().min(1)),
  applies_to: z.array(PrincipalKindSchema).min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const PermissionProfileRequestBodySchema = PermissionProfileSchema.pick({
  name: true,
  description: true,
  role_ids: true,
  allowed_actions: true,
  memory_scope: true,
  applies_to: true,
}).partial();

export type PermissionProfileRequestBody = z.infer<
  typeof PermissionProfileRequestBodySchema
>;

export type PermissionProfileValidationResult =
  | { ok: true; data: PermissionProfile }
  | { ok: false; errors: string[] };

export function validatePermissionProfile(
  profile: unknown,
): PermissionProfileValidationResult {
  const parsed = PermissionProfileSchema.safeParse(profile);

  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "profile"}: ${issue.message}`,
      ),
    };
  }

  return { ok: true, data: parsed.data as PermissionProfile };
}

export function updatePermissionProfile(
  existing: PermissionProfile,
  updates: Partial<
    Pick<
      PermissionProfile,
      | "name"
      | "description"
      | "role_ids"
      | "allowed_actions"
      | "memory_scope"
      | "applies_to"
    >
  >,
): PermissionProfile {
  return {
    ...existing,
    ...updates,
    role_ids: (updates.role_ids as RoleId[] | undefined) ?? existing.role_ids,
    applies_to:
      (updates.applies_to as PermissionPrincipalKind[] | undefined) ??
      existing.applies_to,
    updated_at: new Date().toISOString(),
  };
}
