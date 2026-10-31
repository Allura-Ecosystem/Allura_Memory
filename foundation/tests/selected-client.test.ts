import {test,expect} from 'bun:test';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {LocalOAuthProvider} from '../src/oauth-provider.ts';
import {startOAuthHttp,stopOAuthHttp} from '../src/oauth-http.ts';
import {loadLocalEmbedder} from '../src/embedding.ts';
import {type OAuthConfig} from '../src/core-config.ts';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {type OAuthClientProvider,UnauthorizedError} from '@modelcontextprotocol/sdk/client/auth.js';
import {type OAuthTokens} from '@modelcontextprotocol/sdk/shared/auth.js';
import {type FetchLike} from '@modelcontextprotocol/sdk/shared/transport.js';

async function setup(selectedOnly=false){
 const f=await fixture(`allura-selected-${randomUUID()}`);
 const reservation=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response(null)}),port=reservation.port!;await reservation.stop(true);
 const config:OAuthConfig={host:'127.0.0.1',port,issuer:`http://127.0.0.1:${port}`,resource:'https://selected.invalid/mcp',consentOrigin:'https://selected.invalid',client:{clientId:'selected-synthetic',name:'Selected synthetic',redirectUris:['http://127.0.0.1:18444/callback'],actions:selectedOnly?['memory:selected:read']:['memory:read','memory:selected:read']}};
 const provider=new LocalOAuthProvider(f.app,config),issuer=await startOAuthHttp(config,provider);
 const core=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createCoreGateway(f.app,f.humanConfig,config.consentOrigin,randomBytes(32),await loadLocalEmbedder(),undefined,undefined,'human',provider)}),base=`http://127.0.0.1:${core.port}`;
 const selector=new URLSearchParams({group_id:f.scope.groupId,workspace_id:f.scope.workspaceId});
 const headers=(actor:Parameters<typeof f.jwt>[0])=>({'Cf-Access-Jwt-Assertion':f.jwt(actor),Origin:config.consentOrigin,'Sec-Fetch-Site':'same-origin','content-type':'application/json'});
 const post=(actor:Parameters<typeof f.jwt>[0],path:string,body:unknown)=>fetch(base+path+'?'+selector,{method:'POST',headers:headers(actor),body:JSON.stringify(body)});
 const begin=async()=>{
  const verifier=randomBytes(32).toString('base64url'),state=randomBytes(24).toString('base64url');
  const query={client_id:config.client.clientId,redirect_uri:config.client.redirectUris[0]!,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),resource:config.resource,scope:'memory:selected:read',state};
  const reply=await fetch(config.issuer+'/authorize?'+new URLSearchParams(query),{redirect:'manual'});expect(reply.status).toBe(302);
  const consent=new URL(reply.headers.get('location')!);expect(consent.origin).toBe(config.consentOrigin);expect(consent.pathname).toBe('/api/oauth/selected-consent');consent.protocol='http:';consent.host=new URL(base).host;for(const [k,v] of selector){consent.searchParams.set(k,v);}return {consent,verifier,state};
 };
 return {f,config,provider,base,selector,headers,post,begin,close:async()=>{await core.stop(true);await stopOAuthHttp(issuer);await f.close();}};
}

test('selected client grantless recipient self consents and exchanges without granting B or workspace access',async()=>{
 const h=await setup();try{
  const {f}=h;await f.owner`DELETE FROM allura.workspace_grants WHERE group_id=${f.scope.groupId} AND principal_id IN (${f.ids.viewer},${f.ids.curator})`;
  const content='Reviewed selected client synthetic immutable version';
  const event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{content,idempotency_key:randomUUID()})).event_id as string;
  const proposal=await submitProposal(f.app,f.identities.machine,f.scope,{summary:content,evidenceIds:[event],assertionKind:'observation'});
  const reviewed=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:proposal.id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Independent synthetic review of exact evidence',evidenceIds:[event]}));
  expect(reviewed.outcome).toBe('approved');
  expect((await h.post('author','/api/memory-shares/approve',{recipientId:f.ids.viewer,memoryId:reviewed.semantic_version_id,expectedRevision:0,operationKey:randomUUID()})).status).toBe(200);
  const p=await h.begin();
  expect((await fetch(p.consent,{headers:h.headers('curator')})).status).toBe(403);
  const headers=h.headers('viewer'),display=await fetch(p.consent,{headers});expect(display.status).toBe(200);expect(display.headers.get('cache-control')).toBe('no-store');
  const shown=await display.json() as Record<string,unknown>;
  expect(Object.keys(shown).sort()).toEqual(['actions','clientId','connectionId','groupId','mode','name','nonce','redirectUri','transaction','workspaceId']);
  expect(shown).toMatchObject({mode:'selected',actions:['memory:selected:read'],clientId:h.config.client.clientId,groupId:f.scope.groupId,workspaceId:f.scope.workspaceId});
  const approved=await fetch(p.consent,{method:'POST',headers,body:JSON.stringify({...shown,decision:'approve'})});expect(approved.status).toBe(200);
  const approval=await approved.json() as {redirect:string;connectionId:string};expect(approval.connectionId).toBe(shown.connectionId as string);
  const callback=new URL(approval.redirect);expect(callback.searchParams.get('state')).toBe(p.state);
  const exchange=await fetch(h.config.issuer+'/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:h.config.client.clientId,redirect_uri:h.config.client.redirectUris[0]!,resource:h.config.resource,code:callback.searchParams.get('code')!,code_verifier:p.verifier})});
  expect(exchange.status).toBe(200);const tokens=await exchange.json() as Record<string,unknown>;expect(tokens).toMatchObject({scope:'memory:selected:read',token_type:'Bearer',expires_in:900});expect(tokens.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const [counts]=await f.owner`SELECT (SELECT count(*)::integer FROM allura.workspace_grants WHERE group_id=${f.scope.groupId} AND principal_id IN (${f.ids.viewer},${f.ids.curator})) AS grants,(SELECT count(*)::integer FROM allura.memory_shares WHERE group_id=${f.scope.groupId}) AS shares,(SELECT count(*)::integer FROM allura.client_delegations WHERE group_id=${f.scope.groupId}) AS owner_connections`;
  expect(counts).toEqual({grants:0,shares:1,owner_connections:0});
 }finally{await h.close();}
});

async function shared(h:Awaited<ReturnType<typeof setup>>){
 const {f}=h;await f.owner`DELETE FROM allura.workspace_grants WHERE group_id=${f.scope.groupId} AND principal_id IN (${f.ids.viewer},${f.ids.curator})`;
 const content='Exact SDK reviewed synthetic content',event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{content,idempotency_key:randomUUID()})).event_id as string;
 const proposal=await submitProposal(f.app,f.identities.machine,f.scope,{summary:content,evidenceIds:[event],assertionKind:'observation'});
 const decision=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:proposal.id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Independent exact synthetic review',evidenceIds:[event]}));
 expect(decision.outcome).toBe('approved');const id=decision.semantic_version_id as string;
 expect((await h.post('author','/api/memory-shares/approve',{recipientId:f.ids.viewer,memoryId:id,expectedRevision:0,operationKey:randomUUID()})).status).toBe(200);
 const [v]=await f.owner`SELECT created_at FROM allura.semantic_versions WHERE id=${id}::uuid`;
 return {id,content,event,created_at:v.created_at.toISOString() as string};
}

