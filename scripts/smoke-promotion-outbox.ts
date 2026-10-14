// No database URL accepted. All SQL runs against this test's fresh, network-none database.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [image, databaseImage] = process.argv.slice(2);
assert.equal(process.argv.length, 4, "Usage: bun --no-env-file scripts/smoke-promotion-outbox.ts <gateway-image-id> <pgvector-image-id>");
for (const id of [image, databaseImage]) assert(/^sha256:[a-f0-9]{64}$/.test(id), "Immutable local image IDs required");
const root = new URL("../", import.meta.url);
const migrations = readdirSync(new URL("docker/postgres-init/", root)).filter(name => name.endsWith(".sql")).sort()
  .map(name => ({ name, sql: readFileSync(new URL(`docker/postgres-init/${name}`, root), "utf8") }));
assert(migrations.length > 0);
const build = await Bun.build({ entrypoints: [fileURLToPath(new URL("scripts/promotion-outbox-fixture.ts", root))],
  target: "bun", format: "esm", external: ["pg"], env: "disable", tsconfig: fileURLToPath(new URL("tsconfig.json", root)) });
assert(build.success, String(build.logs)); assert.equal(build.outputs.length, 1);
const fixture = await build.outputs[0].text();
const run = randomUUID(), password = randomBytes(32).toString("hex");
const pgName = `allura-sep-outbox-db-${run}`, testName = `allura-sep-outbox-test-${run}`;
const acknowledged = new Set<string>();
function docker(args: string[], options = {}) {
  return spawnSync("docker", args, { encoding: "utf8", timeout: 10000, maxBuffer: 2 * 1024 * 1024, ...options });
}
function check(result: ReturnType<typeof docker>) {
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr || "Docker command failed"); return result.stdout;
}
try {
  check(docker(["run", "--detach", "--pull=never", "--name", pgName, "--network", "none", "--memory", "768m", "--cpus", "1", "--pids-limit", "128",
    "--label", `allura.smoke-run=${run}`, "--tmpfs", "/var/lib/postgresql/data:rw,size=512m", "--env", "POSTGRES_DB=memory", "--env", "POSTGRES_USER=sep_owner", "--env", "POSTGRES_PASSWORD", databaseImage],
    { env: { ...process.env, POSTGRES_PASSWORD: password } }));
  acknowledged.add(pgName);
  const config = JSON.parse(check(docker(["inspect", pgName])))[0];
  assert.equal(config.HostConfig.NetworkMode, "none");
  assert.equal(Object.keys(config.HostConfig.PortBindings || {}).length, 0);
  assert(config.Mounts.every((mount: { Type: string }) => mount.Type === "tmpfs"));
  const created = docker(["create", "--interactive", "--pull=never", "--name", testName, "--network", `container:${pgName}`, "--read-only", "--cap-drop=ALL", "--security-opt", "no-new-privileges",
    "--memory", "384m", "--cpus", "1", "--pids-limit", "64", "--label", `allura.smoke-run=${run}`, "--entrypoint", "bun", image, "--no-install", "--no-env-file", "--eval", fixture]);
  check(created); acknowledged.add(testName);
  const result = docker(["start", "--attach", "--interactive", testName], { input: JSON.stringify({ password, migrations }), timeout: 120000 });
  process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || ""); check(result);
  const state = JSON.parse(check(docker(["inspect", testName])))[0];
  assert.equal(state.State.ExitCode, 0); assert.equal(state.State.Running, false);
  console.log(JSON.stringify({ image, databaseImage, fixtureSha256: createHash("sha256").update(fixture).digest("hex"), migrationsSha256: createHash("sha256").update(JSON.stringify(migrations)).digest("hex") }));
} finally {
  const errors: string[] = [];
  for (const [name, expectedImage] of [[testName, image], [pgName, databaseImage]]) {
    const found = docker(["inspect", name]);
    if (found.status === 0) {
      const item = JSON.parse(found.stdout)[0];
      if (item.Config.Labels?.["allura.smoke-run"] !== run || item.Image !== expectedImage) { errors.push(`Ownership mismatch: ${name}`); continue; }
      if (docker(["rm", "--force", name]).status !== 0) { errors.push(`Cleanup failed: ${name}`); continue; }
      const remaining = docker(["inspect", name]);
      if (remaining.status === 0 || !/no such (object|container)/i.test(remaining.stderr || "")) errors.push(`Cleanup unverified: ${name}`);
    } else if (!acknowledged.has(name) || !/no such (object|container)/i.test(found.stderr || "")) {
      errors.push(`Creation/cleanup unverified: ${name}; label allura.smoke-run=${run}; image ${expectedImage}. Reinspect before claiming cleanup.`);
    }
  }
  assert.deepEqual(errors, []);
  console.log("CLEANUP: exact label/image-verified disposable containers removed; synthetic test data discarded");
}
