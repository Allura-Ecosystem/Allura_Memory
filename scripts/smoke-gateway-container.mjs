// Host driver: only a new, network-isolated disposable container is touched.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const image = process.argv[2];
assert(image && process.argv.length === 3, "Usage: node scripts/smoke-gateway-container.mjs <candidate-image-id>");
assert(/^sha256:[a-f0-9]{64}$/.test(image), "Use the inspected immutable candidate image ID");

const testCode = String.raw`
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
assert.notEqual(process.getuid(), 0, "runtime must be non-root");
for (const path of ["/app/src", "/app/packages", "/app/.env", "/app/.env.local", "/app/node_modules/react", "/app/node_modules/next"]) assert(!existsSync(path), path + " must not ship");
const url = "http://127.0.0.1:3201";
const pause = ms => new Promise(r => setTimeout(r, ms));
const bounded = async (promise, ms) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer=setTimeout(() => reject(new Error("test deadline exceeded")), ms); })]); }
  finally { clearTimeout(timer); }
};
async function request(path, options = {}) {
  return await fetch(url + path, { ...options, headers: { Connection: "close", ...options.headers }, signal: AbortSignal.timeout(6000) });
}
function rpcBody(text, contentType, id) {
  if (contentType.includes("application/json")) return JSON.parse(text);
  assert(contentType.includes("text/event-stream"));
  const items = text.split(/\r?\n\r?\n/).flatMap(event => {
    const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    return data ? [JSON.parse(data)] : [];
  });
  const message = items.find(item => item.id === id);
  assert(message, "missing JSON-RPC response");
  return message;
}
async function exercise(mode) {
  const env = { NODE_ENV: "production", ALLURA_MCP_HTTP_PORT: "3201", NO_COLOR: "1" };
  if (mode === "mcp_token") env.ALLURA_MCP_TOKEN_SECRET = "isolated-fixture-secret-not-a-real-credential";
  else env.ALLURA_MCP_AUTH_TOKEN = "isolated-fixture-legacy-compat-only";
  const child = Bun.spawn([process.execPath, "--no-install", "--no-env-file", "gateway.mjs"], { cwd: "/app", env, stdout: "pipe", stderr: "pipe" });
  const output = new Response(child.stdout).text();
  const errors = new Response(child.stderr).text();
  try {
    let live = false;
    for (let attempt=0;attempt<50;attempt++) {
      if (child.exitCode !== null) throw new Error("gateway exited before liveness");
      try { const response = await request("/live"); live = response.ok && (await response.json()).alive === true; } catch {}
      if (live) break;
      await pause(100);
    }
    assert(live, "gateway must become live");
    const health = await (await request("/health")).json();
    assert.equal(health.auth_mode, mode);
    const ready = await request("/ready");
    assert.equal(ready.status, 503, "missing database must not be ready");
    assert.equal((await ready.json()).ready, false);
    for (const path of ["/mcp", "/metrics"]) {
      const response = await request(path);
      assert.equal(response.status, 401, path + " must reject missing bearer");
      await response.text();
    }
    if (mode === "shared_token") {
      const headers = { Authorization: "Bearer " + env.ALLURA_MCP_AUTH_TOKEN, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
      const init = await request("/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "isolated-container-smoke", version: "1" } } }) });
      assert.equal(init.status, 200);
      const session = init.headers.get("mcp-session-id");
      assert(session);
      assert(rpcBody(await init.text(), init.headers.get("content-type") || "", 1).result);
      headers["mcp-session-id"] = session;
      const notification = await request("/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
      assert.equal(notification.status, 202);
      await notification.text();
      const listing = await request("/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) });
      assert.equal(listing.status, 200);
      const tools = rpcBody(await listing.text(), listing.headers.get("content-type") || "", 2).result.tools;
      const names = tools.map(tool => tool.name);
      for (const expected of ["memory_add", "memory_search", "memory_get", "memory_list", "memory_delete"]) assert(names.includes(expected), expected + " missing");
      assert.equal(new Set(names).size, names.length);
      const close = await request("/mcp", { method: "DELETE", headers });
      assert.equal(close.status, 200);
      await close.text();
      console.log("PASS: legacy compatibility MCP handshake and unique tool discovery (" + names.length + " tools); no memory operations");
    }
    child.kill("SIGTERM");
    assert.equal(await bounded(child.exited, 5000), 0, "graceful SIGTERM");
    console.log("PASS: " + mode + " live, DB-unready, missing-bearer denied, graceful shutdown");
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await bounded(child.exited, 5000);
    await Promise.all([output, errors]);
  }
}
await exercise("mcp_token");
await exercise("shared_token");
console.log("PASS: non-root read-only isolated container smoke; no database, tenant isolation, revocation or full tool parity claim");
`;

