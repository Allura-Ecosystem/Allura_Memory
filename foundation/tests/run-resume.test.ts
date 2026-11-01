import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { startRun, advanceRun, decideRun, resumeRun } from '../src/runs.ts';
import { scopedTransaction } from '../src/persistence.ts';
import { runDefinition, type RunCommandV1 } from '../src/run-contract.ts';
import { finishHandoff, type PreparationClaim } from '../src/run-execution.ts';
import { type Scope } from '../src/authority.ts';
import { cp, mkdtemp, symlink, appendFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCoreGateway } from '../src/core-api.ts';
import { EMBEDDING } from '../src/embedding.ts';

function payload(scope: Scope, command: RunCommandV1, mode = 'resume') {
  return { url:f.appUrl, assertion:f.jwt('author'), issuer:f.humanConfig.issuer, publicKey:f.humanConfig.keys.get('key')!.export({type:'spki',format:'pem'}), scope,command,mode };
}
async function child(value: object, expected = 0) {
  const p = Bun.spawn([process.execPath,new URL('./run-process-fixture.ts',import.meta.url).pathname],{stdin:new Blob([JSON.stringify(value)]),stdout:'pipe',stderr:'pipe',env:{...process.env,ALLURA_DISPOSABLE_DB:'owned-test-container'}});
  const [out,err,code] = await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
  expect(err).toBe(''); expect(code).toBe(expected); return JSON.parse(out);
}
async function crash(value: object) {
  const p = Bun.spawn([process.execPath,new URL('./run-process-fixture.ts',import.meta.url).pathname],{stdin:new Blob([JSON.stringify({...value,hold:true})]),stdout:'pipe',stderr:'pipe',env:{...process.env,ALLURA_DISPOSABLE_DB:'owned-test-container'}});
  try {
    const reader = p.stdout.getReader(); let text = '';
    while (!text.includes('\n')) { const next = await reader.read(); if (next.done) { throw new Error('Child ended before durable boundary'); } text += new TextDecoder().decode(next.value); }
    reader.releaseLock(); const result = JSON.parse(text.split('\n')[0]!);
    p.kill('SIGKILL'); await p.exited; expect(await new Response(p.stderr).text()).toBe('');
    return result;
  } finally { p.kill('SIGKILL'); await p.exited; }
}
async function blocked(waiter: number, blocker: number) {
  expect(waiter).not.toBe(blocker);
  for (let i=0;i<100;i++) {
    if ((await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS blocked`)[0].blocked) { console.log(JSON.stringify({resumeLockWitness:{waiter,blocker}})); return; }
    await Bun.sleep(10);
  }
  throw new Error('Exact resume waiter not observed');
}

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => { f = await fixture(`allura-resume-${randomUUID()}`); });
afterAll(async () => { await f?.close(); });
async function prepared(decision: 'approve' | 'reject' | null = 'approve', scope = { ...f.scope, workspaceId: randomUUID() }) {
  await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${scope.workspaceId}::uuid,'Resume fixture',${f.ids.author}::uuid)`;
  for (const id of [f.ids.author,f.ids.reviewer]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids.author}::uuid)`; }
  const text = 'Private resume artifact 🧠\r\n';
  const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 9, goal: 'Private handoff', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
  const start = await startRun(f.app,f.identities.author,scope,input), runId = JSON.parse(start).runId as string;
  const advanceCommand = { runId,expectedRevision:1,operationKey:randomUUID() }, advance = await advanceRun(f.app,f.identities.author,scope,advanceCommand);
  const a = JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${runId}::uuid`)[0].request_text);
  const decisionCommand = { runId,expectedRevision:a.requestedAtRevision,operationKey:randomUUID(),approvalRequestId:a.id,reviewedEvidenceDigest:a.evidenceDigest,decision:decision ?? 'approve',rationale:'Exact continuation approval' };
  const decided = decision ? await decideRun(f.app,f.identities.reviewer,scope,decisionCommand) : null;
  const command = { runId,expectedRevision:decided ? JSON.parse(decided).acceptedRevision as number : a.requestedAtRevision as number,operationKey:randomUUID() };
  return { scope,command,input,start,advance,advanceCommand,decisionCommand,decided };
}
async function admit(scope: Scope, command: unknown) {
  return scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.resume_run(${scope.groupId},${scope.workspaceId}::uuid,${command}::jsonb,${await runDefinition()}::jsonb) AS receipt`)[0].receipt as string);
}
async function claim(scope: Scope, receipt: string) {
  const op = JSON.parse(receipt);
  return scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.claim_run_handoff(${scope.groupId},${scope.workspaceId}::uuid,${op.runId}::uuid,${op.id}::uuid,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS claim`)[0].claim as PreparationClaim | null);
}
async function snapshot(runId: string) {
  return Promise.all(['run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions','run_handoff_links'].map(async table => [...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t WHERE run_id=$1::uuid ORDER BY 1`,[runId])]));
}
async function state(runId: string) { return (await f.owner`SELECT phase,outcome,reason,next_step_id,revision FROM allura.run_state WHERE run_id=${runId}::uuid`)[0]; }
async function immutable(runId: string) { return Promise.all(['run_approval_requests','run_approval_decisions','run_effect_receipts'].map(async table => [...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t WHERE run_id=$1::uuid ${table==='run_effect_receipts' ? "AND step_id='prepare'" : ''} ORDER BY 1`,[runId])])); }

