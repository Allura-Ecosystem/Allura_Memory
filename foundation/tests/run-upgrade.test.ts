import { test, expect } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, symlink, rm, lstat, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authenticateHuman } from '../src/authentication.ts';
import { migrate } from '../src/persistence.ts';
import { startRun, advanceRun, decideRun } from '../src/runs.ts';

// Real pre-upgrade code and checksummed migrations; never synthesize legacy rows.
test('run real revision upgrade preserves legacy admission and admits current revision in the same workspace', async () => {
  const target = process.env.ALLURA_DISPOSABLE_DB_URL;
  if (!target || new URL(target).hostname !== '127.0.0.1' || process.env.ALLURA_DISPOSABLE_DB !== 'owned-test-container') { throw new Error('Requires owned disposable runner'); }
  await withRevisionOneSource(async exported => {
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
    const next = await startRun(f.app, identity, f.scope, { ...input, operationKey: randomUUID(), definitionRevision: 7 });
    expect(JSON.parse(next).phaseAtAcceptance).toBe('ready');
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(31);
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
  }
  });
}, 15000);

// This helper is also exercised without a database so allocation failures cannot
// be hidden behind fixture setup. Only the exact newly allocated path is owned.
async function withRevisionOneSource(work: (exported: string) => Promise<void>, options: { fault?: 'extract' | 'verify' | 'remove' | undefined; allocated?: (exported: string) => void } = {}) {
  const pin = '2856bbd1143535782fc12d1193520a84aa070726', root = new URL('../../', import.meta.url).pathname;
  const exported = await mkdtemp(join(tmpdir(), 'allura-run-upgrade-'));
  let extracted = false;
  const failures: unknown[] = [];
  const hashes: Record<string, string> = {};
  async function verifySource() {
    const tree = Bun.spawnSync(['git', 'ls-tree', '-r', '--name-only', pin, 'foundation'], { cwd: root });
    expect(tree.exitCode).toBe(0);
    const paths = tree.stdout.toString().trim().split('\n');
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const original = Bun.spawnSync(['git', 'show', `${pin}:${path}`], { cwd: root });
      expect(original.exitCode).toBe(0);
      const bytes = Buffer.from(await Bun.file(join(exported, path)).arrayBuffer());
      hashes[path] = createHash('sha256').update(bytes).digest('hex');
      if (!bytes.equals(original.stdout)) { throw new Error(`Legacy source mismatch: ${path}`); }
    }
  }
  try {
    options.allocated?.(exported);
    const archive = Bun.spawnSync(['git', 'archive', pin, 'foundation'], { cwd: root });
    expect(archive.exitCode).toBe(0);
    console.log(JSON.stringify({ revisionOneExport: exported, pin, archiveSha256: createHash('sha256').update(archive.stdout).digest('hex') }));
    const extract = Bun.spawnSync(['tar', '-x', '-C', exported], { stdin: options.fault === 'extract' ? Buffer.from('owned corrupt archive probe') : archive.stdout });
    console.log(JSON.stringify({ revisionOneExtraction: exported, exit: extract.exitCode, stderr: extract.stderr.toString() }));
    if (extract.exitCode !== 0) { throw new Error('Legacy extraction failed'); }
    extracted = true;
    await symlink(join(root, 'foundation/node_modules'), join(exported, 'foundation/node_modules'));
    expect((await lstat(join(exported, 'foundation/node_modules'))).isSymbolicLink()).toBe(true);
    if (options.fault === 'verify') { await appendFile(join(exported, 'foundation/src/runs.ts'), '\n// owned verification-failure probe\n'); }
    await verifySource();
    console.log(JSON.stringify({ revisionOneSourceVerified: exported, hashes }));
    await work(exported);
  } catch (error) { failures.push(error); }
  finally {
    try {
      if (extracted) { await verifySource(); }
    } catch (error) { failures.push(error); }
    finally {
      // Preserve provenance before deletion, including a failed initial check.
      console.log(JSON.stringify({ revisionOneSourceBeforeCleanup: exported, extracted, hashes, failures: failures.map(String) }));
      try {
        // rm unlinks the dependency symlink; it does not traverse its target.
        await rm(exported, { recursive: options.fault !== 'remove', force: true });
        await expect(lstat(exported)).rejects.toHaveProperty('code', 'ENOENT');
        console.log(JSON.stringify({ revisionOneExportRemoved: exported }));
      } catch (error) { failures.push(error); console.log(JSON.stringify({ revisionOneCleanupFailed: exported, error: String(error) })); }
    }
  }
  // A secondary verification/deletion failure must not replace the first error.
  if (failures.length) { throw failures[0]; }
}

