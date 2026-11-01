import { type SQL } from 'bun';
import { type Route, SerializedJsonReply } from './gateway.ts';
import { authorizeWorkScope, readWorkItem, transitionWorkItem } from './work-plane.ts';
import { parseWorkTransition, workContract, workText, WorkPlaneError } from './work-plane-contract.ts';

// Fixed flat wire grammar: scan decoded keys before constructing an object.
// The gateway owns byte bounds, fatal UTF8 decoding and authenticated admission.
export function parseWorkBody(text:string):Record<string,unknown>{
 const invalid=():never=>{throw new WorkPlaneError('invalid');};
 if(Buffer.byteLength(text)>65536||text.includes('\0')){return invalid();}
 let at=0;const seen=new Set<string>();
 const whitespace=()=>{while(at<text.length&&/[ \t\r\n]/.test(text[at]!)){at++;}};
 const string=()=>{const match=/"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;match.lastIndex=at;const value=match.exec(text);if(!value){return invalid();}at=match.lastIndex;const decoded=JSON.parse(value[0]) as string;if(decoded.includes('\0')||Buffer.from(decoded).toString('utf8')!==decoded){return invalid();}return decoded;};
 whitespace();if(text[at++]!=='{'){return invalid();}whitespace();
 if(text[at]!=='}'){
  while(true){
   const key=string();if(!['group_id','workspace_id','actor_id','operation_key','expected_updated_at','to_status','reason','evidence_id'].includes(key)||seen.has(key)){return invalid();}seen.add(key);
   whitespace();if(text[at++]!==':'){return invalid();}whitespace();
   if(text[at]==='"'){string();}else if(text.slice(at,at+4)==='null'){at+=4;}else{return invalid();}
   whitespace();if(text[at]!==','){break;}at++;whitespace();
  }
 }
 if(text[at++]!=='}'){return invalid();}whitespace();if(at!==text.length){return invalid();}
 const value=JSON.parse(text) as Record<string,unknown>;
 parseWorkTransition({...value,contract:workContract,command:'transition'});
 return value;
}
export function createWorkRoutes(sql:SQL):Route[]{
 return (['GET','POST'] as const).map(method=>{
  const write=method==='POST';
  const guard:NonNullable<Route['admission']>=async c=>{
   const query=new URL(c.request.url).searchParams;
   if(c.request.headers.get('X-Allura-Work-Contract')!==workContract||[...query.keys()].some(k=>!['group_id','workspace_id'].includes(k))||!workText(c.params.id,256)){throw new WorkPlaneError('invalid');}
   await authorizeWorkScope(sql,c.identity,c.scope,write,c.authority.principalId);
  };
  return {path:write?'/api/work-items/:id/transition':'/api/work-items/:id',dynamic:true,method,identity:'human',action:'memory:read',timeoutStatus:503,parseBody:parseWorkBody,admission:guard,disclosure:guard,handle:async c=>{
   if(write){
    const value=c.body!;
    if(value.group_id!==c.scope.groupId||value.workspace_id!==c.scope.workspaceId){throw new WorkPlaneError('invalid');}
    if(value.actor_id!==c.authority.principalId){throw new WorkPlaneError('forbidden');}
    return new SerializedJsonReply(await transitionWorkItem(sql,c.identity,c.scope,c.params.id!,{...value,contract:workContract,command:'transition'},c.authority.principalId));
   }
   return new SerializedJsonReply(await readWorkItem(sql,c.identity,c.scope,c.params.id!,c.authority.principalId));
  }};
 });
}
