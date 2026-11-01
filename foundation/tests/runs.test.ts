import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { startRun, advanceRun } from '../src/runs.ts';
import { scopedTransaction } from '../src/persistence.ts';
import { runDefinition } from '../src/run-contract.ts';
import { finishPreparation, type PreparationClaim } from '../src/run-execution.ts';
import { type Scope } from '../src/authority.ts';
import { cp, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function processInput(scope: Scope, command: unknown) {
  return { url: f.appUrl, assertion: f.jwt('author'), issuer: f.humanConfig.issuer, publicKey: f.humanConfig.keys.get('key')!.export({ type: 'spki', format: 'pem' }), scope, command };
}
function child(payload: object) {
  return Bun.spawn([process.execPath, new URL('./run-process-fixture.ts', import.meta.url).pathname], { stdin: new Blob([JSON.stringify(payload)]), stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ALLURA_DISPOSABLE_DB: 'owned-test-container' } });
}
async function result(payload: object) {
  const p = child(payload), [stdout, stderr, exit] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (exit !== 0) { console.log(JSON.stringify({ childFailure: JSON.parse(stdout) })); }
  expect(stderr).toBe(''); expect(exit).toBe(0); return JSON.parse(stdout);
}
async function waitForBlock(waiter: number, blocker: number) {
  expect(waiter).not.toBe(blocker);
  for (let i = 0; i < 100; i++) {
    if ((await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS blocked`)[0].blocked) { console.log(JSON.stringify({ prepareLockWitness: { waiter, blocker } })); return; }
    await Bun.sleep(10);
  }
  throw new Error('Exact prepare waiter not observed');
}

test('run prepare SQL state and measurement constraints reject nullable forged evidence', async () => {
  const { scope, command } = await preparedInput(), c = await claim(scope, command);
  await expect(f.owner.begin(async tx => {
    await tx`UPDATE allura.run_state SET next_step_id=NULL WHERE run_id=${command.runId}::uuid`;
    throw new Error('nullable state accepted');
  })).rejects.toThrow('check constraint');
  const measurement = { artifactSha256: 'a'.repeat(64), artifactBytes: 3, expectedSha256: 'b'.repeat(64), measuredGates: [{ id: 'artifact_nonempty', passed: true }, { id: 'artifact_digest_match', passed: false }] };
  // Vary one field at a time: several invalid fields can mask SQL UNKNOWN.
  for (const field of Object.keys(measurement)) {
    await expect(f.owner.begin(async tx => {
      await tx`INSERT INTO allura.run_journal(group_id,workspace_id,run_id,seq,event_id,actor_id,kind,reason,receipt_id,created_at,step_id,attempt,fence,measurement) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${command.runId}::uuid,3,${randomUUID()}::uuid,${f.ids.author}::uuid,'terminated','gate_failed',${JSON.parse(c.receipt).id}::uuid,clock_timestamp(),'prepare',1,1,${{ ...measurement, [field]: null }}::jsonb)`;
      throw new Error(`nullable measurement accepted: ${field}`);
    })).rejects.toThrow('check constraint');
  }
});

test('run prepare retry due time and attempt exhaustion cannot reset through new keys', async () => {
  const { scope, command } = await preparedInput();
  let original = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const c = await claim(scope, command);
    if (attempt === 1) { original = c.receipt; } else { expect(c.receipt).toBe(original); }
    expect(c.claim!.fence).toBe(attempt);
    const [step] = await f.owner`SELECT attempts,extract(epoch FROM (due_at-lease_until))::int AS delay,extract(epoch FROM (lease_until-clock_timestamp())) AS remaining FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`;
    expect(step.attempts).toBe(attempt); expect(step.delay).toBe(attempt === 1 ? 1 : 2); expect(Number(step.remaining)).toBeGreaterThan(9);
    await expect(claim(scope, { ...command, expectedRevision: attempt + 1, operationKey: randomUUID() })).rejects.toThrow('conflict');
    const [due] = await f.owner`SELECT ceil(extract(epoch FROM (due_at-clock_timestamp()))*1000)::int AS ms FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`;
    await Bun.sleep(due.ms + 10);
  }
  const exhausted = await claim(scope, command); expect(exhausted.claim).toBeNull(); expect(exhausted.receipt).toBe(original);
  expect((await f.owner`SELECT phase,outcome,reason FROM allura.run_state WHERE run_id=${command.runId}::uuid`)[0]).toEqual({ phase: 'terminal', outcome: 'failed', reason: 'attempts_exhausted' });
  expect((await f.owner`SELECT attempts FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`)[0].attempts).toBe(3);
  expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`).toHaveLength(0);
}, 40000);

