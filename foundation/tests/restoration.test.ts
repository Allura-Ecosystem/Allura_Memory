import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {submitProposal,getProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {deleteMemory,knowledgeHistory} from '../src/lifecycle.ts';
import {submitRestoration} from '../src/restoration.ts';
import {submitCorrection} from '../src/corrections.ts';
import {createReviewGateway} from '../src/review-api.ts';
let f:Awaited<ReturnType<typeof fixture>>,event:string;
beforeAll(async()=>{f=await fixture('allura-restoration');event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'restore',content:'Original historical source'})).event_id;});
afterAll(async()=>{if(f){await f.close();}});
const decision=(proposalId:string)=>({proposalId,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Reviewed exact historical content and deletion',evidenceIds:[event]});
async function initial(){const p=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Historical content',evidenceIds:[event],assertionKind:'observation'});return JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,decision(p.id))) as {semantic_version_id:string;knowledge_id:string};}
async function deleted(){const base=await initial();await deleteMemory(f.app,f.identities.author,f.scope,{memoryId:base.semantic_version_id,expectedHeadRevision:1,reason:'Withdrawn pending investigation',operationKey:randomUUID()});return base;}
const input=(id:string)=>({sourceMemoryId:id,expectedHeadId:id,expectedHeadRevision:2,rationale:'New evidence supports restoration',evidenceIds:[event],operationKey:randomUUID()});

test('restoration copies exact history into pending proposal with current permission and replay',async()=>{
  const base=await deleted(),request=input(base.semantic_version_id),bytes=await submitRestoration(f.app,f.identities.curator,f.scope,request),receipt=JSON.parse(bytes);
  expect(receipt.status).toBe('pending_review');expect(await submitRestoration(f.app,f.identities.curator,f.scope,request)).toBe(bytes);
  expect((await knowledgeHistory(f.app,f.identities.viewer,f.scope,base.knowledge_id))[0]?.lifecycle).toBe('deprecated');
  const p=await getProposal(f.app,f.identities.reviewer,f.scope,receipt.proposal_id);expect(p.summary).toBe('Historical content');expect(p.correction).toMatchObject({restoration:{sourceMemoryId:base.semantic_version_id,expectedHeadRevision:2}});
  await expect(submitRestoration(f.app,f.identities.curator,f.scope,{...request,rationale:'changed'})).rejects.toThrow('conflict');
  await expect(submitRestoration(f.app,f.identities.curator,f.scope,{...request,content:'forged content'})).rejects.toThrow('invalid');
  await expect(submitProposal(f.app,f.identities.curator,f.scope,{summary:'replacement',assertionKind:'observation',evidenceIds:[event],proposalId:receipt.proposal_id,expectedVersion:1})).rejects.toThrow('conflict');
  await expect(submitRestoration(f.app,f.identities.viewer,f.scope,request)).rejects.toThrow('forbidden');
  await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.curator}`;
  try{await expect(submitRestoration(f.app,f.identities.curator,f.scope,request)).rejects.toThrow('forbidden');}
  finally{await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.curator}`;}
});

test('independent restoration appends new version and preserves deletion and supersedes',async()=>{
  const base=await deleted(),receipt=JSON.parse(await submitRestoration(f.app,f.identities.curator,f.scope,input(base.semantic_version_id))),request=decision(receipt.proposal_id);
  const bytes=await decideProposal(f.app,f.identities.reviewer,f.scope,request),approved=JSON.parse(bytes);
  expect(approved.semantic_version_id).not.toBe(base.semantic_version_id);expect(approved.knowledge_id).toBe(base.knowledge_id);expect(await decideProposal(f.app,f.identities.reviewer,f.scope,request)).toBe(bytes);
  const history=await knowledgeHistory(f.app,f.identities.viewer,f.scope,base.knowledge_id);expect(history).toHaveLength(2);expect(history[0]).toMatchObject({version:2,content:'Historical content',lifecycle:'current',supersedes:base.semantic_version_id,headRevision:3});expect(history[1]).toMatchObject({id:base.semantic_version_id,version:1,lifecycle:'superseded'});
  expect(await f.owner`SELECT * FROM allura.events WHERE group_id=${f.scope.groupId} AND kind='deletion' AND payload->>'memoryId'=${base.semantic_version_id}`).toHaveLength(1);
});

test('competing restoration exact head revision has one winner and no stale resurrection',async()=>{
  const base=await deleted();const submissions=await Promise.all([submitRestoration(f.app,f.identities.curator,f.scope,input(base.semantic_version_id)),submitRestoration(f.app,f.identities.curator,f.scope,input(base.semantic_version_id))]);
  const results=await Promise.allSettled(submissions.map(s=>decideProposal(f.app,f.identities.reviewer,f.scope,decision(JSON.parse(s).proposal_id))));
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect(await knowledgeHistory(f.app,f.identities.viewer,f.scope,base.knowledge_id)).toHaveLength(2);
  await expect(submitRestoration(f.app,f.identities.curator,f.scope,input(base.semantic_version_id))).rejects.toThrow('conflict');
});

test('restoration hidden source machine approval and revoked authority never change head',async()=>{
  const base=await deleted();await expect(submitRestoration(f.app,f.identities.curator,f.scope,input(randomUUID()))).rejects.toThrow('not_found');
  await expect(submitRestoration(f.app,f.identities.org,f.scope,input(base.semantic_version_id))).rejects.toThrow('forbidden');
  const receipt=JSON.parse(await submitRestoration(f.app,f.identities.curator,f.scope,input(base.semantic_version_id)));
  await expect(decideProposal(f.app,f.identities.machine,f.scope,decision(receipt.proposal_id))).rejects.toThrow('forbidden');
  await f.owner`UPDATE allura.workspace_grants SET review_approve=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.curator}`;
  try{await expect(decideProposal(f.app,f.identities.curator,f.scope,decision(receipt.proposal_id))).rejects.toThrow('forbidden');}
  finally{await f.owner`UPDATE allura.workspace_grants SET review_approve=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.curator}`;}
  expect((await knowledgeHistory(f.app,f.identities.viewer,f.scope,base.knowledge_id))[0]?.lifecycle).toBe('deprecated');
});

test('restoration late decision failure rolls back head version lineage and receipt',async()=>{
  const base=await deleted(),receipt=JSON.parse(await submitRestoration(f.app,f.identities.curator,f.scope,input(base.semantic_version_id))),request=decision(receipt.proposal_id);
  await f.owner.unsafe("CREATE FUNCTION allura.restore_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER restore_fail BEFORE INSERT ON allura.semantic_intents FOR EACH ROW EXECUTE FUNCTION allura.restore_fail()");
  try{await expect(decideProposal(f.app,f.identities.reviewer,f.scope,request)).rejects.toThrow('unknown');}
  finally{await f.owner.unsafe('DROP TRIGGER restore_fail ON allura.semantic_intents; DROP FUNCTION allura.restore_fail()');}
  const history=await knowledgeHistory(f.app,f.identities.viewer,f.scope,base.knowledge_id);expect(history).toHaveLength(1);expect(history[0]?.lifecycle).toBe('deprecated');expect((await getProposal(f.app,f.identities.reviewer,f.scope,receipt.proposal_id)).state).toBe('pending');
  expect(await f.owner`SELECT * FROM allura.decision_receipts WHERE group_id=${f.scope.groupId} AND proposal_id=${receipt.proposal_id}`).toHaveLength(0);
  expect(JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,request)).outcome).toBe('approved');
});