test('run resume separates durable admission claim and one linked local completion',async () => {
  const { scope,command } = await prepared(), before = await immutable(command.runId);
  const receipt = await admit(scope,command); expect(JSON.parse(receipt)).toMatchObject({command:'resume',phaseAtAcceptance:'ready',acceptedRevision:5});
  expect((await state(command.runId)).phase).toBe('ready');
  const c = await claim(scope,receipt); expect(c).not.toBeNull(); expect((await state(command.runId)).phase).toBe('running');
  await finishHandoff(f.app,f.identities.author,scope,c!);
  expect(await state(command.runId)).toEqual({phase:'terminal',outcome:'succeeded',reason:'none',next_step_id:null,revision:7});
  expect(await immutable(command.runId)).toEqual(before);
  const [link] = await f.owner`SELECT * FROM allura.run_handoff_links WHERE run_id=${command.runId}::uuid`;
  const e = JSON.parse((await f.owner`SELECT receipt_text FROM allura.run_effect_receipts WHERE id=${link.handoff_receipt_id}::uuid`)[0].receipt_text);
  expect(e).toMatchObject({stepId:'handoff',preparedReceiptId:link.prepared_receipt_id,approvalRequestId:link.approval_request_id,approvalDecisionId:link.approval_decision_id});
  expect(await resumeRun(f.app,f.identities.author,scope,command)).toBe(receipt);
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid AND step_id='handoff'`)[0].n).toBe(1);
});

test('run advance replay during committed handoff claim returns original receipt without mutation',async () => {
  const {scope,command,advanceCommand,advance} = await prepared();
  // Each helper commits separately: no completion follows this durable claim.
  const receipt = await admit(scope,command), handoff = await claim(scope,receipt);
  expect(handoff).not.toBeNull();
  expect(await state(command.runId)).toMatchObject({phase:'running',next_step_id:'handoff'});
  expect((await f.owner`SELECT state,lease_until FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`)[0]).toEqual({state:'completed',lease_until:null});
  const completeSnapshot = async () => ({
    history: await snapshot(command.runId),
    records: [...await f.owner`SELECT to_jsonb(r)::text AS row FROM allura.run_records r WHERE id=${command.runId}::uuid`],
    definitions: [...await f.owner`SELECT to_jsonb(d)::text AS row FROM allura.run_definitions d JOIN allura.run_records r ON (d.group_id,d.workspace_id,d.definition_id,d.revision)=(r.group_id,r.workspace_id,r.definition_id,r.definition_revision) WHERE r.id=${command.runId}::uuid`],
  });
  const before = await completeSnapshot();
  expect(await advanceRun(f.app,f.identities.author,scope,advanceCommand)).toBe(advance);
  expect(await completeSnapshot()).toEqual(before);
  const replay = await scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.claim_run_prepare(${scope.groupId},${scope.workspaceId}::uuid,${advanceCommand}::jsonb,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS result`)[0].result);
  expect(replay).toEqual({receipt:advance,claim:null});
  expect(await completeSnapshot()).toEqual(before);
});