test('run prepare aborted work retains admission until real rollback and rejects excess leases', async () => {
  const first = await preparedInput(), scope = first.scope, commands = [first.command];
  for (let i = 0; i < 4; i++) { const r = JSON.parse(await startRun(f.app, f.identities.author, scope, input())); commands.push({ runId: r.runId, expectedRevision: 1, operationKey: randomUUID() }); }
  const claims: PreparationClaim[] = [];
  for (const command of commands.slice(0, 4)) { claims.push((await claim(scope, command)).claim!); }
  await expect(claim(scope, commands[4])).rejects.toThrow('unavailable');
  const apps = [new SQL(f.appUrl, { max: 1 }), new SQL(f.appUrl, { max: 1 })], gate = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 });
  let release = () => {}, holding: Promise<unknown> | undefined;
  const pending: Promise<unknown>[] = [];
  try {
    const pids = await Promise.all(apps.map(async a => (await a`SELECT pg_backend_pid() AS pid`)[0].pid as number)), gatePid = (await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    expect(new Set(pids).size).toBe(2);
    await f.owner.unsafe(`CREATE FUNCTION allura.prepare_budget_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.workspace_id='${scope.workspaceId}'::uuid THEN PERFORM pg_advisory_xact_lock(120027); END IF; RETURN NEW; END $$; CREATE TRIGGER prepare_budget_wait BEFORE INSERT ON allura.run_effect_receipts FOR EACH ROW EXECUTE FUNCTION allura.prepare_budget_wait()`);
    let ready = () => {}; const entered = new Promise<void>(r => { ready = r; }), wait = new Promise<void>(r => { release = r; });
    holding = gate.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(120027)`; ready(); await wait; }); await entered;
    const aborts = [new AbortController(), new AbortController()];
    for (let i = 0; i < 2; i++) { pending.push(finishPreparation(apps[i]!, f.identities.author, scope, claims[i]!, aborts[i]!.signal).then(() => 'unexpected', e => (e as Error).message)); }
    await waitForBlock(pids[0]!, gatePid); await waitForBlock(pids[1]!, gatePid);
    aborts.forEach(a => a.abort()); expect(await Promise.all(pending)).toEqual(['cancelled', 'cancelled']);
    await expect(finishPreparation(f.app, f.identities.author, scope, claims[2]!)).rejects.toThrow('busy');
    release(); await holding;
    await Promise.all(apps.map(async a => { await a`SELECT 1`; }));
    expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE workspace_id=${scope.workspaceId}::uuid`).toHaveLength(0);
    await f.owner.unsafe('DROP TRIGGER prepare_budget_wait ON allura.run_effect_receipts; DROP FUNCTION allura.prepare_budget_wait()');
    await finishPreparation(f.app, f.identities.author, scope, claims[2]!);
  } finally {
    release(); await Promise.allSettled([holding, ...pending]);
    await Promise.all(apps.map(a => a.close())); await gate.close();
    await f.owner.unsafe('DROP TRIGGER IF EXISTS prepare_budget_wait ON allura.run_effect_receipts; DROP FUNCTION IF EXISTS allura.prepare_budget_wait()');
  }
});

test('run prepare terminated backend reports unknown and leaves no partial effect', async () => {
  const { scope, command } = await preparedInput(), app = new SQL(f.appUrl, { max: 1 }), gate = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 });
  let release = () => {}, holding: Promise<unknown> | undefined, pending: Promise<unknown> | undefined;
  try {
    const pid = (await app`SELECT pg_backend_pid() AS pid`)[0].pid as number, gatePid = (await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    await f.owner.unsafe(`CREATE FUNCTION allura.prepare_kill_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid THEN PERFORM pg_advisory_xact_lock(120028); END IF; RETURN NEW; END $$; CREATE TRIGGER prepare_kill_wait BEFORE INSERT ON allura.run_approval_requests FOR EACH ROW EXECUTE FUNCTION allura.prepare_kill_wait()`);
    let ready = () => {}; const entered = new Promise<void>(r => { ready = r; }), wait = new Promise<void>(r => { release = r; });
    holding = gate.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(120028)`; ready(); await wait; }); await entered;
    pending = advanceRun(app, f.identities.author, scope, command).then(() => 'unexpected', e => (e as Error).message);
    await waitForBlock(pid, gatePid);
    expect((await f.owner`SELECT pg_terminate_backend(${pid}::int) AS killed`)[0].killed).toBe(true);
    expect(await pending).toBe('run_unknown'); release(); await holding;
    expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`).toHaveLength(0);
    expect(await f.owner`SELECT id FROM allura.run_approval_requests WHERE run_id=${command.runId}::uuid`).toHaveLength(0);
    expect((await f.owner`SELECT phase FROM allura.run_state WHERE run_id=${command.runId}::uuid`)[0].phase).toBe('running');
    expect(JSON.parse(await advanceRun(f.app, f.identities.author, scope, command)).phaseAtAcceptance).toBe('running');
  } finally {
    release(); await Promise.allSettled([holding, pending]); await app.close(); await gate.close();
    await f.owner.unsafe('DROP TRIGGER IF EXISTS prepare_kill_wait ON allura.run_approval_requests; DROP FUNCTION IF EXISTS allura.prepare_kill_wait()');
  }
});

