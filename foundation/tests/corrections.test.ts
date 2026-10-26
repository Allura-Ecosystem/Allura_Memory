import { test,expect,beforeAll,afterAll } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { capture } from '../src/capture.ts';
import { submitProposal,getProposal } from '../src/proposals.ts';
import { decideProposal } from '../src/decisions.ts';
import { submitCorrection } from '../src/corrections.ts';
import { createReviewGateway } from '../src/review-api.ts';
let f:Awaited<ReturnType<typeof fixture>>,event:string;
beforeAll(async()=>{f=await fixture('allura-corrections');event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'correction-source',content:'Original source'})).event_id;});
afterAll(async()=>{if(f){await f.close();}});
const approve=(id:string,version=1)=>decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:id,reviewedProposalVersion:version,operationKey:randomUUID(),decision:'approve',rationale:'Reviewed exact correction and source',evidenceIds:[event]});
async function initial(){const p=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Original semantic content',evidenceIds:[event],assertionKind:'observation'});return JSON.parse(await approve(p.id)) as {semantic_version_id:string;knowledge_id:string};}
const input=(base:string)=>({baseMemoryId:base,expectedBaseVersion:'1',content:'Corrected semantic content',rationale:'Source supports corrected wording',evidenceIds:[event],operationKey:randomUUID()});

test('correction submission is pending retry safe and never directly replaces the head',async()=>{
  const base=await initial(),request=input(base.semantic_version_id),bytes=await submitCorrection(f.app,f.identities.curator,f.scope,request),receipt=JSON.parse(bytes);
  expect(receipt.status).toBe('pending_review');expect(receipt.base_memory_id).toBe(base.semantic_version_id);expect(await submitCorrection(f.app,f.identities.curator,f.scope,request)).toBe(bytes);
  await expect(submitCorrection(f.app,f.identities.curator,f.scope,{...request,content:'changed key payload'})).rejects.toThrow('conflict');
  expect((await f.owner`SELECT current_version_id FROM allura.semantic_heads WHERE group_id=${f.scope.groupId} AND knowledge_id=${base.knowledge_id}`)[0].current_version_id).toBe(base.semantic_version_id);
  const proposal=await getProposal(f.app,f.identities.reviewer,f.scope,receipt.proposal_id);expect(proposal.state).toBe('pending');expect(proposal.summary).toBe(request.content);expect(proposal.evidenceIds).toHaveLength(2);
  expect(proposal.correction).toMatchObject({baseMemoryId:base.semantic_version_id,expectedBaseVersion:'1',baseContent:'Original semantic content'});
  await expect(submitProposal(f.app,f.identities.curator,f.scope,{summary:'Drop correction base',evidenceIds:[event],assertionKind:'observation',proposalId:receipt.proposal_id,expectedVersion:1})).rejects.toThrow('conflict');
});

test('correction approval appends immutable version and lineage with one current head',async()=>{
  const base=await initial(),submission=JSON.parse(await submitCorrection(f.app,f.identities.curator,f.scope,input(base.semantic_version_id)));
  const decision=JSON.parse(await approve(submission.proposal_id));expect(decision.knowledge_id).toBe(base.knowledge_id);
  const [version]=await f.owner`SELECT * FROM allura.semantic_versions WHERE group_id=${f.scope.groupId} AND id=${decision.semantic_version_id}`;
  expect(version.version).toBe(2);expect(version.content).toBe('Corrected semantic content');
  expect((await f.owner`SELECT content FROM allura.semantic_versions WHERE group_id=${f.scope.groupId} AND id=${base.semantic_version_id}`)[0].content).toBe('Original semantic content');
  expect(await f.owner`SELECT * FROM allura.semantic_supersedes WHERE group_id=${f.scope.groupId} AND newer_id=${decision.semantic_version_id} AND older_id=${base.semantic_version_id}`).toHaveLength(1);
  expect((await f.owner`SELECT current_version_id FROM allura.semantic_heads WHERE group_id=${f.scope.groupId} AND knowledge_id=${base.knowledge_id}`)[0].current_version_id).toBe(decision.semantic_version_id);
  await expect(f.owner`DELETE FROM allura.semantic_supersedes WHERE group_id=${f.scope.groupId}`.execute()).rejects.toThrow('append-only');
  await expect(submitCorrection(f.app,f.identities.curator,f.scope,input(base.semantic_version_id))).rejects.toThrow('conflict');
});

test('competing corrections require explicit refresh and new human reviewed version',async()=>{
  const base=await initial();
  const a=JSON.parse(await submitCorrection(f.app,f.identities.curator,f.scope,input(base.semantic_version_id))),b=JSON.parse(await submitCorrection(f.app,f.identities.curator,f.scope,input(base.semantic_version_id)));
  const results=await Promise.allSettled([approve(a.proposal_id),approve(b.proposal_id)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const losing=results[0]!.status==='rejected'?a:b;
  const [head]=await f.owner`SELECT * FROM allura.semantic_heads WHERE group_id=${f.scope.groupId} AND knowledge_id=${base.knowledge_id}`;
  const refreshed=JSON.parse(await submitCorrection(f.app,f.identities.curator,f.scope,{...input(head.current_version_id),expectedBaseVersion:'2',proposalId:losing.proposal_id,expectedProposalVersion:1,content:'Refreshed correction'}));
  expect(refreshed.proposal_version).toBe(2);await expect(approve(losing.proposal_id,1)).rejects.toThrow('conflict');
  const accepted=JSON.parse(await approve(losing.proposal_id,2));
  expect((await f.owner`SELECT version FROM allura.semantic_versions WHERE group_id=${f.scope.groupId} AND id=${accepted.semantic_version_id}`)[0].version).toBe(3);
  expect(await f.owner`SELECT * FROM allura.semantic_supersedes WHERE group_id=${f.scope.groupId} AND knowledge_id=${base.knowledge_id}`).toHaveLength(2);
});

test('correction denies foreign base invalid version and unauthorised actor without writes',async()=>{
  const base=await initial();
  await expect(submitCorrection(f.app,f.identities.viewer,f.scope,input(base.semantic_version_id))).rejects.toThrow('forbidden');
  await expect(submitCorrection(f.app,f.identities.curator,f.scope,input(randomUUID()))).rejects.toThrow('not_found');
  for(const value of [0,'0','01','-1','1.0']){await expect(submitCorrection(f.app,f.identities.curator,f.scope,{...input(base.semantic_version_id),expectedBaseVersion:value})).rejects.toThrow('invalid');}
  await expect(submitCorrection(f.app,f.identities.curator,f.scope,{...input(base.semantic_version_id),expectedBaseVersion:'2'})).rejects.toThrow('conflict');
});

test('supersedes failure rolls back new semantic receipt intent and head change',async()=>{
  const base=await initial(),submission=JSON.parse(await submitCorrection(f.app,f.identities.curator,f.scope,input(base.semantic_version_id)));
  const [before]=await f.owner`SELECT count(*)::int AS n FROM allura.semantic_versions WHERE group_id=${f.scope.groupId}`;
  await f.owner.unsafe("CREATE FUNCTION allura.lineage_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected lineage failure'; END $$; CREATE TRIGGER lineage_fail BEFORE INSERT ON allura.semantic_supersedes FOR EACH ROW EXECUTE FUNCTION allura.lineage_fail()");
  try{await expect(approve(submission.proposal_id)).rejects.toThrow('unknown');}
  finally{await f.owner.unsafe('DROP TRIGGER lineage_fail ON allura.semantic_supersedes; DROP FUNCTION allura.lineage_fail()');}
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.semantic_versions WHERE group_id=${f.scope.groupId}`)[0].n).toBe(before.n);
  expect((await getProposal(f.app,f.identities.reviewer,f.scope,submission.proposal_id)).state).toBe('pending');
  expect((await f.owner`SELECT current_version_id FROM allura.semantic_heads WHERE group_id=${f.scope.groupId} AND knowledge_id=${base.knowledge_id}`)[0].current_version_id).toBe(base.semantic_version_id);
  expect(await f.owner`SELECT * FROM allura.decision_receipts WHERE group_id=${f.scope.groupId} AND proposal_id=${submission.proposal_id}`).toHaveLength(0);
});

test('correction submission receipt failure rolls back evidence proposal and base binding',async()=>{
  const base=await initial(),tables=['events','proposal_state','proposal_versions','proposal_evidence','correction_targets','correction_receipts'];
  const counts=new Map<string,number>();
  for(const table of tables){counts.set(table,(await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${table} WHERE group_id=$1`,[f.scope.groupId]))[0].n as number);}
  await f.owner.unsafe("CREATE FUNCTION allura.correction_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected correction receipt'; END $$; CREATE TRIGGER correction_fail BEFORE INSERT ON allura.correction_receipts FOR EACH ROW EXECUTE FUNCTION allura.correction_fail()");
  try{await expect(submitCorrection(f.app,f.identities.curator,f.scope,input(base.semantic_version_id))).rejects.toThrow('unknown');}
  finally{await f.owner.unsafe('DROP TRIGGER correction_fail ON allura.correction_receipts; DROP FUNCTION allura.correction_fail()');}
  for(const [table,count] of counts){expect((await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${table} WHERE group_id=$1`,[f.scope.groupId]))[0].n).toBe(count);}
});

test('real correction HTTP exposes exact base for fresh independent review',async()=>{
  const base=await initial(),server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createReviewGateway(f.app,f.humanConfig,'https://allura.example')});
  const send=(path:string,who:'curator'|'reviewer',body:Record<string,unknown>)=>fetch(`http://127.0.0.1:${server.port}/api/review/${path}?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt(who),'Content-Type':'application/json',Origin:'https://allura.example','Sec-Fetch-Site':'same-origin'},body:JSON.stringify(body)});
  try{
    const response=await send('correction','curator',input(base.semantic_version_id));expect(response.status).toBe(200);const receipt=await response.json() as {proposal_id:string};
    const reviewed=await send('proposal','reviewer',{proposalId:receipt.proposal_id});expect(reviewed.status).toBe(200);expect(await reviewed.json()).toMatchObject({correction:{baseMemoryId:base.semantic_version_id,baseContent:'Original semantic content',expectedBaseVersion:'1'}});
    const decision=await send('decision','reviewer',{proposalId:receipt.proposal_id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Compared exact base and corrected version',evidenceIds:[event]});expect(decision.status).toBe(200);expect(await decision.json()).toMatchObject({outcome:'approved',knowledge_id:base.knowledge_id});
  }finally{await server.stop(true);}
});
