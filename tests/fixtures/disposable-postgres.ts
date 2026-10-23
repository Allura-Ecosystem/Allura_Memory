/** Test-only contract. Authority is the reviewed hosted runner, not this receipt's JSON. */
import { createHash, randomUUID } from "node:crypto";

export type FixtureLane = "integration" | "e2e" | "live-db";
export const FIXTURE_LANES = {
  "src/lib/memory/__tests__/atomic-promotion.e2e.test.ts": ["e2e"],
  "src/lib/memory/__tests__/promotion-roundtrip.e2e.test.ts": ["e2e"],
  "src/lib/memory/__tests__/promotion-outbox-worker.e2e.test.ts": ["e2e"],
  "tests/integration/genesis-engine.test.ts": ["integration"],
  "src/__tests__/e2e-integration.test.ts": ["e2e"],
  "src/__tests__/curator-pipeline.e2e.test.ts": ["e2e"],
  "src/lib/validation/group-governance.test.ts": ["e2e"],
  "src/lib/validation/trace-ref.test.ts": ["e2e"],
  "src/__tests__/auto-curator-workspace-authority.e2e.test.ts": ["live-db"],
  "src/__tests__/parity-test.test.ts": ["integration"],
} as const satisfies Record<string, readonly FixtureLane[]>;
export type FixtureSuite = keyof typeof FIXTURE_LANES;
export const FIXTURE_SUITES = Object.keys(FIXTURE_LANES) as FixtureSuite[];
export function fixturesForLane(lane: FixtureLane): FixtureSuite[] {
  return FIXTURE_SUITES.filter(file => (FIXTURE_LANES[file] as readonly FixtureLane[]).includes(lane));
}
export type FixtureEnv = Record<string, string | undefined>;
export const APPROVED_IMAGE = "pgvector/pgvector:pg16";
export const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
export function insist(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Disposable fixture refused: ${message}`);
}
export interface RunnerContext {
  repository: string; sha: string; runId: string; attempt: string; job: string;
  serviceId: string; network: string; port: number;
}
export function runnerContext(env: FixtureEnv): RunnerContext {
  insist(env.GITHUB_ACTIONS === "true" && env.RUNNER_ENVIRONMENT === "github-hosted", "requires hosted job ownership");
  insist(!env.DOCKER_HOST && !env.DOCKER_CONTEXT, "ambient Docker endpoint override");
  const required = (key: string, counterpart?: string): string => {
    const value = env[`ALLURA_FIXTURE_${key}`];
    insist(value && (!counterpart || value === env[counterpart]), `invalid ${key}`);
    return value;
  };
  const repository = required("REPOSITORY", "GITHUB_REPOSITORY");
  const sha = required("SHA", "GITHUB_SHA");
  const runId = required("RUN_ID", "GITHUB_RUN_ID");
  const attempt = required("RUN_ATTEMPT", "GITHUB_RUN_ATTEMPT");
  const job = required("JOB", "GITHUB_JOB");
  const serviceId = required("SERVICE_ID");
  const network = required("SERVICE_NETWORK");
  const portText = required("SERVICE_PORT");
  insist(/^[\w.-]+\/[\w.-]+$/.test(repository) && /^[a-f0-9]{40}$/.test(sha), "source identity");
  insist(/^\d+$/.test(runId) && /^[1-9]\d*$/.test(attempt) && /^[\w-]+$/.test(job), "run identity");
  insist(/^[a-f0-9]{64}$/.test(serviceId) && /^[\w-]+$/.test(network), "exact service identity");
  insist(/^\d+$/.test(portText) && +portText > 0 && +portText < 65536, "published port");
  return { repository, sha, runId, attempt, job, serviceId, network, port: +portText };
}
export interface ServiceObservation {
  id: string; image: string; imageId: string; created: string; running: boolean;
  labels: Record<string, string>; network: string; networkId: string; ports: { host: string; port: string }[];
  binds: string[]; volumesFrom: string[];
  mounts: { type: string; name: string; destination: string; rw: boolean }[];
  volumes: { name: string; created: string; driver: string; scope: string; options: unknown }[];
}
export function verifyService(context: RunnerContext, service: ServiceObservation, startedAt: number, now: number): void {
  insist(Number.isFinite(startedAt) && startedAt <= now && now - startedAt < 6 * 60 * 60_000, "stale run");
  insist(service.id === context.serviceId && service.running && service.image === APPROVED_IMAGE
    && /^sha256:[a-f0-9]{64}$/.test(service.imageId), "service/image mismatch");
  insist(service.labels["allura.fixture.run"] === context.runId && service.labels["allura.fixture.attempt"] === context.attempt
    && service.labels["allura.fixture.job"] === context.job && service.labels["allura.fixture.repository"] === context.repository, "service run labels mismatch");
  insist(service.network === context.network && /^[a-f0-9]{64}$/.test(service.networkId), "network mismatch");
  insist(service.ports.length > 0 && service.ports.every(p => ["127.0.0.1", "0.0.0.0", "::"].includes(p.host)
    && p.port === String(context.port)), "published endpoint mismatch");
  // Hosted runner owns a newly created service. Timestamps corroborate that claim;
  // an arbitrary local container with a recent timestamp is never accepted.
  const fresh = (value: string): boolean => Number.isFinite(Date.parse(value))
    && Date.parse(value) >= startedAt - 1000 && Date.parse(value) <= now + 1000;
  insist(fresh(service.created), "stale container");
  insist(service.binds.length === 0 && service.volumesFrom.length === 0, "reused/bind storage");
  insist(service.mounts.length === 1 && service.volumes.length === 1, "unexpected storage layout");
  const mount = service.mounts[0]; const volume = service.volumes[0];
  insist(mount.type === "volume" && mount.destination === "/var/lib/postgresql/data" && mount.rw
    && /^[a-f0-9]{64}$/.test(mount.name) && volume.name === mount.name
    && volume.driver === "local" && volume.scope === "local" && !volume.options
    && fresh(volume.created) && Date.parse(volume.created) >= Date.parse(service.created) - 1000, "storage freshness/ownership");
}
export interface DatabaseIdentity {
  name: string; oid: string; owner: string; sessionUser: string; currentUser: string;
  systemIdentifier?: string; version: number;
  superuser: boolean; bypassRls: boolean; createDb: boolean; createRole: boolean; replication: boolean;
  memberOfOwner: boolean; protections?: boolean;
}
export function verifyIdentity(identity: DatabaseIdentity, database: { name: string; oid: string; owner: string; systemIdentifier: string }, app: boolean): void {
  const role = app ? "allura_app" : database.owner;
  insist(identity.name === database.name && identity.oid === database.oid && identity.owner === database.owner
    && identity.sessionUser === role && identity.currentUser === role && identity.version >= 160000 && identity.version < 170000,
  "database/login identity mismatch");
  if (app) {
    insist(role !== database.owner && identity.superuser === false && identity.bypassRls === false && identity.createDb === false
      && identity.createRole === false && identity.replication === false && identity.memberOfOwner === false, "privileged app login");
  } else {
    insist(identity.systemIdentifier === database.systemIdentifier && identity.protections === true, "cluster/protections mismatch");
  }
}
export interface FixtureReceipt {
  version: 1; context: RunnerContext; serviceCreatedAt: number; createdAt: number; fixtureId: string;
  suite: string; suiteDigest: string; migrationDigest: string; service: ServiceObservation;
  database: { name: string; oid: string; owner: string; systemIdentifier: string };
  state: "client_identity_verified";
}
export const CONNECTION_KEYS = ["POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD",
  "POSTGRES_APP_USER", "POSTGRES_APP_PASSWORD", "POSTGRES_APP_OPTIONS", "DATABASE_URL", "POSTGRES_URL", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGOPTIONS", "PGSERVICE", "PGSERVICEFILE"] as const;
export function checkReceipt(receipt: FixtureReceipt, suite: string, env: FixtureEnv, sourceDigest: string, migrations: string, now: number): void {
  const context = runnerContext(env);
  insist(receipt?.version === 1 && receipt.state === "client_identity_verified", "missing/unfinished receipt");
  insist(JSON.stringify(context) === JSON.stringify(receipt.context), "receipt run mismatch");
  insist(FIXTURE_SUITES.includes(suite as FixtureSuite) && receipt.suite === suite
    && receipt.suiteDigest === sourceDigest && receipt.migrationDigest === migrations, "receipt source/suite mismatch");
  insist(/^[a-f0-9-]{36}$/.test(receipt.fixtureId) && receipt.createdAt <= now && now - receipt.createdAt < 30 * 60_000, "expired receipt");
  verifyService(context, receipt.service, receipt.serviceCreatedAt, now);
  const db = receipt.database;
  insist(/^allura_fixture_[a-f0-9]{32}$/.test(db.name) && /^\d+$/.test(db.oid) && /^\d+$/.test(db.systemIdentifier)
    && db.owner === "allura" && env.POSTGRES_HOST === "127.0.0.1" && env.POSTGRES_PORT === String(context.port)
    && env.POSTGRES_DB === db.name && env.POSTGRES_USER === db.owner && !!env.POSTGRES_PASSWORD
    && env.POSTGRES_APP_USER === "allura_app" && !!env.POSTGRES_APP_PASSWORD
    && env.POSTGRES_APP_PASSWORD !== env.POSTGRES_PASSWORD, "explicit connection mismatch");
  insist(CONNECTION_KEYS.slice(7).every(key => !env[key]), "ambient connection override");
}
export interface GuardAdapters {
  receipt(): Promise<FixtureReceipt>;
  sourceDigest(suite: string): Promise<string>;
  migrationDigest(): Promise<string>;
  claim(): Promise<void>;
  inspect(context: RunnerContext): Promise<ServiceObservation>;
  identity(receipt: FixtureReceipt, app: boolean): Promise<DatabaseIdentity>;
  now(): number;
}
/** No connection adapter is reachable until the complete preconnection gate passes. */
export async function guardFixture(suite: FixtureSuite, env: FixtureEnv, adapter: GuardAdapters): Promise<() => void> {
  runnerContext(env); // Refuse missing trusted launch even before reading a receipt.
  const snapshot = CONNECTION_KEYS.map(key => env[key]);
  const assertEnvironment = (): void => insist(CONNECTION_KEYS.every((key, index) => env[key] === snapshot[index]), "connection changed after validation");
  const receipt = await adapter.receipt();
  checkReceipt(receipt, suite, env, await adapter.sourceDigest(suite), await adapter.migrationDigest(), adapter.now());
  await adapter.claim(); // Exclusive consume; a receipt is never reused by another child.
  const service = await adapter.inspect(receipt.context);
  verifyService(receipt.context, service, receipt.serviceCreatedAt, adapter.now());
  insist(digest(JSON.stringify(service)) === digest(JSON.stringify(receipt.service)), "service changed after launch");
  assertEnvironment();
  verifyIdentity(await adapter.identity(receipt, false), receipt.database, false);
  verifyIdentity(await adapter.identity(receipt, true), receipt.database, true);
  assertEnvironment();
  return assertEnvironment;
}
/** Live adapter is lazy: importing a suite never opens a pool or a connection. */
export async function requireDisposableFixture(suite: FixtureSuite): Promise<() => void> {
  runnerContext(process.env);
  const { childGuardAdapters } = await import("../../scripts/ci/run-disposable-fixtures");
  return guardFixture(suite, process.env, childGuardAdapters());
}
export function freshFixtureScope(): { groupId: string; workspaceId: string; principalId: string; sessionId: string } {
  const id = randomUUID();
  return { groupId: `allura-fixture-${id}`, workspaceId: `workspace-${id}`, principalId: `curator-${id}`, sessionId: id };
}
