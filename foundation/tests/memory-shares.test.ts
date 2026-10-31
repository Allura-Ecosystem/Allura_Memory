import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { submitCorrection } from '../src/corrections.ts';
import { deleteMemory } from '../src/lifecycle.ts';
import { appendEvent } from '../src/persistence.ts';
import { LocalOAuthProvider } from '../src/oauth-provider.ts';
import { type TransactionSQL } from 'bun';
import { memoryShare } from '../src/memory-shares.ts';
import { capture } from '../src/capture.ts';
import { createCoreGateway } from '../src/core-api.ts';
import { decideProposal } from '../src/decisions.ts';
import { loadLocalEmbedder } from '../src/embedding.ts';
import { submitProposal } from '../src/proposals.ts';
import { fixture } from './lifecycle-fixture.ts';

async function sharingFixture() {
  const f = await fixture(`allura-sharing-${randomUUID()}`);
  try {
    await f.owner`DELETE FROM allura.workspace_grants WHERE group_id=${f.scope.groupId} AND principal_id IN (${f.ids.viewer},${f.ids.curator})`;
    const content = 'Exact selected private version';
    const event = JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:randomUUID(),content})).event_id as string;
    const proposal = await submitProposal(f.app,f.identities.machine,f.scope,{summary:content,evidenceIds:[event],assertionKind:'observation'});
    const decision = JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:proposal.id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Independent synthetic human reviewed evidence',evidenceIds:[event]}));
    const memoryId = decision.semantic_version_id as string;
    const origin = 'https://sharing.invalid';
    const gateway = createCoreGateway(f.app,f.humanConfig,origin,randomBytes(32),await loadLocalEmbedder());
    const server = Bun.serve({hostname:'127.0.0.1',port:0,fetch:gateway});
    const post = (name: keyof typeof f.ids, action: string, body: Record<string,unknown>, workspace=f.scope.workspaceId, headers:Record<string,string>={}) => fetch(`http://127.0.0.1:${server.port}/api/memory-shares/${action}?group_id=${f.scope.groupId}&workspace_id=${workspace}`,{method:'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt(name),Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    const command = (revision=0) => ({recipientId:f.ids.viewer,memoryId,expectedRevision:revision,operationKey:randomUUID()});
    return {...f,content,event,proposal,memoryId,origin,server,gateway,post,command,close:async()=>{await server.stop(true);await f.close();}};
  } catch(error) {await f.close();throw error;}
}

// Synthetic identities only. Semantic content must cross the real independent
// review boundary; sharing must not manufacture a semantic approval.
test('selected sharing human approval discloses only the exact version to recipient A', async () => {
  const f = await fixture(`allura-sharing-${randomUUID()}`);
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    await f.owner`DELETE FROM allura.workspace_grants WHERE group_id=${f.scope.groupId} AND principal_id IN (${f.ids.viewer},${f.ids.curator})`;
    const content = 'Selected immutable content; not workspace-wide authority.';
    const event = JSON.parse(await capture(f.app, f.identities.machine, f.scope, {
      idempotency_key: randomUUID(), content,
    })).event_id as string;
    const proposal = await submitProposal(f.app, f.identities.machine, f.scope, {
      summary: content, evidenceIds: [event], assertionKind: 'observation',
    });
    const decision = JSON.parse(await decideProposal(f.app, f.identities.reviewer, f.scope, {
      proposalId: proposal.id, reviewedProposalVersion: 1, operationKey: randomUUID(),
      decision: 'approve', rationale: 'Synthetic independent reviewer inspected the exact evidence.', evidenceIds: [event],
    }));
    expect(decision.outcome).toBe('approved');
    expect(decision.reviewer_id).toBe(f.ids.reviewer);
    const memoryId = decision.semantic_version_id as string;
    const [version] = await f.owner`SELECT id,content,created_at FROM allura.semantic_versions WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId} AND id=${memoryId}`;
    const [grants] = await f.owner`SELECT count(*)::integer AS n FROM allura.workspace_grants WHERE group_id=${f.scope.groupId} AND principal_id IN (${f.ids.viewer},${f.ids.curator})`;
    expect(grants.n).toBe(0);
    const origin = 'https://sharing.invalid';
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: createCoreGateway(f.app, f.humanConfig, origin, randomBytes(32), await loadLocalEmbedder()) });
    const post = (name: 'author' | 'viewer' | 'curator', action: string, body: Record<string, unknown>) => fetch(
      `http://127.0.0.1:${server!.port}/api/memory-shares/${action}?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`, {
        method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': f.jwt(name), Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    const approval = await post('author', 'approve', { recipientId: f.ids.viewer, memoryId, expectedRevision: 0, operationKey: randomUUID() });
    expect(approval.status).toBe(200);
    const selected = await post('viewer', 'get', { memoryId });
    expect(selected.status).toBe(200);
    expect(selected.headers.get('cache-control')).toBe('no-store');
    expect(await selected.json()).toEqual({ memory: { id: memoryId, content, created_at: version.created_at.toISOString() } });
    const other = await post('curator', 'get', { memoryId });
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ outcome: 'not_found' });
    const missing = await post('viewer', 'get', { memoryId: randomUUID() });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ outcome: 'not_found' });
  } finally {
    await server?.stop(true);
    await f.close();
  }
});