test('run prepare fresh processes recover an expired claim and fence killed execution', async () => {
  const { scope, command } = await preparedInput(), payload = processInput(scope, command);
  const killed = child({ ...payload, mode: 'claim', hold: true });
  let c: PreparationClaim;
  try {
    const reader = killed.stdout.getReader();
    const first = await reader.read(); reader.releaseLock();
    const admitted = JSON.parse(new TextDecoder().decode(first.value));
    c = admitted.claim; expect(c.runId).toBe(command.runId);
    expect((await f.owner`SELECT phase FROM allura.run_state WHERE run_id=${command.runId}::uuid`)[0].phase).toBe('running');
  } finally { killed.kill('SIGKILL'); await killed.exited; }
  expect(killed.signalCode).toBe('SIGKILL');
  const before = await snapshot(command.runId);
  const pending = await result({ ...payload, mode: 'advance' });
  expect(JSON.parse(pending.receipt).phaseAtAcceptance).toBe('running'); expect(await snapshot(command.runId)).toEqual(before);
  // Database time, not a forged expiry or altered immutable row, owns recovery.
  const [due] = await f.owner`SELECT greatest(0,ceil(extract(epoch FROM (due_at-clock_timestamp()))*1000))::int AS ms FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`;
  await Bun.sleep(due.ms + 20);
  const recovered = await result({ ...payload, mode: 'advance' });
  expect(recovered.receipt).toBe(pending.receipt);
  expect((await f.owner`SELECT attempts,fence,state FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`)[0]).toEqual({ attempts: 2, fence: 2, state: 'completed' });
  await expect(finishPreparation(f.app, f.identities.author, scope, c!)).rejects.toThrow('conflict');
  const committed = await snapshot(command.runId);
  const retries = await Promise.all([result({ ...payload, mode: 'advance' }), result({ ...payload, mode: 'advance' })]);
  expect(retries.map(r => r.receipt)).toEqual([recovered.receipt, recovered.receipt]);
  expect(await snapshot(command.runId)).toEqual(committed);
  expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`).toHaveLength(1);
}, 20000);

test('run prepare actual source drift blocks both claim and completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'allura-prepare-drift-'));
  const source = new URL('../', import.meta.url).pathname;
  try {
    await cp(join(source, 'src'), join(root, 'src'), { recursive: true });
    await cp(join(source, 'migrations'), join(root, 'migrations'), { recursive: true });
    await symlink(join(source, 'node_modules'), join(root, 'node_modules'));
    const file = join(root, 'src/run-execution.ts'), original = await readFile(file);
    await writeFile(file, Buffer.concat([original, Buffer.from('\n// Owned source drift witness.\n')]));
    for (const [atFinish, removeExecutor] of [[false, false], [true, false], [false, true], [true, true]]) {
      await writeFile(file, Buffer.concat([original, Buffer.from('\n// Owned source drift witness.\n')]));
      const { scope, command } = await preparedInput();
      const c = atFinish ? (await claim(scope, command)).claim : null;
      const response = await result({ ...processInput(scope, command), mode: atFinish ? 'finish' : 'advance', claim: c, sourceRoot: join(root, 'src'), removeExecutor });
      if (!atFinish) { expect(JSON.parse(response.receipt).phaseAtAcceptance).toBe('blocked'); }
      expect((await f.owner`SELECT phase,reason FROM allura.run_state WHERE run_id=${command.runId}::uuid`)[0]).toEqual({ phase: 'blocked', reason: 'definition_drift' });
      expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`).toHaveLength(0);
      expect(await f.owner`SELECT id FROM allura.run_approval_requests WHERE run_id=${command.runId}::uuid`).toHaveLength(0);
    }
    expect(await readFile(join(source, 'src/run-execution.ts'))).toEqual(original);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('run prepare owner and reviewer revocation serialize both finish orders', async () => {
  for (const participant of [f.ids.author, f.ids.reviewer]) {
    const app = new SQL(f.appUrl, { max: 1 }), revoker = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 }), gate = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 });
    const runPid = (await app`SELECT pg_backend_pid() AS pid`)[0].pid as number, revokePid = (await revoker`SELECT pg_backend_pid() AS pid`)[0].pid as number, gatePid = (await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    let release = () => {}, holding: Promise<unknown> | undefined, pending: Promise<unknown> | undefined, revocation: Promise<unknown> | undefined;
    try {
      const { scope, command } = await preparedInput(), c = (await claim(scope, command)).claim!;
      await f.owner.unsafe(`CREATE FUNCTION allura.prepare_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid THEN PERFORM pg_advisory_xact_lock(120026); END IF; RETURN NEW; END $$; CREATE TRIGGER prepare_wait BEFORE INSERT ON allura.run_effect_receipts FOR EACH ROW EXECUTE FUNCTION allura.prepare_wait()`);
      let ready = () => {}; const entered = new Promise<void>(r => { ready = r; }), wait = new Promise<void>(r => { release = r; });
      holding = gate.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(120026)`; ready(); await wait; }); await entered;
      pending = finishPreparation(app, f.identities.author, scope, c); await waitForBlock(runPid, gatePid);
      revocation = revoker.begin(tx => tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND principal_id=${participant}::uuid`);
      await waitForBlock(revokePid, runPid); release(); await holding; await pending; await revocation;
      expect((await f.owner`SELECT phase FROM allura.run_state WHERE run_id=${command.runId}::uuid`)[0].phase).toBe('paused_approval');
      await expect(advanceRun(app, f.identities.author, scope, command)).rejects.toThrow('forbidden');
      await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND principal_id=${participant}::uuid`;
      await f.owner.unsafe('DROP TRIGGER prepare_wait ON allura.run_effect_receipts; DROP FUNCTION allura.prepare_wait()');
      const second = await preparedInput(), next = (await claim(second.scope, second.command)).claim!;
      const revoked = new Promise<void>(r => { ready = r; }), waitRevoke = new Promise<void>(r => { release = r; });
      revocation = revoker.begin(async tx => { await tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${second.scope.groupId} AND workspace_id=${second.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`; ready(); await waitRevoke; }); await revoked;
      const before = await snapshot(second.command.runId);
      pending = finishPreparation(app, f.identities.author, second.scope, next).then(() => 'unexpected', e => (e as Error).message);
      await waitForBlock(runPid, revokePid); release(); await revocation; expect(await pending).toContain('forbidden'); expect(await snapshot(second.command.runId)).toEqual(before);
    } finally {
      release(); await Promise.allSettled([holding, pending, revocation]);
      await f.owner.unsafe('DROP TRIGGER IF EXISTS prepare_wait ON allura.run_effect_receipts; DROP FUNCTION IF EXISTS allura.prepare_wait()');
      await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${participant}::uuid`;
      await app.close(); await revoker.close(); await gate.close();
    }
  }
}, 15000);

async function preparedInput(wrongDigest = false) {
  const scope = { ...f.scope, workspaceId: randomUUID() };
  await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${scope.workspaceId}::uuid,'Synthetic preparation',${f.ids.author}::uuid)`;
  for (const id of [f.ids.author, f.ids.reviewer]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids.author}::uuid)`; }
  const v = input(); if (wrongDigest) { v.artifact.expectedSha256 = 'a'.repeat(64); }
  const receipt = JSON.parse(await startRun(f.app, f.identities.author, scope, v));
  return { scope, v, command: { runId: receipt.runId as string, expectedRevision: 1, operationKey: randomUUID() } };
}
async function claim(scope: Scope, command: unknown, definition?: unknown) {
  const d = definition ?? await runDefinition();
  return scopedTransaction(f.app, f.identities.author, scope, 'workspace:grants:manage', async tx => (await tx`SELECT allura.claim_run_prepare(${scope.groupId},${scope.workspaceId}::uuid,${command}::jsonb,${d}::jsonb,${randomUUID()}::uuid) AS result`)[0].result as { receipt: string; claim: PreparationClaim | null });
}
async function snapshot(runId: string) {
  return Promise.all(['run_state', 'run_steps', 'run_journal', 'run_operation_receipts', 'run_effect_receipts', 'run_approval_requests'].map(async table => [...await f.owner.unsafe(`SELECT row_to_json(t)::text AS row FROM allura.${table} t WHERE run_id=$1::uuid ORDER BY row_to_json(t)::text`, [runId])]));
}

test('run prepare mismatch records raw measurements without success or approval', async () => {
  const { scope, v, command } = await preparedInput(true);
  const receipt = await advanceRun(f.app, f.identities.author, scope, command);
  expect(JSON.parse(receipt).phaseAtAcceptance).toBe('running');
  const [state] = await f.owner`SELECT phase,outcome,reason,next_step_id FROM allura.run_state WHERE run_id=${command.runId}::uuid`;
  expect(state).toEqual({ phase: 'terminal', outcome: 'failed', reason: 'gate_failed', next_step_id: null });
  const [failure] = await f.owner`SELECT measurement FROM allura.run_journal WHERE run_id=${command.runId}::uuid AND kind='terminated'`;
  expect(failure.measurement).toEqual({ artifactSha256: createHash('sha256').update(Buffer.from(v.artifact.text)).digest('hex'), artifactBytes: Buffer.byteLength(v.artifact.text), expectedSha256: v.artifact.expectedSha256, measuredGates: [{ id: 'artifact_nonempty', passed: true }, { id: 'artifact_digest_match', passed: false }] });
  expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`).toHaveLength(0);
  expect(await f.owner`SELECT id FROM allura.run_approval_requests WHERE run_id=${command.runId}::uuid`).toHaveLength(0);
  const before = await snapshot(command.runId);
  expect(await advanceRun(f.app, f.identities.author, scope, command)).toBe(receipt);
  await expect(advanceRun(f.app, f.identities.author, scope, { ...command, expectedRevision: 3, operationKey: randomUUID() })).rejects.toThrow('conflict');
  expect(await snapshot(command.runId)).toEqual(before);
});

