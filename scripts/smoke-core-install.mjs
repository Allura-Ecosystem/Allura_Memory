// Owns only a newly generated Compose project, network, volume and synthetic DB.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";
import { buildCoreInstall } from "./build-core-install.mjs";

const [postgres, gateway, web, mode] = process.argv.slice(2);
assert(process.argv.length === 5 || (process.argv.length === 6 && ["--function-only", "--schema-only"].includes(mode)), "Usage: node scripts/smoke-core-install.mjs PG_IMAGE_ID GATEWAY_IMAGE_ID WEB_IMAGE_ID [--function-only|--schema-only]");
const negativeGuard = Boolean(mode);
const images = { postgres, gateway, web };
for (const value of Object.values(images)) assert(/^sha256:[a-f0-9]{64}$/.test(value));
const project = "allura-core-" + randomUUID().replaceAll("-", "");
const temp = await mkdtemp(join(tmpdir(), "allura-core-install-"));
const original = join(temp, "build");
const relocated = join(temp, "relocated");
const settings = parse(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
assert(settings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"), "Only existing development Clerk selected");
assert(settings.CLERK_SECRET_KEY?.startsWith("sk_test_"), "Only existing development Clerk selected");
const env = { PATH: process.env.PATH, HOME: process.env.HOME,
  ALLURA_CORE_PG_PASSWORD: randomBytes(32).toString("hex"), ALLURA_CORE_APP_PASSWORD: randomBytes(32).toString("hex"),
  ALLURA_CORE_MIGRATION_PASSWORD: randomBytes(32).toString("hex"), ALLURA_CORE_TOKEN_SECRET: randomBytes(32).toString("hex"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: settings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY: settings.CLERK_SECRET_KEY };
const probeName = project + "-probe";
const network = project + "_core";
const volume = project + "_data";
const baseTag = project + ":base";
const migrationTag = project + ":migrations";
let migrationImage;
let indeterminate = false;
let receipt;
function docker(args, options = {}) {
  const result = spawnSync("docker", args, { env, encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024, ...options });
  if ((result.error || result.signal) && (["run", "build", "tag", "start", "restart"].includes(args[0]) || args[0] === "compose")) indeterminate = true;
  return result;
}
function checked(result, operation) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, operation + " failed (raw output suppressed to protect runtime credentials)");
  return result.stdout;
}
const compose = (...args) => docker(["compose", "--project-name", project, "--project-directory", relocated, "--env-file", "/dev/null", "-f", join(relocated, "compose.json"), ...args], { timeout: 180000 });
function inspect(name) { return JSON.parse(checked(docker(["inspect", name]), "inspect"))[0]; }
function validateContainer(config) {
  assert.equal(config.Config.Labels?.["com.docker.compose.project"], project);
  const service = config.Config.Labels["com.docker.compose.service"];
  assert(["postgres", "migrate", "gateway", "web"].includes(service));
  assert.equal(config.Image, service === "migrate" ? migrationImage : images[service]);
  assert.equal(Object.keys(config.HostConfig.PortBindings ?? {}).length, 0);
  assert.deepEqual(Object.keys(config.NetworkSettings.Networks), [network]);
  for (const mount of config.Mounts) {
    if (service === "postgres") { assert.equal(mount.Type, "volume"); assert.equal(mount.Name, volume); }
    else assert.fail("Unexpected runtime mount");
  }
  if (service !== "postgres") { assert.equal(config.Config.User, "bun"); assert.equal(config.HostConfig.ReadonlyRootfs, true); }
}
async function probe(sourceOverride) {
  const source = sourceOverride ?? await readFile(new URL("./core-install-probe.mjs", import.meta.url), "utf8");
  const result = docker(["run", "--rm", "--pull=never", "--name", probeName, "--label", "allura.core-probe=" + project,
    "--network", network, "--read-only", "--cap-drop=ALL", "--security-opt", "no-new-privileges",
    "--memory", "256m", "--cpus", "1", "--pids-limit", "64",
    "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_APP_PASSWORD", "--entrypoint", "bun", migrationImage,
    "--no-install", "--no-env-file", "--eval", source],
    { env: { ...env, POSTGRES_PASSWORD: env.ALLURA_CORE_PG_PASSWORD, POSTGRES_APP_PASSWORD: env.ALLURA_CORE_APP_PASSWORD }, timeout: 60000 });
  if (result.status !== 0) console.log("Probe failure: " + (result.stderr ?? "").replaceAll(env.ALLURA_CORE_PG_PASSWORD, "[redacted]").replaceAll(env.ALLURA_CORE_APP_PASSWORD, "[redacted]").slice(-2500));
  console.log(checked(result, "Integration probe").trim());
}
try {
  for (const image of Object.values(images)) assert.equal(inspect(image).Id, image);
  assert.equal(checked(docker(["ps", "-aq", "--filter", "label=com.docker.compose.project=" + project]), "collision check").trim(), "");
  for (const [kind, name] of [["network", network], ["volume", volume]]) {
    const found = docker([kind, "inspect", name]);
    assert.notEqual(found.status, 0, "Resource collision");
    assert(/no such|not found/i.test(found.stderr), "Uncertain resource absence");
  }
  receipt = await buildCoreInstall(original, images);
  await rename(original, relocated);
  checked(docker(["tag", gateway, baseTag]), "unique base alias");
  assert.equal(inspect(baseTag).Id, gateway);
  checked(docker(["build", "--network=none", "--pull=false", "--build-arg", "GATEWAY_IMAGE=" + baseTag, "-f", join(relocated, "Dockerfile.migrate"), "-t", migrationTag, relocated], { timeout: 120000 }), "migration image build");
  migrationImage = inspect(migrationTag).Id;
  assert(/^sha256:[a-f0-9]{64}$/.test(migrationImage));
  env.ALLURA_CORE_MIGRATION_IMAGE = migrationImage;
  const missingEnv = compose("config", "--quiet");
  checked(missingEnv, "Configured Compose validation");
  const noInputs = docker(["compose", "--project-name", project, "--env-file", "/dev/null", "-f", join(relocated, "compose.json"), "config", "--quiet"], { env: { PATH: env.PATH, HOME: env.HOME } });
  assert.notEqual(noInputs.status, 0, "Missing credentials must refuse");
  if (negativeGuard) {
    checked(compose("up", "--detach", "--wait", "--wait-timeout", "60", "postgres"), "Fresh PostgreSQL for negative guard");
    const sql = mode === "--schema-only" ? "CREATE SCHEMA pgx" : "CREATE FUNCTION public.preexisting_guard_probe() RETURNS int LANGUAGE SQL AS 'SELECT 1'";
    await probe(`import pg from "pg";const c=new pg.Client({host:"postgres",database:"memory",user:"allura_owner",password:process.env.POSTGRES_PASSWORD});await c.connect();try{await c.query(${JSON.stringify(sql)});console.log("Created synthetic non-table precondition");}finally{await c.end();}`);
  }
  const started = compose("up", "--detach", "--wait", "--wait-timeout", "120");
  if (started.status !== 0 && !negativeGuard) {
    let diagnostic = started.stderr ?? "";
    for (const [key, value] of Object.entries(env)) if (!["PATH", "HOME"].includes(key)) diagnostic = diagnostic.replaceAll(value, "[redacted]");
    console.log(diagnostic.slice(-3500));
    const migrationLog = docker(["logs", project + "-migrate-1"]);
    let safeLog = (migrationLog.stdout ?? "") + (migrationLog.stderr ?? "");
    for (const [key, value] of Object.entries(env)) if (!["PATH", "HOME"].includes(key)) safeLog = safeLog.replaceAll(value, "[redacted]");
    console.log(safeLog.slice(-3500));
  }
  if (negativeGuard) {
    assert.equal(started.status, 1, "Function-only database must fail the migration gate");
    assert.equal(inspect(project + "-migrate-1").State.ExitCode, 1);
    for (const service of ["gateway", "web"]) assert.equal(inspect(project + "-" + service + "-1").State.Running, false);
    const preserved = mode === "--schema-only" ? "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname='pgx'" : "SELECT public.preexisting_guard_probe() AS n";
    await probe(`import assert from "node:assert/strict";import pg from "pg";const c=new pg.Client({host:"postgres",database:"memory",user:"allura_owner",password:process.env.POSTGRES_PASSWORD});await c.connect();try{assert.equal((await c.query(${JSON.stringify(preserved)})).rows[0].n,1);assert.equal((await c.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);assert.equal((await c.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('allura_app','allura_migration','allura_breakglass')")).rows[0].n,0);console.log("PASS: non-table preexisting state refused before role/schema mutation; original object preserved and app services not started");}finally{await c.end();}`);
  } else {
  checked(started, "Fresh Compose startup");
  for (const id of checked(compose("ps", "--all", "--quiet"), "list candidate containers").trim().split("\n")) validateContainer(inspect(id));
  const initialized = inspect(project + "-migrate-1");
  assert.equal(initialized.State.ExitCode, 0); assert.equal(initialized.State.Status, "exited");
  const initialization = JSON.parse(checked(docker(["logs", initialized.Id]), "migration receipt").trim());
  assert.equal(initialization.migrationCount, receipt.migrationCount);
  assert.equal(initialization.companyTenants, 0);
  console.log(JSON.stringify({ project, images, migrationImage, migrationCount: receipt.migrationCount, migrationManifestSha256: receipt.files["migrations/manifest.json"], initialized: true, portsPublished: 0 }));
  await probe();
  checked(compose("restart", "postgres", "gateway", "web"), "Restart exact core services");
  // Restart does not rerun the fresh-only migration job.
  for (let attempt = 0; ; attempt++) {
    const states = ["postgres", "gateway", "web"].map(service => inspect(project + "-" + service + "-1").State.Health?.Status);
    if (states.every(state => state === "healthy")) break;
    assert(attempt < 60, "Restart health timeout");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(inspect(project + "-migrate-1").State.FinishedAt, initialized.State.FinishedAt);
  await probe();
  console.log("PASS: relocated core startup and restart preserve initialized volume; migration job not rerun");
  // No mutation is permitted on initialized DB by a fresh-only rerun.
  const retry = compose("run", "--rm", "--no-deps", "migrate");
  assert.equal(retry.status, 1, "Existing schema must be refused");
  await probe();
  console.log("PASS: initializer refused existing schema; post-refusal state and readiness unchanged");
  checked(compose("stop", "gateway"), "Stop owned gateway for dependency fault");
  await probe(`import assert from "node:assert/strict";const r=await fetch("http://web:4200/api/health/ready",{signal:AbortSignal.timeout(12000)});assert.equal(r.status,503);const b=await r.json();assert.equal(b.ready,false);assert.equal(b.checks.mcp.healthy,false);console.log("PASS: web reports unready while gateway dependency is stopped");`);
  const stoppedGateway = inspect(project + "-gateway-1");
  validateContainer(stoppedGateway);
  checked(docker(["start", stoppedGateway.Id]), "Restart exact owned gateway without dependency startup");
  for (let attempt = 0; ; attempt++) {
    if (inspect(project + "-gateway-1").State.Health?.Status === "healthy") break;
    assert(attempt < 30); await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await probe();
  assert.equal(inspect(project + "-migrate-1").State.FinishedAt, initialized.State.FinishedAt);
  }
} finally {
  // Emit before any fallible inspection/cleanup so interrupted runs are reconcilable.
  console.log(JSON.stringify({ cleanup: indeterminate ? "unverified-after-indeterminate-command" : "attempting-owned-cleanup", project, network, volume, probeName, baseTag, migrationTag, images, migrationImage, retainedBundle: relocated }));
  const ids = checked(docker(["ps", "-aq", "--filter", "label=com.docker.compose.project=" + project]), "cleanup inventory").trim().split("\n").filter(Boolean);
  const probe = docker(["inspect", probeName]);
  if (probe.status === 0) {
    const config = JSON.parse(probe.stdout)[0]; assert.equal(config.Config.Labels["allura.core-probe"], project); assert.equal(config.Image, migrationImage);
    checked(docker(["rm", "--force", config.Id]), "owned probe cleanup");
  } else assert(/no such/i.test(probe.stderr));
  for (const id of ids) { validateContainer(inspect(id)); checked(docker(["rm", "--force", id]), "owned container cleanup"); }
  for (const [kind, name] of [["network", network], ["volume", volume]]) {
    const found = docker([kind, "inspect", name]);
    if (found.status === 0) {
      const config = JSON.parse(found.stdout)[0]; assert.equal(config.Labels["com.docker.compose.project"], project);
      if (kind === "network") assert.equal(Object.keys(config.Containers ?? {}).length, 0);
      checked(docker([kind, "rm", name]), "owned " + kind + " cleanup");
      const remaining = docker([kind, "inspect", name]); assert.notEqual(remaining.status, 0); assert(/no such|not found/i.test(remaining.stderr));
    } else assert(/no such|not found/i.test(found.stderr));
  }
  assert.equal(checked(docker(["ps", "-aq", "--filter", "label=com.docker.compose.project=" + project]), "final cleanup inventory").trim(), "");
  if (indeterminate) {
    console.log(JSON.stringify({ cleanup: "unverified-after-indeterminate-command", project, network, volume, probeName, baseTag, migrationTag, retainedBundle: relocated }));
    process.exitCode = 1;
  } else {
    // Remove only the two unique aliases created by this test; base image remains.
    for (const [tag, expected] of [[migrationTag, migrationImage], [baseTag, gateway]]) {
      const found = docker(["image", "inspect", tag]);
      if (found.status === 0) { assert.equal(JSON.parse(found.stdout)[0].Id, expected); checked(docker(["image", "rm", tag]), "test image alias cleanup"); }
      else assert(/no such/i.test(found.stderr));
    }
    await rm(temp, { recursive: true });
    console.log("CLEANUP: exact project-owned containers, empty network, synthetic database volume, test image aliases and generated temporary bundle removed");
  }
}
