import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture } from './lifecycle-fixture.ts';
import { startRun, advanceRun, decideRun } from '../src/runs.ts';
import { scopedTransaction } from '../src/persistence.ts';
import { runDefinition, type RunDecisionV1 } from '../src/run-contract.ts';
import { type Scope } from '../src/authority.ts';
import { createCoreGateway } from '../src/core-api.ts';
import { EMBEDDING } from '../src/embedding.ts';

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => { f = await fixture(`allura-decisions-${randomUUID()}`); });
afterAll(async () => { await f?.close(); });
async function prepared(scope?: Scope, owner: 'author' | 'viewer' = 'author', reviewer: 'reviewer' | 'curator' = 'reviewer') {
  scope ??= { ...f.scope, workspaceId: randomUUID() };
  await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${scope.workspaceId}::uuid,'Private decision fixture',${f.ids[owner]}::uuid) ON CONFLICT DO NOTHING`;
  for (const id of [f.ids[owner], f.ids[reviewer]]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids[owner]}::uuid) ON CONFLICT DO NOTHING`; }
  const text = 'Private exact artifact\r\nCafe\u0301 🧠';
  const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 7, goal: 'Private decision goal', reviewerPrincipalId: f.ids[reviewer], artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
  const start = await startRun(f.app, f.identities[owner], scope, input), runId = JSON.parse(start).runId as string;
  const advanceCommand = { runId, expectedRevision: 1, operationKey: randomUUID() };
  const advance = await advanceRun(f.app, f.identities[owner], scope, advanceCommand);
  const [row] = await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${runId}::uuid`;
  const request = JSON.parse(row.request_text);
  const command: RunDecisionV1 = { runId, expectedRevision: request.requestedAtRevision, operationKey: randomUUID(), approvalRequestId: request.id, reviewedEvidenceDigest: request.evidenceDigest, decision: 'approve', rationale: ' Exact reviewed evidence\r\nCafe\u0301 🧠 ' };
  return { scope, input, start, advance, advanceCommand, command };
}
async function snapshot(runId: string) {
  return Promise.all(['run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions'].map(async table => [...await f.owner.unsafe(`SELECT row_to_json(t)::text AS row FROM allura.${table} t WHERE run_id=$1::uuid ORDER BY row_to_json(t)::text`, [runId])]));
}
async function unrelated() {
  return Promise.all(['events','semantic_versions','proposal_state','semantic_intents'].map(async table => [...await f.owner.unsafe(`SELECT row_to_json(t)::text AS row FROM allura.${table} t WHERE group_id=$1 ORDER BY row_to_json(t)::text`, [f.scope.groupId])]));
}
function sqlDecision(scope: Scope, command: unknown, definition?: unknown) {
  return scopedTransaction(f.app, f.identities.reviewer, scope, 'workspace:grants:manage', async tx => {
    return (await tx`SELECT allura.decide_run(${scope.groupId},${scope.workspaceId}::uuid,${command}::jsonb,${definition === undefined ? await runDefinition() : definition}::jsonb) AS receipt`)[0].receipt as string;
  });
}
async function state(runId: string) { return (await f.owner`SELECT phase,outcome,reason,next_step_id,revision FROM allura.run_state WHERE run_id=${runId}::uuid`)[0]; }
async function blocked(waiter: number, blocker: number) {
  expect(waiter).not.toBe(blocker);
  for (let i = 0; i < 100; i++) {
    if ((await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS blocked`)[0].blocked) { console.log(JSON.stringify({ decisionLockWitness: { waiter, blocker } })); return; }
    await Bun.sleep(10);
  }
  throw new Error('Exact decision waiter not observed');
}
function payload(scope: Scope, command: unknown) { return { url: f.appUrl, assertion: f.jwt('reviewer'), issuer: f.humanConfig.issuer, publicKey: f.humanConfig.keys.get('key')!.export({ type: 'spki', format: 'pem' }), scope, command, mode: 'decide' }; }
async function child(value: object, exit = 0) {
  const p = Bun.spawn([process.execPath, new URL('./run-process-fixture.ts', import.meta.url).pathname], { stdin: new Blob([JSON.stringify(value)]), stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ALLURA_DISPOSABLE_DB: 'owned-test-container' } });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  expect(err).toBe(''); expect(code).toBe(exit); return JSON.parse(out);
}

