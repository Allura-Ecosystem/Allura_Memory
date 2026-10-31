import {type Route} from './gateway.ts';
import {AuthorityError} from './authority.ts';
import {scopedTransaction} from './persistence.ts';
import {LocalOAuthProvider,oauthDigest,oauthSecret} from './oauth-provider.ts';
export function createOAuthConsentRoutes(provider:LocalOAuthProvider):Route[]{
 const routes:Route[]=(['GET','POST'] as const).map(method=>({path:'/api/oauth/consent',method,identity:'human',action:'workspace:grants:manage',handle:async context=>{
  const {identity,scope,request,body}=context,url=new URL(request.url),transaction=url.searchParams.get('transaction');
  if(identity.kind!=='human'||request.headers.has('authorization')||url.searchParams.getAll('transaction').length!==1||!transaction||!/^[A-Za-z0-9_-]{43}$/.test(transaction)){throw new AuthorityError('invalid');}
  const sessionDigest=oauthDigest(JSON.stringify([identity.issuer,identity.subject,request.headers.get('Cf-Access-Jwt-Assertion'),request.headers.get('cookie')])),nonce=method==='GET'?oauthSecret():body?.nonce,code=oauthSecret();
  if(typeof nonce!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(nonce)){throw new AuthorityError('invalid');}
  if(method==='POST'&&(!body||Object.keys(body).length!==9||Object.keys(body).some(k=>!['clientId','name','redirectUri','actions','groupId','workspaceId','transaction','nonce','decision'].includes(k))||body.groupId!==scope.groupId||body.workspaceId!==scope.workspaceId||body.transaction!==transaction||body.name!==provider.config.client.name||!['approve','cancel'].includes(String(body.decision)))){throw new AuthorityError('invalid');}
  const input=method==='GET'?{kind:'display',sessionDigest,nonceDigest:oauthDigest(nonce)}:{kind:body!.decision,sessionDigest,nonceDigest:oauthDigest(nonce),codeDigest:oauthDigest(code),clientId:body!.clientId,redirectUri:body!.redirectUri,actions:body!.actions};
  let result:{clientId:string;redirectUri:string;actions:string[];state:string|null};
  try{result=await scopedTransaction(provider.sql,identity,scope,'workspace:grants:manage',async tx=>{const [row]=await tx`SELECT allura.oauth_consent(${scope.groupId},${scope.workspaceId}::uuid,${oauthDigest(transaction)},${input}::jsonb) AS result`;return row.result;});}catch{throw new AuthorityError('forbidden');}
  if(method==='GET'){return {clientId:result.clientId,name:provider.config.client.name,redirectUri:result.redirectUri,actions:result.actions,groupId:scope.groupId,workspaceId:scope.workspaceId,transaction,nonce};}
  const redirect=new URL(result.redirectUri);if(result.state!==null){redirect.searchParams.set('state',result.state);}redirect.searchParams.set(body!.decision==='approve'?'code':'error',body!.decision==='approve'?code:'access_denied');return {redirect:redirect.href};
 }}));
 routes.push({path:'/api/oauth/connections/revoke',method:'POST',identity:'human',action:'workspace:grants:manage',handle:async({identity,scope,body,request})=>{
  if(request.headers.has('authorization')||!body||Object.keys(body).length!==1||typeof body.connectionId!=='string'||!/^[0-9a-f-]{36}$/.test(body.connectionId)){throw new AuthorityError('invalid');}
  try{await scopedTransaction(provider.sql,identity,scope,'workspace:grants:manage',async tx=>{await tx`SELECT allura.oauth_revoke_connection(${scope.groupId},${scope.workspaceId}::uuid,${body.connectionId as string}::uuid)`;});return {outcome:'revoked'};}catch{throw new AuthorityError('forbidden');}
 }});
 return routes;
}