test('run prepare concurrent replay commits one bound approval and immutable effect', async () => {
  const { scope, command, v } = await preparedInput();
  const beforeDomain = (await counts()).slice(-3);
  const receipts = await Promise.all(Array.from({ length: 6 }, () => advanceRun(f.app, f.identities.author, scope, command)));
  expect(new Set(receipts).size).toBe(1);
  const effects = await f.owner`SELECT * FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`;
  const approvals = await f.owner`SELECT * FROM allura.run_approval_requests WHERE run_id=${command.runId}::uuid`;
  expect(effects).toHaveLength(1); expect(approvals).toHaveLength(1);
  const effect = JSON.parse(effects[0].receipt_text), approval = JSON.parse(approvals[0].request_text);
  expect(effect.artifactSha256).toBe(v.artifact.expectedSha256); expect(effect.artifactBytes).toBe(Buffer.byteLength(v.artifact.text));
  expect(approval.preparedReceiptId).toBe(effect.id); expect(approval.runId).toBe(command.runId); expect(approval.reviewerPrincipalId).toBe(f.ids.reviewer);
  expect(approval.definition.digest).toBe(effect.definitionDigest); expect(approval.inputDigest).toBe(effect.inputDigest); expect(approval.requestedAtRevision).toBe(3);
  const [binding] = await f.owner`SELECT encode(sha256(convert_to(jsonb_build_object('runId',${command.runId}::uuid,'definitionDigest',${effect.definitionDigest}::text,'inputDigest',${effect.inputDigest}::text,'preparedReceiptId',${effect.id}::uuid,'preparedReceiptDigest',${createHash('sha256').update(effects[0].receipt_text).digest('hex')}::text,'reviewerPrincipalId',${f.ids.reviewer}::uuid)::text,'UTF8')),'hex') AS expected`;
  expect(approval.evidenceDigest).toBe(binding.expected); expect(approvals[0].evidence_digest).toBe(binding.expected);
  expect((await counts()).slice(-3)).toEqual(beforeDomain);
  const before = await snapshot(command.runId);
  for (const changed of [{ ...command, expectedRevision: 2 }, { ...command, runId: randomUUID() }, { ...command, operationKey: v.operationKey }]) { await expect(advanceRun(f.app, f.identities.author, scope, changed)).rejects.toThrow(); }
  expect(await advanceRun(f.app, f.identities.author, scope, command)).toBe(receipts[0]!);
  expect(await snapshot(command.runId)).toEqual(before);
  for (const table of ['run_effect_receipts', 'run_approval_requests']) {
    const [security] = await f.owner`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=${'allura.' + table}::regclass`;
    expect(security.relrowsecurity).toBe(true); expect(security.relforcerowsecurity).toBe(true);
    for (const sql of [`SELECT * FROM allura.${table}`, `DELETE FROM allura.${table}`, `INSERT INTO allura.${table} DEFAULT VALUES`, `TRUNCATE allura.${table} CASCADE`]) { await expect(f.app.unsafe(sql).execute()).rejects.toThrow('permission denied'); }
    for (const sql of [`UPDATE allura.${table} SET group_id=group_id WHERE run_id=$1::uuid`, `DELETE FROM allura.${table} WHERE run_id=$1::uuid`]) { await expect(f.owner.unsafe(sql, [command.runId]).execute()).rejects.toThrow('append-only'); }
    await expect(f.owner.unsafe(`TRUNCATE allura.${table} CASCADE`).execute()).rejects.toThrow('append-only');
  }
  await expect(f.app`SELECT lease_id,invocation_id FROM allura.run_steps`.execute()).rejects.toThrow('permission denied');
  await expect(f.app`SELECT allura.lock_run_participants(${scope.groupId},${scope.workspaceId}::uuid,${command.runId}::uuid)`.execute()).rejects.toThrow('permission denied');
  await expect(f.app`SELECT allura.validate_run_command('{}')`.execute()).rejects.toThrow('permission denied');
});

