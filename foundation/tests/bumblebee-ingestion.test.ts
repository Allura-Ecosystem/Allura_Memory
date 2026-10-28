import {expect,test} from 'bun:test';
import {createHmac} from 'node:crypto';
import {createBumblebeeIngestor,type GatewaySession,type BumblebeeGateway} from '../src/bumblebee-ingestion.ts';
import {populationDigest} from '../src/bumblebee-contract.ts';
import {ids,pkg,finding,summary,wire,seal} from './bumblebee-fixture.ts';

const key=new Uint8Array(32).fill(7); // synthetic secret, never production
const now=Date.parse('2026-10-28T00:00:02Z');
const scope={groupId:'synthetic-group',workspaceId:'66666666-6666-4666-8666-666666666666'};
const digest=(domain:string,value:unknown,s=scope)=>createHmac('sha256',key).update(JSON.stringify(['bumblebee-redaction-v1',s.groupId,s.workspaceId,domain,value])).digest('hex');
function session():GatewaySession {
 const source={sourceId:ids.source,endpointId:ids.endpoint,profile:'project' as const,roots:[{digest:digest('root','/synthetic/project'),kind:'project_root' as const}],ecosystems:['npm','pypi'] as const,catalogRevisionId:null};
 return {scope,sourceScope:scope,source,sourceRevision:1,currentSourceRevision:1,sourceEnabled:true,ownerAuthorized:true,credentialAudience:'bumblebee_ingest',credentialExpiresAt:now+10000,credentialRevoked:false,
  lease:{scope,id:ids.lease,sourceId:ids.source,sourceRevision:1,endpointId:ids.endpoint,populationDigest:populationDigest(source),catalogRevisionId:null,catalogDigest:null,generation:2,issuedAt:now-2000,expiresAt:now+10000,revoked:false,artifactSha256:'3b46f98ab8fa6345a5d39c7483ff37c51b2ee7699aabe51f2a54133f357f6c7a'},
  catalog:null,currentGeneration:1,lastCompleteReceivedAt:null,priorWireDigest:null,keyRevision:'synthetic-key-v1'};
}
function harness(state=session()){
 let reads=0,rechecks=0;
 const gateway:BumblebeeGateway={async withVerifiedLease(use){return use(state,async()=>{rechecks++;return true;});}};
 const ingest=createBumblebeeIngestor({gateway,redactionKey:key,keyRevision:'synthetic-key-v1',now:()=>now});
 return {state,ingest,reads:()=>reads,rechecks:()=>rechecks,body:(bytes:Uint8Array)=>async()=>{reads++;return bytes;}};
}
test('Bumblebee ingestion prepares an empty complete population without claiming durable acceptance',async()=>{
 const h=harness(),bytes=wire([summary({counts:{package:0,finding:0},package_records_emitted:0})]);
 const result=await h.ingest(h.body(bytes));
 expect(result.status).toBe('candidate');
 if(result.status!=='candidate'){throw new Error('candidate expected');}
 expect(result.plan.replaceCurrent).toBe(true);
 expect(result.plan.packages).toHaveLength(0);
 expect(result.plan.exposures).toHaveLength(0);
 expect(result.plan.trust).toBe('gateway-verified');
 expect(result.plan.freshness).toBe('fresh');
 expect(result.plan.wireDigest).toBe(digest('wire',Buffer.from(bytes).toString('base64')));
 expect(h.reads()).toBe(1);expect(h.rechecks()).toBe(1);
 expect(Object.isFrozen(result.plan)).toBe(true);
 expect('receipt' in result).toBe(false);expect('committed' in result).toBe(false);
});

function catalogSession():GatewaySession {
 const s=session(),source={...s.source,catalogRevisionId:ids.catalog};
 return {...s,source,lease:{...s.lease,catalogRevisionId:ids.catalog,catalogDigest:'c'.repeat(64)},catalog:{scope,sourceId:ids.source,revisionId:ids.catalog,digest:'c'.repeat(64),trust:'approved',approvedAt:now-1000,expiresAt:now+60000,entries:[{id:ids.entry,ecosystem:'npm',name:'example-pkg',version:'1.2.3',severity:'high'}]}};
}
const complete=()=>wire([pkg(),summary()]);