test('selected client SDK discovers without a token exchanges PKCE and reads exact content through five tools',async()=>{
 const h=await setup(true);let client:Client|undefined;
 try{
  const memory=await shared(h);let verifier:string|undefined,authorize:URL|undefined,tokens:OAuthTokens|undefined;const state=randomBytes(24).toString('base64url');
  const authProvider:OAuthClientProvider={redirectUrl:h.config.client.redirectUris[0]!,clientMetadata:{redirect_uris:[...h.config.client.redirectUris],token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']},clientInformation:()=>({client_id:h.config.client.clientId,issuer:h.config.issuer}),state:()=>state,tokens:()=>tokens,saveTokens:t=>{tokens=t;},saveCodeVerifier:v=>{verifier=v;},codeVerifier:()=>{if(!verifier){throw new Error('missing verifier');}return verifier;},redirectToAuthorization:u=>{authorize=u;}};
  const witness:{path:string;status:number;authenticated:boolean}[]=[];
  const mappedFetch:FetchLike=async(input,init)=>{
   const request=new Request(input.toString(),init),url=new URL(request.url);
   if(url.username||url.password||url.hash){throw new Error('unowned destination');}
   if(url.origin===h.config.consentOrigin){url.protocol='http:';url.host=new URL(h.base).host;}else if(url.origin!==h.config.issuer){throw new Error('unowned destination');}
   const response=await fetch(new Request(url.href,request),{redirect:'manual'});witness.push({path:url.pathname,status:response.status,authenticated:request.headers.has('authorization')});return response;
  };
  const initial=new Client({name:'selected-discovery',version:'1'}),transport=new StreamableHTTPClientTransport(new URL(h.config.resource),{authProvider,fetch:mappedFetch});
  try{await expect(initial.connect(transport)).rejects.toBeInstanceOf(UnauthorizedError);}finally{await initial.close();}
  expect(witness[0]).toEqual({path:'/mcp',status:401,authenticated:false});
  for(const path of ['/.well-known/oauth-protected-resource/mcp','/.well-known/oauth-authorization-server']){expect(witness.some(r=>r.path===path&&r.status===200)).toBe(true);}
  expect(authorize).toBeInstanceOf(URL);expect(authorize!.searchParams.get('scope')).toBe('memory:selected:read');expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);expect(authorize!.searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier!).digest('base64url'));
  const pending=await mappedFetch(authorize!);expect(pending.status).toBe(302);const consent=new URL(pending.headers.get('location')!);expect(consent.pathname).toBe('/api/oauth/selected-consent');for(const [k,v] of h.selector){consent.searchParams.set(k,v);}
  const headers=h.headers('viewer'),display=await mappedFetch(consent,{headers});expect(display.status).toBe(200);const shown=await display.json() as Record<string,unknown>;
  const approved=await mappedFetch(consent,{method:'POST',headers,body:JSON.stringify({...shown,decision:'approve'})});expect(approved.status).toBe(200);const callback=new URL((await approved.json() as {redirect:string}).redirect);expect(callback.searchParams.get('state')).toBe(state);
  await transport.finishAuth(callback.searchParams.get('code')!);expect(tokens?.scope).toBe('memory:selected:read');expect(tokens).not.toHaveProperty('refresh_token');
  client=new Client({name:'selected-content',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(h.config.resource),{authProvider,fetch:mappedFetch}));await client.ping();
  expect((await client.listTools()).tools.map(t=>t.name).sort()).toEqual(['memory_add','memory_delete','memory_get','memory_list','memory_search']);
  const result=await client.callTool({name:'memory_get',arguments:{id:memory.id,kind:'selected'}}),data={memory:{id:memory.id,content:memory.content,created_at:memory.created_at}};
  expect(result.isError).not.toBe(true);expect(result.content).toEqual([{type:'text',text:JSON.stringify(data)}]);expect(result.structuredContent).toEqual({contract:'allura-consumer-v1',data});
 }finally{await client?.close();await h.close();}
});

async function approved(h:Awaited<ReturnType<typeof setup>>){
 const p=await h.begin(),headers=h.headers('viewer'),r=await fetch(p.consent,{headers});expect(r.status).toBe(200);const shown=await r.json() as Record<string,unknown>;
 const a=await fetch(p.consent,{method:'POST',headers,body:JSON.stringify({...shown,decision:'approve'})});expect(a.status).toBe(200);const result=await a.json() as {redirect:string;connectionId:string};
 const exchange={grant_type:'authorization_code',client_id:h.config.client.clientId,redirect_uri:h.config.client.redirectUris[0]!,resource:h.config.resource,code:new URL(result.redirect).searchParams.get('code')!,code_verifier:p.verifier};
 return {...p,headers,shown,connectionId:result.connectionId,exchange};
}
const form=(h:Awaited<ReturnType<typeof setup>>,path:string,body:Record<string,string>)=>fetch(h.config.issuer+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),redirect:'manual'});
async function issued(h:Awaited<ReturnType<typeof setup>>){const p=await approved(h),response=await form(h,'/token',p.exchange);expect(response.status).toBe(200);const token=(await response.json() as {access_token:string}).access_token;return {...p,token,digest:createHash('sha256').update(token).digest('hex')};}
async function rpc(h:Awaited<ReturnType<typeof setup>>,token:string,method:string,params:unknown={}){
 const response=await fetch(h.base+'/mcp',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});return {status:response.status,body:await response.json() as {result?:{isError?:boolean;content:{type:string;text:string}[];structuredContent?:unknown};outcome?:string}};
}
const get=(h:Awaited<ReturnType<typeof setup>>,token:string,id:string,history=false)=>rpc(h,token,'tools/call',{name:'memory_get',arguments:{id,kind:'selected',history}});
const errorResult=(outcome:string)=>({isError:true,content:[{type:'text',text:JSON.stringify({outcome})}]});

test('selected client rejects malformed exact UUID before database casts',async()=>{
 const h=await setup();try{
  const memory=await shared(h),p=await issued(h);
  for(const id of ['-'.repeat(36),'a'.repeat(36),'00000000-0000-0000-0000-00000000000z']){expect((await get(h,p.token,id)).body.result).toEqual(errorResult('invalid'));}
  expect((await get(h,p.token,memory.id)).body.result?.isError).not.toBe(true);
 }finally{await h.close();}
});

