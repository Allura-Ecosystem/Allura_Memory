import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { startRun, advanceRun, decideRun, resumeRun, inspectRun, cancelRun } from '../src/runs.ts';
import { scopedTransaction } from '../src/persistence.ts';
import { runDefinition, type RunCommandV1 } from '../src/run-contract.ts';
import { finishHandoff, type PreparationClaim } from '../src/run-execution.ts';
import { type Scope } from '../src/authority.ts';

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => { f = await fixture(`allura-limits-${randomUUID()}`); });
afterAll(async () => { await f?.close(); });
async function workspace() {
  const scope = { ...f.scope, workspaceId: randomUUID() };
  await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${scope.workspaceId}::uuid,'Limits fixture',${f.ids.author}::uuid)`;
  for (const id of [f.ids.author,f.ids.reviewer]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids.author}::uuid)`; }
  return scope;
}
async function started(scope: Scope) {
  const text = 'Bounded local limits evidence';
  const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 9, goal: 'Limits recovery', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
  const receipt = await startRun(f.app,f.identities.author,scope,input);
  return { input, receipt, command: { runId: JSON.parse(receipt).runId as string, expectedRevision: 1, operationKey: randomUUID() } };
}
async function prepared(scope: Scope) {
  const h = await started(scope), advance = await advanceRun(f.app,f.identities.author,scope,h.command);
  const a = JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${h.command.runId}::uuid`)[0].request_text);
  const decision = await decideRun(f.app,f.identities.reviewer,scope,{runId:h.command.runId,expectedRevision:a.requestedAtRevision,operationKey:randomUUID(),approvalRequestId:a.id,reviewedEvidenceDigest:a.evidenceDigest,decision:'approve',rationale:'Independent exact review'});
  return { ...h, advance, decision, advanceCommand: h.command, command: {runId:h.command.runId,expectedRevision:JSON.parse(decision).acceptedRevision as number,operationKey:randomUUID()} };
}
async function admit(scope: Scope, command: RunCommandV1) {
  return scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.resume_run(${scope.groupId},${scope.workspaceId}::uuid,${command}::jsonb,${await runDefinition()}::jsonb) AS receipt`)[0].receipt as string);
}
async function claim(scope: Scope, receipt: string) {
  const op = JSON.parse(receipt);
  return scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.claim_run_handoff(${scope.groupId},${scope.workspaceId}::uuid,${op.runId}::uuid,${op.id}::uuid,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS claim`)[0].claim as PreparationClaim | null);
}
async function prepareClaim(scope: Scope, command: RunCommandV1) {
  return scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.claim_run_prepare(${scope.groupId},${scope.workspaceId}::uuid,${command}::jsonb,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS result`)[0].result as {receipt:string;claim:PreparationClaim});
}
async function snapshot(runId: string) {
  const history=await Promise.all(['run_records','run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions','run_handoff_links'].map(async table => [...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t WHERE ${table==='run_records'?'id':'run_id'}=$1::uuid ORDER BY 1`,[runId])]));
  return [...history,[...await f.owner`SELECT to_jsonb(d)::text AS row FROM allura.run_definitions d JOIN allura.run_records r ON (d.group_id,d.workspace_id,d.definition_id,d.revision)=(r.group_id,r.workspace_id,r.definition_id,r.definition_revision) WHERE r.id=${runId}::uuid`]];
}
async function immutable(runId: string) {
  return Promise.all(['run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions'].map(async table => [...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t WHERE run_id=$1::uuid ORDER BY 1`,[runId])]));
}
async function state(runId: string) { return (await f.owner`SELECT phase,outcome,reason,revision,next_step_id FROM allura.run_state WHERE run_id=${runId}::uuid`)[0]; }
function payload(scope: Scope, command: RunCommandV1, mode: string) {
  return {url:f.appUrl,assertion:f.jwt('author'),issuer:f.humanConfig.issuer,publicKey:f.humanConfig.keys.get('key')!.export({type:'spki',format:'pem'}),scope,command,mode};
}
function spawn(value: object) {
  return Bun.spawn([process.execPath,new URL('./run-process-fixture.ts',import.meta.url).pathname],{stdin:new Blob([JSON.stringify(value)]),stdout:'pipe',stderr:'pipe',env:{...process.env,ALLURA_DISPOSABLE_DB:'owned-test-container'},timeout:7000});
}
async function child(value: object, expected = 0) {
  const p=spawn(value);
  try {
    const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
    expect(err).toBe('');expect(code).toBe(expected);return JSON.parse(out);
  } finally { p.kill();await p.exited; }
}
async function waitBoundary(runId: string, boundary: 'lease_until' | 'due_at') {
  const [time]=await f.owner.unsafe(`SELECT greatest(0,ceil(extract(epoch FROM(${boundary}-clock_timestamp()))*1000))::int AS ms FROM allura.run_steps WHERE run_id=$1::uuid AND step_id='handoff'`,[runId]);
  expect(time.ms).toBeLessThanOrEqual(12000);await Bun.sleep(time.ms+5);
  expect((await f.owner.unsafe(`SELECT ${boundary}<=clock_timestamp() AS elapsed FROM allura.run_steps WHERE run_id=$1::uuid AND step_id='handoff'`,[runId]))[0].elapsed).toBe(true);
}