test('run revision one owned export cleanup survives extraction verification and callback failures', async () => {
  const owned: string[] = [], observations: { fault: string; exported: string; exists: boolean }[] = [];
  const dependency = new URL('../node_modules/typescript/package.json', import.meta.url);
  const before = createHash('sha256').update(Buffer.from(await Bun.file(dependency).arrayBuffer())).digest('hex');
  try {
    for (const fault of ['success', 'extract', 'verify', 'callback'] as const) {
      let exported = '', calls = 0;
      const primary = new Error('Owned revision one callback failure');
      const run = withRevisionOneSource(async path => {
        calls++;
        expect(path).toBe(exported);
        expect(await Bun.file(join(path, 'foundation/src/runs.ts')).exists()).toBe(true);
        if (fault === 'callback') { throw primary; }
      }, { allocated: path => { exported = path; owned.push(path); }, fault: fault === 'extract' || fault === 'verify' ? fault : undefined });
      if (fault === 'success') { await run; }
      else if (fault === 'callback') { await expect(run).rejects.toBe(primary); }
      else { await expect(run).rejects.toThrow(fault === 'extract' ? 'Legacy extraction failed' : 'Legacy source mismatch'); }
      expect(calls).toBe(fault === 'extract' || fault === 'verify' ? 0 : 1);
      expect(exported).not.toBe('');
      const exists = await lstat(exported).then(() => true, error => { if (error.code !== 'ENOENT') { throw error; } return false; });
      observations.push({ fault, exported, exists });
      console.log(JSON.stringify({ revisionOneCleanupObservation: exported, fault, exists }));
    }
    expect(observations.map(({ fault, exists }) => ({ fault, exists }))).toEqual(['success', 'extract', 'verify', 'callback'].map(fault => ({ fault, exists: false })));
    for (const fault of ['allocated', 'callback-drift', 'post-verify', 'remove', 'callback-remove'] as const) {
      let exported = '', calls = 0;
      const primary = new Error(`Owned ${fault} failure`);
      const run = withRevisionOneSource(async path => {
        calls++;
        if (fault === 'callback-drift' || fault === 'post-verify') { await appendFile(join(path, 'foundation/src/runs.ts'), '\n// owned post-callback drift probe\n'); }
        if (fault === 'callback-drift' || fault === 'callback-remove') { throw primary; }
      }, { allocated: path => { exported = path; owned.push(path); if (fault === 'allocated') { throw primary; } }, fault: fault === 'remove' || fault === 'callback-remove' ? 'remove' : undefined });
      if (fault === 'post-verify') { await expect(run).rejects.toThrow('Legacy source mismatch'); }
      else if (fault === 'remove') { const error = await run.then(() => undefined, error => error); expect(error).toHaveProperty('path', exported); }
      else { await expect(run).rejects.toBe(primary); }
      expect(calls).toBe(fault === 'allocated' ? 0 : 1);
      if (fault === 'remove' || fault === 'callback-remove') {
        // A deliberately nonrecursive real rm fails on the owned nonempty tree.
        expect((await lstat(exported)).isDirectory()).toBe(true);
        console.log(JSON.stringify({ revisionOneCleanupDenialObserved: exported, fault }));
        await rm(exported, { recursive: true, force: true });
      }
      await expect(lstat(exported)).rejects.toHaveProperty('code', 'ENOENT');
      console.log(JSON.stringify({ revisionOneFailurePreserved: exported, fault, removed: true }));
    }
  } finally {
    // RED can leak; preserve the readback above before removing only these paths.
    for (const exported of owned) { await rm(exported, { recursive: true, force: true }); await expect(lstat(exported)).rejects.toHaveProperty('code', 'ENOENT'); }
    expect(createHash('sha256').update(Buffer.from(await Bun.file(dependency).arrayBuffer())).digest('hex')).toBe(before);
  }
}, 15000);

