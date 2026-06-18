import { NextRequest, NextResponse } from "next/server";
import { toolsForScopes } from "@allura/mcp-server";
import type { AlluraScope, GroupId } from "@allura/types";
import { auditGateway } from "@/lib/guard/audit";
import { authorizeToolCall } from "@/lib/guard/gateway";
import { injectContext } from "@/lib/guard/inject-context";
import { extractBearer, validateToken } from "@/lib/guard/validate-token";
import type { GroupId as MemGroupId, MemoryAddRequest, MemorySearchRequest } from "@/lib/memory/canonical-contracts";
import { memory_add, memory_search } from "@/mcp/canonical-tools";

// Allura MCP Gateway (DESIGN-MCP-GATEWAY) — POST-only for the Phase 1 slice
// (SSE deferred). Every call goes through Bumblebee: bearer token → server-side
// context injection (group_id + workspace_id, ADR-001) → scope check → audit.
//
// Supported MCP methods: tools/list, tools/call. Wired tools: memory_add, memory_search.

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
  // Slice convenience shape (non-JSON-RPC clients):
  tool?: string;
  arguments?: Record<string, unknown>;
}

function rpcError(id: JsonRpcRequest["id"], status: number, message: string): NextResponse {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code: status, message } },
    { status },
  );
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  scope: AlluraScope,
): Promise<unknown> {
  const group_id = scope.group_id as unknown as MemGroupId;

  if (toolName === "memory_add") {
    const req: MemoryAddRequest = {
      group_id,
      user_id: scope.actor_id,
      content: String(args.content ?? ""),
      // workspace_id is carried in metadata until memory tables are workspace-scoped.
      metadata: { ...(args.metadata as Record<string, unknown> | undefined), workspace_id: scope.workspace_id },
    };
    return memory_add(req);
  }

  if (toolName === "memory_search") {
    const req: MemorySearchRequest = {
      query: String(args.query ?? ""),
      group_id,
      user_id: scope.actor_id,
      limit: typeof args.limit === "number" ? args.limit : 10,
    };
    return memory_search(req);
  }

  throw new Error(`tool not wired in slice: ${toolName}`);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get("authorization");

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, 400, "invalid JSON body");
  }

  const method = body.method ?? (body.tool ? "tools/call" : undefined);

  // tools/list — requires a valid token; returns least-privilege tool set.
  if (method === "tools/list") {
    const validation = await validateToken(extractBearer(authorization));
    if (!validation.ok) {
      await auditGateway({ decision: "deny", action: "tools/list", reason: `token ${validation.reason}` });
      return rpcError(body.id, 401, `token ${validation.reason}`);
    }
    const scope = injectContext(validation.token);
    await auditGateway({ decision: "permit", action: "tools/list", scope, tokenPrefix: validation.token.token_prefix });
    return rpcResult(body.id, { tools: toolsForScopes(scope.scopes) });
  }

  if (method !== "tools/call") {
    return rpcError(body.id, 400, `unsupported method: ${method ?? "(none)"}`);
  }

  const toolName = body.params?.name ?? body.tool;
  const args = body.params?.arguments ?? body.arguments ?? {};
  if (!toolName) {
    return rpcError(body.id, 400, "missing tool name");
  }

  const auth = await authorizeToolCall(authorization, toolName);
  if (!auth.ok) {
    return rpcError(body.id, auth.status, auth.reason);
  }

  try {
    const result = await executeTool(toolName, args, auth.scope);
    return rpcResult(body.id, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "tool execution failed";
    return rpcError(body.id, 500, message);
  }
}