test('selected sharing historical replay never resurrects revocation and explicit revisions govern reapproval', async () => {
  const f=await sharingFixture();
  try {
    const approve=f.command(), first=await f.post('author','approve',approve), receipt=await first.text();
    expect(first.status).toBe(200);
    expect(await (await f.post('author','approve',approve)).text()).toBe(receipt);
    expect((await f.post('author','approve',{...approve,recipientId:f.ids.curator})).status).toBe(409);
    expect((await f.post('author','approve',f.command())).status).toBe(409);
    const revoke=f.command(1), revoked=await f.post('author','revoke',revoke);
    expect(revoked.status).toBe(200);
    const revokedReceipt=await revoked.text();
    expect(await (await f.post('author','revoke',revoke)).text()).toBe(revokedReceipt);
    expect((await f.post('author','revoke',f.command(2))).status).toBe(409);
    expect(await (await f.post('author','approve',approve)).text()).toBe(receipt);
    expect((await f.post('viewer','get',{memoryId:f.memoryId,history:true})).status).toBe(404);
    expect((await f.post('author','approve',f.command(1))).status).toBe(409);
    const reapproval=await f.post('author','approve',f.command(2));expect(reapproval.status).toBe(200);
    expect(await reapproval.json()).toMatchObject({revision:3});
    expect((await f.post('viewer','get',{memoryId:f.memoryId})).status).toBe(200);
    expect(await (await f.post('author','revoke',revoke)).text()).toBe(revokedReceipt);
    expect((await f.post('viewer','get',{memoryId:f.memoryId})).status).toBe(200);
    expect((await f.post('author','revoke',{...f.command(),recipientId:f.ids.curator})).status).toBe(404);
    const [rows]=await f.owner`SELECT (SELECT count(*)::integer FROM allura.memory_share_receipts WHERE group_id=${f.scope.groupId}) AS receipts,(SELECT count(*)::integer FROM allura.memory_shares WHERE group_id=${f.scope.groupId}) AS shares`;
    expect(rows).toEqual({receipts:3,shares:1});
  } finally {await f.close();}
});

test('selected sharing restricted SQL validates exact commands and never accepts extra authority claims', async () => {
  const f=await sharingFixture();
  try {
    const call=async (op:string,input:Record<string,unknown>)=>await f.app`SELECT allura.memory_share(${f.humanConfig.issuer},${`${f.scope.groupId}:author`},${f.scope.groupId},${f.scope.workspaceId}::uuid,${op},${input}::jsonb)`;
    await expect(call('approve',{...f.command(),actorId:f.ids.viewer})).rejects.toThrow('invalid');
    for(const input of [{...f.command(),expectedRevision:0.5},{...f.command(),expectedRevision:'0'},{...f.command(),expectedRevision:9007199254740992},{...f.command(),operationKey:null},{...f.command(),memoryId:null}]) {await expect(call('approve',input)).rejects.toThrow('invalid');}
    await expect(call('get',{memoryId:f.memoryId,history:'true'})).rejects.toThrow('invalid');
    await expect(call('get',{memoryId:f.memoryId,recipientId:f.ids.viewer})).rejects.toThrow('invalid');
    await expect(call('other',f.command())).rejects.toThrow('invalid');
    const [row]=await f.owner`SELECT count(*)::integer AS n FROM allura.memory_shares WHERE group_id=${f.scope.groupId}`;expect(row.n).toBe(0);
  } finally {await f.close();}
});

