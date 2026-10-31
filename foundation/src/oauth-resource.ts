import {type LocalOAuthProvider} from './oauth-provider.ts';
// Scope derivation never replaces gateway authentication/current SQL authority.
export function oauthResource(provider:LocalOAuthProvider,next:(request:Request)=>Promise<Response>){
 const handle=async(request:Request):Promise<Response>=>{
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/.well-known/oauth-protected-resource/mcp'){
   return Response.json({resource:provider.config.resource,authorization_servers:[provider.config.issuer],scopes_supported:provider.config.client.actions,bearer_methods_supported:['header']},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(url.pathname!=='/mcp'){return next(request);}
  const token=request.headers.get('authorization');
  if(!token?.startsWith('Bearer ')){return next(request);}
  try{
   if(!await provider.isOAuthToken(token.slice(7))){return next(request);}
   const verified=await provider.verifyAccessToken(token.slice(7));
   for(const [key,value] of [['group_id',verified.extra.groupId],['workspace_id',verified.extra.workspaceId]] as const){const supplied=url.searchParams.getAll(key);if(supplied.length>1||(supplied.length===1&&supplied[0]!==value)){return Response.json({outcome:'forbidden'},{status:403,headers:{'Cache-Control':'no-store'}});}url.searchParams.set(key,value);}
   return next(new Request(url.href,request));
  }catch{
   return Response.json({outcome:'unauthenticated'},{status:401,headers:{'Cache-Control':'no-store'}});
  }
 };
 const metadataUrl=new URL('/.well-known/oauth-protected-resource/mcp',provider.config.resource).href;
 return async(request:Request):Promise<Response>=>{
  const response=await handle(request);
  if(response.status===401&&new URL(request.url).pathname==='/mcp'&&(request.method==='GET'||request.method==='POST')){
   response.headers.set('WWW-Authenticate',`Bearer resource_metadata="${metadataUrl}"`);
  }
  return response;
 };
}
