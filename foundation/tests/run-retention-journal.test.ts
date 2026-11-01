import { test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { startRun, advanceRun, decideRun, resumeRun, inspectRun, cancelRun } from '../src/runs.ts';
import { scopedTransaction } from '../src/persistence.ts';
import { runDefinition, type RunCommandV1, type RunInspection } from '../src/run-contract.ts';
import { finishHandoff, type PreparationClaim } from '../src/run-execution.ts';
import { type Scope } from '../src/authority.ts';

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => { f = await fixture(`allura-retention-journal-${randomUUID()}`); });
afterAll(async () => { await f?.close(); });
async function workspace() {
  const scope = { ...f.scope, workspaceId: randomUUID() };
  await f.owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES(${scope.groupId},${scope.workspaceId}::uuid,'Retention journal fixture',${f.ids.author}::uuid)`;
  for (const id of [f.ids.author,f.ids.reviewer]) { await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${scope.groupId},${scope.workspaceId}::uuid,${id}::uuid,'workspace_admin',${f.ids.author}::uuid)`; }
  return scope;
}
function input() {
  const text = 'Natural retained journal boundary evidence';
  return { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 6, goal: 'Bounded immutable history', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
}
async function started(scope: Scope) {
  const value=input(),receipt=await startRun(f.app,f.identities.author,scope,value);
  return {input:value,receipt,command:{runId:JSON.parse(receipt).runId as string,expectedRevision:1,operationKey:randomUUID()}};
}
const tables=['run_definitions','run_records','run_state','run_steps','run_journal','run_operation_receipts','run_effect_receipts','run_approval_requests','run_approval_decisions','run_handoff_links'];
async function snapshot(scope: Scope, exclude?: string) {
  return Promise.all(tables.map(async table => [...await f.owner.unsafe(`SELECT to_jsonb(t)::text AS row FROM allura.${table} t WHERE group_id=$1 AND workspace_id=$2::uuid${exclude && table!=='run_definitions' ? ` AND ${table==='run_records'?'id':'run_id'}<>$3::uuid` : ''} ORDER BY 1`,exclude && table!=='run_definitions' ? [scope.groupId,scope.workspaceId,exclude] : [scope.groupId,scope.workspaceId])]));
}
async function counts(scope: Scope) {
  return (await f.owner`SELECT count(*)::int AS retained,count(*) FILTER(WHERE phase<>'terminal')::int AS nonterminal FROM allura.run_records r JOIN allura.run_state s ON (s.group_id,s.workspace_id,s.run_id)=(r.group_id,r.workspace_id,r.id) WHERE r.group_id=${scope.groupId} AND r.workspace_id=${scope.workspaceId}::uuid`)[0];
}
async function state(runId: string) { return (await f.owner`SELECT phase,outcome,reason,revision,checkpoint_seq,next_step_id FROM allura.run_state WHERE run_id=${runId}::uuid`)[0]; }
async function inspect(scope: Scope, runId: string, afterSeq=0, limit=100) {
  return inspectRun(f.app,f.identities.author,scope,new URLSearchParams({group_id:scope.groupId,workspace_id:scope.workspaceId,run_id:runId,after_seq:String(afterSeq),limit:String(limit)}));
}
async function blocked(waiter: number, blocker: number) {
  expect(waiter).not.toBe(blocker);
  for(let i=0;i<100;i++) {
    if((await f.owner`SELECT ${blocker}::int=ANY(pg_blocking_pids(${waiter}::int)) AS blocked`)[0].blocked) {console.log(JSON.stringify({retentionLockWitness:{waiter,blocker}}));return;}
    await Bun.sleep(10);
  }
  throw new Error('Exact retention admission waiter not observed');
}

test('run retained total saturation admits one final concurrent start and preserves scoped history', async () => {
  const scope=await workspace(),other=await workspace(),old=[];
  for(let i=0;i<255;i++) {
    const h=await started(scope);
    // Only one nonterminal run ever exists during setup; never hit32 first.
    expect(await counts(scope)).toEqual({retained:i+1,nonterminal:1});
    const cancelled=await cancelRun(f.app,f.identities.author,scope,h.command);
    old.push({...h,cancelled});
    expect(await counts(scope)).toEqual({retained:i+1,nonterminal:0});
  }
  const foreign=await started(other),foreignBefore=await snapshot(other),before=await snapshot(scope);
  const apps=[new SQL(f.appUrl,{max:1}),new SQL(f.appUrl,{max:1})],gate=new SQL(process.env.ALLURA_DISPOSABLE_DB_URL!,{max:1});
  let release=()=>{},holding:Promise<unknown>|undefined;
  const pending:Promise<{receipt:string}|{error:string}>[]=[];
  try {
    const pids=await Promise.all(apps.map(async app => (await app`SELECT pg_backend_pid() AS pid`)[0].pid as number));
    expect(new Set(pids).size).toBe(2);
    for(const app of apps) { expect((await app`SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`)[0]).toEqual({rolname:'allura_app',rolsuper:false,rolbypassrls:false}); }
    const gatePid=(await gate`SELECT pg_backend_pid() AS pid`)[0].pid as number;
    let ready=()=>{};const entered=new Promise<void>(r=>{ready=r;}),wait=new Promise<void>(r=>{release=r;});
    holding=gate.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array(${scope.groupId}::text,${scope.workspaceId}::uuid,'runs-admission')::text,12002))`;ready();await wait;});await entered;
    const inputs=[input(),input()];
    for(const [i,app] of apps.entries()) {
      pending.push(startRun(app,f.identities.author,scope,inputs[i]!).then(receipt=>({receipt}),e=>({error:(e as Error).message})));
      await blocked(pids[i]!,gatePid);
    }
    for(const pid of pids) { await blocked(pid,gatePid); }
    expect(await snapshot(scope)).toEqual(before);
    release();await holding;
    const results=await Promise.all(pending);
    expect(results.filter(r=>'receipt' in r)).toHaveLength(1);expect(results.filter(r=>'error' in r)).toEqual([{error:'run_unavailable'}]);
    const winner=results.findIndex(r=>'receipt' in r),won=results[winner]!;
    if(!('receipt' in won)) { throw new Error('Missing accepted contender'); }
    const runId=JSON.parse(won.receipt).runId as string,loser=inputs[1-winner]!;
    expect(await counts(scope)).toEqual({retained:256,nonterminal:1});
    expect(await snapshot(scope,runId)).toEqual(before);
    expect(await f.owner`SELECT id FROM allura.run_operation_receipts WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND operation_key=${loser.operationKey}`).toHaveLength(0);
    const cancelCommand={runId,expectedRevision:1,operationKey:randomUUID()},cancelled=await cancelRun(f.app,f.identities.author,scope,cancelCommand);
    expect(await counts(scope)).toEqual({retained:256,nonterminal:0});
    const stable=await snapshot(scope);
    await expect(startRun(f.app,f.identities.author,scope,loser)).rejects.toThrow('unavailable');
    await expect(startRun(f.app,f.identities.author,scope,input())).rejects.toThrow('unavailable');
    for(const h of [old[0]!,old.at(-1)!]) {
      expect(await startRun(f.app,f.identities.author,scope,h.input)).toBe(h.receipt);
      expect(await cancelRun(f.app,f.identities.author,scope,h.command)).toBe(h.cancelled);
      await expect(startRun(f.app,f.identities.author,scope,{...h.input,goal:'Changed envelope'})).rejects.toThrow('conflict');
      await expect(cancelRun(f.app,f.identities.author,scope,{...h.command,expectedRevision:2})).rejects.toThrow('conflict');
      const view=await inspect(scope,h.command.runId);
      expect(view.runtime).toMatchObject({phase:'terminal',outcome:'failed',reason:'cancelled',checkpointSeq:3});
      expect(view.journal.map(j=>j.seq)).toEqual([1,2,3]);expect(view.doctor).toEqual(['cancelled']);expect(view.completionVerified).toBe(false);
      await expect(inspect(other,h.command.runId)).rejects.toThrow('not_found');
    }
    expect(await startRun(f.app,f.identities.author,scope,inputs[winner]!)).toBe(won.receipt);
    expect(await cancelRun(f.app,f.identities.author,scope,cancelCommand)).toBe(cancelled);
    expect(await snapshot(scope)).toEqual(stable);expect(await snapshot(other)).toEqual(foreignBefore);
    const next=await started(other);await cancelRun(f.app,f.identities.author,other,next.command);
    await cancelRun(f.app,f.identities.author,other,foreign.command);
    expect(await counts(other)).toEqual({retained:2,nonterminal:0});expect(await snapshot(scope)).toEqual(stable);
    console.log(JSON.stringify({retentionWitness:{gatePid,pids,retained:256,terminal:256,accepted:1,refused:1,foreignProgress:true}}));
  } finally {release();await holding;await Promise.allSettled(pending);await Promise.all(apps.map(app=>app.close()));await gate.close();}
},30000);

async function admit(scope: Scope, command: RunCommandV1) {
  // Guarded production admission only: deliberately do not auto-execute handoff.
  // Each call owns a separate real scoped transaction and commit.
  return scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.resume_run(${scope.groupId},${scope.workspaceId}::uuid,${command}::jsonb,${await runDefinition()}::jsonb) AS receipt`)[0].receipt as string);
}
async function claim(scope: Scope, receipt: string) {
  const op=JSON.parse(receipt);
  return scopedTransaction(f.app,f.identities.author,scope,'workspace:grants:manage',async tx => (await tx`SELECT allura.claim_run_handoff(${scope.groupId},${scope.workspaceId}::uuid,${op.runId}::uuid,${op.id}::uuid,${await runDefinition()}::jsonb,${randomUUID()}::uuid) AS claim`)[0].claim as PreparationClaim | null);
}
async function boundary() {
  const scope=await workspace(),h=await started(scope),rid=h.command.runId;
  const advance=await advanceRun(f.app,f.identities.author,scope,h.command);
  const a=JSON.parse((await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${rid}::uuid`)[0].request_text);
  const decisionCommand={runId:rid,expectedRevision:a.requestedAtRevision as number,operationKey:randomUUID(),approvalRequestId:a.id as string,reviewedEvidenceDigest:a.evidenceDigest as string,decision:'approve' as const,rationale:'Independent boundary approval'};
  const decision=await decideRun(f.app,f.identities.reviewer,scope,decisionCommand);
  expect(await state(rid)).toMatchObject({phase:'ready',revision:4,checkpoint_seq:5,next_step_id:'handoff'});
  const admissions:{command:RunCommandV1;receipt:string}[]=[];
  for(let i=0;i<120;i++) {
    const command={runId:rid,expectedRevision:4+i,operationKey:randomUUID()},receipt=await admit(scope,command);
    expect(JSON.parse(receipt)).toMatchObject({command:'resume',runId:rid,acceptedRevision:5+i,journalSeq:6+i,phaseAtAcceptance:'ready'});
    admissions.push({command,receipt});
  }
  expect(new Set(admissions.map(a=>a.command.operationKey)).size).toBe(120);
  expect(await state(rid)).toEqual({phase:'ready',outcome:null,reason:'none',revision:124,checkpoint_seq:125,next_step_id:'handoff'});
  const before=await snapshot(scope);
  await expect(admit(scope,{runId:rid,expectedRevision:124,operationKey:randomUUID()})).rejects.toThrow('unavailable');
  expect(await snapshot(scope)).toEqual(before);
  expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${rid}::uuid AND step_id='handoff'`).toHaveLength(0);
  const last=admissions.at(-1)!,c=await claim(scope,last.receipt);expect(c).not.toBeNull();
  expect(c).toMatchObject({runId:rid,fence:1,operationReceiptId:JSON.parse(last.receipt).id});
  expect(await state(rid)).toMatchObject({phase:'running',revision:125,checkpoint_seq:126});
  expect((await f.owner`SELECT attempts,fence,lease_until>clock_timestamp() AS valid FROM allura.run_steps WHERE run_id=${rid}::uuid AND step_id='handoff'`)[0]).toEqual({attempts:1,fence:1,valid:true});
  return {scope,h,rid,advance,decision,decisionCommand,admissions,last,c:c!,beforeClaim:before};
}
async function journal(runId: string) {
  return [...await f.owner`SELECT seq,kind,reason,receipt_id,effect_receipt_id,approval_request_id,approval_decision_id,attempt,fence FROM allura.run_journal WHERE run_id=${runId}::uuid ORDER BY seq`];
}
async function paginated(scope: Scope, rid: string, succeeded: boolean) {
  const entries:RunInspection['journal']=[];
  for(const after of [0,100]) {
    const view=await inspect(scope,rid,after);
    expect(view.journal).toHaveLength(after===0?100:28);expect(view.hasMore).toBe(after===0);expect(view.afterSeq).toBe(after===0?100:128);
    expect(view.completionVerified).toBe(succeeded);expect(view.doctor).toEqual(succeeded?[]:['cancelled']);
    entries.push(...view.journal);
  }
  expect(entries.map(j=>j.seq)).toEqual(Array.from({length:128},(_,i)=>i+1));
  expect(new Set(entries.map(j=>j.eventId)).size).toBe(128);
  const empty=await inspect(scope,rid,128);expect(empty.journal).toEqual([]);expect(empty.hasMore).toBe(false);expect(empty.afterSeq).toBe(128);
  const stored=await journal(rid);
  expect(entries.map(j=>({seq:j.seq,kind:j.kind,reason:j.reason,receipt_id:j.receiptId,effect_receipt_id:j.effectReceiptId,approval_request_id:j.approvalRequestId,approval_decision_id:j.approvalDecisionId,attempt:j.attempt,fence:j.fence}))).toEqual(stored);
  return inspect(scope,rid);
}
async function replay(b: Awaited<ReturnType<typeof boundary>>) {
  expect(await startRun(f.app,f.identities.author,b.scope,b.h.input)).toBe(b.h.receipt);
  expect(await advanceRun(f.app,f.identities.author,b.scope,b.h.command)).toBe(b.advance);
  expect(await decideRun(f.app,f.identities.reviewer,b.scope,b.decisionCommand)).toBe(b.decision);
  for(const a of b.admissions) { expect(await resumeRun(f.app,f.identities.author,b.scope,a.command)).toBe(a.receipt); }
}
async function preservedPrefix(scope: Scope, before: Awaited<ReturnType<typeof snapshot>>) {
  const after=await snapshot(scope);
  // Mutable runtime/steps may advance; all immutable preexisting rows remain exact.
  for(const [i,table] of tables.entries()) {
    if(table==='run_state'||table==='run_steps') { continue; }
    for(const row of before[i]!) { expect(after[i]!).toContainEqual(row); }
  }
}

test('run journal admission exhaustion preserves reserved handoff completion through row 128', async () => {
  const b=await boundary(),prefix=await journal(b.rid);
  await finishHandoff(f.app,f.identities.author,b.scope,b.c);
  expect(await state(b.rid)).toEqual({phase:'terminal',outcome:'succeeded',reason:'none',revision:126,checkpoint_seq:128,next_step_id:null});
  const rows=await journal(b.rid);expect(rows.slice(0,126)).toEqual(prefix);
  expect(rows.map(j=>j.seq)).toEqual(Array.from({length:128},(_,i)=>i+1));
  expect(rows.slice(125).map(j=>({seq:j.seq,kind:j.kind,receipt_id:j.receipt_id}))).toEqual(['claimed','effect_committed','terminated'].map((kind,i)=>({seq:126+i,kind,receipt_id:JSON.parse(b.last.receipt).id})));
  const links=[...await f.owner`SELECT * FROM allura.run_handoff_links WHERE run_id=${b.rid}::uuid`];expect(links).toHaveLength(1);
  const link=links[0]!;
  const effects=[...await f.owner`SELECT step_id,id,receipt_text FROM allura.run_effect_receipts WHERE run_id=${b.rid}::uuid ORDER BY journal_seq`];expect(effects.map(e=>e.step_id)).toEqual(['prepare','handoff']);
  const approval=(await f.owner`SELECT id,prepared_receipt_id FROM allura.run_approval_requests WHERE run_id=${b.rid}::uuid`)[0],decision=(await f.owner`SELECT id,request_id,decision FROM allura.run_approval_decisions WHERE run_id=${b.rid}::uuid`)[0];
  expect(link).toMatchObject({prepared_receipt_id:effects[0]!.id,handoff_receipt_id:effects[1]!.id,approval_request_id:approval.id,approval_decision_id:decision.id});
  expect(approval.prepared_receipt_id).toBe(effects[0]!.id);expect(decision).toMatchObject({request_id:approval.id,decision:'approve'});
  expect(JSON.parse(effects[1]!.receipt_text)).toMatchObject({preparedReceiptId:effects[0]!.id,approvalRequestId:approval.id,approvalDecisionId:decision.id,journalSeq:127,attempt:1,fence:1});
  for(const row of rows.slice(126)) { expect(row).toMatchObject({effect_receipt_id:link.handoff_receipt_id,approval_request_id:link.approval_request_id,approval_decision_id:link.approval_decision_id}); }
  await preservedPrefix(b.scope,b.beforeClaim);
  const stable=await snapshot(b.scope),view=await paginated(b.scope,b.rid,true);
  expect(view.runtime).toMatchObject({phase:'terminal',outcome:'succeeded',checkpointSeq:128});
  await replay(b);await expect(finishHandoff(f.app,f.identities.author,b.scope,b.c)).rejects.toThrow('conflict');
  expect(await snapshot(b.scope)).toEqual(stable);
  console.log(JSON.stringify({journalReservationWitness:{admissions:120,deniedAt:125,claim:126,effect:127,terminal:128,completionVerified:true}}));
},20000);

test('run journal exhaustion preserves reserved cancellation after an abandoned boundary claim', async () => {
  const b=await boundary(),prefix=await journal(b.rid),before=await snapshot(b.scope);
  const [timing]=await f.owner`SELECT greatest(0,ceil(extract(epoch FROM(due_at-clock_timestamp()))*1000))::int AS ms FROM allura.run_steps WHERE run_id=${b.rid}::uuid AND step_id='handoff'`;
  expect(timing.ms).toBeLessThanOrEqual(11000);await Bun.sleep(timing.ms+10);
  expect((await f.owner`SELECT lease_until<=clock_timestamp() AS expired,due_at<=clock_timestamp() AS due,attempts,fence FROM allura.run_steps WHERE run_id=${b.rid}::uuid AND step_id='handoff'`)[0]).toEqual({expired:true,due:true,attempts:1,fence:1});
  await expect(claim(b.scope,b.last.receipt)).rejects.toThrow('unavailable');
  await expect(resumeRun(f.app,f.identities.author,b.scope,b.last.command)).rejects.toThrow('unavailable');
  await expect(admit(b.scope,{runId:b.rid,expectedRevision:125,operationKey:randomUUID()})).rejects.toThrow('conflict');
  await expect(finishHandoff(f.app,f.identities.author,b.scope,b.c)).rejects.toThrow('conflict');
  expect(await snapshot(b.scope)).toEqual(before);
  const cancelCommand={runId:b.rid,expectedRevision:125,operationKey:randomUUID()},cancelled=await cancelRun(f.app,f.identities.author,b.scope,cancelCommand);
  expect(JSON.parse(cancelled)).toMatchObject({acceptedRevision:126,journalSeq:127,phaseAtAcceptance:'terminal'});
  expect(await state(b.rid)).toEqual({phase:'terminal',outcome:'partial',reason:'cancelled',revision:126,checkpoint_seq:128,next_step_id:null});
  const rows=await journal(b.rid);expect(rows.slice(0,126)).toEqual(prefix);
  expect(rows.slice(126).map(j=>({seq:j.seq,kind:j.kind,reason:j.reason,receipt_id:j.receipt_id}))).toEqual(['cancel_requested','terminated'].map((kind,i)=>({seq:127+i,kind,reason:'cancelled',receipt_id:JSON.parse(cancelled).id})));
  expect((await f.owner`SELECT state,attempts,fence,lease_id,invocation_id,lease_until,due_at FROM allura.run_steps WHERE run_id=${b.rid}::uuid AND step_id='handoff'`)[0]).toEqual({state:'failed',attempts:1,fence:2,lease_id:null,invocation_id:null,lease_until:null,due_at:null});
  expect(await f.owner`SELECT run_id FROM allura.run_handoff_links WHERE run_id=${b.rid}::uuid`).toHaveLength(0);
  expect([...await f.owner`SELECT step_id FROM allura.run_effect_receipts WHERE run_id=${b.rid}::uuid`]).toEqual([{step_id:'prepare'}]);
  await preservedPrefix(b.scope,b.beforeClaim);
  const stable=await snapshot(b.scope),view=await paginated(b.scope,b.rid,false);
  expect(view.runtime).toMatchObject({phase:'terminal',outcome:'partial',reason:'cancelled',checkpointSeq:128});
  expect(await cancelRun(f.app,f.identities.author,b.scope,cancelCommand)).toBe(cancelled);
  await replay(b);expect(await claim(b.scope,b.last.receipt)).toBeNull();
  await expect(finishHandoff(f.app,f.identities.author,b.scope,b.c)).rejects.toThrow('conflict');
  expect(await snapshot(b.scope)).toEqual(stable);
  console.log(JSON.stringify({journalCancellationWitness:{realLeaseAndDueElapsed:true,recovery:'unavailable',attempts:1,claim:126,cancel:127,terminal:128,completionVerified:false}}));
},25000);