test('Bumblebee ingestion checks gateway authority and lease bindings before reading body',async()=>{
 const s=session(),foreign={...scope,groupId:'foreign'};
 const invalid:GatewaySession[]=[{...s,sourceEnabled:false},{...s,ownerAuthorized:false},{...s,credentialAudience:'browser'},{...s,credentialRevoked:true},{...s,credentialExpiresAt:now},{...s,currentSourceRevision:2},{...s,sourceScope:foreign},{...s,keyRevision:'wrong'},
  ...[{revoked:true},{scope:foreign},{sourceId:ids.endpoint},{endpointId:ids.source},{sourceRevision:2},{populationDigest:'0'.repeat(64)},{expiresAt:now},{issuedAt:now+1},{expiresAt:now+600001},{generation:0},{generation:NaN},{catalogRevisionId:ids.catalog},{artifactSha256:'0'.repeat(64)}].map(p=>({...s,lease:{...s.lease,...p}}))];
 for(const state of invalid){const h=harness(state);expect((await h.ingest(h.body(complete()))).status).toBe('rejected');expect(h.reads()).toBe(0);}
 let reads=0;
 const denied=createBumblebeeIngestor({gateway:{async withVerifiedLease(){return null;}},redactionKey:key,keyRevision:'synthetic-key-v1',now:()=>now});
 expect(await denied(async()=>{reads++;return complete();})).toEqual({status:'rejected',code:'authority'});expect(reads).toBe(0);
});

test('Bumblebee ingestion rejects mixed runs duplicate IDs wrong population and incomplete streams',async()=>{
 const p=pkg(),s=summary();
 const invalid=[[],[p],[s,p],[s,s],[p,p,summary({package_records_emitted:2,counts:{package:2,finding:0}})],
  [p,summary({run_id:'b'.repeat(32)})],[pkg({endpoint:{...(p.endpoint as object),device_id:ids.source}}),s],
  [pkg({profile:'baseline',root_kind:'user_package_root'}),s],[p,summary({counts:{package:0,finding:0}})],[p,summary({package_records_emitted:0,counts:{package:0,finding:0}})],
  [p,summary({roots:[{path:'/foreign',kind:'project_root'}]})],[p,summary({roots:[]})],[p,summary({roots:[{path:'/synthetic/project',kind:'project_root'},{path:'/synthetic/project',kind:'project_root'}]})],
  [pkg({source_file:'/synthetic/project-evil/file'}),s],[pkg({source_file:'/synthetic/project/../escape'}),s],[pkg({source_file:'https://private.invalid/file'}),s],[pkg({project_path:'/elsewhere'}),s],
  [pkg({ecosystem:'pypi',package_name:'x',normalized_name:'x'}),s]];
 for(const records of invalid){const state=session();const h=harness({...state,source:{...state.source,ecosystems:['npm']},lease:{...state.lease,populationDigest:populationDigest({...state.source,ecosystems:['npm']})}});const r=await h.ingest(h.body(wire(records)));expect(r.status).toBe('rejected');expect(JSON.stringify(r)).not.toContain('/synthetic');}
 expect((await harness().ingest(async()=>new TextEncoder().encode('{bad secret'))).status).toBe('rejected');
});