test('selected sharing history returns only the approved immutable version and never successor neighbor or foreign scope', async () => {
 const f=await sharingFixture(), foreign=await sharingFixture();
 try {
  expect((await f.post('author','approve',f.command())).status).toBe(200);
  const before=await (await f.post('viewer','get',{memoryId:f.memoryId})).text();
  const correction=JSON.parse(await submitCorrection(f.app,f.identities.author,f.scope,{baseMemoryId:f.memoryId,expectedBaseVersion:'1',content:'Successor not shared',rationale:'Reviewed correction',evidenceIds:[f.event],operationKey:randomUUID()}));
  const newer=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:correction.proposal_id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Independent review of changed content',evidenceIds:[f.event]}));
  expect((await f.post('viewer','get',{memoryId:f.memoryId})).status).toBe(404);
  expect(await (await f.post('viewer','get',{memoryId:f.memoryId,history:true})).text()).toBe(before);
  const neighbor=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Unshared neighbor',evidenceIds:[f.event],assertionKind:'observation'});
  const other=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:neighbor.id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Independent neighbor review',evidenceIds:[f.event]}));
  for(const memoryId of [newer.semantic_version_id,other.semantic_version_id,foreign.memoryId,randomUUID()]) {
   for(const history of [false,true]) {const reply=await f.post('viewer','get',{memoryId,history});expect(reply.status).toBe(404);expect(await reply.json()).toEqual({outcome:'not_found'});}
  }
  for(const workspace of [f.foreignWorkspace,randomUUID()]) {const reply=await f.post('viewer','get',{memoryId:f.memoryId,history:true},workspace);expect(reply.status).toBe(404);expect(await reply.json()).toEqual({outcome:'not_found'});}
  expect((await f.post('author','approve',{...f.command(),memoryId:newer.semantic_version_id})).status).toBe(200);
  await deleteMemory(f.app,f.identities.author,f.scope,{memoryId:newer.semantic_version_id,expectedHeadRevision:2,reason:'Synthetic lifecycle test',operationKey:randomUUID()});
  expect((await f.post('viewer','get',{memoryId:newer.semantic_version_id})).status).toBe(404);
  expect(await (await f.post('viewer','get',{memoryId:newer.semantic_version_id,history:true})).json()).toMatchObject({memory:{id:newer.semantic_version_id,content:'Successor not shared'}});
  expect(await (await f.post('viewer','get',{memoryId:f.memoryId,history:true})).text()).toBe(before);
 } finally {await f.close();await foreign.close();}
});

test('selected sharing rechecks issuer recipient binding membership grants and workspace without cached authority', async () => {
 const f=await sharingFixture();
 try {
  const approval=f.command();expect((await f.post('author','approve',approval)).status).toBe(200);
  const receipt=await (await f.post('author','approve',approval)).text();
  const changes=[
   [()=>f.owner`UPDATE allura.principals SET active=false WHERE id=${f.ids.author}`,()=>f.owner`UPDATE allura.principals SET active=true WHERE id=${f.ids.author}`,404],
   [()=>f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.author}`,()=>f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${f.ids.author}`,404],
   [()=>f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${f.ids.author}`,()=>f.owner`UPDATE allura.memberships SET active=true WHERE principal_id=${f.ids.author}`,404],
   [()=>f.owner`UPDATE allura.workspace_grants SET role='viewer' WHERE principal_id=${f.ids.author}`,()=>f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE principal_id=${f.ids.author}`,404],
   [()=>f.owner`UPDATE allura.workspace_grants SET active=false WHERE principal_id=${f.ids.author}`,()=>f.owner`UPDATE allura.workspace_grants SET active=true WHERE principal_id=${f.ids.author}`,404],
   [()=>f.owner`UPDATE allura.principals SET active=false WHERE id=${f.ids.viewer}`,()=>f.owner`UPDATE allura.principals SET active=true WHERE id=${f.ids.viewer}`,403],
   [()=>f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.viewer}`,()=>f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${f.ids.viewer}`,403],
   [()=>f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${f.ids.viewer}`,()=>f.owner`UPDATE allura.memberships SET active=true WHERE principal_id=${f.ids.viewer}`,403],
   [()=>f.owner`UPDATE allura.workspaces SET locked=true WHERE group_id=${f.scope.groupId}`,()=>f.owner`UPDATE allura.workspaces SET locked=false WHERE group_id=${f.scope.groupId}`,404],
   [()=>f.owner`UPDATE allura.tenants SET active=false WHERE group_id=${f.scope.groupId}`,()=>f.owner`UPDATE allura.tenants SET active=true WHERE group_id=${f.scope.groupId}`,403],
  ] as const;
  for(const [off,on,status] of changes) {
   await off(); const response=await f.post('viewer','get',{memoryId:f.memoryId});expect(response.status).toBe(status);expect(await response.json()).toEqual({outcome:status===404?'not_found':'forbidden'});
   await expect(memoryShare(f.app,f.identities.viewer,f.scope,'get',{memoryId:f.memoryId})).rejects.toThrow();
   await on();expect((await f.post('viewer','get',{memoryId:f.memoryId})).status).toBe(200);
  }
  await f.owner`UPDATE allura.workspace_grants SET role='viewer' WHERE principal_id=${f.ids.author}`;
  expect((await f.post('author','approve',approval)).status).toBe(403);
  expect((await f.post('author','revoke',f.command(1))).status).toBe(403);
  await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE principal_id=${f.ids.author}`;
  expect(await (await f.post('author','approve',approval)).text()).toBe(receipt);
  const [row]=await f.owner`SELECT revision,active FROM allura.memory_shares WHERE group_id=${f.scope.groupId}`;expect(Number(row.revision)).toBe(1);expect(row.active).toBe(true);
 } finally {await f.close();}
});