test('run prepare current participant loss denies claims finishes and receipt replay', async () => {
  const { scope, command } = await preparedInput();
  const c = (await claim(scope, command)).claim!;
  const before = await snapshot(command.runId);
  for (const identity of [f.identities.machine, f.identities.viewer, f.identities.reviewer, f.identities.org]) {
    await expect(advanceRun(f.app, identity, scope, command)).rejects.toThrow('forbidden');
  }
  await expect(advanceRun(f.app, { ...f.identities.author }, scope, command)).rejects.toThrow('unauthenticated');
  for (const participant of [f.ids.author, f.ids.reviewer]) {
    for (const table of ['workspace_grants', 'memberships', 'identity_bindings']) {
      const filter = table === 'identity_bindings' ? 'principal_id=$1::uuid' : 'principal_id=$1::uuid AND group_id=$2';
      const values = table === 'identity_bindings' ? [participant] : [participant, scope.groupId];
      await f.owner.unsafe(`UPDATE allura.${table} SET active=false WHERE ${filter}`, values);
      try {
        await expect(advanceRun(f.app, f.identities.author, scope, command)).rejects.toThrow('forbidden');
        await expect(finishPreparation(f.app, f.identities.author, scope, c)).rejects.toThrow('forbidden');
      } finally { await f.owner.unsafe(`UPDATE allura.${table} SET active=true WHERE ${filter}`, values); }
    }
  }
  expect(await snapshot(command.runId)).toEqual(before);
  await finishPreparation(f.app, f.identities.author, scope, c);
  expect((await f.owner`SELECT phase FROM allura.run_state WHERE run_id=${command.runId}::uuid`)[0].phase).toBe('paused_approval');
});

test('run prepare strict command and stale fence reject caller asserted completion', async () => {
  const { scope, command } = await preparedInput(), before = await snapshot(command.runId);
  for (const value of [{ ...command, passed: true }, { ...command, handler: 'shell' }, { ...command, expectedRevision: '1' }, { ...command, expectedRevision: 0 }, { ...command, expectedRevision: 2147483648 }, { ...command, expectedRevision: 1.1 }, { ...command, runId: 'wrong' }, { ...command, operationKey: null }]) {
    await expect(advanceRun(f.app, f.identities.author, scope, value)).rejects.toThrow('invalid');
    await expect(claim(scope, value)).rejects.toThrow('invalid');
  }
  expect(await snapshot(command.runId)).toEqual(before);
  const c = (await claim(scope, command)).claim!, leased = await snapshot(command.runId);
  for (const changed of [{ ...c, leaseId: randomUUID() }, { ...c, invocationId: randomUUID() }, { ...c, fence: c.fence + 1 }, { ...c, operationReceiptId: randomUUID() }]) { await expect(finishPreparation(f.app, f.identities.author, scope, changed)).rejects.toThrow('conflict'); }
  expect(await snapshot(command.runId)).toEqual(leased);
  await finishPreparation(f.app, f.identities.author, scope, c);
  await expect(finishPreparation(f.app, f.identities.author, scope, c)).rejects.toThrow('conflict');
});

