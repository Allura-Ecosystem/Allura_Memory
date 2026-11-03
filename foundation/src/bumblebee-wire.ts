import {createHash} from 'node:crypto';
import {BUMBLEBEE} from './bumblebee-contract.ts';

export type WireRecord = Readonly<Record<string, unknown>>;
function requireWire(value:unknown):asserts value {if(!value){throw new Error('bumblebee_invalid_wire');}}
function text(v:unknown,max=4096):asserts v is string {
  requireWire(typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(v));
}
function integer(v:unknown,max=Number.MAX_SAFE_INTEGER):asserts v is number {requireWire(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max);}
function shape(v:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  requireWire(v!==null&&typeof v==='object'&&!Array.isArray(v));
  const r=v as Record<string,unknown>;
  requireWire(required.every(k=>Object.hasOwn(r,k))&&Object.keys(r).every(k=>required.includes(k)||optional.includes(k)));
  return r;
}
function timestamp(v:unknown):void {
  text(v,40);
  requireWire(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(v));
  const ms=Date.parse(v);requireWire(Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,19)===v.slice(0,19));
}
function freeze<T>(v:T):T {
  if(v!==null&&typeof v==='object'){for(const x of Object.values(v)){freeze(x);}Object.freeze(v);}
  return v;
}

// JSON.parse accepts duplicate keys. Scan JSON structure BEFORE parsing so encoded
// duplicate keys, dangerous keys and excessive depth cannot become last-key-wins.
function strictJson(input:string):unknown {
  let i=0,nodes=0;
  const ws=()=>{while(i<input.length&&/[ \r\t]/.test(input[i]!)){i++;}};
  const string=():string=>{
    const start=i;requireWire(input[i++]==='"');
    while(i<input.length){const c=input[i++];if(c==='"'){return JSON.parse(input.slice(start,i)) as string;}if(c==='\\'){i++;}}
    throw new Error('bumblebee_invalid_wire');
  };
  const value=(depth:number):void=>{
    requireWire(depth<=12&&++nodes<=4096);ws();
    const c=input[i];
    if(c==='"'){string();return;}
    if(c==='{'||c==='['){
      i++;ws();const close=c==='{'?'}':']',keys=new Set<string>();
      if(input[i]===close){i++;return;}
      for(;;){
        if(c==='{'){ws();const key=string();requireWire(!keys.has(key)&&!['__proto__','prototype','constructor'].includes(key));keys.add(key);ws();requireWire(input[i++]===':');}
        value(depth+1);ws();if(input[i]===close){i++;return;}requireWire(input[i++]===',');
      }
    }
    const match=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(input.slice(i));
    requireWire(match);i+=match[0].length;
  };
  value(0);ws();requireWire(i===input.length);return JSON.parse(input) as unknown;
}

const common=['record_type','record_id','schema_version','scanner_name','scanner_version','run_id','scan_time','endpoint','profile'];
const packageFields=['ecosystem','package_name','normalized_name','version','source_type','source_file','confidence'];
const location=['project_path','root_kind'];
const summaryNumbers=['package_records_emitted','findings_emitted','duplicates','diagnostics_count','files_considered','duration_ms'];
const summaryOptionalNumbers=['package_records_suppressed','http_batches_attempted','http_batches_succeeded','http_batches_failed','http_last_status'];