test('selected client exact history and foreign privacy never enable other tools or elevated recipient authority',async()=>{
 const h=await setup(),foreign=await setup();try{
  const memory=await shared(h),other=await shared(foreign),p=await issued(h);
  for(const id of [randomUUID(),other.id,memory.event]){const r=await get(h,p.token,id);expect(r.status).toBe(200);expect(r.body.result).toEqual(errorResult('not_found'));}
  for(const arguments_ of [{id:memory.id},{id:memory.id,kind:'semantic'},{id:memory.event,kind:'receipt'}]){expect((await rpc(h,p.token,'tools/call',{name:'memory_get',arguments:arguments_})).body.result).toEqual(errorResult('forbidden'));}
  for(const name of ['memory_add','memory_delete','memory_list','memory_search']){for(const status of ['approved','all']){expect((await rpc(h,p.token,'tools/call',{name,arguments:{query:'synthetic',status}})).body.result).toEqual(errorResult('forbidden'));}}
  await h.f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,review_approve,issuer) VALUES(${h.f.scope.groupId},${h.f.scope.workspaceId},${h.f.ids.viewer},'workspace_admin',true,${h.f.ids.author})`;
  expect((await rpc(h,p.token,'tools/call',{name:'memory_list',arguments:{}})).body.result).toEqual(errorResult('forbidden'));
  const deniedRoutes:[string,string,number][]=[['/api/agent/memory/list','POST',403],['/api/review/decision','POST',401],['/api/review/evidence','POST',401],['/api/evidence','GET',401],['/api/access','POST',401],['/api/dashboard/context','GET',401],['/api/dashboard/proposals','POST',401],['/mcp/human','POST',401]];
  for(const [path,method,status] of deniedRoutes){const response=await fetch(h.base+path+'?'+h.selector,{method,headers:{Authorization:`Bearer ${p.token}`,'content-type':'application/json'},...(method==='POST'?{body:'not-json'}:{})});expect(response.status).toBe(status);expect(await response.json()).toEqual({outcome:status===401?'unauthenticated':'forbidden'});}
  // Exact auth denial even with an invalid body establishes pre-parser refusal.
  const {AlluraClient}=await import('../src/consumer-client.ts'),consumer=new AlluraClient({endpoint:h.base+'/mcp',groupId:h.f.scope.groupId,workspaceId:h.f.scope.workspaceId,token:async()=>p.token,allowLoopback:true});
  try{await consumer.connect();expect(await consumer.get({id:memory.id,kind:'selected'})).toEqual({memory:{id:memory.id,content:memory.content,created_at:memory.created_at}});await expect(consumer.get({id:memory.id})).rejects.toThrow('forbidden');}finally{await consumer.close();}
  for(const selector of [new URLSearchParams({group_id:'allura-foreign',workspace_id:h.f.scope.workspaceId}),new URLSearchParams({group_id:h.f.scope.groupId,workspace_id:h.f.foreignWorkspace})]){const r=await fetch(h.base+'/mcp?'+selector,{method:'POST',headers:{Authorization:`Bearer ${p.token}`,'content-type':'application/json'},body:'not-json'});expect(r.status).toBe(403);expect(await r.json()).toEqual({outcome:'forbidden'});}
  const human=await fetch(h.base+'/mcp/human?'+h.selector,{method:'POST',headers:{...h.headers('author'),accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'memory_get',arguments:{id:memory.id,kind:'selected'}}})});expect(human.status).toBe(200);expect((await human.json() as {result:unknown}).result).toEqual(errorResult('forbidden'));
  const {submitCorrection}=await import('../src/corrections.ts'),correction=JSON.parse(await submitCorrection(h.f.app,h.f.identities.author,h.f.scope,{baseMemoryId:memory.id,expectedBaseVersion:'1',content:'Unshared successor',rationale:'Reviewed synthetic correction',evidenceIds:[memory.event],operationKey:randomUUID()}));
  const successor=JSON.parse(await decideProposal(h.f.app,h.f.identities.reviewer,h.f.scope,{proposalId:correction.proposal_id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Independent successor review',evidenceIds:[memory.event]}));
  expect((await get(h,p.token,memory.id)).body.result).toEqual(errorResult('not_found'));
  expect((await get(h,p.token,memory.id,true)).body.result?.structuredContent).toEqual({contract:'allura-consumer-v1',data:{memory:{id:memory.id,content:memory.content,created_at:memory.created_at}}});
  expect((await get(h,p.token,successor.semantic_version_id,true)).body.result).toEqual(errorResult('not_found'));
  expect((await issued(h)).token).toBeString(); // Historical-only share remains consent-eligible.
 }finally{await h.close();await foreign.close();}
});

test('selected client current share issuer recipient credential connection and workspace attenuate cached authority',async()=>{
 const h=await setup();try{
  const memory=await shared(h),p=await issued(h),{f}=h;
  const {authenticateMachine}=await import('../src/authentication.ts'),{DatabaseStore}=await import('../src/persistence.ts'),{selectedGet}=await import('../src/selected-client.ts');
  const identity=await authenticateMachine(p.token,async d=>(await f.app`SELECT allura.selected_lookup(${d},${h.config.resource}) AS credential`)[0].credential);
  expect(identity.kind).toBe('service');expect(Object.isFrozen(identity)).toBe(true);
  expect(await selectedGet(f.app,identity,f.scope,memory.id)).toEqual({memory:{id:memory.id,content:memory.content,created_at:memory.created_at}});
  for(const forged of [{...identity},{...identity,selected:true as const},f.identities.machine,f.identities.author]){await expect(selectedGet(f.app,forged,f.scope,memory.id)).rejects.toThrow('forbidden');}
  for(const scope of [{...f.scope,groupId:'allura-foreign'},{...f.scope,workspaceId:f.foreignWorkspace}]){await expect(selectedGet(f.app,identity,scope,memory.id)).rejects.toThrow('forbidden');}
  const [service]=await f.owner`SELECT principal_id FROM allura.selected_credentials WHERE digest=${p.digest}`;
  for(const [client,resource] of [['foreign',h.config.resource],[h.config.client.clientId,'https://foreign.invalid/mcp']]){await expect(f.app`SELECT allura.selected_get(${p.digest},${service.principal_id}::uuid,${client},${resource},${f.scope.groupId},${f.scope.workspaceId}::uuid,${memory.id}::uuid,false)`.execute()).rejects.toThrow('forbidden');}
  // Privileged mutations below are synthetic authority fixtures, not public commands.
  const changes:[()=>Promise<unknown>,()=>Promise<unknown>,number][]=[
   [()=>f.owner`UPDATE allura.memory_shares SET active=false WHERE group_id=${f.scope.groupId}`,()=>f.owner`UPDATE allura.memory_shares SET active=true WHERE group_id=${f.scope.groupId}`,200],
   [()=>f.owner`UPDATE allura.workspace_grants SET active=false WHERE principal_id=${f.ids.author}`,()=>f.owner`UPDATE allura.workspace_grants SET active=true WHERE principal_id=${f.ids.author}`,200],
   [()=>f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.author}`,()=>f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${f.ids.author}`,200],
   [()=>f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${f.ids.author}`,()=>f.owner`UPDATE allura.memberships SET active=true WHERE principal_id=${f.ids.author}`,200],
   [()=>f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.viewer}`,()=>f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${f.ids.viewer}`,401],
   [()=>f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${f.ids.viewer}`,()=>f.owner`UPDATE allura.memberships SET active=true WHERE principal_id=${f.ids.viewer}`,401],
   [()=>f.owner`UPDATE allura.principals SET active=false WHERE id=${f.ids.viewer}`,()=>f.owner`UPDATE allura.principals SET active=true WHERE id=${f.ids.viewer}`,401],
   [()=>f.owner`UPDATE allura.selected_connections SET revoked=true WHERE id=${p.connectionId}::uuid`,()=>f.owner`UPDATE allura.selected_connections SET revoked=false WHERE id=${p.connectionId}::uuid`,401],
   [()=>f.owner`UPDATE allura.selected_credentials SET revoked=true WHERE digest=${p.digest}`,()=>f.owner`UPDATE allura.selected_credentials SET revoked=false WHERE digest=${p.digest}`,401],
   [()=>f.owner`UPDATE allura.selected_credentials SET expires_at=clock_timestamp()-interval '1 second' WHERE digest=${p.digest}`,()=>f.owner`UPDATE allura.selected_credentials SET expires_at=clock_timestamp()+interval '15 minutes' WHERE digest=${p.digest}`,401],
   [()=>f.owner`UPDATE allura.workspaces SET locked=true WHERE group_id=${f.scope.groupId}`,()=>f.owner`UPDATE allura.workspaces SET locked=false WHERE group_id=${f.scope.groupId}`,401],
   [()=>f.owner`UPDATE allura.tenants SET active=false WHERE group_id=${f.scope.groupId}`,()=>f.owner`UPDATE allura.tenants SET active=true WHERE group_id=${f.scope.groupId}`,401],
   [()=>f.owner`UPDATE allura.principals SET active=false WHERE id=${service.principal_id}`,()=>f.owner`UPDATE allura.principals SET active=true WHERE id=${service.principal_id}`,401],
   [()=>f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${service.principal_id}`,()=>f.owner`UPDATE allura.memberships SET active=true WHERE principal_id=${service.principal_id}`,401],
   [()=>f.owner`UPDATE allura.selected_connections SET client_id='foreign' WHERE id=${p.connectionId}::uuid`,()=>f.owner`UPDATE allura.selected_connections SET client_id=${h.config.client.clientId} WHERE id=${p.connectionId}::uuid`,401],
   [()=>f.owner`UPDATE allura.selected_connections SET resource='https://foreign.invalid/mcp' WHERE id=${p.connectionId}::uuid`,()=>f.owner`UPDATE allura.selected_connections SET resource=${h.config.resource} WHERE id=${p.connectionId}::uuid`,401],
  ];
  for(const [mutate,restore,status] of changes){await mutate();try{await expect(selectedGet(f.app,identity,f.scope,memory.id)).rejects.toThrow(status===200?'not_found':'forbidden');const denied=await get(h,p.token,memory.id);expect(denied.status).toBe(status);if(status===200){expect(denied.body.result).toEqual(errorResult('not_found'));expect((await rpc(h,p.token,'tools/list')).status).toBe(200);}else{expect(denied.body).toEqual({outcome:'unauthenticated'});}}finally{await restore();}expect((await get(h,p.token,memory.id)).body.result?.isError).not.toBe(true);}
  // A retained selected classification must dominate a valid-looking legacy row.
  const [c]=await f.owner`SELECT * FROM allura.selected_credentials WHERE digest=${p.digest}`;
  await f.owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,issuer) VALUES(${f.scope.groupId},${f.scope.workspaceId},${c.principal_id},'viewer',${f.ids.author})`;
  await f.owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES(${c.principal_id},decode(${p.digest},'hex'),${f.scope.groupId},${f.scope.workspaceId},ARRAY['memory:read'],clock_timestamp()+interval '1 hour')`;
  await f.owner`DELETE FROM allura.selected_connections WHERE id=${p.connectionId}::uuid`;
  expect((await get(h,p.token,memory.id)).status).toBe(401);
  await expect(selectedGet(f.app,identity,f.scope,memory.id)).rejects.toThrow('forbidden');
  expect((await new DatabaseStore(f.app).lookupMachine(p.digest))?.revoked).toBe(true);
 }finally{await h.close();}
});

