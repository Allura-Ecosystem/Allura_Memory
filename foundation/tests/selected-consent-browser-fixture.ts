import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {type OAuthClientProvider,UnauthorizedError} from '@modelcontextprotocol/sdk/client/auth.js';
import {type OAuthTokens} from '@modelcontextprotocol/sdk/shared/auth.js';
import {type FetchLike} from '@modelcontextprotocol/sdk/shared/transport.js';
import {capture} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {fixture} from './lifecycle-fixture.ts';
import {runBrowserScenario} from './browser-runtime.ts';
import {buildDashboard} from '../scripts/build-dashboard.ts';
import {createDashboardHandler} from '../src/dashboard-server.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {loadLocalEmbedder} from '../src/embedding.ts';
import {LocalOAuthProvider} from '../src/oauth-provider.ts';
import {startOAuthHttp,stopOAuthHttp} from '../src/oauth-http.ts';
import {type OAuthConfig} from '../src/core-config.ts';
export async function selectedConsentBrowser(){
 const f=await fixture(`allura-selected-browser-${randomUUID()}`),dir=await mkdtemp(join(tmpdir(),'allura-selected-browser-'));
 let core:ReturnType<typeof Bun.serve>|undefined,callback:ReturnType<typeof Bun.serve>|undefined,issuer:Awaited<ReturnType<typeof startOAuthHttp>>|undefined;
 let loseResponse:'GET'|'POST'|undefined;
 let delayResponse:'GET'|'POST'|undefined,releaseResponse:(()=>void)|undefined;let delayed=false;
 const release=()=>{releaseResponse?.();releaseResponse=undefined;};
 const callbacks:{url:string;referrer:string|null}[]=[],witness:{path:string;method:string;status:number}[]=[];
 const close=async()=>{release();await core?.stop(true);await callback?.stop(true);if(issuer){await stopOAuthHttp(issuer);}await f.close();await rm(dir,{recursive:true,force:true});};
 try{
  const cert=join(dir,'cert.pem'),key=join(dir,'key.pem');if(Bun.spawnSync(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdout:'pipe',stderr:'pipe'}).exitCode!==0){throw new Error('fixture_tls_unavailable');}
  const ca=await readFile(cert,'utf8'),assets=join(dir,'assets');await buildDashboard(assets);
  let handler:(r:Request)=>Promise<Response>=async()=>new Response(null,{status:503});
  core=Bun.serve({hostname:'127.0.0.1',port:0,tls:{cert:Bun.file(cert),key:Bun.file(key)},fetch:async r=>{const response=await handler(r);witness.push({path:new URL(r.url).pathname,method:r.method,status:response.status});if(new URL(r.url).pathname==='/api/oauth/selected-consent'&&r.method===delayResponse){delayResponse=undefined;delayed=true;await new Promise<void>(resolve=>{releaseResponse=resolve;});}if(new URL(r.url).pathname==='/api/oauth/selected-consent'&&r.method===loseResponse){loseResponse=undefined;return Response.error();}return response;}});
  const origin=`https://127.0.0.1:${core.port}`;
  callback=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>{callbacks.push({url:r.url,referrer:r.headers.get('referer')});return new Response('Return to your requesting client.',{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});}});
  const redirect=`http://127.0.0.1:${callback.port}/callback`,reservation=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response(null)}),port=reservation.port!;await reservation.stop(true);
  const config:OAuthConfig={host:'127.0.0.1',port,issuer:`http://127.0.0.1:${port}`,resource:'https://core.invalid/mcp',consentOrigin:origin,client:{clientId:'synthetic-browser',name:'Synthetic <script>desktop</script>',redirectUris:[redirect],actions:['memory:selected:read']}};
  const provider=new LocalOAuthProvider(f.app,config);issuer=await startOAuthHttp(config,provider);
  const embedder=await loadLocalEmbedder();handler=await createDashboardHandler(createCoreGateway(f.app,f.humanConfig,origin,randomBytes(32),embedder,undefined,undefined,'human',provider),assets);
  const mappedFetch:FetchLike=async(input,init)=>{const request=new Request(input.toString(),init),url=new URL(request.url);if(url.username||url.password||url.hash){throw new Error('unowned_test_destination');}if(url.origin==='https://core.invalid'){url.protocol='https:';url.host=new URL(origin).host;}else if(url.origin!==config.issuer){throw new Error('unowned_test_destination');}return fetch(new Request(url.href,request),{redirect:'manual',tls:{ca}});};
  await f.owner`DELETE FROM allura.workspace_grants WHERE group_id=${f.scope.groupId} AND principal_id IN (${f.ids.viewer},${f.ids.curator})`;
  const content='Selected browser independently reviewed immutable synthetic content';
  const event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{content,idempotency_key:randomUUID()})).event_id as string;
  const proposal=await submitProposal(f.app,f.identities.machine,f.scope,{summary:content,evidenceIds:[event],assertionKind:'observation'});
  const decision=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:proposal.id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Independent synthetic exact review',evidenceIds:[event]}));
  if(decision.outcome!=='approved'){throw new Error('fixture_review_failed');}
  const id=decision.semantic_version_id as string;
  const share=await handler(new Request(origin+'/api/memory-shares/approve?'+new URLSearchParams({group_id:f.scope.groupId,workspace_id:f.scope.workspaceId}),{method:'POST',headers:{'Cf-Access-Jwt-Assertion':f.jwt('author'),Origin:origin,'Sec-Fetch-Site':'same-origin','content-type':'application/json'},body:JSON.stringify({recipientId:f.ids.viewer,memoryId:id,expectedRevision:0,operationKey:randomUUID()})}));
  if(share.status!==200){throw new Error('fixture_share_failed');}
  const [version]=await f.owner`SELECT created_at FROM allura.semantic_versions WHERE id=${id}::uuid`;
  const memory={id,content,created_at:version.created_at.toISOString() as string};
  const clock=Date.now;let expired:string;try{Date.now=()=>clock()-7200000;expired=f.jwt('viewer');}finally{Date.now=clock;}
  const begin=async()=>{
   let verifier:string|undefined,authorization:URL|undefined,tokens:OAuthTokens|undefined;const state=randomBytes(24).toString('base64url');
   const authProvider:OAuthClientProvider={redirectUrl:redirect,clientMetadata:{redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']},clientInformation:()=>({client_id:config.client.clientId,issuer:config.issuer}),state:()=>state,tokens:()=>tokens,saveTokens:value=>{tokens=value;},saveCodeVerifier:value=>{verifier=value;},codeVerifier:()=>{if(!verifier){throw new Error('missing_verifier');}return verifier;},redirectToAuthorization:url=>{authorization=url;}};
   const initial=new Client({name:'synthetic-browser-discovery',version:'1'}),transport=new StreamableHTTPClientTransport(new URL(config.resource),{authProvider,fetch:mappedFetch});
   try{await initial.connect(transport);throw new Error('expected_tokenless_challenge');}catch(error){if(!(error instanceof UnauthorizedError)){throw error;}}finally{await initial.close();}
   if(!authorization||tokens){throw new Error('missing_discovery');}
   return {authorization:authorization.href,state,authProvider,transport,mappedFetch};
  };
  return {delay:(method:'GET'|'POST')=>{delayResponse=method;delayed=false;},delayed:()=>delayed,release,f,dir,origin,config,memory,callbacks,witness,begin,lose:(method:'GET'|'POST')=>{loseResponse=method;},run:runBrowserScenario,close,data:{origin,scope:f.scope,foreignWorkspace:f.foreignWorkspace,client:config.client,redirect,tokens:{expired,author:f.jwt('author'),viewer:f.jwt('viewer'),curator:f.jwt('curator'),org:f.jwt('org'),reviewer:f.jwt('reviewer')}},disable:async(mode:'human'|'machine-only'='human')=>{handler=await createDashboardHandler(createCoreGateway(f.app,mode==='human'?f.humanConfig:undefined,origin,randomBytes(32),embedder,undefined,undefined,mode),assets,mode);}};
 }catch(error){await close();throw error;}
}
