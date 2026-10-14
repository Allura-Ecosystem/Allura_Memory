// Disposable integration test only: never accepts a database URL or credentials.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

const [image, databaseImage] = process.argv.slice(2);
assert.equal(process.argv.length, 4, "Usage: node scripts/smoke-gateway-database.mjs <gateway-image-id> <pgvector-image-id>");
for (const id of [image, databaseImage]) assert(/^sha256:[a-f0-9]{64}$/.test(id), "Immutable local image IDs required");
const root = new URL("../", import.meta.url);
const migrations = readdirSync(new URL("docker/postgres-init/", root), { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith(".sql"))
  .map(entry => entry.name).sort().map(name => ({ name, sql: readFileSync(new URL(`docker/postgres-init/${name}`, root), "utf8") }));
assert(migrations.length > 0);
for (const { name, sql } of migrations) assert(!/^\s*\\/m.test(sql), `${name}: psql commands unsupported`);
const fixture = readFileSync(new URL("scripts/gateway-database-fixture.mjs", root), "utf8");
const runId = randomUUID();
const pgName = `allura-sep-db-${runId}`;
const testName = `allura-sep-db-test-${runId}`;
const password = randomBytes(32).toString("hex");
function docker(args, options = {}) {
  return spawnSync("docker", args, { encoding: "utf8", timeout: 10000, maxBuffer: 2 * 1024 * 1024, ...options });
}
function checked(result) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || "Docker command failed");
  return result.stdout;
}
try {
  checked(docker(["run", "--detach", "--pull=never", "--name", pgName,
    "--network", "none", "--memory", "768m", "--cpus", "1", "--pids-limit", "128",
    "--label", `allura.smoke-run=${runId}`, "--tmpfs", "/var/lib/postgresql/data:rw,size=512m",
    "--env", "POSTGRES_DB=memory", "--env", "POSTGRES_USER=sep_owner",
    "--env", "POSTGRES_PASSWORD", databaseImage], { env: { ...process.env, POSTGRES_PASSWORD: password } }));
  const config = JSON.parse(checked(docker(["inspect", pgName])))[0];
  console.log(JSON.stringify({ isolation: { network: config.HostConfig.NetworkMode, mounts: config.Mounts, tmpfs: config.HostConfig.Tmpfs } }));
  assert.equal(config.HostConfig.NetworkMode, "none");
  assert.equal(config.HostConfig.PortBindings && Object.keys(config.HostConfig.PortBindings).length || 0, 0);
  assert(config.Mounts.every(mount => mount.Type === "tmpfs"), "No persistent/bind mounts allowed");
  assert.equal(config.HostConfig.Tmpfs?.["/var/lib/postgresql/data"], "rw,size=512m");
  const result = docker(["run", "--interactive", "--pull=never", "--name", testName,
    "--network", `container:${pgName}`, "--read-only", "--cap-drop=ALL", "--security-opt", "no-new-privileges",
    "--memory", "384m", "--cpus", "1", "--pids-limit", "64", "--label", `allura.smoke-run=${runId}`,
    "--entrypoint", "bun", image, "--no-install", "--no-env-file", "--eval", fixture],
    { input: JSON.stringify({ password, migrations }), timeout: 120000 });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  checked(result);
  console.log(JSON.stringify({ image, databaseImage, migrationCount: migrations.length,
    migrationsSha256: createHash("sha256").update(JSON.stringify(migrations)).digest("hex"),
    fixtureSha256: createHash("sha256").update(fixture).digest("hex") }));
} finally {
  const errors = [];
  for (const name of [testName, pgName]) {
    const found = docker(["inspect", "--format", '{{index .Config.Labels "allura.smoke-run"}}', name]);
    if (found.status === 0) {
      if (found.stdout.trim() !== runId) { errors.push(`Ownership mismatch: ${name}`); continue; }
      if (docker(["rm", "--force", name]).status !== 0) { errors.push(`Cleanup failed: ${name}`); continue; }
      const remaining = docker(["inspect", name]);
      if (remaining.status === 0 || !/no such (object|container)/i.test(remaining.stderr ?? "")) errors.push(`Cleanup unverified: ${name}`);
    } else if (!/no such (object|container)/i.test(found.stderr ?? "")) errors.push(`Cannot inspect ${name}`);
  }
  assert.deepEqual(errors, []);
  console.log("CLEANUP: exact label-verified test containers removed; only disposable synthetic data discarded");
}
