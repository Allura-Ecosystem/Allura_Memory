import {createHash} from 'node:crypto';
export const BUMBLEBEE=Object.freeze({repository:'perplexityai/bumblebee',version:'0.1.2',commit:'cc57710eeaf685e7b89924a36c8583cad0a378fe',schema:'0.1.0',license:'Apache-2.0',leaseSeconds:600,maxWireBytes:4194304,maxLineBytes:65536,maxRecords:2048,maxRoots:8,maxCatalogEntries:128,maxScanSeconds:30});
type Root=Readonly<{digest:string;kind:'project_root'|'user_package_root'|'global_package_root'}>;
export type BumblebeeSource=Readonly<{sourceId:string;endpointId:string;profile:'baseline'|'project';roots:readonly Root[];ecosystems:readonly ('npm'|'pypi')[];catalogRevisionId:string|null}>;
function valid(v:unknown):asserts v{if(!v){throw new Error('bumblebee_invalid');}}
function object(v:unknown,keys:readonly string[]):Record<string,unknown>{valid(v!==null&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;valid(Object.keys(r).length===keys.length&&Object.keys(r).every(k=>keys.includes(k)));return r;}
function dense(v:unknown,min:number,max:number):unknown[]{valid(Array.isArray(v)&&v.length>=min&&v.length<=max);for(let i=0;i<v.length;i++){valid(Object.hasOwn(v,i));}return v;}
function uuid(v:unknown):string{valid(typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v));return v;}
function digest(v:unknown):string{valid(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v));return v;}
function integer(v:unknown,min=0):number{valid(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min);return v;}
export function parseBumblebeeSource(value:unknown):BumblebeeSource{
 const v=object(value,['sourceId','endpointId','profile','roots','ecosystems','catalogRevisionId']);valid(v.profile==='baseline'||v.profile==='project');
 const roots=dense(v.roots,1,BUMBLEBEE.maxRoots).map(item=>{const r=object(item,['digest','kind']);valid(v.profile==='project'?r.kind==='project_root':r.kind==='user_package_root'||r.kind==='global_package_root');return Object.freeze({digest:digest(r.digest),kind:r.kind as Root['kind']});});valid(new Set(roots.map(r=>r.digest)).size===roots.length);roots.sort((a,b)=>a.digest.localeCompare(b.digest));
 const ecosystems=dense(v.ecosystems,1,2).map(e=>{valid(e==='npm'||e==='pypi');return e;});valid(new Set(ecosystems).size===ecosystems.length);ecosystems.sort();
 return Object.freeze({sourceId:uuid(v.sourceId),endpointId:uuid(v.endpointId),profile:v.profile,roots:Object.freeze(roots),ecosystems:Object.freeze(ecosystems),catalogRevisionId:v.catalogRevisionId===null?null:uuid(v.catalogRevisionId)});
}
// Catalog identity is separately lease-bound: changing it must not merge/retire a different population.
export function populationDigest(input:BumblebeeSource):string{const s=parseBumblebeeSource(input);return createHash('sha256').update(JSON.stringify([s.sourceId,s.endpointId,s.profile,s.roots,s.ecosystems])).digest('hex');}
export function parseLeaseRequest(value:unknown):Readonly<{sourceRevision:number;operationKey:string}>{const v=object(value,['sourceRevision','operationKey']);valid(typeof v.operationKey==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v.operationKey));return Object.freeze({sourceRevision:integer(v.sourceRevision,1),operationKey:v.operationKey});}
// Route classification only. Callers MUST independently authenticate and lock current source authority.
export function credentialRoute(audience:string,method:string,path:string):boolean{return method==='POST'&&((audience==='bumblebee_runner'&&path==='/api/bumblebee/lease')||(audience==='bumblebee_ingest'&&path==='/api/bumblebee/ingest'));}
// This is a post-validation predicate, never proof of authenticity, provenance, or durable acceptance.
export function routineEligible(input:BumblebeeSource,value:unknown,generation:number,currentGeneration:number):boolean{
 const s=parseBumblebeeSource(input);integer(generation,1);integer(currentGeneration);
 const v=object(value,['profile','status','rootDigests','packageCount','receivedPackages','findingCount','receivedFindings','suppressed','diagnostics','timedOut']);valid(['baseline','project'].includes(v.profile as string));valid(['complete','partial','error'].includes(v.status as string));valid(typeof v.timedOut==='boolean');
 const roots=dense(v.rootDigests,0,BUMBLEBEE.maxRoots).map(digest).sort();valid(new Set(roots).size===roots.length);for(const k of ['packageCount','receivedPackages','findingCount','receivedFindings','suppressed','diagnostics']){valid(integer(v[k])<=BUMBLEBEE.maxRecords);}
 return v.profile===s.profile&&v.status==='complete'&&!v.timedOut&&v.suppressed===0&&v.diagnostics===0&&v.packageCount===v.receivedPackages&&v.findingCount===v.receivedFindings&&(v.findingCount===0||s.catalogRevisionId!==null)&&JSON.stringify(roots)===JSON.stringify(s.roots.map(r=>r.digest))&&generation>currentGeneration;
}
const modules=Object.freeze({bumblebee:Object.freeze(['evidence:read','health:read']), 'memory-review':Object.freeze(['review:read'])});
export type ModuleDescriptor=Readonly<{id:keyof typeof modules;version:'1.0.0';core:'allura-core-v1';dependencies:readonly string[];capabilities:readonly string[];enabled:true}>;
function moduleDescriptor(value:unknown):ModuleDescriptor{
 const v=object(value,['id','version','core','dependencies','capabilities','enabled']);valid(typeof v.id==='string'&&Object.hasOwn(modules,v.id));valid(v.version==='1.0.0'&&v.core==='allura-core-v1'&&v.enabled===true);dense(v.dependencies,0,0);
 const id=v.id as keyof typeof modules,caps=dense(v.capabilities,1,2);valid(caps.every(c=>typeof c==='string'&&modules[id].includes(c))&&new Set(caps).size===caps.length);valid(caps.length===modules[id].length);
 return Object.freeze({id,version:v.version,core:v.core,dependencies:Object.freeze([]),capabilities:Object.freeze([...(caps as string[])].sort()),enabled:true});
}
export function moduleRegistry(value:unknown,granted:readonly string[]):Readonly<{available:readonly ModuleDescriptor[];unavailable:readonly Readonly<{index:number;reason:'unavailable'}>[]} >{
 const input=dense(value,0,16),counts=new Map<string,number>();for(const v of input){if(v&&typeof v==='object'&&'id'in v&&typeof v.id==='string'){counts.set(v.id,(counts.get(v.id)??0)+1);}}
 const available:ModuleDescriptor[]=[],unavailable:Readonly<{index:number;reason:'unavailable'}>[]=[];
 input.forEach((v,index)=>{try{const m=moduleDescriptor(v);valid(counts.get(m.id)===1&&m.capabilities.every(c=>granted.includes(c)));available.push(m);}catch{unavailable.push(Object.freeze({index,reason:'unavailable'}));}});
 return Object.freeze({available:Object.freeze(available),unavailable:Object.freeze(unavailable)});
}
