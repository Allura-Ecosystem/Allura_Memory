// Keyless production proof against one new, network-isolated disposable image.
// No host ports/mounts, database credentials, provider credentials or live data.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const image = process.argv[2];
assert(process.argv.length === 3 && /^sha256:[a-f0-9]{64}$/.test(image ?? ""),
  "Usage: node scripts/smoke-web-container.mjs <immutable-web-image-id>");
const runId = randomUUID();
const name = `allura-web-smoke-${runId}`;
const startedAt = new Date().toISOString();
let creationAcknowledged = false;
const docker = (args, timeout = 10000) => spawnSync("docker", args,
  { encoding: "utf8", timeout, maxBuffer: 2 * 1024 * 1024 });
function checked(result, message) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, message + ": " + (result.stderr ?? ""));
  return result.stdout;
}

const fixture = String.raw`
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
assert.notEqual(process.getuid(), 0);
assert.equal(process.env.NODE_ENV, "production");
for (const key of ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "POSTGRES_PASSWORD", "DATABASE_URL"])
  assert(!process.env[key], key + " must be absent in keyless smoke");
for (const path of [".env", ".env.local", ".opencode", ".claude", ".codex", ".agents"])
  assert(!existsSync("/app/" + path), path + " must not ship");
const base = "http://127.0.0.1:3100";
const request = (path, options = {}) => fetch(base + path, { ...options, redirect: "manual", signal: AbortSignal.timeout(10000) });
let live = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try { const r = await request("/api/live"); live = r.status === 200 && (await r.json()).alive === true; } catch {}
  if (live) break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
assert(live, "image CMD must become live");
const liveResponse = await request("/api/live");
assert.equal(liveResponse.headers.get("x-content-type-options"), "nosniff");
assert.equal(liveResponse.headers.get("x-frame-options"), "DENY");
await liveResponse.text();
const ready = await request("/api/ready");
assert.equal(ready.status, 503);
const health = await ready.json();
assert.equal(health.ready, false);
assert.equal(health.checks.postgres.healthy, false);
assert.equal(health.checks.mcp.healthy, false);
console.log("PASS: actual CMD live with security headers; missing PG/gateway remain unready");

const spoof = { "x-allura-user-id": "fixture-user", "x-allura-role": "admin", "x-allura-group-id": "allura-fixture", "x-allura-workspace-id": "fixture-workspace", "x-allura-session-id": "fixture-session" };
for (const headers of [{}, spoof]) {
  for (const path of ["/api/agents", "/api/memory/graph", "/api/tokens", "/api/brain/search", "/api/memory/report.json"]) {
    const response = await request(path, { headers });
    assert.equal(response.status, 401, path + " unauthenticated denial");
    assert.equal((await response.json()).error, "Authentication required");
  }
  const write = await request("/api/curator/approve", { method: "POST", headers });
  assert.equal(write.status, 401, "mutation denied before handler");
  await write.text();
  const dashboard = await request("/dashboard", { headers });
  assert.equal(dashboard.status, 307);
  const location = new URL(dashboard.headers.get("location"), base);
  assert.equal(location.origin, base);
  assert.equal(location.pathname, "/auth/v2/login");
  assert.equal(location.searchParams.get("redirect_url"), "/dashboard");
  await dashboard.text();
}
const login = await request("/auth/v2/login");
assert.equal(login.status, 200);
assert.equal(login.headers.get("location"), null);
const markup = await login.text();
assert(markup.includes("Authentication unavailable"));
assert(!markup.includes("Development authentication is active"));
console.log("PASS: protected APIs/mutation/dashboard denied with absent and spoofed authority; keyless login degrades without redirect loop; dev-auth flags do not bypass production");

const staticPaths = readdirSync("/app/.next/static", { recursive: true }).filter(path => typeof path === "string");
const assets = [
  ["/brand/allura-wordmark-runtime.png", "/app/public/brand/allura-wordmark-runtime.png"],
  ...[".css", ".js"].map(ext => {
    const path = staticPaths.find(path => path.endsWith(ext));
    assert(path, "missing built " + ext + " asset");
    return ["/_next/static/" + path, "/app/.next/static/" + path];
  }),
];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
for (const [url, file] of assets) {
  const response = await request(url);
  assert.equal(response.status, 200, url);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(readFileSync(file)), url + " exact asset bytes");
}
console.log("PASS: public brand image and traced JS/CSS serve exact file bytes");
`;