function validateRecord(value:unknown):WireRecord {
  const r=shape(value,common,[...packageFields,...location,'has_lifecycle_scripts','install_scope','package_manager','direct_dependency','lifecycle_scripts','requested_spec','server_name','finding_type','severity','catalog_id','catalog_name','evidence','end_time','status','roots','counts','timed_out',...summaryNumbers,...summaryOptionalNumbers,'error']);
  requireWire(r.schema_version===BUMBLEBEE.schema&&r.scanner_name==='bumblebee'&&r.scanner_version==='v0.1.2');
  requireWire(r.profile==='baseline'||r.profile==='project');text(r.run_id,32);requireWire(/^[a-f0-9]{32}$/.test(r.run_id));timestamp(r.scan_time);
  const ep=shape(r.endpoint,['hostname','os','arch','username','uid'],['device_id']);for(const v of Object.values(ep)){text(v,256);}
  text(r.record_id,80);
  if(r.record_type==='package'||r.record_type==='finding'){
    const isPackage=r.record_type==='package';
    shape(r,[...common,...packageFields,...(isPackage?['has_lifecycle_scripts']:['finding_type','catalog_id'])],[...location,...(isPackage?['install_scope','package_manager','direct_dependency','lifecycle_scripts','requested_spec','server_name']:['severity','catalog_name','evidence'])]);
    requireWire(r.ecosystem==='npm'||r.ecosystem==='pypi');text(r.package_name,214);text(r.normalized_name,214);text(r.version,128);
    const grammar=r.ecosystem==='npm'?/^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/:/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
    requireWire(grammar.test(r.package_name));
    const normalized=r.ecosystem==='npm'?r.package_name.toLowerCase():r.package_name.toLowerCase().replace(/[-_.]+/g,'-');
    requireWire(r.normalized_name===normalized&&/^(?:[A-Za-z0-9][A-Za-z0-9.+!_-]{0,127})?$/.test(r.version));
    requireWire(['high','medium','low'].includes(r.confidence as string));
    for(const k of ['project_path','source_file','root_kind','source_type']){if(Object.hasOwn(r,k)){text(r[k]);}}
    requireWire(typeof r.source_type==='string'&&/^[a-z0-9][a-z0-9._-]{0,63}$/.test(r.source_type));
    if(Object.hasOwn(r,'root_kind')){requireWire(r.profile==='project'?r.root_kind==='project_root':['user_package_root','global_package_root'].includes(r.root_kind as string));}
    if(isPackage){
      requireWire(typeof r.has_lifecycle_scripts==='boolean');
      if(Object.hasOwn(r,'direct_dependency')){requireWire(typeof r.direct_dependency==='boolean');}
      for(const k of ['install_scope','package_manager']){if(Object.hasOwn(r,k)){text(r[k],64);requireWire(/^[a-z0-9_-]*$/.test(r[k] as string));}}
      for(const k of ['requested_spec','server_name']){if(Object.hasOwn(r,k)){requireWire(r[k]==='');}}
      if(Object.hasOwn(r,'lifecycle_scripts')){requireWire(Array.isArray(r.lifecycle_scripts)&&r.lifecycle_scripts.length<=32);for(const s of r.lifecycle_scripts){text(s);}}
    }else{
      requireWire(r.finding_type==='package_exposure');text(r.catalog_id,128);requireWire(/^[A-Za-z0-9._:-]{1,128}$/.test(r.catalog_id));
      if(Object.hasOwn(r,'severity')){requireWire(['','low','medium','high','critical'].includes(r.severity as string));}
      for(const k of ['catalog_name','evidence']){if(Object.hasOwn(r,k)){text(r[k]);}}
    }
  }else{
    requireWire(r.record_type==='scan_summary');
    shape(r,[...common,'end_time','status','timed_out',...summaryNumbers],['roots','counts',...summaryOptionalNumbers,'error']);
    timestamp(r.end_time);requireWire(Date.parse(r.end_time as string)>=Date.parse(r.scan_time as string));requireWire(['complete','partial','error'].includes(r.status as string)&&typeof r.timed_out==='boolean');
    for(const k of [...summaryNumbers,...summaryOptionalNumbers]){if(Object.hasOwn(r,k)){integer(r[k]);}}
    for(const k of ['package_records_emitted','findings_emitted','package_records_suppressed','diagnostics_count']){if(Object.hasOwn(r,k)){integer(r[k],BUMBLEBEE.maxRecords);}}
    if(Object.hasOwn(r,'error')){text(r.error);}
    if(Object.hasOwn(r,'roots')){requireWire(Array.isArray(r.roots)&&r.roots.length<=BUMBLEBEE.maxRoots);for(const root of r.roots){const x=shape(root,['path','kind']);text(x.path);requireWire(r.profile==='project'?x.kind==='project_root':['user_package_root','global_package_root'].includes(x.kind as string));}}
    if(Object.hasOwn(r,'counts')){const counts=shape(r.counts,[],['package','finding']);for(const n of Object.values(counts)){integer(n,BUMBLEBEE.maxRecords);}}
  }
  requireWire(r.record_id===recordId(r));return freeze(r);
}

// Exact approved model.go StableID tuples. Unkeyed upstream IDs are NOT signatures.
function recordId(r:WireRecord):string {
  const s=(k:string)=>String(r[k]??'');let parts:string[];
  if(r.record_type==='package'){
    parts=['profile','ecosystem','normalized_name','version','project_path','root_kind','install_scope','package_manager','source_type','source_file','direct_dependency','has_lifecycle_scripts'].map(s);
    parts.push(((r.lifecycle_scripts??[]) as string[]).slice().sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))).join('\x1e'),...['confidence','requested_spec','server_name'].map(s));
  }else if(r.record_type==='finding'){
    parts=['profile','finding_type','catalog_id','ecosystem','normalized_name','version','root_kind','project_path','source_type','source_file','confidence'].map(s);
  }else{
    const roots=(r.roots??[]) as {path:string;kind:string}[],counts=(r.counts??{}) as Record<string,number>;
    parts=[s('profile'),s('status'),s('scan_time'),s('end_time'),roots.map(x=>x.path+'\x1f'+x.kind).join('\x1e'),Object.keys(counts).sort().map(k=>k+'\x1f'+counts[k]).join('\x1e')];
    parts.push(...['package_records_emitted','package_records_suppressed','findings_emitted','duplicates','diagnostics_count','files_considered'].map(k=>String(r[k]??0)),s('timed_out'),...['duration_ms','http_batches_attempted','http_batches_succeeded','http_batches_failed','http_last_status'].map(k=>String(r[k]??0)),s('error'));
  }
  return r.record_type+':'+createHash('sha256').update(r.record_type+'\0'+parts.join('\x1e')).digest('hex');
}

/** Raw request-local records only. No authentication here. NEVER log/persist them. */
export function parseBumblebeeWire(bytes:Uint8Array):readonly WireRecord[] {
  try {
    requireWire(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=BUMBLEBEE.maxWireBytes);
    requireWire(!(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf));
    const records:WireRecord[]=[];let start=0;
    // Bound each line BEFORE allocating decoded strings; permit exactly one final LF.
    for(let i=0;i<=bytes.length;i++){
      if(i!==bytes.length&&bytes[i]!==10){continue;}
      if(i===bytes.length&&start===i){break;}
      requireWire(i-start>0&&i-start<=BUMBLEBEE.maxLineBytes&&records.length<BUMBLEBEE.maxRecords);
      const line=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes.subarray(start,i));
      records.push(validateRecord(strictJson(line)));start=i+1;
    }
    requireWire(records.length>0);return Object.freeze(records);
  }catch{throw new Error('bumblebee_invalid_wire');}
}
