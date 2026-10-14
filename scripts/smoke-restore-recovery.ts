// Owner-approved exception: docker exec only against this run's fresh disposable
// synthetic recovery databases. Never accepts an existing container or database URL.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const image = process.argv[2];
assert(process.argv.length === 3 && /^sha256:[a-f0-9]{64}$/.test(image || ""), "Usage: bun --no-env-file scripts/smoke-restore-recovery.ts <immutable-local-pgvector-image-id>");
const root = new URL("../", import.meta.url);
const names = (await readdir(new URL("docker/postgres-init/", root))).filter(name => name.endsWith(".sql")).sort();
const migrations = await Promise.all(names.map(async name => ({ name, sql: await readFile(new URL(`docker/postgres-init/${name}`, root), "utf8") })));
const built = await Bun.build({ entrypoints: [fileURLToPath(new URL("scripts/restore-recovery-fixture.ts", root))], target: "bun", format: "esm", env: "disable",
  plugins: [{ name: "isolated-audit-sink", setup(build) {
    build.onResolve({ filter: /postgres\/queries\/insert-trace$/ }, () => ({ path: "audit-sink", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents:
      "export async function insertEvent(event) { globalThis.__restoreAudit.push(event); return { id: globalThis.__restoreAudit.length }; }" }));
  } }], tsconfig: fileURLToPath(new URL("tsconfig.json", root)) });
assert(built.success, String(built.logs)); assert.equal(built.outputs.length, 1);
const fixture = await built.outputs[0].text();
const run = randomUUID(), password = randomBytes(32).toString("hex");
const source = `allura-sep-restore-source-${run}`, target = `allura-sep-restore-target-${run}`;
const scratch = await mkdtemp(join(tmpdir(), "allura-recovery-test-"));
const acknowledged = new Set<string>();
const docker = (args: string[], env = process.env) => spawnSync("docker", args, { env, encoding: "utf8", timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
try {
  for (const name of [source, target]) {
    const result = docker(["run", "--detach", "--pull=never", "--name", name, "--network", "none", "--memory", "768m", "--cpus", "1", "--pids-limit", "128",
      "--label", `allura.restore-test=${run}`, "--tmpfs", "/var/lib/postgresql/data:rw,size=512m", "--env", "POSTGRES_DB=memory", "--env", "POSTGRES_USER=sep_owner", "--env", "POSTGRES_PASSWORD", image],
      { ...process.env, POSTGRES_PASSWORD: password });
    assert.ifError(result.error); assert.equal(result.status, 0, "Disposable database creation failed"); acknowledged.add(name);
  }
  const result = spawnSync(process.execPath, ["--no-install", "--no-env-file", "--eval", fixture], {
    cwd: scratch, env: { PATH: process.env.PATH, TMPDIR: scratch, NODE_ENV: "test" }, input: JSON.stringify({ source, target, run, image, migrations }),
    encoding: "utf8", timeout: 180000, maxBuffer: 4 * 1024 * 1024,
  });
  process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || "");
  assert.ifError(result.error); assert.equal(result.status, 0, "Disposable recovery fixture failed");
  console.log(JSON.stringify({ image, fixtureSha256: createHash("sha256").update(fixture).digest("hex"), migrationsSha256: createHash("sha256").update(JSON.stringify(migrations)).digest("hex") }));
} finally {
  const errors: string[] = [];
  for (const name of [target, source]) {
    const found = docker(["inspect", name]);
    if (found.status === 0) {
      const item = JSON.parse(found.stdout)[0];
      if (item.Config.Labels?.["allura.restore-test"] !== run || item.Image !== image) { errors.push(`Ownership mismatch: ${name}`); continue; }
      if (docker(["rm", "--force", name]).status !== 0) { errors.push(`Cleanup failed: ${name}`); continue; }
      const remaining = docker(["inspect", name]);
      if (remaining.status === 0 || !/no such (object|container)/i.test(remaining.stderr || "")) errors.push(`Cleanup unverified: ${name}`);
    } else if (!acknowledged.has(name) || !/no such (object|container)/i.test(found.stderr || "")) errors.push(`Creation/cleanup unverified: ${name}; label allura.restore-test=${run}`);
  }
  await rm(scratch, { recursive: true, force: true });
  assert.deepEqual(errors, []);
  console.log("CLEANUP: exact label/image-verified test containers and private test directory removed; only disposable synthetic data discarded");
}