test('selected sharing current administrator can revoke after original issuer or recipient loses authority', async () => {
 const f=await sharingFixture();
 try {
  expect((await f.post('author','approve',f.command())).status).toBe(200);
  await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE principal_id=${f.ids.reviewer}`;
  await f.owner`UPDATE allura.workspace_grants SET role='viewer' WHERE principal_id=${f.ids.author}`;
  expect((await f.post('reviewer','revoke',f.command(1))).status).toBe(200);
  expect((await f.post('reviewer','approve',f.command(2))).status).toBe(200);
  expect((await f.post('viewer','get',{memoryId:f.memoryId})).status).toBe(200);
  const [share]=await f.owner`SELECT issuer_id,revision FROM allura.memory_shares WHERE group_id=${f.scope.groupId}`;
  expect(share.issuer_id).toBe(f.ids.reviewer);expect(Number(share.revision)).toBe(3);
  await f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${f.ids.viewer}`;
  expect((await f.post('reviewer','revoke',f.command(3))).status).toBe(200);
  await f.owner`UPDATE allura.memberships SET active=true WHERE principal_id=${f.ids.viewer}`;
  expect((await f.post('viewer','get',{memoryId:f.memoryId})).status).toBe(404);
 } finally {await f.close();}
});

test('selected sharing HTTP rejects forged machine mixed CSRF malformed and unauthorized commands without effects', async () => {
 const f=await sharingFixture(),foreign=await sharingFixture();
 try {
  for(const name of ['viewer','curator','reviewer','org'] as const) {expect((await f.post(name,'approve',f.command())).status).toBe(403);}
  for(const recipientId of [f.ids.author,f.ids.machine,foreign.ids.viewer,randomUUID()]) {expect((await f.post('author','approve',{...f.command(),recipientId})).status).toBe(403);}
  for(const memoryId of [foreign.memoryId,f.event,f.proposal.id,randomUUID()]) {expect((await f.post('author','approve',{...f.command(),memoryId})).status).toBe(404);}
  expect((await f.post('author','approve',f.command(),f.foreignWorkspace)).status).toBe(403);
  for(const action of ['approve','revoke','get']) {
   const valid=action==='get'?{memoryId:f.memoryId}:f.command();
   for(const field of ['actor','permission','content','head','identity','recipient']) {expect((await f.post('author',action,{...valid,[field]:'forged'})).status).toBe(400);}
   for(const value of [null,1,true,'not-a-uuid']) {expect((await f.post('author',action,{...valid,memoryId:value})).status).toBe(400);}
   const bad=action==='get'?[{...valid,history:'true'},{...valid,history:null}]:[{...valid,expectedRevision:-1},{...valid,expectedRevision:0.5},{...valid,expectedRevision:'0'},{...valid,expectedRevision:9007199254740992},{...valid,operationKey:'not-a-uuid'},{...valid,recipientId:null}];
   for(const body of bad) {expect((await f.post('author',action,body)).status).toBe(400);}
   for(const headers of [{Origin:'https://foreign.invalid'},{'Sec-Fetch-Site':'cross-site'},{Origin:''}]) {expect((await f.post('author',action,valid,f.scope.workspaceId,headers)).status).toBe(403);}
   for(const headers of [{'Cf-Access-Jwt-Assertion':'forged'},{Authorization:'Bearer synthetic-machine'},{Authorization:''}]) {expect((await f.post('author',action,valid,f.scope.workspaceId,headers)).status).toBe(401);}
   expect((await f.post('machine',action,valid)).status).toBe(403);
   const request=new Request(`http://local/api/memory-shares/${action}?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`,{method:'POST',headers:{Authorization:'Bearer machine','Content-Type':'application/json'},body:'{broken'});
   expect((await f.gateway(request)).status).toBe(401);expect(request.bodyUsed).toBe(false);
  }
  await expect(memoryShare(f.app,f.identities.machine,f.scope,'approve',f.command())).rejects.toThrow('forbidden');
  await expect(memoryShare(f.app,{...f.identities.author},f.scope,'approve',f.command())).rejects.toThrow('unauthenticated');
  const [row]=await f.owner`SELECT (SELECT count(*)::integer FROM allura.memory_shares WHERE group_id=${f.scope.groupId}) AS shares,(SELECT count(*)::integer FROM allura.memory_share_receipts WHERE group_id=${f.scope.groupId}) AS receipts,(SELECT count(*)::integer FROM allura.memory_share_audit WHERE group_id=${f.scope.groupId}) AS audit`;
  expect(row).toEqual({shares:0,receipts:0,audit:0});
 } finally {await f.close();await foreign.close();}
});

