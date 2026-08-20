/**
 * Tenant Onboarding API — POST + GET /api/tenants
 *
 * Story 22.2: Create and list tenants.
 *
 * POST /api/tenants — admin-only — creates a new tenant
 * GET  /api/tenants — admin-only — lists all active tenants
 *
 * All writes go through the controlPlane syscall_mutate path (pg:tenants target).
 * The tenants table is exempt from tenant-existence validation (Story 22.1).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/api-auth";
import { getPool } from "@/lib/postgres/connection";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface TenantPublic {
  group_id: string;
  name: string;
  description: string;
  owner_agent_id: string;
  created_at: string;
}

interface TenantDetail extends TenantPublic {
  config: Record<string, unknown>;
  active: boolean;
}

interface CreateTenantBody {
  group_id: string;
  name: string;
  description?: string;
  owner_agent_id: string;
  config?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tenants — Create a new tenant
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth: require admin role
  const roleCheck = requireRole(request, "admin");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    const body = (await request.json()) as Partial<CreateTenantBody>;

    // Validate required fields
    if (!body.group_id || !body.name || !body.owner_agent_id) {
      return NextResponse.json(
        {
          error: "Missing required fields: group_id, name, owner_agent_id",
        },
        { status: 400 }
      );
    }

    // Validate group_id format
    let group_id: string;
    try {
      group_id = validateGroupId(body.group_id);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }

    // Validate name is non-empty
    if (!body.name.trim()) {
      return NextResponse.json(
        { error: "name must be non-empty" },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Check for duplicate group_id
    const existing = await pool.query(
      "SELECT 1 FROM tenants WHERE group_id = $1",
      [group_id]
    );
    if ((existing.rowCount ?? 0) > 0) {
      return NextResponse.json(
        { error: `Tenant '${group_id}' already exists` },
        { status: 409 }
      );
    }

    // Insert new tenant
    const config = body.config ?? {};
    const description = body.description ?? "";
    const result = await pool.query(
      `INSERT INTO tenants (group_id, name, description, owner_agent_id, config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING group_id, name, description, owner_agent_id, config, active, created_at`,
      [group_id, body.name, description, body.owner_agent_id, JSON.stringify(config)]
    );

    const row = result.rows[0] as Record<string, unknown>;
    const tenant: TenantDetail = {
      group_id: row["group_id"] as string,
      name: row["name"] as string,
      description: row["description"] as string,
      owner_agent_id: row["owner_agent_id"] as string,
      config: (row["config"] as Record<string, unknown>) ?? {},
      active: row["active"] as boolean,
      created_at: (row["created_at"] as Date).toISOString(),
    };

    return NextResponse.json(tenant, { status: 201 });
  } catch (error) {
    console.error("[Tenants API] POST failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tenants — List all active tenants
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth: require admin role
  const roleCheck = requireRole(request, "admin");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT group_id, name, description, owner_agent_id, created_at
       FROM tenants
       WHERE active = TRUE
       ORDER BY created_at ASC`
    );

    const tenants: TenantPublic[] = result.rows.map(
      (row: Record<string, unknown>) => ({
        group_id: row["group_id"] as string,
        name: row["name"] as string,
        description: row["description"] as string,
        owner_agent_id: row["owner_agent_id"] as string,
        created_at: (row["created_at"] as Date).toISOString(),
      })
    );

    return NextResponse.json({ tenants });
  } catch (error) {
    console.error("[Tenants API] GET failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}