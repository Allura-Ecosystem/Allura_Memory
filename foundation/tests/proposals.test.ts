import { test,expect,beforeAll,afterAll } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { capture } from '../src/capture.ts';
import { submitProposal,proposeCapture,getProposal,getProposalEvidence } from '../src/proposals.ts';
import { readEvents } from '../src/persistence.ts';
let f:Awaited<ReturnType<typeof fixture>>,event:string;
beforeAll(async()=>{f=await fixture('allura-proposals');event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'proposal-source',content:'An observed operational fact',metadata:{source:'test'}})).event_id;});
afterAll(async()=>{if(f){await f.close();}});
const input=()=>({summary:'Evidence-based proposed knowledge',evidenceIds:[event],confidence:1,assertionKind:'inference'});

test('proposal generation links exact evidence and high score remains pending',async()=>{
  const p=await submitProposal(f.app,f.identities.machine,f.scope,input());
  expect(p.version).toBe(1);expect(p.state).toBe('pending');expect(p.requesterId).toBe(f.ids.machine);expect(p.producerId).toBe(f.ids.machine);
  const read=await getProposal(f.app,f.identities.curator,f.scope,p.id);
  expect(read.confidence).toBe(1);expect(read.confidenceOrigin).toBe('submitter');expect(read.assertionKind).toBe('inference');expect(read.evidenceIds).toEqual([event]);
  expect((await getProposalEvidence(f.app,f.identities.curator,f.scope,p.id,1,event)).payload).toMatchObject({content:'An observed operational fact'});
  const generated=await proposeCapture(f.app,f.identities.machine,f.scope,event);
  expect(generated.summary).toBe('An observed operational fact');expect(generated.confidenceOrigin).toBe('unscored');expect(generated.confidence).toBe(0);expect(generated.state).toBe('pending');
  const [audit]=await f.owner`SELECT * FROM allura.proposal_audit WHERE group_id=${f.scope.groupId} AND proposal_id=${p.id}`;
  expect(audit.actor_id).toBe(f.ids.machine);expect(audit.state).toBe('pending');
});

test('proposal authority rejects spoofed actors unknown modes and inaccessible evidence',async()=>{
  for(const extra of [{requesterId:f.ids.author},{producerId:f.ids.author},{mode:'auto-promote'},{confidence:NaN},{confidence:1.1},{evidenceIds:[]},{summary:' '}]){
    await expect(submitProposal(f.app,f.identities.machine,f.scope,{...input(),...extra})).rejects.toThrow('invalid');
  }
  await expect(submitProposal(f.app,f.identities.viewer,f.scope,input())).rejects.toThrow('forbidden');
  await expect(submitProposal(f.app,f.identities.org,f.scope,input())).rejects.toThrow('forbidden');
  const unknown=randomUUID();await expect(submitProposal(f.app,f.identities.machine,f.scope,{...input(),evidenceIds:[unknown]})).rejects.toThrow('not_found');
  await f.owner`INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES (${f.scope.groupId},${f.foreignWorkspace},${unknown},${f.ids.author},'capture','{"content":"FOREIGN SECRET"}')`;
  await expect(submitProposal(f.app,f.identities.machine,f.scope,{...input(),evidenceIds:[unknown]})).rejects.toThrow('not_found');
});

test('curator sees only linked proposal evidence and viewers cannot read pending content',async()=>{
  const p=await submitProposal(f.app,f.identities.machine,f.scope,input());
  const hidden=randomUUID();await f.owner`INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES (${f.scope.groupId},${f.scope.workspaceId},${hidden},${f.ids.author},'capture','{"content":"UNLINKED SECRET"}')`;
  await expect(getProposalEvidence(f.app,f.identities.curator,f.scope,p.id,1,hidden)).rejects.toThrow('not_found');
  await expect(submitProposal(f.app,f.identities.curator,f.scope,{...input(),evidenceIds:[hidden]})).rejects.toThrow('not_found');
  await expect(readEvents(f.app,f.identities.curator,f.scope)).rejects.toThrow('forbidden');
  await expect(getProposal(f.app,f.identities.viewer,f.scope,p.id)).rejects.toThrow('forbidden');
  await expect(getProposal(f.app,f.identities.org,f.scope,p.id)).rejects.toThrow('forbidden');
  await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.curator}`;
  try {await expect(getProposal(f.app,f.identities.curator,f.scope,p.id)).rejects.toThrow('forbidden');}
  finally {await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.curator}`;}
});

test('proposal revisions are immutable and concurrent expected version has one winner',async()=>{
  const p=await submitProposal(f.app,f.identities.machine,f.scope,input());
  const revisions=await Promise.allSettled([submitProposal(f.app,f.identities.curator,f.scope,{...input(),proposalId:p.id,expectedVersion:1,summary:'Revision A'}),submitProposal(f.app,f.identities.author,f.scope,{...input(),proposalId:p.id,expectedVersion:1,summary:'Revision B'})]);
  expect(revisions.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(revisions.filter(x=>x.status==='rejected')).toHaveLength(1);
  const current=await getProposal(f.app,f.identities.curator,f.scope,p.id);
  expect(current.version).toBe(2);expect(current.requesterId).toBe(f.ids.machine);expect(current.state).toBe('pending');
  expect((await getProposal(f.app,f.identities.curator,f.scope,p.id,1)).summary).toBe(input().summary);
  await expect(f.owner`UPDATE allura.proposal_versions SET summary='rewrite' WHERE group_id=${f.scope.groupId} AND proposal_id=${p.id}`.execute()).rejects.toThrow('append-only');
});

test('proposal audit failure atomically rolls back state versions links and event',async()=>{
  const counts=new Map<string,number>();
  for(const table of ['proposal_state','proposal_versions','proposal_evidence','proposal_audit','events']) {
    counts.set(table,(await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${table} WHERE group_id=$1`,[f.scope.groupId]))[0].n as number);
  }
  await f.owner.unsafe("CREATE FUNCTION allura.proposal_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER proposal_fail BEFORE INSERT ON allura.proposal_audit FOR EACH ROW EXECUTE FUNCTION allura.proposal_fail()");
  try {await expect(submitProposal(f.app,f.identities.machine,f.scope,input())).rejects.toThrow('unknown');}
  finally {await f.owner.unsafe('DROP TRIGGER proposal_fail ON allura.proposal_audit; DROP FUNCTION allura.proposal_fail()');}
  for(const [table,count] of counts) {
    expect((await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${table} WHERE group_id=$1`,[f.scope.groupId]))[0].n).toBe(count);
  }
  expect(await f.app`SELECT * FROM allura.proposal_versions`).toHaveLength(0);
  expect(await f.app`SELECT * FROM allura.proposal_evidence`).toHaveLength(0);
});