test('selected client original issuer and recipient bindings cannot be substituted by alternate active bindings',async()=>{
 const h=await setup();try{
  const memory=await shared(h),p=await issued(h),pending=await approved(h),{f}=h;
  for(const actor of ['author','viewer'] as const){
   // Synthetic privileged identity fixture: keep a valid alternative for the original principal
   // and move the original subject onto a different active human. Neither is the recorded pair.
   await f.owner`INSERT INTO allura.identity_bindings(issuer,subject,identity_kind,principal_id) VALUES(${f.humanConfig.issuer},${f.scope.groupId+':alternate-'+actor},'human',${f.ids[actor]})`;
   await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids.curator} WHERE issuer=${f.humanConfig.issuer} AND subject=${f.scope.groupId+':'+actor}`;
   try{
    const r=await get(h,p.token,memory.id);expect(r.status).toBe(actor==='author'?200:401);if(actor==='author'){expect(r.body.result).toEqual(errorResult('not_found'));}else{expect(r.body).toEqual({outcome:'unauthenticated'});}
    expect((await form(h,'/token',pending.exchange)).status).toBe(400);
   }finally{await f.owner`UPDATE allura.identity_bindings SET principal_id=${f.ids[actor]} WHERE issuer=${f.humanConfig.issuer} AND subject=${f.scope.groupId+':'+actor}`;}
   expect((await get(h,p.token,memory.id)).body.result?.isError).not.toBe(true);
  }
  expect((await form(h,'/token',pending.exchange)).status).toBe(200);
  const verifier=randomBytes(32).toString('base64url'),r=await fetch(h.config.issuer+'/authorize?'+new URLSearchParams({client_id:h.config.client.clientId,redirect_uri:h.config.client.redirectUris[0]!,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),resource:h.config.resource,scope:'memory:read'}),{redirect:'manual'});
  expect(r.status).toBe(302);const consent=new URL(h.base+'/api/oauth/consent?'+h.selector);consent.searchParams.set('transaction',new URL(r.headers.get('location')!).searchParams.get('transaction')!);
  const headers=h.headers('author'),display=await fetch(consent,{headers});expect(display.status).toBe(200);const shown=await display.json() as Record<string,unknown>,approval=await fetch(consent,{method:'POST',headers,body:JSON.stringify({...shown,decision:'approve'})});expect(approval.status).toBe(200);
  const code=new URL((await approval.json() as {redirect:string}).redirect).searchParams.get('code')!,exchange=await form(h,'/token',{...pending.exchange,code,code_verifier:verifier});expect(exchange.status).toBe(200);
  const token=(await exchange.json() as {access_token:string}).access_token;expect((await get(h,token,memory.id)).body.result).toEqual(errorResult('forbidden'));
 }finally{await h.close();}
});

test('selected client self revoke survives share loss and foreign revoke and exact RFC client stay private',async()=>{
 const h=await setup();try{
  const memory=await shared(h),p=await issued(h);
  expect((await h.post('curator','/api/oauth/selected-connections/revoke',{connectionId:p.connectionId})).status).toBe(404);
  await h.f.owner`UPDATE allura.memory_shares SET active=false WHERE group_id=${h.f.scope.groupId}`;
  expect((await get(h,p.token,memory.id)).body.result).toEqual(errorResult('not_found'));
  for(let i=0;i<2;i++){const revoked=await h.post('viewer','/api/oauth/selected-connections/revoke',{connectionId:p.connectionId});expect(revoked.status).toBe(200);expect(await revoked.json()).toEqual({outcome:'revoked'});}
  expect((await get(h,p.token,memory.id)).status).toBe(401);
  await h.f.owner`UPDATE allura.memory_shares SET active=true WHERE group_id=${h.f.scope.groupId}`;
  const second=await issued(h);await h.provider.revokeToken({client_id:'foreign',redirect_uris:[]},{token:second.token});expect((await get(h,second.token,memory.id)).status).toBe(200);
  expect((await form(h,'/revoke',{client_id:h.config.client.clientId,token:second.token})).status).toBe(200);expect((await get(h,second.token,memory.id)).status).toBe(401);
 }finally{await h.close();}
});

test('selected client protocol rejects mixed scopes modes sessions nonce and immutable display tampering',async()=>{
 const h=await setup();try{
  await shared(h);const p=await h.begin(),headers=h.headers('viewer'),response=await fetch(p.consent,{headers}),shown=await response.json() as Record<string,unknown>;expect(response.status).toBe(200);
  const submit=(body:unknown,head:Record<string,string>=headers)=>fetch(p.consent,{method:'POST',headers:head,body:JSON.stringify(body)});
  for(const swap of [{mode:'owner'},{mode:null},{connectionId:randomUUID()},{clientId:'foreign'},{name:'different'},{redirectUri:'https://foreign.invalid/cb'},{actions:['memory:read']},{actions:['memory:selected:read','memory:read']},{groupId:'allura-foreign'},{workspaceId:h.f.foreignWorkspace},{nonce:randomBytes(32).toString('base64url')},{transaction:randomBytes(32).toString('base64url')},{decision:['approve']},{recipientId:h.f.ids.curator}]){const r=await submit({...shown,decision:'approve',...swap});expect(r.status).toBeGreaterThanOrEqual(400);expect(await r.text()).not.toContain('code=');}
  expect((await submit({...shown,decision:'approve'},h.headers('curator'))).status).toBe(403);
  const cookie={'Cookie':'CF_Authorization='+headers['Cf-Access-Jwt-Assertion'],Origin:h.config.consentOrigin,'Sec-Fetch-Site':'same-origin','content-type':'application/json'};
  expect((await submit({...shown,decision:'approve'},cookie)).status).toBe(403);
  expect((await submit({...shown,decision:'approve'},{...headers,Origin:'https://foreign.invalid'})).status).toBe(403);
  const mixed=await fetch(p.consent,{method:'POST',headers:{...headers,Authorization:'Bearer '+randomBytes(32).toString('base64url')},body:'not-json'});expect(mixed.status).toBe(401);expect(await mixed.json()).toEqual({outcome:'unauthenticated'});
  const ownerUrl=new URL(p.consent);ownerUrl.pathname='/api/oauth/consent';expect((await fetch(ownerUrl,{headers:h.headers('author')})).status).toBe(403);
  expect((await fetch(p.consent,{headers})).status).toBe(403);
  const cancel=await submit({...shown,decision:'cancel'});expect(cancel.status).toBe(200);const callback=new URL((await cancel.json() as {redirect:string}).redirect);expect(callback.searchParams.get('error')).toBe('access_denied');expect(callback.searchParams.get('state')).toBe(p.state);expect(callback.searchParams.has('code')).toBe(false);expect((await submit({...shown,decision:'approve'})).status).toBe(403);
  const query={client_id:h.config.client.clientId,redirect_uri:h.config.client.redirectUris[0]!,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(p.verifier).digest('base64url'),resource:h.config.resource,scope:'memory:selected:read memory:read'};
  const mixedScope=await fetch(h.config.issuer+'/authorize?'+new URLSearchParams(query),{redirect:'manual'});expect(mixedScope.status).toBe(400);expect(mixedScope.headers.has('location')).toBe(false);
  const owner=await fetch(h.config.issuer+'/authorize?'+new URLSearchParams({...query,scope:'memory:read'}),{redirect:'manual'});expect(owner.status).toBe(302);const ownerConsent=new URL(owner.headers.get('location')!);expect(ownerConsent.pathname).toBe('/dashboard/oauth/consent');ownerConsent.pathname='/api/oauth/selected-consent';ownerConsent.protocol='http:';ownerConsent.host=new URL(h.base).host;for(const [k,v] of h.selector){ownerConsent.searchParams.set(k,v);}expect((await fetch(ownerConsent,{headers})).status).toBe(403);
  const [counts]=await h.f.owner`SELECT count(*)::integer AS n FROM allura.selected_connections WHERE group_id=${h.f.scope.groupId}`;expect(counts.n).toBe(0);
 }finally{await h.close();}
});

test('selected client exchange rejects callback resource PKCE expiry replay and pending revocation with one concurrent winner',async()=>{
 const h=await setup();try{
  await shared(h);const p=await approved(h);
  for(const change of [{client_id:'foreign'},{redirect_uri:'http://127.0.0.1:18445/callback'},{resource:'https://foreign.invalid/mcp'},{code_verifier:'x'},{code_verifier:'x'.repeat(129)},{code_verifier:'!'.repeat(43)},{code_verifier:randomBytes(32).toString('base64url')},{code:randomBytes(32).toString('base64url')},{scope:'memory:read'},{mode:'owner'},{grant_type:'refresh_token'}]){const response=await form(h,'/token',{...p.exchange,...change});expect(response.status).toBe(400);expect(await response.text()).not.toContain(p.exchange.code);}
  const winners=await Promise.all([form(h,'/token',p.exchange),form(h,'/token',p.exchange)]);expect(winners.map(r=>r.status).sort()).toEqual([200,400]);expect((await form(h,'/token',p.exchange)).status).toBe(400);
  const pending=await approved(h);expect((await h.post('viewer','/api/oauth/selected-connections/revoke',{connectionId:pending.connectionId})).status).toBe(200);expect((await form(h,'/token',pending.exchange)).status).toBe(400);
  const expired=await approved(h);await h.f.owner`UPDATE allura.oauth_transactions SET code_expires_at=clock_timestamp()-interval '1 second' WHERE code_digest=${createHash('sha256').update(expired.exchange.code).digest('hex')}`;expect((await form(h,'/token',expired.exchange)).status).toBe(400);
  const displayExpired=await h.begin();await h.f.owner`UPDATE allura.oauth_transactions SET expires_at=clock_timestamp()-interval '1 second' WHERE digest=${createHash('sha256').update(displayExpired.consent.searchParams.get('transaction')!).digest('hex')}`;expect((await fetch(displayExpired.consent,{headers:h.headers('viewer')})).status).toBe(403);
  const stale=await approved(h);await h.f.owner`UPDATE allura.memory_shares SET active=false WHERE group_id=${h.f.scope.groupId}`;expect((await form(h,'/token',stale.exchange)).status).toBe(400);
  const [n]=await h.f.owner`SELECT count(*)::integer AS n FROM allura.selected_credentials WHERE group_id=${h.f.scope.groupId}`;expect(n.n).toBe(1);
 }finally{await h.close();}
});

test('selected client private SQL shared transaction bound and immutable audit preserve owner separation',async()=>{
 const h=await setup();try{
  const memory=await shared(h),p=await issued(h),{f}=h;
  for(const table of ['selected_connections','selected_credentials','selected_audit']){for(const query of [`SELECT * FROM allura.${table}`,`DELETE FROM allura.${table}`,`TRUNCATE allura.${table}`,`UPDATE allura.${table} SET group_id=group_id`]){await expect(f.app.unsafe(query).execute()).rejects.toThrow('permission denied');}}
  for(const query of ['DELETE FROM allura.selected_audit','UPDATE allura.selected_audit SET action=action','TRUNCATE allura.selected_audit']){await expect(f.owner.unsafe(query).execute()).rejects.toThrow('append-only');}
  const funcs=await f.owner`SELECT p.oid::regprocedure::text AS signature,p.prosecdef,p.proconfig,has_function_privilege('public',p.oid,'EXECUTE') AS public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='allura' AND p.proname LIKE 'selected_%'`;
  expect(funcs.length).toBeGreaterThan(5);for(const fn of funcs){expect(fn.public).toBe(false);expect(fn.proconfig).toContain('search_path=pg_catalog, allura');}
  await expect(f.app`SELECT allura.selected_human(${f.humanConfig.issuer},${`${f.scope.groupId}:viewer`},${f.scope.groupId},${f.scope.workspaceId}::uuid,true)`.execute()).rejects.toThrow('permission denied');
  await expect(f.owner`UPDATE allura.oauth_transactions SET mode='owner',actions=ARRAY['memory:read'] WHERE code_digest=${createHash('sha256').update(p.exchange.code).digest('hex')}`.execute()).rejects.toThrow('invalid');
  const {selectedGet}=await import('../src/selected-client.ts');await expect(selectedGet(f.app,{...f.identities.viewer},f.scope,memory.id)).rejects.toThrow('forbidden');
  await f.app.begin(async tx=>{const [k]=await f.owner`SELECT principal_id FROM allura.selected_credentials WHERE digest=${p.digest}`;await tx`SELECT set_config('allura.kind','service',true),set_config('allura.principal',${k.principal_id},true),set_config('allura.group',${f.scope.groupId},true),set_config('allura.workspace',${f.scope.workspaceId},true),set_config('allura.action','memory:read',true),set_config('allura.credential',${p.digest},true)`;expect(await tx`SELECT * FROM allura.semantic_versions`).toHaveLength(0);expect(await tx`SELECT * FROM allura.events`).toHaveLength(0);});
  const audit=await f.owner`SELECT * FROM allura.selected_audit WHERE group_id=${f.scope.groupId}`;for(const secret of [p.token,p.exchange.code,p.shown.nonce as string,memory.content]){expect(JSON.stringify(audit)).not.toContain(secret);}
  await f.owner`DELETE FROM allura.oauth_transactions`;
  const input={clientId:h.config.client.clientId,redirectUri:h.config.client.redirectUris[0],resource:h.config.resource,actions:['memory:selected:read'],challenge:createHash('sha256').update(p.verifier).digest('base64url'),state:null};
  for(let i=0;i<100;i++){const digest=createHash('sha256').update(randomBytes(32)).digest('hex');if(i%2){await f.app`SELECT allura.selected_begin(${digest},${input}::jsonb)`;}else{await f.app`SELECT allura.oauth_begin(${digest},${{...input,actions:['memory:read']}}::jsonb)`;}}
  for(const selected of [true,false]){await expect((selected?f.app`SELECT allura.selected_begin(${p.digest},${input}::jsonb)`:f.app`SELECT allura.oauth_begin(${p.digest},${{...input,actions:['memory:read']}}::jsonb)`).execute()).rejects.toThrow('invalid');}
  await f.owner`UPDATE allura.oauth_transactions SET expires_at=clock_timestamp()-interval '1 second'`;await f.app`SELECT allura.selected_begin(${p.digest},${input}::jsonb)`;expect((await f.owner`SELECT count(*)::integer AS n FROM allura.oauth_transactions`)[0].n).toBe(1);
 }finally{await h.f.owner`DELETE FROM allura.oauth_transactions`;await h.close();}
});

test('selected client deferred audit faults roll back approval issuance revoke and suppress exact read',async()=>{
 const h=await setup();try{
  const memory=await shared(h),{f}=h;
  const fail=async(action:string)=>f.owner.unsafe(`CREATE FUNCTION allura.selected_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN RAISE EXCEPTION 'private selected fault'; END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER selected_test_fail AFTER INSERT ON allura.selected_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.selected_test_fail()`);
  const clear=()=>f.owner.unsafe('DROP TRIGGER selected_test_fail ON allura.selected_audit; DROP FUNCTION allura.selected_test_fail()');
  const count=async()=>{const out:number[]=[];for(const table of ['selected_connections','selected_credentials','selected_audit','principals','memberships']){out.push(Number((await f.owner.unsafe(`SELECT count(*) AS n FROM allura.${table}`))[0].n));}return out;};
  const p=await h.begin(),headers=h.headers('viewer'),shown=await (await fetch(p.consent,{headers})).json() as Record<string,unknown>,before=await count();
  await fail('approve');try{const r=await fetch(p.consent,{method:'POST',headers,body:JSON.stringify({...shown,decision:'approve'})});expect(r.status).toBeGreaterThanOrEqual(400);expect(await r.text()).not.toContain('private selected fault');expect(await count()).toEqual(before);}finally{await clear();}
  expect((await f.owner`SELECT status FROM allura.oauth_transactions WHERE digest=${createHash('sha256').update(p.consent.searchParams.get('transaction')!).digest('hex')}`)[0].status).toBe('displayed');
  // Retry the exact failed approval, including the original nonce. Rollback must
  // preserve it rather than merely allowing an unrelated fresh transaction.
  const retry=await fetch(p.consent,{method:'POST',headers,body:JSON.stringify({...shown,decision:'approve'})});expect(retry.status).toBe(200);
  const result=await retry.json() as {redirect:string;connectionId:string},a={connectionId:result.connectionId,exchange:{grant_type:'authorization_code',client_id:h.config.client.clientId,redirect_uri:h.config.client.redirectUris[0]!,resource:h.config.resource,code:new URL(result.redirect).searchParams.get('code')!,code_verifier:p.verifier}},preIssue=await count();
  await fail('issue');try{expect((await form(h,'/token',a.exchange)).status).toBe(400);expect(await count()).toEqual(preIssue);expect((await f.owner`SELECT status FROM allura.oauth_transactions WHERE code_digest=${createHash('sha256').update(a.exchange.code).digest('hex')}`)[0].status).toBe('approved');}finally{await clear();}
  const exchange=await form(h,'/token',a.exchange);expect(exchange.status).toBe(200);const token=(await exchange.json() as {access_token:string}).access_token,preRead=await count();
  await fail('get');try{expect((await get(h,token,memory.id)).body.result).toEqual(errorResult('unavailable'));expect(await count()).toEqual(preRead);}finally{await clear();}
  await fail('revoke');try{expect((await h.post('viewer','/api/oauth/selected-connections/revoke',{connectionId:a.connectionId})).status).toBe(503);expect(await count()).toEqual(preRead);expect((await f.owner`SELECT revoked FROM allura.selected_connections WHERE id=${a.connectionId}::uuid`)[0].revoked).toBe(false);}finally{await clear();}
  expect((await get(h,token,memory.id)).body.result?.isError).not.toBe(true);
 }finally{await h.close();}
});

// Audit trigger pauses production work after its real authority locks. It does not
// reproduce the production locking algorithm. Owner UPDATEs are disposable fixtures.
type Loss='share'|'issuer'|'recipient'|'connection'|'token';
async function lose(h:Awaited<ReturnType<typeof setup>>,tx:import('bun').SQL|import('bun').TransactionSQL,kind:Loss,p:{connectionId:string;digest:string},memoryId:string){
 const {f}=h;
 if(kind==='issuer'){await tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.author}`;}
 else if(kind==='recipient'){await tx`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${f.ids.viewer}`;}
 else if(kind==='share'){await tx`SELECT allura.memory_share(${f.humanConfig.issuer},${f.scope.groupId+':author'},${f.scope.groupId},${f.scope.workspaceId}::uuid,'revoke',${{recipientId:f.ids.viewer,memoryId:memoryId,expectedRevision:1,operationKey:randomUUID()}}::jsonb)`;}
 else if(kind==='connection'){await tx`SELECT allura.selected_revoke(${f.humanConfig.issuer},${f.scope.groupId+':viewer'},${f.scope.groupId},${f.scope.workspaceId}::uuid,${p.connectionId}::uuid)`;}
 else{await tx`SELECT allura.selected_token_revoke(${h.config.client.clientId},${p.digest})`;}
}
async function pausedAudit(h:Awaited<ReturnType<typeof setup>>,action:'get'|'issue'){
 await h.f.owner.unsafe(`CREATE FUNCTION allura.selected_order_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' THEN PERFORM pg_advisory_xact_lock(24024998); END IF; RETURN NEW; END $$; CREATE TRIGGER selected_order_pause BEFORE INSERT ON allura.selected_audit FOR EACH ROW EXECUTE FUNCTION allura.selected_order_pause()`);
 let enter:(pid:number)=>void=()=>{},release=()=>{};const ready=new Promise<number>(r=>{enter=r;}),hold=new Promise<void>(r=>{release=r;});
 const blocker=h.f.owner.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(24024998)`;enter((await tx`SELECT pg_backend_pid() AS pid`)[0].pid);await hold;});
 return {pid:await ready,release,blocker,clear:()=>h.f.owner.unsafe('DROP TRIGGER selected_order_pause ON allura.selected_audit; DROP FUNCTION allura.selected_order_pause()')};
}

test('selected client read first serializes issuer recipient connection and RFC token loss at the real audit boundary',async()=>{
 for(const kind of ['issuer','recipient','connection','token'] as const){
  const h=await setup();let pause:Awaited<ReturnType<typeof pausedAudit>>|undefined,reading:Promise<unknown>|undefined,changing:Promise<unknown>|undefined;
  try{
   const memory=await shared(h),p=await issued(h),{authenticateMachine}=await import('../src/authentication.ts'),{selectedGet}=await import('../src/selected-client.ts');
   const identity=await authenticateMachine(p.token,async d=>(await h.f.app`SELECT allura.selected_lookup(${d},${h.config.resource}) AS credential`)[0].credential);
   pause=await pausedAudit(h,'get');let completed=false;
   // Exercise service commit directly: final HTTP admission may conservatively
   // suppress bytes after recipient/token revocation wins the post-commit race.
   reading=selectedGet(h.f.app,identity,h.f.scope,memory.id).then(r=>{completed=true;return r;});const reader=await blocked(h,pause.pid);expect(completed).toBe(false);
   changing=lose(h,kind==='issuer'||kind==='recipient'?h.f.owner:h.f.app,kind,p,memory.id);expect(await blocked(h,reader)).toBeGreaterThan(0);expect(completed).toBe(false);
   pause.release();await pause.blocker;expect(await reading).toEqual({memory:{id:memory.id,content:memory.content,created_at:memory.created_at}});await changing;
   const denied=await get(h,p.token,memory.id);if(kind==='issuer'){expect(denied.body.result).toEqual(errorResult('not_found'));}else{expect(denied.status).toBe(401);}
  }finally{pause?.release();await pause?.blocker;await reading;await changing;await pause?.clear();await h.close();}
 }
},30000);

test('selected client issuance first serializes share issuer recipient and pending connection revocation',async()=>{
 for(const kind of ['share','issuer','recipient','connection'] as const){
  const h=await setup();let pause:Awaited<ReturnType<typeof pausedAudit>>|undefined,exchanging:Promise<Response>|undefined,changing:Promise<unknown>|undefined;
  try{
   const memory=await shared(h),p=await approved(h);pause=await pausedAudit(h,'issue');let completed=false;
   exchanging=form(h,'/token',p.exchange).then(r=>{completed=true;return r;});const issuer=await blocked(h,pause.pid);expect(completed).toBe(false);
   changing=lose(h,kind==='issuer'||kind==='recipient'?h.f.owner:h.f.app,kind,{...p,digest:''},memory.id);expect(await blocked(h,issuer)).toBeGreaterThan(0);expect(completed).toBe(false);
   pause.release();await pause.blocker;const exchange=await exchanging;expect(exchange.status).toBe(200);const token=(await exchange.json() as {access_token:string}).access_token;await changing;
   const denied=await get(h,token,memory.id);if(kind==='share'||kind==='issuer'){expect(denied.body.result).toEqual(errorResult('not_found'));}else{expect(denied.status).toBe(401);}
   expect((await form(h,'/token',p.exchange)).status).toBe(400);
  }finally{pause?.release();await pause?.blocker;await exchanging;await changing;await pause?.clear();await h.close();}
 }
},30000);

test('selected client authority loss first blocks distinct readers and issuers and token revocation denies cached reads',async()=>{
 for(const kind of ['issuer','recipient','connection','token'] as const){
  const h=await setup();let release=()=>{},changing:Promise<unknown>|undefined,reading:Promise<unknown>|undefined,exchanging:Promise<Response>|undefined;
  try{
   const memory=await shared(h),p=await issued(h),pending=await approved(h),{authenticateMachine}=await import('../src/authentication.ts'),{selectedGet}=await import('../src/selected-client.ts');
   const identity=await authenticateMachine(p.token,async d=>(await h.f.app`SELECT allura.selected_lookup(${d},${h.config.resource}) AS credential`)[0].credential);
   let enter:(pid:number)=>void=()=>{};const ready=new Promise<number>(r=>{enter=r;}),hold=new Promise<void>(r=>{release=r;});
   // Direct row changes only where no public authority command exists; selected
   // connection/token changes execute the actual production SQL helpers.
   changing=h.f.owner.begin(async tx=>{await lose(h,tx,kind,p,memory.id);if(kind==='connection'){await lose(h,tx,kind,{...pending,digest:''},memory.id);}enter((await tx`SELECT pg_backend_pid() AS pid`)[0].pid);await hold;});
   const changer=await ready;let completed=false;
   reading=selectedGet(h.f.app,identity,h.f.scope,memory.id).then(value=>({value}),error=>({error:error.message})).then(r=>{completed=true;return r;});
   const reader=await blocked(h,changer);expect(completed).toBe(false);
   if(kind!=='token'){exchanging=form(h,'/token',pending.exchange);expect(await blocked(h,changer,reader,reader)).not.toBe(reader);}
   release();await changing;expect(await reading).toEqual({error:kind==='issuer'?'not_found':'forbidden'});
   if(exchanging){expect((await exchanging).status).toBe(400);expect((await h.f.owner`SELECT status FROM allura.oauth_transactions WHERE code_digest=${createHash('sha256').update(pending.exchange.code).digest('hex')}`)[0].status).toBe('approved');}
   expect((await h.f.owner`SELECT count(*)::integer AS n FROM allura.selected_credentials WHERE group_id=${h.f.scope.groupId}`)[0].n).toBe(1);
   expect((await h.f.owner`SELECT count(*)::integer AS n FROM allura.selected_audit WHERE group_id=${h.f.scope.groupId} AND action='get'`)[0].n).toBe(0);
  }finally{release();await changing;await reading;await exchanging;await h.close();}
 }
},30000);

async function blocked(h:Awaited<ReturnType<typeof setup>>,pid:number,exclude=0,also=0){for(let i=0;i<150;i++){const rows=await h.f.owner`SELECT pid FROM pg_stat_activity WHERE (${pid}::integer=ANY(pg_blocking_pids(pid)) OR ${also}::integer=ANY(pg_blocking_pids(pid))) AND pid<>${exclude}`;if(rows.length){return rows[0].pid as number;}await Bun.sleep(5);}throw new Error('No observed distinct database lock waiter');}
test('selected client read first holds actual authority and audit locks while share revocation waits',async()=>{
 const h=await setup();let release=()=>{};let blocker:Promise<unknown>|undefined,reading:ReturnType<typeof get>|undefined,revoking:Promise<Response>|undefined;
 try{
  const memory=await shared(h),p=await issued(h);
  await h.f.owner.unsafe("CREATE FUNCTION allura.selected_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='get' THEN PERFORM pg_advisory_xact_lock(24024999); END IF; RETURN NEW; END $$; CREATE TRIGGER selected_pause BEFORE INSERT ON allura.selected_audit FOR EACH ROW EXECUTE FUNCTION allura.selected_pause()");
  let enter:(pid:number)=>void=()=>{};const ready=new Promise<number>(r=>{enter=r;}),hold=new Promise<void>(r=>{release=r;});
  blocker=h.f.owner.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(24024999)`;enter((await tx`SELECT pg_backend_pid() AS pid`)[0].pid);await hold;});
  const pause=await ready;let disclosed=false,revoked=false;reading=get(h,p.token,memory.id).then(r=>{disclosed=true;return r;});const reader=await blocked(h,pause);expect(disclosed).toBe(false);
  revoking=h.post('author','/api/memory-shares/revoke',{recipientId:h.f.ids.viewer,memoryId:memory.id,expectedRevision:1,operationKey:randomUUID()}).then(r=>{revoked=true;return r;});expect(await blocked(h,reader)).toBeGreaterThan(0);expect(revoked).toBe(false);
  release();await blocker;expect((await reading).body.result?.structuredContent).toEqual({contract:'allura-consumer-v1',data:{memory:{id:memory.id,content:memory.content,created_at:memory.created_at}}});expect((await revoking).status).toBe(200);expect((await get(h,p.token,memory.id)).body.result).toEqual(errorResult('not_found'));
 }finally{release();await blocker;await reading;await revoking;await h.f.owner.unsafe('DROP TRIGGER IF EXISTS selected_pause ON allura.selected_audit; DROP FUNCTION IF EXISTS allura.selected_pause()');await h.close();}
});
test('selected client revoke first blocks exact read and exchange then denies without disclosure or issuance',async()=>{
 const h=await setup();let release=()=>{};let changing:Promise<unknown>|undefined,reading:ReturnType<typeof get>|undefined,exchanging:Promise<Response>|undefined;
 try{
  const memory=await shared(h),p=await issued(h),pending=await approved(h);let enter:(pid:number)=>void=()=>{};const ready=new Promise<number>(r=>{enter=r;}),hold=new Promise<void>(r=>{release=r;});
  changing=h.f.app.begin(async tx=>{await tx`SELECT allura.memory_share(${h.f.humanConfig.issuer},${`${h.f.scope.groupId}:author`},${h.f.scope.groupId},${h.f.scope.workspaceId}::uuid,'revoke',${{recipientId:h.f.ids.viewer,memoryId:memory.id,expectedRevision:1,operationKey:randomUUID()}}::jsonb)`;enter((await tx`SELECT pg_backend_pid() AS pid`)[0].pid);await hold;});
  const changer=await ready;let disclosed=false;reading=get(h,p.token,memory.id).then(r=>{disclosed=true;return r;});const reader=await blocked(h,changer);expect(reader).toBeGreaterThan(0);expect(disclosed).toBe(false);
  exchanging=form(h,'/token',pending.exchange);expect(await blocked(h,changer,reader)).not.toBe(reader);
  release();await changing;expect((await reading).body.result).toEqual(errorResult('not_found'));expect((await exchanging).status).toBe(400);expect((await h.f.owner`SELECT count(*)::integer AS n FROM allura.selected_audit WHERE group_id=${h.f.scope.groupId} AND action='get'`)[0].n).toBe(0);
 }finally{release();await changing;await reading;await exchanging;await h.close();}
});