test('run prepare insert update and deferred faults preserve atomic effect boundaries', async () => {
  for (const [table, event, deferred] of [['run_effect_receipts', 'INSERT', false], ['run_approval_requests', 'INSERT', false], ['run_journal', 'INSERT', false], ['run_steps', 'UPDATE', false], ['run_state', 'UPDATE', false], ['run_approval_requests', 'INSERT', true]] as const) {
    const { scope, command } = await preparedInput(), c = (await claim(scope, command)).claim!;
    const before = await snapshot(command.runId);
    await f.owner.unsafe(`CREATE FUNCTION allura.prepare_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid THEN RAISE EXCEPTION 'synthetic prepare fault'; END IF; RETURN NEW; END $$; CREATE ${deferred ? 'CONSTRAINT ' : ''}TRIGGER prepare_fault ${deferred ? 'AFTER' : 'BEFORE'} ${event} ON allura.${table} ${deferred ? 'DEFERRABLE INITIALLY DEFERRED' : ''} FOR EACH ROW EXECUTE FUNCTION allura.prepare_fault()`);
    try { await expect(finishPreparation(f.app, f.identities.author, scope, c)).rejects.toThrow('synthetic prepare fault'); }
    finally { await f.owner.unsafe(`DROP TRIGGER prepare_fault ON allura.${table}; DROP FUNCTION allura.prepare_fault()`); }
    expect(await snapshot(command.runId)).toEqual(before);
    await finishPreparation(f.app, f.identities.author, scope, c);
    expect((await f.owner`SELECT phase FROM allura.run_state WHERE run_id=${command.runId}::uuid`)[0].phase).toBe('paused_approval');
  }
});

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  f = await fixture(`allura-runs-${randomUUID()}`);
  await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${f.ids.reviewer}::uuid`;
});
afterAll(async () => { await f?.close(); });
function input() {
  const text = 'Synthetic exact run artifact\r\nCafe\u0301 🧠';
  return { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 9, goal: 'Synthetic run goal', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
}
async function counts() {
  return Promise.all(['run_definitions', 'run_records', 'run_state', 'run_steps', 'run_journal', 'run_operation_receipts', 'run_effect_receipts', 'run_approval_requests', 'events', 'semantic_versions', 'proposal_state'].map(async table => (await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${table} WHERE group_id=$1`, [f.scope.groupId]))[0].n));
}
test('run authority denies foreign machines self review and current revocation', async () => {
  const v = input(), receipt = await startRun(f.app, f.identities.author, f.scope, v);
  const foreignScope = { groupId: `allura-run-foreign-${randomUUID()}`, workspaceId: randomUUID() };
  await f.owner`INSERT INTO allura.tenants(group_id) VALUES(${foreignScope.groupId})`;
  for (const id of [f.ids.viewer, f.ids.curator]) { await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${foreignScope.groupId},${id}::uuid)`; }
  await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${foreignScope.groupId},${foreignScope.workspaceId}::uuid,'PRIVATE foreign scope',${f.ids.viewer}::uuid)`;
  for (const scope of [foreignScope, { ...f.scope, workspaceId: f.foreignWorkspace }]) {
    for (const id of [f.ids.viewer, f.ids.curator]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids.viewer}::uuid)`; }
    const sentinel = await startRun(f.app, f.identities.viewer, scope, { ...input(), goal: 'PRIVATE foreign sentinel', reviewerPrincipalId: f.ids.curator });
    expect(JSON.parse(sentinel).phaseAtAcceptance).toBe('ready');
    await expect(startRun(f.app, f.identities.author, scope, v)).rejects.toThrow('forbidden');
  }
  const before = await counts();
  for (const identity of [f.identities.viewer, f.identities.curator, f.identities.org, f.identities.machine]) { await expect(startRun(f.app, identity, f.scope, v)).rejects.toThrow('forbidden'); }
  await expect(startRun(f.app, { ...f.identities.author }, f.scope, v)).rejects.toThrow('unauthenticated');
  for (const reviewerPrincipalId of [f.ids.author, f.ids.viewer, f.ids.curator, f.ids.org, f.ids.machine, randomUUID()]) { await expect(startRun(f.app, f.identities.author, f.scope, { ...v, reviewerPrincipalId })).rejects.toThrow('conflict'); await expect(startRun(f.app, f.identities.author, f.scope, { ...v, operationKey: randomUUID(), reviewerPrincipalId })).rejects.toThrow('forbidden'); }
  for (const participant of [f.ids.author, f.ids.reviewer]) {
    for (const [table, field, denied, restored, where, values] of [
      ['principals', 'active', false, true, 'id=$2::uuid', [participant]],
      ['memberships', 'active', false, true, 'principal_id=$2::uuid AND group_id=$3', [participant, f.scope.groupId]],
      ['workspace_grants', 'active', false, true, 'principal_id=$2::uuid AND group_id=$3 AND workspace_id=$4::uuid', [participant, f.scope.groupId, f.scope.workspaceId]],
      ['workspace_grants', 'role', 'curator', 'workspace_admin', 'principal_id=$2::uuid AND group_id=$3 AND workspace_id=$4::uuid', [participant, f.scope.groupId, f.scope.workspaceId]],
      ['identity_bindings', 'active', false, true, 'principal_id=$2::uuid', [participant]],
    ] as const) {
      await f.owner.unsafe(`UPDATE allura.${table} SET ${field}=$1 WHERE ${where}`, [denied, ...values]);
      try { for (const operationKey of [v.operationKey, randomUUID()]) { await expect(startRun(f.app, f.identities.author, f.scope, { ...v, operationKey })).rejects.toThrow('forbidden'); } }
      finally { await f.owner.unsafe(`UPDATE allura.${table} SET ${field}=$1 WHERE ${where}`, [restored, ...values]); }
    }
  }
  for (const [table, field, denied, restored] of [['tenants', 'active', false, true], ['workspaces', 'locked', true, false]] as const) {
    await f.owner.unsafe(`UPDATE allura.${table} SET ${field}=$1 WHERE group_id=$2`, [denied, f.scope.groupId]);
    try { await expect(startRun(f.app, f.identities.author, f.scope, v)).rejects.toThrow('forbidden'); }
    finally { await f.owner.unsafe(`UPDATE allura.${table} SET ${field}=$1 WHERE group_id=$2`, [restored, f.scope.groupId]); }
  }
  expect(await counts()).toEqual(before);
  expect(await startRun(f.app, f.identities.author, f.scope, v)).toBe(receipt);
});

test('run restricted tables and pooled contexts preserve immutable scoped evidence', async () => {
  const v = input(), receipt = JSON.parse(await startRun(f.app, f.identities.author, f.scope, v));
  const [role] = await f.app`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  expect(role.rolsuper).toBe(false); expect(role.rolbypassrls).toBe(false);
  const tables = ['run_definitions', 'run_records', 'run_state', 'run_steps', 'run_journal', 'run_operation_receipts'];
  for (const table of tables) {
    const [security] = await f.owner`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid=${'allura.' + table}::regclass`;
    expect(security.relrowsecurity).toBe(true); expect(security.relforcerowsecurity).toBe(true); expect(security.owner).not.toBe('allura_app');
    await expect(f.app.unsafe(`DELETE FROM allura.${table}`).execute()).rejects.toThrow('permission denied');
    await expect(f.app.unsafe(`TRUNCATE allura.${table} CASCADE`).execute()).rejects.toThrow('permission denied');
    await expect(f.app.unsafe(`INSERT INTO allura.${table} DEFAULT VALUES`).execute()).rejects.toThrow('permission denied');
  }
  for (const table of ['run_definitions', 'run_records', 'run_operation_receipts']) { await expect(f.app.unsafe(`SELECT * FROM allura.${table}`).execute()).rejects.toThrow('permission denied'); }
  for (const table of ['run_definitions', 'run_records', 'run_journal', 'run_operation_receipts']) {
    await expect(f.owner.unsafe(`UPDATE allura.${table} SET group_id=group_id WHERE group_id=$1`, [f.scope.groupId]).execute()).rejects.toThrow('append-only');
    await expect(f.owner.unsafe(`DELETE FROM allura.${table} WHERE group_id=$1`, [f.scope.groupId]).execute()).rejects.toThrow('append-only');
    await expect(f.owner.unsafe(`TRUNCATE allura.${table} CASCADE`).execute()).rejects.toThrow('append-only');
  }
  await expect(f.app`SELECT allura.validate_run_start('{}','{}')`.execute()).rejects.toThrow('permission denied');
  await expect(f.app`SELECT allura.start_run(${f.scope.groupId},${f.scope.workspaceId}::uuid,${v}::jsonb,${await runDefinition()}::jsonb)`.execute()).rejects.toThrow('forbidden');
  const reserved = await f.app.reserve();
  try {
    expect((await scopedTransaction(reserved, f.identities.author, f.scope, 'audit:read', tx => tx`SELECT run_id FROM allura.run_state WHERE run_id=${receipt.runId}::uuid`))).toHaveLength(1);
    expect((await scopedTransaction(reserved, f.identities.viewer, { ...f.scope, workspaceId: f.foreignWorkspace }, 'audit:read', tx => tx`SELECT run_id FROM allura.run_state WHERE run_id=${receipt.runId}::uuid`))).toHaveLength(0);
    expect(await reserved`SELECT run_id FROM allura.run_state`).toHaveLength(0);
    await reserved.begin(async tx => { await tx`SELECT set_config('allura.kind','human',true),set_config('allura.workspace','malformed',true)`; expect(await tx`SELECT run_id FROM allura.run_state`).toHaveLength(0); });
  } finally { reserved.release(); }
  await expect(f.owner`INSERT INTO allura.run_steps VALUES(${f.scope.groupId},${f.foreignWorkspace}::uuid,${receipt.runId}::uuid,'prepare','pending',0,0)`.execute()).rejects.toThrow('foreign key');
  const [stored] = await f.owner`SELECT r.input_digest,encode(sha256(convert_to(r.input::text,'UTF8')),'hex') AS input_expected,d.definition_digest,encode(sha256(convert_to(d.definition::text,'UTF8')),'hex') AS definition_expected,d.policy_digest,encode(sha256(convert_to((d.definition->'policy')::text,'UTF8')),'hex') AS policy_expected,r.input FROM allura.run_records r JOIN allura.run_definitions d ON d.group_id=r.group_id AND d.workspace_id=r.workspace_id AND d.definition_id=r.definition_id AND d.revision=r.definition_revision WHERE r.id=${receipt.runId}::uuid`;
  expect(stored.input_digest).toBe(stored.input_expected); expect(stored.definition_digest).toBe(stored.definition_expected); expect(stored.policy_digest).toBe(stored.policy_expected);
  expect(stored.input.artifact.text).toBe(v.artifact.text);
  const [vector] = await f.owner`SELECT encode(sha256(convert_to('{"b":2,"a":1}'::jsonb::text,'UTF8')),'hex') AS digest`;
  expect(vector.digest).toBe(createHash('sha256').update('{"a": 1, "b": 2}').digest('hex'));
});

