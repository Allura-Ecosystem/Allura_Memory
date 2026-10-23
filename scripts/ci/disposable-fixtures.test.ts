import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { type LifecycleAdapters, type Partition, partitionInventory, runFixtureLane, validateFixtureManifest, validatePartitionReport } from "./disposable-fixture-runner";
import { childEnvironment, childGuardAdapters, type Command, FixtureCommandError, inspectService, main, migrationManifest, readClientIdentity, reserveArtifactDirectory, runtimeAdapters } from "./run-disposable-fixtures";
import {
  type DatabaseIdentity, FIXTURE_SUITES, type FixtureEnv, type FixtureLane, type FixtureReceipt,
  fixturesForLane, freshFixtureScope, type GuardAdapters, guardFixture, runnerContext, type ServiceObservation, verifyIdentity,
} from "../../tests/fixtures/disposable-postgres";
import required from "../../tests/fixtures/required-live-assertions.json";

// Accidental use of a live adapter must fail before connecting or launching a process.
vi.mock("pg", () => ({ Client: vi.fn(() => { throw new Error("FORBIDDEN real PG client"); }), Pool: vi.fn(() => { throw new Error("FORBIDDEN real PG pool"); }) }));
vi.mock("node:child_process", () => ({ spawn: vi.fn(() => { throw new Error("FORBIDDEN process launch"); }) }));
const now = Date.parse("2026-10-22T12:00:00Z");
function environment(): FixtureEnv {
  return { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted", GITHUB_REPOSITORY: "Allura-Ecosystem/Allura_Memory",
    GITHUB_SHA: "a".repeat(40), GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2", GITHUB_JOB: "test-e2e",
    ALLURA_FIXTURE_REPOSITORY: "Allura-Ecosystem/Allura_Memory", ALLURA_FIXTURE_SHA: "a".repeat(40),
    ALLURA_FIXTURE_RUN_ID: "123", ALLURA_FIXTURE_RUN_ATTEMPT: "2", ALLURA_FIXTURE_JOB: "test-e2e",
    ALLURA_FIXTURE_SERVICE_ID: "b".repeat(64), ALLURA_FIXTURE_SERVICE_NETWORK: "github_network_fixture", ALLURA_FIXTURE_SERVICE_PORT: "55432",
    POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "55432", POSTGRES_DB: `allura_fixture_${"c".repeat(32)}`,
    POSTGRES_USER: "allura", POSTGRES_PASSWORD: "owner-fixture", POSTGRES_APP_USER: "allura_app", POSTGRES_APP_PASSWORD: "app-fixture" };
}
function service(): ServiceObservation {
  return { id: "b".repeat(64), image: "pgvector/pgvector:pg16", imageId: `sha256:${"d".repeat(64)}`,
    created: new Date(now - 5000).toISOString(), running: true,
    labels: { "allura.fixture.repository": "Allura-Ecosystem/Allura_Memory", "allura.fixture.run": "123", "allura.fixture.attempt": "2", "allura.fixture.job": "test-e2e" },
    network: "github_network_fixture", networkId: "e".repeat(64), ports: [{ host: "0.0.0.0", port: "55432" }], binds: [], volumesFrom: [],
    mounts: [{ type: "volume", name: "f".repeat(64), destination: "/var/lib/postgresql/data", rw: true }],
    volumes: [{ name: "f".repeat(64), created: new Date(now - 5000).toISOString(), driver: "local", scope: "local", options: null }] };
}
function receipt(): FixtureReceipt {
  return { version: 1, context: runnerContext(environment()), serviceCreatedAt: now - 5000, createdAt: now - 1000,
    fixtureId: "12345678-1234-4234-9234-123456789012", suite: FIXTURE_SUITES[0], suiteDigest: "source", migrationDigest: "migrations",
    service: service(), database: { name: environment().POSTGRES_DB!, oid: "17001", owner: "allura", systemIdentifier: "1234567890" }, state: "client_identity_verified" };
}
function identity(r = receipt(), app = false): DatabaseIdentity {
  return { ...r.database, sessionUser: app ? "allura_app" : "allura", currentUser: app ? "allura_app" : "allura", version: 160004,
    superuser: !app, bypassRls: !app, createDb: !app, createRole: !app, replication: !app, memberOfOwner: !app, protections: true };
}
function guard(r = receipt()): GuardAdapters {
  return { now: () => now, receipt: vi.fn(async () => r), sourceDigest: vi.fn(async () => "source"), migrationDigest: vi.fn(async () => "migrations"),
    claim: vi.fn(async () => undefined), inspect: vi.fn(async () => service()), identity: vi.fn(async (record, app) => identity(record, app)) };
}
function report(partition: Partition) {
  const testResults = partition.files.map(file => ({ name: join(process.cwd(), file), status: "passed",
    assertionResults: (required.find(item => item.file === file)?.requiredAssertions ?? ["remainder assertion"]).map(fullName => ({ fullName, status: "passed" })) }));
  const count = testResults.reduce((sum, file) => sum + file.assertionResults.length, 0);
  return { success: true, startTime: now, numFailedTestSuites: 0, numPassedTests: count, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numTotalTests: count, testResults };
}
function lifecycle(): LifecycleAdapters {
  return { now: () => now, inspect: vi.fn(async () => service()), serviceCreatedAt: vi.fn(async () => now - 5000),
    reserve: vi.fn(async () => undefined), cluster: vi.fn(async () => ({ systemIdentifier: "1234567890", owner: "allura", version: 160004 })),
    exists: vi.fn(async () => false), create: vi.fn(async () => undefined), database: vi.fn(async (_context, name) => ({ name, oid: "17001", owner: "allura" })),
    migrate: vi.fn(async () => undefined), migrationDigest: vi.fn(async () => "migrations"), sourceDigest: vi.fn(async () => "source"),
    identity: vi.fn(async (record, app) => identity(record, app)),
    child: vi.fn(async partition => ({ exitCode: 0, report: report(partition), startedAt: now, finishedAt: now + 1 })), evidence: vi.fn(async () => undefined) };
}
const run = (adapter: LifecycleAdapters) => runFixtureLane("e2e", [...fixturesForLane("e2e")], environment(), adapter, required, process.cwd());
const temporary: string[] = [];
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });

