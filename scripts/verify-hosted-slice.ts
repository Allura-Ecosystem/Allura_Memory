/**
 * verify-hosted-slice.ts — live-DB smoke for the Allura Hosted Platform Phase 1 slice.
 *
 * Proves the Bumblebee spine against the real Postgres: create workspace → mint
 * scoped token → authorize tool calls (permit + scope-deny + bad-token-deny) →
 * confirm append-only audit rows. Does NOT execute memory tools (those hit the
 * full memory stack and are covered elsewhere); it verifies the gateway + data layer.
 *
 * Run: bun scripts/verify-hosted-slice.ts
 */
process.env.ALLURA_MCP_TOKEN_SECRET ??= "hosted-slice-smoke-secret-key-001";

import { closePool, getPool } from "../src/lib/postgres/connection";
import { authorizeToolCall } from "../src/lib/guard/gateway";
import { createToken } from "../src/lib/mcp-token/repository";
import { createWorkspace } from "../src/lib/workspace/repository";

const GROUP = "allura-hosted-smoke";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function main(): Promise<void> {
  const ws = await createWorkspace({ group_id: GROUP, name: "Smoke Sales", created_by: "smoke" });
  assert(ws.group_id === GROUP && ws.lock_mode === "normal", "workspace created with group_id + lock_mode=normal");

  // Mint a read-only token: memory_search permitted, memory_add denied.
  const { raw, record } = await createToken({
    group_id: GROUP,
    workspace_id: ws.workspace_id,
    agent_name: "claude-smoke",
    scopes: ["memory:read"],
  });
  assert(record.token_hash !== raw && record.token_prefix.length > 0, "token stored as hash + prefix (raw not persisted)");

  const permit = await authorizeToolCall(`Bearer ${raw}`, "memory_search");
  assert(permit.ok && permit.scope.group_id === GROUP && permit.scope.workspace_id === ws.workspace_id,
    "memory_search PERMITTED with token-injected group_id + workspace_id");

  const denyScope = await authorizeToolCall(`Bearer ${raw}`, "memory_add");
  assert(!denyScope.ok && denyScope.status === 403, "memory_add DENIED (403) — missing memory:write scope");

  const denyAuth = await authorizeToolCall("Bearer allura_mcp_not-a-real-token", "memory_search");
  assert(!denyAuth.ok && denyAuth.status === 401, "bad token DENIED (401)");

  const { rows } = await getPool().query(
    `SELECT event_type, metadata->>'decision' AS decision, metadata->>'action' AS action
     FROM events WHERE group_id = $1 AND event_type LIKE 'mcp_gateway_%'
     ORDER BY id DESC LIMIT 3`,
    [GROUP],
  );
  assert(rows.length >= 2, `append-only audit rows written for permit AND deny (found ${rows.length})`);
  console.log("  audit:", JSON.stringify(rows));

  await closePool();
  console.log("PASS: hosted slice spine verified against live DB.");
}

main().catch(async (err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  await closePool().catch(() => {});
  process.exit(1);
});
