import { test,expect,beforeAll,afterAll } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { capture } from '../src/capture.ts';
import { submitProposal,getProposal } from '../src/proposals.ts';
import { decideProposal } from '../src/decisions.ts';
import { createReviewGateway } from '../src/review-api.ts';
let f:Awaited<ReturnType<typeof fixture>>,event:string;
beforeAll(async()=>{f=await fixture('allura-decisions');event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'decision-source',content:'Reviewed source content'})).event_id;});
afterAll(async()=>{if(f){await f.close();}});
const proposal=()=>submitProposal(f.app,f.identities.machine,f.scope,{summary:'Proposed semantic content',evidenceIds:[event],confidence:1,assertionKind:'observation'});
const input=(id:string,decision='approve')=>({proposalId:id,reviewedProposalVersion:1,operationKey:randomUUID(),decision,rationale:'Inspected the exact evidence and version',evidenceIds:[event]});

test('independent human approval creates exact immutable semantic content and receipt',async()=>{
  const p=await proposal(),request=input(p.id),bytes=await decideProposal(f.app,f.identities.reviewer,f.scope,request),receipt=JSON.parse(bytes);
  expect(receipt.outcome).toBe('approved');expect(receipt.reviewer_id).toBe(f.ids.reviewer);expect(receipt.reviewed_proposal_version).toBe(1);expect(receipt.delivery).toBe('not_requested');
  const [semantic]=await f.owner`SELECT * FROM allura.semantic_versions WHERE group_id=${f.scope.groupId} AND id=${receipt.semantic_version_id}`;
  expect(semantic.content).toBe(p.summary);expect(semantic.proposal_id).toBe(p.id);expect(semantic.proposal_version).toBe(1);
  expect((await getProposal(f.app,f.identities.curator,f.scope,p.id)).state).toBe('approved');
  expect(await decideProposal(f.app,f.identities.reviewer,f.scope,request)).toBe(bytes);
  await expect(decideProposal(f.app,f.identities.reviewer,f.scope,{...request,rationale:'changed payload'})).rejects.toThrow('conflict');
  await expect(f.owner`UPDATE allura.semantic_versions SET content='rewrite' WHERE group_id=${f.scope.groupId}`.execute()).rejects.toThrow('append-only');
  await expect(f.owner`DELETE FROM allura.decision_receipts WHERE group_id=${f.scope.groupId}`.execute()).rejects.toThrow('append-only');
});

test('human decision denies machine role-only self source-author and forged identity',async()=>{
  const p=await proposal(),request=input(p.id);
  for(const who of [f.identities.machine,f.identities.author,f.identities.curator,f.identities.viewer,f.identities.org]){await expect(decideProposal(f.app,who,f.scope,request)).rejects.toThrow('forbidden');}
  const self=await submitProposal(f.app,f.identities.reviewer,f.scope,{summary:'Self-produced version',evidenceIds:[event],assertionKind:'inference'});
  await expect(decideProposal(f.app,f.identities.reviewer,f.scope,input(self.id))).rejects.toThrow('forbidden');
  await expect(decideProposal(f.app,{...f.identities.reviewer},f.scope,request)).rejects.toThrow('unauthenticated');
  await f.owner`UPDATE allura.workspace_grants SET review_approve=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}`;
  const source=randomUUID();await f.owner`INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload) VALUES (${f.scope.groupId},${f.scope.workspaceId},${source},${f.ids.author},'capture','{"content":"Own source"}')`;
  const linked=await submitProposal(f.app,f.identities.author,f.scope,{summary:'Source author exclusion',evidenceIds:[source],assertionKind:'observation'});
  expect(linked.requesterId).toBe(f.ids.author);
  const edited=await submitProposal(f.app,f.identities.curator,f.scope,{summary:'Independent proposer of same source',evidenceIds:[source],assertionKind:'observation'});
  expect(edited.requesterId).toBe(f.ids.curator);
  await expect(decideProposal(f.app,f.identities.author,f.scope,{...input(edited.id),evidenceIds:[source]})).rejects.toThrow('forbidden');
});