test('run decision approve is atomic ready handoff without execution or semantic promotion', async () => {
  const { scope, command, start, input, advance, advanceCommand } = await prepared(), before = await unrelated();
  const originalEffects = await f.owner`SELECT receipt_text FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`;
  const receipt = await decideRun(f.app, f.identities.reviewer, scope, command), op = JSON.parse(receipt);
  expect(op).toMatchObject({ command: 'decide', actorPrincipalId: f.ids.reviewer, acceptedRevision: 4, journalSeq: 5, phaseAtAcceptance: 'ready' });
  expect(await state(command.runId)).toEqual({ phase: 'ready', outcome: null, reason: 'none', next_step_id: 'handoff', revision: 4 });
  const [d] = await f.owner`SELECT * FROM allura.run_approval_decisions WHERE run_id=${command.runId}::uuid`;
  expect(JSON.parse(d.decision_text)).toMatchObject({ requestId: command.approvalRequestId, runId: command.runId, reviewerPrincipalId: f.ids.reviewer, reviewedEvidenceDigest: command.reviewedEvidenceDigest, decision: 'approve', rationale: command.rationale, journalSeq: 5 });
  const [j] = await f.owner`SELECT * FROM allura.run_journal WHERE run_id=${command.runId}::uuid AND seq=5`;
  expect(j.approval_decision_id).toBe(d.id); expect(j.approval_request_id).toBe(command.approvalRequestId); expect(j.receipt_id).toBe(op.id); expect(j.kind).toBe('approval_decided');
  expect((await f.owner`SELECT state,attempts,fence FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='handoff'`)[0]).toEqual({ state: 'pending', attempts: 0, fence: 0 });
  expect(await startRun(f.app, f.identities.author, scope, input)).toBe(start); expect(await advanceRun(f.app, f.identities.author, scope, advanceCommand)).toBe(advance);
  const stable = await snapshot(command.runId);
  expect(await decideRun(f.app, f.identities.reviewer, scope, command)).toBe(receipt);
  await expect(advanceRun(f.app, f.identities.author, scope, { runId: command.runId, expectedRevision: 4, operationKey: randomUUID() })).rejects.toThrow('conflict');
  expect(await snapshot(command.runId)).toEqual(stable); expect(await unrelated()).toEqual(before);
  expect(await f.owner`SELECT receipt_text FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`).toEqual(originalEffects);
});

test('run decision exact selectors strict SQL payloads and namespace conflicts write nothing', async () => {
  const { scope, command } = await prepared(), other = await prepared(scope), before = await snapshot(command.runId);
  for (const value of [null, [], {}, { ...command, actorPrincipalId: f.ids.reviewer }, { ...command, outcome: 'succeeded' }, { ...command, policy: {} }, { ...command, decision: null }, { ...command, decision: true }, { ...command, rationale: null }, { ...command, rationale: ' ' }, { ...command, rationale: '🧠'.repeat(251) }, { ...command, approvalRequestId: null }, { ...command, approvalRequestId: 'bad' }, { ...command, reviewedEvidenceDigest: null }, { ...command, reviewedEvidenceDigest: 'A'.repeat(64) }, { ...command, expectedRevision: null }, { ...command, expectedRevision: 1.1 }]) {
    await expect(decideRun(f.app, f.identities.reviewer, scope, value)).rejects.toThrow('invalid');
    await expect(sqlDecision(scope, value)).rejects.toThrow('invalid');
  }
  for (const changed of [{ ...command, expectedRevision: 2 }, { ...command, approvalRequestId: randomUUID() }, { ...command, approvalRequestId: other.command.approvalRequestId }, { ...command, reviewedEvidenceDigest: other.command.reviewedEvidenceDigest }, { ...command, runId: other.command.runId }]) { await expect(decideRun(f.app, f.identities.reviewer, scope, changed)).rejects.toThrow('conflict'); }
  expect(await snapshot(command.runId)).toEqual(before);
  // Same reviewer also owns a separate run: keys span commands, not just decide.
  const ownerStart = { ...other.input, reviewerPrincipalId: f.ids.author, operationKey: command.operationKey };
  await startRun(f.app, f.identities.reviewer, scope, ownerStart);
  await expect(decideRun(f.app, f.identities.reviewer, scope, command)).rejects.toThrow('conflict');
  const accepted = { ...command, operationKey: randomUUID() }, receipt = await decideRun(f.app, f.identities.reviewer, scope, accepted);
  await expect(startRun(f.app, f.identities.reviewer, scope, { ...ownerStart, operationKey: accepted.operationKey })).rejects.toThrow('conflict');
  const stable = await snapshot(command.runId);
  for (const changed of [{ ...accepted, decision: 'reject' }, { ...accepted, rationale: accepted.rationale + ' ' }, { ...accepted, expectedRevision: 4 }, { ...accepted, approvalRequestId: other.command.approvalRequestId }, { ...accepted, reviewedEvidenceDigest: other.command.reviewedEvidenceDigest }, { ...accepted, runId: other.command.runId }, { ...accepted, operationKey: randomUUID() }]) { await expect(decideRun(f.app, f.identities.reviewer, scope, changed)).rejects.toThrow('conflict'); }
  expect(await decideRun(f.app, f.identities.reviewer, scope, accepted)).toBe(receipt); expect(await snapshot(command.runId)).toEqual(stable);
});

