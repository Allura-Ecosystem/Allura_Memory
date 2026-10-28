import { type SQL, type TransactionSQL } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { type Identity, isAuthenticated } from './authentication.ts';
import { AuthorityError, type Scope, validScope } from './authority.ts';
import { scopedTransaction } from './persistence.ts';

export class CaptureError extends Error {
  constructor(public readonly code:'invalid'|'conflict'|'not_found'|'unknown') { super(code);this.name='CaptureError'; }
}
type Metadata=Readonly<{source?:string;source_id?:string;tags?:readonly string[]}>;
export type CaptureInput=Readonly<{idempotency_key:string;content:string;trace_type:string;threshold:number|null;metadata:Metadata}>;
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const validText=(value:string)=>!/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
export function normalizeCapture(value:unknown):CaptureInput {
  if(!plain(value)||Object.values(value).some(v=>v===undefined)||Object.keys(value).some(k=>!['idempotency_key','content','trace_type','threshold','metadata'].includes(k))) {throw new CaptureError('invalid');}
  const {idempotency_key:key,content}=value;
  const type=value.trace_type===undefined?'conversation':value.trace_type,threshold=value.threshold??null,metadata=value.metadata===undefined?{}:value.metadata;
  if(typeof key!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(key)||typeof content!=='string'||!content.trim()||!validText(content)||Buffer.byteLength(content)>48000||
    typeof type!=='string'||!['run','tool','failure','cron','conversation'].includes(type)||
    (threshold!==null&&(typeof threshold!=='number'||!Number.isFinite(threshold)||threshold<0||threshold>1))||!plain(metadata)||
    Object.keys(metadata).some(k=>!['source','source_id','tags'].includes(k))) {throw new CaptureError('invalid');}
  const clean:{source?:string;source_id?:string;tags?:readonly string[]}={};
  for(const key of ['source','source_id'] as const) {
    if(Object.hasOwn(metadata,key)) {
      const item=metadata[key];if(typeof item!=='string'||!item.length||item.length>1024||!validText(item)){throw new CaptureError('invalid');}clean[key]=item;
    }
  }
  if(Object.hasOwn(metadata,'tags')) {
    if(!Array.isArray(metadata.tags)||metadata.tags.length>32||Array.from(metadata.tags).some(v=>typeof v!=='string'||!v.length||v.length>128||!validText(v))){throw new CaptureError('invalid');}
    clean.tags=Object.freeze([...metadata.tags]) as readonly string[];
  }
  if(Buffer.byteLength(JSON.stringify(clean))>4096){throw new CaptureError('invalid');}
  if(Buffer.byteLength(JSON.stringify({content,trace_type:type,threshold,metadata:clean}))>60000){throw new CaptureError('invalid');}
  return Object.freeze({idempotency_key:key,content,trace_type:type,threshold,metadata:Object.freeze(clean)});
}
function canonical(value:unknown):string {
  if(Array.isArray(value)){return `[${value.map(canonical).join(',')}]`;}
  if(plain(value)){return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;}
  return JSON.stringify(value);
}
export function captureDigest(scope:Scope,principal:string,input:CaptureInput):string {
  return createHash('sha256').update(canonical(['capture-v1','memory_add',scope.groupId,scope.workspaceId,principal,input.content,input.trace_type,input.threshold,input.metadata])).digest('hex');
}
/** Trusted transaction composition only; never exposed as a caller-owned SQL interface. */
export async function captureInTransaction(tx:TransactionSQL,identity:Identity,scope:Scope,request:unknown):Promise<string> {
  if(!isAuthenticated(identity)){throw new AuthorityError('unauthenticated');}
  if(identity.kind==='human'){throw new AuthorityError('forbidden');}
  const input=normalizeCapture(request);
      const principal=identity.principalId, digest=captureDigest(scope,principal,input);
      const lock=JSON.stringify([scope.groupId,scope.workspaceId,principal,'memory_add',input.idempotency_key]);
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${lock},31002))`;
      const [existing]=await tx`SELECT r.digest,c.receipt_text FROM allura.capture_replay r JOIN allura.capture_receipts c ON c.group_id=r.group_id AND c.workspace_id=r.workspace_id AND c.id=r.receipt_id WHERE r.group_id=${scope.groupId} AND r.workspace_id=${scope.workspaceId}::uuid AND r.principal_id=${principal}::uuid AND r.operation_kind='memory_add' AND r.operation_key=${input.idempotency_key}`;
      if(existing){if(existing.digest!==digest){throw new CaptureError('conflict');}return existing.receipt_text as string;}
      const event=randomUUID(),receiptId=randomUUID(),intent=randomUUID();
      const [clock]=await tx`SELECT clock_timestamp() AS now`;
      const time=(clock.now as Date).toISOString();
      const payload={content:input.content,trace_type:input.trace_type,threshold:input.threshold,metadata:input.metadata};
      const receipt=canonical({version:'capture-v1',receipt_id:receiptId,event_id:event,group_id:scope.groupId,workspace_id:scope.workspaceId,principal_id:principal,digest_version:'capture-v1',digest,accepted_at:time,persistence:'succeeded',indexing:'pending',proposal:'not_generated',promotion:'not_requested'});
      await tx`INSERT INTO allura.events(group_id,workspace_id,id,actor_id,kind,payload,created_at) VALUES (${scope.groupId},${scope.workspaceId}::uuid,${event}::uuid,${principal}::uuid,'capture',${payload}::jsonb,${time}::timestamptz)`;
      await tx`INSERT INTO allura.capture_receipts(group_id,workspace_id,id,event_id,principal_id,digest,receipt_text,created_at) VALUES (${scope.groupId},${scope.workspaceId}::uuid,${receiptId}::uuid,${event}::uuid,${principal}::uuid,${digest},${receipt},${time}::timestamptz)`;
      await tx`INSERT INTO allura.capture_replay(group_id,workspace_id,principal_id,operation_kind,operation_key,digest,receipt_id,event_id) VALUES (${scope.groupId},${scope.workspaceId}::uuid,${principal}::uuid,'memory_add',${input.idempotency_key},${digest},${receiptId}::uuid,${event}::uuid)`;
      await tx`INSERT INTO allura.index_intents(group_id,workspace_id,id,receipt_id,event_id,principal_id) VALUES (${scope.groupId},${scope.workspaceId}::uuid,${intent}::uuid,${receiptId}::uuid,${event}::uuid,${principal}::uuid)`;
      return receipt;
}
export async function capture(sql:SQL,identity:Identity,scope:Scope,request:unknown):Promise<string> {
  if(!isAuthenticated(identity)){throw new AuthorityError('unauthenticated');}
  if(identity.kind==='human'){throw new AuthorityError('forbidden');}
  const input=normalizeCapture(request);
  try {
    return await scopedTransaction(sql,identity,scope,'memory:capture',tx=>captureInTransaction(tx,identity,scope,input));
  } catch(error) {
    if(error instanceof CaptureError||error instanceof AuthorityError){throw error;}
    // A disconnected COMMIT cannot be safely classified as rollback.
    throw new CaptureError('unknown');
  }
}
export async function readCaptureReceipt(sql:SQL,identity:Identity,scope:Scope,receiptId:string):Promise<string> {
  if(!validScope({...scope,workspaceId:receiptId})){throw new CaptureError('invalid');}
  try {
    return await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
      const [row]=await tx`SELECT receipt_text FROM allura.capture_receipts WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND id=${receiptId}::uuid`;
      if(!row){throw new CaptureError('not_found');}return row.receipt_text as string;
    });
  } catch(error) {
    if(error instanceof CaptureError||error instanceof AuthorityError){throw error;}
    throw new CaptureError('unknown');
  }
}
