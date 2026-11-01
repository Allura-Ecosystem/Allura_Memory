import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { startRun, advanceRun, decideRun, resumeRun, cancelRun } from '../src/runs.ts';
import { scopedTransaction, DatabaseStore } from '../src/persistence.ts';
import { authenticateMachine } from '../src/authentication.ts';
import { runDefinition, type RunCommandV1 } from '../src/run-contract.ts';
import { finishPreparation, finishHandoff, type PreparationClaim } from '../src/run-execution.ts';
import { type Scope } from '../src/authority.ts';
import { createCoreGateway } from '../src/core-api.ts';
import { EMBEDDING } from '../src/embedding.ts';

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => { f = await fixture(`allura-cancel-${randomUUID()}`); });
afterAll(async () => { await f?.close(); });
async function setup(mode: 'ready' | 'prepare' | 'paused' | 'approved' | 'admitted' | 'handoff' | 'complete' = 'ready', scope = { ...f.scope, workspaceId: randomUUID() }) {
  await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${scope.workspaceId}::uuid,'Cancel fixture',${f.ids.author}::uuid) ON CONFLICT DO NOTHING`;
  for (const id of [f.ids.author,f.ids.reviewer,f.ids.curator]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids.author}::uuid) ON CONFLICT DO NOTHING`; }
  const text = 'Private cancellation artifact 🧠';
  const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 8, goal: 'Exact stop', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
  const start = await startRun(f.app,f.identities.author,scope,input), runId = JSON.parse(start).runId as string;
  const advanceCommand = { runId,expectedRevision:1,operationKey:randomUUID() };
  let advance: string | undefined, decision: string | undefined, decisionCommand: object | undefined, resume: string | undefined, resumeCommand: RunCommandV1 | undefined, claim: PreparationClaim | undefined;
  if (mode === 'prepare') {
    const result = await scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.claim_run_prepare(${scope.groupId},${scope.workspaceId}::uuid,${advanceCommand}::jsonb,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS result`)[0].result);
    advance = result.receipt; claim = result.claim;
  } else if (mode !== 'ready') {
    advance = await advanceRun(f.app,f.identities.author,scope,advanceCommand);
    if (mode !== 'paused') {
      const a = JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${runId}::uuid`)[0].request_text);
      decisionCommand = { runId,expectedRevision:3,operationKey:randomUUID(),approvalRequestId:a.id,reviewedEvidenceDigest:a.evidenceDigest,decision:'approve',rationale:'Exact stop fixture' };
      decision = await decideRun(f.app,f.identities.reviewer,scope,decisionCommand);
      if (mode !== 'approved') {
        resumeCommand = { runId,expectedRevision:4,operationKey:randomUUID() };
        resume = await scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.resume_run(${scope.groupId},${scope.workspaceId}::uuid,${resumeCommand}::jsonb,${await runDefinition()}::jsonb) AS receipt`)[0].receipt as string);
        if (mode !== 'admitted') {
          claim = await scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.claim_run_handoff(${scope.groupId},${scope.workspaceId}::uuid,${runId}::uuid,${JSON.parse(resume!).id}::uuid,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS claim`)[0].claim as PreparationClaim);
          if (mode === 'complete') { await finishHandoff(f.app,f.identities.author,scope,claim); }
        }
      }
    }
  }
  const command = { runId,expectedRevision:(await state(runId)).revision as number,operationKey:randomUUID() };
  return { scope,input,start,runId,command,advance,advanceCommand,decision,decisionCommand,resume,resumeCommand,claim };
}
async function state(runId: string) { return (await f.owner`SELECT * FROM allura.run_state WHERE run_id=${runId}::uuid`)[0]; }
async function snapshot(runId: string) {
  const result = await Promise.all(['run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions','run_handoff_links'].map(async table => [...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t WHERE run_id=$1::uuid ORDER BY 1`,[runId])]));
  return [...result,[...await f.owner`SELECT to_jsonb(r)::text AS row FROM allura.run_records r WHERE id=${runId}::uuid`],[...await f.owner`SELECT to_jsonb(d)::text AS row FROM allura.run_definitions d JOIN allura.run_records r ON (d.group_id,d.workspace_id,d.definition_id,d.revision)=(r.group_id,r.workspace_id,r.definition_id,r.definition_revision) WHERE r.id=${runId}::uuid`]];
}
async function stop(h: Awaited<ReturnType<typeof setup>>, sql = f.app) { return cancelRun(sql,f.identities.curator,h.scope,h.command); }
async function sqlStop(scope: Scope, value: unknown) { return scopedTransaction(f.app,f.identities.curator,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.cancel_run(${scope.groupId},${scope.workspaceId}::uuid,${value}::jsonb) AS receipt`)[0].receipt as string); }
async function child(scope: Scope, command: RunCommandV1, mode: string, claim?: PreparationClaim, expected = 0) {
  const input = { url:f.appUrl,assertion:f.jwt(mode==='cancel'?'curator':'author'),issuer:f.humanConfig.issuer,publicKey:f.humanConfig.keys.get('key')!.export({type:'spki',format:'pem'}),scope,command,mode,claim };
  const p = Bun.spawn([process.execPath,new URL('./run-process-fixture.ts',import.meta.url).pathname],{stdin:new Blob([JSON.stringify(input)]),stdout:'pipe',stderr:'pipe',env:{...process.env,ALLURA_DISPOSABLE_DB:'owned-test-container'}});
  const [out,err,code] = await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
  expect(err).toBe(''); expect(code).toBe(expected); return JSON.parse(out);
}
async function blocked(waiter: number, blocker: number) {
  expect(waiter).not.toBe(blocker);
  for (let i=0;i<100;i++) { if ((await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS blocked`)[0].blocked) { console.log(JSON.stringify({cancelLockWitness:{waiter,blocker}})); return; } await Bun.sleep(10); }
  throw new Error('Exact cancellation waiter not observed');
}

test('run cancel current scoped administrator stops work after original participant revocation',async () => {
  for (const participants of [[f.ids.author],[f.ids.reviewer],[f.ids.author,f.ids.reviewer]]) {
    const h = await setup('paused');
    for (const participant of participants) { await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${h.scope.groupId} AND workspace_id=${h.scope.workspaceId}::uuid AND principal_id=${participant}::uuid`; }
    const receipt = await stop(h), stable = await snapshot(h.runId);
    expect(JSON.parse(receipt).actorPrincipalId).toBe(f.ids.curator); expect((await state(h.runId)).outcome).toBe('partial');
    expect(await stop(h)).toBe(receipt); expect(await snapshot(h.runId)).toEqual(stable);
    for (const table of ['workspace_grants','memberships','identity_bindings']) {
      const where = table==='workspace_grants'?'principal_id=$1::uuid AND workspace_id=$2::uuid':'principal_id=$1::uuid';
      const args = table==='workspace_grants'?[f.ids.curator,h.scope.workspaceId]:[f.ids.curator];
      await f.owner.unsafe(`UPDATE allura.${table} SET active=false WHERE ${where}`,args);
      try { await expect(stop(h)).rejects.toThrow('forbidden'); expect(await snapshot(h.runId)).toEqual(stable); }
      finally { await f.owner.unsafe(`UPDATE allura.${table} SET active=true WHERE ${where}`,args); }
    }
  }
});

test('run cancellation and parallel failures preserve committed effect truth',async () => {
  for (const mode of ['ready','prepare','paused','approved','admitted','handoff'] as const) {
    const h = await setup(mode), neighbor = await setup('ready',h.scope), other = await snapshot(neighbor.runId), before = await snapshot(h.runId);
    const steps = [...await f.owner`SELECT * FROM allura.run_steps WHERE run_id=${h.runId}::uuid ORDER BY step_id`];
    const receipts = await Promise.all(Array.from({length:6},() => stop(h))); expect(new Set(receipts).size).toBe(1);
    const s = await state(h.runId); expect(s).toMatchObject({phase:'terminal',reason:'cancelled',outcome:mode==='ready'||mode==='prepare'?'failed':'partial',revision:h.command.expectedRevision+1,cancel_requested:true,next_step_id:null});
    const after = await snapshot(h.runId); for (const i of [4,5,6,7,8,9]) { expect(after[i]).toEqual(before[i]); }
    const finalSteps = [...await f.owner`SELECT * FROM allura.run_steps WHERE run_id=${h.runId}::uuid ORDER BY step_id`];
    for (let i=0;i<3;i++) { expect(finalSteps[i]).toMatchObject({state:steps[i]!.state==='completed'?'completed':'failed',fence:steps[i]!.fence+1,attempts:steps[i]!.attempts,effect_receipt_id:steps[i]!.effect_receipt_id,lease_id:null,invocation_id:null,lease_until:null,due_at:null}); }
    const journal = await f.owner`SELECT kind,seq,receipt_id FROM allura.run_journal WHERE run_id=${h.runId}::uuid ORDER BY seq`;
    expect(journal.slice(-2).map((r:{kind:string})=>r.kind)).toEqual(['cancel_requested','terminated']); expect(s.checkpoint_seq).toBe(journal.at(-1)!.seq);
    expect(journal.at(-1)!.receipt_id).toBe(JSON.parse(receipts[0]!).id);
    expect(await snapshot(neighbor.runId)).toEqual(other);
    await advanceRun(f.app,f.identities.author,neighbor.scope,neighbor.advanceCommand); expect((await state(neighbor.runId)).phase).toBe('paused_approval');
    expect(await snapshot(h.runId)).toEqual(after);
  }
});

test('run cancel strict envelopes replay and shared command keys preserve exact receipts',async () => {
  const h = await setup('admitted'), before = await snapshot(h.runId);
  for (const value of [null,[],{}, {...h.command,actor:f.ids.author},{...h.command,reason:'cancelled'},{...h.command,outcome:'failed'},{...h.command,expectedRevision:null},{...h.command,expectedRevision:1.1},{...h.command,expectedRevision:2147483648},{...h.command,operationKey:'bad\n'},{...h.command,runId:'bad'}]) {
    await expect(cancelRun(f.app,f.identities.curator,h.scope,value)).rejects.toThrow('invalid'); await expect(sqlStop(h.scope,value)).rejects.toThrow('invalid');
  }
  await expect(cancelRun(f.app,f.identities.author,h.scope,{...h.command,operationKey:h.input.operationKey})).rejects.toThrow('conflict');
  await expect(cancelRun(f.app,f.identities.author,h.scope,h.advanceCommand)).rejects.toThrow('conflict');
  await expect(cancelRun(f.app,f.identities.reviewer,h.scope,{...h.command,operationKey:(h.decisionCommand as {operationKey:string}).operationKey})).rejects.toThrow('conflict');
  await expect(cancelRun(f.app,f.identities.author,h.scope,h.resumeCommand)).rejects.toThrow('conflict');
  expect(await snapshot(h.runId)).toEqual(before);
  const command = {...h.command,operationKey:randomUUID()}, receipt = await cancelRun(f.app,f.identities.author,h.scope,command), stable = await snapshot(h.runId);
  for (const value of [{...command,expectedRevision:1},{...command,runId:randomUUID()},{...command,operationKey:randomUUID()}]) { await expect(cancelRun(f.app,f.identities.author,h.scope,value)).rejects.toThrow('conflict'); }
  await expect(startRun(f.app,f.identities.author,h.scope,{...h.input,operationKey:command.operationKey})).rejects.toThrow('conflict');
  await expect(advanceRun(f.app,f.identities.author,h.scope,command)).rejects.toThrow('conflict'); await expect(resumeRun(f.app,f.identities.author,h.scope,command)).rejects.toThrow('conflict');
  expect(await startRun(f.app,f.identities.author,h.scope,h.input)).toBe(h.start); expect(await advanceRun(f.app,f.identities.author,h.scope,h.advanceCommand)).toBe(h.advance!);
  expect(await decideRun(f.app,f.identities.reviewer,h.scope,h.decisionCommand)).toBe(h.decision!); expect(await resumeRun(f.app,f.identities.author,h.scope,h.resumeCommand)).toBe(h.resume!);
  expect(await cancelRun(f.app,f.identities.author,h.scope,command)).toBe(receipt); expect(await snapshot(h.runId)).toEqual(stable);
  const complete = await setup('complete'), terminal = await snapshot(complete.runId); await expect(stop(complete)).rejects.toThrow('conflict'); expect(await snapshot(complete.runId)).toEqual(terminal);
  const other=await setup(),otherReceipt=JSON.parse(await stop(other));
  // Real scoped receipt/journal foreign keys must reject a foreign stop link.
  await expect(f.owner.begin(async tx=>{
    await tx`INSERT INTO allura.run_journal(group_id,workspace_id,run_id,seq,event_id,actor_id,kind,reason,receipt_id,created_at) VALUES(${h.scope.groupId},${h.scope.workspaceId}::uuid,${h.runId}::uuid,128,${randomUUID()}::uuid,${f.ids.author}::uuid,'cancel_requested','cancelled',${otherReceipt.id}::uuid,clock_timestamp())`;
  })).rejects.toThrow('foreign key constraint');
  for(const table of ['run_operation_receipts','run_journal']) {
    await expect(f.app.unsafe(`DELETE FROM allura.${table} WHERE run_id=$1::uuid`,[h.runId]).execute()).rejects.toThrow('permission denied');
    await expect(f.owner.unsafe(`DELETE FROM allura.${table} WHERE run_id=$1::uuid`,[h.runId]).execute()).rejects.toThrow('append-only');
  }
  expect(await snapshot(h.runId)).toEqual(stable);
});

test('run cancelled preparation and handoff claims fence late fresh process completion',async () => {
  for (const mode of ['prepare','handoff'] as const) {
    const h = await setup(mode); expect(h.claim).toBeDefined();
    expect((await f.owner`SELECT lease_until>clock_timestamp() AS valid FROM allura.run_steps WHERE run_id=${h.runId}::uuid AND state='leased'`)[0].valid).toBe(true);
    await stop(h); const before = await snapshot(h.runId);
    expect(await child(h.scope,h.command,mode==='prepare'?'finish':'handoff-finish',h.claim,1)).toEqual({error:'unknown'});
    expect(await snapshot(h.runId)).toEqual(before);
  }
});

for (const mode of ['prepare','handoff'] as const) {
  test(`run cancel versus ${mode} finish serializes both attributable database orders`,async () => {
    for (const first of ['cancel','finish'] as const) {
      const h = await setup(mode), cancel = new SQL(f.appUrl,{max:1}), worker = new SQL(f.appUrl,{max:1}), gate = new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});
      let release=()=>{},holding:Promise<unknown>|undefined,pending:Promise<unknown>|undefined,following:Promise<unknown>|undefined;
      const table = first==='cancel'?'run_operation_receipts':'run_effect_receipts';
      try {
        const cancelPid=(await cancel`SELECT pg_backend_pid() AS pid`)[0].pid as number, workerPid=(await worker`SELECT pg_backend_pid() AS pid`)[0].pid as number, gatePid=(await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
        await f.owner.unsafe(`CREATE FUNCTION allura.cancel_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${h.runId}'::uuid THEN PERFORM pg_advisory_xact_lock(120050); END IF; RETURN NEW; END $$; CREATE TRIGGER cancel_order BEFORE INSERT ON allura.${table} FOR EACH ROW EXECUTE FUNCTION allura.cancel_order()`);
        let ready=()=>{}; const entered=new Promise<void>(r=>{ready=r;}),wait=new Promise<void>(r=>{release=r;});
        holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(120050)`;ready();await wait;});await entered;
        const finish=()=> (mode==='prepare'?finishPreparation:finishHandoff)(worker,f.identities.author,h.scope,h.claim!);
        pending=(first==='cancel'?stop(h,cancel):finish()).then(()=> 'accepted',e=>(e as Error).message);
        await blocked(first==='cancel'?cancelPid:workerPid,gatePid);
        following=(first==='cancel'?finish():stop(h,cancel)).then(()=> 'accepted',e=>(e as Error).message);
        await blocked(first==='cancel'?workerPid:cancelPid,first==='cancel'?cancelPid:workerPid);
        release();await holding;expect(await pending).toBe('accepted');expect(await following).toContain('conflict');
        if(first==='finish'&&mode==='prepare') { h.command.expectedRevision=(await state(h.runId)).revision; await stop(h); }
        const s=await state(h.runId); expect(s.outcome).toBe(first==='finish'&&mode==='handoff'?'succeeded':mode==='handoff'||first==='finish'?'partial':'failed');
        console.log(JSON.stringify({cancelFinishOrder:{mode,first,cancelPid,workerPid,gatePid,outcome:s.outcome}}));
      } finally { release();await Promise.allSettled([holding,pending,following]);await f.owner.unsafe(`DROP TRIGGER IF EXISTS cancel_order ON allura.${table}; DROP FUNCTION IF EXISTS allura.cancel_order()`);await cancel.close();await worker.close();await gate.close(); }
    }
  },10000);
}

test('run cancel insert update deferred faults and backend termination preserve full snapshots',async () => {
  for (const [table,event,deferred] of [['run_operation_receipts','INSERT',false],['run_journal','INSERT',false],['run_steps','UPDATE',false],['run_state','UPDATE',false],['run_operation_receipts','INSERT',true]] as const) {
    const h=await setup('prepare'),before=await snapshot(h.runId);
    await f.owner.unsafe(`CREATE FUNCTION allura.cancel_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${h.runId}'::uuid THEN RAISE EXCEPTION 'owned cancellation fault'; END IF; RETURN NEW; END $$; CREATE ${deferred?'CONSTRAINT ':''}TRIGGER cancel_fault ${deferred?'AFTER':'BEFORE'} ${event} ON allura.${table} ${deferred?'DEFERRABLE INITIALLY DEFERRED':''} FOR EACH ROW EXECUTE FUNCTION allura.cancel_fault()`);
    try { await expect(stop(h)).rejects.toThrow('run_unknown'); expect(await snapshot(h.runId)).toEqual(before); }
    finally { await f.owner.unsafe(`DROP TRIGGER cancel_fault ON allura.${table}; DROP FUNCTION allura.cancel_fault()`); }
    await stop(h);expect((await state(h.runId)).outcome).toBe('failed');
  }
  const h=await setup('handoff'),before=await snapshot(h.runId),app=new SQL(f.appUrl,{max:1}),gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});
  let release=()=>{},holding:Promise<unknown>|undefined,pending:Promise<unknown>|undefined;
  try {
    const pid=(await app`SELECT pg_backend_pid() AS pid`)[0].pid as number,gatePid=(await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    await f.owner.unsafe(`CREATE FUNCTION allura.cancel_kill() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${h.runId}'::uuid THEN PERFORM pg_advisory_xact_lock(120051); END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER cancel_kill AFTER INSERT ON allura.run_operation_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.cancel_kill()`);
    let ready=()=>{};const entered=new Promise<void>(r=>{ready=r;}),wait=new Promise<void>(r=>{release=r;});holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(120051)`;ready();await wait;});await entered;
    pending=stop(h,app).then(()=> 'unexpected',e=>(e as Error).message);await blocked(pid,gatePid);expect((await f.owner`SELECT pg_terminate_backend(${pid}::int) AS killed`)[0].killed).toBe(true);expect(await pending).toBe('run_unknown');release();await holding;
    expect(await snapshot(h.runId)).toEqual(before);
  } finally {release();await Promise.allSettled([holding,pending]);await app.close();await gate.close();await f.owner.unsafe('DROP TRIGGER IF EXISTS cancel_kill ON allura.run_operation_receipts; DROP FUNCTION IF EXISTS allura.cancel_kill()');}
  expect(JSON.parse((await child(h.scope,h.command,'cancel')).receipt).command).toBe('cancel'); expect((await state(h.runId)).outcome).toBe('partial');
},15000);

test('run cancel lost committed HTTP response reconciles in a fresh process without semantic effects',async () => {
  const h=await setup('paused'),origin='https://cancel.invalid';
  const unrelated=async()=>Promise.all(['events','semantic_versions','proposal_state','semantic_intents','projection_transfers'].map(async table=>[...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t WHERE group_id=$1 ORDER BY 1`,[h.scope.groupId])]));
  const before=await unrelated(),gateway=createCoreGateway(f.app,f.humanConfig,origin,new Uint8Array(32).fill(7),{identity:EMBEDDING,embed:async():Promise<number[]>=>{throw new Error('No cancellation embedding');}});
  const request=(url:string,headers:Record<string,string>={})=>new Request(`${url}/api/runs/cancel?group_id=${h.scope.groupId}&workspace_id=${h.scope.workspaceId}`,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt('curator'),Origin:origin,'Sec-Fetch-Site':'same-origin','content-type':'application/json',...headers},body:JSON.stringify(h.command)});
  for(const [headers,status] of [[{'Cf-Access-Jwt-Assertion':'forged'},401],[{Authorization:'Bearer invalid'},401],[{Origin:'https://foreign.invalid'},403],[{'Sec-Fetch-Site':'cross-site'},403]] as [Record<string,string>,number][]) {const req=request(origin,headers);expect((await gateway(req)).status).toBe(status);expect(req.bodyUsed).toBe(false);}
  const beforeInvalid=await snapshot(h.runId);
  for(const suffix of ['&actor=forged',`&group_id=${h.scope.groupId}`,'&limit=1']) {const req=request(origin);expect((await gateway(new Request(req.url+suffix,req))).status).toBe(400);}
  for(const value of [{...h.command,outcome:'succeeded'},{...h.command,expectedRevision:null},{...h.command,operationKey:'bad\n'}]) {const req=request(origin);expect((await gateway(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(value)}))).status).toBe(400);}
  expect(await snapshot(h.runId)).toEqual(beforeInvalid);
  let commits=0;const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async req=>{const response=await gateway(req);expect(response.status).toBe(200);commits++;server.stop(true);return response;}});
  try {await expect(fetch(request(server.url.origin))).rejects.toThrow();}finally{server.stop(true);}
  expect(commits).toBe(1);expect((await state(h.runId)).outcome).toBe('partial');
  const [row]=await f.owner`SELECT receipt_text FROM allura.run_operation_receipts WHERE run_id=${h.runId}::uuid AND command='cancel'`,stable=await snapshot(h.runId);
  expect((await child(h.scope,h.command,'cancel')).receipt).toBe(row.receipt_text);expect(await snapshot(h.runId)).toEqual(stable);expect(await unrelated()).toEqual(before);
});