test('run revision three upgrade preserves genuine paused revision two evidence and refuses old execution', async () => {
  const target = process.env.ALLURA_DISPOSABLE_DB_URL;
  if (!target || new URL(target).hostname !== '127.0.0.1' || process.env.ALLURA_DISPOSABLE_DB !== 'owned-test-container') { throw new Error('Requires owned disposable runner'); }
  await withRevisionTwoSource(async exported => {
  const admin = new SQL(target, { max: 1 }), database = `run_decision_upgrade_${randomUUID().replaceAll('-', '')}`;
  await admin.unsafe(`CREATE DATABASE ${database}`); const url = new URL(target); url.pathname = `/${database}`;
  let f: Awaited<ReturnType<typeof import('./lifecycle-fixture.ts').fixture>> | undefined;
  try {
    const legacy = await import(join(exported, 'foundation/src/runs.ts')) as typeof import('../src/runs.ts');
    const oldFixture = await import(join(exported, 'foundation/tests/lifecycle-fixture.ts')) as typeof import('./lifecycle-fixture.ts');
    f = await oldFixture.fixture(`allura-decision-upgrade-${randomUUID()}`, url.toString());
    await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.reviewer}::uuid`;
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(26);
    const text = 'Actual revision two preparation';
    const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 2, goal: 'Preserve paused evidence', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
    const start = await legacy.startRun(f.app, f.identities.author, f.scope, input);
    const command = { runId: JSON.parse(start).runId, expectedRevision: 1, operationKey: randomUUID() };
    const advance = await legacy.advanceRun(f.app, f.identities.author, f.scope, command);
    expect((await f.owner`SELECT phase FROM allura.run_state WHERE run_id=${command.runId}::uuid`)[0].phase).toBe('paused_approval');
    const pendingInput = { ...input, operationKey: randomUUID() }, pending = JSON.parse(await legacy.startRun(f.app, f.identities.author, f.scope, pendingInput));
    const tables = ['run_definitions','run_records','run_effect_receipts','run_approval_requests','run_operation_receipts','run_journal'];
    const snapshots = await Promise.all(tables.map(async table => [...await f!.owner.unsafe(`SELECT (to_jsonb(t)-'approval_decision_id')::text AS row FROM allura.${table} t ORDER BY (to_jsonb(t)-'approval_decision_id')::text`)]));
    await migrate(f.owner);
    const identity = authenticateHuman({ assertion: f.jwt('author') }, f.humanConfig);
    // Revision3 must fail through the existing parser, not a missing import.
    const fresh = await startRun(f.app, identity, f.scope, { ...input, operationKey: randomUUID(), definitionRevision: 7 });
    expect(JSON.parse(fresh).phaseAtAcceptance).toBe('ready');
    expect(await startRun(f.app, identity, f.scope, input)).toBe(start);
    expect(await advanceRun(f.app, identity, f.scope, command)).toBe(advance);
    for (const changed of [{ ...input, goal: input.goal + ' ' }, { ...input, definitionRevision: 3 }, { ...input, reviewerPrincipalId: f.ids.author }, { ...input, operationKey: randomUUID() }]) { await expect(startRun(f.app, identity, f.scope, changed)).rejects.toThrow('run_conflict'); }
    await expect(advanceRun(f.app, identity, f.scope, { ...command, expectedRevision: 3 })).rejects.toThrow('run_conflict');
    for (const participant of [f.ids.author, f.ids.reviewer]) {
      for (const table of ['workspace_grants','memberships','identity_bindings']) {
        const where = table === 'identity_bindings' ? 'principal_id=$1::uuid' : 'principal_id=$1::uuid AND group_id=$2';
        const args = table === 'identity_bindings' ? [participant] : [participant, f.scope.groupId];
        await f.owner.unsafe(`UPDATE allura.${table} SET active=false WHERE ${where}`, args);
        try { await expect(startRun(f.app, identity, f.scope, input)).rejects.toThrow('forbidden'); await expect(advanceRun(f.app, identity, f.scope, command)).rejects.toThrow('forbidden'); }
        finally { await f.owner.unsafe(`UPDATE allura.${table} SET active=true WHERE ${where}`, args); }
      }
    }
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i]!;
      const rows = [...await f.owner.unsafe(`SELECT (to_jsonb(t)-'approval_decision_id')::text AS row FROM allura.${table} t ${table === 'run_definitions' ? 'WHERE revision=2' : table === 'run_records' ? 'WHERE definition_revision=2' : 'WHERE run_id IN ($1::uuid,$2::uuid)'} ORDER BY (to_jsonb(t)-'approval_decision_id')::text`, table === 'run_definitions' || table === 'run_records' ? [] : [command.runId, pending.runId])];
      expect(rows).toEqual(snapshots[i]!);
    }
    const blocked = await advanceRun(f.app, identity, f.scope, { runId: pending.runId, expectedRevision: 1, operationKey: randomUUID() }); expect(JSON.parse(blocked).phaseAtAcceptance).toBe('blocked');
    expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${pending.runId}::uuid`).toHaveLength(0);
    const reviewer = authenticateHuman({ assertion: f.jwt('reviewer') }, f.humanConfig);
    const [oldApproval] = await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${command.runId}::uuid`;
    const a = JSON.parse(oldApproval.request_text);
    await expect(decideRun(f.app, reviewer, f.scope, { runId: command.runId, expectedRevision: 3, operationKey: randomUUID(), approvalRequestId: a.id, reviewedEvidenceDigest: a.evidenceDigest, decision: 'approve', rationale: 'Cannot approve old bytes' })).rejects.toThrow('run_conflict');
    expect(await f.owner`SELECT id FROM allura.run_approval_decisions WHERE run_id=${command.runId}::uuid`).toHaveLength(0);
    const newCommand = { runId: JSON.parse(fresh).runId, expectedRevision: 1, operationKey: randomUUID() };
    await advanceRun(f.app, identity, f.scope, newCommand);
    expect((await f.owner`SELECT phase FROM allura.run_state WHERE run_id=${newCommand.runId}::uuid`)[0].phase).toBe('paused_approval');
    const [newApproval] = await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${newCommand.runId}::uuid`;
    const b = JSON.parse(newApproval.request_text);
    const decision = { runId: newCommand.runId, expectedRevision: 3, operationKey: randomUUID(), approvalRequestId: b.id, reviewedEvidenceDigest: b.evidenceDigest, decision: 'approve', rationale: 'Actual current exact evidence' };
    const receipt = await decideRun(f.app, reviewer, f.scope, decision);
    expect(JSON.parse(receipt).phaseAtAcceptance).toBe('ready'); expect(await decideRun(f.app, reviewer, f.scope, decision)).toBe(receipt);
    expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${newCommand.runId}::uuid`).toHaveLength(1);
    expect([...await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${command.runId}::uuid`]).toEqual([oldApproval]);
  } finally { await f?.close(); await admin.unsafe(`DROP DATABASE ${database} WITH (FORCE)`); expect(await admin`SELECT datname FROM pg_database WHERE datname=${database}`).toHaveLength(0); await admin.close(); }
  });
}, 15000);