test('run handoff retry exhaustion preserves partial truth and cannot reset through new keys', async () => {
  const scope=await workspace(),h=await prepared(scope),rid=h.command.runId;
  const receipt=await admit(scope,h.command),original=await immutable(rid),saved:PreparationClaim[]=[];
  expect(await state(rid)).toMatchObject({phase:'ready',revision:5,next_step_id:'handoff'});
  for(let attempt=1;attempt<=3;attempt++) {
    const c=await claim(scope,receipt);expect(c).not.toBeNull();saved.push(c!);
    const [step]=await f.owner`SELECT attempts,fence,lease_id,invocation_id,extract(epoch FROM(due_at-lease_until))::int AS backoff,lease_until>clock_timestamp() AS valid FROM allura.run_steps WHERE run_id=${rid}::uuid AND step_id='handoff'`;
    expect(step).toEqual({attempts:attempt,fence:attempt,lease_id:c!.leaseId,invocation_id:c!.invocationId,backoff:attempt===1?1:2,valid:true});
    expect(c).toMatchObject({runId:rid,fence:attempt,operationReceiptId:JSON.parse(receipt).id});
    const before=await snapshot(rid);
    expect(await claim(scope,receipt)).toBeNull();
    await expect(admit(scope,{...h.command,expectedRevision:(await state(rid)).revision,operationKey:randomUUID()})).rejects.toThrow('conflict');
    expect(await snapshot(rid)).toEqual(before);
    // Observe real lease expiry separately: the persisted backoff must still
    // deny recovery, including a fresh operation key. No clock or row rewrite.
    await waitBoundary(rid,'lease_until');
    expect((await f.owner`SELECT due_at>clock_timestamp() AS waiting FROM allura.run_steps WHERE run_id=${rid}::uuid AND step_id='handoff'`)[0].waiting).toBe(true);
    await expect(claim(scope,receipt)).rejects.toThrow('conflict');
    await expect(admit(scope,{...h.command,expectedRevision:(await state(rid)).revision,operationKey:randomUUID()})).rejects.toThrow('conflict');
    expect(await snapshot(rid)).toEqual(before);
    await waitBoundary(rid,'due_at');
    await expect(admit(scope,{...h.command,expectedRevision:(await state(rid)).revision,operationKey:randomUUID()})).rejects.toThrow('conflict');
    expect(await snapshot(rid)).toEqual(before);
    console.log(JSON.stringify({handoffAttemptWitness:{attempt,fence:c!.fence,backoff:step.backoff,realLeaseAndDueElapsed:true}}));
  }
  expect(await claim(scope,receipt)).toBeNull();
  expect(await state(rid)).toEqual({phase:'terminal',outcome:'partial',reason:'attempts_exhausted',revision:9,next_step_id:null});
  expect((await f.owner`SELECT state,attempts,fence,lease_id,invocation_id,lease_until,due_at FROM allura.run_steps WHERE run_id=${rid}::uuid AND step_id='handoff'`)[0]).toEqual({state:'failed',attempts:3,fence:4,lease_id:null,invocation_id:null,lease_until:null,due_at:null});
  expect([...await f.owner`SELECT attempt,fence,receipt_id FROM allura.run_journal WHERE run_id=${rid}::uuid AND step_id='handoff' AND kind='claimed' ORDER BY seq`]).toEqual([1,2,3].map(attempt=>({attempt,fence:attempt,receipt_id:JSON.parse(receipt).id})));
  expect([...await f.owner`SELECT kind,reason,fence FROM allura.run_journal WHERE run_id=${rid}::uuid ORDER BY seq DESC LIMIT 1`]).toEqual([{kind:'terminated',reason:'attempts_exhausted',fence:4}]);
  expect(await immutable(rid)).toEqual(original);
  expect([...await f.owner`SELECT step_id FROM allura.run_effect_receipts WHERE run_id=${rid}::uuid`]).toEqual([{step_id:'prepare'}]);
  expect((await f.owner`SELECT attempts FROM allura.run_steps WHERE run_id=${rid}::uuid AND step_id='prepare'`)[0].attempts).toBe(1);
  expect(await f.owner`SELECT run_id FROM allura.run_handoff_links WHERE run_id=${rid}::uuid`).toHaveLength(0);
  const terminal=await snapshot(rid);
  expect((await child(payload(scope,h.command,'resume'))).receipt).toBe(receipt);
  expect((await child(payload(scope,h.advanceCommand,'advance'))).receipt).toBe(h.advance);
  for(const c of saved) {
    await expect(finishHandoff(f.app,f.identities.author,scope,c)).rejects.toThrow('conflict');
    expect(await child({...payload(scope,h.command,'handoff-finish'),claim:c},1)).toEqual({error:'unknown'});
  }
  await expect(resumeRun(f.app,f.identities.author,scope,{...h.command,expectedRevision:9,operationKey:randomUUID()})).rejects.toThrow('conflict');
  const view=await inspectRun(f.app,f.identities.author,scope,new URLSearchParams({group_id:scope.groupId,workspace_id:scope.workspaceId,run_id:rid,limit:'100'}));
  expect(view.runtime).toMatchObject({phase:'terminal',outcome:'partial',reason:'attempts_exhausted'});expect(view.completionVerified).toBe(false);expect(view.doctor).toContain('attempts_exhausted');
  expect(await snapshot(rid)).toEqual(terminal);
},45000);

