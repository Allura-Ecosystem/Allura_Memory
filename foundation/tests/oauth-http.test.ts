import {test,expect} from 'bun:test';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {type OAuthClientProvider,UnauthorizedError} from '@modelcontextprotocol/sdk/client/auth.js';
import {type OAuthTokens} from '@modelcontextprotocol/sdk/shared/auth.js';
import {type FetchLike} from '@modelcontextprotocol/sdk/shared/transport.js';
import {packCore} from '../scripts/pack-core.ts';
import {fixture} from './lifecycle-fixture.ts';

test('OAuth isolated core SDK discovers issuer exchanges tokens and closes its separate listener',async()=>{
 const f=await fixture(`allura-oauth-${randomBytes(8).toString('hex')}`),directory=await mkdtemp(join(tmpdir(),'allura-oauth-core-'));
 let child:ReturnType<typeof Bun.spawn>|undefined;
 const reservation=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response(null,{status:404})});const port=reservation.port!;await reservation.stop(true);
 const oauth={port,issuer:`http://127.0.0.1:${port}`,resource:'https://core.invalid/mcp',consentOrigin:'https://core.invalid',client:{clientId:'synthetic-desktop',name:'Synthetic desktop',redirectUris:['http://127.0.0.1:18444/callback'],actions:['memory:read','memory:capture','memory:delete']}};
 try{
  const artifact=await packCore();expect(Bun.spawnSync(['tar','-xzf',artifact.tarball,'-C',directory],{stdout:'pipe',stderr:'pipe'}).exitCode).toBe(0);
  const node=Bun.spawnSync(['node','-p','process.execPath'],{stdout:'pipe',stderr:'pipe'});expect(node.exitCode).toBe(0);
  const env={PATH:[dirname(node.stdout.toString().trim()),dirname(process.execPath),process.env.PATH].join(':'),HOME:directory,TMPDIR:tmpdir(),BUN_INSTALL_CACHE_DIR:join(tmpdir(),'allura-core-dependency-cache'),ALLURA_DATABASE_URL:f.appUrl,ALLURA_CURSOR_KEY:randomBytes(32).toString('base64url')};
  for(const command of ['install:frozen','prepare:model']){const p=Bun.spawn([process.execPath,'run',command],{cwd:directory,env,stdout:'pipe',stderr:'pipe',timeout:180000});await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text()]);expect(await p.exited).toBe(0);}
  await writeFile(join(directory,'config.json'),JSON.stringify({origin:'https://core.invalid',issuer:f.humanConfig.issuer,audience:f.humanConfig.audience,port:0,keys:[{kid:'key',pem:f.humanConfig.keys.get('key')!.export({type:'spki',format:'pem'}).toString()}],oauth}));
  child=Bun.spawn([process.execPath,'src/core-server.ts','config.json'],{cwd:directory,env,stdout:'pipe',stderr:'pipe'});
  const reader=(child.stdout as ReadableStream<Uint8Array>).getReader();let text='';const timeout=setTimeout(()=>child?.kill(),35000);
  try{while(!text.includes('\n')){const next=await reader.read();if(next.done){break;}text+=new TextDecoder().decode(next.value);if(text.length>4096){throw new Error('readiness overflow');}}}finally{clearTimeout(timeout);reader.releaseLock();}
  expect(JSON.parse(text.split('\n')[0]!)).toMatchObject({event:'listening',host:'127.0.0.1'});
  const response=await fetch(`${oauth.issuer}/.well-known/oauth-authorization-server`).catch(()=>null);
  expect(response?.status).toBe(200);
  const metadata=await response!.json() as Record<string,unknown>;
  expect(metadata).toEqual({issuer:oauth.issuer,authorization_endpoint:oauth.issuer+'/authorize',token_endpoint:oauth.issuer+'/token',revocation_endpoint:oauth.issuer+'/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],revocation_endpoint_auth_methods_supported:['none'],scopes_supported:oauth.client.actions});
  expect(response!.headers.get('cache-control')).toBe('no-store');expect(response!.headers.get('referrer-policy')).toBe('no-referrer');
  expect((await fetch(`${oauth.issuer}/register`,{method:'POST'})).status).toBe(404);
  expect(await readFile(join(directory,'config.json'),'utf8')).not.toContain(f.appUrl);
  const core=`http://127.0.0.1:${JSON.parse(text.split('\n')[0]!).port}`,state=randomBytes(24).toString('base64url');
  let verifier:string|undefined,authorize:URL|undefined,savedTokens:OAuthTokens|undefined;
  const authProvider:OAuthClientProvider={
   redirectUrl:oauth.client.redirectUris[0]!,
   clientMetadata:{redirect_uris:oauth.client.redirectUris,token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']},
   clientInformation:()=>({client_id:oauth.client.clientId,issuer:oauth.issuer}),
   state:()=>state,tokens:()=>savedTokens,saveTokens:tokens=>{savedTokens=tokens;},
   saveCodeVerifier:value=>{verifier=value;},codeVerifier:()=>{if(!verifier){throw new Error('missing SDK verifier');}return verifier;},
   redirectToAuthorization:url=>{authorize=url;}
  };
  const witness:{origin:string;path:string;method:string;status:number;authenticated:boolean;challenge:boolean}[]=[];
  // This maps transport only. SDK discovery/resource validation and every
  // response body still come from the real owned HTTP servers.
  const mappedFetch:FetchLike=async(input,init)=>{
   const request=new Request(input.toString(),init),logical=new URL(request.url),target=new URL(request.url);
   if(logical.username||logical.password||logical.hash){throw new Error('unowned OAuth test destination');}
   if(logical.origin===new URL(oauth.resource).origin){target.protocol='http:';target.host=new URL(core).host;}
   else if(logical.origin!==oauth.issuer){throw new Error('unowned OAuth test destination');}
   const response=await fetch(new Request(target.href,request),{redirect:'manual'});
   witness.push({origin:logical.origin,path:logical.pathname,method:request.method,status:response.status,authenticated:request.headers.has('authorization'),challenge:response.headers.get('www-authenticate')===`Bearer resource_metadata="${oauth.consentOrigin}/.well-known/oauth-protected-resource/mcp"`});
   return response;
  };
  for(const url of ['https://foreign.invalid/mcp','http://core.invalid/mcp',core+'/mcp',oauth.issuer.replace('127.0.0.1','localhost')+'/token','https://core.invalid@foreign.invalid/mcp']){await expect(mappedFetch(url)).rejects.toThrow('unowned OAuth test destination');}
  expect(witness).toEqual([]);expect(await authProvider.tokens()).toBeUndefined();
  const initial=new Client({name:'synthetic-oauth-discovery',version:'1.0'}),transport=new StreamableHTTPClientTransport(new URL(oauth.resource),{authProvider,fetch:mappedFetch});
  try{await expect(initial.connect(transport)).rejects.toBeInstanceOf(UnauthorizedError);}finally{await initial.close();}
  expect(witness[0]).toEqual({origin:oauth.consentOrigin,path:'/mcp',method:'POST',status:401,authenticated:false,challenge:true});
  expect(witness.some(r=>r.origin===oauth.consentOrigin&&r.path==='/.well-known/oauth-protected-resource/mcp'&&r.method==='GET'&&r.status===200)).toBe(true);
  expect(witness.some(r=>r.origin===oauth.issuer&&r.path==='/.well-known/oauth-authorization-server'&&r.method==='GET'&&r.status===200)).toBe(true);
  expect(authorize).toBeInstanceOf(URL);expect(authorize!.origin+authorize!.pathname).toBe(oauth.issuer+'/authorize');
  expect(authorize!.searchParams.get('resource')).toBe(oauth.resource);expect(authorize!.searchParams.get('state')).toBe(state);expect(authorize!.searchParams.get('scope')).toBe(oauth.client.actions.join(' '));
  expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);expect(authorize!.searchParams.get('code_challenge_method')).toBe('S256');expect(authorize!.searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier!).digest('base64url'));
  const pending=await mappedFetch(authorize!);expect(pending.status).toBe(302);
  const consent=new URL(pending.headers.get('location')!);expect(consent.origin).toBe(oauth.consentOrigin);expect(consent.pathname).toBe('/api/oauth/consent');expect(consent.searchParams.has('code')).toBe(false);
  consent.searchParams.set('group_id',f.scope.groupId);consent.searchParams.set('workspace_id',f.scope.workspaceId);
  const assertion=f.jwt('author'),headers={'Cf-Access-Jwt-Assertion':assertion,Origin:oauth.consentOrigin,'Sec-Fetch-Site':'same-origin','content-type':'application/json'};
  const display=await mappedFetch(consent,{headers});expect(display.status).toBe(200);const shown=await display.json() as Record<string,unknown>;expect(shown).toMatchObject({clientId:oauth.client.clientId,redirectUri:oauth.client.redirectUris[0],actions:oauth.client.actions,groupId:f.scope.groupId,workspaceId:f.scope.workspaceId});
  const approved=await mappedFetch(consent,{method:'POST',headers,body:JSON.stringify({...shown,decision:'approve'})});expect(approved.status).toBe(200);const callback=new URL((await approved.json() as {redirect:string}).redirect);expect(callback.origin+callback.pathname).toBe(oauth.client.redirectUris[0]!);expect(callback.searchParams.get('state')).toBe(state);expect(callback.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await transport.finishAuth(callback.searchParams.get('code')!);
  const tokens=(await authProvider.tokens())!;expect(tokens).toMatchObject({issuer:oauth.issuer,token_type:'Bearer',expires_in:900,scope:oauth.client.actions.join(' ')});expect(tokens.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(tokens).not.toHaveProperty('refresh_token');
  expect(witness.some(r=>r.origin===oauth.issuer&&r.path==='/token'&&r.method==='POST'&&r.status===200)).toBe(true);
  const client=new Client({name:'synthetic-oauth-test',version:'1.0'});try{await client.connect(new StreamableHTTPClientTransport(new URL(oauth.resource),{authProvider,fetch:mappedFetch}));expect((await client.listTools()).tools.map(t=>t.name).sort()).toEqual(['memory_add','memory_delete','memory_get','memory_list','memory_search']);const captured=await client.callTool({name:'memory_add',arguments:{content:'OAuth synthetic evidence',idempotency_key:'oauth-capture',threshold:1}});expect(captured.isError).not.toBe(true);const receipt=(captured.structuredContent as {data:{receipt_id:string;event_id:string}}).data;const read=await client.callTool({name:'memory_get',arguments:{kind:'receipt',id:receipt.receipt_id}});expect((read.structuredContent as {data:unknown}).data).toEqual(receipt);
   const query='?'+new URLSearchParams({group_id:f.scope.groupId,workspace_id:f.scope.workspaceId}),post=(path:string,body:unknown,actor:'author'|'reviewer'='author')=>fetch(core+path+query,{method:'POST',headers:{...headers,'Cf-Access-Jwt-Assertion':f.jwt(actor)},body:JSON.stringify(body)});
   const proposalResponse=await post('/api/review/submit',{summary:'OAuth synthetic approved knowledge',assertionKind:'observation',evidenceIds:[receipt.event_id]});expect(proposalResponse.status).toBe(200);const proposal=await proposalResponse.json() as {id:string};
   const decision={proposalId:proposal.id,reviewedProposalVersion:1,decision:'approve',rationale:'Independent synthetic approval',evidenceIds:[receipt.event_id],operationKey:'oauth-independent-review'};
   expect((await post('/api/review/decision',decision)).status).toBe(403);
   expect((await fetch(core+'/api/review/decision'+query,{method:'POST',headers:{Authorization:`Bearer ${tokens.access_token}`,'content-type':'application/json'},body:JSON.stringify(decision)})).status).toBe(401);
   const approval=await post('/api/review/decision',decision,'reviewer');expect(approval.status).toBe(200);const semantic=await approval.json() as {semantic_version_id:string};
   const args={memoryId:semantic.semantic_version_id,expectedHeadRevision:1,reason:'Owner-authorized synthetic deletion',operationKey:'oauth-delete'};
   const deleted=await client.callTool({name:'memory_delete',arguments:args});expect(deleted.isError).not.toBe(true);expect(await client.callTool({name:'memory_delete',arguments:args})).toEqual(deleted);
   const list=await client.callTool({name:'memory_list',arguments:{}});expect((list.structuredContent as {data:{items:unknown[]}}).data.items).toEqual([]);
  }finally{await client.close();}
  child.kill('SIGTERM');expect(await child.exited).toBe(0);child=undefined;
  expect(await fetch(`${oauth.issuer}/.well-known/oauth-authorization-server`).then(()=>true,()=>false)).toBe(false);
  // A failed second listener must close the first listener and SQL pool, so
  // the packaged process exits by itself rather than needing a force kill.
  const occupied=Bun.serve({hostname:'127.0.0.1',port,fetch:()=>new Response('owned-test-listener')});
  try{child=Bun.spawn([process.execPath,'src/core-server.ts','config.json'],{cwd:directory,env,stdout:'pipe',stderr:'pipe',timeout:35000});const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout as ReadableStream<Uint8Array>).text(),new Response(child.stderr as ReadableStream<Uint8Array>).text(),child.exited]);expect(exit).toBe(1);expect(stdout).toBe('');expect(JSON.parse(stderr.trim())).toEqual({outcome:'unavailable',reason:'core_start_failed'});expect(await (await fetch(oauth.issuer)).text()).toBe('owned-test-listener');child=undefined;}finally{await occupied.stop(true);}
  const disabled=JSON.parse(await readFile(join(directory,'config.json'),'utf8'));delete disabled.oauth;await writeFile(join(directory,'config.json'),JSON.stringify(disabled));
  child=Bun.spawn([process.execPath,'src/core-server.ts','config.json'],{cwd:directory,env,stdout:'pipe',stderr:'pipe'});const disabledReader=(child.stdout as ReadableStream<Uint8Array>).getReader();let disabledText='';const disabledDeadline=setTimeout(()=>child?.kill(),35000);
  try{while(!disabledText.includes('\n')){const next=await disabledReader.read();if(next.done){break;}disabledText+=new TextDecoder().decode(next.value);if(disabledText.length>4096){throw new Error('readiness overflow');}}}finally{clearTimeout(disabledDeadline);disabledReader.releaseLock();}
  const ready=JSON.parse(disabledText.split('\n')[0]!);expect(ready.event).toBe('listening');expect(await fetch(oauth.issuer).then(()=>true,()=>false)).toBe(false);expect((await fetch(`http://127.0.0.1:${ready.port}/api/oauth/consent`,{headers})).status).toBe(404);
  child.kill('SIGTERM');expect(await child.exited).toBe(0);child=undefined;
 }finally{if(child){child.kill('SIGTERM');await child.exited;}await f.close();await rm(directory,{recursive:true,force:true});}
},240000);