test('Bumblebee ingestion preserves partial error late and stale evidence without retiring inventory',async()=>{
 for(const patch of [{status:'partial'},{status:'error'},{diagnostics_count:1},{package_records_suppressed:1},{timed_out:true},{error:'private-error'},{http_batches_failed:1}]){
  const h=harness();const r=await h.ingest(h.body(wire([pkg(),summary(patch)])));
  expect(r.status).toBe('candidate');if(r.status!=='candidate'){continue;}
  expect(r.plan.replaceCurrent).toBe(false);expect(r.plan.freshness).toBe('unknown');expect(r.plan.packages).toHaveLength(1);expect(r.plan.evidenceState).toBe('partial');
 }
 for(const generation of [2,3]){const s=session(),h=harness({...s,currentGeneration:generation,lastCompleteReceivedAt:now-86400001});const r=await h.ingest(h.body(complete()));expect(r.status).toBe('candidate');if(r.status==='candidate'){expect(r.plan.replaceCurrent).toBe(false);expect(r.plan.freshness).toBe('stale');expect(r.plan.evidenceState).toBe('late');}}
 const s=session(),h=harness({...s,lastCompleteReceivedAt:now-1000});const r=await h.ingest(h.body(wire([pkg(),summary({status:'partial'})])));if(r.status==='candidate'){expect(r.plan.freshness).toBe('fresh');}else{throw new Error('candidate expected');}
});

test('Bumblebee ingestion computes scoped verified exposure and fixed simulated proposals from packages',async()=>{
 const h=harness(catalogSession()),r=await h.ingest(h.body(complete()));
 expect(r.status).toBe('candidate');if(r.status!=='candidate'){throw new Error('candidate expected');}
 expect(r.plan.exposures).toHaveLength(1);expect(r.plan.simulations).toHaveLength(1);
 expect(r.plan.exposures[0]!.severity).toBe('high');expect(r.plan.catalogTrust).toBe('approved');expect(r.plan.catalogFreshness).toBe('current');
 expect(r.plan.simulations[0]!.mode).toBe('simulation');expect(r.plan.simulations[0]!.text).toBe('Review this verified package exposure with an authorized human. No action has been executed.');
 expect(r.plan.packages[0]!.name).toBe('example-pkg');expect(r.plan.packages[0]!.sourceFileDigest).toBe(digest('path','/synthetic/project/package-lock.json'));
 for(const privateValue of ['/synthetic','synthetic-private','hostname','username','source_file','record_id','command','activate','token']){expect(JSON.stringify(r)).not.toContain(privateValue);}
 expect(Object.isFrozen(r.plan.packages[0])).toBe(true);expect(Object.isFrozen(r.plan.exposures[0]!.packageIds)).toBe(true);
 // Raw finding severity is not catalog authority; package evidence creates exposure even with zero emitted findings.
 const found=await h.ingest(h.body(wire([pkg(),finding(),summary({findings_emitted:1,counts:{package:1,finding:1}})])));
 expect(found.status).toBe('candidate');if(found.status==='candidate'){expect(found.plan.exposures[0]!.severity).toBe('high');}
 const noCatalog=await harness().ingest(async()=>complete());if(noCatalog.status==='candidate'){expect(noCatalog.plan.catalogTrust).toBe('none');expect(noCatalog.plan.exposures).toHaveLength(0);}
 for(const patch of [{confidence:'medium'},{confidence:'low'},{version:''},{version:'9.9.9'}]){const x=await h.ingest(h.body(wire([pkg(patch),summary()])));expect(x.status).toBe('candidate');if(x.status==='candidate'){expect(x.plan.exposures).toHaveLength(0);}}
});

test('Bumblebee ingestion rejects unbound expired invalidated or foreign catalogs and fabricated findings',async()=>{
 const s=catalogSession(),c=s.catalog!;
 for(const patch of [{trust:'rejected' as const},{trust:'degraded' as const},{scope:{...scope,groupId:'foreign'}},{expiresAt:now},{approvedAt:now+1},{expiresAt:now+8*86400000},{digest:'d'.repeat(64)},{sourceId:ids.endpoint},{revisionId:ids.entry},{entries:Array(129).fill(c.entries[0])},{entries:[c.entries[0]!,c.entries[0]!]}]){
  const h=harness({...s,catalog:{...c,...patch}});expect((await h.ingest(h.body(complete()))).status).toBe('rejected');expect(h.reads()).toBe(0);
 }
 for(const records of [[finding(),summary({package_records_emitted:0,findings_emitted:1,counts:{package:0,finding:1}})],[pkg(),finding({catalog_id:ids.source}),summary({findings_emitted:1,counts:{package:1,finding:1}})],[pkg(),finding({version:'9.9.9'}),summary({findings_emitted:1,counts:{package:1,finding:1}})]]){expect((await harness(s).ingest(async()=>wire(records))).status).toBe('rejected');}
 expect((await harness().ingest(async()=>wire([pkg(),finding(),summary({findings_emitted:1,counts:{package:1,finding:1}})]))).status).toBe('rejected');
});

