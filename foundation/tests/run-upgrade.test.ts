import { test, expect } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authenticateHuman } from '../src/authentication.ts';
import { migrate } from '../src/persistence.ts';
import { startRun, advanceRun } from '../src/runs.ts';

// Real pre-upgrade code and checksummed migrations; never synthesize legacy rows.
test('run real revision upgrade preserves legacy admission and admits revision two in the same workspace', async () => {
  const target = process.env.ALLURA_DISPOSABLE_DB_URL;
  if (!target || new URL(target).hostname !== '127.0.0.1' || process.env.ALLURA_DISPOSABLE_DB !== 'owned-test-container') { throw new Error('Requires owned disposable runner'); }
  const pin = '2856bbd1143535782fc12d1193520a84aa070726';
  const root = new URL('../../', import.meta.url).pathname;
  const exported = await mkdtemp(join(tmpdir(), 'allura-run-upgrade-'));
  const archive = Bun.spawnSync(['git', 'archive', pin, 'foundation'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  expect(archive.exitCode).toBe(0);
  const extract = Bun.spawnSync(['tar', '-x', '-C', exported], { stdin: archive.stdout, stdout: 'pipe', stderr: 'pipe' });
  expect(extract.exitCode).toBe(0);
  await symlink(join(root, 'foundation/node_modules'), join(exported, 'foundation/node_modules'));
  const sourceFiles = Bun.spawnSync(['git', 'ls-tree', '-r', '--name-only', pin, 'foundation'], { cwd: root }).stdout.toString().trim().split('\n');
  async function verifySource() {
    for (const path of sourceFiles) {
      const original = Bun.spawnSync(['git', 'show', `${pin}:${path}`], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
      if (original.exitCode !== 0 || !Buffer.from(await Bun.file(join(exported, path)).arrayBuffer()).equals(original.stdout)) { throw new Error(`Legacy source mismatch: ${path}`); }
    }
  }
  await verifySource();
  console.log(JSON.stringify({ legacySource: pin, export: exported, archiveSha256: createHash('sha256').update(archive.stdout).digest('hex'), sourceFiles: sourceFiles.length }));
  const admin = new SQL(target, { max: 1 });
  const database = `run_upgrade_${randomUUID().replaceAll('-', '')}`;
  await admin.unsafe(`CREATE DATABASE ${database}`);
  const url = new URL(target); url.pathname = `/${database}`;
  let f: Awaited<ReturnType<typeof import('./lifecycle-fixture.ts').fixture>> | undefined;
  try {
    const legacy = await import(join(exported, 'foundation/src/runs.ts')) as typeof import('../src/runs.ts');
    const oldFixture = await import(join(exported, 'foundation/tests/lifecycle-fixture.ts')) as typeof import('./lifecycle-fixture.ts');
    f = await oldFixture.fixture(`allura-upgrade-${randomUUID()}`, url.toString());
    await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.reviewer}::uuid`;
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(25);
    const text = 'Legacy genuine UTF8\r\nCafe\u0301 🧠';
    const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 1, goal: 'Upgrade witness', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
    const oldReceipt = await legacy.startRun(f.app, f.identities.author, f.scope, input);
    expect(JSON.parse(oldReceipt).phaseAtAcceptance).toBe('ready');
    await expect(legacy.startRun(f.app, f.identities.author, f.scope, { ...input, operationKey: randomUUID(), definitionRevision: 2 })).rejects.toThrow('run_invalid');
    const before = await f.owner`SELECT row_to_json(r)::text AS record FROM allura.run_records r WHERE group_id=${f.scope.groupId}`;
    const definitions = await f.owner`SELECT row_to_json(d)::text AS definition FROM allura.run_definitions d WHERE group_id=${f.scope.groupId}`;
    await migrate(f.owner);
    const identity = authenticateHuman({ assertion: f.jwt('author') }, f.humanConfig);
    // Required RED: current revision-one-only production boundary rejects this.
    const next = await startRun(f.app, identity, f.scope, { ...input, operationKey: randomUUID(), definitionRevision: 2 });
    expect(JSON.parse(next).phaseAtAcceptance).toBe('ready');
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(26);
    expect(await startRun(f.app, identity, f.scope, input)).toBe(oldReceipt);
    await expect(startRun(f.app, identity, f.scope, { ...input, operationKey: randomUUID() })).rejects.toThrow('run_conflict');
    for (const changed of [{ ...input, goal: input.goal + ' ' }, { ...input, reviewerPrincipalId: f.ids.author }, { ...input, definitionRevision: 2 }]) {
      await expect(startRun(f.app, identity, f.scope, changed)).rejects.toThrow('run_conflict');
    }
    for (const participant of [f.ids.author, f.ids.reviewer]) {
      for (const table of ['workspace_grants', 'memberships', 'identity_bindings']) {
        await f.owner.unsafe(`UPDATE allura.${table} SET active=false WHERE ${table === 'identity_bindings' ? '' : 'group_id=$2 AND '}principal_id=$1::uuid`, table === 'identity_bindings' ? [participant] : [participant, f.scope.groupId]);
        try {
          await expect(startRun(f.app, identity, f.scope, input)).rejects.toThrow('forbidden');
          // Even a substituted active reviewer cannot authorize the historical read.
          await expect(startRun(f.app, identity, f.scope, { ...input, reviewerPrincipalId: f.ids.author })).rejects.toThrow('forbidden');
        } finally {
          await f.owner.unsafe(`UPDATE allura.${table} SET active=true WHERE ${table === 'identity_bindings' ? '' : 'group_id=$2 AND '}principal_id=$1::uuid`, table === 'identity_bindings' ? [participant] : [participant, f.scope.groupId]);
        }
      }
    }
    const oldCommand = { runId: JSON.parse(oldReceipt).runId, expectedRevision: 1, operationKey: randomUUID() };
    const blocked = await advanceRun(f.app, identity, f.scope, oldCommand);
    expect(JSON.parse(blocked).phaseAtAcceptance).toBe('blocked');
    expect(await advanceRun(f.app, identity, f.scope, oldCommand)).toBe(blocked);
    expect((await f.owner`SELECT phase,reason FROM allura.run_state WHERE run_id=${oldCommand.runId}::uuid`)[0]).toEqual({ phase: 'blocked', reason: 'definition_drift' });
    expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${oldCommand.runId}::uuid`).toHaveLength(0);
    expect(await f.owner`SELECT id FROM allura.run_approval_requests WHERE run_id=${oldCommand.runId}::uuid`).toHaveLength(0);
    const newCommand = { runId: JSON.parse(next).runId, expectedRevision: 1, operationKey: randomUUID() };
    await advanceRun(f.app, identity, f.scope, newCommand);
    expect((await f.owner`SELECT phase FROM allura.run_state WHERE run_id=${newCommand.runId}::uuid`)[0].phase).toBe('paused_approval');
    expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${newCommand.runId}::uuid`).toHaveLength(1);
    expect(await startRun(f.app, identity, f.scope, input)).toBe(oldReceipt);
    expect(await f.owner`SELECT row_to_json(r)::text AS record FROM allura.run_records r WHERE group_id=${f.scope.groupId} AND definition_revision=1`).toEqual(before);
    expect(await f.owner`SELECT row_to_json(d)::text AS definition FROM allura.run_definitions d WHERE group_id=${f.scope.groupId} AND revision=1`).toEqual(definitions);
  } finally {
    await f?.close();
    await admin.unsafe(`DROP DATABASE ${database} WITH (FORCE)`);
    expect(await admin`SELECT datname FROM pg_database WHERE datname=${database}`).toHaveLength(0);
    await admin.close();
    await verifySource();
  }
}, 15000);
