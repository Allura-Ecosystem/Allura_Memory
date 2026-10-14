import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { buildCoreInstall } from "./build-core-install.mjs";

const images = Object.fromEntries(["postgres", "gateway", "web"].map((key, i) => [key, "sha256:" + String(i).repeat(64)]));
test("relocatable core bundle pins images, migration gate, private resources and required credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "allura-core-unit-"));
  try {
    const output = join(root, "bundle");
    const receipt = await buildCoreInstall(output, images);
    const config = JSON.parse(await readFile(join(output, "compose.json"), "utf8"));
    assert.equal(config.services.gateway.depends_on.migrate.condition, "service_completed_successfully");
    assert.equal(config.services.web.depends_on.migrate.condition, "service_completed_successfully");
    assert.equal(config.networks.core.internal, true);
    assert.deepEqual(config.volumes.data, {});
    assert(receipt.migrationCount >= 71);
    for (const [key, service] of Object.entries(config.services)) {
      assert.equal(service.pull_policy, "never");
      assert.equal(service.image, key === "migrate" ? "${ALLURA_CORE_MIGRATION_IMAGE:?Explicit installation input required}" : images[key]);
      assert.equal(service.ports, undefined);
      assert.equal(service.container_name, undefined);
      assert.equal(service.environment.ALLURA_DEV_AUTH, undefined);
      assert.equal(service.environment.POSTGRES_PASSWORD, "${ALLURA_CORE_PG_PASSWORD:?Explicit installation input required}");
    }
    assert.equal(config.services.gateway.environment.POSTGRES_MIGRATION_PASSWORD, undefined);
    assert.equal(config.services.web.environment.ALLURA_MCP_TOKEN_SECRET, undefined);
    assert.equal(config.services.migrate.restart, "no");
    assert(!JSON.stringify(config).includes("/mnt/"));
    assert(!JSON.stringify(config).includes("change-me"));
    for (const [file, hash] of Object.entries(receipt.files)) {
      assert.equal(createHash("sha256").update(await readFile(join(output, file))).digest("hex"), hash);
    }
    await assert.rejects(buildCoreInstall(output, images), /EEXIST/);
    await symlink(output, join(root, "link"));
    await assert.rejects(buildCoreInstall(join(root, "link"), images), /EEXIST/);
  } finally { await rm(root, { recursive: true }); }
});
test("refuses relative output and mutable image references", async () => {
  await assert.rejects(buildCoreInstall("relative", images), /Absolute/);
  await assert.rejects(buildCoreInstall("/tmp/unused-allura-test-path", { ...images, web: "web:latest" }), /Immutable/);
});
test("fresh seed switch is opt-in; historical role attributes are preserved in initializer", async () => {
  const sql = await readFile(new URL("../docker/postgres-init/33-tenant-registry.sql", import.meta.url), "utf8");
  assert(sql.includes("current_setting('allura.fresh_company_install', true) IS DISTINCT FROM 'on'"));
  const init = await readFile(new URL("../deploy/core/migrate.mjs", import.meta.url), "utf8");
  assert(init.includes("Fresh-only initializer refuses an existing/partial schema"));
  assert(init.includes("NOINHERIT NOREPLICATION NOBYPASSRLS"));
  assert(init.includes("NOINHERIT NOREPLICATION BYPASSRLS"));
  assert(init.indexOf("CREATE ROLE allura_app") < init.indexOf("client.query(migrations[index])"));
  assert(!init.includes("change-me-in-production"));
});
test("indeterminate Compose creation retains reconciliation state and never claims verified cleanup", async () => {
  const source = (await readFile(new URL("./smoke-core-install.mjs", import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "").replaceAll("import.meta.url", JSON.stringify(import.meta.url));
  for (const cleanupFails of [false, true]) {
  const output = [];
  const removed = [];
  const imageList = Object.values(images);
  const migrationImage = "sha256:" + "f".repeat(64);
  const timeout = Object.assign(new Error("synthetic timeout"), { code: "ETIMEDOUT" });
  const absent = { status: 1, stdout: "", stderr: "No such object" };
  const success = { status: 0, stdout: "", stderr: "" };
  const spawned = [];
  await assert.rejects(runInNewContext("(async()=>{" + source + "})()", {
    assert, URL, join, tmpdir: () => "/tmp", randomUUID: () => "fixture", randomBytes: () => Buffer.alloc(32, 7),
    mkdtemp: async () => "/tmp/allura-core-owned-fixture", rename: async () => {},
    readFile: async () => "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_fixture\nCLERK_SECRET_KEY=sk_test_fixture",
    parse: () => ({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture", CLERK_SECRET_KEY: "sk_test_fixture" }),
    buildCoreInstall: async () => ({ migrationCount: 71 }), rm: async path => removed.push(path),
    process: { argv: ["node", "fixture", ...imageList], env: { PATH: "/fixture", HOME: "/fixture" } },
    console: { log: text => output.push(text) },
    spawnSync: (_command, args, options) => {
      spawned.push(args);
      if (cleanupFails && args[0] === "ps" && spawned.filter(call => call[0] === "ps").length > 1) return { ...absent, stderr: "synthetic inspection refusal" };
      if (args[0] === "inspect") {
        const id = imageList.includes(args[1]) ? args[1] : args[1].endsWith(":base") ? images.gateway : args[1].endsWith(":migrations") ? migrationImage : null;
        return id ? { ...success, stdout: JSON.stringify([{ Id: id }]) } : absent;
      }
      if (["network", "volume"].includes(args[0])) return absent;
      if (args[0] === "compose" && args.includes("up")) return { ...success, error: timeout, status: null };
      if (args[0] === "compose" && !options.env.ALLURA_CORE_PG_PASSWORD) return { ...success, status: 1 };
      return success;
    },
  }), /synthetic timeout|cleanup inventory failed/);
  assert(spawned.some(args => args.includes("up")));
  assert.equal(removed.length, 0);
  assert(output.some(line => line.includes("unverified-after-indeterminate-command") && line.includes("allura-core-fixture")));
  assert(!output.some(line => line.startsWith("CLEANUP:")));
  }
});