test('selected sharing grants no existing HTTP retrieval review administration capture or OAuth surface', async () => {
 const f=await sharingFixture();
 try {
  expect((await f.post('author','approve',f.command())).status).toBe(200);
  const cases:[string,string,Record<string,unknown>][]=[
   ['/api/memory/get','POST',{id:f.memoryId,history:true}],['/api/memory/list','POST',{}],['/api/memory/graph','POST',{rootId:f.memoryId,includeEvidence:true}],['/api/memory/history','POST',{knowledgeId:f.memoryId}],
   ...['text','vector','hybrid'].flatMap(mode=>[undefined,'all'].map(status=>['/api/memory/search','POST',{query:'private',mode,...(status?{status}:{})}] as [string,string,Record<string,unknown>])),
   ['/api/evidence','GET',{}],['/api/dashboard/context','GET',{}],['/api/dashboard/proposals','POST',{}],['/api/operations','POST',{}],['/api/health','GET',{}],['/api/index/drain','POST',{}],
   ['/api/review/submit','POST',{}],['/api/review/proposal','POST',{proposalId:f.proposal.id}],['/api/review/evidence','POST',{proposalId:f.proposal.id,version:1,eventId:f.event}],['/api/review/decision','POST',{}],['/api/review/correction','POST',{}],['/api/review/restoration','POST',{}],['/api/memory/delete','POST',{}],['/api/access','POST',{op:'grant',target:f.ids.curator,role:'viewer',revision:0}],
  ];
  for(const name of ['viewer','curator'] as const) {
   for(const [path,method,body] of cases) {
    const response=await fetch(`http://127.0.0.1:${f.server.port}${path}?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`,{method,headers:{'Cf-Access-Jwt-Assertion':f.jwt(name),Origin:f.origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
    expect(response.status).toBe(403);expect(await response.json()).toEqual({outcome:'forbidden'});
   }
   await expect(capture(f.app,f.identities[name],f.scope,{idempotency_key:randomUUID(),content:'Unauthorized capture'})).rejects.toThrow('forbidden');
  }
  const provider=new LocalOAuthProvider(f.app,{host:'127.0.0.1',port:18445,issuer:'http://127.0.0.1:18445',resource:'https://sharing.invalid/mcp',consentOrigin:f.origin,client:{clientId:'synthetic-sharing',name:'Synthetic',redirectUris:['http://127.0.0.1:18444/callback'],actions:['memory:read']}});
  const gateway=createCoreGateway(f.app,f.humanConfig,f.origin,randomBytes(32),await loadLocalEmbedder(),undefined,undefined,'human',provider);
  for(const method of ['GET','POST']) {
   const response=await gateway(new Request(`http://local/api/oauth/consent?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}&transaction=${randomBytes(32).toString('base64url')}`,{method,headers:{'Cf-Access-Jwt-Assertion':f.jwt('viewer'),Origin:f.origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})}));
   expect(response.status).toBe(403);expect(await response.json()).toEqual({outcome:'forbidden'});
  }
  expect((await f.post('viewer','get',{memoryId:f.memoryId})).status).toBe(200);
 } finally {await f.close();}
});

test('selected sharing restricted SQL preserves RLS federation own capture and private append only boundaries', async () => {
 const f=await sharingFixture();
 try {
  await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids.viewer},'curator',${f.ids.author})`;
  const own=await appendEvent(f.app,f.identities.viewer,f.scope,{content:'Own capture must remain hidden without memory read'});
  await f.owner`DELETE FROM allura.workspace_grants WHERE principal_id=${f.ids.viewer}`;
  expect((await f.post('author','approve',f.command())).status).toBe(200);
  const context=async(tx:TransactionSQL,action='memory:read')=>{await tx`SELECT set_config('allura.kind','human',true),set_config('allura.principal',${f.ids.viewer},true),set_config('allura.issuer',${f.humanConfig.issuer},true),set_config('allura.subject',${`${f.scope.groupId}:viewer`},true),set_config('allura.group',${f.scope.groupId},true),set_config('allura.workspace',${f.scope.workspaceId},true),set_config('allura.action',${action},true)`;};
  await f.app.begin(async tx=>{
   await context(tx);
   for(const action of ['memory:read','memory:capture','evidence:read','proposal:write','review:read','review:approve','memory:delete','audit:read','health:read','workspace:grants:manage']) {
    await context(tx,action);const [row]=await tx`SELECT allura.context_allows(${f.scope.groupId},${f.scope.workspaceId}::uuid,${action}) AS allowed`;expect(row.allowed).toBe(false);
   }
   await context(tx);
   for(const table of ['semantic_versions','semantic_heads','semantic_provenance','memory_projection','semantic_edges','events','proposal_state','proposal_versions','decision_receipts','read_audit']) {expect(await tx.unsafe(`SELECT * FROM allura.${table}`)).toHaveLength(0);}
  });
  for(const expression of [
   "allura.retrieval_events($1,$2::uuid,'',20)","allura.retrieval_event_vectors($1,$2::uuid,20)","allura.retrieval_event_vectors($1,$2::uuid,20,'minilm-q8-mean-normalized-v1')",`allura.retrieval_visible_events($1,$2::uuid,'["${own}"]'::jsonb)`, `allura.graph_evidence($1,$2::uuid,'["${f.memoryId}"]'::jsonb)`,"allura.scoped_operational_health($1,$2::uuid)",
  ]) {await expect(f.app.begin(async tx=>{await context(tx);await tx.unsafe(`SELECT * FROM ${expression}`,[f.scope.groupId,f.scope.workspaceId]);})).rejects.toThrow('forbidden');}
  await expect(f.app.begin(async tx=>{await context(tx);await tx`INSERT INTO allura.read_audit(group_id,workspace_id,actor_id,operation,item_count,history) VALUES(${f.scope.groupId},${f.scope.workspaceId},${f.ids.viewer},'get',1,false)`;})).rejects.toThrow('row-level security');
  for(const table of ['memory_shares','memory_share_receipts','memory_share_audit']) {
   for(const query of [`SELECT * FROM allura.${table}`,`DELETE FROM allura.${table}`,`TRUNCATE allura.${table}`,`UPDATE allura.${table} SET group_id=group_id`]) {await expect(f.app.unsafe(query).execute()).rejects.toThrow('permission denied');}
  }
  for(const table of ['memory_share_receipts','memory_share_audit']) {
   for(const query of [`DELETE FROM allura.${table} WHERE group_id='${f.scope.groupId}'`,`UPDATE allura.${table} SET group_id=group_id WHERE group_id='${f.scope.groupId}'`,`TRUNCATE allura.${table}`]) {await expect(f.owner.unsafe(query).execute()).rejects.toThrow('append-only');}
  }
  await expect(f.app`SELECT allura.grant_admin(${f.scope.groupId},${f.scope.workspaceId}::uuid,${f.ids.author}::uuid)`.execute()).rejects.toThrow('permission denied');
  for(const [issuer,subject,group,workspace,op,input] of [
   [f.humanConfig.issuer,`${f.scope.groupId}:viewer`,f.scope.groupId,f.scope.workspaceId,'approve',f.command()],
   ['forged','forged',f.scope.groupId,f.scope.workspaceId,'get',{memoryId:f.memoryId}],
   [f.humanConfig.issuer,`${f.scope.groupId}:viewer`,'allura-foreign',f.scope.workspaceId,'get',{memoryId:f.memoryId}],
   [f.humanConfig.issuer,`${f.scope.groupId}:viewer`,f.scope.groupId,f.foreignWorkspace,'get',{memoryId:f.memoryId}],
  ] as const) {await expect(f.app`SELECT allura.memory_share(${issuer},${subject},${group},${workspace}::uuid,${op},${input}::jsonb)`.execute()).rejects.toThrow();}
  const [priv]=await f.owner`SELECT has_function_privilege('public','allura.memory_share(text,text,text,uuid,text,jsonb)','EXECUTE') AS public_execute`;expect(priv.public_execute).toBe(false);
 } finally {await f.close();}
});

test('selected sharing deferred audit and receipt failures roll back mutations and suppress read disclosure', async () => {
 const f=await sharingFixture();
 const fail=async(table:string)=>{await f.owner.unsafe(`CREATE FUNCTION allura.sharing_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private injected fault'; END $$; CREATE CONSTRAINT TRIGGER sharing_test_fail AFTER INSERT ON allura.${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.sharing_test_fail()`);};
 const clear=async(table:string)=>{await f.owner.unsafe(`DROP TRIGGER sharing_test_fail ON allura.${table}; DROP FUNCTION allura.sharing_test_fail()`);};
 const counts=async()=>{const [row]=await f.owner`SELECT (SELECT count(*)::integer FROM allura.memory_shares WHERE group_id=${f.scope.groupId}) AS shares,(SELECT count(*)::integer FROM allura.memory_share_receipts WHERE group_id=${f.scope.groupId}) AS receipts,(SELECT count(*)::integer FROM allura.memory_share_audit WHERE group_id=${f.scope.groupId}) AS audit`;return row;};
 try {
  for(const table of ['memory_share_receipts','memory_share_audit']) {
   await fail(table);try {const response=await f.post('author','approve',f.command());expect(response.status).toBe(503);expect(await response.json()).toEqual({outcome:'unknown'});} finally {await clear(table);}
   expect(await counts()).toEqual({shares:0,receipts:0,audit:0});
  }
  expect((await f.post('author','approve',f.command())).status).toBe(200);
  const before=await counts();await fail('memory_share_audit');
  try {
   for(const [name,op,body] of [['viewer','get',{memoryId:f.memoryId}],['author','revoke',f.command(1)]] as const) {
    const response=await f.post(name,op,body);expect(response.status).toBe(503);expect(await response.json()).toEqual({outcome:'unknown'});expect(await counts()).toEqual(before);
   }
  } finally {await clear('memory_share_audit');}
  expect((await f.post('viewer','get',{memoryId:f.memoryId})).status).toBe(200);
  const [share]=await f.owner`SELECT revision,active FROM allura.memory_shares WHERE group_id=${f.scope.groupId}`;expect(Number(share.revision)).toBe(1);expect(share.active).toBe(true);
  const rows=await f.owner`SELECT receipt FROM allura.memory_share_receipts WHERE group_id=${f.scope.groupId}`;
  expect(JSON.stringify(rows)).not.toContain(f.content);
  const audit=await f.owner`SELECT * FROM allura.memory_share_audit WHERE group_id=${f.scope.groupId}`;
  expect(audit).toHaveLength(2);expect(JSON.stringify(audit)).not.toContain(f.content);
  expect(Object.keys(audit[0]).sort()).toEqual(['action','actor_id','created_at','group_id','id','memory_id','recipient_id','workspace_id']);
 } finally {await f.close();}
});

type SharingFixture=Awaited<ReturnType<typeof sharingFixture>>;
async function blockedBy(f:SharingFixture,pid:number) {
 for(let i=0;i<100;i++) {const rows=await f.owner`SELECT pid FROM pg_stat_activity WHERE ${pid}::integer=ANY(pg_blocking_pids(pid))`;if(rows.length){return rows[0].pid as number;}await Bun.sleep(5);}
 throw new Error('No observed database lock waiter');
}
async function readFirst(kind:'revoke'|'issuer'|'recipient') {
 const f=await sharingFixture();let release=()=>{};let blocker:Promise<unknown>|undefined,reading:Promise<Response|Record<string,unknown>>|undefined,changing:Promise<unknown>|undefined;
 try {
  expect((await f.post('author','approve',f.command())).status).toBe(200);
  await f.owner.unsafe(`CREATE FUNCTION allura.sharing_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='get' THEN PERFORM pg_advisory_xact_lock(23023999); END IF; RETURN NEW; END $$; CREATE TRIGGER sharing_pause BEFORE INSERT ON allura.memory_share_audit FOR EACH ROW EXECUTE FUNCTION allura.sharing_pause()`);
  let enter:(pid:number)=>void=()=>{};const ready=new Promise<number>(r=>{enter=r;}),hold=new Promise<void>(r=>{release=r;});
  blocker=f.owner.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(23023999)`;const [row]=await tx`SELECT pg_backend_pid() AS pid`;enter(row.pid);await hold;});
  const blockerPid=await ready;let readDone=false,changeDone=false;
  // Recipient revocation may conservatively suppress an already committed read at
  // the gateway's final admission recheck. Test service commit ordering directly
  // for that case; HTTP revoke-first and subsequent admission stay covered.
  reading=(kind==='recipient'?memoryShare(f.app,f.identities.viewer,f.scope,'get',{memoryId:f.memoryId}):f.post('viewer','get',{memoryId:f.memoryId})).then(r=>{readDone=true;return r;});
  const reader=await blockedBy(f,blockerPid);expect(readDone).toBe(false);
  changing=(kind==='revoke'?f.post('author','revoke',f.command(1)):kind==='issuer'?Promise.resolve(f.owner`UPDATE allura.workspace_grants SET role='viewer' WHERE principal_id=${f.ids.author}`):Promise.resolve(f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.viewer}`)).then(r=>{changeDone=true;return r;});
  expect(await blockedBy(f,reader)).toBeGreaterThan(0);expect(changeDone).toBe(false);
  release();await blocker;
  const response=await reading;if(response instanceof Response){expect(response.status).toBe(200);expect(await response.json()).toMatchObject({memory:{id:f.memoryId,content:f.content}});}else{expect(response).toMatchObject({memory:{id:f.memoryId,content:f.content}});}
  const changed=await changing;if(changed instanceof Response){expect(changed.status).toBe(200);}
  expect((await f.post('viewer','get',{memoryId:f.memoryId})).status).toBe(kind==='recipient'?403:404);
 } finally {release();await blocker;await reading;await changing;await f.owner.unsafe('DROP TRIGGER IF EXISTS sharing_pause ON allura.memory_share_audit; DROP FUNCTION IF EXISTS allura.sharing_pause()');await f.close();}
}
async function changeFirst(kind:'revoke'|'issuer'|'recipient') {
 const f=await sharingFixture();let release=()=>{};let changing:Promise<unknown>|undefined,reading:Promise<Response>|undefined;
 try {
  expect((await f.post('author','approve',f.command())).status).toBe(200);
  let enter:(pid:number)=>void=()=>{};const ready=new Promise<number>(r=>{enter=r;}),hold=new Promise<void>(r=>{release=r;});
  changing=(kind==='revoke'?f.app:f.owner).begin(async tx=>{
   if(kind==='revoke'){await tx`SELECT allura.memory_share(${f.humanConfig.issuer},${`${f.scope.groupId}:author`},${f.scope.groupId},${f.scope.workspaceId}::uuid,'revoke',${f.command(1)}::jsonb)`;}
   else if(kind==='issuer'){await tx`UPDATE allura.workspace_grants SET role='viewer' WHERE principal_id=${f.ids.author}`;}
   else {await tx`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.viewer}`;}
   const [row]=await tx`SELECT pg_backend_pid() AS pid`;enter(row.pid);await hold;
  });
  const changer=await ready;let disclosed=false;
  reading=f.post('viewer','get',{memoryId:f.memoryId}).then(r=>{disclosed=true;return r;});
  expect(await blockedBy(f,changer)).toBeGreaterThan(0);expect(disclosed).toBe(false);
  release();await changing;const response=await reading;expect(response.status).toBe(kind==='recipient'?403:404);expect(await response.json()).toEqual({outcome:kind==='recipient'?'forbidden':'not_found'});
  const [row]=await f.owner`SELECT count(*)::integer AS n FROM allura.memory_share_audit WHERE group_id=${f.scope.groupId} AND action='get'`;expect(row.n).toBe(0);
 } finally {release();await changing;await reading;await f.close();}
}
test('selected sharing read first holds locks through audit before share revocation',async()=>{await readFirst('revoke');});
test('selected sharing revoke first blocks the reader then denies without disclosure',async()=>{await changeFirst('revoke');});
test('selected sharing issuer demotion orders both read first and demotion first',async()=>{await readFirst('issuer');await changeFirst('issuer');});
test('selected sharing recipient binding loss orders both read first and loss first',async()=>{await readFirst('recipient');await changeFirst('recipient');});