test('stale human decision and foreign evidence cause zero writes',async()=>{
  const p=await proposal();await submitProposal(f.app,f.identities.curator,f.scope,{summary:'Newly changed proposal',evidenceIds:[event],assertionKind:'observation',proposalId:p.id,expectedVersion:1});
  const [before]=await f.owner`SELECT count(*)::int AS n FROM allura.decision_receipts WHERE group_id=${f.scope.groupId}`;
  await expect(decideProposal(f.app,f.identities.reviewer,f.scope,input(p.id))).rejects.toThrow('conflict');
  await expect(decideProposal(f.app,f.identities.reviewer,f.scope,{...input(p.id),reviewedProposalVersion:2,evidenceIds:[randomUUID()]})).rejects.toThrow('not_found');
  await expect(decideProposal(f.app,f.identities.reviewer,f.scope,input(randomUUID()))).rejects.toThrow('not_found');
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.decision_receipts WHERE group_id=${f.scope.groupId}`)[0].n).toBe(before.n);
  for(const extra of [{reviewedProposalVersion:0},{rationale:''},{evidenceIds:[]},{decision:'auto'},{reviewerId:f.ids.author}]){await expect(decideProposal(f.app,f.identities.reviewer,f.scope,{...input(p.id),...extra})).rejects.toThrow('invalid');}
});

test('request evidence stays pending and immutable replay survives newer version',async()=>{
  const p=await proposal(),request=input(p.id,'request_evidence'),receipt=await decideProposal(f.app,f.identities.reviewer,f.scope,request);
  expect(JSON.parse(receipt).outcome).toBe('needs_evidence');expect(JSON.parse(receipt).semantic_version_id).toBeNull();
  expect((await getProposal(f.app,f.identities.curator,f.scope,p.id)).state).toBe('needs_evidence');
  await submitProposal(f.app,f.identities.curator,f.scope,{summary:'New evidence assessment',evidenceIds:[event],assertionKind:'observation',proposalId:p.id,expectedVersion:1});
  expect(await decideProposal(f.app,f.identities.reviewer,f.scope,request)).toBe(receipt);
  const rejected=await decideProposal(f.app,f.identities.reviewer,f.scope,{...input(p.id,'reject'),reviewedProposalVersion:2});
  expect(JSON.parse(rejected).outcome).toBe('rejected');expect(JSON.parse(rejected).semantic_version_id).toBeNull();
  await f.owner`UPDATE allura.workspace_grants SET review_approve=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.reviewer}`;
  try{await expect(decideProposal(f.app,f.identities.reviewer,f.scope,request)).rejects.toThrow('forbidden');}
  finally{await f.owner`UPDATE allura.workspace_grants SET review_approve=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.reviewer}`;}
});

test('real human review HTTP enforces identity CSRF exact version and error privacy',async()=>{
  const p=await proposal(),server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createReviewGateway(f.app,f.humanConfig,'https://allura.example')});
  const url=`http://127.0.0.1:${server.port}/api/review/decision?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`;
  const headers={'Cf-Access-Jwt-Assertion':f.jwt('reviewer'),'Content-Type':'application/json',Origin:'https://allura.example','Sec-Fetch-Site':'same-origin'};
  try{
    expect((await fetch(url,{method:'POST',body:'invalid'})).status).toBe(401);
    expect((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:JSON.stringify(input(p.id))})).status).toBe(403);
    const stale=await fetch(url,{method:'POST',headers,body:JSON.stringify({...input(p.id),reviewedProposalVersion:2})});expect(stale.status).toBe(409);expect(await stale.text()).not.toContain('allura.');
    const approved=await fetch(url,{method:'POST',headers,body:JSON.stringify(input(p.id))});expect(approved.status).toBe(200);expect(await approved.json()).toMatchObject({outcome:'approved'});
  }finally{await server.stop(true);}
});