const runId = randomUUID();
const name = `allura-sep-smoke-${runId}`;
const pid1Name = `${name}-pid1`;
try {
  const result = spawnSync("docker", ["run", "--name", name, "--rm", "--network", "none", "--read-only", "--cap-drop=ALL", "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "256m", "--cpus", "1", "--label", `allura.smoke-run=${runId}`, "--entrypoint", "bun", image, "--no-install", "--no-env-file", "--eval", testCode], { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  assert.ifError(result.error);
  assert.equal(result.status, 0, "container smoke failed");

  // Exercise the actual image CMD/entrypoint, not only a child of the harness.
  const start = spawnSync("docker", ["run", "--detach", "--name", pid1Name, "--network", "none", "--read-only", "--cap-drop=ALL", "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "256m", "--cpus", "1", "--label", `allura.smoke-run=${runId}`, "--env", "ALLURA_MCP_TOKEN_SECRET=isolated-pid1-fixture-not-a-real-secret", image], { encoding: "utf8", timeout: 10000 });
  assert.ifError(start.error);
  assert.equal(start.status, 0, start.stderr);
  let live = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const probe = spawnSync("docker", ["exec", pid1Name, "bun", "--no-install", "--eval", 'const r=await fetch("http://127.0.0.1:3201/live",{signal:AbortSignal.timeout(1000)});if(!r.ok||(await r.json()).alive!==true)process.exit(1);'], { encoding: "utf8", timeout: 3000 });
    if (probe.status === 0) { live = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  assert(live, "actual image command must become live");
  const stop = spawnSync("docker", ["stop", "--time", "5", pid1Name], { encoding: "utf8", timeout: 10000 });
  assert.ifError(stop.error);
  assert.equal(stop.status, 0, stop.stderr);
  const stopped = spawnSync("docker", ["inspect", "--format", "{{.State.ExitCode}}", pid1Name], { encoding: "utf8", timeout: 5000 });
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(stopped.stdout.trim(), "0", "actual PID1 must exit gracefully, not be killed");
  console.log("PASS: actual image CMD liveness and Docker stop exit0");
} finally {
  // Docker CLI timeout does not guarantee container termination. Only remove
  // this invocation's exact, label-verified disposable container if it remains.
  const cleanupErrors = [];
  for (const ownedName of [name, pid1Name]) {
    const inspect = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "allura.smoke-run"}}', ownedName], { encoding: "utf8", timeout: 5000 });
    if (inspect.status === 0) {
      if (inspect.stdout.trim() !== runId) { cleanupErrors.push(`Ownership mismatch; not removing ${ownedName}`); continue; }
      const cleanup = spawnSync("docker", ["rm", "--force", ownedName], { encoding: "utf8", timeout: 5000 });
      if (cleanup.status !== 0) cleanupErrors.push(`Could not remove owned test container ${ownedName}`);
    } else if (!/no such (object|container)/i.test(inspect.stderr ?? "")) {
      cleanupErrors.push(`Cannot verify test container cleanup: ${ownedName}`);
    }
  }
  assert.deepEqual(cleanupErrors, []);
}
