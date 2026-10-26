import { test,expect,beforeAll,afterAll } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { capture } from '../src/capture.ts';
import { submitProposal,getProposal } from '../src/proposals.ts';
import { decideProposal } from '../src/decisions.ts';
let f:Awaited<ReturnType<typeof fixture>>,event:string;
beforeAll(async()=>{f=await fixture('allura-decision-atomic');event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'atomic-source',content:'Atomic evidence'})).event_id;await f.owner`UPDATE allura.workspace_grants SET review_approve=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}`;});
afterAll(async()=>{if(f){await f.close();}});
const proposal=()=>submitProposal(f.app,f.identities.machine,f.scope,{summary:'Atomic reviewed content',evidenceIds:[event],assertionKind:'observation'});
const input=(id:string)=>({proposalId:id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Independent evidence review',evidenceIds:[event]});
const tables=['semantic_versions','semantic_heads','semantic_provenance','decision_receipts','events','proposal_audit','semantic_intents'];
async function counts(){const result:Record<string,number>={};for(const table of tables){result[table]=(await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${table} WHERE group_id=$1`,[f.scope.groupId]))[0].n as number;}return result;}

test('decision faults at every durable boundary and commit preserve full rollback',async()=>{
  for(const table of [...tables,'proposal_state','deferred_commit']){
    const p=await proposal(),before=await counts();
    const triggerTable=table==='deferred_commit'?'semantic_intents':table;
    const trigger=table==='deferred_commit'?`CREATE CONSTRAINT TRIGGER atomic_failure AFTER INSERT ON allura.${triggerTable} DEFERRABLE INITIALLY DEFERRED`:`CREATE TRIGGER atomic_failure BEFORE ${table==='proposal_state'?'UPDATE':'INSERT'} ON allura.${triggerTable}`;
    await f.owner.unsafe(`CREATE FUNCTION allura.atomic_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected atomic boundary'; END $$; ${trigger} FOR EACH ROW EXECUTE FUNCTION allura.atomic_failure()`);
    try{await expect(decideProposal(f.app,f.identities.reviewer,f.scope,input(p.id))).rejects.toThrow('unknown');}
    finally{await f.owner.unsafe(`DROP TRIGGER atomic_failure ON allura.${triggerTable}; DROP FUNCTION allura.atomic_failure()`);}
    expect(await counts()).toEqual(before);
    expect((await getProposal(f.app,f.identities.curator,f.scope,p.id)).state).toBe('pending');
  }
});

test('concurrent decision replay and independent competing reviewers have one atomic winner',async()=>{
  const p=await proposal(),request=input(p.id);
  const receipts=await Promise.all(Array.from({length:6},()=>decideProposal(f.app,f.identities.reviewer,f.scope,request)));
  expect(new Set(receipts).size).toBe(1);const receipt=JSON.parse(receipts[0]!);
  expect(await f.owner`SELECT * FROM allura.semantic_versions WHERE group_id=${f.scope.groupId} AND proposal_id=${p.id}`).toHaveLength(1);
  expect(await f.owner`SELECT * FROM allura.semantic_provenance WHERE group_id=${f.scope.groupId} AND semantic_version_id=${receipt.semantic_version_id}`).toHaveLength(1);
  expect(await f.owner`SELECT * FROM allura.semantic_intents WHERE group_id=${f.scope.groupId} AND decision_id=${receipt.receipt_id}`).toHaveLength(1);
  const competing=await proposal();
  const results=await Promise.allSettled([decideProposal(f.app,f.identities.reviewer,f.scope,input(competing.id)),decideProposal(f.app,f.identities.author,f.scope,input(competing.id))]);
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect(await f.owner`SELECT * FROM allura.semantic_versions WHERE group_id=${f.scope.groupId} AND proposal_id=${competing.id}`).toHaveLength(1);
});

test('terminated approval connection leaves no partial state and same key can recover',async()=>{
  const p=await proposal(),request=input(p.id),before=await counts();
  await f.owner.unsafe('CREATE FUNCTION allura.atomic_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(3); RETURN NEW; END $$; CREATE TRIGGER atomic_pause BEFORE INSERT ON allura.semantic_intents FOR EACH ROW EXECUTE FUNCTION allura.atomic_pause()');
  const pending=decideProposal(f.app,f.identities.reviewer,f.scope,request).then(value=>({value,error:''}),error=>({value:'',error:String(error)}));
  let terminated=false;
  try{
    for(let attempt=0;attempt<100;attempt++){
      const rows=await f.owner`SELECT pid FROM pg_stat_activity WHERE usename='allura_app' AND state='active' AND wait_event='PgSleep' AND query LIKE '%allura.decide_proposal%'`;
      if(rows.length===1){terminated=(await f.owner`SELECT pg_terminate_backend(${rows[0].pid}) AS stopped`)[0].stopped as boolean;break;}
      await Bun.sleep(10);
    }
    expect(terminated).toBe(true);expect((await pending).error).toContain('unknown');
  }finally{await pending;await f.owner.unsafe('DROP TRIGGER atomic_pause ON allura.semantic_intents; DROP FUNCTION allura.atomic_pause()');}
  expect(await counts()).toEqual(before);expect((await getProposal(f.app,f.identities.curator,f.scope,p.id)).state).toBe('pending');
  const receipt=await decideProposal(f.app,f.identities.reviewer,f.scope,request);expect(await decideProposal(f.app,f.identities.reviewer,f.scope,request)).toBe(receipt);
});

test('lost HTTP approval response reconciles without repeating semantic mutation',async()=>{
  const p=await proposal(),request=input(p.id);let notify!:()=>void,release!:()=>void;
  const committed=new Promise<void>(resolve=>{notify=resolve;}),wait=new Promise<void>(resolve=>{release=resolve;});
  const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async()=>{const receipt=await decideProposal(f.app,f.identities.reviewer,f.scope,request);notify();await wait;return new Response(receipt);}});
  const abort=new AbortController();const response=fetch(server.url,{signal:abort.signal}).then(()=>false,()=>true);
  try{await committed;abort.abort();expect(await response).toBe(true);release();
    const reconciled=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,request));expect(reconciled.outcome).toBe('approved');
    expect(await f.owner`SELECT * FROM allura.semantic_versions WHERE group_id=${f.scope.groupId} AND proposal_id=${p.id}`).toHaveLength(1);
  }finally{release();await server.stop(true);}
});
