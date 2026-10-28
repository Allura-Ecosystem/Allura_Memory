import {type SQL} from 'bun';
import {createHash} from 'node:crypto';
import {type Identity} from './authentication.ts';
import {AuthorityError,resolveAuthority,type Scope,type Action} from './authority.ts';
import {DatabaseStore,scopedTransaction} from './persistence.ts';
import {moduleRegistry} from './bumblebee-contract.ts';
export class AppModuleError extends Error {constructor(readonly code:'invalid'|'forbidden'|'not_found'|'conflict'|'unknown'){super(`app_${code}`);}}
function check(v:unknown):asserts v{if(!v){throw new AppModuleError('invalid');}}
function object(v:unknown,keys:readonly string[]):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;check(Object.keys(r).length===keys.length&&Object.keys(r).every(k=>keys.includes(k)));return r;}
function uuid(v:unknown):string{check(typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v));return v;}
function integer(v:unknown):number{check(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<2147483647);return v;}
const definitions=Object.freeze({bumblebee:{title:'Review package concerns',capabilities:['evidence:read','health:read'] as const},'memory-review':{title:'Review proposed knowledge',capabilities:['review:read'] as const}});
export function appRelease(id:unknown,version:unknown){
 check(typeof id==='string'&&Object.hasOwn(definitions,id));check(version==='1.0.0'||version==='1.0.1');const name=id as keyof typeof definitions,d=definitions[name];
 return Object.freeze({id:name,version,core:'allura-core-v1' as const,schema:1,owner:'Allura built-in',title:d.title,changes:version==='1.0.0'?'Initial bounded shared view':'Compatible presentation update; no additional access',capabilities:Object.freeze([...d.capabilities]),dependencies:Object.freeze([] as string[])});
}
function command(value:unknown){
 const v=object(value,['appId','version','enabled','configuration','expectedRevision','rationale','evidenceIds','operationKey']),release=appRelease(v.appId,v.version);check(typeof v.enabled==='boolean');const c=object(v.configuration,release.id==='bumblebee'?['sourceId']:[]),configuration=release.id==='bumblebee'?{sourceId:c.sourceId===null?null:uuid(c.sourceId)}:{};
 check(typeof v.rationale==='string'&&v.rationale.trim().length>0&&Buffer.byteLength(v.rationale)<=4000&&!v.rationale.includes('\0')&&Buffer.from(v.rationale).toString()===v.rationale);check(typeof v.operationKey==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v.operationKey));check(Array.isArray(v.evidenceIds)&&v.evidenceIds.length>0&&v.evidenceIds.length<=32);for(let i=0;i<v.evidenceIds.length;i++){check(Object.hasOwn(v.evidenceIds,i));}const evidenceIds=v.evidenceIds.map(uuid).sort();check(new Set(evidenceIds).size===evidenceIds.length);
 return {appId:release.id,version:release.version,enabled:v.enabled,configuration,expectedRevision:integer(v.expectedRevision),rationale:v.rationale,evidenceIds,operationKey:v.operationKey};
}
async function safe<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(e){if(e instanceof AuthorityError||e instanceof AppModuleError){throw e;}const m=e instanceof Error?e.message:'';if(m==='invalid'||m==='forbidden'||m==='not_found'||m==='conflict'){throw new AppModuleError(m);}throw new AppModuleError('unknown');}}
export async function configureApp(sql:SQL,identity:Identity,scope:Scope,value:unknown):Promise<string>{
 if(identity.kind!=='human'){throw new AppModuleError('forbidden');}const input=command(value),digest=createHash('sha256').update(JSON.stringify(['app-module-v1',scope,input])).digest('hex');
 return safe(()=>scopedTransaction(sql,identity,scope,'workspace:grants:manage',async tx=>{const [r]=await tx`SELECT allura.configure_app_module(${scope.groupId},${scope.workspaceId}::uuid,${input}::jsonb,${digest}) AS receipt`;return r.receipt as string;}));
}
export type AppView={id:string;version:string;revision:number;enabled:boolean;configuration:Record<string,unknown>|null;state:'available'|'disabled'|'unavailable';release:ReturnType<typeof appRelease>|null};
export async function readApps(sql:SQL,identity:Identity,scope:Scope):Promise<AppView[]>{
 if(identity.kind!=='human'){throw new AppModuleError('forbidden');}
 return safe(()=>scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
  const [r]=await tx`SELECT allura.read_app_modules(${scope.groupId},${scope.workspaceId}::uuid) AS apps`;const result:AppView[]=[];
  for(const row of r.apps as {id:string;version:string;revision:number;enabled:boolean;configuration:Record<string,unknown>}[]){
   try{const release=appRelease(row.id,row.version),granted:string[]=[];for(const action of release.capabilities){try{await resolveAuthority(identity,scope,action as Action,new DatabaseStore(tx));granted.push(action);}catch(e){if(!(e instanceof AuthorityError)){throw e;}}}
    const accepted=moduleRegistry([{id:release.id,version:release.version,core:release.core,dependencies:release.dependencies,capabilities:release.capabilities,enabled:true}],granted).available.length===1;
    result.push({...row,configuration:accepted?row.configuration:null,state:!row.enabled?'disabled':accepted?'available':'unavailable',release});
   }catch{result.push({...row,configuration:null,state:'unavailable',release:null});}
  }return result;
 }));
}