test('selected sharing absent revoke stays not found for every supplied revision',async()=>{
 const f=await sharingFixture();try {
  for(const expectedRevision of [0,1,99]) {const response=await f.post('author','revoke',{...f.command(),expectedRevision});expect(response.status).toBe(404);expect(await response.json()).toEqual({outcome:'not_found'});}
 } finally {await f.close();}
});

test('selected sharing concurrent creation replay and competing revisions have one durable effect per operation',async()=>{
 const f=await sharingFixture();try {
  const command=f.command();const responses=await Promise.all([f.post('author','approve',command),f.post('author','approve',command)]);
  for(const response of responses){expect(response.status).toBe(200);}expect(await responses[0]!.text()).toBe(await responses[1]!.text());
  const competing=await Promise.all([f.post('author','revoke',f.command(1)),f.post('author','approve',f.command(1))]);expect(competing.map(r=>r.status).sort()).toEqual([200,409]);
  const [row]=await f.owner`SELECT (SELECT count(*)::integer FROM allura.memory_shares WHERE group_id=${f.scope.groupId}) AS shares,(SELECT count(*)::integer FROM allura.memory_share_receipts WHERE group_id=${f.scope.groupId}) AS receipts,(SELECT count(*)::integer FROM allura.memory_share_audit WHERE group_id=${f.scope.groupId}) AS audit`;expect(row).toEqual({shares:1,receipts:2,audit:2});
  await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE principal_id=${f.ids.reviewer}`;
  expect((await f.post('reviewer','approve',{...command,expectedRevision:2})).status).toBe(200);
  expect((await f.post('author','approve',{...command,expectedRevision:3})).status).toBe(409);
  const [share]=await f.owner`SELECT issuer_id,revision FROM allura.memory_shares WHERE group_id=${f.scope.groupId}`;expect(share.issuer_id).toBe(f.ids.reviewer);expect(Number(share.revision)).toBe(3);
 } finally {await f.close();}
});

test('selected sharing exact original issuer binding cannot be replaced by another active human',async()=>{
 const f=await sharingFixture();try {
  expect((await f.post('author','approve',f.command())).status).toBe(200);
  await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.reviewer} WHERE principal_id=${f.ids.author}`;
  const response=await f.post('viewer','get',{memoryId:f.memoryId});expect(response.status).toBe(404);expect(await response.json()).toEqual({outcome:'not_found'});
 } finally {await f.close();}
});
