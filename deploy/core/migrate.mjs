// Fresh-only candidate initializer. No upgrades, retry, tenant or owner provisioning.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

const root = "/bundle/migrations";
const manifest = JSON.parse(await readFile(root + "/manifest.json", "utf8"));
const names = (await readdir(root)).filter(name => name.endsWith(".sql")).sort();
assert.deepEqual(names, manifest.map(entry => entry.name), "Migration inventory mismatch");
const migrations = [];
for (const entry of manifest) {
  assert(/^[a-zA-Z0-9_-]+\.sql$/.test(entry.name), "Unsafe migration name");
  const sql = await readFile(root + "/" + entry.name, "utf8");
  assert.equal(createHash("sha256").update(sql).digest("hex"), entry.sha256, "Migration checksum mismatch");
  assert(!/^\s*\\/m.test(sql), "psql meta commands unsupported");
  migrations.push(sql);
}
for (const key of ["POSTGRES_PASSWORD", "POSTGRES_APP_PASSWORD", "POSTGRES_MIGRATION_PASSWORD"]) {
  assert(/^[a-f0-9]{64}$/.test(process.env[key] ?? ""), key + " requires an explicit 32-byte hex credential");
}
assert.equal(new Set(["POSTGRES_PASSWORD", "POSTGRES_APP_PASSWORD", "POSTGRES_MIGRATION_PASSWORD"].map(key => process.env[key])).size, 3, "Credentials must differ");
const client = new pg.Client({
  host: "postgres", port: 5432, database: "memory", user: "allura_owner",
  password: process.env.POSTGRES_PASSWORD, connectionTimeoutMillis: 5000, statement_timeout: 30000,
});
try {
  await client.connect();
  const occupied = await client.query(`
    SELECT
      EXISTS(SELECT 1 FROM pg_namespace WHERE NOT starts_with(nspname, 'pg_') AND nspname NOT IN ('public','information_schema')) OR
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') OR
      EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') OR
      EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') OR
      EXISTS(SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql') AS occupied
  `);
  assert.equal(occupied.rows[0].occupied, false, "Fresh-only initializer refuses an existing/partial schema");
  assert.equal((await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('allura_app','allura_migration','allura_breakglass')")).rowCount, 0, "Fresh-only initializer refuses existing application roles");
  // Credentials are hex-validated above. Never print SQL, query errors or passwords.
  await client.query("CREATE ROLE allura_app LOGIN PASSWORD '" + process.env.POSTGRES_APP_PASSWORD + "' NOINHERIT NOREPLICATION NOBYPASSRLS");
  await client.query("CREATE ROLE allura_migration LOGIN PASSWORD '" + process.env.POSTGRES_MIGRATION_PASSWORD + "' NOINHERIT NOREPLICATION BYPASSRLS");
  await client.query("SELECT set_config('allura.fresh_company_install', 'on', false)");
  for (let index = 0; index < migrations.length; index++) {
    try { await client.query(migrations[index]); }
    catch { throw new Error("Migration failed: " + manifest[index].name + "; partial state retained, no retry"); }
  }
  for (const table of ["tenants", "workspaces", "graph_memories", "mcp_tokens", "schema_versions"]) await client.query("SELECT 1 FROM " + table + " LIMIT 0");
  for (const table of ["tenants", "workspaces", "memberships", "brain_workspace_memberships", "mcp_tokens"]) assert.equal((await client.query("SELECT count(*)::int AS n FROM " + table)).rows[0].n, 0, "Fresh company state must be empty");
  const attributes = (await client.query("SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN ('allura_app','allura_breakglass','allura_migration') ORDER BY rolname")).rows;
  assert.deepEqual(attributes, [
    { rolname: "allura_app", rolcanlogin: true, rolsuper: false, rolinherit: false, rolreplication: false, rolbypassrls: false },
    { rolname: "allura_breakglass", rolcanlogin: false, rolsuper: false, rolinherit: false, rolreplication: false, rolbypassrls: true },
    { rolname: "allura_migration", rolcanlogin: true, rolsuper: false, rolinherit: false, rolreplication: false, rolbypassrls: true },
  ]);
  assert.equal((await client.query("SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='allura_app')")).rowCount, 0);
  assert.equal((await client.query("SELECT 1 FROM schema_versions WHERE version='078'")).rowCount, 1);
  assert.deepEqual((await client.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='graph_scope_revisions'::regclass")).rows[0], { relrowsecurity: true, relforcerowsecurity: true });
  assert.equal((await client.query("SELECT to_regprocedure('public.bump_graph_scope_revision()') IS NOT NULL AS found")).rows[0].found, true);
  console.log(JSON.stringify({ initialized: true, migrationCount: manifest.length, companyTenants: 0, workspaces: 0, ownerProvisioned: false }));
} catch (error) {
  console.error("Fresh initialization refused or failed; no automatic repair. " + (error?.message?.startsWith("Migration failed:") ? error.message : "Verify the artifact, empty database and explicit credentials."));
  process.exitCode = 1;
} finally { await client.end(); }
