import {type Route} from './gateway.ts';
import {AuthorityError} from './authority.ts';
import {LocalOAuthProvider,oauthDigest,oauthSecret} from './oauth-provider.ts';
import {selectedConsent,selectedRevoke} from './selected-client.ts';
export function createSelectedClientRoutes(provider:LocalOAuthProvider):Route[]{
 const routes:Route[]=(['GET','POST'] as const).map(method=>({path:'/api/oauth/selected-consent',method,identity:'human',action:'tenant:member',handle:async({identity,scope,request,body})=>{
  const url=new URL(request.url),transaction=url.searchParams.get('transaction');
  if(identity.kind!=='human'||request.headers.has('authorization')||url.searchParams.getAll('transaction').length!==1||!transaction||!/^[A-Za-z0-9_-]{43}$/.test(transaction)){throw new AuthorityError('invalid');}
  const sessionDigest=oauthDigest(JSON.stringify([identity.issuer,identity.subject,request.headers.get('Cf-Access-Jwt-Assertion'),request.headers.get('cookie')])),nonce=method==='GET'?oauthSecret():body?.nonce,code=oauthSecret();
  if(typeof nonce!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(nonce)){throw new AuthorityError('invalid');}
  if(method==='POST'&&(!body||Object.keys(body).length!==11||Object.keys(body).some(k=>!['clientId','name','redirectUri','actions','groupId','workspaceId','transaction','nonce','mode','connectionId','decision'].includes(k))||body.groupId!==scope.groupId||body.workspaceId!==scope.workspaceId||body.transaction!==transaction||body.name!==provider.config.client.name||body.mode!=='selected'||typeof body.connectionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.connectionId)||typeof body.decision!=='string'||!['approve','cancel'].includes(body.decision)||typeof body.clientId!=='string'||typeof body.redirectUri!=='string'||!Array.isArray(body.actions)||body.actions.length!==1||body.actions[0]!=='memory:selected:read')){throw new AuthorityError('invalid');}
  const input=method==='GET'?{kind:'display',sessionDigest,nonceDigest:oauthDigest(nonce)}:{kind:body!.decision,sessionDigest,nonceDigest:oauthDigest(nonce),codeDigest:oauthDigest(code),clientId:body!.clientId,redirectUri:body!.redirectUri,actions:body!.actions,mode:body!.mode,connectionId:body!.connectionId};
  const result=await selectedConsent(provider.sql,identity,scope,oauthDigest(transaction),input);
  if(method==='GET'){return {clientId:result.clientId,name:provider.config.client.name,redirectUri:result.redirectUri,actions:result.actions,groupId:scope.groupId,workspaceId:scope.workspaceId,transaction,nonce,mode:result.mode,connectionId:result.connectionId};}
  const redirect=new URL(result.redirectUri);if(result.state!==null){redirect.searchParams.set('state',result.state);}redirect.searchParams.set(body!.decision==='approve'?'code':'error',body!.decision==='approve'?code:'access_denied');return {redirect:redirect.href,connectionId:result.connectionId};
 }}));
 routes.push({path:'/api/oauth/selected-connections/revoke',method:'POST',identity:'human',action:'tenant:member',handle:async({identity,scope,body})=>{
  if(!body||Object.keys(body).length!==1||typeof body.connectionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.connectionId)){throw new AuthorityError('invalid');}
  await selectedRevoke(provider.sql,identity,scope,body.connectionId);return {outcome:'revoked'};
 }});return routes;
}
