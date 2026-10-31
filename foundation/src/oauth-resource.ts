import {type LocalOAuthProvider} from './oauth-provider.ts';
// Scope derivation never replaces gateway authentication/current SQL authority.
export function oauthResource(provider:LocalOAuthProvider,next:(request:Request)=>Promise<Response>){
 return async(request:Request):Promise<Response>=>{
  const url=new URL(request.url);
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
}
