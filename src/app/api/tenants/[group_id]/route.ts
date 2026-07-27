/**
 * Tenant Detail API — GET + PATCH /api/tenants/[group_id]
 *
 * Story 22.2: Get single tenant details and update tenant config.
 *
 * GET   /api/tenants/:group_id — admin-only — returns tenant details including config
 * PATCH /api/tenants/:group_id — admin-only — updates tenant config
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

interface TenantDetail {
  group_id: string;
  name: string;
  description: string;
  owner_agent_id: string;
  config: Record<string, unknown>;
  active: boolean;
  created_at: string;
}

interface PatchTenantBody {
  name?: string;
  description?: string;
  owner_agent_id?: string;
  config?: Record<string, unknown>;
  active?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tenants/[group_id] — Get single tenant details
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { group_id: string } }
): Promise<NextResponse> {
  // Auth: require admin role
  const roleCheck = requireRole(request, "admin");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    // Validate group_id format
    let group_id: string;
    try {
      group_id = validateGroupId(params.group_id);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT group_id, name, description, owner_agent_id, config, active, created_at
       FROM tenants
       WHERE group_id = $1`,
      [group_id]
    );

    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { error: `Tenant '${group_id}' not found` },
        { status: 404 }
      );
    }

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

    return NextResponse.json(tenant);
  } catch (error) {
    console.error("[Tenants API] GET single failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/tenants/[group_id] — Update tenant config
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { group_id: string } }
): Promise<NextResponse> {
  // Auth: require admin role
  const roleCheck = requireRole(request, "admin");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    // Validate group_id format
    let group_id: string;
    try {
      group_id = validateGroupId(params.group_id);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }

    const body = (await request.json()) as Partial<PatchTenantBody>;

    const pool = getPool();

    // Check tenant exists
    const existing = await pool.query(
      "SELECT 1 FROM tenants WHERE group_id = $1",
      [group_id]
    );
    if ((existing.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { error: `Tenant '${group_id}' not found` },
        { status: 404 }
      );
    }

    // Build SET clause dynamically from provided fields
    const setClauses: string[] = [];
    const setValues: unknown[] = [];
    let paramIdx = 1;

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json(
          { error: "name must be non-empty" },
          { status: 400 }
        );
      }
      setClauses.push(`name = $${paramIdx++}`);
      setValues.push(body.name);
    }
    if (body.description !== undefined) {
      setClauses.push(`description = $${paramIdx++}`);
      setValues.push(body.description);
    }
    if (body.owner_agent_id !== undefined) {
      setClauses.push(`owner_agent_id = $${paramIdx++}`);
      setValues.push(body.owner_agent_id);
    }
    if (body.config !== undefined) {
      setClauses.push(`config = $${paramIdx++}`);
      setValues.push(JSON.stringify(body.config));
    }
    if (body.active !== undefined) {
      setClauses.push(`active = $${paramIdx++}`);
      setValues.push(body.active);
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Add group_id as the WHERE parameter
    setValues.push(group_id);

    const sql = `UPDATE tenants SET ${setClauses.join(", ")} WHERE group_id = $${paramIdx} RETURNING group_id, name, description, owner_agent_id, config, active, created_at`;

    const result = await pool.query(sql, setValues);
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

    return NextResponse.json(tenant);
  } catch (error) {
    console.error("[Tenants API] PATCH failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}