test('run decision concurrent start collision reaches post-admission lookup and returns conflict', async () => {
  const { scope, command, input } = await prepared();
  const app = new SQL(f.appUrl, { max: 1 }), starter = new SQL(f.appUrl, { max: 1 }), gate = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 });
  let release = () => {}, holding: Promise<unknown> | undefined, deciding: Promise<unknown> | undefined, starting: Promise<unknown> | undefined;
  const records = [...await f.owner`SELECT row_to_json(r)::text AS row FROM allura.run_records r WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid ORDER BY id`];
  try {
    const decisionPid = (await app`SELECT pg_backend_pid() AS pid`)[0].pid as number, startPid = (await starter`SELECT pg_backend_pid() AS pid`)[0].pid as number, gatePid = (await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    await f.owner.unsafe(`CREATE FUNCTION allura.decision_collision_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid AND NEW.command='decide' THEN PERFORM pg_advisory_xact_lock(120031); END IF; RETURN NEW; END $$; CREATE TRIGGER decision_collision_wait BEFORE INSERT ON allura.run_operation_receipts FOR EACH ROW EXECUTE FUNCTION allura.decision_collision_wait()`);
    let ready = () => {}; const entered = new Promise<void>(r => { ready = r; }), wait = new Promise<void>(r => { release = r; });
    holding = gate.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(120031)`; ready(); await wait; }); await entered;
    deciding = decideRun(app, f.identities.reviewer, scope, command);
    await blocked(decisionPid, gatePid);
    // The uncommitted decision receipt is absent at start's first lookup.
    expect(await f.owner`SELECT id FROM allura.run_operation_receipts WHERE actor_id=${f.ids.reviewer}::uuid AND operation_key=${command.operationKey}`).toHaveLength(0);
    starting = startRun(starter, f.identities.reviewer, scope, { ...input, reviewerPrincipalId: f.ids.author, operationKey: command.operationKey }).then(() => 'unexpected success', e => (e as Error).message);
    await blocked(startPid, decisionPid);
    expect((await f.owner`SELECT wait_event FROM pg_stat_activity WHERE pid=${startPid}`)[0].wait_event).toBe('advisory');
    release(); await holding; expect(typeof await deciding).toBe('string');
    expect(await starting).toBe('run_conflict');
    expect([...await f.owner`SELECT row_to_json(r)::text AS row FROM allura.run_records r WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid ORDER BY id`]).toEqual(records);
    expect(await f.owner`SELECT id FROM allura.run_operation_receipts WHERE actor_id=${f.ids.reviewer}::uuid AND operation_key=${command.operationKey} AND command='decide'`).toHaveLength(1);
    expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`).toHaveLength(1);
  } finally { release(); await Promise.allSettled([holding,deciding,starting]); await app.close(); await starter.close(); await gate.close(); await f.owner.unsafe('DROP TRIGGER IF EXISTS decision_collision_wait ON allura.run_operation_receipts; DROP FUNCTION IF EXISTS allura.decision_collision_wait()'); }
});

test('run decision current original participants bindings and foreign scopes cannot be substituted', async () => {
  const { scope, command } = await prepared(), foreign = { groupId: `allura-decision-foreign-${randomUUID()}`, workspaceId: randomUUID() };
  await f.owner`INSERT INTO allura.tenants(group_id) VALUES(${foreign.groupId})`;
  for (const id of [f.ids.viewer, f.ids.curator]) { await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${foreign.groupId},${id}::uuid)`; }
  const other = await prepared({ ...scope, workspaceId: randomUUID() }, 'viewer', 'curator'), distant = await prepared(foreign, 'viewer', 'curator');
  const before = await snapshot(command.runId);
  for (const identity of [f.identities.author, f.identities.viewer, f.identities.curator, f.identities.org, f.identities.machine]) { await expect(decideRun(f.app, identity, scope, command)).rejects.toThrow('forbidden'); }
  await expect(decideRun(f.app, { ...f.identities.reviewer }, scope, command)).rejects.toThrow('unauthenticated');
  // Grant access to the populated second workspace: hidden and missing runs match.
  await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${other.scope.workspaceId}::uuid,${f.ids.reviewer}::uuid,'workspace_admin',${f.ids.author}::uuid)`;
  for (const runId of [command.runId, randomUUID()]) { await expect(decideRun(f.app, f.identities.reviewer, other.scope, { ...command, runId })).rejects.toThrow('not_found'); }
  await expect(decideRun(f.app, f.identities.reviewer, distant.scope, command)).rejects.toThrow('forbidden');
  await expect(decideRun(f.app, f.identities.reviewer, scope, { ...command, approvalRequestId: distant.command.approvalRequestId })).rejects.toThrow('conflict');
  for (const participant of [f.ids.author, f.ids.reviewer]) {
    for (const table of ['principals','memberships','workspace_grants','identity_bindings']) {
      const where = table === 'principals' ? 'id=$1::uuid' : table === 'identity_bindings' ? 'principal_id=$1::uuid' : 'principal_id=$1::uuid AND group_id=$2';
      const args = ['principals','identity_bindings'].includes(table) ? [participant] : [participant, scope.groupId];
      await f.owner.unsafe(`UPDATE allura.${table} SET active=false WHERE ${where}`, args);
      try { await expect(decideRun(f.app, f.identities.reviewer, scope, command)).rejects.toThrow('forbidden'); }
      finally { await f.owner.unsafe(`UPDATE allura.${table} SET active=true WHERE ${where}`, args); }
    }
    await f.owner`UPDATE allura.workspace_grants SET role='curator' WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND principal_id=${participant}::uuid`;
    try { await expect(decideRun(f.app, f.identities.reviewer, scope, command)).rejects.toThrow('forbidden'); }
    finally { await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND principal_id=${participant}::uuid`; }
  }
  for (const [table, field, denied, restored] of [['tenants','active',false,true],['workspaces','locked',true,false]] as const) {
    await f.owner.unsafe(`UPDATE allura.${table} SET ${field}=$1 WHERE group_id=$2`, [denied, scope.groupId]);
    try { await expect(decideRun(f.app, f.identities.reviewer, scope, command)).rejects.toThrow('forbidden'); }
    finally { await f.owner.unsafe(`UPDATE allura.${table} SET ${field}=$1 WHERE group_id=$2`, [restored, scope.groupId]); }
  }
  // Alternate currently active identities do not replace the original binding.
  for (const [participant, alias] of [[f.ids.author, 'viewer'], [f.ids.reviewer, 'curator']] as const) {
    await f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${participant}::uuid`;
    await f.owner`UPDATE allura.identity_bindings SET principal_id=${participant}::uuid WHERE subject=${`${f.scope.groupId}:${alias}`}`;
    try { await expect(decideRun(f.app, alias === 'curator' ? f.identities.curator : f.identities.reviewer, scope, command)).rejects.toThrow('forbidden'); }
    finally { await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids[alias]}::uuid WHERE subject=${`${f.scope.groupId}:${alias}`}`; await f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${participant}::uuid`; }
  }
  expect(await snapshot(command.runId)).toEqual(before);
  const receipt = await decideRun(f.app, f.identities.reviewer, scope, command);
  for (const participant of [f.ids.author, f.ids.reviewer]) {
    await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND principal_id=${participant}::uuid`;
    try { await expect(decideRun(f.app, f.identities.reviewer, scope, command)).rejects.toThrow('forbidden'); }
    finally { await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND principal_id=${participant}::uuid`; }
  }
  expect(await decideRun(f.app, f.identities.reviewer, scope, command)).toBe(receipt);
});

