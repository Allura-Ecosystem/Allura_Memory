import { test, expect } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authenticateHuman } from '../src/authentication.ts';
import { migrate } from '../src/persistence.ts';
import * as current from '../src/runs.ts';

const pin = '5b3e8815adf5211e70beb7130ac31ffb7d4d363a';
test('run revision four upgrade preserves genuine revision three decisions and refuses old handoff', async () => {
  const target = process.env.ALLURA_DISPOSABLE_DB_URL;
  if (!target || new URL(target).hostname !== '127.0.0.1' || process.env.ALLURA_DISPOSABLE_DB !== 'owned-test-container') { throw new Error('Requires owned disposable runner'); }
  const root = new URL('../../', import.meta.url).pathname, exported = await mkdtemp(join(tmpdir(), 'allura-resume-upgrade-'));
  const hashes: Record<string, string> = {};
  const admin = new SQL(target, { max: 1 }), database = `run_resume_upgrade_${randomUUID().replaceAll('-', '')}`;
  let f: Awaited<ReturnType<typeof import('./lifecycle-fixture.ts').fixture>> | undefined, created = false;
  try {
    const archive = Bun.spawnSync(['git','archive',pin,'foundation'], { cwd: root }); expect(archive.exitCode).toBe(0);
    expect(Bun.spawnSync(['tar','-x','-C',exported], { stdin: archive.stdout }).exitCode).toBe(0);
    const files = Bun.spawnSync(['git','ls-tree','-r','--name-only',pin,'foundation'], { cwd: root }); expect(files.exitCode).toBe(0);
    for (const path of files.stdout.toString().trim().split('\n')) {
      const original = Bun.spawnSync(['git','show',`${pin}:${path}`], { cwd: root }); expect(original.exitCode).toBe(0);
      const bytes = Buffer.from(await Bun.file(join(exported,path)).arrayBuffer()); expect(bytes.equals(original.stdout)).toBe(true);
      hashes[path] = createHash('sha256').update(bytes).digest('hex');
    }
    console.log(JSON.stringify({ revisionThreeExport: exported, pin, archiveSha256: createHash('sha256').update(archive.stdout).digest('hex'), hashes }));
    await symlink(join(root,'foundation/node_modules'), join(exported,'foundation/node_modules'));
    await admin.unsafe(`CREATE DATABASE ${database}`); created = true;
    const url = new URL(target); url.pathname = `/${database}`;
    const legacy = await import(join(exported,'foundation/src/runs.ts')) as typeof current;
    const oldFixture = await import(join(exported,'foundation/tests/lifecycle-fixture.ts')) as typeof import('./lifecycle-fixture.ts');
    const persistence = await import(join(exported,'foundation/src/persistence.ts')) as typeof import('../src/persistence.ts');
    const contract = await import(join(exported,'foundation/src/run-contract.ts')) as typeof import('../src/run-contract.ts');
    const executor = await import(join(exported,'foundation/src/run-execution.ts')) as typeof import('../src/run-execution.ts');
    f = await oldFixture.fixture(`allura-resume-upgrade-${randomUUID()}`,url.toString());
    const fixture = f;
    await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.reviewer}::uuid`;
    expect((await f.owner`SELECT count(*)::int AS n FROM allura.schema_migrations`)[0].n).toBe(27);
    const text = 'Genuine revision3 evidence';
    const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 3, goal: 'Historical decisions', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
    const history: { mode: string; v: typeof input; start: string; command: { runId: string; expectedRevision: number; operationKey: string }; advance: string | undefined; decision: string | undefined; decisionCommand: object | undefined; claim: import('../src/run-execution.ts').PreparationClaim | undefined }[] = [];
    for (const mode of ['ready','paused','approved','rejected','expired-claim','valid-claim']) {
      const v = { ...input, operationKey: randomUUID() }, start = await legacy.startRun(f.app,f.identities.author,f.scope,v);
      const runId = JSON.parse(start).runId as string, command = { runId, expectedRevision: 1, operationKey: randomUUID() };
      let advance: string | undefined, decision: string | undefined, decisionCommand: object | undefined, claim: import('../src/run-execution.ts').PreparationClaim | undefined;
      if (mode.endsWith('claim')) {
        const result = await persistence.scopedTransaction(f.app,f.identities.author,f.scope,'workspace:grants:manage', async tx => (await tx`SELECT allura.claim_run_prepare(${fixture.scope.groupId},${fixture.scope.workspaceId}::uuid,${command}::jsonb,${await contract.runDefinition()}::jsonb,${randomUUID()}::uuid) AS result`)[0].result);
        advance = result.receipt; claim = result.claim;
      } else if (mode !== 'ready') {
        advance = await legacy.advanceRun(f.app,f.identities.author,f.scope,command);
        if (mode !== 'paused') {
          const a = JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${runId}::uuid`)[0].request_text);
          decisionCommand = { runId, expectedRevision: a.requestedAtRevision, operationKey: randomUUID(), approvalRequestId: a.id, reviewedEvidenceDigest: a.evidenceDigest, decision: mode === 'approved' ? 'approve' : 'reject', rationale: 'Original revision3 review' };
          decision = await legacy.decideRun(f.app,f.identities.reviewer,f.scope,decisionCommand);
        }
      }
      history.push({ mode, v, start, command, advance, decision, decisionCommand, claim });
    }
    const tables = ['run_definitions','run_records','run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions'];
    async function snapshot() { return Promise.all(tables.map(async table => [...await fixture.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t ORDER BY 1`)])); }
    const before = await snapshot();
    await migrate(f.owner);
    const identity = authenticateHuman({ assertion: f.jwt('author') }, f.humanConfig), reviewer = authenticateHuman({ assertion: f.jwt('reviewer') }, f.humanConfig);
    // Required RED: actual current parser rejects revision4, not a new import.
    const fresh = await current.startRun(f.app,identity,f.scope,{ ...input, operationKey: randomUUID(), definitionRevision: 6 });
    expect(JSON.parse(fresh).phaseAtAcceptance).toBe('ready');
    for (const h of history) {
      expect(await current.startRun(f.app,identity,f.scope,h.v)).toBe(h.start);
      if (h.advance) { expect(await current.advanceRun(f.app,identity,f.scope,h.command)).toBe(h.advance); }
      if (h.decision) { expect(await current.decideRun(f.app,reviewer,f.scope,h.decisionCommand)).toBe(h.decision); }
    }
    // Compare every old column/value; additive nullable fields are not history.
    const after = await snapshot();
    for (let i=0;i<tables.length;i++) {
      const originals = before[i]!.map(row => JSON.parse(row.row));
      const originalKeys = Object.keys(originals[0] ?? {});
      const projected = after[i]!.map(row => JSON.parse(row.row)).filter(row => tables[i] === 'run_definitions' ? row.revision === 3 : tables[i] === 'run_records' ? row.definition_revision === 3 : history.some(h => h.command.runId === row.run_id)).map(row => Object.fromEntries(originalKeys.map(key => [key,row[key]])));
      expect(projected.map(row => JSON.stringify(row)).sort()).toEqual(originals.map(row => JSON.stringify(row)).sort());
    }
    const valid = history.find(h => h.mode === 'valid-claim')!;
    const originalLease=(await f.owner`SELECT lease_until FROM allura.run_steps WHERE run_id=${valid.command.runId}::uuid AND step_id='prepare'`)[0].lease_until;
    expect((await f.owner`SELECT lease_until>clock_timestamp() AS valid FROM allura.run_steps WHERE run_id=${valid.command.runId}::uuid AND step_id='prepare'`)[0].valid).toBe(true);
    await executor.finishPreparation(f.app,f.identities.author,f.scope,valid.claim!);
    expect((await f.owner`SELECT ${originalLease}::timestamptz>clock_timestamp() AS valid`)[0].valid).toBe(true);
    console.log(JSON.stringify({revisionThreeOriginalWorker:pin,validBeforeAndAfter:true,runId:valid.command.runId}));
    for(const table of ['run_effect_receipts','run_approval_requests','run_approval_decisions']){expect(await f.owner.unsafe(`SELECT id FROM allura.${table} WHERE run_id=$1::uuid`,[valid.command.runId])).toHaveLength(0);}
    const paused=history.find(h=>h.mode==='paused')!;
    const a=JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${paused.command.runId}::uuid`)[0].request_text);
    const unchanged=await snapshot();
    await expect(current.decideRun(f.app,reviewer,f.scope,{runId:paused.command.runId,expectedRevision:a.requestedAtRevision,operationKey:randomUUID(),approvalRequestId:a.id,reviewedEvidenceDigest:a.evidenceDigest,decision:'approve',rationale:'Unsupported new old decision'})).rejects.toThrow('conflict');
    expect(await snapshot()).toEqual(unchanged);
    expect((await f.owner`SELECT phase,reason FROM allura.run_state WHERE run_id=${valid.command.runId}::uuid`)[0]).toEqual({ phase:'blocked',reason:'definition_drift' });
    for (const h of history.filter(h => h.mode !== 'valid-claim')) {
      const state = (await f.owner`SELECT revision FROM allura.run_state WHERE run_id=${h.command.runId}::uuid`)[0];
      const cmd = { ...h.command, operationKey: randomUUID(), expectedRevision: state.revision };
      const resume = current as unknown as { resumeRun: typeof current.advanceRun };
      const beforeResume = await snapshot();
      if (h.mode === 'approved') {
        expect(JSON.parse(await resume.resumeRun(f.app,identity,f.scope,cmd)).phaseAtAcceptance).toBe('blocked');
        expect((await f.owner`SELECT phase,reason,next_step_id FROM allura.run_state WHERE run_id=${h.command.runId}::uuid`)[0]).toEqual({phase:'blocked',reason:'definition_drift',next_step_id:'handoff'});
      } else {
        await expect(resume.resumeRun(f.app,identity,f.scope,cmd)).rejects.toThrow('conflict');
        expect(await snapshot()).toEqual(beforeResume);
      }
      expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${h.command.runId}::uuid AND step_id='handoff'`).toHaveLength(0);
    }
    const expired = history.find(h => h.mode === 'expired-claim')!;
    const [timing] = await f.owner`SELECT greatest(0,ceil(extract(epoch FROM(due_at-clock_timestamp()))*1000))::int AS ms FROM allura.run_steps WHERE run_id=${expired.command.runId}::uuid AND step_id='prepare'`;
    await Bun.sleep(timing.ms+10);
    expect((await f.owner`SELECT lease_until<=clock_timestamp() AS expired,due_at<=clock_timestamp() AS due FROM allura.run_steps WHERE run_id=${expired.command.runId}::uuid AND step_id='prepare'`)[0]).toEqual({expired:true,due:true});
    const stable = await snapshot();
    expect(await current.advanceRun(f.app,identity,f.scope,expired.command)).toBe(expired.advance!);
    expect(await snapshot()).toEqual(stable);
    console.log(JSON.stringify({revisionThreeExpiredReplay:{runId:expired.command.runId,expired:true,due:true,completeSnapshotUnchanged:true}}));
    await expect(current.startRun(f.app,identity,f.scope,{...input,operationKey:randomUUID()})).rejects.toThrow('conflict');
    const approved=history.find(h=>h.mode==='approved')!;
    for(const participant of [f.ids.author,f.ids.reviewer]) {
      await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`;
      try {
        await expect(current.startRun(f.app,identity,f.scope,approved.v)).rejects.toThrow('forbidden');
        await expect(current.advanceRun(f.app,identity,f.scope,approved.command)).rejects.toThrow('forbidden');
        await expect(current.decideRun(f.app,reviewer,f.scope,approved.decisionCommand)).rejects.toThrow('forbidden');
        expect(await snapshot()).toEqual(stable);
      } finally { await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`; }
    }
  } finally {
    await f?.close();
    try { if (created) { await admin.unsafe(`DROP DATABASE ${database} WITH (FORCE)`); expect(await admin`SELECT datname FROM pg_database WHERE datname=${database}`).toHaveLength(0); } } finally { await admin.close(); }
    for (const [path, hash] of Object.entries(hashes)) { expect(createHash('sha256').update(new Uint8Array(await Bun.file(join(exported,path)).arrayBuffer())).digest('hex')).toBe(hash); }
    await rm(exported,{ recursive:true,force:true });
    expect(await Bun.file(join(exported,'foundation/src/runs.ts')).exists()).toBe(false);
    console.log(JSON.stringify({ revisionThreeExportRemoved: exported }));
  }
}, 25000);