// Parse source without importing live suites or constructing their production dependencies.
function assertionNames(source: string): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node, parents: string[]): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && ["describe", "it"].includes(node.expression.text) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const path = [...parents, node.arguments[0].text];
      if (node.expression.text === "it") names.push(path.join(" "));
      else node.arguments.slice(1).forEach(arg => visit(arg, path));
      return;
    }
    ts.forEachChild(node, child => visit(child, parents));
  };
  visit(ts.createSourceFile("fixture.ts", source, ts.ScriptTarget.Latest, true), []);
  return names;
}

describe("disposable fixture safety", () => {
  it.each(["integration", "e2e", "live-db"] as FixtureLane[])("preserves %s canonical selection and isolates every registered file in its own child", async lane => {
    const config = await readFile(`vitest.config.${lane}.ts`, "utf8");
    const files = [...config.matchAll(/"([^"\n]+\.test\.ts)"/g)].map(match => match[1]);
    if (lane === "live-db") expect(files).toHaveLength(55);
    const parts = partitionInventory(lane, files);
    expect(parts.flatMap(part => part.files).sort()).toEqual([...files].sort());
    expect(parts.filter(part => part.isolated).map(part => part.files)).toEqual(fixturesForLane(lane).map(file => [file]));
    const adapter = lifecycle();
    await runFixtureLane(lane, files, environment(), adapter, required, process.cwd());
    expect(vi.mocked(adapter.child).mock.calls.map(([part]) => part)).toEqual(parts);
    const receipts = vi.mocked(adapter.child).mock.calls.map(([, r]) => r);
    const created = receipts.filter(r => r !== undefined);
    expect(new Set(created.map(r => r.database.name)).size).toBe(created.length);
    expect(created.length).toBe(lane === "integration" ? fixturesForLane(lane).length : parts.length);
    if (lane === "integration") expect(receipts.at(-1)).toBeUndefined();
  });
  it.each(["integration", "live-db"] as FixtureLane[])("routes the actual %s CLI through discovery and fixed child config", async lane => {
    const dir = await mkdtemp(join(tmpdir(), "allura-fixture-test-")); temporary.push(dir);
    const files = fixturesForLane(lane); const adapter = lifecycle();
    const execute = vi.fn<Command>(async (file, args) => {
      if (file === "git") return `${environment().GITHUB_SHA}\n`;
      expect(args).toContain(`vitest.config.${lane}.ts`); expect(args).toContain("--filesOnly");
      await writeFile(args.find(arg => arg.startsWith("--json="))!.slice(7), JSON.stringify(files.map(path => ({ file: join(process.cwd(), path) }))));
      return "";
    });
    const env = { ...environment(), ALLURA_FIXTURE_OWNER_USER: "allura", ALLURA_FIXTURE_OWNER_PASSWORD: "owner", ALLURA_FIXTURE_APP_USER: "allura_app", ALLURA_FIXTURE_APP_PASSWORD: "change-me-in-production" };
    await main([`--lane=${lane}`, `--artifact-dir=${join(dir, lane)}`], env, execute, () => adapter);
    expect(vi.mocked(adapter.child).mock.calls.map(([part]) => part.files)).toEqual(files.map(file => [file]));
    const r = { ...receipt(), suite: files[0] }; const part = { key: r.suite, files: [r.suite], isolated: true };
    const childCommand = vi.fn<Command>(async (_file, args, childEnv) => {
      expect(args).toContain(`vitest.config.${lane}.ts`); expect(args).toContain(r.suite);
      expect(childEnv.POSTGRES_URL).toBe(""); expect(childEnv.ALLURA_FIXTURE_RUNNER).toBe("1");
      await writeFile(args.find(arg => arg.startsWith("--outputFile="))!.slice(13), JSON.stringify(report(part)));
      return "";
    });
    const actual = runtimeAdapters(process.cwd(), dir, lane, env, childCommand);
    await actual.reserve(part, r.fixtureId);
    expect((await actual.child(part, r)).exitCode).toBe(0);
    expect(childCommand).toHaveBeenCalledOnce();
  });
  it("detects POSTGRES_URL mutation after validated identity and scrubs it from every child", async () => {
    const env = environment(); const assertion = await guardFixture(FIXTURE_SUITES[0], env, guard());
    env.POSTGRES_URL = "postgresql://unexpected.invalid/other";
    expect(assertion).toThrow("changed after validation");
    expect(childEnvironment(env, receipt()).POSTGRES_URL).toBe("");
    expect(childEnvironment(env).POSTGRES_URL).toBe("");
  });
  it("binds every registered fixture assertion without importing live suites or accepting history reset guards", async () => {
    expect(required.map(suite => suite.file).sort()).toEqual([...FIXTURE_SUITES].sort());
    for (const suite of required) {
      const source = await readFile(suite.file, "utf8");
      expect(assertionNames(source)).toEqual(suite.requiredAssertions);
      // The original atomic fixture intentionally asserts an FK-denied deletion.
      if (!FIXTURE_SUITES.slice(0, 4).includes(suite.file as typeof FIXTURE_SUITES[number]))
        expect(source).not.toMatch(/\b(?:DELETE\s+FROM|TRUNCATE|session_replication_role)\b/i);
      expect(source).toContain("requireDisposableFixture");
      expect(source).not.toMatch(/from ["']dotenv["']|describe\.skip|it\.skip|shouldRunE2E|dbAvailable/);
    }
  });
  it("refuses the explicit approved revision gap instead of counting missing or pending coverage", () => {
    const file = "src/__tests__/curator-pipeline.e2e.test.ts";
    const part = { key: file, files: [file], isolated: true };
    const result = report(part);
    const blocked = result.testResults[0].assertionResults.find(item => item.fullName.endsWith("createInsight second call SUPERSEDES first version"))!;
    expect(blocked).toBeDefined(); blocked.status = "failed";
    result.success = false; result.numFailedTests = 1; result.numPassedTests--;
    expect(() => validatePartitionReport(result, part, required, process.cwd(), now, now + 1)).toThrow("refused");
  });
  it("refuses missing hosted launch before receipt reads or connection construction", async () => {
    const adapter = guard();
    await expect(guardFixture(FIXTURE_SUITES[0], {}, adapter)).rejects.toThrow("hosted job");
    expect(adapter.receipt).not.toHaveBeenCalled(); expect(adapter.identity).not.toHaveBeenCalled();
  });
  it.each(["GITHUB_SHA", "GITHUB_RUN_ATTEMPT", "GITHUB_RUN_ID", "GITHUB_REPOSITORY", "GITHUB_JOB", "ALLURA_FIXTURE_SERVICE_ID", "ALLURA_FIXTURE_SERVICE_PORT"])("refuses invalid trusted context %s before SQL", async key => {
    const env = environment(); env[key] = "wrong"; const adapter = guard();
    await expect(guardFixture(FIXTURE_SUITES[0], env, adapter)).rejects.toThrow("refused");
    expect(adapter.identity).not.toHaveBeenCalled(); expect(adapter.inspect).not.toHaveBeenCalled();
  });
  const serviceCases: [string, (s: ServiceObservation) => void][] = [
    ["container ID", s => { s.id = "0".repeat(64); }], ["image", s => { s.image = "postgres:latest"; }],
    ["image digest", s => { s.imageId = "tag"; }], ["network", s => { s.network = "other"; }],
    ["published port", s => { s.ports[0].port = "5432"; }], ["remote binding", s => { s.ports[0].host = "203.0.113.1"; }],
    ["missing port", s => { s.ports = []; }], ["stopped service", s => { s.running = false; }],
    ["stale job", s => { s.labels["allura.fixture.job"] = "old"; }], ["stale attempt", s => { s.labels["allura.fixture.attempt"] = "1"; }],
    ["bind mount", s => { s.binds = ["/data:/var/lib/postgresql/data"]; }], ["volumes from", s => { s.volumesFrom = ["old"]; }],
    ["named volume", s => { s.mounts[0].name = "existing-data"; }], ["wrong PGDATA", s => { s.mounts[0].destination = "/other"; }],
    ["reused storage", s => { s.volumes[0].created = new Date(now - 86400_000).toISOString(); }],
    ["volume options", s => { s.volumes[0].options = { device: "/data" }; }], ["stale service", s => { s.created = new Date(now - 86400_000).toISOString(); }],
  ];
  it.each(serviceCases)("refuses %s provenance before any database operation", async (_name, change) => {
    const adapter = lifecycle(); const observed = service(); change(observed); vi.mocked(adapter.inspect).mockResolvedValue(observed);
    await expect(run(adapter)).rejects.toThrow("refused");
    expect(adapter.cluster).not.toHaveBeenCalled(); expect(adapter.create).not.toHaveBeenCalled(); expect(adapter.child).not.toHaveBeenCalled();
  });
  const receiptCases: [string, (r: FixtureReceipt) => void][] = [
    ["stale attempt", r => { r.context.attempt = "1"; }], ["wrong suite", r => { r.suite = FIXTURE_SUITES[1]; }],
    ["source mismatch", r => { r.suiteDigest = "changed"; }], ["migration mismatch", r => { r.migrationDigest = "changed"; }],
    ["expired receipt", r => { r.createdAt = now - 1800_001; }], ["default database", r => { r.database.name = "memory"; }],
    ["uncreated receipt", r => { r.state = "database_created" as FixtureReceipt["state"]; }],
  ];
  it.each(receiptCases)("refuses %s before connecting", async (_name, change) => {
    const r = receipt(); change(r); const adapter = guard(r);
    await expect(guardFixture(FIXTURE_SUITES[0], environment(), adapter)).rejects.toThrow("refused");
    expect(adapter.identity).not.toHaveBeenCalled(); expect(adapter.claim).not.toHaveBeenCalled();
  });
  it.each(["POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_APP_USER", "POSTGRES_APP_OPTIONS", "DATABASE_URL", "PGSERVICE", "POSTGRES_URL"])("refuses ambient or mismatched %s before connection", async key => {
    const env = environment(); env[key] = "unexpected"; const adapter = guard();
    await expect(guardFixture(FIXTURE_SUITES[0], env, adapter)).rejects.toThrow("refused"); expect(adapter.identity).not.toHaveBeenCalled();
  });
  it("checks both actual logins after provenance and detects environment mutation", async () => {
    const adapter = guard(); const env = environment(); const assertEnvironment = await guardFixture(FIXTURE_SUITES[0], env, adapter);
    expect(vi.mocked(adapter.identity).mock.calls.map(call => call[1])).toEqual([false, true]);
    expect(vi.mocked(adapter.claim).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(adapter.identity).mock.invocationCallOrder[0]);
    assertEnvironment(); env.POSTGRES_DB = "memory"; expect(assertEnvironment).toThrow("changed after validation");
  });
  it("refuses a reused launch before any connection", async () => {
    const adapter = guard(); vi.mocked(adapter.claim).mockRejectedValue(new Error("already consumed"));
    await expect(guardFixture(FIXTURE_SUITES[0], environment(), adapter)).rejects.toThrow("already consumed"); expect(adapter.identity).not.toHaveBeenCalled();
  });
  it("rechecks the observed service immediately before connecting", async () => {
    const adapter = guard(); const changed = service(); changed.imageId = `sha256:${"0".repeat(64)}`; vi.mocked(adapter.inspect).mockResolvedValue(changed);
    await expect(guardFixture(FIXTURE_SUITES[0], environment(), adapter)).rejects.toThrow("changed after launch"); expect(adapter.identity).not.toHaveBeenCalled();
  });
  it.each(["superuser", "bypassRls", "createDb", "createRole", "replication", "memberOfOwner"] as const)("refuses app privilege %s", flag => {
    const r = receipt(); const app = identity(r, true); app[flag] = true;
    expect(() => verifyIdentity(app, r.database, true)).toThrow("privileged app");
  });
  it.each(["name", "oid", "owner", "sessionUser", "currentUser", "systemIdentifier"] as const)("refuses client identity mismatch %s", key => {
    const r = receipt(); const owner = identity(r); owner[key] = "wrong";
    expect(() => verifyIdentity(owner, r.database, false)).toThrow("mismatch");
  });
  it("refuses weakened protections before launching the fixture child", async () => {
    const adapter = lifecycle(); vi.mocked(adapter.identity).mockImplementation(async (r, app) => ({ ...identity(r, app), protections: false }));
    await expect(run(adapter)).rejects.toThrow("protections"); expect(adapter.child).not.toHaveBeenCalled();
  });
  it("creates distinct databases in serial and records each completed child", async () => {
    const adapter = lifecycle(); await run(adapter);
    const creates = vi.mocked(adapter.create).mock.calls.map(call => call[1]);
    expect(creates).toHaveLength(7); expect(new Set(creates).size).toBe(7);
    expect(creates.every(name => /^allura_fixture_[a-f0-9]{32}$/.test(name))).toBe(true);
    expect(adapter.child).toHaveBeenCalledTimes(7); expect(adapter.evidence).toHaveBeenCalledTimes(7);
    expect(vi.mocked(adapter.create).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(adapter.migrate).mock.invocationCallOrder[0]);
    expect(vi.mocked(adapter.identity).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(adapter.child).mock.invocationCallOrder[0]);
    expect(vi.mocked(adapter.child).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(adapter.create).mock.invocationCallOrder[1]);
  });
  it("refuses a creation collision without migrations or cleanup", async () => {
    const adapter = lifecycle(); vi.mocked(adapter.exists).mockResolvedValue(true);
    await expect(run(adapter)).rejects.toThrow("collision"); expect(adapter.create).not.toHaveBeenCalled(); expect(adapter.migrate).not.toHaveBeenCalled();
    expect(adapter.evidence).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ state: "service_verified", success: false }));
  });
  it.each(["reserve", "create", "migrate", "identity"] as const)("propagates %s failure and never launches a child", async method => {
    const adapter = lifecycle(); vi.mocked(adapter[method]).mockRejectedValue(new Error(`${method} failed`));
    await expect(run(adapter)).rejects.toThrow(`${method} failed`); expect(adapter.child).not.toHaveBeenCalled();
    if (method === "reserve") expect(adapter.cluster).not.toHaveBeenCalled();
    if (method === "create") expect(adapter.migrate).not.toHaveBeenCalled();
  });
  it("propagates a nonzero child exit and stops the next suite", async () => {
    const adapter = lifecycle(); vi.mocked(adapter.child).mockImplementation(async p => ({ exitCode: 9, report: report(p), startedAt: now, finishedAt: now + 1 }));
    await expect(run(adapter)).rejects.toThrow("child exited 9"); expect(adapter.create).toHaveBeenCalledTimes(1);
  });
  it("retains the primary failure when evidence persistence also fails", async () => {
    const adapter = lifecycle(); const primary = new Error("migration failed"); const secondary = new Error("evidence failed");
    vi.mocked(adapter.migrate).mockRejectedValue(primary); vi.mocked(adapter.evidence).mockRejectedValue(secondary);
    try { await run(adapter); throw new Error("unexpected success"); } catch (error) { expect(error).toBeInstanceOf(AggregateError); expect((error as AggregateError).errors).toEqual([primary, secondary]); }
  });
  it("partitions exact canonical inventory without omission or duplicates", () => {
    const files = [...fixturesForLane("e2e"), "src/other.test.ts"];
    expect(partitionInventory("e2e", files).flatMap(p => p.files).sort()).toEqual([...files].sort());
    expect(partitionInventory("integration", [...fixturesForLane("integration"), "src/other.test.ts"])).toHaveLength(3);
  });
  it.each([[], [FIXTURE_SUITES[0]], [...FIXTURE_SUITES.slice(0, 3), FIXTURE_SUITES[0]]].map(files => [files]))("rejects empty, missing or duplicated file inventory %j", files => {
    expect(() => partitionInventory("e2e", files)).toThrow("refused");
  });
  it.each(["missing", "skipped", "empty", "counter", "extra file", "stale"])("rejects %s required report evidence", kind => {
    const part = partitionInventory("e2e", [...fixturesForLane("e2e")])[0]; const result = report(part);
    if (kind === "missing") result.testResults[0].assertionResults.pop();
    if (kind === "skipped") { result.testResults[0].assertionResults[0].status = "pending"; result.numPassedTests--; result.numPendingTests++; }
    if (kind === "empty") result.testResults = [];
    if (kind === "counter") result.numTotalTests++;
    if (kind === "extra file") result.testResults[0].name = join(process.cwd(), "extra.test.ts");
    if (kind === "stale") result.startTime = now - 1;
    expect(() => validatePartitionReport(result, part, required, process.cwd(), now, now + 1)).toThrow("refused");
  });
  it("keeps integration remainder free of newly supplied database credentials", () => {
    const child = childEnvironment({ ...environment(), ALLURA_FIXTURE_OWNER_PASSWORD: "owner", ALLURA_FIXTURE_APP_PASSWORD: "app", GITHUB_TOKEN: "secret" });
    expect(child.POSTGRES_PASSWORD).toBe(""); expect(child.POSTGRES_APP_PASSWORD).toBe(""); expect(child.DATABASE_URL).toBe("");
    expect(child.POSTGRES_URL).toBe(""); expect(child.GITHUB_TOKEN).toBeUndefined(); expect(child.ALLURA_FIXTURE_OWNER_PASSWORD).toBeUndefined(); expect(child.ALLURA_FIXTURE_RUNNER).toBe("1");
  });
  it("creates bounded fresh identities without resetting history", () => {
    const a = freshFixtureScope(); const b = freshFixtureScope();
    expect(a.groupId).not.toBe(b.groupId); expect(a.workspaceId).not.toBe(b.workspaceId);
    expect(a.groupId).toMatch(/^allura-/); expect(a.groupId.length).toBeLessThanOrEqual(64);
  });
  it("reads independent client identity using only read-only queries and closes it", async () => {
    const client = { connect: vi.fn(async () => undefined), query: vi.fn().mockResolvedValueOnce({ rows: [identity()] }).mockResolvedValueOnce({ rows: [{ id: "1234567890" }] }).mockResolvedValueOnce({ rows: [{ protections: true }] }), end: vi.fn(async () => undefined) };
    const factory = vi.fn(() => client);
    expect(await readClientIdentity(receipt(), false, environment(), factory)).toMatchObject({ systemIdentifier: "1234567890", protections: true });
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ options: "-c default_transaction_read_only=on", database: receipt().database.name }));
    expect(client.query.mock.calls.every(([sql]) => /^SELECT\b/.test(sql))).toBe(true); expect(client.end).toHaveBeenCalledOnce();
  });
  it("preserves identity query failure alongside close failure", async () => {
    const primary = new Error("identity failed"); const secondary = new Error("close failed");
    const client = { connect: vi.fn(async () => undefined), query: vi.fn().mockRejectedValue(primary), end: vi.fn().mockRejectedValue(secondary) };
    try { await readClientIdentity(receipt(), true, environment(), () => client); throw new Error("unexpected success"); }
    catch (error) { expect((error as AggregateError).errors).toEqual([primary, secondary]); }
  });
  it("binds receipt bytes to a private launch and consumes it once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "allura-fixture-test-")); temporary.push(dir);
    const path = join(dir, "receipt.json"); const body = JSON.stringify(receipt()); const key = "1".repeat(64);
    await writeFile(path, body);
    const env = { ...environment(), ALLURA_FIXTURE_RECEIPT: path, ALLURA_FIXTURE_LAUNCH_KEY: key, ALLURA_FIXTURE_RECEIPT_MAC: createHmac("sha256", key).update(body).digest("hex") };
    const adapter = childGuardAdapters(process.cwd(), env); expect(await adapter.receipt()).toEqual(receipt());
    await adapter.claim(); await expect(adapter.claim()).rejects.toThrow();
    await writeFile(path, body + " "); await expect(adapter.receipt()).rejects.toThrow("launch mismatch");
  });
  it("filters service inspection and targets exact container and anonymous volume IDs", async () => {
    const s = service(); const execute = vi.fn().mockResolvedValueOnce(JSON.stringify({ ...s,
      networks: { [s.network]: { NetworkID: s.networkId } }, ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "55432" }] },
      mounts: [{ Type: "volume", Name: s.mounts[0].name, Destination: s.mounts[0].destination, RW: true }] })).mockResolvedValueOnce(JSON.stringify(s.volumes[0]));
    expect(await inspectService(runnerContext(environment()), execute)).toEqual(s);
    expect(execute.mock.calls[0][1].at(-1)).toBe(s.id); expect(execute.mock.calls[1][1].at(-1)).toBe(s.mounts[0].name);
    expect(execute.mock.calls[0][1].join(" ")).not.toContain(".Config.Env");
  });
  it("uses only the exact container route and generated database for creation", async () => {
    const execute = vi.fn(async (..._args: Parameters<import("./run-disposable-fixtures").Command>) => "f\n");
    const adapter = runtimeAdapters(process.cwd(), "/unused", "e2e", {}, execute);
    const context = runnerContext(environment()); const name = receipt().database.name;
    expect(await adapter.exists(context, name)).toBe(false); await adapter.create(context, name);
    const creation = execute.mock.calls[1];
    expect(creation[1]).toEqual(["exec", "-i", context.serviceId, "env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", "/var/run/postgresql", "-p", "5432", "-U", "allura", "-d", "postgres", "-tA"]);
    expect(creation[3]).toBe(`CREATE DATABASE "${name}" OWNER "allura";`);
  });
  it("creates missing artifact parents but refuses an existing final reservation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "allura-fixture-test-")); temporary.push(dir);
    const target = join(dir, "nested", "attempt-2", "e2e");
    await reserveArtifactDirectory(target);
    await expect(reserveArtifactDirectory(target)).rejects.toThrow(/EEXIST/);
  });
  it.each(["missing", "empty", "duplicate file", "duplicate assertion"])("refuses %s required fixture manifest before lifecycle SQL", async kind => {
    const manifest = structuredClone(required);
    if (kind === "missing") manifest.pop();
    if (kind === "empty") manifest[0].requiredAssertions = [];
    if (kind === "duplicate file") manifest.push(manifest[0]);
    if (kind === "duplicate assertion") manifest[0].requiredAssertions.push(manifest[0].requiredAssertions[0]);
    expect(() => validateFixtureManifest(manifest)).toThrow();
    const adapter = lifecycle();
    await expect(runFixtureLane("e2e", [...fixturesForLane("e2e")], environment(), adapter, manifest, process.cwd())).rejects.toThrow();
    expect(adapter.inspect).not.toHaveBeenCalled(); expect(adapter.cluster).not.toHaveBeenCalled();
  });
  it("refuses unsafe identifiers before even the injected process adapter", async () => {
    const execute = vi.fn(async () => ""); const adapter = runtimeAdapters(process.cwd(), "/unused", "e2e", {}, execute);
    await expect(adapter.create(runnerContext(environment()), "memory")).rejects.toThrow("unsafe database");
    await expect(adapter.exists(runnerContext(environment()), "memory")).rejects.toThrow("unsafe database");
    expect(execute).not.toHaveBeenCalled();
  });
  it("refuses source mutation during setup before child launch", async () => {
    const adapter = lifecycle(); vi.mocked(adapter.migrationDigest).mockResolvedValueOnce("original").mockResolvedValue("changed");
    await expect(run(adapter)).rejects.toThrow("source changed"); expect(adapter.child).not.toHaveBeenCalled();
  });
  it("binds all existing migrations and all twelve live assertion identities", async () => {
    const manifest = await migrationManifest(process.cwd()); expect(manifest.files).toHaveLength(74); expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(required.slice(0, 4).map(suite => suite.requiredAssertions.length)).toEqual([7, 1, 2, 2]);
    for (const suite of required.slice(0, 4)) {
      const source = await readFile(suite.file, "utf8");
      const title = /describe\("([^"]+)"/.exec(source)![1];
      const names = [...source.matchAll(/  it\("([^"]+)"/g)].map(match => `${title} ${match[1]}`);
      expect(names).toEqual(suite.requiredAssertions);
      expect(source).not.toMatch(/session_replication_role|describe\.skip|dbAvailable|TRUNCATE/i);
      expect(source).toContain("requireDisposableFixture");
    }
  });
  it("launches the actual adapter child with fixed suite arguments and private receipt binding", async () => {
    const dir = await mkdtemp(join(tmpdir(), "allura-fixture-test-")); temporary.push(dir);
    const r = receipt(); const part = { key: r.suite, files: [r.suite], isolated: true };
    const execute = vi.fn<Command>(async (_file, args, env) => {
      expect(env.POSTGRES_DB).toBe(r.database.name);
      expect(env.ALLURA_FIXTURE_OWNER_PASSWORD).toBeUndefined(); expect(env.GITHUB_TOKEN).toBeUndefined();
      expect(await childGuardAdapters(process.cwd(), env).receipt()).toEqual(r);
      await writeFile(args.find(arg => arg.startsWith("--outputFile="))!.slice(13), JSON.stringify(report(part)));
      return "";
    });
    const adapter = runtimeAdapters(process.cwd(), dir, "e2e", { ...environment(), ALLURA_FIXTURE_OWNER_PASSWORD: "owner", ALLURA_FIXTURE_APP_PASSWORD: "app", GITHUB_TOKEN: "secret" }, execute);
    await adapter.reserve(part, r.fixtureId); const result = await adapter.child(part, r);
    expect(result.exitCode).toBe(0); expect(result.report).toEqual(report(part));
    expect(execute.mock.calls[0][1]).toEqual(["run", "test", "--config", "vitest.config.e2e.ts", r.suite,
      "--poolOptions.forks.singleFork", "--passWithNoTests=false", "--reporter=json", expect.stringContaining("--outputFile=")]);
  });
  it.each(["missing", "malformed", "nonzero with passing JSON", "rejected zero with passing JSON"])("rejects actual adapter child %s evidence", async mode => {
    const dir = await mkdtemp(join(tmpdir(), "allura-fixture-test-")); temporary.push(dir);
    const r = receipt(); const part = { key: r.suite, files: [r.suite], isolated: true };
    const execute = vi.fn<Command>(async (_file, args) => {
      const path = args.find(arg => arg.startsWith("--outputFile="))!.slice(13);
      if (mode === "malformed") await writeFile(path, "{");
      if (mode === "nonzero with passing JSON") { await writeFile(path, JSON.stringify(report(part))); throw new FixtureCommandError(9, "bun"); }
      if (mode === "rejected zero with passing JSON") { await writeFile(path, JSON.stringify(report(part))); throw new FixtureCommandError(0, "bun"); }
      return "";
    });
    const actual = runtimeAdapters(process.cwd(), dir, "e2e", environment(), execute);
    const controller = lifecycle(); controller.reserve = actual.reserve; controller.child = actual.child;
    const failure = mode === "nonzero with passing JSON" ? "child exited 9" : mode === "rejected zero with passing JSON" ? "child exited 1" : "report";
    await expect(run(controller)).rejects.toThrow(failure);
    expect(controller.create).toHaveBeenCalledTimes(1);
  });
  it("routes CLI file discovery through the exact isolated partition without executing live adapters", async () => {
    const dir = await mkdtemp(join(tmpdir(), "allura-fixture-test-")); temporary.push(dir);
    const target = join(dir, "new-parent", "e2e"); const adapter = lifecycle();
    const execute = vi.fn<Command>(async (file, args) => {
      if (file === "git") return `${environment().GITHUB_SHA}\n`;
      expect(args).toContain("--filesOnly"); expect(args).toContain("vitest.config.e2e.ts");
      await writeFile(args.find(arg => arg.startsWith("--json="))!.slice(7), JSON.stringify(fixturesForLane("e2e").map(path => ({ file: join(process.cwd(), path) }))));
      return "";
    });
    const env = { ...environment(), ALLURA_FIXTURE_OWNER_USER: "allura", ALLURA_FIXTURE_OWNER_PASSWORD: "owner", ALLURA_FIXTURE_APP_USER: "allura_app", ALLURA_FIXTURE_APP_PASSWORD: "change-me-in-production" };
    await main(["--lane=e2e", `--artifact-dir=${target}`], env, execute, () => adapter);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(vi.mocked(adapter.child).mock.calls.map(([part]) => part.files)).toEqual(fixturesForLane("e2e").map(file => [file]));
  });
});
