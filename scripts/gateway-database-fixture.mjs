// Executed inside the immutable gateway candidate by smoke-gateway-database.mjs.
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import pg from "pg";

assert.notEqual(process.getuid(), 0);
const { password, migrations } = JSON.parse(await Bun.stdin.text());
assert(/^[a-f0-9]{64}$/.test(password));
const config = { host: "127.0.0.1", port: 5432, database: "memory", user: "sep_owner", password, connectionTimeoutMillis: 1500, statement_timeout: 15000 };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let owner;
for (let attempt = 0; attempt < 100; attempt++) {
  const candidate = new pg.Client(config);
  try { await candidate.connect(); owner = candidate; break; }
  catch { await candidate.end(); await pause(200); }
}
assert(owner, "Fresh PostgreSQL did not become ready");
let child;
let drained = [];
try {
  assert.equal((await owner.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, 0, "Must start with a blank database");
  for (const { name, sql } of migrations) {
    try { await owner.query(sql); }
    catch (error) { throw new Error(`Migration ${name} failed: ${error.code}: ${error.message}`); }
  }
  console.log(`PASS: ${migrations.length} migrations on fresh ${ (await owner.query("SHOW server_version")).rows[0].server_version }`);
  const appPassword = randomBytes(32).toString("hex");
  await owner.query(`ALTER ROLE allura_app PASSWORD '${appPassword}'`);
  const role = (await owner.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='allura_app'")).rows[0];
  assert.deepEqual(role, { rolsuper: false, rolbypassrls: false });
  const secret = randomBytes(32).toString("hex");
  const tenants = ["allura-sep-a", "allura-sep-a", "allura-sep-b"];
  const workspaces = ["sep-a1", "sep-a2", "sep-b1"];
  const memoryIds = [];
  for (let i = 0; i < 3; i++) {
    await owner.query("INSERT INTO workspaces(workspace_id,group_id,name) VALUES($1,$2,$1)", [workspaces[i], tenants[i]]);
    const id = randomUUID(); memoryIds.push(id);
    await owner.query("INSERT INTO graph_memories(id,group_id,workspace_id,workspace_scope_state,content,score,provenance) VALUES($1,$2,$3,'workspace_scoped',$4,0.9,'manual')", [id, tenants[i], workspaces[i], `packaging synthetic evidence ${workspaces[i]}`]);
  }
  await owner.query("INSERT INTO graph_memories(id,group_id,workspace_scope_state,content,score,provenance) VALUES($1,$2,'legacy_quarantined','packaging quarantined synthetic evidence',0.9,'manual')", [randomUUID(), tenants[0]]);
  async function mint(index, scopes, expired = false) {
    const body = randomBytes(32).toString("base64url");
    const raw = `allura_mcp_${body}`;
    const id = `tok_${randomUUID()}`;
    await owner.query("INSERT INTO mcp_tokens(id,group_id,workspace_id,agent_name,token_prefix,token_hash,scopes,expires_at,created_by) VALUES($1,$2,$3,'same-agent',$4,$5,$6,$7,'synthetic-test')", [id, tenants[index], workspaces[index], `allura_mcp_${body.slice(0,8)}`, createHmac("sha256", secret).update(raw).digest("hex"), scopes, new Date(Date.now() + (expired ? -60000 : 3600000))]);
    return { id, raw };
  }
  // pg.Client is a single connection; do not enqueue concurrent queries on it.
  const tokens = [await mint(0, ["memory:read"]), await mint(1, ["memory:read"]), await mint(2, ["memory:read"]), await mint(0, ["audit:read"]), await mint(0, ["memory:read"], true)];
  child = Bun.spawn([process.execPath, "--no-install", "--no-env-file", "gateway.mjs"], { cwd: "/app", env: {
    NODE_ENV: "production", ALLURA_MCP_HTTP_PORT: "6201", ALLURA_MCP_TOKEN_SECRET: secret,
    ALLURA_MCP_AUTH_CACHE_TTL_MS: "0", GRAPH_BACKEND: "ruvector", POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5432",
    POSTGRES_USER: "sep_owner", POSTGRES_PASSWORD: password, POSTGRES_DB: "memory", POSTGRES_APP_USER: "allura_app", POSTGRES_APP_PASSWORD: appPassword,
  }, stdout: "pipe", stderr: "pipe" });
  // Drain without printing raw gateway diagnostics, which may include test inputs.
  drained = [new Response(child.stdout).text(), new Response(child.stderr).text()];
  async function request(path, options = {}) {
    return fetch(`http://127.0.0.1:6201${path}`, { ...options, signal: AbortSignal.timeout(8000) });
  }
  let live = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    assert.equal(child.exitCode, null, "Gateway exited before liveness");
    try { const response = await request("/live"); live = response.ok && (await response.json()).alive === true; } catch {}
    if (live) break;
    await pause(100);
  }
  assert(live);
  // The gateway marks MCP initialized at process startup (not first session).
  const startupReady = await request("/ready");
  assert.equal(startupReady.status, 200);
  const startupState = await startupReady.json();
  assert.equal(startupState.ready, true);
  assert.equal(startupState.checks.postgres.healthy, true);
  assert.equal(startupState.checks.mcp.healthy, true);
  let sequence = 0;
  async function rpc(token, method, params, session) {
    const id = ++sequence;
    const headers = { Authorization: `Bearer ${token.raw}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(session ? { "mcp-session-id": session } : {}) };
    const response = await request("/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    const text = await response.text();
    const body = (response.headers.get("content-type") || "").includes("text/event-stream")
      ? text.split(/\r?\n\r?\n/).flatMap(event => {
        const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        return data ? [JSON.parse(data)] : [];
      }).find(item => item.id === id) : JSON.parse(text);
    return { status: response.status, body, session: response.headers.get("mcp-session-id") };
  }
  const sessions = [];
  for (const token of tokens.slice(0,4)) {
    const init = await rpc(token, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "isolated-database-smoke", version: "1" } });
    assert.equal(init.status, 200); assert(init.body.result); assert(init.session); sessions.push(init.session);
    const initialized = await request("/mcp", { method: "POST", headers: { Authorization: `Bearer ${token.raw}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "mcp-session-id": init.session }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    assert.equal(initialized.status, 202); await initialized.text();
    const listed = await rpc(token, "tools/list", {}, init.session);
    assert.equal(listed.status, 200);
    for (const tool of ["memory_search", "memory_get"]) assert(listed.body.result.tools.some(item => item.name === tool));
  }
  const ready = await request("/ready");
  assert.equal(ready.status, 200);
  const readiness = await ready.json();
  assert.equal(readiness.ready, true);
  assert.equal(readiness.checks.postgres.healthy, true);
  assert.equal(readiness.checks.mcp.healthy, true);
  console.log("PASS: configured database and initialized gateway ready before and after MCP handshake");
  async function call(index, name, args) {
    const response = await rpc(tokens[index], "tools/call", { name, arguments: args }, sessions[index]);
    assert.equal(response.status, 200); assert(response.body.result);
    const result = response.body.result;
    return { error: result.isError === true, data: JSON.parse(result.content[0].text) };
  }
  function expectedSearch(result, index) {
    assert.equal(result.error, false);
    assert.equal(result.data.meta.degraded, false);
    assert.deepEqual(result.data.meta.stores_used, ["graph"]);
    assert.deepEqual(result.data.meta.stores_attempted, ["graph"]);
    assert.equal(result.data.count, 1);
    assert.deepEqual(result.data.results.map(item => item.id), [memoryIds[index]]);
    assert.equal(result.data.results[0].source, "semantic");
    assert.equal(result.data.results[0].content, `packaging synthetic evidence ${workspaces[index]}`);
  }
  for (let i = 0; i < 3; i++) expectedSearch(await call(i, "memory_search", { group_id: tenants[i], query: "packaging", limit: 10 }), i);
  for (let i = 0; i < 3; i++) {
    const found = await call(i, "memory_get", { group_id: tenants[i], id: memoryIds[i] });
    assert.equal(found.error, false);
    assert.equal(found.data.id, memoryIds[i]);
    assert.equal(found.data.content, `packaging synthetic evidence ${workspaces[i]}`);
    assert.equal(found.data.source, "semantic");
    assert.equal(found.data.meta.degraded, false);
    assert.deepEqual(found.data.meta.stores_used, ["postgres", "graph"]);
  }
  console.log("PASS: exact nondegraded semantic results for three scopes across two tenants; quarantined row excluded");
  const forgedTenant = await call(0, "memory_search", { group_id: tenants[2], query: "packaging" });
  assert(forgedTenant.error); assert.equal(forgedTenant.data.error.code, "TENANT_MISMATCH");
  expectedSearch(await call(0, "memory_search", { group_id: tenants[0], query: "packaging", workspace_id: workspaces[1], scope: { workspace_id: workspaces[1], group_id: tenants[2] } }), 0);
  const forbiddenGet = await call(0, "memory_get", { group_id: tenants[0], id: memoryIds[1] });
  assert(forbiddenGet.error, "Foreign-workspace memory_get must not succeed");
  assert.equal(forbiddenGet.data.error, `Memory not found: ${memoryIds[1]}`);
  const deniedScope = await call(3, "memory_search", { group_id: tenants[0], query: "packaging" });
  assert(deniedScope.error); assert.equal(deniedScope.data.error.code, "SCOPE_INSUFFICIENT");
  const hijack = await rpc(tokens[2], "tools/list", {}, sessions[0]);
  assert.equal(hijack.status, 401); assert.equal(hijack.body.error.code, "PRINCIPAL_MISSING");
  console.log("PASS: tenant forgery, workspace override, foreign get, missing scope and same-agent session hijack refused");
  await owner.query("UPDATE mcp_tokens SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL", [tokens[0].id]);
  const revoked = await rpc(tokens[0], "tools/list", {}, sessions[0]);
  assert.equal(revoked.status, 401); assert.equal(revoked.body.error.code, "AUTH_REVOKED");
  const expired = await rpc(tokens[4], "initialize", {});
  assert.equal(expired.status, 401); assert.equal(expired.body.error.code, "AUTH_EXPIRED");
  console.log("PASS: revoked existing session and expired credential denied at HTTP boundary with cache TTL0");
  console.log("LIMIT: synthetic read/auth packaging test, not promotion, document ACL, corporate SSO, full least-privilege, upgrade, load or complete install proof");
} finally {
  if (child) {
    if (child.exitCode === null) child.kill("SIGTERM");
    const killTimer = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 5000);
    try { await child.exited; await Promise.all(drained); } finally { clearTimeout(killTimer); }
  }
  await owner.end();
}
