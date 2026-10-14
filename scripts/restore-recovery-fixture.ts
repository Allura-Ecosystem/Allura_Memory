// Test fixture only, bundled by smoke-restore-recovery.ts. Audit persistence is replaced
// by that test bundle's in-memory sink; backup/restore/subprocess implementations are real.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";
import { backupPostgres } from "../src/lib/backup/postgres";
import { runRestore } from "../src/lib/backup/restore";
import { BACKUP_VERSION, MANIFEST_FILENAME, type BackupManifest } from "../src/lib/backup/types";

const { source, target, run, image, migrations } = JSON.parse(await Bun.stdin.text());
assert(/^[a-f0-9-]{36}$/.test(run));
assert.equal(source, `allura-sep-restore-source-${run}`);
assert.equal(target, `allura-sep-restore-target-${run}`);
assert(/^sha256:[a-f0-9]{64}$/.test(image));
assert(process.env.TMPDIR && process.cwd() === process.env.TMPDIR);
for (const name of Object.keys(process.env)) assert(!/^(POSTGRES_|DATABASE_URL|CLERK_|NEXT_PUBLIC_CLERK)/.test(name));
const root = process.cwd();
const audit = (globalThis as unknown as { __restoreAudit: Array<{ event_type: string }> });
audit.__restoreAudit = [];
const command = (args: string[], input?: string) => execFileSync("docker", args,
  { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
for (const name of [source, target]) {
  const info = JSON.parse(command(["inspect", name]))[0];
  assert.equal(info.Config.Labels?.["allura.restore-test"], run);
  assert.equal(info.Image, image);
  assert.equal(info.HostConfig.NetworkMode, "none");
  assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
  assert(info.Mounts.every((mount: { Type: string }) => mount.Type === "tmpfs"));
  assert.equal(info.HostConfig.Tmpfs?.["/var/lib/postgresql/data"], "rw,size=512m");
  for (let attempt = 0; ; attempt++) {
    try { command(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "sep_owner", "-d", "memory"]); break; }
    catch { if (attempt >= 80) throw new Error("Disposable PostgreSQL not ready"); await Bun.sleep(200); }
  }
}
function sql(name: string, statement: string, db = "memory") {
  assert([source, target].includes(name));
  return command(["exec", "-i", name, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U",
    "sep_owner", "-d", db], statement).trim();
}
assert.equal(sql(source, "SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "0");
assert.equal(sql(target, "SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "0");
for (const { name, sql: statement } of migrations) {
  try { sql(source, statement); }
  catch { throw new Error(`Fresh migration failed: ${name}`); }
}
const scopes = [["allura-recovery-a", "recovery-a1"], ["allura-recovery-a", "recovery-a2"], ["allura-recovery-b", "recovery-b1"]];
for (const [group, workspace] of scopes) {
  sql(source, `INSERT INTO workspaces(workspace_id,group_id,name) VALUES('${workspace}','${group}','synthetic workspace');
    INSERT INTO graph_memories(id,group_id,workspace_id,workspace_scope_state,content,score,provenance)
    VALUES('${randomUUID()}','${group}','${workspace}','workspace_scoped','synthetic ${workspace}',0.9,'manual');`);
}
sql(source, `INSERT INTO graph_memories(id,group_id,workspace_scope_state,content,score,provenance)
  VALUES('${randomUUID()}','allura-recovery-a','legacy_quarantined','synthetic quarantine',0.9,'manual');`);
console.log(`PASS: ${migrations.length} migrations and synthetic three-workspace/two-tenant fixtures on a fresh isolated source`);

const key = randomBytes(32).toString("hex");
const date = "20260429", dateDir = join(root, date);
await mkdir(dateDir);
const backup = await backupPostgres({ container: source, database: "memory", user: "sep_owner", outputDir: dateDir,
  encryption: { key, cipher: "aes-256-cbc", saltLength: 16 } });
assert(backup.success, "Real backupPostgres must produce an encrypted archive");
const manifest: BackupManifest = { timestamp: new Date().toISOString(), date, types: ["postgres"], schema_version: 1,
  checksums: { [basename(backup.path)]: backup.checksum }, sizes: { [basename(backup.path)]: backup.size }, total_size: backup.size,
  duration_ms: backup.duration_ms, integrity_verified: true, hostname: "synthetic-fixture", backup_version: BACKUP_VERSION };
await writeFile(join(dateDir, MANIFEST_FILENAME), JSON.stringify(manifest));
assert((await readdir(dateDir)).every(name => !name.endsWith(".sql") && !name.endsWith(".gz")), "No backup plaintext on success");
// The existing archive excludes global roles. Explicit test prerequisite, not an installer policy.
const globals = command(["exec", source, "pg_dumpall", "-U", "sep_owner", "--roles-only", "--no-role-passwords"]);
// Both new clusters use the same bootstrap superuser. Only its already-existing
// CREATE statement is omitted; all ALTER/GRANT statements must succeed unchanged.
assert.equal(globals.match(/^CREATE ROLE sep_owner;$/gm)?.length, 1);
sql(target, globals.replace(/^CREATE ROLE sep_owner;\r?\n/m, ""));
Object.assign(process.env, { BACKUP_ENCRYPTION_KEY: key, POSTGRES_CONTAINER: target, POSTGRES_USER: "sep_owner", POSTGRES_DB: "memory" });
const ciphertext = await readFile(backup.path);
await writeFile(backup.path, Buffer.concat([ciphertext, Buffer.from("changed")]));
const corrupt = await runRestore({ backupDir: root, date, types: ["postgres"], dryRun: false });
assert.equal(corrupt.success, false);
assert(corrupt.errors.some(error => error.includes("Checksum mismatch")));
assert.equal(sql(target, "SELECT count(*) FROM pg_tables WHERE schemaname='public'"), "0");
await writeFile(backup.path, ciphertext);
await writeFile(join(dateDir, "postgres-old.sql.gz.enc"), "unlisted decoy must never be selected");
const started = performance.now();
assert.deepEqual(await runRestore({ backupDir: root, date, types: ["postgres"], dryRun: false }), { success: true, restored: ["postgres"], errors: [] });
const restoreMs = Math.round(performance.now() - started);
const snapshots = [
  "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY workspace_id), '[]') FROM workspaces t",
  "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM graph_memories t",
  "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY version), '[]') FROM schema_versions t",
  "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY schemaname,tablename,policyname), '[]') FROM pg_policies t WHERE schemaname IN ('public','app')",
  `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY schema_name,relname), '[]') FROM
    (SELECT n.nspname schema_name,c.relname,pg_get_userbyid(c.relowner) owner,
      (SELECT jsonb_agg(acl::text ORDER BY acl::text) FROM unnest(coalesce(c.relacl,
        acldefault((CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END)::"char",c.relowner))) acl) effective_acl,
      c.relrowsecurity,c.relforcerowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','app') AND c.relkind IN ('r','S','v')) t`,
  `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY rolname), '[]') FROM
    (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
     FROM pg_roles WHERE rolname LIKE 'allura_%' OR rolname='sep_owner') t`,
];
for (const query of snapshots) assert.deepEqual(JSON.parse(sql(target, query)), JSON.parse(sql(source, query)));
for (const name of [source, target]) {
  assert.equal(sql(name, "SET ROLE allura_app; SELECT count(*) FROM graph_memories"), "0");
  for (const [group, workspace] of scopes) assert.equal(sql(name, `BEGIN; SET LOCAL ROLE allura_app;
    SET LOCAL app.current_group_id='${group}'; SET LOCAL app.current_workspace_id='${workspace}';
    SELECT content FROM graph_memories ORDER BY content; COMMIT;`), `synthetic ${workspace}`);
}
console.log("PASS: real backup -> cold restore; matching representative rows, schema versions, policy definitions, relation owners/ACLs, role flags and scoped RLS reads");

sql(target, "CREATE DATABASE sep_failure TEMPLATE template0");
const failureDate = "20260430", failureDir = join(root, failureDate), failureName = "postgres-error.sql.gz.enc";
await mkdir(failureDir);
const failureSql = "CREATE TABLE before_failure(id int); SELECT 1 / 0; CREATE TABLE after_failure(id int);";
const encrypted = execFileSync("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "100000", "-pass", "env:BACKUP_ENCRYPTION_KEY"],
  { env: { ...process.env, BACKUP_ENCRYPTION_KEY: key }, input: gzipSync(failureSql), stdio: ["pipe", "pipe", "pipe"], timeout: 5000 });
await writeFile(join(failureDir, failureName), encrypted);
await writeFile(join(failureDir, MANIFEST_FILENAME), JSON.stringify({ ...manifest, date: failureDate,
  checksums: { [failureName]: createHash("sha256").update(encrypted).digest("hex") }, sizes: { [failureName]: encrypted.length }, total_size: encrypted.length }));
process.env.POSTGRES_DB = "sep_failure";
audit.__restoreAudit.length = 0;
const failed = await runRestore({ backupDir: root, date: failureDate, types: ["postgres"], dryRun: false });
assert.equal(failed.success, false);
assert.deepEqual(failed.restored, []);
assert(failed.errors.some(error => error.includes("database restore")));
assert(audit.__restoreAudit.some(event => event.event_type === "restore.failed"));
assert(!audit.__restoreAudit.some(event => event.event_type === "restore.completed"));
assert.equal(sql(target, "SELECT to_regclass('before_failure') IS NOT NULL", "sep_failure"), "t");
assert.equal(sql(target, "SELECT to_regclass('after_failure') IS NULL", "sep_failure"), "t");
assert(!(await readdir(root)).some(name => name.startsWith("allura-pg-restore-")), "Private plaintext must be removed after both restores");
console.log("PASS: actual SQL error fails restore and prevents later SQL; earlier SQL remains committed (no rollback claim); private restore plaintext cleaned");
console.log(JSON.stringify({ archiveBytes: backup.size, backupMs: backup.duration_ms, restoreMs, migrationCount: migrations.length,
  proofLimits: "Synthetic small cold restore only; global roles pre-restored explicitly; audit persistence mocked; no production, upgrade, timeout recovery, complete installer, RPO/RTO or scale acceptance" }));
