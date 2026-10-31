import {test,expect} from 'bun:test';
import {randomBytes,createHash} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {authenticateMachine,type MachineCredential} from '../src/authentication.ts';
import {scopedTransaction} from '../src/persistence.ts';
import {LocalOAuthProvider} from '../src/oauth-provider.ts';
import {startOAuthHttp,stopOAuthHttp} from '../src/oauth-http.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {loadLocalEmbedder} from '../src/embedding.ts';
import {type OAuthConfig} from '../src/core-config.ts';

async function setup(){
 const f=await fixture(`allura-oauth-${randomBytes(8).toString('hex')}`),reservation=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response(null)}),port=reservation.port!;await reservation.stop(true);
 const config:OAuthConfig={host:'127.0.0.1',port,issuer:`http://127.0.0.1:${port}`,resource:'https://core.invalid/mcp',consentOrigin:'https://core.invalid',client:{clientId:'synthetic-desktop',name:'Synthetic desktop',redirectUris:['http://127.0.0.1:18444/callback'],actions:['memory:read','memory:capture','memory:delete','evidence:read']}};
 const provider=new LocalOAuthProvider(f.app,config),server=await startOAuthHttp(config,provider),core=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createCoreGateway(f.app,f.humanConfig,config.consentOrigin,randomBytes(32),await loadLocalEmbedder(),undefined,undefined,'human',provider)}),base=`http://127.0.0.1:${core.port}`;
 const form=(path:string,body:Record<string,string>)=>fetch(config.issuer+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),redirect:'manual'});
 const begin=async(verifier=randomBytes(32).toString('base64url'))=>{const query={client_id:config.client.clientId,redirect_uri:config.client.redirectUris[0]!,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),resource:config.resource,scope:config.client.actions.join(' '),state:randomBytes(24).toString('base64url')};const response=await fetch(config.issuer+'/authorize?'+new URLSearchParams(query),{redirect:'manual'});expect(response.status).toBe(302);const consent=new URL(response.headers.get('location')!);expect(consent.origin).toBe(config.consentOrigin);expect(consent.pathname).toBe('/dashboard/oauth/consent');consent.pathname='/api/oauth/consent';consent.host=new URL(base).host;consent.protocol='http:';consent.searchParams.set('group_id',f.scope.groupId);consent.searchParams.set('workspace_id',f.scope.workspaceId);return {consent,query,verifier};};
 const humanHeaders=(actor:Parameters<typeof f.jwt>[0]='author'):Record<string,string>=>({'Cf-Access-Jwt-Assertion':f.jwt(actor),Origin:config.consentOrigin,'Sec-Fetch-Site':'same-origin','content-type':'application/json'});
 const approve=async(verifier?:string)=>{const p=await begin(verifier),headers=humanHeaders(),display=await fetch(p.consent,{headers});expect(display.status).toBe(200);const shown=await display.json() as Record<string,unknown>,approval=await fetch(p.consent,{method:'POST',headers,body:JSON.stringify({...shown,decision:'approve'})});expect(approval.status).toBe(200);const code=new URL((await approval.json() as {redirect:string}).redirect).searchParams.get('code')!;return {...p,headers,shown,exchange:{grant_type:'authorization_code',client_id:config.client.clientId,redirect_uri:config.client.redirectUris[0]!,resource:config.resource,code,code_verifier:p.verifier}};};
 const issue=async()=>{const p=await approve(),r=await form('/token',p.exchange);expect(r.status).toBe(200);const token=(await r.json() as {access_token:string}).access_token;return {...p,token};};
 const mcp=(token:string,query='')=>fetch(base+'/mcp'+query,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
 return {f,config,provider,base,form,begin,approve,issue,mcp,humanHeaders,close:async()=>{await core.stop(true);await stopOAuthHttp(server);await f.close();}};
}
test('OAuth discovery metadata is exact anonymous configuration bound and GET only',async()=>{
 const h=await setup();try{
  const path='/.well-known/oauth-protected-resource/mcp';
  for(const headers of [{},{Host:'foreign.invalid','X-Forwarded-Host':'foreign.invalid','X-Forwarded-Proto':'http',Forwarded:'host=foreign.invalid;proto=http'}]){
   const response=await fetch(h.base+path,{headers});expect(response.status).toBe(200);
   expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('x-content-type-options')).toBe('nosniff');
   expect(await response.json()).toEqual({resource:h.config.resource,authorization_servers:[h.config.issuer],scopes_supported:h.config.client.actions,bearer_methods_supported:['header']});
  }
  for(const method of ['POST','PUT','DELETE','HEAD','OPTIONS']){const response=await fetch(h.base+path,{method});expect(response.status).toBe(404);expect(response.headers.has('www-authenticate')).toBe(false);}
  expect((await fetch(h.base+'/.well-known/oauth-protected-resource')).status).toBe(404);
 }finally{await h.close();}
});
test('OAuth discovery challenges preserve gateway and wrapper authentication denials without trusting forwarded hosts',async()=>{
 const h=await setup();try{
  const {token}=await h.issue(),challenge=`Bearer resource_metadata="${new URL(h.config.resource).origin}/.well-known/oauth-protected-resource/mcp"`;
  const hostile={Host:'foreign.invalid','X-Forwarded-Host':'foreign.invalid','X-Forwarded-Proto':'http',Forwarded:'host=foreign.invalid;proto=http'};
  for(const method of ['GET','POST']){
   for(const credentials of [{},{Authorization:'Bearer '+randomBytes(32).toString('base64url')},{Authorization:`Bearer ${token}`,Cookie:'CF_Authorization='+h.f.jwt('author')},{Authorization:`Bearer ${token}`,'Cf-Access-Jwt-Assertion':h.f.jwt('author')}]){
    const response=await fetch(h.base+'/mcp',{method,headers:{...hostile,...credentials}});
    expect(response.status).toBe(401);expect(await response.text()).toBe('{"outcome":"unauthenticated"}');expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('www-authenticate')).toBe(challenge);
   }
  }
  // A bound but expired credential reaches the wrapper verification catch,
  // not the missing/unknown-token gateway path above.
  await h.f.owner`UPDATE allura.machine_credentials SET expires_at=clock_timestamp()-interval '1 second' WHERE digest=decode(${createHash('sha256').update(token).digest('hex')},'hex')`;
  expect(await h.provider.isOAuthToken(token)).toBe(true);await expect(h.provider.verifyAccessToken(token)).rejects.toThrow();
  for(const method of ['GET','POST']){const response=await fetch(h.base+'/mcp',{method,headers:{...hostile,Authorization:`Bearer ${token}`}});expect(response.status).toBe(401);expect(await response.text()).toBe('{"outcome":"unauthenticated"}');expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('www-authenticate')).toBe(challenge);}
 }finally{await h.close();}
});
test('OAuth discovery stays absent when disabled and never decorates scope conflicts or human routes',async()=>{
 const h=await setup();try{
  const disabled=createCoreGateway(h.f.app,h.f.humanConfig,h.config.consentOrigin,randomBytes(32),await loadLocalEmbedder());
  for(const path of ['/.well-known/oauth-protected-resource/mcp','/mcp']){for(const method of ['GET','POST']){const response=await disabled(new Request(h.base+path,{method}));expect(response.status).toBe(path==='/mcp'?401:404);expect(response.headers.has('www-authenticate')).toBe(false);expect(await response.json()).toEqual({outcome:path==='/mcp'?'unauthenticated':'not_found'});}}
  const {token}=await h.issue();
  for(const method of ['GET','POST']){for(const query of ['?workspace_id='+h.f.foreignWorkspace,'?group_id=foreign','?group_id='+h.f.scope.groupId+'&group_id='+h.f.scope.groupId]){const response=await fetch(h.base+'/mcp'+query,{method,headers:{Authorization:`Bearer ${token}`}});expect(response.status).toBe(403);expect(await response.json()).toEqual({outcome:'forbidden'});expect(response.headers.has('www-authenticate')).toBe(false);}}
  for(const path of ['/api/oauth/consent','/api/oauth/connections/revoke','/api/review/decision']){const response=await fetch(h.base+path,{method:path.endsWith('consent')?'GET':'POST',headers:{Authorization:`Bearer ${token}`}});expect(response.status).toBe(401);expect(await response.json()).toEqual({outcome:'unauthenticated'});expect(response.headers.has('www-authenticate')).toBe(false);}
  const malformed=await fetch(h.base+'/mcp',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:'not-json'});expect(malformed.status).toBe(400);expect(await malformed.json()).toEqual({outcome:'invalid'});expect(malformed.headers.has('www-authenticate')).toBe(false);
  const success=await h.mcp(token);expect(success.status).toBe(200);expect(success.headers.has('www-authenticate')).toBe(false);
  for(const method of ['PUT','DELETE','OPTIONS']){const response=await fetch(h.base+'/mcp',{method});expect(response.status).toBe(404);expect(response.headers.has('www-authenticate')).toBe(false);}
 }finally{await h.close();}
});
test('OAuth protocol rejects ambiguous fields exact callback mismatch and unsafe diagnostics before state creation',async()=>{
 const h=await setup();try{const {query}=await h.begin(),before=Number((await h.f.owner`SELECT count(*) AS n FROM allura.oauth_transactions`)[0].n);
 const bad=[{...query,redirect_uri:'http://127.0.0.1:18445/callback'},{...query,code_challenge_method:'plain'},{...query,code_challenge:''},{...query,resource:'https://foreign.invalid/mcp'},{...query,scope:'review:approve'},{...query,scope:'memory:read memory:read'},{...query,code_challenge:'x'.repeat(44)},{...query,state:'x'.repeat(513)},{...query,scope:'memory:read',workspace_id:h.f.scope.workspaceId}];
 const failures:unknown[]=[];for(const input of bad){const r=await fetch(h.config.issuer+'/authorize?'+new URLSearchParams(input),{redirect:'manual'});if(r.status!==400||r.headers.has('location')){failures.push({status:r.status,input:Object.keys(input)});}expect(await r.text()).not.toContain(h.f.scope.workspaceId);}
 const duplicate=await fetch(h.config.issuer+'/authorize?'+new URLSearchParams(query)+'&resource='+encodeURIComponent(query.resource),{redirect:'manual'});if(duplicate.status!==400){failures.push({duplicate:duplicate.status});}
 expect(failures).toEqual([]);expect(Number((await h.f.owner`SELECT count(*) AS n FROM allura.oauth_transactions`)[0].n)).toBe(before);
 }finally{await h.close();}
});
test('OAuth resource binding cannot fall back to legacy explicit scope after resource mismatch',async()=>{
 const h=await setup();try{const {token}=await h.issue(),query='?'+new URLSearchParams({group_id:h.f.scope.groupId,workspace_id:h.f.scope.workspaceId});expect((await h.mcp(token,query)).status).toBe(200);
 await h.f.owner`UPDATE allura.oauth_credentials SET resource='https://foreign.invalid/mcp' WHERE credential_id=(SELECT id FROM allura.machine_credentials WHERE digest=decode(${createHash('sha256').update(token).digest('hex')},'hex'))`;
 expect((await h.mcp(token,query)).status).toBe(401);
 const api=await fetch(h.base+'/api/agent/memory/list'+query,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'});expect(api.status).toBe(401);
 const disabled=createCoreGateway(h.f.app,h.f.humanConfig,h.config.consentOrigin,randomBytes(32),await loadLocalEmbedder());
 expect((await disabled(new Request(h.base+'/mcp'+query,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'}))).status).toBe(401);
 }finally{await h.close();}
});
test('OAuth human connection revocation disables delegation and all credentials without granting machine administration',async()=>{
 const h=await setup();try{const {token}=await h.issue(),digest=createHash('sha256').update(token).digest('hex'),[row]=await h.f.owner`SELECT client_delegation_id AS id FROM allura.machine_credentials WHERE digest=decode(${digest},'hex')`,url=h.base+'/api/oauth/connections/revoke?'+new URLSearchParams({group_id:h.f.scope.groupId,workspace_id:h.f.scope.workspaceId}),body=JSON.stringify({connectionId:row.id});
 expect((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body})).status).toBe(401);
 expect((await fetch(url,{method:'POST',headers:h.humanHeaders(),body})).status).toBe(200);
 expect((await h.mcp(token)).status).toBe(401);
 expect((await h.f.owner`SELECT revoked FROM allura.client_delegations WHERE id=${row.id}::uuid`)[0].revoked).toBe(true);
 expect((await h.f.owner`SELECT bool_and(revoked) AS revoked FROM allura.machine_credentials WHERE client_delegation_id=${row.id}::uuid`)[0].revoked).toBe(true);
 }finally{await h.close();}
});
test('OAuth consent binds the signed display session exact scope and one use nonce without implicit member grants',async()=>{
 const h=await setup();try{
  const p=await h.begin(),headers=h.humanHeaders();expect((await fetch(p.consent)).status).toBe(401);
  expect((await fetch(p.consent,{headers:h.humanHeaders('viewer')})).status).toBe(403);
  expect((await fetch(p.consent,{headers:{...headers,Cookie:'CF_Authorization='+h.f.jwt('reviewer')}})).status).toBe(401);
  const shownResponse=await fetch(p.consent,{headers});expect(shownResponse.status).toBe(200);expect(shownResponse.headers.get('cache-control')).toBe('no-store');expect(shownResponse.headers.get('referrer-policy')).toBe('no-referrer');const shown=await shownResponse.json() as Record<string,unknown>;
  const post=(body:unknown,head=headers,url=p.consent)=>fetch(url,{method:'POST',headers:head,body:JSON.stringify(body)}),approved={...shown,decision:'approve'};
  expect((await post(approved,{...headers,Origin:'https://foreign.invalid'})).status).toBe(403);
  expect((await post(approved,{...headers,'Sec-Fetch-Site':'cross-site'})).status).toBe(403);
  expect((await post(approved,{...headers,Authorization:'Bearer '+randomBytes(32).toString('base64url')})).status).toBe(400);
  for(const swap of [{clientId:'other'},{redirectUri:'https://foreign.invalid/cb'},{actions:['review:approve']},{nonce:randomBytes(32).toString('base64url')},{workspaceId:h.f.foreignWorkspace}]){expect((await post({...approved,...swap})).status).toBeGreaterThanOrEqual(400);}
  expect((await post(approved,h.humanHeaders('reviewer'))).status).toBe(403);
  expect((await fetch(p.consent,{headers})).status).toBe(403);
  const cancel=await post({...shown,decision:'cancel'});expect(cancel.status).toBe(200);const target=new URL((await cancel.json() as {redirect:string}).redirect);expect(target.searchParams.get('error')).toBe('access_denied');expect(target.searchParams.has('code')).toBe(false);expect((await post(approved)).status).toBe(403);
  expect(Number((await h.f.owner`SELECT count(*) AS n FROM allura.client_delegations WHERE group_id=${h.f.scope.groupId}`)[0].n)).toBe(0);
  const expired=await h.begin();await h.f.owner`UPDATE allura.oauth_transactions SET expires_at=clock_timestamp()-interval '1 second' WHERE digest=${createHash('sha256').update(expired.consent.searchParams.get('transaction')!).digest('hex')}`;expect((await fetch(expired.consent,{headers})).status).toBe(403);
 }finally{await h.close();}
});
test('OAuth exchange enforces PKCE client callback resource expiry and exactly one concurrent redemption',async()=>{
 const h=await setup();try{const p=await h.approve();
 for(const patch of [{code_verifier:''},{code_verifier:randomBytes(32).toString('base64url')},{client_id:'foreign'},{redirect_uri:'http://127.0.0.1:18445/callback'},{resource:'https://foreign.invalid/mcp'},{code:randomBytes(32).toString('base64url')},{grant_type:'refresh_token'}]){const r=await h.form('/token',{...p.exchange,...patch});expect(r.status).toBe(400);expect(await r.text()).not.toContain(p.exchange.code);}
 const missing={...p.exchange};delete (missing as Partial<typeof missing>).code_verifier;expect((await h.form('/token',missing)).status).toBe(400);
 const simultaneous=await Promise.all([h.form('/token',p.exchange),h.form('/token',p.exchange)]);expect(simultaneous.map(r=>r.status).sort()).toEqual([200,400]);expect((await h.form('/token',p.exchange)).status).toBe(400);
 expect(Number((await h.f.owner`SELECT count(*) AS n FROM allura.client_delegations WHERE group_id=${h.f.scope.groupId}`)[0].n)).toBe(1);
 const expired=await h.approve();await h.f.owner`UPDATE allura.oauth_transactions SET code_expires_at=clock_timestamp()-interval '1 second' WHERE code_digest=${createHash('sha256').update(expired.exchange.code).digest('hex')}`;expect((await h.form('/token',expired.exchange)).status).toBe(400);
 }finally{await h.close();}
});
test('OAuth deferred audit fault rolls back code consumption and every issued artifact while private transitions deny forged callers',async()=>{
 const h=await setup();try{const p=await h.approve(),count=async()=>{const result:number[]=[];for(const table of ['principals','memberships','client_delegations','machine_credentials','oauth_credentials','oauth_audit']){result.push(Number((await h.f.owner.unsafe('SELECT count(*) AS n FROM allura.'+table))[0].n));}return result;},before=await count();
 await h.f.owner.unsafe("CREATE FUNCTION allura.oauth_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='issue' THEN RAISE EXCEPTION 'synthetic-private-fault'; END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER oauth_test_fault AFTER INSERT ON allura.oauth_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.oauth_test_fault()");
 try{const failed=await h.form('/token',p.exchange);expect(failed.status).toBe(400);expect(await failed.text()).not.toContain('synthetic-private-fault');expect(await count()).toEqual(before);expect((await h.f.owner`SELECT status FROM allura.oauth_transactions WHERE code_digest=${createHash('sha256').update(p.exchange.code).digest('hex')}`)[0].status).toBe('approved');}finally{await h.f.owner.unsafe('DROP TRIGGER oauth_test_fault ON allura.oauth_audit; DROP FUNCTION allura.oauth_test_fault()');}
 expect((await h.form('/token',p.exchange)).status).toBe(200);
 for(const table of ['oauth_transactions','oauth_credentials','oauth_audit']){await expect(Promise.resolve(h.f.app.unsafe('SELECT * FROM allura.'+table))).rejects.toThrow();await expect(Promise.resolve(h.f.app.unsafe('DELETE FROM allura.'+table))).rejects.toThrow();}
 await expect(Promise.resolve(h.f.app`SELECT allura.oauth_consent(${h.f.scope.groupId},${h.f.scope.workspaceId}::uuid,${'0'.repeat(64)},${{kind:'approve',ownerId:h.f.ids.author}}::jsonb)`)).rejects.toThrow('forbidden');
 await expect(Promise.resolve(h.f.app`SELECT allura.oauth_revoke_connection(${h.f.scope.groupId},${h.f.scope.workspaceId}::uuid,${h.f.scope.workspaceId}::uuid)`)).rejects.toThrow('forbidden');
 const stored=JSON.stringify(await h.f.owner`SELECT * FROM allura.oauth_transactions WHERE group_id=${h.f.scope.groupId}`);expect(stored).not.toContain(p.exchange.code);expect(stored).not.toContain(p.verifier);expect(stored).not.toContain(p.shown.nonce as string);
 }finally{await h.close();}
});
test('OAuth current owner narrowing revocation and missing durable bindings deny cached and subsequent access',async()=>{
 const h=await setup();try{const p=await h.issue(),digest=createHash('sha256').update(p.token).digest('hex');const cached=await authenticateMachine(p.token,async d=>(await h.f.app`SELECT allura.oauth_lookup(${d},${h.config.resource}) AS credential`)[0].credential as MachineCredential);expect((await h.mcp(p.token,'?'+new URLSearchParams({group_id:h.f.scope.groupId,workspace_id:h.f.foreignWorkspace}))).status).toBe(403);
 expect((await fetch(h.base+'/mcp',{method:'POST',headers:{Authorization:`Bearer ${p.token}`,'Cf-Access-Jwt-Assertion':h.f.jwt('author'),'content-type':'application/json'},body:'{}'})).status).toBe(401);
 const pending=await h.approve();await h.f.owner`UPDATE allura.workspace_grants SET role='viewer' WHERE group_id=${h.f.scope.groupId} AND principal_id=${h.f.ids.author}::uuid`;expect((await h.form('/token',pending.exchange)).status).toBe(400);
 const verified=await h.provider.verifyAccessToken(p.token);expect(verified.scopes).toEqual(['memory:read']);await expect(scopedTransaction(h.f.app,cached,h.f.scope,'memory:capture',async()=>true)).rejects.toThrow();
 await h.f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${h.f.scope.groupId} AND principal_id=${h.f.ids.author}::uuid`;expect((await h.mcp(p.token)).status).toBe(401);await expect(h.provider.verifyAccessToken(p.token)).rejects.toThrow();await expect(scopedTransaction(h.f.app,cached,h.f.scope,'memory:read',async()=>true)).rejects.toThrow();
 await h.f.owner`UPDATE allura.workspace_grants SET active=true,role='workspace_admin' WHERE group_id=${h.f.scope.groupId} AND principal_id=${h.f.ids.author}::uuid`;expect((await h.mcp(p.token)).status).toBe(200);
 await h.f.owner`UPDATE allura.machine_credentials SET expires_at=clock_timestamp()-interval '1 second' WHERE digest=decode(${digest},'hex')`;expect((await h.mcp(p.token)).status).toBe(401);
 await h.f.owner`UPDATE allura.machine_credentials SET expires_at=clock_timestamp()+interval '1 minute' WHERE digest=decode(${digest},'hex')`;
 await h.f.owner`DELETE FROM allura.oauth_credentials WHERE credential_id=(SELECT id FROM allura.machine_credentials WHERE digest=decode(${digest},'hex'))`;expect((await h.mcp(p.token,'?'+new URLSearchParams({group_id:h.f.scope.groupId,workspace_id:h.f.scope.workspaceId}))).status).toBe(401);
 }finally{await h.close();}
});
test('OAuth exchange rejects verifiers outside RFC7636 syntax even when their S256 challenge matches',async()=>{
 const h=await setup();try{
  for(const verifier of ['a','a'.repeat(42),'a'.repeat(129),'é'.repeat(43),'a'.repeat(42)+'!']){
   const p=await h.approve(verifier),response=await h.form('/token',p.exchange);
   expect(response.status).toBe(400);
   expect(Number((await h.f.owner`SELECT count(*) AS n FROM allura.client_delegations WHERE group_id=${h.f.scope.groupId}`)[0].n)).toBe(0);
   expect((await h.f.owner`SELECT status FROM allura.oauth_transactions WHERE code_digest=${createHash('sha256').update(p.exchange.code).digest('hex')}`)[0].status).toBe('approved');
  }
 }finally{await h.close();}
});
test('OAuth token endpoint rejects scope injection instead of silently issuing a credential',async()=>{
 const h=await setup();try{const p=await h.approve();const response=await h.form('/token',{...p.exchange,scope:'review:approve'});expect(response.status).toBe(400);expect(Number((await h.f.owner`SELECT count(*) AS n FROM allura.client_delegations WHERE group_id=${h.f.scope.groupId}`)[0].n)).toBe(0);expect((await h.form('/token',p.exchange)).status).toBe(200);
 }finally{await h.close();}
});
test('OAuth HTTP parser failures return bounded safe JSON without internal diagnostic spill',async()=>{
 const h=await setup();try{for(const path of ['/authorize','/token','/revoke']){const response=await fetch(h.config.issuer+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'token='+ 'x'.repeat(200000)});expect(response.headers.get('content-type')).toContain('application/json');expect(await response.json()).toEqual({error:'invalid_request'});expect(response.headers.get('cache-control')).toBe('no-store');}
 }finally{await h.close();}
});
test('OAuth exchange serializes with an in flight owner revocation before creating any connection',async()=>{
 const h=await setup();let release=()=>{};let revoke:Promise<unknown>|undefined;try{const p=await h.approve();let locked=()=>{};const acquired=new Promise<void>(resolve=>{locked=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 revoke=Promise.resolve(h.f.owner.begin(async tx=>{await tx`UPDATE allura.workspace_grants SET active=false WHERE group_id=${h.f.scope.groupId} AND principal_id=${h.f.ids.author}::uuid`;locked();await gate;}));await acquired;
 const pending=h.form('/token',p.exchange);let blocked=false;try{for(let i=0;i<50;i++){const [row]=await h.f.owner`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='allura_app' AND wait_event_type='Lock' AND query LIKE '%oauth_exchange%') AS blocked`;if(row.blocked){blocked=true;break;}await Bun.sleep(10);}expect(blocked).toBe(true);}finally{release();await revoke;}
 expect((await pending).status).toBe(400);expect(Number((await h.f.owner`SELECT count(*) AS n FROM allura.client_delegations WHERE group_id=${h.f.scope.groupId}`)[0].n)).toBe(0);
 }finally{release();await revoke;await h.close();}
});
test('OAuth pending requests are bounded and expired state is cleaned without background work',async()=>{
 const h=await setup();try{for(let i=0;i<100;i++){const response=await fetch(h.config.issuer+'/authorize?'+new URLSearchParams({client_id:h.config.client.clientId,redirect_uri:h.config.client.redirectUris[0]!,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(String(i)).digest('base64url'),resource:h.config.resource,scope:'memory:read'}),{redirect:'manual'});if(response.status!==302){expect(response.status).toBe(400);break;}}
 const count=Number((await h.f.owner`SELECT count(*) AS n FROM allura.oauth_transactions`)[0].n);expect(count).toBe(100);
 await h.f.owner`UPDATE allura.oauth_transactions SET expires_at=clock_timestamp()-interval '1 second',code_expires_at=clock_timestamp()-interval '1 second'`;
 // Keep the SDK rate limit intact; exercise expiry cleanup through the same
 // restricted SQL transition without waiting for or bypassing its HTTP timer.
 await h.f.app`SELECT allura.oauth_begin(${createHash('sha256').update(randomBytes(32)).digest('hex')},${{clientId:h.config.client.clientId,redirectUri:h.config.client.redirectUris[0],resource:h.config.resource,actions:['memory:read'],challenge:createHash('sha256').update('synthetic').digest('base64url')}}::jsonb)`;expect(Number((await h.f.owner`SELECT count(*) AS n FROM allura.oauth_transactions`)[0].n)).toBe(1);
 }finally{await h.close();}
});
test('OAuth token revocation is registration bound nonenumerating and immediately denies MCP',async()=>{
 const h=await setup();try{const {token}=await h.issue();expect((await h.mcp(token)).status).toBe(200);
  const digest=createHash('sha256').update(token).digest('hex'),cached=await authenticateMachine(token,async d=>(await h.f.app`SELECT allura.oauth_lookup(${d},${h.config.resource}) AS credential`)[0].credential as MachineCredential);
  await h.f.owner`UPDATE allura.oauth_credentials SET client_id='another-registration' WHERE credential_id=(SELECT id FROM allura.machine_credentials WHERE digest=decode(${digest},'hex'))`;expect((await h.form('/revoke',{client_id:h.config.client.clientId,token})).status).toBe(200);expect((await h.f.owner`SELECT revoked FROM allura.machine_credentials WHERE digest=decode(${digest},'hex')`)[0].revoked).toBe(false);
  await h.f.owner`UPDATE allura.oauth_credentials SET client_id=${h.config.client.clientId} WHERE credential_id=(SELECT id FROM allura.machine_credentials WHERE digest=decode(${digest},'hex'))`;
  expect((await h.form('/revoke',{client_id:h.config.client.clientId,token})).status).toBe(200);await expect(scopedTransaction(h.f.app,cached,h.f.scope,'memory:read',async()=>true)).rejects.toThrow();
  expect((await h.mcp(token)).status).toBe(401);
  expect((await h.form('/revoke',{client_id:h.config.client.clientId,token:randomBytes(32).toString('base64url')})).status).toBe(200);
 }finally{await h.close();}
});