test('run resume fresh processes recover admission and expired claim crashes without repeating preparation',async () => {
  for (const mode of ['resume-admit','handoff-claim']) {
    const {scope,command} = await prepared(), before = await immutable(command.runId);
    const lost = await crash(payload(scope,command,mode));
    expect(JSON.parse(lost.receipt).command).toBe('resume');
    expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid AND step_id='handoff'`).toHaveLength(0);
    if (mode === 'handoff-claim') {
      expect(lost.claim).not.toBeNull();
      expect((await child(payload(scope,command))).receipt).toBe(lost.receipt);
      expect((await state(command.runId)).phase).toBe('running');
      const [timing] = await f.owner`SELECT ceil(extract(epoch FROM(due_at-clock_timestamp()))*1000)::int AS ms FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='handoff'`;
      await Bun.sleep(timing.ms+10);
      expect((await f.owner`SELECT lease_until<=clock_timestamp() AS expired,due_at<=clock_timestamp() AS due FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='handoff'`)[0]).toEqual({expired:true,due:true});
    }
    const receipts = await Promise.all([child(payload(scope,command)),child(payload(scope,command))]);
    expect(receipts.map(r => r.receipt)).toEqual([lost.receipt,lost.receipt]);
    expect((await state(command.runId)).outcome).toBe('succeeded'); expect(await immutable(command.runId)).toEqual(before);
    expect((await f.owner`SELECT attempts FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`)[0].attempts).toBe(1);
    expect((await f.owner`SELECT attempts FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='handoff'`)[0].attempts).toBe(mode === 'handoff-claim' ? 2 : 1);
    if (lost.claim) { await expect(finishHandoff(f.app,f.identities.author,scope,lost.claim)).rejects.toThrow('conflict'); }
  }
},20000);

test('run resume strict commands changed envelopes and cross command keys cannot create effects',async () => {
  const {scope,command,input} = await prepared(), before = await snapshot(command.runId);
  for (const bad of [null,[],{}, {...command,actor:f.ids.author},{...command,approval:true},{...command,fence:1},{...command,expectedRevision:null},{...command,expectedRevision:1.1},{...command,operationKey:'bad\n'},{...command,runId:'bad'}]) {
    await expect(resumeRun(f.app,f.identities.author,scope,bad)).rejects.toThrow('invalid'); await expect(admit(scope,bad)).rejects.toThrow('invalid');
  }
  await expect(resumeRun(f.app,f.identities.author,scope,{...command,expectedRevision:1})).rejects.toThrow('conflict');
  await expect(resumeRun(f.app,f.identities.author,scope,{...command,operationKey:input.operationKey})).rejects.toThrow('conflict');
  expect(await snapshot(command.runId)).toEqual(before);
  const receipt = await resumeRun(f.app,f.identities.author,scope,command), stable = await snapshot(command.runId);
  await expect(startRun(f.app,f.identities.author,scope,{...input,operationKey:command.operationKey})).rejects.toThrow('conflict');
  await expect(advanceRun(f.app,f.identities.author,scope,command)).rejects.toThrow('conflict');
  for (const changed of [{...command,expectedRevision:5},{...command,runId:randomUUID()},{...command,operationKey:randomUUID()}]) { await expect(resumeRun(f.app,f.identities.author,scope,changed)).rejects.toThrow(); }
  expect(await resumeRun(f.app,f.identities.author,scope,command)).toBe(receipt); expect(await snapshot(command.runId)).toEqual(stable);
});

test('run resume original humans current grants bindings and foreign scopes deny every boundary',async () => {
  const {scope,command} = await prepared(), other = await prepared();
  const receipt = await admit(scope,command), c = (await claim(scope,receipt))!, before = await snapshot(command.runId);
  for (const who of ['reviewer','viewer','org','machine'] as const) {
    await expect(resumeRun(f.app,f.identities[who],scope,command)).rejects.toThrow();
    await expect(finishHandoff(f.app,f.identities[who],scope,c)).rejects.toThrow();
  }
  for (const foreign of [other.scope,{...scope,groupId:'allura-foreign'}]) { await expect(resumeRun(f.app,f.identities.author,foreign,command)).rejects.toThrow(); }
  for (const participant of [f.ids.author,f.ids.reviewer]) {
    for (const table of ['workspace_grants','memberships','identity_bindings']) {
      const where = table === 'identity_bindings' ? 'principal_id=$1::uuid' : table === 'memberships' ? 'principal_id=$1::uuid AND group_id=$2' : 'principal_id=$1::uuid AND group_id=$2 AND workspace_id=$3::uuid';
      const args = table === 'identity_bindings' ? [participant] : table === 'memberships' ? [participant,scope.groupId] : [participant,scope.groupId,scope.workspaceId];
      await f.owner.unsafe(`UPDATE allura.${table} SET active=false WHERE ${where}`,args);
      try { await expect(resumeRun(f.app,f.identities.author,scope,command)).rejects.toThrow('forbidden'); await expect(finishHandoff(f.app,f.identities.author,scope,c)).rejects.toThrow('forbidden'); }
      finally { await f.owner.unsafe(`UPDATE allura.${table} SET active=true WHERE ${where}`,args); }
    }
  }
  expect(await snapshot(command.runId)).toEqual(before);
  await finishHandoff(f.app,f.identities.author,scope,c);
});

test('run resume missing rejected approval stale fences and changed source never authorize handoff',async () => {
  for (const decision of [null,'reject'] as const) { const {scope,command} = await prepared(decision), before = await snapshot(command.runId); await expect(resumeRun(f.app,f.identities.author,scope,command)).rejects.toThrow('conflict'); expect(await snapshot(command.runId)).toEqual(before); }
  const {scope,command} = await prepared(), receipt = await admit(scope,command), c = (await claim(scope,receipt))!, stable = await snapshot(command.runId);
  for (const bad of [{...c,fence:c.fence+1},{...c,invocationId:randomUUID()},{...c,leaseId:randomUUID()},{...c,operationReceiptId:randomUUID()}]) { await expect(finishHandoff(f.app,f.identities.author,scope,bad)).rejects.toThrow('conflict'); }
  const root = await mkdtemp(join(tmpdir(),'allura-resume-drift-')), source = new URL('../',import.meta.url).pathname;
  try {
    await cp(join(source,'src'),join(root,'src'),{recursive:true}); await cp(join(source,'migrations'),join(root,'migrations'),{recursive:true}); await symlink(join(source,'node_modules'),join(root,'node_modules'));
    await appendFile(join(root,'src/runs-api.ts'),'\n// Owned source drift witness\n');
    expect(await child({...payload(scope,command,'handoff-finish'),claim:c,sourceRoot:join(root,'src')},1)).toEqual({error:'unknown'});
    expect(await snapshot(command.runId)).toEqual(stable);
    const fresh = await prepared();
    const blockedReceipt = await child({...payload(fresh.scope,fresh.command),sourceRoot:join(root,'src')});
    expect(JSON.parse(blockedReceipt.receipt).phaseAtAcceptance).toBe('blocked');
    expect((await state(fresh.command.runId)).reason).toBe('definition_drift');
  } finally { await rm(root,{recursive:true,force:true}); }
  await finishHandoff(f.app,f.identities.author,scope,c);
});

test('run resume lost committed HTTP response reconciles exact receipt with unchanged semantic stores',async () => {
  const {scope,command} = await prepared(), origin = 'https://resume.invalid';
  const unrelated = async () => Promise.all(['events','semantic_versions','proposal_state','semantic_intents'].map(async table => [...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t WHERE group_id=$1 ORDER BY 1`,[scope.groupId])]));
  const before = await unrelated();
  const gateway = createCoreGateway(f.app,f.humanConfig,origin,new Uint8Array(32).fill(7),{identity:EMBEDDING,embed:async (): Promise<number[]> => {throw new Error('No run embedding');}});
  const request = (url: string, headers: Record<string,string> = {}) => new Request(`${url}/api/runs/resume?group_id=${scope.groupId}&workspace_id=${scope.workspaceId}`,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt('author'),Origin:origin,'Sec-Fetch-Site':'same-origin','content-type':'application/json',...headers},body:JSON.stringify(command)});
  for (const [headers,status] of [[{'Cf-Access-Jwt-Assertion':'forged'},401],[{Authorization:'Bearer invalid'},401],[{Origin:'https://foreign.invalid'},403],[{'Sec-Fetch-Site':'cross-site'},403]] as [Record<string,string>,number][]) { const req=request(origin,headers); expect((await gateway(req)).status).toBe(status); expect(req.bodyUsed).toBe(false); }
  let commits = 0;
  const first = Bun.serve({hostname:'127.0.0.1',port:0,fetch:async req => {const response=await gateway(req);expect(response.status).toBe(200);commits++;first.stop(true);return response;}});
  try { await expect(fetch(request(first.url.origin))).rejects.toThrow(); } finally { first.stop(true); }
  expect(commits).toBe(1); expect((await state(command.runId)).outcome).toBe('succeeded');
  const [stored] = await f.owner`SELECT receipt_text FROM allura.run_operation_receipts WHERE run_id=${command.runId}::uuid AND command='resume'`, stable=await snapshot(command.runId);
  expect((await child(payload(scope,command))).receipt).toBe(stored.receipt_text); expect(await snapshot(command.runId)).toEqual(stable); expect(await unrelated()).toEqual(before);
});

