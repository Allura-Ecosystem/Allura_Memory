import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = name => "${" + name + ":?Explicit installation input required}";
const health = (port, path) => ({
  test: ["CMD", "bun", "-e", "fetch('http://127.0.0.1:" + port + path + "').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
  interval: "3s", timeout: "8s", retries: 20, start_period: "10s",
});

/** Offline assembly only. No credential reads, package installation or Docker calls. */
export async function buildCoreInstall(destination, images) {
  assert(isAbsolute(destination), "Absolute new destination required");
  assert.deepEqual(Object.keys(images).sort(), ["gateway", "postgres", "web"]);
  for (const value of Object.values(images)) assert(/^sha256:[a-f0-9]{64}$/.test(value), "Immutable locally preloaded image IDs required");
  const entries = await readdir(resolve(root, "docker/postgres-init"), { withFileTypes: true });
  const migrations = [];
  for (const name of entries.filter(entry => entry.isFile() && entry.name.endsWith(".sql")).map(entry => entry.name).sort()) {
    const sql = await readFile(resolve(root, "docker/postgres-init", name), "utf8");
    migrations.push({ name, sql, sha256: createHash("sha256").update(sql).digest("hex") });
  }
  assert(migrations.length > 0);
  const database = { POSTGRES_HOST: "postgres", POSTGRES_PORT: "5432", POSTGRES_DB: "memory", POSTGRES_USER: "allura_owner", POSTGRES_PASSWORD: required("ALLURA_CORE_PG_PASSWORD"), POSTGRES_APP_USER: "allura_app", POSTGRES_APP_PASSWORD: required("ALLURA_CORE_APP_PASSWORD") };
  const runtime = { pull_policy: "never", read_only: true, cap_drop: ["ALL"], security_opt: ["no-new-privileges:true"], pids_limit: 128, mem_limit: "512m", cpus: 1, networks: ["core"] };
  const compose = {
    services: {
      postgres: {
        image: images.postgres, pull_policy: "never", networks: ["core"], mem_limit: "768m", cpus: 1, pids_limit: 128,
        environment: { POSTGRES_DB: "memory", POSTGRES_USER: "allura_owner", POSTGRES_PASSWORD: required("ALLURA_CORE_PG_PASSWORD") },
        volumes: ["data:/var/lib/postgresql/data"],
        healthcheck: { test: ["CMD", "pg_isready", "-h", "127.0.0.1", "-U", "allura_owner", "-d", "memory"], interval: "2s", timeout: "3s", retries: 30 },
      },
      migrate: {
        ...runtime, image: required("ALLURA_CORE_MIGRATION_IMAGE"), restart: "no", depends_on: { postgres: { condition: "service_healthy" } },
        environment: { ...database, POSTGRES_MIGRATION_PASSWORD: required("ALLURA_CORE_MIGRATION_PASSWORD") },
        command: ["bun", "--no-install", "--no-env-file", "core-migrate.mjs"],
      },
      gateway: {
        ...runtime, image: images.gateway,
        depends_on: { migrate: { condition: "service_completed_successfully" } },
        environment: { ...database, NODE_ENV: "production", GRAPH_BACKEND: "ruvector", ALLURA_MCP_HTTP_PORT: "6201", ALLURA_MCP_TOKEN_SECRET: required("ALLURA_CORE_TOKEN_SECRET"), ALLURA_MCP_AUTH_CACHE_TTL_MS: "0" },
        healthcheck: health(6201, "/ready"),
      },
      web: {
        ...runtime, image: images.web,
        depends_on: { gateway: { condition: "service_healthy" }, migrate: { condition: "service_completed_successfully" } },
        environment: { ...database, NODE_ENV: "production", PORT: "4200", HOSTNAME: "0.0.0.0", GRAPH_BACKEND: "ruvector", ALLURA_MCP_BASE_URL: "http://gateway:6201", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"), CLERK_SECRET_KEY: required("CLERK_SECRET_KEY") },
        healthcheck: health(4200, "/api/health/ready"),
      },
    },
    networks: { core: { internal: true } }, volumes: { data: {} },
  };
  await mkdir(destination);
  await mkdir(resolve(destination, "migrations"));
  const files = {
    "compose.json": JSON.stringify(compose, null, 2) + "\n",
    "migrate.mjs": await readFile(resolve(root, "deploy/core/migrate.mjs"), "utf8"),
    "Dockerfile.migrate": "ARG GATEWAY_IMAGE\nFROM ${GATEWAY_IMAGE}\nCOPY migrations /bundle/migrations\nCOPY migrate.mjs /app/core-migrate.mjs\nCMD [\"bun\",\"--no-install\",\"--no-env-file\",\"core-migrate.mjs\"]\n",
    "migrations/manifest.json": JSON.stringify(migrations.map(({ name, sha256 }) => ({ name, sha256 })), null, 2) + "\n",
    ...Object.fromEntries(migrations.map(({ name, sql }) => ["migrations/" + name, sql])),
  };
  for (const [name, data] of Object.entries(files)) await writeFile(resolve(destination, name), data, { flag: "wx", mode: 0o644 });
  const receipt = { version: 1, kind: "fresh-core-integration-candidate", images, migrationCount: migrations.length,
    files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, createHash("sha256").update(data).digest("hex")])),
    limitations: ["No first-owner provisioning", "No public ingress or Clerk egress", "Existing owner-backed runtime access retained", "No workers, upgrade or automatic partial-init retry", "Not complete SEP-02"] };
  await writeFile(resolve(destination, "bundle.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 6, "Usage: node scripts/build-core-install.mjs NEW_ABSOLUTE_DIRECTORY PG_IMAGE_ID GATEWAY_IMAGE_ID WEB_IMAGE_ID");
  console.log(JSON.stringify(await buildCoreInstall(process.argv[2], { postgres: process.argv[3], gateway: process.argv[4], web: process.argv[5] }), null, 2));
}
