import { randomUUID } from "node:crypto";
import { relative, resolve } from "node:path";
import { readRequiredLane, type RequiredSuite, validateRequiredSuiteReport } from "./required-suites";
import {
  type DatabaseIdentity, digest, FIXTURE_SUITES, type FixtureEnv, type FixtureLane, type FixtureReceipt, fixturesForLane,
  insist, type RunnerContext, runnerContext, type ServiceObservation, verifyIdentity, verifyService,
} from "../../tests/fixtures/disposable-postgres";

export type { FixtureLane } from "../../tests/fixtures/disposable-postgres";
export interface Partition { key: string; files: string[]; isolated: boolean }
export function validateFixtureManifest(manifest: unknown): RequiredSuite[] {
  const { suites } = readRequiredLane({ version: 1, lanes: { fixtures: { config: "vitest.config.e2e.ts", suites: manifest } } }, "fixtures");
  insist(JSON.stringify(suites.map(suite => suite.file).sort()) === JSON.stringify([...FIXTURE_SUITES].sort()), "fixture manifest must match the explicit suite registry");
  return suites;
}
/** The canonical configs remain the source of selection. Never drop a selected file. */
export function partitionInventory(lane: FixtureLane, files: string[]): Partition[] {
  insist(files.length > 0 && new Set(files).size === files.length
    && files.every(file => !file.startsWith("/") && !file.split("/").includes("..") && file.endsWith(".test.ts")), "invalid/empty inventory");
  const isolated = fixturesForLane(lane);
  insist(isolated.every(file => files.includes(file)), "required fixture absent from canonical inventory");
  const remainder = files.filter(file => !isolated.includes(file as typeof isolated[number]));
  const parts: Partition[] = isolated.map(file => ({ key: file, files: [file], isolated: true }));
  if (remainder.length) parts.push({ key: `${lane}-remainder`, files: remainder, isolated: false });
  insist(parts.flatMap(part => part.files).length === files.length, "inventory partition lost files");
  return parts;
}
export function validatePartitionReport(report: unknown, partition: Partition, required: RequiredSuite[], root: string, start: number, end: number): void {
  const failure = validateRequiredSuiteReport(report, required.filter(item => partition.files.includes(item.file)), root, start, end);
  insist(!failure, failure ?? "report");
  const files = (report as { testResults: { name: string }[] }).testResults.map(item => relative(root, resolve(item.name)).replaceAll("\\", "/"));
  insist(JSON.stringify([...files].sort()) === JSON.stringify([...partition.files].sort()), "executed file inventory mismatch");
}
export interface LifecycleAdapters {
  now(): number;
  inspect(context: RunnerContext): Promise<ServiceObservation>;
  /** Verified job service creation context; never a caller-supplied recent timestamp alone. */
  serviceCreatedAt(context: RunnerContext, service: ServiceObservation): Promise<number>;
  reserve(partition: Partition, fixtureId: string): Promise<void>;
  cluster(context: RunnerContext): Promise<{ systemIdentifier: string; version: number; owner: string }>;
  exists(context: RunnerContext, name: string): Promise<boolean>;
  create(context: RunnerContext, name: string): Promise<void>;
  database(context: RunnerContext, name: string): Promise<{ name: string; oid: string; owner: string }>;
  migrate(context: RunnerContext, name: string): Promise<void>;
  migrationDigest(): Promise<string>;
  sourceDigest(files: string[]): Promise<string>;
  identity(receipt: FixtureReceipt, app: boolean): Promise<DatabaseIdentity>;
  child(partition: Partition, receipt?: FixtureReceipt): Promise<{ exitCode: number; report: unknown; startedAt: number; finishedAt: number }>;
  evidence(partition: Partition, result: Record<string, unknown>): Promise<void>;
}
/** Serializable controller, no resource deletion. The owning hosted job retires its service. */
export async function runFixtureLane(lane: FixtureLane, files: string[], env: FixtureEnv, adapters: LifecycleAdapters, required: RequiredSuite[], root: string): Promise<void> {
  validateFixtureManifest(required);
  const context = runnerContext(env);
  const partitions = partitionInventory(lane, files);
  const migrations = await adapters.migrationDigest();
  const sources = new Map(await Promise.all(partitions.map(async part => [part.key, await adapters.sourceDigest(part.files)] as const)));
  const service = await adapters.inspect(context);
  const serviceCreatedAt = await adapters.serviceCreatedAt(context, service);
  verifyService(context, service, serviceCreatedAt, adapters.now());
  for (const partition of partitions) {
    const fixtureId = randomUUID();
    await adapters.reserve(partition, fixtureId); // Exclusive evidence output BEFORE SQL.
    let state = "service_verified";
    let receipt: FixtureReceipt | undefined;
    let primary: unknown;
    try {
      if (partition.isolated || lane !== "integration") {
        const cluster = await adapters.cluster(context); // exact container-local read-only route
        insist(/^\d+$/.test(cluster.systemIdentifier) && cluster.owner === "allura"
          && cluster.version >= 160000 && cluster.version < 170000, "bootstrap cluster identity");
        const name = `allura_fixture_${fixtureId.replaceAll("-", "")}`;
        insist(!await adapters.exists(context, name), "database collision");
        await adapters.create(context, name); // NOT IF NOT EXISTS; collision failure cannot adopt a DB.
        state = "database_created";
        const database = { ...await adapters.database(context, name), systemIdentifier: cluster.systemIdentifier };
        insist(database.name === name && /^\d+$/.test(database.oid) && database.owner === cluster.owner, "created database identity");
        await adapters.migrate(context, name); // Serial: migrations create cluster roles.
        state = "migrations_verified";
        receipt = { version: 1, context, serviceCreatedAt, createdAt: adapters.now(), fixtureId,
          suite: partition.key, suiteDigest: sources.get(partition.key)!,
          migrationDigest: migrations, service, database, state: "client_identity_verified" };
        verifyIdentity(await adapters.identity(receipt, false), database, false);
        verifyIdentity(await adapters.identity(receipt, true), database, true);
        state = "client_identity_verified";
      }
      const current = await adapters.inspect(context);
      verifyService(context, current, serviceCreatedAt, adapters.now());
      insist(digest(JSON.stringify(current)) === digest(JSON.stringify(service)), "service changed before child");
      insist(await adapters.migrationDigest() === migrations && await adapters.sourceDigest(partition.files) === sources.get(partition.key), "source changed during setup");
      state = "child_running";
      const result = await adapters.child(partition, receipt);
      state = "child_closed";
      insist(result.exitCode === 0, `child exited ${result.exitCode}`);
      validatePartitionReport(result.report, partition, required, root, result.startedAt, result.finishedAt);
    } catch (error) { primary = error; }
    try {
      await adapters.evidence(partition, { state, receipt, success: primary === undefined,
        // SQL/process exceptions may contain payloads; public evidence deliberately records only the failed state.
        failure: primary === undefined ? undefined : "fixture lifecycle or child verification failed", teardown: "owned job service; no in-test deletion" });
    } catch (error) {
      if (primary !== undefined) throw new AggregateError([primary, error], "fixture failed and evidence could not be saved");
      throw error;
    }
    if (primary !== undefined) throw primary;
  }
}
