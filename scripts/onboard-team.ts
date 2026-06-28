/**
 * onboard-team.ts — onboard Gabriel + Samuel via scoped MCP tokens, then PROVE
 * memory isolation two ways against the live DB:
 *
 *   (1) Gateway-level: each bearer authorizes with its OWN injected group_id
 *       (a user can never act under another tenant's group_id — the token decides).
 *   (2) Retrieval-level: a memory stored under one group is NEVER returned to the
 *       other group's scoped query.
 *
 * Defaults (Sabir-approved): isolated groups allura-gabriel / allura-samuel,
 * own workspace each, scopes memory:read + memory:write.
 *
 * NOTE ON DURABILITY: token_hash is derived from ALLURA_MCP_TOKEN_SECRET. The
 * tokens minted here validate only under the secret used at run time. For durable
 * production credentials, the SAME secret must be present in the Brain runtime env.
 *
 * Run: bun scripts/onboard-team.ts
 */
process.env.ALLURA_MCP_TOKEN_SECRET ??= "onboard-verify-run-secret-001";

// Point the RuVector bridge at the live memory DB (5432/memory), same as POSTGRES_*.
process.env.RUVECTOR_HOST ??= process.env.POSTGRES_HOST ?? "127.0.0.1";
process.env.RUVECTOR_PORT ??= process.env.POSTGRES_PORT ?? "5432";
process.env.RUVECTOR_DB ??= process.env.POSTGRES_DB ?? "memory";
process.env.RUVECTOR_USER ??= process.env.POSTGRES_USER ?? "ronin4life";
process.env.RUVECTOR_PASSWORD ??= process.env.POSTGRES_PASSWORD ?? "changeme";

import { randomUUID } from "node:crypto";
import { closePool, getPool } from "../src/lib/postgres/connection";
import { authorizeToolCall } from "../src/lib/guard/gateway";
import { createToken } from "../src/lib/mcp-token/repository";
import { createWorkspace } from "../src/lib/workspace/repository";
import { storeMemory, retrieveMemories } from "../src/lib/ruvector/bridge";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

interface Onboarded {
  person: string;
  group_id: string;
  workspace_id: string;
  raw: string;
}

async function onboard(person: string, group_id: string): Promise<Onboarded> {
  const ws = await createWorkspace({ group_id, name: `${person} Workspace`, created_by: "sabir" });
  assert(ws.group_id === group_id, `[${person}] workspace created in ${group_id}`);

  const { raw, record } = await createToken({
    group_id,
    workspace_id: ws.workspace_id,
    agent_name: person.toLowerCase(),
    scopes: ["memory:read", "memory:write"],
  });
  assert(record.token_hash !== raw && record.token_prefix.length > 0,
    `[${person}] token stored as hash + prefix (raw bearer not persisted)`);

  return { person, group_id, workspace_id: ws.workspace_id, raw };
}

async function main(): Promise<void> {
  console.log("=== Onboarding ===");
  const gabriel = await onboard("Gabriel", "allura-gabriel");
  const samuel = await onboard("Samuel", "allura-samuel");

  console.log("\n=== #6a Gateway-level isolation (token injects its own group_id) ===");
  const gSearch = await authorizeToolCall(`Bearer ${gabriel.raw}`, "memory_search");
  assert(gSearch.ok && gSearch.scope.group_id === "allura-gabriel",
    "Gabriel's bearer → memory_search PERMITTED, scope.group_id = allura-gabriel");
  const gAdd = await authorizeToolCall(`Bearer ${gabriel.raw}`, "memory_add");
  assert(gAdd.ok && gAdd.scope.group_id === "allura-gabriel",
    "Gabriel's bearer → memory_add PERMITTED (read+write)");

  const sSearch = await authorizeToolCall(`Bearer ${samuel.raw}`, "memory_search");
  assert(sSearch.ok && sSearch.scope.group_id === "allura-samuel",
    "Samuel's bearer → memory_search PERMITTED, scope.group_id = allura-samuel");
  const sAdd = await authorizeToolCall(`Bearer ${samuel.raw}`, "memory_add");
  assert(sAdd.ok && sAdd.scope.group_id === "allura-samuel",
    "Samuel's bearer → memory_add PERMITTED (read+write)");

  assert(gSearch.ok && sSearch.ok && gSearch.scope.group_id !== sSearch.scope.group_id,
    "the two bearers inject DIFFERENT group_ids — cross-tenant action is impossible");

  console.log("\n=== #6b Retrieval-level isolation (each group sees only its own memory) ===");
  const sid = `onboard-iso-${randomUUID()}`;
  const gMarker = `zylphquark-gabriel-${randomUUID().slice(0, 8)}`;
  const sMarker = `zylphquark-samuel-${randomUUID().slice(0, 8)}`;

  const gStore = await storeMemory({
    userId: "allura-gabriel", sessionId: sid,
    content: `Isolation probe ${gMarker} — Gabriel-only transient record.`, memoryType: "episodic",
  });
  const sStore = await storeMemory({
    userId: "allura-samuel", sessionId: sid,
    content: `Isolation probe ${sMarker} — Samuel-only transient record.`, memoryType: "episodic",
  });
  assert(!!gStore.id && !!sStore.id, "stored one transient probe memory in each group");

  // Query the shared rare token "zylphquark" under each scope (text mode: no embedding dependency).
  const gView = await retrieveMemories({
    userId: "allura-gabriel", query: "zylphquark isolation probe", limit: 20, threshold: 0, searchMode: "text",
  });
  const sView = await retrieveMemories({
    userId: "allura-samuel", query: "zylphquark isolation probe", limit: 20, threshold: 0, searchMode: "text",
  });

  const gJoined = gView.memories.map((m) => m.content).join(" | ");
  const sJoined = sView.memories.map((m) => m.content).join(" | ");

  assert(gJoined.includes(gMarker), "Gabriel's scoped query RETURNS Gabriel's own memory");
  assert(!gJoined.includes(sMarker), "Gabriel's scoped query NEVER returns Samuel's memory");
  assert(sJoined.includes(sMarker), "Samuel's scoped query RETURNS Samuel's own memory");
  assert(!sJoined.includes(gMarker), "Samuel's scoped query NEVER returns Gabriel's memory");

  // Cleanup ONLY the transient probe rows (workspaces + tokens are kept — that's the onboarding).
  const del = await getPool().query(
    `DELETE FROM allura_memories WHERE group_id = ANY($1) AND content LIKE 'Isolation probe zylphquark-%'`,
    [["allura-gabriel", "allura-samuel"]],
  );
  assert((del.rowCount ?? 0) === 2, `cleaned up ${del.rowCount} transient probe rows (workspaces/tokens kept)`);

  console.log("\n=== BEARER TOKENS (hand over once; run-scoped until secret persisted) ===");
  console.log(`  Gabriel (allura-gabriel): ${gabriel.raw}`);
  console.log(`  Samuel  (allura-samuel):  ${samuel.raw}`);
  console.log(`  Secret used this run: ${process.env.ALLURA_MCP_TOKEN_SECRET}`);

  await closePool();
  console.log("\nPASS: both onboarded; memory isolation proven at gateway AND retrieval against live DB.");
}

main().catch(async (err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  await closePool().catch(() => {});
  process.exit(1);
});