test('run handoff owner and approved reviewer revocation serialize both attributable database orders',async () => {
  for (const participant of [f.ids.author,f.ids.reviewer]) {
    const app=new SQL(f.appUrl,{max:1}), revoker=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1}), gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});
    let release=()=>{}, holding:Promise<unknown>|undefined, pending:Promise<unknown>|undefined, revocation:Promise<unknown>|undefined;
    try {
      const pid=(await app`SELECT pg_backend_pid() AS pid`)[0].pid as number, revokePid=(await revoker`SELECT pg_backend_pid() AS pid`)[0].pid as number, gatePid=(await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
      const first=await prepared(), receipt=await admit(first.scope,first.command), c=(await claim(first.scope,receipt))!;
      await f.owner.unsafe(`CREATE FUNCTION allura.resume_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${c.runId}'::uuid THEN PERFORM pg_advisory_xact_lock(120040); END IF; RETURN NEW; END $$; CREATE TRIGGER resume_wait BEFORE INSERT ON allura.run_handoff_links FOR EACH ROW EXECUTE FUNCTION allura.resume_wait()`);
      let ready=()=>{}; const entered=new Promise<void>(r=>{ready=r;}),wait=new Promise<void>(r=>{release=r;});
      holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(120040)`;ready();await wait;});await entered;
      pending=finishHandoff(app,f.identities.author,first.scope,c);await blocked(pid,gatePid);
      revocation=revoker.begin(tx=>tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${first.scope.groupId} AND workspace_id=${first.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`);
      await blocked(revokePid,pid);release();await holding;await pending;await revocation;
      expect((await state(c.runId)).outcome).toBe('succeeded');
      await expect(resumeRun(app,f.identities.author,first.scope,first.command)).rejects.toThrow('forbidden');
      await f.owner.unsafe('DROP TRIGGER resume_wait ON allura.run_handoff_links; DROP FUNCTION allura.resume_wait()');
      const second=await prepared(), secondReceipt=await admit(second.scope,second.command), next=(await claim(second.scope,secondReceipt))!, before=await snapshot(next.runId);
      const revoked=new Promise<void>(r=>{ready=r;}),waitRevoke=new Promise<void>(r=>{release=r;});
      revocation=revoker.begin(async tx=>{await tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${second.scope.groupId} AND workspace_id=${second.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`;ready();await waitRevoke;});await revoked;
      pending=finishHandoff(app,f.identities.author,second.scope,next).then(()=> 'unexpected',e=>(e as Error).message);
      await blocked(pid,revokePid);release();await revocation;expect(await pending).toContain('forbidden');expect(await snapshot(next.runId)).toEqual(before);
      await expect(resumeRun(app,f.identities.author,second.scope,second.command)).rejects.toThrow('forbidden');
    } finally {release();await Promise.allSettled([holding,pending,revocation]);await f.owner.unsafe('DROP TRIGGER IF EXISTS resume_wait ON allura.run_handoff_links; DROP FUNCTION IF EXISTS allura.resume_wait()');await app.close();await revoker.close();await gate.close();}
  }
},15000);

test('run handoff insert update deferred faults and terminated backend leave no partial completion',async () => {
  for (const [table,event,deferred] of [['run_effect_receipts','INSERT',false],['run_handoff_links','INSERT',false],['run_journal','INSERT',false],['run_steps','UPDATE',false],['run_state','UPDATE',false],['run_handoff_links','INSERT',true]] as const) {
    const {scope,command}=await prepared(), receipt=await admit(scope,command), c=(await claim(scope,receipt))!, before=await snapshot(command.runId);
    await f.owner.unsafe(`CREATE FUNCTION allura.resume_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid THEN RAISE EXCEPTION 'owned handoff fault'; END IF; RETURN NEW; END $$; CREATE ${deferred?'CONSTRAINT ':''}TRIGGER resume_fault ${deferred?'AFTER':'BEFORE'} ${event} ON allura.${table} ${deferred?'DEFERRABLE INITIALLY DEFERRED':''} FOR EACH ROW EXECUTE FUNCTION allura.resume_fault()`);
    try {await expect(finishHandoff(f.app,f.identities.author,scope,c)).rejects.toThrow('owned handoff fault');}
    finally {await f.owner.unsafe(`DROP TRIGGER resume_fault ON allura.${table}; DROP FUNCTION allura.resume_fault()`);}
    expect(await snapshot(command.runId)).toEqual(before);await finishHandoff(f.app,f.identities.author,scope,c);
  }
  const {scope,command}=await prepared(), receipt=await admit(scope,command), before=await snapshot(command.runId);
  const app=new SQL(f.appUrl,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});
  let release=()=>{},holding:Promise<unknown>|undefined,pending:Promise<unknown>|undefined;
  try {
    const pid=(await app`SELECT pg_backend_pid() AS pid`)[0].pid as number,gatePid=(await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    await f.owner.unsafe(`CREATE FUNCTION allura.resume_kill() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid THEN PERFORM pg_advisory_xact_lock(120041); END IF; RETURN NEW; END $$; CREATE TRIGGER resume_kill BEFORE INSERT ON allura.run_handoff_links FOR EACH ROW EXECUTE FUNCTION allura.resume_kill()`);
    let ready=()=>{};const entered=new Promise<void>(r=>{ready=r;}),wait=new Promise<void>(r=>{release=r;});
    holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(120041)`;ready();await wait;});await entered;
    pending=resumeRun(app,f.identities.author,scope,command).then(()=> 'unexpected',e=>(e as Error).message);
    await blocked(pid,gatePid);expect((await f.owner`SELECT pg_terminate_backend(${pid}::int) AS killed`)[0].killed).toBe(true);
    expect(await pending).toBe('run_unknown');release();await holding;
    expect(await immutable(command.runId)).toEqual([before[5]!,before[6]!,before[4]!]);
    expect(await f.owner`SELECT run_id FROM allura.run_handoff_links WHERE run_id=${command.runId}::uuid`).toHaveLength(0);
    expect((await state(command.runId)).phase).toBe('running');
    const [st]=await f.owner`SELECT lease_id,invocation_id,fence FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='handoff'`;
    await finishHandoff(f.app,f.identities.author,scope,{runId:command.runId,leaseId:st.lease_id,invocationId:st.invocation_id,fence:st.fence,operationReceiptId:JSON.parse(receipt).id});
  } finally {release();await Promise.allSettled([holding,pending]);await app.close();await gate.close();await f.owner.unsafe('DROP TRIGGER IF EXISTS resume_kill ON allura.run_handoff_links; DROP FUNCTION IF EXISTS allura.resume_kill()');}
},15000);

