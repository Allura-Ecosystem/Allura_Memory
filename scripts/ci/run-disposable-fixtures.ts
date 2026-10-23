/** Future hosted CI entrypoint. Import is inert; no database/container action runs at import. */
import { Client as PgClient } from "pg";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { type FixtureLane, type LifecycleAdapters, runFixtureLane, validateFixtureManifest } from "./disposable-fixture-runner";
import {
  CONNECTION_KEYS, type DatabaseIdentity, digest, type FixtureEnv, type FixtureReceipt, type GuardAdapters,
  insist, type RunnerContext, runnerContext, type ServiceObservation,
} from "../../tests/fixtures/disposable-postgres";

export type Command = (file: string, args: string[], env: FixtureEnv, input?: string) => Promise<string>;
export class FixtureCommandError extends Error {
  constructor(readonly exitCode: number | null, file: string) { super(`Fixture command failed: ${file} exit=${exitCode}`); }
}
/** No shell interpolation; secrets/SQL enter private environment/stdin, never argv. */
const command: Command = (file, args, env, input) => new Promise((accept, reject) => {
  const child = spawn(file, args, { env: { ...env, NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"] });
  let output = ""; let excessive = false;
  child.stdout.on("data", (data: Buffer) => {
    output += data.toString();
    if (output.length > 16 * 1024 * 1024) { excessive = true; child.kill(); }
  });
  // Don't print SQL/payload-bearing stderr into public receipts.
  child.stderr.resume();
  child.on("error", () => reject(new Error(`Fixture command could not start: ${file}`)));
  child.on("close", code => code === 0 && !excessive ? accept(output) : reject(new FixtureCommandError(code, file)));
  child.stdin.on("error", () => undefined);
  child.stdin.end(input);
});
export async function migrationManifest(root: string): Promise<{ files: string[]; sha256: string }> {
  const files = (await readdir(join(root, "docker/postgres-init"))).filter(file => file.endsWith(".sql")).sort();
  insist(files.length > 0, "empty migration manifest");
  const entries = await Promise.all(files.map(async file => [file, digest(await readFile(join(root, "docker/postgres-init", file), "utf8"))]));
  return { files, sha256: digest(JSON.stringify(entries)) };
}
export async function sourceDigest(root: string, files: string[]): Promise<string> {
  const entries = await Promise.all(files.map(async file => [file, digest(await readFile(join(root, file), "utf8"))]));
  return entries.length === 1 ? entries[0][1] : digest(JSON.stringify(entries));
}
export async function inspectService(context: RunnerContext, execute: Command = command): Promise<ServiceObservation> {
  // Filter before returning output: Docker Config.Env contains credentials.
  const format = '{"id":{{json .Id}},"image":{{json .Config.Image}},"imageId":{{json .Image}},"created":{{json .Created}},"running":{{json .State.Running}},"labels":{{json .Config.Labels}},"networks":{{json .NetworkSettings.Networks}},"ports":{{json .NetworkSettings.Ports}},"binds":{{json .HostConfig.Binds}},"volumesFrom":{{json .HostConfig.VolumesFrom}},"mounts":{{json .Mounts}}}';
  const value = JSON.parse(await execute("docker", ["container", "inspect", "--format", format, context.serviceId], process.env));
  const networks = Object.entries(value.networks ?? {});
  insist(networks.length === 1 && networks[0][0] === context.network, "service network inventory");
  const mounts: ServiceObservation["mounts"] = (value.mounts ?? []).map((item: { Type: string; Name: string; Destination: string; RW: boolean }) =>
    ({ type: item.Type, name: item.Name, destination: item.Destination, rw: item.RW }));
  insist(mounts.length === 1 && mounts[0].type === "volume" && /^[a-f0-9]{64}$/.test(mounts[0].name), "anonymous storage required");
  const volume = JSON.parse(await execute("docker", ["volume", "inspect", "--format",
    '{"name":{{json .Name}},"created":{{json .CreatedAt}},"driver":{{json .Driver}},"scope":{{json .Scope}},"options":{{json .Options}}}', mounts[0].name], process.env));
  return { id: value.id, image: value.image, imageId: value.imageId, created: value.created, running: value.running,
    labels: value.labels ?? {}, network: networks[0][0], networkId: (networks[0][1] as { NetworkID: string }).NetworkID,
    ports: (value.ports?.["5432/tcp"] ?? []).map((p: { HostIp: string; HostPort: string }) => ({ host: p.HostIp, port: p.HostPort })),
    binds: value.binds ?? [], volumesFrom: value.volumesFrom ?? [], mounts, volumes: [volume] };
}
const protectionsSql = `SELECT
  (SELECT count(*)=5 AND bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class
    WHERE oid IN ('public.events'::regclass,'public.canonical_proposals'::regclass,'public.governance_receipts'::regclass,
      'public.promotion_outbox'::regclass,'public.genesis_verified_claims'::regclass))
  AND (SELECT count(*)=6 AND bool_and(tgenabled IN ('O','A')) FROM pg_trigger WHERE NOT tgisinternal AND
    (tgrelid,tgname) IN (('public.events'::regclass,'events_immutable_trigger'),
    ('public.governance_receipts'::regclass,'governance_receipts_immutable_trigger'),
    ('public.governance_receipt_evidence_requests'::regclass,'governance_receipt_evidence_requests_immutable_trigger'),
    ('public.pattern_proposals'::regclass,'trg_pattern_proposals_block_update'),
    ('public.pattern_proposals'::regclass,'trg_pattern_proposals_block_delete'),
    ('public.pattern_proposals'::regclass,'trg_pattern_proposals_block_truncate'))) AS protections`;
export interface IdentityClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}
/** Every query on the independent client route is read-only until identity passes. */
export async function readClientIdentity(receipt: FixtureReceipt, app: boolean, env: FixtureEnv,
  factory: (config: Record<string, unknown>) => IdentityClient = config => new PgClient(config)): Promise<DatabaseIdentity> {
  const client = factory({ host: "127.0.0.1", port: receipt.context.port, database: receipt.database.name,
    user: app ? "allura_app" : receipt.database.owner, password: app ? env.POSTGRES_APP_PASSWORD : env.POSTGRES_PASSWORD,
    connectionTimeoutMillis: 10_000, options: "-c default_transaction_read_only=on" });
  let primary: unknown;
  try {
    await client.connect();
    const { rows } = await client.query(`SELECT current_database() AS name,d.oid::text AS oid,pg_get_userbyid(d.datdba) AS owner,
      session_user AS "sessionUser",current_user AS "currentUser",current_setting('server_version_num')::int AS version,
      r.rolsuper AS superuser,r.rolbypassrls AS "bypassRls",r.rolcreatedb AS "createDb",r.rolcreaterole AS "createRole",
      r.rolreplication AS replication,pg_has_role(session_user,d.datdba,'MEMBER') AS "memberOfOwner"
      FROM pg_database d JOIN pg_roles r ON r.rolname=session_user WHERE d.datname=current_database()`);
    insist(rows.length === 1, "identity cardinality");
    const identity = rows[0] as unknown as DatabaseIdentity;
    if (!app) {
      identity.systemIdentifier = String((await client.query("SELECT system_identifier::text AS id FROM pg_control_system()")).rows[0]?.id);
      identity.protections = (await client.query(protectionsSql)).rows[0]?.protections === true;
    }
    return identity;
  } catch (error) { primary = error; throw error; }
  finally {
    try { await client.end(); } catch (error) {
      if (primary !== undefined) throw new AggregateError([primary, error], "identity check and close failed");
      throw error;
    }
  }
}
export function childEnvironment(env: FixtureEnv, receipt?: FixtureReceipt): FixtureEnv {
  const clean: FixtureEnv = { ...env, ALLURA_FIXTURE_RUNNER: "1" };
  for (const key of CONNECTION_KEYS) clean[key] = "";
  for (const key of Object.keys(clean)) {
    if (/^(ALLURA_FIXTURE_(OWNER|APP)_|GITHUB_TOKEN$|GH_TOKEN$)/.test(key)) delete clean[key];
  }
  if (receipt) Object.assign(clean, { POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: String(receipt.context.port),
    POSTGRES_DB: receipt.database.name, POSTGRES_USER: receipt.database.owner, POSTGRES_PASSWORD: env.ALLURA_FIXTURE_OWNER_PASSWORD,
    POSTGRES_APP_USER: "allura_app", POSTGRES_APP_PASSWORD: env.ALLURA_FIXTURE_APP_PASSWORD, RUN_E2E_TESTS: "true" });
  return clean;
}
export function childGuardAdapters(root = process.cwd(), env: FixtureEnv = process.env): GuardAdapters {
  let path: string;
  return {
    now: Date.now,
    async receipt() {
      const filename = env.ALLURA_FIXTURE_RECEIPT; const key = env.ALLURA_FIXTURE_LAUNCH_KEY;
      insist(filename && key && /^[a-f0-9]{64}$/.test(key), "missing private runner launch");
      path = filename;
      const body = await readFile(path, "utf8");
      insist(createHmac("sha256", key).update(body).digest("hex") === env.ALLURA_FIXTURE_RECEIPT_MAC, "receipt launch mismatch");
      return JSON.parse(body) as FixtureReceipt;
    },
    sourceDigest: suite => sourceDigest(root, [suite]),
    migrationDigest: async () => (await migrationManifest(root)).sha256,
    claim: () => writeFile(`${path}.consumed`, String(process.pid), { flag: "wx", mode: 0o600 }),
    inspect: inspectService,
    identity: (receipt, app) => readClientIdentity(receipt, app, env),
  };
}
export function runtimeAdapters(root: string, artifactDir: string, lane: FixtureLane, env: FixtureEnv,
  execute: Command = command): LifecycleAdapters {
  const output = new Map<string, string>();
  const psql = (context: RunnerContext, db: string, sql: string): Promise<string> => {
    insist(db === "postgres" || /^allura_fixture_[a-f0-9]{32}$/.test(db), "unsafe database identifier");
    return execute("docker", ["exec", "-i", context.serviceId, "env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin",
      "psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", "/var/run/postgresql", "-p", "5432", "-U", "allura", "-d", db, "-tA"], env, sql);
  };
  const jsonQuery = async (context: RunnerContext, db: string, sql: string): Promise<Record<string, string>> => JSON.parse((await psql(context, db, sql)).trim());
  return {
    now: Date.now, inspect: context => inspectService(context, execute),
    async serviceCreatedAt(_context, service) { return Date.parse(service.created); },
    async reserve(partition, id) {
      const dir = join(artifactDir, `${digest(partition.key).slice(0, 12)}-${id}`);
      await mkdir(dir, { recursive: false, mode: 0o700 }); output.set(partition.key, dir);
    },
    async cluster(context) {
      const row = await jsonQuery(context, "postgres", `SELECT json_build_object('systemIdentifier',system_identifier::text,'version',current_setting('server_version_num')::int,'owner',current_user) FROM pg_control_system();`);
      return { systemIdentifier: row.systemIdentifier, version: Number(row.version), owner: row.owner };
    },
    async exists(context, name) {
      insist(/^allura_fixture_[a-f0-9]{32}$/.test(name), "unsafe database identifier");
      const result = (await psql(context, "postgres", `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='${name}');`)).trim();
      insist(result === "t" || result === "f", "existence query shape");
      return result === "t";
    },
    async create(context, name) {
      insist(/^allura_fixture_[a-f0-9]{32}$/.test(name), "unsafe database identifier");
      await psql(context, "postgres", `CREATE DATABASE "${name}" OWNER "allura";`);
    },
    async database(context, name) {
      insist(/^allura_fixture_[a-f0-9]{32}$/.test(name), "unsafe database identifier");
      const row = await jsonQuery(context, "postgres", `SELECT json_build_object('name',datname,'oid',oid::text,'owner',pg_get_userbyid(datdba)) FROM pg_database WHERE datname='${name}';`);
      return { name: row.name, oid: row.oid, owner: row.owner };
    },
    async migrate(context, name) {
      const manifest = await migrationManifest(root);
      for (const file of manifest.files) await psql(context, name, await readFile(join(root, "docker/postgres-init", file), "utf8"));
      // Existing migrations create this restricted role; no rotation or new grants.
      insist(env.ALLURA_FIXTURE_APP_PASSWORD === "change-me-in-production", "migration app credential mismatch");
    },
    migrationDigest: async () => (await migrationManifest(root)).sha256,
    sourceDigest: files => sourceDigest(root, files),
    identity: (receipt, app) => readClientIdentity(receipt, app, childEnvironment(env, receipt)),
    async child(partition, receipt) {
      const dir = output.get(partition.key)!; const childEnv = childEnvironment(env, receipt);
      if (receipt && partition.isolated) {
        const body = JSON.stringify(receipt); const key = randomBytes(32).toString("hex"); const path = join(dir, "receipt.json");
        await writeFile(path, body, { flag: "wx", mode: 0o600 });
        Object.assign(childEnv, { ALLURA_FIXTURE_RECEIPT: path, ALLURA_FIXTURE_LAUNCH_KEY: key,
          ALLURA_FIXTURE_RECEIPT_MAC: createHmac("sha256", key).update(body).digest("hex") });
      }
      const reportPath = join(dir, "vitest.json");
      const args = ["run", "test", "--config", `vitest.config.${lane}.ts`, ...partition.files,
        "--poolOptions.forks.singleFork", "--passWithNoTests=false", "--reporter=json", `--outputFile=${reportPath}`];
      const startedAt = Date.now(); let exitCode = 0;
      try { await execute("bun", args, childEnv); } catch (error) {
        const code = error instanceof FixtureCommandError ? error.exitCode : null;
        exitCode = typeof code === "number" && Number.isFinite(code) && code !== 0 ? code : 1;
      }
      const finishedAt = Date.now();
      let report: unknown;
      try { report = JSON.parse(await readFile(reportPath, "utf8")); } catch { report = null; }
      return { exitCode, report, startedAt, finishedAt };
    },
    evidence: (partition, result) => writeFile(join(output.get(partition.key)!, "lifecycle.json"), JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 }),
  };
}
/** Parent directories may exist; the final run directory must be newly reserved. */
export async function reserveArtifactDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await mkdir(path, { recursive: false, mode: 0o700 });
}
export async function main(args: string[], env: FixtureEnv = process.env,
  execute: Command = command, makeAdapters: typeof runtimeAdapters = runtimeAdapters): Promise<void> {
  insist(args.length === 2, "usage --lane=integration|e2e|live-db --artifact-dir=<new-directory>");
  const lane = args.find(arg => arg.startsWith("--lane="))?.slice(7);
  const artifact = args.find(arg => arg.startsWith("--artifact-dir="))?.slice(15);
  insist((lane === "integration" || lane === "e2e" || lane === "live-db") && artifact, "invalid runner arguments");
  runnerContext(env);
  insist(env.ALLURA_FIXTURE_OWNER_USER === "allura" && env.ALLURA_FIXTURE_APP_USER === "allura_app"
    && !!env.ALLURA_FIXTURE_OWNER_PASSWORD && env.ALLURA_FIXTURE_APP_PASSWORD === "change-me-in-production"
    && env.ALLURA_FIXTURE_OWNER_PASSWORD !== env.ALLURA_FIXTURE_APP_PASSWORD, "fixture credentials");
  const root = process.cwd(); const directory = resolve(artifact);
  await reserveArtifactDirectory(directory);
  insist((await execute("git", ["rev-parse", "HEAD"], env)).trim() === env.GITHUB_SHA, "checkout revision mismatch");
  // Installed Vitest 2.1.9 list --filesOnly discovers files without collecting test modules.
  const inventoryPath = join(directory, "inventory.json");
  await execute("bun", ["node_modules/vitest/vitest.mjs", "list", "--config", `vitest.config.${lane}.ts`, "--filesOnly", `--json=${inventoryPath}`], childEnvironment(env));
  const raw = JSON.parse(await readFile(inventoryPath, "utf8")) as { file: string }[];
  insist(Array.isArray(raw), "inventory JSON");
  const files = raw.map(item => relative(root, resolve(item.file)).replaceAll("\\", "/"));
  const required = validateFixtureManifest(JSON.parse(await readFile(join(root, "tests/fixtures/required-live-assertions.json"), "utf8")));
  await runFixtureLane(lane, files, env, makeAdapters(root, directory, lane, env, execute), required, root);
}
if (import.meta.main) {
  main(process.argv.slice(2)).catch(() => { console.error("Disposable fixture runner failed; inspect private lifecycle evidence. No database was adopted or deleted."); process.exitCode = 1; });
}
