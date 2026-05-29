/** 
 * Permission Profiles API Routes - GET/PATCH /api/permission-profiles/:id
 * 
 * Story 2.3: Define Roles - Individual profile operations
 * 
 * Routes:
 * - GET /api/permission-profiles/:id — Get a single profile by ID
 * - PATCH /api/permission-profiles/:id — Update an existing profile
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  forbiddenResponse,
  type PermissionProfile,
  PermissionProfileRequestBodySchema,
  requireRole,
  unauthorizedResponse,
  updatePermissionProfile,
  validatePermissionProfile,
} from "@/lib/auth";
const SOURCE = "permission-profiles-api";

type ApiWarning = {
  id: string;
  code: string;
  message: string;
  source: string;
  severity: "info" | "warning" | "critical";
};

type PermissionProfileWarning = Omit<ApiWarning, "id" | "source"> & {
  id?: string;
  source?: string;
};

// In-memory seeded profiles (same as root route)
const seededProfiles: PermissionProfile[] = [
  {
    id: "profile_admin",
    group_id: "allura-system",
    name: "Administrator",
    description: "Can manage teams, roles, policies, and governed settings within tenant scope.",
    role_ids: ["admin"],
    allowed_actions: ["team:create", "team:update", "team:assign_member", "role:define", "role:assign", "policy:manage", "audit:read", "audit:export"],
    memory_scope: ["allura:policy", "allura:audit", "allura:work-items"],
    applies_to: ["human"],
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "profile_approver",
    group_id: "allura-system",
    name: "Approver",
    description: "Can decide approval cards when separation-of-duties policy permits.",
    role_ids: ["approver"],
    allowed_actions: ["approval:decide", "audit:read", "memory:read"],
    memory_scope: ["allura:approvals", "allura:audit", "allura:memory"],
    applies_to: ["human"],
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "profile_auditor",
    group_id: "allura-system",
    name: "Auditor",
    description: "Read-only access to audit, provenance, policy decisions, and export where allowed.",
    role_ids: ["auditor"],
    allowed_actions: ["audit:read", "audit:export", "memory:read"],
    memory_scope: ["allura:audit", "allura:memory"],
    applies_to: ["human"],
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "profile_viewer",
    group_id: "allura-system",
    name: "Viewer",
    description: "Read-only scoped dashboard visibility.",
    role_ids: ["viewer"],
    allowed_actions: ["memory:read"],
    memory_scope: ["allura:status"],
    applies_to: ["human"],
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "profile_service_actor",
    group_id: "allura-system",
    name: "Service Actor",
    description: "Adapter/runtime identity that can submit work, report status, and attach evidence without approving or bypassing policy.",
    role_ids: ["service_actor"],
    allowed_actions: ["work_item:create", "adapter:report_status", "evidence:attach", "policy:evaluate"],
    memory_scope: ["allura:work-items", "allura:evidence"],
    applies_to: ["service", "agent"],
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
];

function response<T>(data: T | null, error: string | null, warnings: PermissionProfileWarning[] = [], status = 200) {
  const normalizedWarnings: ApiWarning[] = warnings.map((warning) => ({
    ...warning,
    id: warning.id ?? warning.code ?? "permission-profile-warning",
    source: warning.source ?? SOURCE,
    severity: warning.severity ?? "info",
  }));

  const body = {
    data,
    error,
    degraded: false,
    warnings: normalizedWarnings,
    source: SOURCE,
    fetched_at: new Date().toISOString(),
  };

  return NextResponse.json(body, { status });
}

// GET /api/permission-profiles/:id — Fetch a single profile by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const roleCheck = requireRole(request, "viewer");
  if (!roleCheck.user) return unauthorizedResponse();
  if (!roleCheck.allowed) return forbiddenResponse(roleCheck);

  const { id } = await params;
  const profile = seededProfiles.find((p) => p.id === id);

  if (!profile) {
    return response(null, `Profile not found: ${id}`, [
      {
        id: "not-found",
        code: "not-found",
        message: `No permission profile exists with id=${id}`,
        source: SOURCE,
        severity: "info",
      },
    ], 404);
  }

  const validation = validatePermissionProfile(profile);

  if (!validation.ok) {
    return response(null, `Permission profile contract validation failed: ${validation.errors.join("; ")}`, [
      {
        id: "shape-drift",
        code: "shape-drift",
        message: validation.errors.join("; "),
        source: SOURCE,
        severity: "critical",
      },
    ], 500);
  }

  return response(validation.data, null, [], 200);
}

// PATCH /api/permission-profiles/:id — Update an existing profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const roleCheck = requireRole(request, "admin");
  if (!roleCheck.user) return unauthorizedResponse();
  if (!roleCheck.allowed) return forbiddenResponse(roleCheck);

  const { id } = await params;
  const existingProfile = seededProfiles.find((p) => p.id === id);

  if (!existingProfile) {
    return response(null, `Profile not found: ${id}`, [
      {
        id: "not-found",
        code: "not-found",
        message: `No permission profile exists with id=${id}`,
        source: SOURCE,
        severity: "info",
      },
    ], 404);
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return response(null, "Permission profile request body must be valid JSON", [
        {
          code: "invalid-json",
          message: "PATCH /api/permission-profiles/:id requires a valid JSON request body",
          severity: "critical",
        },
      ], 400);
    }

    const parsed = PermissionProfileRequestBodySchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues.map((issue: z.ZodIssue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return response(null, `Permission profile validation failed: ${message}`, [
        {
          id: "validation-error",
          code: "validation-error",
          message,
          source: SOURCE,
          severity: "critical",
        },
      ], 400);
    }

    // Only allow updates to mutable fields (not id, group_id, created_at)
    const updates: Partial<PermissionProfile> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.role_ids !== undefined) updates.role_ids = parsed.data.role_ids;
    if (parsed.data.allowed_actions !== undefined) updates.allowed_actions = parsed.data.allowed_actions;
    if (parsed.data.memory_scope !== undefined) updates.memory_scope = parsed.data.memory_scope;
    if (parsed.data.applies_to !== undefined) updates.applies_to = parsed.data.applies_to;

    const updatedProfile = updatePermissionProfile(existingProfile, updates);

    const validation = validatePermissionProfile(updatedProfile);

    if (!validation.ok) {
      return response(null, `Permission profile contract validation failed: ${validation.errors.join("; ")}`, [
        {
          id: "shape-drift",
          code: "shape-drift",
          message: validation.errors.join("; "),
          source: SOURCE,
          severity: "critical",
        },
      ], 500);
    }

    // Replace the old profile in our in-memory list
    const index = seededProfiles.findIndex((p) => p.id === id);
    seededProfiles[index] = updatedProfile;

    return response(validation.data, null, [
      {
        id: "audit-persistence-pending",
        code: "audit-persistence-pending",
        message: "PermissionProfile updated; durable persistence/audit wiring remains required before production use.",
        source: SOURCE,
        severity: "info",
      },
    ], 200);
  } catch (error) {
    return response(null, error instanceof Error ? error.message : "Unknown server error", [
      {
        id: "internal-error",
        code: "internal-error",
        message: "Permission profile update encountered an error",
        source: SOURCE,
        severity: "critical",
      },
    ], 500);
  }
}