async function expiring() {
  const scope={...f.scope,workspaceId:randomUUID()};
  await f.owner.unsafe(`CREATE FUNCTION allura.resume_short_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.workspace_id='${scope.workspaceId}'::uuid THEN NEW.expires_at:=NEW.created_at+interval '1500 milliseconds'; NEW.request_text:=jsonb_set(NEW.request_text::jsonb,'{expiresAt}',to_jsonb(to_char(NEW.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))::text; END IF; RETURN NEW; END $$; CREATE TRIGGER resume_short_expiry BEFORE INSERT ON allura.run_approval_requests FOR EACH ROW EXECUTE FUNCTION allura.resume_short_expiry()`);
  try {return await prepared('approve',scope);} finally {await f.owner.unsafe('DROP TRIGGER resume_short_expiry ON allura.run_approval_requests; DROP FUNCTION allura.resume_short_expiry()');}
}
async function waitExpiry(runId:string) {
  const [r]=await f.owner`SELECT greatest(0,ceil(extract(epoch FROM(expires_at-clock_timestamp()))*1000))::int AS ms FROM allura.run_approval_requests WHERE run_id=${runId}::uuid`;
  await Bun.sleep(r.ms+10);expect((await f.owner`SELECT expires_at<=clock_timestamp() AS expired FROM allura.run_approval_requests WHERE run_id=${runId}::uuid`)[0].expired).toBe(true);
}
test('run resume expired approval never renews at admission or historical recovery',async () => {
  const first=await expiring(),before=await snapshot(first.command.runId);await waitExpiry(first.command.runId);
  await expect(resumeRun(f.app,f.identities.author,first.scope,first.command)).rejects.toThrow('conflict');expect(await snapshot(first.command.runId)).toEqual(before);
  const second=await expiring(),receipt=await admit(second.scope,second.command),stable=await snapshot(second.command.runId);await waitExpiry(second.command.runId);
  expect(await admit(second.scope,second.command)).toBe(receipt);await expect(resumeRun(f.app,f.identities.author,second.scope,second.command)).rejects.toThrow('conflict');expect(await snapshot(second.command.runId)).toEqual(stable);
},5000);

