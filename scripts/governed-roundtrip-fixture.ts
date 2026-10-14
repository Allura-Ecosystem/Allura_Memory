// Isolated synthetic backend proof; no human identity or connected Brain access.
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import pg from "pg";
import { approveProposal } from "../src/lib/memory/approve-proposal";
import { createPrincipalContext } from "../src/lib/auth/principal-context";

assert.notEqual(process.getuid?.(), 0);
const { password, migrations } = JSON.parse(await Bun.stdin.text());
assert(/^[a-f0-9]{64}$/.test(password));
const config = { host: "127.0.0.1", port: 5432, database: "memory", user: "sep_owner", password, connectionTimeoutMillis: 1500, statement_timeout: 15000 };
const owner = new pg.Client(config);
// A new Client is required after a failed connection attempt.
let connected = false;
for (let attempt = 0; attempt < 80; attempt++) {
  const probe = new pg.Client(config);
  try { await probe.connect(); connected = true; }
  catch { await Bun.sleep(200); }
  finally { await probe.end(); }
  if (connected) break;
}
assert(connected, "Fresh database did not become ready");
await owner.connect();
let child: ReturnType<typeof Bun.spawn> | undefined;
let drained: Promise<string>[] = [];
let application: pg.Pool | undefined;
try {
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, 0);
  const appPassword = randomBytes(32).toString("hex");
  const migrationPassword = randomBytes(32).toString("hex");
  await owner.query(`CREATE ROLE allura_app LOGIN PASSWORD '${appPassword}' NOINHERIT NOREPLICATION NOBYPASSRLS`);
  await owner.query(`CREATE ROLE allura_migration LOGIN PASSWORD '${migrationPassword}' NOINHERIT NOREPLICATION BYPASSRLS`);
  await owner.query("SELECT set_config('allura.fresh_company_install','on',false)");
  for (const { name, sql } of migrations) {
    try { await owner.query(sql); }
    catch { throw new Error(`Migration failed: ${name}`); }
  }
  for (const table of ["tenants", "workspaces", "mcp_tokens", "canonical_proposals", "graph_memories"]) {
    assert.equal((await owner.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0);
  }
  assert.deepEqual((await owner.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='allura_app'")).rows[0], { rolsuper: false, rolbypassrls: false });
  application = new pg.Pool({ ...config, user: "allura_app", password: appPassword });
  console.log(`PASS: ${migrations.length} migrations, empty company state, explicit random credentials and restricted application role`);

  const scopes = [["allura-roundtrip-a", "roundtrip-a1"], ["allura-roundtrip-a", "roundtrip-a2"], ["allura-roundtrip-b", "roundtrip-b1"]];
  const secret = randomBytes(32).toString("hex");
  const tokens: string[] = [];
  for (const [group, workspace] of scopes) {
    await owner.query("INSERT INTO workspaces(workspace_id,group_id,name) VALUES($1,$2,$1)", [workspace, group]);
    const raw = `allura_mcp_${randomBytes(32).toString("base64url")}`;
    tokens.push(raw);
    await owner.query("INSERT INTO mcp_tokens(id,group_id,workspace_id,agent_name,token_prefix,token_hash,scopes,expires_at,created_by) VALUES($1,$2,$3,'synthetic-capture-agent',$4,$5,$6,NOW()+INTERVAL '1 hour','synthetic-fixture')", [
      `tok_${randomUUID()}`, group, workspace, raw.slice(0,19), createHmac("sha256", secret).update(raw).digest("hex"), ["memory:read", "memory:write"],
    ]);
  }
  const gateway = Bun.spawn([process.execPath, "--no-install", "--no-env-file", "gateway.mjs"], { cwd: "/app", env: {
    NODE_ENV: "production", ALLURA_MCP_HTTP_PORT: "6201", ALLURA_MCP_TOKEN_SECRET: secret, ALLURA_MCP_AUTH_CACHE_TTL_MS: "0",
    GRAPH_BACKEND: "ruvector", POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5432", POSTGRES_DB: "memory",
    POSTGRES_USER: "sep_owner", POSTGRES_PASSWORD: password, POSTGRES_APP_USER: "allura_app", POSTGRES_APP_PASSWORD: appPassword,
  }, stdout: "pipe", stderr: "pipe" });
  // Never print raw gateway diagnostics or test credentials.
  child = gateway;
  drained = [new Response(gateway.stdout).text(), new Response(gateway.stderr).text()];
  async function request(path: string, options: RequestInit = {}) {
    return fetch(`http://127.0.0.1:6201${path}`, { ...options, signal: AbortSignal.timeout(10000) });
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(child.exitCode, null, "Gateway exited before readiness");
    try { const response = await request("/ready"); ready = response.ok && (await response.json()).ready === true; } catch {}
    if (ready) break;
    await Bun.sleep(100);
  }
  assert(ready);
  let sequence = 0;
  async function rpc(index: number, method: string, params: unknown, session?: string) {
    const id = ++sequence;
    const response = await request("/mcp", { method: "POST", headers: {
      Authorization: `Bearer ${tokens[index]}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(session ? { "mcp-session-id": session } : {}),
    }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    const text = await response.text();
    const body = (response.headers.get("content-type") || "").includes("text/event-stream")
      ? text.split(/\r?\n\r?\n/).flatMap(event => {
        const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        return data ? [JSON.parse(data)] : [];
      }).find(item => item.id === id) : JSON.parse(text);
    assert.equal(response.status, 200);
    assert(body.result, "MCP JSON-RPC request failed");
    return { result: body.result, session: response.headers.get("mcp-session-id") };
  }
  async function initialize(index: number): Promise<string> {
    const result = await rpc(index, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "synthetic-governed-roundtrip", version: "1" } });
    assert(result.session);
    const notified = await request("/mcp", { method: "POST", headers: { Authorization: `Bearer ${tokens[index]}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "mcp-session-id": result.session }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    assert.equal(notified.status, 202); await notified.text();
    return result.session;
  }
  const sessions = [await initialize(0), await initialize(1), await initialize(2)];
  async function call(index: number, name: string, args: unknown, session = sessions[index]) {
    const { result } = await rpc(index, "tools/call", { name, arguments: args }, session);
    return { error: result.isError === true, data: JSON.parse(result.content[0].text) };
  }
  const content = "Synthetic governed roundtrip: always retain source evidence, tenant scope, and explicit curator approval before canonical recall. This fixture is not company data or an actual human decision. A later authenticated session should recall only the approved result and preserve its provenance. Other workspaces and companies must never receive the content through search or direct lookup.";
  const capture = await call(0, "memory_add", { group_id: scopes[0][0], user_id: "synthetic-capture-agent", content, metadata: { source: "conversation" } });
  assert.equal(capture.error, false);
  assert.equal(capture.data.stored, "episodic");
  assert.equal(capture.data.pending_review, true);
  assert(capture.data.score >= 0.85, "Fixture must qualify under the existing default threshold");
  const source = (await owner.query("SELECT id,group_id,workspace_id,agent_id,metadata FROM events WHERE event_type='memory_add' AND metadata->>'memory_id'=$1", [capture.data.id])).rows;
  assert.equal(source.length, 1);
  assert.equal(source[0].group_id, scopes[0][0]); assert.equal(source[0].workspace_id, scopes[0][1]);
  assert.equal(source[0].agent_id, "synthetic-capture-agent"); assert.equal(source[0].metadata.content, content);
  assert.equal(source[0].metadata.source, "conversation");
  const proposals = (await owner.query("SELECT id,group_id,workspace_id,status,trace_ref,content FROM canonical_proposals WHERE trace_ref=$1", [source[0].id])).rows;
  assert.equal(proposals.length, 1);
  const proposal = proposals[0];
  assert.equal(proposal.status, "pending"); assert.equal(proposal.content, content);
  assert.equal(proposal.group_id, scopes[0][0]); assert.equal(proposal.workspace_id, scopes[0][1]);
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM graph_memories")).rows[0].n, 0);
  const before = await call(0, "memory_search", { group_id: scopes[0][0], query: "roundtrip" });
  assert.equal(before.error, false); assert.equal(before.data.count, 0); assert.equal(before.data.meta.degraded, false);
  assert.deepEqual(before.data.results, []);
  console.log("PASS: actual HTTP capture creates one scoped episodic trace and pending proposal; no canonical row or approved search result before approval");

  const principal = createPrincipalContext({ principalId: "synthetic-curator", workspaceId: scopes[0][1], tenantIds: [scopes[0][0]], roles: ["curator"], scopes: ["review:approve"], authMethod: "service_identity", sessionId: "synthetic-curator-session" });
  const input = { principal, groupId: scopes[0][0], workspaceId: scopes[0][1], proposalId: proposal.id, rationale: "Synthetic backend integration fixture only", idempotencyKey: randomUUID(), pool: application };
  await assert.rejects(approveProposal({ ...input, principal: createPrincipalContext({ ...principal, principalId: "synthetic-capture-agent" }) }), /Segregation of duties/);
  await assert.rejects(approveProposal({ ...input, principal: createPrincipalContext({ ...principal, roles: ["viewer"], scopes: ["memory:read"] }) }), /verified curator/);
  await assert.rejects(approveProposal({ ...input, workspaceId: scopes[1][1] }), /Proposal not found/);
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM graph_memories")).rows[0].n, 0);
  const receipt = await approveProposal(input);
  assert.equal(receipt.actor_id, "synthetic-curator"); assert.equal(receipt.proposal_id, proposal.id);
  assert.equal(receipt.group_id, scopes[0][0]); assert.equal(receipt.workspace_id, scopes[0][1]);
  assert.equal(String(receipt.source_event_id), String(source[0].id)); assert.equal(receipt.outbox_state, "queued");
  assert.deepEqual(receipt.evidence_references, [`event:${source[0].id}`]);
  assert(receipt.memory_id); assert(receipt.witness_hash);
  const replay = await approveProposal(input);
  assert.equal(replay.id, receipt.id); assert.equal(replay.memory_id, receipt.memory_id);
  for (const table of ["governance_receipts", "promotion_outbox", "promotion_idempotency"]) {
    assert.equal((await owner.query(`SELECT count(*)::int AS n FROM ${table} WHERE proposal_id=$1`, [proposal.id])).rows[0].n, 1);
  }
  const decided = (await owner.query("SELECT status,decided_by,approved_memory_id FROM canonical_proposals WHERE id=$1", [proposal.id])).rows[0];
  assert.deepEqual(decided, { status: "approved", decided_by: "synthetic-curator", approved_memory_id: receipt.memory_id });
  const canonical = (await owner.query("SELECT content,group_id,workspace_id FROM graph_memories WHERE id=$1", [receipt.memory_id])).rows[0];
  assert.deepEqual(canonical, { content, group_id: scopes[0][0], workspace_id: scopes[0][1] });
  const audit = (await owner.query("SELECT event_type,group_id,workspace_id,agent_id,metadata FROM events WHERE metadata->>'proposal_id'=$1 AND event_type='proposal_approved'", [proposal.id])).rows;
  assert.equal(audit.length, 1); assert.equal(audit[0].group_id, scopes[0][0]); assert.equal(audit[0].workspace_id, scopes[0][1]);
  assert.equal(audit[0].event_type, "proposal_approved"); assert.equal(audit[0].agent_id, "synthetic-curator");
  assert.equal(audit[0].metadata.proposal_id, proposal.id); assert.equal(audit[0].metadata.decision, "approved");
  assert.equal(audit[0].metadata.rationale, input.rationale); assert.equal(Number(audit[0].metadata.score), capture.data.score);
  console.log("PASS: requester self-approval, viewer and foreign-workspace decision refused; actual restricted-role approval commits canonical result, audit, receipt, outbox and idempotent replay");

  const laterSession = await initialize(0); assert.notEqual(laterSession, sessions[0]);
  const recall = await call(0, "memory_search", { group_id: scopes[0][0], query: "roundtrip" }, laterSession);
  assert.equal(recall.error, false); assert.equal(recall.data.meta.degraded, false);
  assert.deepEqual(recall.data.results.map((item: { id: string }) => item.id), [receipt.memory_id]);
  const found = await call(0, "memory_get", { group_id: scopes[0][0], id: receipt.memory_id }, laterSession);
  assert.equal(found.error, false); assert.equal(found.data.content, content); assert.equal(found.data.source, "semantic");
  assert.equal(found.data.id, receipt.memory_id); assert.equal(found.data.meta.degraded, false);
  for (const index of [1, 2]) {
    const excluded = await call(index, "memory_search", { group_id: scopes[index][0], query: "roundtrip" });
    assert.equal(excluded.error, false); assert.equal(excluded.data.count, 0); assert.equal(excluded.data.meta.degraded, false);
    assert.deepEqual(excluded.data.results, []);
    const denied = await call(index, "memory_get", { group_id: scopes[index][0], id: receipt.memory_id });
    assert.equal(denied.error, true); assert.equal(denied.data.error, `Memory not found: ${receipt.memory_id}`);
  }
  console.log("PASS: separate MCP session recalls exact approved result; other workspace and tenant cannot search/get it");
  console.log("LIMIT: synthetic service curator, not human approval/SSO; queued outbox not delivery; no external embedding service, live Brain reconciliation, document ACL or complete pilot acceptance");
} finally {
  if (child) {
    if (child.exitCode === null) child.kill("SIGTERM");
    const timer = setTimeout(() => { if (child?.exitCode === null) child.kill("SIGKILL"); }, 5000);
    try { await child.exited; await Promise.all(drained); } finally { clearTimeout(timer); }
  }
  await application?.end(); await owner.end();
}