test('run decision private SQL immutable rows scoped links and pooled contexts enforce isolation', async () => {
  const { scope, command } = await prepared(), other = await prepared(scope);
  await decideRun(f.app, f.identities.reviewer, scope, command);
  const [role] = await f.app`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`; expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  const [security] = await f.owner`SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='allura.run_approval_decisions'::regclass`;
  expect(security.relrowsecurity).toBe(true); expect(security.relforcerowsecurity).toBe(true); expect(security.owner).not.toBe('allura_app');
  for (const query of ['SELECT * FROM allura.run_approval_decisions','INSERT INTO allura.run_approval_decisions DEFAULT VALUES','UPDATE allura.run_approval_decisions SET rationale=rationale','DELETE FROM allura.run_approval_decisions','TRUNCATE allura.run_approval_decisions CASCADE', "SELECT allura.validate_run_decision('{}')", `SELECT allura.lock_run_decision_participants('${scope.groupId}','${scope.workspaceId}','${command.runId}')`]) { await expect(f.app.unsafe(query).execute()).rejects.toThrow('permission denied'); }
  for (const query of ['UPDATE allura.run_approval_decisions SET rationale=rationale WHERE run_id=$1::uuid','DELETE FROM allura.run_approval_decisions WHERE run_id=$1::uuid']) { await expect(f.owner.unsafe(query, [command.runId]).execute()).rejects.toThrow('append-only'); }
  await expect(f.owner.unsafe('TRUNCATE allura.run_approval_decisions CASCADE').execute()).rejects.toThrow('append-only');
  await expect(f.owner`INSERT INTO allura.run_approval_decisions SELECT group_id,workspace_id,${randomUUID()}::uuid,run_id,${other.command.approvalRequestId}::uuid,reviewer_id,reviewed_evidence_digest,decision,rationale,decision_text,1,created_at FROM allura.run_approval_decisions WHERE run_id=${command.runId}::uuid`.execute()).rejects.toThrow('foreign key');
  const pooled = new SQL(f.appUrl, { max: 1 });
  try {
    expect(await scopedTransaction(pooled, f.identities.reviewer, scope, 'audit:read', tx => tx`SELECT approval_decision_id FROM allura.run_journal WHERE run_id=${command.runId}::uuid AND kind='approval_decided'`)).toHaveLength(1);
    expect(await pooled`SELECT run_id FROM allura.run_journal`).toHaveLength(0);
    await expect(pooled`SELECT allura.decide_run(${scope.groupId},${scope.workspaceId}::uuid,${command}::jsonb,${await runDefinition()}::jsonb)`.execute()).rejects.toThrow('forbidden');
    await pooled.begin(async tx => { await tx`SELECT set_config('allura.kind','human',true),set_config('allura.workspace','malformed',true)`; expect(await tx`SELECT run_id FROM allura.run_journal`).toHaveLength(0); });
  } finally { await pooled.close(); }
});