test('Bumblebee ingestion distinguishes exact and conflicting replay and deduplicates across runs',async()=>{
 const state=catalogSession(),h=harness(state),bytes=complete(),first=await h.ingest(h.body(bytes));
 if(first.status!=='candidate'){throw new Error('candidate expected');}
 const replay=harness({...state,priorWireDigest:first.plan.wireDigest});
 expect(await replay.ingest(replay.body(bytes))).toEqual({status:'exact-replay',wireDigest:first.plan.wireDigest});
 expect(await replay.ingest(replay.body(wire([pkg(),summary({duplicates:1})])))).toEqual({status:'rejected',code:'replay_conflict'});
 const changedRun=wire([seal({...pkg(),run_id:'b'.repeat(32)}),seal({...summary(),run_id:'b'.repeat(32)})]);
 const second=await h.ingest(h.body(changedRun));if(second.status!=='candidate'){throw new Error('candidate expected');}
 expect(second.plan.exposures[0]!.alertKey).toBe(first.plan.exposures[0]!.alertKey);expect(second.plan.wireDigest).not.toBe(first.plan.wireDigest);
 const two=await h.ingest(h.body(wire([pkg(),pkg({source_file:'/synthetic/project/other-lock.json'}),summary({package_records_emitted:2,counts:{package:2,finding:0}})])));
 if(two.status==='candidate'){expect(two.plan.exposures).toHaveLength(1);expect(two.plan.exposures[0]!.packageIds).toHaveLength(2);}else{throw new Error('candidate expected');}
 const foreign={...scope,workspaceId:ids.source},fs={...state.source,roots:[{digest:digest('root','/synthetic/project',foreign),kind:'project_root' as const}]};
 const other=harness({...state,scope:foreign,sourceScope:foreign,source:fs,lease:{...state.lease,scope:foreign,populationDigest:populationDigest(fs)},catalog:{...state.catalog!,scope:foreign}});
 const foreignResult=await other.ingest(other.body(bytes));if(foreignResult.status!=='candidate'){throw new Error('candidate expected');}
 expect(foreignResult.plan.exposures[0]!.alertKey).not.toBe(first.plan.exposures[0]!.alertKey);expect(foreignResult.plan.wireDigest).not.toBe(first.plan.wireDigest);
});

test('Bumblebee ingestion rechecks revocation and expiry and keeps transport uncertainty unknown',async()=>{
 let clock=now;
 const make=(recheck:()=>Promise<boolean>,withError=false)=>createBumblebeeIngestor({gateway:{async withVerifiedLease(use){if(withError){throw new Error('private-db-error');}return use(session(),recheck);}},redactionKey:key,keyRevision:'synthetic-key-v1',now:()=>clock});
 expect(await make(async()=>false)(async()=>complete())).toEqual({status:'rejected',code:'authority'});
 expect(await make(async()=>{clock+=20000;return true;})(async()=>complete())).toEqual({status:'rejected',code:'authority'});
 clock=now;
 expect(await make(async()=>true)(async()=>{throw new Error('private-body-error');})).toEqual({status:'unknown',code:'unavailable'});
 expect(await make(async()=>true,true)(async()=>complete())).toEqual({status:'unknown',code:'unavailable'});
 expect(await make(async()=>{throw new Error('private-recheck-error');})(async()=>complete())).toEqual({status:'unknown',code:'unavailable'});
});

