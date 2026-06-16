import { NextRequest, NextResponse } from "next/server";
import { ROLE_SCOPES } from "@allura/rbac";
import type { Scope } from "@allura/types";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { GroupIdValidationError } from "@/lib/validation/group-id";
import {
  createToken,
  listTokensForWorkspace,
  type McpTokenRecord,
} from "@/lib/mcp-token/repository";

// MCP token administration (DESIGN-BUMBLEBEE, F7). Admin-only. The raw token is
// returned exactly once from POST and never again; GET never exposes the hash.

const VALID_SCOPES = new Set<string>(Object.values(ROLE_SCOPES).flat());

/** Public projection — strips token_hash, which must never leave the server. */
function publicToken(r: McpTokenRecord) {
  const { token_hash: _omit, ...rest } = r;
  void _omit;
  return rest;
}

function handle(error: unknown): NextResponse {
  if (error instanceof GroupIdValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof Error && /foreign key|violates/i.test(error.message)) {
    return NextResponse.json({ error: "workspace_id does not exist in this org" }, { status: 400 });
  }
  console.error("tokens API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rc = requireRole(request, "admin");
  if (!rc.user) return unauthorizedResponse();
  if (!rc.allowed) return forbiddenResponse(rc);
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspace_id");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
    }
    const tokens = await listTokensForWorkspace(rc.user.groupId, workspaceId);
    return NextResponse.json({ tokens: tokens.map(publicToken) });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rc = requireRole(request, "admin");
  if (!rc.user) return unauthorizedResponse();
  if (!rc.allowed) return forbiddenResponse(rc);
  try {
    const body = await request.json();
    if (!body?.workspace_id || !body?.agent_name) {
      return NextResponse.json({ error: "workspace_id and agent_name are required" }, { status: 400 });
    }
    const scopes: Scope[] = Array.isArray(body.scopes) ? body.scopes : ["memory:read", "memory:write"];
    const invalid = scopes.filter((s) => !VALID_SCOPES.has(s));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `unknown scopes: ${invalid.join(", ")}` }, { status: 400 });
    }
    const { raw, record } = await createToken({
      group_id: rc.user.groupId,
      workspace_id: body.workspace_id,
      agent_name: body.agent_name,
      scopes,
      created_by: rc.user.id,
      expires_at: body.expires_at ?? null,
    });
    // `token` is shown ONCE. The client must store it now; it is never recoverable.
    return NextResponse.json({ token: raw, record: publicToken(record) }, { status: 201 });
  } catch (error) {
    return handle(error);
  }
}
