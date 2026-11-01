import { type SQL } from 'bun';
import { type Route, SerializedJsonReply } from './gateway.ts';
import { authorizeWorkScope, readWorkItem, transitionWorkItem, authorizeWorkProject, listWorkItems, createWorkItem } from './work-plane.ts';
import { parseWorkTransition, workContract, workText, WorkPlaneError, parseWorkList, parseWorkCreate, workNumberLexeme } from './work-plane-contract.ts';

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
export function parseWorkCreateBody(text:string):Record<string,unknown>{
 const invalid=():never=>{throw new WorkPlaneError('invalid');};
 if(typeof text!=='string'||Buffer.byteLength(text)>65536||text.includes('\0')||Buffer.from(text).toString('utf8')!==text){return invalid();}
 let at=0,nodes=0;const whitespace=()=>{while(at<text.length&&/[ \t\r\n]/.test(text[at]!)){at++;}};
 const string=()=>{const re=/"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;re.lastIndex=at;const m=re.exec(text);if(!m){return invalid();}at=re.lastIndex;const s=JSON.parse(m[0]) as string;if(s.includes('\0')||Buffer.from(s).toString('utf8')!==s){return invalid();}return s;};
 const value=(depth:number):unknown=>{
  if(++nodes>16384){return invalid();}whitespace();
  if(text[at]==='"'){return string();}
  for(const [literal,v] of [['null',null],['true',true],['false',false]] as const){if(text.startsWith(literal,at)){at+=literal.length;return v;}}
  if(text[at]==='{'||text[at]==='['){
   if(depth>9){return invalid();}const array=text[at++]==='[',end=array?']':'}',out:Record<string,unknown>=Object.create(null),items:unknown[]=[];whitespace();
   if(text[at]!==end){while(true){
    if(array){items.push(value(depth+1));}else{const k=string();if(Object.hasOwn(out,k)){return invalid();}whitespace();if(text[at++]!==':'){return invalid();}out[k]=value(depth+1);}
    whitespace();if(text[at]!==','){break;}at++;whitespace();
   }}
   if(text[at++]!==end){return invalid();}return array?items:out;
  }
  const number=/-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;number.lastIndex=at;const m=number.exec(text);if(!m){return invalid();}at=number.lastIndex;return workNumberLexeme(m[0]);
 };
 const v=value(1);whitespace();if(at!==text.length||!v||typeof v!=='object'||Array.isArray(v)){return invalid();}
 const allowed=['group_id','workspace_id','operation_key','project_id','title','description','priority','owner_id','lane_id','acceptance_criteria'];if(Object.keys(v).some(k=>!allowed.includes(k))){return invalid();}
 parseWorkCreate({...v,contract:workContract,command:'create',actor_id:'11111111-1111-4111-8111-111111111111'});
 return v as Record<string,unknown>;
}
export function createWorkRoutes(sql:SQL,cursorKey:Uint8Array):Route[]{
 const createGuard:NonNullable<Route['admission']>=async c=>{
  if(c.request.headers.get('X-Allura-Work-Contract')!==workContract){throw new WorkPlaneError('invalid');}
  const raw=new URL(c.request.url).search;
  try{for(const pair of raw.slice(1).split('&')){for(const part of pair.split('=')){decodeURIComponent(part.replaceAll('+',' '));}}}catch{throw new WorkPlaneError('invalid');}
  const q=new URLSearchParams(raw);if([...q.keys()].some(k=>!['group_id','workspace_id'].includes(k))||q.getAll('group_id').length!==1||q.getAll('workspace_id').length!==1){throw new WorkPlaneError('invalid');}
  await authorizeWorkScope(sql,c.identity,c.scope,true,c.authority.principalId);
 };
 const create:Route={path:'/api/work-items',method:'POST',identity:'human',action:'memory:read',timeoutStatus:503,parseBody:parseWorkCreateBody,admission:createGuard,disclosure:async c=>{await createGuard(c);await authorizeWorkProject(sql,c.identity,c.scope,c.body!.project_id as string,c.authority.principalId);},handle:async c=>{
  const result=await createWorkItem(sql,c.identity,c.scope,{...c.body,contract:workContract,command:'create',actor_id:c.authority.principalId},c.authority.principalId);
  return new SerializedJsonReply(result.body,result.status);
 }};
 const guard:NonNullable<Route['admission']>=async c=>{
  if(c.request.headers.get('X-Allura-Work-Contract')!==workContract){throw new WorkPlaneError('invalid');}
  const v=parseWorkList(new URL(c.request.url).search);
  await authorizeWorkProject(sql,c.identity,c.scope,v.project_id,c.authority.principalId);
  if(v.lane_id!==null){throw new WorkPlaneError('not_found');}
 };
 const list:Route={path:'/api/work-items',method:'GET',identity:'human',action:'memory:read',timeoutStatus:503,admission:guard,disclosure:guard,handle:async c=>new SerializedJsonReply(await listWorkItems(sql,c.identity,c.scope,new URL(c.request.url).search,cursorKey,c.authority.principalId))};
 return [list,create,...(['GET','POST'] as const).map((method):Route=>{
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
 })];
}