test('restore historical ancestor creates fresh lineage and rejects original producer approval',async()=>{
  const original=await submitProposal(f.app,f.identities.author,f.scope,{summary:'Older approved ancestor',assertionKind:'observation',evidenceIds:[event]}),base=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,decision(original.id)));
  const correction=JSON.parse(await submitCorrection(f.app,f.identities.curator,f.scope,{baseMemoryId:base.semantic_version_id,expectedBaseVersion:'1',content:'Newer withdrawn wording',rationale:'Changed interpretation',evidenceIds:[event],operationKey:randomUUID()}));
  const changed=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,decision(correction.proposal_id)));
  await deleteMemory(f.app,f.identities.author,f.scope,{memoryId:changed.semantic_version_id,expectedHeadRevision:2,reason:'Withdraw changed wording',operationKey:randomUUID()});
  const restored=JSON.parse(await submitRestoration(f.app,f.identities.curator,f.scope,{...input(base.semantic_version_id),expectedHeadId:changed.semantic_version_id,expectedHeadRevision:3}));
  await f.owner`UPDATE allura.workspace_grants SET review_approve=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}`;
  try{await expect(decideProposal(f.app,f.identities.author,f.scope,decision(restored.proposal_id))).rejects.toThrow('forbidden');}
  finally{await f.owner`UPDATE allura.workspace_grants SET review_approve=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}`;}
  await decideProposal(f.app,f.identities.reviewer,f.scope,decision(restored.proposal_id));
  const history=await knowledgeHistory(f.app,f.identities.viewer,f.scope,base.knowledge_id);expect(history).toHaveLength(3);expect(history[0]).toMatchObject({version:3,content:'Older approved ancestor',supersedes:changed.semantic_version_id});expect(history[1]?.supersedes).toBe(base.semantic_version_id);
});

test('real HTTP deletion history restoration and review preserve current authority',async()=>{
  const base=await initial(),server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createReviewGateway(f.app,f.humanConfig,'https://allura.example')});
  const send=(path:string,who:'author'|'curator'|'reviewer'|'viewer',body:Record<string,unknown>,origin='https://allura.example')=>fetch(`http://127.0.0.1:${server.port}/api/${path}?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt(who),'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin'},body:JSON.stringify(body)});
  const request={memoryId:base.semantic_version_id,expectedHeadRevision:1,reason:'Withdraw via HTTP',operationKey:randomUUID()};
  try{
    expect((await send('memory/delete','author',request,'https://foreign.example')).status).toBe(403);
    expect((await send('memory/delete','viewer',request)).status).toBe(403);
    const deleted=await send('memory/delete','author',request);expect(deleted.status).toBe(200);expect(await deleted.json()).toMatchObject({outcome:'deprecated'});
    const history=await send('memory/history','viewer',{knowledgeId:base.knowledge_id});expect(history.status).toBe(200);expect(await history.json()).toMatchObject([{lifecycle:'deprecated'}]);
    const proposed=await send('review/restoration','curator',input(base.semantic_version_id));expect(proposed.status).toBe(200);const receipt=await proposed.json() as {proposal_id:string};
    const reviewed=await send('review/proposal','reviewer',{proposalId:receipt.proposal_id});expect(reviewed.status).toBe(200);expect(await reviewed.json()).toMatchObject({correction:{headLifecycle:'deprecated',restoration:{sourceMemoryId:base.semantic_version_id}}});
    expect((await send('review/decision','reviewer',decision(receipt.proposal_id))).status).toBe(200);
    const after=await send('memory/history','viewer',{knowledgeId:base.knowledge_id});expect(await after.json()).toMatchObject([{version:2,lifecycle:'current'},{version:1,lifecycle:'superseded'}]);
  }finally{await server.stop(true);}
});