test('Bumblebee ingestion preserves safe partial summary detail and rejects oversized correlation work',async()=>{
 const state=catalogSession(),h=harness(state),r=await h.ingest(h.body(wire([pkg({has_lifecycle_scripts:true,lifecycle_scripts:['synthetic-private-script']}),summary({status:'error',diagnostics_count:2,error:'synthetic-private-error',timed_out:true})])));
 expect(r.status).toBe('candidate');if(r.status!=='candidate'){throw new Error('candidate expected');}
 expect(r.plan.summary.status).toBe('error');expect(r.plan.summary.diagnostics).toBe(2);expect(r.plan.summary.timedOut).toBe(true);expect(r.plan.summary.packageCount).toBe(1);
 expect(JSON.stringify(r)).not.toContain('synthetic-private');expect(r.plan.replaceCurrent).toBe(false);expect(r.plan.exposures).toHaveLength(1);
 const entries=Array.from({length:128},(_,i)=>({...state.catalog!.entries[0]!,id:i.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111'}));
 const expensive=harness({...state,catalog:{...state.catalog!,entries}});
 const packages=Array.from({length:17},(_,i)=>pkg({source_file:'/synthetic/project/lock-'+i}));
 expect(await expensive.ingest(expensive.body(wire([...packages,summary({counts:{package:17,finding:0},package_records_emitted:17})])))).toEqual({status:'rejected',code:'wire'});
 const boundary=await expensive.ingest(expensive.body(wire([...packages.slice(0,16),summary({counts:{package:16,finding:0},package_records_emitted:16})])));
 expect(boundary.status).toBe('candidate');if(boundary.status==='candidate'){expect(boundary.plan.exposures).toHaveLength(128);expect(boundary.plan.exposures[0]!.packageIds).toHaveLength(16);}
});

test('Bumblebee ingestion defends snapshot drift replay revocation and key ownership',async()=>{
 const state=catalogSession(),first=await harness(state).ingest(async()=>complete());if(first.status!=='candidate'){throw new Error('candidate expected');}
 const expired=harness({...state,priorWireDigest:first.plan.wireDigest,lease:{...state.lease,revoked:true}});
 expect(await expired.ingest(expired.body(complete()))).toEqual({status:'rejected',code:'authority'});expect(expired.reads()).toBe(0);
 const live=structuredClone(state);
 const mutable=live as {currentGeneration:number};
 const ingest=createBumblebeeIngestor({gateway:{async withVerifiedLease(use){return use(live,async()=>true);}},redactionKey:key,keyRevision:'synthetic-key-v1',now:()=>now});
 expect(await ingest(async(limit)=>{expect(limit).toBe(4194304);mutable.currentGeneration=9;return complete();})).toEqual({status:'rejected',code:'authority'});
 for(const length of [0,31,33]){expect(()=>createBumblebeeIngestor({gateway:{async withVerifiedLease(){return null;}},redactionKey:new Uint8Array(length),keyRevision:'k',now:()=>now})).toThrow();}
 const ownKey=key.slice();const own=createBumblebeeIngestor({gateway:{async withVerifiedLease(use){return use(session(),async()=>true);}},redactionKey:ownKey,keyRevision:'synthetic-key-v1',now:()=>now});ownKey.fill(0);
 expect((await own(async()=>complete())).status).toBe('candidate');
 const replayState={...structuredClone(state),priorWireDigest:first.plan.wireDigest};
 const replay=createBumblebeeIngestor({gateway:{async withVerifiedLease(use){return use(replayState,async()=>true);}},redactionKey:key,keyRevision:'synthetic-key-v1',now:()=>now});
 expect(await replay(async()=>{(replayState as {currentGeneration:number}).currentGeneration=8;return complete();})).toEqual({status:'rejected',code:'authority'});
});

test('Bumblebee ingestion uses server generation not scanner clocks for freshness ordering',async()=>{
 const h=harness(),records=[pkg({scan_time:'2099-01-01T00:00:00Z'}),summary({scan_time:'2099-01-01T00:00:00Z',end_time:'2099-01-01T00:00:01Z'})];
 const r=await h.ingest(h.body(wire(records)));expect(r.status).toBe('candidate');if(r.status==='candidate'){expect(r.plan.clockSkew).toBe(true);expect(r.plan.generation).toBe(2);expect(r.plan.receivedAt).toBe(now);expect(r.plan.replaceCurrent).toBe(true);}
});