// Only exports allocated by this invocation are removed. Shared node_modules is
// a symlink and rm unlinks it, never traversing the dependency target.
async function withRevisionTwoSource(work: (exported: string) => Promise<void>, fault?: 'extract' | 'verify') {
  const pin = 'e11891c5de928c655b03b2e3439736dc821bcf76', root = new URL('../../', import.meta.url).pathname;
  const exported = await mkdtemp(join(tmpdir(), 'allura-decision-upgrade-'));
  let verified = false;
  const hashes: Record<string,string> = {};
  async function verifySource() {
    const tree = Bun.spawnSync(['git', 'ls-tree', '-r', '--name-only', pin, 'foundation'], { cwd: root });
    expect(tree.exitCode).toBe(0);
    for (const path of tree.stdout.toString().trim().split('\n')) {
      const original = Bun.spawnSync(['git', 'show', `${pin}:${path}`], { cwd: root });
      expect(original.exitCode).toBe(0);
      const bytes = Buffer.from(await Bun.file(join(exported, path)).arrayBuffer());
      hashes[path] = createHash('sha256').update(bytes).digest('hex');
      if (!bytes.equals(original.stdout)) { throw new Error(`Legacy source mismatch: ${path}`); }
    }
  }
  try {
    const archive = Bun.spawnSync(['git', 'archive', pin, 'foundation'], { cwd: root });
    expect(archive.exitCode).toBe(0);
    console.log(JSON.stringify({ revisionTwoExport: exported, pin, archiveSha256: createHash('sha256').update(archive.stdout).digest('hex') }));
    const extract = Bun.spawnSync(['tar', '-x', '-C', exported], { stdin: fault === 'extract' ? Buffer.from('owned corrupt archive probe') : archive.stdout });
    console.log(JSON.stringify({ revisionTwoExtraction: exported, exit: extract.exitCode, stderr: extract.stderr.toString() }));
    if (extract.exitCode !== 0) { throw new Error('Legacy extraction failed'); }
    await symlink(join(root, 'foundation/node_modules'), join(exported, 'foundation/node_modules'));
    expect((await lstat(join(exported, 'foundation/node_modules'))).isSymbolicLink()).toBe(true);
    if (fault === 'verify') { await appendFile(join(exported, 'foundation/src/runs.ts'), '\n// owned verification-failure probe\n'); }
    await verifySource(); verified = true;
    console.log(JSON.stringify({ revisionTwoSourceVerified: exported, hashes }));
    await work(exported);
  } finally {
    try { if (verified) { await verifySource(); } }
    finally {
      // Hashes and failure logs survive even when extraction or verification fails.
      console.log(JSON.stringify({ revisionTwoSourceBeforeCleanup: exported, verified, hashes }));
      await rm(exported, { recursive: true, force: true });
      expect(await lstat(exported).then(() => true, () => false)).toBe(false);
      console.log(JSON.stringify({ revisionTwoExportRemoved: exported }));
    }
  }
}

