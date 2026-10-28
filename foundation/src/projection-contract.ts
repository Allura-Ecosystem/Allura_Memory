import {createHash} from 'node:crypto';
import {type Scope,validScope} from './authority.ts';
export const PROJECTION=Object.freeze({notionVersion:'2026-03-11',maxAttempts:5,leaseMs:30000,requestMs:2000,maxResponseBytes:131072,maxContentBytes:12000});
export class ProjectionError extends Error{constructor(public readonly code:'invalid'|'forbidden'|'not_found'|'conflict'|'unknown'){super(`projection_${code}`);}}
function requireValid(v:unknown):asserts v{if(!v){throw new ProjectionError('invalid');}}
function object(v:unknown,keys:readonly string[]):Record<string,unknown>{requireValid(v!==null&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;requireValid(Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k)));return r;}
function uuid(v:unknown):string{requireValid(typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v));return v;}
function integer(v:unknown,min=0):number{requireValid(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min);return v;}
function property(v:unknown):string{requireValid(typeof v==='string'&&/^[A-Za-z0-9_%:-]{1,80}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v));return v;}
export type ProjectionDestination=Readonly<{id:string;revision:number;adapter:'notion-page-v1';origin:string;pageId:string;dataSourceId:string;contentProperty:string;bindingProperty:string}>;
// Parsing is not enrollment or transfer authority. Fixture mode is server-owned, never a request field.
export function parseDestination(value:unknown,fixture=false):ProjectionDestination{
 const v=object(value,['id','revision','adapter','origin','pageId','dataSourceId','contentProperty','bindingProperty']);requireValid(v.adapter==='notion-page-v1');
 requireValid(typeof v.origin==='string');const loopback=/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(v.origin);requireValid(v.origin==='https://api.notion.com'||(fixture===true&&loopback&&Number(loopback[1])<=65535));
 const contentProperty=property(v.contentProperty),bindingProperty=property(v.bindingProperty);requireValid(contentProperty!==bindingProperty);
 return Object.freeze({id:uuid(v.id),revision:integer(v.revision,1),adapter:v.adapter,origin:v.origin,pageId:uuid(v.pageId),dataSourceId:uuid(v.dataSourceId),contentProperty,bindingProperty});
}
export type ProjectionEnvelope=Readonly<{destination:ProjectionDestination;semanticVersionId:string;decisionId:string;version:number;content:string;digest:string;binding:string}>;
export function projectionEnvelope(scope:Scope,destination:ProjectionDestination,source:unknown):ProjectionEnvelope{
 requireValid(validScope(scope));const d=parseDestination(destination,true),s=object(source,['semanticVersionId','decisionId','version','content']);
 requireValid(typeof s.content==='string'&&Buffer.from(s.content).toString()===s.content&&!s.content.includes('\u0000')&&Buffer.byteLength(s.content)>0&&Buffer.byteLength(s.content)<=PROJECTION.maxContentBytes);
 const semanticVersionId=uuid(s.semanticVersionId),decisionId=uuid(s.decisionId),version=integer(s.version,1);
 const identity=['projection-v1',scope.groupId,scope.workspaceId,d.id,d.revision,d.adapter,d.origin,d.pageId,d.dataSourceId,d.contentProperty,d.bindingProperty,semanticVersionId,decisionId,version];
 const digest=createHash('sha256').update(JSON.stringify([...identity,s.content])).digest('hex'),binding=JSON.stringify([...identity,digest]);requireValid(binding.length<=2000);
 return Object.freeze({destination:d,semanticVersionId,decisionId,version,content:s.content,digest,binding});
}
type Text=Readonly<{type:'text';text:Readonly<{content:string;link:null}>}>;
function chunks(text:string):Text[]{const result:Text[]=[];let part='';for(const c of text){if(part.length+c.length>2000){result.push(Object.freeze({type:'text',text:Object.freeze({content:part,link:null})}));part='';}part+=c;}if(part){result.push(Object.freeze({type:'text',text:Object.freeze({content:part,link:null})}));}return result;}
export function notionPatch(e:ProjectionEnvelope):{properties:Record<string,{rich_text:Text[]}>}{return {properties:{[e.destination.contentProperty]:{rich_text:chunks(e.content)},[e.destination.bindingProperty]:{rich_text:chunks(e.binding)}}};}
function record(v:unknown):Record<string,unknown>{requireValid(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function readText(properties:Record<string,unknown>,id:string):string{
 const matches=Object.values(properties).map(record).filter(v=>v.id===id);requireValid(matches.length===1);const p=matches[0]!;requireValid(p.type==='rich_text'&&Array.isArray(p.rich_text)&&p.rich_text.length<=100);
 let text='';for(let i=0;i<p.rich_text.length;i++){requireValid(Object.hasOwn(p.rich_text,i));const item=record(p.rich_text[i]);requireValid(item.type==='text');const t=record(item.text);requireValid(typeof t.content==='string'&&Buffer.from(t.content).toString()===t.content&&t.content.length<=2000&&(t.link===null||t.link===undefined)&&(item.plain_text===undefined||item.plain_text===t.content));text+=t.content;requireValid(Buffer.byteLength(text)<=PROJECTION.maxContentBytes);}return text;
}
// Only use a fresh, bounded authenticated GET response; PATCH response alone is never passed here.
export function compareReadBack(e:ProjectionEnvelope,value:unknown):'match'|'empty'|'conflict'{
 try{const p=record(value),parent=record(p.parent);requireValid(p.object==='page'&&p.id===e.destination.pageId&&p.is_archived===false&&p.in_trash===false&&parent.type==='data_source_id'&&parent.data_source_id===e.destination.dataSourceId);const properties=record(p.properties);requireValid(Object.keys(properties).length<=100);const content=readText(properties,e.destination.contentProperty),binding=readText(properties,e.destination.bindingProperty);if(content===''&&binding===''){return 'empty';}return content===e.content&&binding===e.binding?'match':'conflict';}catch{return 'conflict';}
}
export function claimMode(value:unknown,now:number,authorized:boolean):'none'|'read_then_write'|'reconcile'{
 const s=object(value,['status','attempts','availableAt','leaseUntil','writeStarted']);integer(now);const attempts=integer(s.attempts),availableAt=integer(s.availableAt),leaseUntil=integer(s.leaseUntil);requireValid(['queued','unknown','synced','failed'].includes(s.status as string)&&typeof s.writeStarted==='boolean'&&typeof authorized==='boolean');
 if(!authorized||s.status==='synced'||s.status==='failed'||attempts>=PROJECTION.maxAttempts||availableAt>now||leaseUntil>now){return 'none';}return s.writeStarted||s.status==='unknown'?'reconcile':'read_then_write';
}
