/**
 * hosted-mcp.e2e.test.ts — full MCP gateway round-trip against the live stack.
 *
 * Proves the demoable MVP spine end to end: mint a scoped token → POST /mcp →
 * Bumblebee authorizes → REAL memory_add/memory_search execute → append-only audit.
 * Gated by RUN_E2E_TESTS (live PG + Neo4j + ruvector).
 */
process.env.ALLURA_MCP_TOKEN_SECRET ??= "hosted-e2e-secret-key-0001";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { closePool, getPool } from "@/lib/postgres/connection";
import { createToken } from "@/lib/mcp-token/repository";
import { createWorkspace } from "@/lib/workspace/repository";
import { POST as mcpPOST } from "@/app/mcp/route";

const RUN = process.env.RUN_E2E_TESTS === "true";
const GROUP = "allura-hosted-e2e";

function mcpReq(bearer: string, name: string, args: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
}

describe.runIf(RUN)("hosted MCP gateway e2e", () => {
  let workspaceId: string;
  let writeToken: string;
  let readToken: string;

  beforeAll(async () => {
    const ws = await createWorkspace({ group_id: GROUP, name: "E2E Sales", created_by: "e2e" });
    workspaceId = ws.workspace_id;
    writeToken = (await createToken({ group_id: GROUP, workspace_id: workspaceId, agent_name: "claude-e2e", scopes: ["memory:read", "memory:write"] })).raw;
    readToken = (await createToken({ group_id: GROUP, workspace_id: workspaceId, agent_name: "viewer-e2e", scopes: ["memory:read"] })).raw;
  });

  afterAll(async () => {
    await closePool();
  });

  it("memory_add executes for a write-scoped token and writes a permit audit row", async () => {
    const res = await mcpPOST(mcpReq(writeToken, "memory_add", { content: "E2E: Faith Meats ships nationwide on Tuesdays." }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.error).toBeUndefined();
    expect(json.result).toBeDefined();

    const { rows } = await getPool().query(
      `SELECT 1 FROM events WHERE group_id = $1 AND event_type = 'mcp_gateway_permit' AND metadata->>'action' = 'memory_add' LIMIT 1`,
      [GROUP],
    );
    expect(rows.length).toBe(1);
  });

  it("memory_search returns results for the same workspace", async () => {
    const res = await mcpPOST(mcpReq(writeToken, "memory_search", { query: "Faith Meats ships", limit: 5 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.error).toBeUndefined();
    expect(json.result).toBeDefined();
  });

  it("memory_add is DENIED (403) for a read-only token and writes a deny audit row", async () => {
    const res = await mcpPOST(mcpReq(readToken, "memory_add", { content: "should be blocked" }));
    expect(res.status).toBe(403);

    const { rows } = await getPool().query(
      `SELECT 1 FROM events WHERE group_id = $1 AND event_type = 'mcp_gateway_deny' AND metadata->>'action' = 'memory_add' LIMIT 1`,
      [GROUP],
    );
    expect(rows.length).toBe(1);
  });
});