try {
  const creation = docker(["run", "--pull=never", "--detach", "--name", name, "--network", "none", "--read-only",
    "--cap-drop=ALL", "--security-opt", "no-new-privileges", "--pids-limit", "128",
    "--memory", "512m", "--cpus", "1", "--label", `allura.web-smoke=${runId}`,
    "--env", "DEBUG=next:start-server",
    "--env", "ALLURA_DEV_AUTH_ENABLED=true", "--env", "ALLURA_DEMO_DEV_AUTH_FORCE=true", image], 30000);
  creationAcknowledged = creation.status === 0 && !creation.error;
  checked(creation, "start disposable web image");
  const state = JSON.parse(checked(docker(["inspect", name]), "inspect test isolation"))[0];
  assert.equal(state.Image, image);
  assert.equal(state.HostConfig.NetworkMode, "none");
  assert.equal(state.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(state.Mounts, []);
  assert.deepEqual(state.HostConfig.PortBindings ?? {}, {});
  assert.equal(state.Config.User, "bun");
  const result = docker(["exec", name, "bun", "--no-install", "--no-env-file", "--eval", fixture], 90000);
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  checked(result, "web fixture");
  checked(docker(["stop", "--time", "5", name]), "stop test server");
  const stopped = JSON.parse(checked(docker(["inspect", name]), "inspect shutdown"))[0];
  assert.equal(stopped.State.Running, false);
  // Locked Next16.2.1 explicitly exits143 after its SIGTERM cleanup, not0.
  // Require the completion marker too: exit143 alone could be raw termination.
  assert.equal(stopped.State.ExitCode, 143, "expected Next SIGTERM exit, not SIGKILL");
  assert.equal(stopped.State.OOMKilled, false);
  const shutdownLogs = docker(["logs", name], 5000);
  checked(shutdownLogs, "read fixture shutdown evidence");
  assert(((shutdownLogs.stdout ?? "") + (shutdownLogs.stderr ?? "")).includes("start-server process cleanup finished"), "Next cleanup completion must be observed");
  console.log("PASS: non-root network-none/read-only image CMD and graceful Docker stop; no configured auth, database or full-install claim");
} catch (error) {
  // Diagnose only this labelled, keyless fixture; never inspect another service.
  const owned = docker(["inspect", "--format", '{{index .Config.Labels "allura.web-smoke"}}', name], 5000);
  if (owned.status === 0 && owned.stdout.trim() === runId) {
    const state = docker(["inspect", "--format", "{{json .State}}", name], 5000);
    process.stderr.write("Fixture state: " + (state.stdout ?? "unavailable") + "\n");
    const logs = docker(["logs", "--tail", "25", name], 5000);
    process.stderr.write((logs.stdout ?? "") + (logs.stderr ?? ""));
  }
  throw error;
} finally {
  // Killing the CLI cannot cancel a daemon request already in flight. Even an
  // absent container may appear later; keep this failed attempt unresolved.
  if (!creationAcknowledged) process.stderr.write(
    `RECONCILE: creation outcome unknown; cleanup attempted, not verified. name=${name} label=allura.web-smoke=${runId} image=${image} startedAt=${startedAt}\n`);
  const inspect = docker(["inspect", "--format", '{{index .Config.Labels "allura.web-smoke"}}', name], 5000);
  if (inspect.status === 0) {
    assert.equal(inspect.stdout.trim(), runId, "ownership mismatch; refusing cleanup");
    checked(docker(["rm", "--force", name], 5000), "remove exact disposable container");
  } else {
    assert(/no such (object|container)/i.test(inspect.stderr ?? ""), "cannot verify cleanup ownership");
  }
  const absent = docker(["inspect", name], 5000);
  assert(absent.status !== 0 && /no such (object|container)/i.test(absent.stderr ?? ""), "test container remains or Docker unavailable");
  if (creationAcknowledged) console.log("PASS: exact label-verified disposable container cleanup");
}