test('run start owner and reviewer revocation serialize in both database orders', async () => {
  async function blocked(waiter: number, blocker: number) {
    for (let i = 0; i < 100; i++) {
      const [row] = await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS blocked`;
      if (row.blocked) { console.log(JSON.stringify({ runStartLockWitness: { waiter, blocker } })); expect(row.blocked).toBe(true); return; }
      await Bun.sleep(10);
    }
    throw new Error('Exact run authority blocker not observed');
  }
  for (const participant of [f.ids.author, f.ids.reviewer]) {
    const app = new SQL(f.appUrl, { max: 1 }), revoker = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 }), gate = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 });
    const runPid = (await app`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    const revokePid = (await revoker`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    const gatePid = (await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    let release = () => {}, pending: Promise<unknown> | undefined, revocation: Promise<unknown> | undefined, holding: Promise<unknown> | undefined;
    try {
      await f.owner.unsafe(`CREATE FUNCTION allura.run_fixture_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.group_id='${f.scope.groupId}' THEN PERFORM pg_advisory_xact_lock(120025); END IF; RETURN NEW; END $$; CREATE TRIGGER run_fixture_wait BEFORE INSERT ON allura.run_operation_receipts FOR EACH ROW EXECUTE FUNCTION allura.run_fixture_wait()`);
      let ready = () => {}; const entered = new Promise<void>(resolve => { ready = resolve; }); const wait = new Promise<void>(resolve => { release = resolve; });
      holding = gate.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(120025)`; ready(); await wait; });
      await entered;
      const v = input(); pending = startRun(app, f.identities.author, f.scope, v);
      await blocked(runPid, gatePid);
      revocation = revoker.begin(tx => tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`);
      await blocked(revokePid, runPid);
      release(); await holding; const receipt = await pending; await revocation;
      expect(typeof receipt).toBe('string');
      await expect(startRun(app, f.identities.author, f.scope, v)).rejects.toThrow('forbidden');
      await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`;
      await f.owner.unsafe('DROP TRIGGER run_fixture_wait ON allura.run_operation_receipts; DROP FUNCTION allura.run_fixture_wait()');
      const revoked = new Promise<void>(resolve => { ready = resolve; }); const waitRevoke = new Promise<void>(resolve => { release = resolve; });
      revocation = revoker.begin(async tx => { await tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`; ready(); await waitRevoke; });
      await revoked;
      const before = await counts();
      pending = startRun(app, f.identities.author, f.scope, input()).then(() => 'unexpected admission', error => (error as Error).message);
      await blocked(runPid, revokePid);
      release(); await revocation;
      expect(await pending).toContain('forbidden'); expect(await counts()).toEqual(before);
    } finally {
      release(); await Promise.allSettled([holding, pending, revocation]);
      await f.owner.unsafe('DROP TRIGGER IF EXISTS run_fixture_wait ON allura.run_operation_receipts; DROP FUNCTION IF EXISTS allura.run_fixture_wait()');
      await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`;
      await app.close(); await revoker.close(); await gate.close();
    }
  }
}, 15000);

test('run start insert and deferred commit faults leave no partial admission', async () => {
  for (const target of ['run_definitions', 'run_records', 'run_state', 'run_steps', 'run_journal', 'run_operation_receipts', 'deferred']) {
    const scope = { ...f.scope, workspaceId: randomUUID() }, table = target === 'deferred' ? 'run_operation_receipts' : target;
    await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${scope.workspaceId}::uuid,'Synthetic fault scope',${f.ids.author}::uuid)`;
    for (const id of [f.ids.author, f.ids.reviewer]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids.author}::uuid)`; }
    const v = input(), before = await counts();
    await f.owner.unsafe(`CREATE FUNCTION allura.run_fixture_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.group_id='${f.scope.groupId}' THEN RAISE EXCEPTION 'private synthetic fault'; END IF; RETURN NEW; END $$; CREATE ${target === 'deferred' ? 'CONSTRAINT ' : ''}TRIGGER run_fixture_fault ${target === 'deferred' ? 'AFTER' : 'BEFORE'} INSERT ON allura.${table} ${target === 'deferred' ? 'DEFERRABLE INITIALLY DEFERRED' : ''} FOR EACH ROW EXECUTE FUNCTION allura.run_fixture_fault()`);
    try { await expect(startRun(f.app, f.identities.author, scope, v)).rejects.toThrow('run_unknown'); }
    finally { await f.owner.unsafe(`DROP TRIGGER run_fixture_fault ON allura.${table}; DROP FUNCTION allura.run_fixture_fault()`); }
    expect(await counts()).toEqual(before);
    const receipt = await startRun(f.app, f.identities.author, scope, v);
    expect(await startRun(f.app, f.identities.author, scope, v)).toBe(receipt);
  }
});