test('run handoff final expiry guard has valid attributable deferred entry and isolated mutant control',async () => {
  const [original]=await f.owner`SELECT pg_get_functiondef('allura.finish_run_handoff(text,uuid,uuid,uuid,uuid,integer,uuid,jsonb)'::regprocedure) AS source`;
  const guard="IF clock_timestamp()>=st.lease_until OR clock_timestamp()>=a.expires_at OR clock_timestamp()>=r.expires_at OR clock_timestamp()-began>=interval '2 seconds' THEN RAISE EXCEPTION 'conflict'; END IF;";
  expect(original.source.split(guard)).toHaveLength(2);
  try {
    for (const mode of ['control','mutant','restored']) {
      await f.owner.unsafe(mode==='mutant' ? original.source.replace(guard,guard.replace(' OR clock_timestamp()>=a.expires_at','')) : original.source);
      const app=new SQL(f.appUrl,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});
      let release=()=>{},holding:Promise<unknown>|undefined,pending:Promise<unknown>|undefined;
      try {
        const pid=(await app`SELECT pg_backend_pid() AS pid`)[0].pid as number,gatePid=(await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
        const {scope,command}=await expiring(),receipt=await admit(scope,command),c=(await claim(scope,receipt))!,before=await snapshot(command.runId);
        await f.owner.unsafe(`CREATE FUNCTION allura.resume_expire_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid THEN IF NOT EXISTS(SELECT FROM allura.run_approval_requests WHERE id=NEW.approval_request_id AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'fixture missed valid deferred entry'; END IF; PERFORM pg_advisory_xact_lock(120042); END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER resume_expire_wait AFTER INSERT ON allura.run_handoff_links DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.resume_expire_wait()`);
        let ready=()=>{};const entered=new Promise<void>(r=>{ready=r;}),wait=new Promise<void>(r=>{release=r;});
        holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(120042)`;ready();await wait;});await entered;
        pending=finishHandoff(app,f.identities.author,scope,c).then(()=>({completed:true}),e=>({error:(e as Error).message}));
        await blocked(pid,gatePid);
        expect((await f.owner`SELECT expires_at>clock_timestamp() AS valid FROM allura.run_approval_requests WHERE run_id=${command.runId}::uuid`)[0].valid).toBe(true);
        await waitExpiry(command.runId);release();await holding;
        expect(await pending).toEqual(mode==='mutant'?{completed:true}:{error:'conflict'});
        if(mode==='mutant'){expect((await state(command.runId)).outcome).toBe('succeeded');}else{expect(await snapshot(command.runId)).toEqual(before);}
        console.log(JSON.stringify({handoffFinalGuard:{mode,pid,gatePid,validDeferredEntry:true,realDatabaseExpiry:true,outcome:await pending}}));
      }finally{release();await Promise.allSettled([holding,pending]);await app.close();await gate.close();await f.owner.unsafe('DROP TRIGGER IF EXISTS resume_expire_wait ON allura.run_handoff_links; DROP FUNCTION IF EXISTS allura.resume_expire_wait()');}
    }
  }finally{await f.owner.unsafe(original.source);expect((await f.owner`SELECT pg_get_functiondef('allura.finish_run_handoff(text,uuid,uuid,uuid,uuid,integer,uuid,jsonb)'::regprocedure) AS source`)[0].source).toBe(original.source);}
},10000);

test('run resume restricted SQL authenticates before validation and dependency links reject splicing',async () => {
  const {scope,command}=await prepared(), receipt=await resumeRun(f.app,f.identities.author,scope,command);
  const other=await prepared(); await resumeRun(f.app,f.identities.author,other.scope,other.command);
  const [row]=await f.owner`SELECT * FROM allura.run_handoff_links WHERE run_id=${command.runId}::uuid`,[foreign]=await f.owner`SELECT * FROM allura.run_handoff_links WHERE run_id=${other.command.runId}::uuid`;
  const pooled=new SQL(f.appUrl,{max:1});
  try {
    await expect(pooled`SELECT allura.resume_run(${scope.groupId},${scope.workspaceId}::uuid,${null}::jsonb,${null}::jsonb)`.execute()).rejects.toThrow('forbidden');
    await expect(pooled`SELECT * FROM allura.run_handoff_links`.execute()).rejects.toThrow('permission denied');
    await expect(pooled`SELECT allura.handoff_approval(${scope.groupId},${scope.workspaceId}::uuid,NULL,NULL)`.execute()).rejects.toThrow('permission denied');
    expect(await pooled`SELECT run_id FROM allura.run_journal`).toHaveLength(0);
  }finally{await pooled.close();}
  expect((await f.owner`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='allura.run_handoff_links'::regclass`)[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
  for(const verb of ['UPDATE allura.run_handoff_links SET decision=decision','DELETE FROM allura.run_handoff_links','TRUNCATE allura.run_handoff_links']) {await expect(f.owner.unsafe(verb).execute()).rejects.toThrow('append-only');}
  // Fresh real approved run has no handoff; only owner fault-probe rows are
  // synthesized, always rolled back, so uniqueness cannot mask a broken FK.
  const fresh=await prepared();
  const [a]=await f.owner`SELECT id,prepared_receipt_id FROM allura.run_approval_requests WHERE run_id=${fresh.command.runId}::uuid`,[d]=await f.owner`SELECT id FROM allura.run_approval_decisions WHERE run_id=${fresh.command.runId}::uuid`;
  for(const column of ['prepared_receipt_id','approval_request_id','approval_decision_id']) {
    await expect(f.owner.begin(async tx=>{
      const effect=randomUUID(), ids={prepared_receipt_id:a.prepared_receipt_id,approval_request_id:a.id,approval_decision_id:d.id,...{[column]:foreign[column]}};
      await tx`INSERT INTO allura.run_effect_receipts VALUES(${fresh.scope.groupId},${fresh.scope.workspaceId}::uuid,${effect}::uuid,${fresh.command.runId}::uuid,'handoff','local-result','{}',1,clock_timestamp())`;
      await tx`INSERT INTO allura.run_handoff_links VALUES(${fresh.scope.groupId},${fresh.scope.workspaceId}::uuid,${fresh.command.runId}::uuid,${effect}::uuid,${ids.prepared_receipt_id}::uuid,${ids.approval_request_id}::uuid,${ids.approval_decision_id}::uuid,'handoff','prepare','approve')`;
    })).rejects.toThrow('foreign key constraint');
  }
  expect(row.decision).toBe('approve');expect(JSON.parse(receipt).command).toBe('resume');
});

test('run resume concurrent start key collision reaches uncommitted lookup and fails without another run',async () => {
  const {scope,command,input}=await prepared();
  const app=new SQL(f.appUrl,{max:1}),starter=new SQL(f.appUrl,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});
  let release=()=>{},holding:Promise<unknown>|undefined,pending:Promise<unknown>|undefined,starting:Promise<unknown>|undefined;
  try {
    const pid=(await app`SELECT pg_backend_pid() AS pid`)[0].pid as number,startPid=(await starter`SELECT pg_backend_pid() AS pid`)[0].pid as number,gatePid=(await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    const records=[...await f.owner`SELECT id FROM allura.run_records WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid ORDER BY id`];
    await f.owner.unsafe(`CREATE FUNCTION allura.resume_collision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${command.runId}'::uuid AND NEW.command='resume' THEN PERFORM pg_advisory_xact_lock(120043); END IF; RETURN NEW; END $$; CREATE TRIGGER resume_collision BEFORE INSERT ON allura.run_operation_receipts FOR EACH ROW EXECUTE FUNCTION allura.resume_collision()`);
    let ready=()=>{};const entered=new Promise<void>(r=>{ready=r;}),wait=new Promise<void>(r=>{release=r;});
    holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(120043)`;ready();await wait;});await entered;
    pending=resumeRun(app,f.identities.author,scope,command);await blocked(pid,gatePid);
    expect(await f.owner`SELECT id FROM allura.run_operation_receipts WHERE group_id=${scope.groupId} AND operation_key=${command.operationKey}`).toHaveLength(0);
    starting=startRun(starter,f.identities.author,scope,{...input,operationKey:command.operationKey}).then(()=> 'unexpected',e=>(e as Error).message);
    await blocked(startPid,pid);release();await holding;expect(await starting).toBe('run_conflict');expect(typeof await pending).toBe('string');
    expect([...await f.owner`SELECT id FROM allura.run_records WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid ORDER BY id`]).toEqual(records);
    expect((await state(command.runId)).outcome).toBe('succeeded');
  }finally{release();await Promise.allSettled([holding,pending,starting]);await app.close();await starter.close();await gate.close();await f.owner.unsafe('DROP TRIGGER IF EXISTS resume_collision ON allura.run_operation_receipts; DROP FUNCTION IF EXISTS allura.resume_collision()');}
});