test('run decision concurrent duplicates and competing choices produce one authoritative transition', async () => {
  const { scope, command } = await prepared();
  const receipts = await Promise.all(Array.from({ length: 6 }, () => decideRun(f.app, f.identities.reviewer, scope, command)));
  expect(new Set(receipts).size).toBe(1);
  expect(await f.owner`SELECT id FROM allura.run_approval_decisions WHERE run_id=${command.runId}::uuid`).toHaveLength(1);
  expect(await f.owner`SELECT id FROM allura.run_operation_receipts WHERE run_id=${command.runId}::uuid AND command='decide'`).toHaveLength(1);
  for (const sameKey of [false, true]) {
    const next = await prepared(), rival = { ...next.command, operationKey: sameKey ? next.command.operationKey : randomUUID(), decision: 'reject' };
    const results = await Promise.allSettled([decideRun(f.app, f.identities.reviewer, next.scope, next.command), decideRun(f.app, f.identities.reviewer, next.scope, rival)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.message).toBe('run_conflict');
    expect(await f.owner`SELECT id FROM allura.run_approval_decisions WHERE run_id=${next.command.runId}::uuid`).toHaveLength(1);
    expect((await state(next.command.runId)).revision).toBe(4);
  }
  const stable = await snapshot(command.runId), fresh = await Promise.all([child(payload(scope, command)), child(payload(scope, command))]);
  expect(fresh.map(r => r.receipt)).toEqual([receipts[0],receipts[0]]); expect(await snapshot(command.runId)).toEqual(stable);
});

test('run decision insert update deferred faults and backend termination leave no partial approval', async () => {
  for (const [table, event, deferred] of [['run_approval_decisions','INSERT',false],['run_operation_receipts','INSERT',false],['run_journal','INSERT',false],['run_steps','UPDATE',false],['run_state','UPDATE',false],['run_approval_decisions','INSERT',true]] as const) {
    const { scope, command } = await prepared(), before = await snapshot(command.runId);
    await f.owner.unsafe(`CREATE FUNCTION allura.decision_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid THEN RAISE EXCEPTION 'private decision fault'; END IF; RETURN NEW; END $$; CREATE ${deferred ? 'CONSTRAINT ' : ''}TRIGGER decision_fault ${deferred ? 'AFTER' : 'BEFORE'} ${event} ON allura.${table} ${deferred ? 'DEFERRABLE INITIALLY DEFERRED' : ''} FOR EACH ROW EXECUTE FUNCTION allura.decision_fault()`);
    try { await expect(decideRun(f.app, f.identities.reviewer, scope, command)).rejects.toThrow('run_unknown'); }
    finally { await f.owner.unsafe(`DROP TRIGGER decision_fault ON allura.${table}; DROP FUNCTION allura.decision_fault()`); }
    expect(await snapshot(command.runId)).toEqual(before);
    expect(JSON.parse(await decideRun(f.app, f.identities.reviewer, scope, command)).phaseAtAcceptance).toBe('ready');
  }
  const { scope, command } = await prepared(), before = await snapshot(command.runId), app = new SQL(f.appUrl, { max: 1 }), gate = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 });
  let release = () => {}, holding: Promise<unknown> | undefined, pending: Promise<unknown> | undefined;
  try {
    const pid = (await app`SELECT pg_backend_pid() AS pid`)[0].pid as number, gatePid = (await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    await f.owner.unsafe(`CREATE FUNCTION allura.decision_kill_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid THEN PERFORM pg_advisory_xact_lock(120029); END IF; RETURN NEW; END $$; CREATE TRIGGER decision_kill_wait BEFORE INSERT ON allura.run_operation_receipts FOR EACH ROW EXECUTE FUNCTION allura.decision_kill_wait()`);
    let ready = () => {}; const entered = new Promise<void>(r => { ready = r; }), wait = new Promise<void>(r => { release = r; });
    holding = gate.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(120029)`; ready(); await wait; }); await entered;
    pending = decideRun(app, f.identities.reviewer, scope, command).then(() => 'unexpected', e => (e as Error).message);
    await blocked(pid, gatePid); expect((await f.owner`SELECT pg_terminate_backend(${pid}::int) AS killed`)[0].killed).toBe(true);
    expect(await pending).toBe('run_unknown'); release(); await holding;
    expect(await snapshot(command.runId)).toEqual(before);
  } finally { release(); await Promise.allSettled([holding,pending]); await app.close(); await gate.close(); await f.owner.unsafe('DROP TRIGGER IF EXISTS decision_kill_wait ON allura.run_operation_receipts; DROP FUNCTION IF EXISTS allura.decision_kill_wait()'); }
  expect(JSON.parse(await decideRun(f.app, f.identities.reviewer, scope, command)).phaseAtAcceptance).toBe('ready');
});

test('run decision owner and reviewer revocation serialize both attributable database orders', async () => {
  for (const participant of [f.ids.author,f.ids.reviewer]) {
    const app = new SQL(f.appUrl, { max: 1 }), revoker = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 }), gate = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 });
    const runPid = (await app`SELECT pg_backend_pid() AS pid`)[0].pid as number, revokePid = (await revoker`SELECT pg_backend_pid() AS pid`)[0].pid as number, gatePid = (await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    let release = () => {}, holding: Promise<unknown> | undefined, pending: Promise<unknown> | undefined, revocation: Promise<unknown> | undefined;
    try {
      const { scope, command } = await prepared();
      await f.owner.unsafe(`CREATE FUNCTION allura.decision_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid THEN PERFORM pg_advisory_xact_lock(120030); END IF; RETURN NEW; END $$; CREATE TRIGGER decision_wait BEFORE INSERT ON allura.run_approval_decisions FOR EACH ROW EXECUTE FUNCTION allura.decision_wait()`);
      let ready = () => {}; const entered = new Promise<void>(r => { ready = r; }), wait = new Promise<void>(r => { release = r; });
      holding = gate.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(120030)`; ready(); await wait; }); await entered;
      pending = decideRun(app, f.identities.reviewer, scope, command); await blocked(runPid, gatePid);
      revocation = revoker.begin(tx => tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND principal_id=${participant}::uuid`);
      await blocked(revokePid, runPid); release(); await holding; expect(typeof await pending).toBe('string'); await revocation;
      expect(await f.owner`SELECT id FROM allura.run_approval_decisions WHERE run_id=${command.runId}::uuid`).toHaveLength(1);
      await expect(decideRun(app, f.identities.reviewer, scope, command)).rejects.toThrow('forbidden');
      await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND principal_id=${participant}::uuid`;
      await f.owner.unsafe('DROP TRIGGER decision_wait ON allura.run_approval_decisions; DROP FUNCTION allura.decision_wait()');
      const second = await prepared(), before = await snapshot(second.command.runId);
      const revoked = new Promise<void>(r => { ready = r; }), waitRevoke = new Promise<void>(r => { release = r; });
      revocation = revoker.begin(async tx => { await tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${second.scope.groupId} AND workspace_id=${second.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`; ready(); await waitRevoke; }); await revoked;
      pending = decideRun(app, f.identities.reviewer, second.scope, second.command).then(() => 'unexpected', e => (e as Error).message);
      await blocked(runPid, revokePid); release(); await revocation; expect(await pending).toContain('forbidden'); expect(await snapshot(second.command.runId)).toEqual(before);
    } finally { release(); await Promise.allSettled([holding,pending,revocation]); await f.owner.unsafe('DROP TRIGGER IF EXISTS decision_wait ON allura.run_approval_decisions; DROP FUNCTION IF EXISTS allura.decision_wait()'); await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${participant}::uuid`; await app.close(); await revoker.close(); await gate.close(); }
  }
}, 15000);

test('run decision source drift denies new approval while exact committed replay stays historical', async () => {
  const { scope, command } = await prepared(), before = await snapshot(command.runId);
  const root = await mkdtemp(join(tmpdir(), 'allura-decision-drift-')), source = new URL('../', import.meta.url).pathname;
  try {
    await cp(join(source,'src'), join(root,'src'), { recursive: true }); await cp(join(source,'migrations'), join(root,'migrations'), { recursive: true }); await symlink(join(source,'node_modules'), join(root,'node_modules'));
    const file = join(root,'src/runs-api.ts'), original = await readFile(file); await writeFile(file, Buffer.concat([original,Buffer.from('\n// Owned drift witness\n')]));
    expect(await child({ ...payload(scope,command), sourceRoot: join(root,'src') }, 1)).toEqual({ error: 'conflict' }); expect(await snapshot(command.runId)).toEqual(before);
    await expect(sqlDecision(scope, command, null)).rejects.toThrow('conflict');
    const receipt = await decideRun(f.app, f.identities.reviewer, scope, command), stable = await snapshot(command.runId);
    expect((await child({ ...payload(scope,command), sourceRoot: join(root,'src') })).receipt).toBe(receipt); expect(await snapshot(command.runId)).toEqual(stable);
    expect(await readFile(join(source,'src/runs-api.ts'))).toEqual(original);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Shorten only a newly inserted owned request, preserving its complete binding
// and all constraints. Real database time and production decide enforce expiry;
// this is not a naturally elapsed 24-hour retention witness.
async function expiring() {
  const scope = { ...f.scope, workspaceId: randomUUID() };
  await f.owner.unsafe(`CREATE FUNCTION allura.decision_short_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.workspace_id='${scope.workspaceId}'::uuid THEN NEW.expires_at:=NEW.created_at+interval '1500 milliseconds'; NEW.request_text:=jsonb_set(NEW.request_text::jsonb,'{expiresAt}',to_jsonb(to_char(NEW.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))::text; END IF; RETURN NEW; END $$; CREATE TRIGGER decision_short_expiry BEFORE INSERT ON allura.run_approval_requests FOR EACH ROW EXECUTE FUNCTION allura.decision_short_expiry()`);
  try { return await prepared(scope); } finally { await f.owner.unsafe('DROP TRIGGER decision_short_expiry ON allura.run_approval_requests; DROP FUNCTION allura.decision_short_expiry()'); }
}
async function waitExpiry(runId: string) { const [r] = await f.owner`SELECT greatest(0,ceil(extract(epoch FROM (expires_at-clock_timestamp()))*1000))::int AS ms FROM allura.run_approval_requests WHERE run_id=${runId}::uuid`; await Bun.sleep(r.ms + 10); }

test('run decision database expiry rejects pending and in-flight approval without renewing historical replay', async () => {
  const first = await expiring(), before = await snapshot(first.command.runId); await waitExpiry(first.command.runId);
  await expect(decideRun(f.app, f.identities.reviewer, first.scope, first.command)).rejects.toThrow('conflict'); expect(await snapshot(first.command.runId)).toEqual(before);
  const second = await expiring(), receipt = await decideRun(f.app, f.identities.reviewer, second.scope, second.command), stable = await snapshot(second.command.runId); await waitExpiry(second.command.runId);
  expect(await decideRun(f.app, f.identities.reviewer, second.scope, second.command)).toBe(receipt); expect(await snapshot(second.command.runId)).toEqual(stable);
  await expect(decideRun(f.app, f.identities.reviewer, second.scope, { ...second.command, operationKey: randomUUID() })).rejects.toThrow('conflict');
});

test('run decision final expiry guard rolls back after attributable valid deferred entry', async () => {
  const app = new SQL(f.appUrl, { max: 1 }), gate = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!, { max: 1 });
  let release = () => {}, holding: Promise<unknown> | undefined, pending: Promise<unknown> | undefined;
  try {
    const pid = (await app`SELECT pg_backend_pid() AS pid`)[0].pid as number, gatePid = (await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    const third = await expiring(), prior = await snapshot(third.command.runId);
    // Reaching this deferred trigger proves every initial guard and write passed.
    // The trigger itself refuses to enter the barrier unless database time is valid.
    await f.owner.unsafe(`CREATE FUNCTION allura.decision_expire_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${third.command.runId}'::uuid THEN IF NOT EXISTS(SELECT FROM allura.run_approval_requests WHERE id=NEW.request_id AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'fixture missed valid deferred entry'; END IF; PERFORM pg_advisory_xact_lock(120032); END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER decision_expire_wait AFTER INSERT ON allura.run_approval_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.decision_expire_wait()`);
    let ready = () => {}; const entered = new Promise<void>(r => { ready = r; }), wait = new Promise<void>(r => { release = r; });
    holding = gate.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(120032)`; ready(); await wait; }); await entered;
    pending = decideRun(app, f.identities.reviewer, third.scope, third.command).then(receipt => ({ receipt }), e => ({ error: (e as Error).message }));
    await blocked(pid, gatePid);
    const [entry] = await f.owner`SELECT expires_at>clock_timestamp() AS valid,extract(epoch FROM (expires_at-clock_timestamp()))*1000 AS remaining_ms FROM allura.run_approval_requests WHERE run_id=${third.command.runId}::uuid`;
    expect(entry.valid).toBe(true);
    console.log(JSON.stringify({ decisionExpiryBoundary: { pid, gatePid, validDeferredEntry: true, remainingMs: entry.remaining_ms, ownedRequestTtlMs: 1500, natural24HourWitness: false } }));
    await waitExpiry(third.command.runId);
    expect((await f.owner`SELECT expires_at<=clock_timestamp() AS expired FROM allura.run_approval_requests WHERE run_id=${third.command.runId}::uuid`)[0].expired).toBe(true);
    release(); await holding;
    expect(await pending).toEqual({ error: 'run_conflict' });
    expect(await snapshot(third.command.runId)).toEqual(prior);
  } finally { release(); await Promise.allSettled([holding,pending]); await app.close(); await gate.close(); await f.owner.unsafe('DROP TRIGGER IF EXISTS decision_expire_wait ON allura.run_approval_decisions; DROP FUNCTION IF EXISTS allura.decision_expire_wait()'); }
});

test('run decision signed HTTP rejects malformed raw UTF8 without writes and preserves exact Unicode', async () => {
  const { scope, command } = await prepared(), origin = 'https://decision-utf8.invalid';
  const gateway = createCoreGateway(f.app, f.humanConfig, origin, new Uint8Array(32).fill(7), { identity: EMBEDDING, embed: async (): Promise<number[]> => { throw new Error('No embedding for decisions'); } });
  const headers = { 'Cf-Access-Jwt-Assertion': f.jwt('reviewer'), Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'content-type': 'application/json' };
  const path = `/api/runs/decide?group_id=${scope.groupId}&workspace_id=${scope.workspaceId}`;
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: gateway });
  const before = await snapshot(command.runId), other = await unrelated();
  const envelope = JSON.stringify({ ...command, rationale: 'RAW_MARKER' }).split('RAW_MARKER');
  const malformed = [Buffer.from([0x80]), Buffer.from([0xc0,0xaf]), Buffer.from([0xe2,0x82]), Buffer.from([0xed,0xa0,0x80]), Buffer.from([0xf4,0x90,0x80,0x80])];
  try {
    for (const bytes of malformed) {
      const body = Buffer.concat([Buffer.from(envelope[0]!),bytes,Buffer.from(envelope[1]!)]);
      const response = await fetch(new URL(path, server.url), { method: 'POST', headers, body });
      expect(response.status).toBe(400); expect(await response.json()).toEqual({ outcome: 'invalid' });
      expect(await snapshot(command.runId)).toEqual(before); expect(await unrelated()).toEqual(other);
      for (const [changed,status] of [[{ 'Cf-Access-Jwt-Assertion': 'forged' },401],[{ Origin: 'https://foreign.invalid' },403],[{ 'Sec-Fetch-Site': 'cross-site' },403]] as [Record<string,string>,number][]) {
        const request = new Request(origin + path, { method: 'POST', headers: { ...headers, ...changed }, body });
        expect((await gateway(request)).status).toBe(status); expect(request.bodyUsed).toBe(false);
      }
    }
    for (const rationale of [' Explicit replacement \ufffd ', ' Exact Cafe\u0301 🧠\r\n日本語 ']) {
      const next = await prepared(scope), value = { ...next.command, rationale };
      const bytes = Buffer.from(JSON.stringify(value)); let index = 0;
      const body = new ReadableStream<Uint8Array>({ pull(controller) { if (index < bytes.length) { controller.enqueue(bytes.subarray(index,index + 1)); index++; } else { controller.close(); } } });
      const response = await fetch(new URL(path, server.url), { method: 'POST', headers, body });
      expect(response.status).toBe(200);
      const receipt = await response.json();
      const [decision] = await f.owner`SELECT rationale,decision_text FROM allura.run_approval_decisions WHERE run_id=${value.runId}::uuid`;
      expect(Buffer.from(decision.rationale)).toEqual(Buffer.from(rationale)); expect(JSON.parse(decision.decision_text).rationale).toBe(rationale);
      const replay = await fetch(new URL(path, server.url), { method: 'POST', headers, body: JSON.stringify(value) });
      expect(replay.status).toBe(200); expect(await replay.json()).toEqual(receipt);
    }
    expect(await snapshot(command.runId)).toEqual(before); expect(await unrelated()).toEqual(other);
  } finally { await server.stop(true); }
});

test('run decision HTTP authenticates before body and lost committed response reconciles after restart', async () => {
  const { scope, command } = await prepared(), origin = 'https://decision.invalid';
  const makeGateway = () => createCoreGateway(f.app, f.humanConfig, origin, new Uint8Array(32).fill(7), { identity: EMBEDDING, embed: async (): Promise<number[]> => { throw new Error('No embedding for decisions'); } });
  const request = (url = origin, value: unknown = command, headers: Record<string,string> = {}) => new Request(`${url}/api/runs/decide?group_id=${scope.groupId}&workspace_id=${scope.workspaceId}`, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': f.jwt('reviewer'), Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) });
  const gateway = makeGateway(), before = await snapshot(command.runId);
  for (const [headers,status] of [[{ 'Cf-Access-Jwt-Assertion': '' },401],[{ 'Cf-Access-Jwt-Assertion': 'forged' },401],[{ Authorization: 'Bearer invalid' },401],[{ 'Cf-Access-Jwt-Assertion': '', Cookie: `CF_Authorization=${f.jwt('reviewer')}`, Authorization: 'Bearer invalid' },401],[{ Origin: 'https://foreign.invalid' },403],[{ 'Sec-Fetch-Site': 'cross-site' },403],[{ 'Cf-Access-Jwt-Assertion': f.jwt('org') },403],[{ 'Cf-Access-Jwt-Assertion': f.jwt('viewer') },403]] as [Record<string,string>,number][]) {
    const req = request(origin, { private: 'PRIVATE'.repeat(20000) }, headers), response = await gateway(req); expect(response.status).toBe(status); expect(req.bodyUsed).toBe(false); expect(await response.text()).not.toContain('PRIVATE');
  }
  for (const value of [{ ...command, outcome: 'succeeded' }, { ...command, rationale: '\0' }]) { expect((await gateway(request(origin, value))).status).toBe(400); }
  const extra = request(); expect((await gateway(new Request(extra.url + '&actor=forged', extra))).status).toBe(400);
  expect(await snapshot(command.runId)).toEqual(before);
  let commits = 0;
  const first = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: async req => { const response = await gateway(req); expect(response.status).toBe(200); commits++; first.stop(true); return response; } });
  try { await expect(fetch(request(first.url.origin))).rejects.toThrow(); } finally { first.stop(true); }
  expect(commits).toBe(1);
  const [stored] = await f.owner`SELECT receipt_text FROM allura.run_operation_receipts WHERE run_id=${command.runId}::uuid AND command='decide'`, stable = await snapshot(command.runId);
  const retryGateway = makeGateway(), retry = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: req => retryGateway(req) });
  try { const response = await fetch(request(retry.url.origin)); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); expect(await response.json()).toEqual(JSON.parse(stored.receipt_text)); } finally { retry.stop(true); }
  expect((await child(payload(scope,command))).receipt).toBe(stored.receipt_text); expect(await snapshot(command.runId)).toEqual(stable);
});