test('run start retention admission is bounded and exact replay survives saturation', async () => {
  const workspaceId = randomUUID(), scope = { ...f.scope, workspaceId };
  await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${workspaceId}::uuid,'Synthetic quota scope',${f.ids.author}::uuid)`;
  for (const id of [f.ids.author, f.ids.reviewer]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids.author}::uuid)`; }
  const first = input(), original = await startRun(f.app, f.identities.author, scope, first);
  for (let i = 1; i < 31; i++) { await startRun(f.app, f.identities.author, scope, input()); }
  const results = await Promise.allSettled([input(), input()].map(v => startRun(f.app, f.identities.author, scope, v)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.message).toBe('run_unavailable');
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.run_records WHERE group_id=${scope.groupId} AND workspace_id=${workspaceId}::uuid`)[0].n).toBe(32);
  expect(await startRun(f.app, f.identities.author, scope, first)).toBe(original);
});

test('run restricted start rejects caller policy handlers outcomes and malformed envelopes', async () => {
  const v = input(), definition = await runDefinition(), before = await counts();
  const command = (request: unknown, def: unknown = definition) => scopedTransaction(f.app, f.identities.author, f.scope, 'workspace:grants:manage', tx => tx`SELECT allura.start_run(${f.scope.groupId},${f.scope.workspaceId}::uuid,${request}::jsonb,${def}::jsonb)`);
  for (const request of [{ ...v, handler: 'shell' }, { ...v, outcome: 'succeeded' }, { ...v, policy: {} }, { ...v, actorPrincipalId: f.ids.author }, { ...v, definitionRevision: '1' }, { ...v, artifact: { ...v.artifact, passed: true } }, { ...v, artifact: { ...v.artifact, expectedSha256: null } }, { ...v, goal: null }, { ...v, reviewerPrincipalId: 'not-a-uuid' }, { ...v, artifact: { ...v.artifact, text: 'x'.repeat(16385) } }]) {
    await expect(command(request)).rejects.toThrow('invalid');
  }
  for (const def of [{ ...definition, policy: { ...definition.policy, independentReviewer: false } }, { ...definition, steps: [] }, { ...definition, handlerBundleDigest: 'caller' }, { ...definition, handler: 'shell' }]) {
    await expect(command(v, def)).rejects.toThrow('invalid');
  }
  expect(await counts()).toEqual(before);
});

test('run start replay requires original owner and reviewer bindings', async () => {
  const v = input(), receipt = await startRun(f.app, f.identities.author, f.scope, v), before = await counts();
  await f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.reviewer}::uuid`;
  await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.reviewer}::uuid WHERE subject=${`${f.scope.groupId}:curator`}`;
  try {
    await expect(startRun(f.app, f.identities.author, f.scope, v)).rejects.toThrow('run_forbidden');
    expect(await counts()).toEqual(before);
  } finally {
    await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.curator}::uuid WHERE subject=${`${f.scope.groupId}:curator`}`;
    await f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${f.ids.reviewer}::uuid`;
  }
  await f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.author}::uuid`;
  await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.author}::uuid WHERE subject=${`${f.scope.groupId}:viewer`}`;
  try {
    await expect(startRun(f.app, f.identities.viewer, f.scope, v)).rejects.toThrow('run_forbidden');
    expect(await counts()).toEqual(before);
  } finally {
    await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.viewer}::uuid WHERE subject=${`${f.scope.groupId}:viewer`}`;
    await f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${f.ids.author}::uuid`;
  }
  expect(await startRun(f.app, f.identities.author, f.scope, v)).toBe(receipt);
});

test('run same key concurrency yields one receipt and changed payload conflicts', async () => {
  const v = input();
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => startRun(f.app, f.identities.author, f.scope, v)));
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(6);
  const receipts = results.map(result => (result as PromiseFulfilledResult<string>).value);
  expect(new Set(receipts).size).toBe(1);
  const receipt = JSON.parse(receipts[0]!);
  const before = await counts();
  expect(await startRun(f.app, f.identities.author, f.scope, v)).toBe(receipts[0]!);
  for (const changed of [{ ...v, goal: v.goal + ' ' }, { ...v, artifact: { ...v.artifact, text: v.artifact.text + '\n' } }, { ...v, artifact: { ...v.artifact, expectedSha256: 'a'.repeat(64) } }]) {
    await expect(startRun(f.app, f.identities.author, f.scope, changed)).rejects.toThrow('run_conflict');
  }
  expect(await counts()).toEqual(before);
  expect((await f.owner`SELECT id FROM allura.run_records WHERE group_id=${f.scope.groupId} AND id=${receipt.runId}::uuid`)).toHaveLength(1);
  const next = JSON.parse(await startRun(f.app, f.identities.author, f.scope, { ...v, operationKey: randomUUID() }));
  expect(next.runId).not.toBe(receipt.runId);
  expect(next.requestDigest).toBe(receipt.requestDigest);
  const definition = await runDefinition(), pinned = await counts();
  for (const operationKey of [v.operationKey, randomUUID()]) {
    await expect(scopedTransaction(f.app, f.identities.author, f.scope, 'workspace:grants:manage', tx => tx`SELECT allura.start_run(${f.scope.groupId},${f.scope.workspaceId}::uuid,${{ ...v, operationKey }}::jsonb,${{ ...definition, handlerBundleDigest: 'a'.repeat(64) }}::jsonb)`)).rejects.toThrow('conflict');
  }
  expect(await counts()).toEqual(pinned);
});