test('run cancel restricted SQL foreign scopes machines and owner linked clients deny without disclosure',async () => {
  const h=await setup(),other=await setup(),before=await snapshot(h.runId);
  const foreignGroup=`allura-cancel-foreign-${randomUUID()}`;
  await f.owner`INSERT INTO allura.tenants(group_id) VALUES(${foreignGroup})`;
  for(const id of [f.ids.author,f.ids.reviewer,f.ids.curator]) {await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${foreignGroup},${id}::uuid)`;}
  const foreign=await setup('paused',{groupId:foreignGroup,workspaceId:randomUUID()}),foreignBefore=await snapshot(foreign.runId);
  await expect(cancelRun(f.app,f.identities.curator,foreign.scope,h.command)).rejects.toThrow('not_found');
  await expect(cancelRun(f.app,f.identities.curator,h.scope,foreign.command)).rejects.toThrow('not_found');
  expect(await snapshot(foreign.runId)).toEqual(foreignBefore);
  for(const who of ['viewer','org','machine'] as const) {await expect(cancelRun(f.app,f.identities[who],h.scope,h.command)).rejects.toThrow('forbidden');}
  await expect(cancelRun(f.app,{...f.identities.curator},h.scope,h.command)).rejects.toThrow('unauthenticated');
  await expect(cancelRun(f.app,f.identities.curator,other.scope,h.command)).rejects.toThrow('not_found');
  await expect(cancelRun(f.app,f.identities.curator,{...h.scope,groupId:'allura-foreign'},h.command)).rejects.toThrow('forbidden');
  await expect(f.app`SELECT allura.cancel_run(${h.scope.groupId},${h.scope.workspaceId}::uuid,NULL)`.execute()).rejects.toThrow('forbidden');
  const client=randomUUID(),delegation=randomUUID(),token=randomBytes(32).toString('base64url'),digest=createHash('sha256').update(token).digest('hex');
  await f.owner`INSERT INTO allura.principals(id,kind) VALUES(${client}::uuid,'service')`;
  await f.owner`INSERT INTO allura.memberships(group_id,principal_id) VALUES(${h.scope.groupId},${client}::uuid)`;
  await f.owner`INSERT INTO allura.client_delegations(id,client_id,group_id,workspace_id,owner_id,owner_issuer,owner_subject,actions) VALUES(${delegation}::uuid,${client}::uuid,${h.scope.groupId},${h.scope.workspaceId}::uuid,${f.ids.author}::uuid,${f.humanConfig.issuer},${`${f.scope.groupId}:author`},ARRAY['memory:read','audit:read'])`;
  await f.owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at,client_bound,client_delegation_id) VALUES(${client}::uuid,decode(${digest},'hex'),${h.scope.groupId},${h.scope.workspaceId}::uuid,ARRAY['memory:read','audit:read'],clock_timestamp()+interval '1 hour',true,${delegation}::uuid)`;
  const identity=await authenticateMachine(token,d=>new DatabaseStore(f.app).lookupMachine(d));expect(identity.kind).toBe('service');await expect(cancelRun(f.app,identity,h.scope,h.command)).rejects.toThrow('forbidden');
  expect(await snapshot(h.runId)).toEqual(before);
});

test('run cancel prechecks every fence revision and journal exhaustion without partial mutation',async () => {
  for(const target of ['prepare','review','handoff','revision','journal']) {
    const h=await setup();
    if(target==='revision') {await f.owner`UPDATE allura.run_state SET revision=2147483647 WHERE run_id=${h.runId}::uuid`;h.command.expectedRevision=2147483647;}
    else if(target==='journal') {await f.owner`UPDATE allura.run_state SET checkpoint_seq=127 WHERE run_id=${h.runId}::uuid`;}
    else {await f.owner`UPDATE allura.run_steps SET fence=2147483647 WHERE run_id=${h.runId}::uuid AND step_id=${target}`;}
    const before=await snapshot(h.runId);await expect(stop(h)).rejects.toThrow('unavailable');expect(await snapshot(h.runId)).toEqual(before);
  }
});