test('run revision two owned export cleanup survives extraction verification and callback failures', async () => {
  for (const fault of ['extract','verify'] as const) {
    await expect(withRevisionTwoSource(async () => { throw new Error('Must not reach work'); }, fault)).rejects.toThrow(fault === 'extract' ? 'Legacy extraction failed' : 'Legacy source mismatch');
  }
  await expect(withRevisionTwoSource(async () => { throw new Error('Owned callback failure'); })).rejects.toThrow('Owned callback failure');
  await withRevisionTwoSource(async exported => { expect(await Bun.file(join(exported, 'foundation/src/runs.ts')).exists()).toBe(true); });
}, 15000);

type LegacyClaimFixture = Awaited<ReturnType<typeof import('./lifecycle-fixture.ts').fixture>>;
async function withRevisionTwoClaim(work: (f: LegacyClaimFixture, command: { runId: string; expectedRevision: number; operationKey: string }, admitted: { receipt: string; claim: import('../src/run-execution.ts').PreparationClaim }, exported: string) => Promise<void>) {
  const target = process.env.ALLURA_DISPOSABLE_DB_URL;
  if (!target || new URL(target).hostname !== '127.0.0.1' || process.env.ALLURA_DISPOSABLE_DB !== 'owned-test-container') { throw new Error('Requires owned disposable runner'); }
  await withRevisionTwoSource(async exported => {
    const admin = new SQL(target, { max: 1 }), database = `run_claim_upgrade_${randomUUID().replaceAll('-', '')}`;
    let f: LegacyClaimFixture | undefined, created = false;
    try {
      await admin.unsafe(`CREATE DATABASE ${database}`); created = true;
      const url = new URL(target); url.pathname = `/${database}`;
      const legacy = await import(join(exported, 'foundation/src/runs.ts')) as typeof import('../src/runs.ts');
      const oldFixture = await import(join(exported, 'foundation/tests/lifecycle-fixture.ts')) as typeof import('./lifecycle-fixture.ts');
      const persistence = await import(join(exported, 'foundation/src/persistence.ts')) as typeof import('../src/persistence.ts');
      const contract = await import(join(exported, 'foundation/src/run-contract.ts')) as typeof import('../src/run-contract.ts');
      f = await oldFixture.fixture(`allura-claim-upgrade-${randomUUID()}`, url.toString());
      await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.reviewer}::uuid`;
      expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(26);
      const text = 'Genuine outstanding revision two claim 🧠';
      const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 2, goal: 'Claim upgrade witness', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
      const start = await legacy.startRun(f.app, f.identities.author, f.scope, input);
      const command = { runId: JSON.parse(start).runId as string, expectedRevision: 1, operationKey: randomUUID() };
      const definition = await contract.runDefinition();
      expect(definition.revision).toBe(2); expect(definition.policy.leaseMs).toBe(10000); expect(definition.policy.stepDeadlineMs).toBe(2000);
      const current = f;
      const admitted = await persistence.scopedTransaction(f.app, f.identities.author, f.scope, 'workspace:grants:manage', async tx => (await tx`SELECT allura.claim_run_prepare(${current.scope.groupId},${current.scope.workspaceId}::uuid,${command}::jsonb,${definition}::jsonb,${randomUUID()}::uuid) AS result`)[0].result);
      expect(admitted.claim).not.toBeNull(); expect(JSON.parse(admitted.receipt).phaseAtAcceptance).toBe('running');
      expect((await f.owner`SELECT definition FROM allura.run_definitions WHERE group_id=${f.scope.groupId} AND revision=2`)[0].definition).toEqual(definition);
      expect((await f.owner`SELECT s.phase,st.state,st.attempts,st.fence,st.lease_until>clock_timestamp() AS valid FROM allura.run_state s JOIN allura.run_steps st USING(group_id,workspace_id,run_id) WHERE s.run_id=${command.runId}::uuid AND st.step_id='prepare'`)[0]).toEqual({ phase: 'running', state: 'leased', attempts: 1, fence: 1, valid: true });
      await work(f, command, admitted, exported);
    } finally {
      try { await f?.close(); }
      finally { try { if (created) { await admin.unsafe(`DROP DATABASE ${database} WITH (FORCE)`); expect(await admin`SELECT datname FROM pg_database WHERE datname=${database}`).toHaveLength(0); } } finally { await admin.close(); } }
    }
  });
}
async function claimSnapshot(f: LegacyClaimFixture) {
  return Promise.all(['run_definitions','run_records','run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests'].map(async table => [...await f.owner.unsafe(`SELECT ${table === 'run_journal' ? "(to_jsonb(t)-'approval_decision_id')" : 'to_jsonb(t)'}::text AS row FROM allura.${table} t ORDER BY 1`)]));
}

test('run expired revision two claim replays exact receipt without changing complete history', async () => {
  await withRevisionTwoClaim(async (f, command, admitted) => {
    const before = await claimSnapshot(f);
    // Wait for BOTH the real ten-second lease and original backoff; otherwise
    // a due-at rejection could conceal removal of the historical early return.
    const [timing] = await f.owner`SELECT ceil(extract(epoch FROM (due_at-clock_timestamp()))*1000)::int AS ms FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`;
    await Bun.sleep(timing.ms + 10);
    const [expired] = await f.owner`SELECT lease_until<=clock_timestamp() AS expired,due_at<=clock_timestamp() AS due FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`;
    expect(expired).toEqual({ expired: true, due: true });
    await migrate(f.owner);
    expect(await claimSnapshot(f)).toEqual(before);
    const identity = authenticateHuman({ assertion: f.jwt('author') }, f.humanConfig);
    expect(await advanceRun(f.app, identity, f.scope, command)).toBe(admitted.receipt);
    expect(await claimSnapshot(f)).toEqual(before);
    expect(await f.owner`SELECT seq FROM allura.run_journal WHERE run_id=${command.runId}::uuid AND approval_decision_id IS NOT NULL`).toHaveLength(0);
    expect(await f.owner`SELECT id FROM allura.run_approval_decisions WHERE run_id=${command.runId}::uuid`).toHaveLength(0);
    console.log(JSON.stringify({ expiredRevisionTwoReplay: command.runId, ...expired, receiptSha256: createHash('sha256').update(admitted.receipt).digest('hex'), completeSnapshotSha256: createHash('sha256').update(JSON.stringify(before)).digest('hex'), unchanged: true }));
  });
}, 15000);

test('run still-valid revision two claim original worker is blocked by revision guard after upgrade', async () => {
  await withRevisionTwoClaim(async (f, command, admitted, exported) => {
    const execution = await import(join(exported, 'foundation/src/run-execution.ts')) as typeof import('../src/run-execution.ts');
    const before = await claimSnapshot(f);
    const [lease] = await f.owner`SELECT lease_until FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`;
    await migrate(f.owner);
    expect(await claimSnapshot(f)).toEqual(before);
    const [valid] = await f.owner`SELECT ${lease.lease_until}::timestamptz>clock_timestamp() AS valid`;
    expect(valid.valid).toBe(true);
    // Both the identity and executor remain from the genuine pinned module graph;
    // the worker recomputes its ORIGINAL definition, not the current revision3.
    await execution.finishPreparation(f.app, f.identities.author, f.scope, admitted.claim);
    expect((await f.owner`SELECT ${lease.lease_until}::timestamptz>clock_timestamp() AS valid`)[0].valid).toBe(true);
    expect((await f.owner`SELECT phase,reason,revision FROM allura.run_state WHERE run_id=${command.runId}::uuid`)[0]).toEqual({ phase: 'blocked', reason: 'definition_drift', revision: 3 });
    expect((await f.owner`SELECT state,attempts,fence,lease_id,invocation_id,lease_until,due_at FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`)[0]).toEqual({ state: 'blocked', attempts: 1, fence: 1, lease_id: null, invocation_id: null, lease_until: null, due_at: null });
    expect((await f.owner`SELECT kind,reason FROM allura.run_journal WHERE run_id=${command.runId}::uuid ORDER BY seq DESC LIMIT 1`)[0]).toEqual({ kind: 'blocked', reason: 'definition_drift' });
    for (const table of ['run_effect_receipts','run_approval_requests','run_approval_decisions']) { expect(await f.owner.unsafe(`SELECT id FROM allura.${table} WHERE run_id=$1::uuid`, [command.runId])).toHaveLength(0); }
    expect((await f.owner`SELECT receipt_text FROM allura.run_operation_receipts WHERE id=${admitted.claim.operationReceiptId}::uuid`)[0].receipt_text).toBe(admitted.receipt);
    console.log(JSON.stringify({ validRevisionTwoFinish: command.runId, validBeforeAndAfter: true, originalWorker: 'e11891c5de928c655b03b2e3439736dc821bcf76', outcome: 'blocked/definition_drift', effectsRequestsDecisions: 0 }));
  });
}, 15000);
