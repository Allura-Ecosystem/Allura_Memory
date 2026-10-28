import {createHash} from 'node:crypto';
// Synthetic only. Field order transcribed from pinned internal/model/model.go.
// Golden constants in wire tests are independent upstream model_test.go vectors.
export type FixtureRecord = Record<string, unknown>;
export const ids={source:'11111111-1111-4111-8111-111111111111',endpoint:'22222222-2222-4222-8222-222222222222',catalog:'33333333-3333-4333-8333-333333333333',entry:'44444444-4444-4444-8444-444444444444',lease:'55555555-5555-4555-8555-555555555555'};
export const start='2026-10-28T00:00:00Z';
export const end='2026-10-28T00:00:01Z';
export function seal(r: FixtureRecord): FixtureRecord {
  const s=(k:string)=>String(r[k]??'');
  let parts:string[];
  if(r.record_type==='package'){
    parts=['profile','ecosystem','normalized_name','version','project_path','root_kind','install_scope','package_manager','source_type','source_file','direct_dependency','has_lifecycle_scripts'].map(s);
    parts.push(((r.lifecycle_scripts??[]) as string[]).slice().sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))).join('\x1e'),s('confidence'),s('requested_spec'),s('server_name'));
  }else if(r.record_type==='finding'){
    parts=['profile','finding_type','catalog_id','ecosystem','normalized_name','version','root_kind','project_path','source_type','source_file','confidence'].map(s);
  }else{
    const roots=((r.roots??[]) as {path:string;kind:string}[]).map(x=>x.path+'\x1f'+x.kind).join('\x1e');
    const counts=(r.counts??{}) as Record<string,number>;
    parts=[s('profile'),s('status'),s('scan_time'),s('end_time'),roots,Object.keys(counts).sort().map(k=>k+'\x1f'+counts[k]).join('\x1e')];
    parts.push(...['package_records_emitted','package_records_suppressed','findings_emitted','duplicates','diagnostics_count','files_considered'].map(k=>String(r[k]??0)),s('timed_out'),...['duration_ms','http_batches_attempted','http_batches_succeeded','http_batches_failed','http_last_status'].map(k=>String(r[k]??0)),s('error'));
  }
  return {...r,record_id:r.record_type+':'+createHash('sha256').update(r.record_type+'\0'+parts.join('\x1e')).digest('hex')};
}
function common(){return {schema_version:'0.1.0',scanner_name:'bumblebee',scanner_version:'v0.1.2',run_id:'a'.repeat(32),scan_time:start,endpoint:{hostname:'synthetic-private-host',os:'linux',arch:'amd64',username:'synthetic-private-user',uid:'1000',device_id:ids.endpoint},profile:'project'};}
export function pkg(patch:FixtureRecord={}):FixtureRecord{return seal({...common(),record_type:'package',ecosystem:'npm',package_name:'example-pkg',normalized_name:'example-pkg',version:'1.2.3',root_kind:'project_root',project_path:'/synthetic/project',source_type:'npm-lockfile',source_file:'/synthetic/project/package-lock.json',package_manager:'npm',has_lifecycle_scripts:false,confidence:'high',...patch});}
export function finding(patch:FixtureRecord={}):FixtureRecord{return seal({...common(),record_type:'finding',finding_type:'package_exposure',severity:'critical',catalog_id:ids.entry,catalog_name:'synthetic-private-catalog',ecosystem:'npm',package_name:'example-pkg',normalized_name:'example-pkg',version:'1.2.3',root_kind:'project_root',project_path:'/synthetic/project',source_type:'npm-lockfile',source_file:'/synthetic/project/package-lock.json',confidence:'high',evidence:'synthetic-private-evidence',...patch});}
export function summary(patch:FixtureRecord={}):FixtureRecord{return seal({...common(),record_type:'scan_summary',end_time:end,status:'complete',roots:[{path:'/synthetic/project',kind:'project_root'}],counts:{package:1,finding:0},package_records_emitted:1,findings_emitted:0,duplicates:0,diagnostics_count:0,files_considered:1,timed_out:false,duration_ms:1000,...patch});}
export function wire(records:FixtureRecord[]):Uint8Array{return new TextEncoder().encode(records.map(r=>JSON.stringify(r)).join('\n')+'\n');}