async function live(scope: Scope) {
  return [...await f.owner`SELECT run_id,step_id,lease_id FROM allura.run_steps WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND state='leased' AND lease_until>clock_timestamp() ORDER BY run_id,step_id`];
}
async function blocked(waiter: number, blocker: number) {
  expect(waiter).not.toBe(blocker);
  for(let i=0;i<150;i++) {
    if((await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS blocked`)[0].blocked) {console.log(JSON.stringify({workspaceQuotaLockWitness:{waiter,blocker}}));return;}
    await Bun.sleep(10);
  }
  throw new Error('Exact workspace admission waiter not observed');
}
function contender(value: object) {
  const p=spawn(value),reader=p.stdout.getReader();let text='';
  const first=(async()=>{while(!text.includes('\n')){const next=await reader.read();if(next.done){throw new Error('No child PID');}text+=new TextDecoder().decode(next.value);}return JSON.parse(text.split('\n')[0]!) as {pid:number;processPid:number};})();
  const result=(async()=>{await first;while(true){const next=await reader.read();if(next.done){break;}text+=new TextDecoder().decode(next.value);}reader.releaseLock();expect(await p.exited).toBe(0);expect(await new Response(p.stderr).text()).toBe('');return JSON.parse(text.trim().split('\n')[1]!) as {result?:{claim:PreparationClaim};refused?:string};})();
  return {p,first,result};
}

test('run separate processes contend for the last workspace lease without exceeding four', async () => {
  // Exercise both quota guards as the refused contender, not whichever one
  // loses a lucky race. PostgreSQL's actual advisory queue orders each pair.
  for(const preferred of [0,1]) {
  const scope=await workspace(),foreign=await workspace();
  const prepare=await started(scope),handoff=await prepared(scope),receipt=await admit(scope,handoff.command);
  const holders=await Promise.all([started(scope),started(scope),started(scope)]),foreignRun=await started(foreign);
  // Build all runs before leasing; ten-second leases are production values.
  for(const h of holders){expect((await prepareClaim(scope,h.command)).claim).not.toBeNull();}
  const held=await live(scope);expect(held).toHaveLength(3);
  const before=[await snapshot(prepare.command.runId),await snapshot(handoff.command.runId)];
  const gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});
  let release=()=>{},holding:Promise<unknown>|undefined;
  const children:ReturnType<typeof contender>[]=[];
  try {
    const gatePid=(await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    let ready=()=>{};const entered=new Promise<void>(r=>{ready=r;}),wait=new Promise<void>(r=>{release=r;});
    holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array(${scope.groupId}::text,${scope.workspaceId}::uuid,'runs-admission')::text,12002))`;ready();await wait;});await entered;
    for(const index of [preferred,1-preferred]) {
      children[index]=contender(index===0?payload(scope,prepare.command,'quota-prepare'):{...payload(scope,handoff.command,'quota-handoff'),operationReceiptId:JSON.parse(receipt).id});
      await blocked((await children[index]!.first).pid,gatePid);
    }
    const pids=await Promise.all(children.map(c=>c.first));
    expect(new Set(pids.map(p=>p.pid)).size).toBe(2);expect(new Set(pids.map(p=>p.processPid)).size).toBe(2);
    for(const [i,pid] of pids.entries()){expect(pid.processPid).toBe(children[i]!.p.pid);await blocked(pid.pid,gatePid);}
    expect(await live(scope)).toEqual(held);
    expect(await snapshot(prepare.command.runId)).toEqual(before[0]!);expect(await snapshot(handoff.command.runId)).toEqual(before[1]!);
    release();await holding;
    const results=await Promise.all(children.map(c=>c.result));
    expect(results.filter(r=>r.result?.claim)).toHaveLength(1);expect(results.filter(r=>r.refused==='unavailable')).toHaveLength(1);
    const leases=await live(scope);expect(leases).toHaveLength(4);for(const h of held){expect(leases).toContainEqual(h);}
    const loser=results.findIndex(r=>r.refused==='unavailable'),winner=1-loser;
    expect(winner).toBe(preferred);
    const targets=[prepare,handoff];
    expect(await snapshot(targets[loser]!.command.runId)).toEqual(before[loser]!);
    const [won]=await f.owner`SELECT attempts FROM allura.run_steps WHERE run_id=${targets[winner]!.command.runId}::uuid AND step_id=${winner===0?'prepare':'handoff'}`;expect(won.attempts).toBe(1);
    // An independent workspace can claim even while this one has four live
    // leases, and neither its claim nor the refused child changes local truth.
    expect((await prepareClaim(foreign,foreignRun.command)).claim).not.toBeNull();expect(await live(foreign)).toHaveLength(1);expect(await live(scope)).toEqual(leases);
    const holder=holders[0]!;
    await cancelRun(f.app,f.identities.author,scope,{runId:holder.command.runId,expectedRevision:(await state(holder.command.runId)).revision,operationKey:randomUUID()});
    expect(await live(scope)).toHaveLength(3);
    const retry=contender(loser===0?payload(scope,prepare.command,'quota-prepare'):{...payload(scope,handoff.command,'quota-handoff'),operationReceiptId:JSON.parse(receipt).id});children.push(retry);
    expect((await retry.result).result?.claim).toMatchObject({runId:targets[loser]!.command.runId,fence:1});
    expect(await live(scope)).toHaveLength(4);expect(await live(foreign)).toHaveLength(1);
    expect((await f.owner`SELECT attempts FROM allura.run_steps WHERE run_id=${targets[loser]!.command.runId}::uuid AND step_id=${loser===0?'prepare':'handoff'}`)[0].attempts).toBe(1);
    console.log(JSON.stringify({workspaceQuotaWitness:{gatePid,children:pids,winnerStep:winner===0?'prepare':'handoff',refusedStep:loser===0?'prepare':'handoff',liveAtContention:4,releasedCapacityReused:true,foreignWorkspaceIndependent:true}}));
  } finally {release();await holding;for(const child of children){child?.p.kill();}await Promise.allSettled(children.filter(Boolean).map(c=>c.result));await gate.close();}
  }
},15000);
