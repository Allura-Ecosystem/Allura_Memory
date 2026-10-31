import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { startRun } from '../src/runs.ts';
import { scopedTransaction } from '../src/persistence.ts';
import { runDefinition } from '../src/run-contract.ts';

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  f = await fixture(`allura-runs-${randomUUID()}`);
  await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${f.ids.reviewer}::uuid`;
});
afterAll(async () => { await f?.close(); });
function input() {
  const text = 'Synthetic exact run artifact\r\nCafe\u0301 🧠';
  return { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 1, goal: 'Synthetic run goal', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
}
async function counts() {
  return Promise.all(['run_definitions', 'run_records', 'run_state', 'run_steps', 'run_journal', 'run_operation_receipts', 'events', 'semantic_versions', 'proposal_state'].map(async table => (await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${table} WHERE group_id=$1`, [f.scope.groupId]))[0].n));
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
  for (const reviewerPrincipalId of [f.ids.author, f.ids.viewer, f.ids.curator, f.ids.org, f.ids.machine, randomUUID()]) { await expect(startRun(f.app, f.identities.author, f.scope, { ...v, reviewerPrincipalId })).rejects.toThrow('forbidden'); }
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
