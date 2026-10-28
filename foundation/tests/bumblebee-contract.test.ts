import {expect,test} from 'bun:test';
import {BUMBLEBEE,parseBumblebeeSource,populationDigest,parseLeaseRequest,credentialRoute,routineEligible,moduleRegistry} from '../src/bumblebee-contract.ts';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const source=()=>({sourceId:id,endpointId:other,profile:'project',roots:[{digest:'a'.repeat(64),kind:'project_root'}],ecosystems:['npm','pypi'],catalogRevisionId:null});
const summary=()=>({profile:'project',status:'complete',rootDigests:['a'.repeat(64)],packageCount:0,receivedPackages:0,findingCount:0,receivedFindings:0,suppressed:0,diagnostics:0,timedOut:false});
const app=(id='bumblebee')=>({id,version:'1.0.0',core:'allura-core-v1',dependencies:[],capabilities:id==='bumblebee'?['evidence:read','health:read']:['review:read'],enabled:true});
test('Bumblebee source canonicalization preserves immutable bounded populations',()=>{
 const raw=source(),s=parseBumblebeeSource(raw);expect(JSON.stringify(s)).toBe(JSON.stringify(raw));expect(Object.isFrozen(s)).toBe(true);expect(Object.isFrozen(s.roots)).toBe(true);expect(Object.isFrozen(s.roots[0])).toBe(true);expect(Object.isFrozen(s.ecosystems)).toBe(true);
 raw.ecosystems.reverse();expect(populationDigest(parseBumblebeeSource(raw))).toBe(populationDigest(s));raw.roots[0]!.digest='b'.repeat(64);expect(s.roots[0]!.digest).toBe('a'.repeat(64));expect(populationDigest(parseBumblebeeSource(raw))).not.toBe(populationDigest(s));
 expect(populationDigest(s)).toMatch(/^[a-f0-9]{64}$/);expect(populationDigest(parseBumblebeeSource({...source(),catalogRevisionId:id}))).toBe(populationDigest(s));
 expect(BUMBLEBEE.commit).toBe('cc57710eeaf685e7b89924a36c8583cad0a378fe');expect(BUMBLEBEE.schema).toBe('0.1.0');
});
test('Bumblebee source rejects scope command schema drift and malformed inputs without disclosure',()=>{
 for(const v of [null,[],{},...['groupId','workspaceId','role','command','token','actions'].map(k=>({...source(),[k]:'synthetic-private-marker'})),{...source(),profile:'deep'},{...source(),profile:'findings-only'},{...source(),ecosystems:['agent-skill']},{...source(),ecosystems:['npm','npm']},{...source(),ecosystems:new Array(2)},{...source(),roots:[]},{...source(),roots:new Array(2)},{...source(),roots:Array(9).fill(source().roots[0])},{...source(),roots:[...source().roots,...source().roots]},{...source(),roots:[{digest:'g'.repeat(64),kind:'project_root'}]},{...source(),roots:[{digest:'a'.repeat(64),kind:'deep_home_root'}]},{...source(),sourceId:'no'},{...source(),catalogRevisionId:'no'}]){expect(()=>parseBumblebeeSource(v)).toThrow('bumblebee_invalid');}
 for(const profile of ['baseline','project'] as const){const kind=profile==='project'?'project_root':'user_package_root';expect(parseBumblebeeSource({...source(),profile,roots:[{digest:'a'.repeat(64),kind}]}).profile).toBe(profile);}
});
test('Bumblebee lease commands and credential routes never cross audiences',()=>{
 const request=parseLeaseRequest({sourceRevision:1,operationKey:'run-1'});expect(request.sourceRevision).toBe(1);expect(Object.isFrozen(request)).toBe(true);
 for(const v of [{sourceRevision:0,operationKey:'run'},{sourceRevision:1.1,operationKey:'run'},{sourceRevision:Infinity,operationKey:'run'},{sourceRevision:1,operationKey:'x'.repeat(129)},{sourceRevision:1,operationKey:'x\nsecret'},{sourceRevision:1,operationKey:'x',sourceId:id}]){expect(()=>parseLeaseRequest(v)).toThrow('bumblebee_invalid');}
 for(const aud of ['bumblebee_runner','bumblebee_ingest','human','mcp','device']){for(const path of ['/api/bumblebee/lease','/api/bumblebee/ingest','/mcp','/api/review/decide','/api/bumblebee/ingest?x=1']){for(const method of ['POST','GET']){expect(credentialRoute(aud,method,path)).toBe(method==='POST'&&((aud==='bumblebee_runner'&&path==='/api/bumblebee/lease')||(aud==='bumblebee_ingest'&&path==='/api/bumblebee/ingest')));}}}
});
test('Bumblebee routine eligibility never retires inventory from incomplete or foreign populations',()=>{
 const s=parseBumblebeeSource(source());expect(routineEligible(s,summary(),2,1)).toBe(true);
 for(const patch of [{status:'partial'},{status:'error'},{profile:'baseline'},{rootDigests:['b'.repeat(64)]},{rootDigests:[]},{packageCount:1},{findingCount:1},{suppressed:1},{diagnostics:1},{timedOut:true}]){expect(routineEligible(s,{...summary(),...patch},2,1)).toBe(false);}
 expect(routineEligible(s,summary(),1,1)).toBe(false);expect(routineEligible(s,summary(),1,2)).toBe(false);
 expect(routineEligible(s,{...summary(),findingCount:1,receivedFindings:1},2,1)).toBe(false);
 expect(routineEligible(parseBumblebeeSource({...source(),catalogRevisionId:id}),{...summary(),findingCount:1,receivedFindings:1},2,1)).toBe(true);
 expect(()=>routineEligible(s,{...summary(),packageCount:2049,receivedPackages:2049},2,1)).toThrow('bumblebee_invalid');
 for(const patch of [{packageCount:-1},{receivedPackages:NaN},{receivedFindings:0.5},{rootDigests:new Array(1)},{timedOut:'false'},{status:'unknown'},{extra:'synthetic-private-marker'}]){expect(()=>routineEligible(s,{...summary(),...patch},2,1)).toThrow('bumblebee_invalid');}
 for(const n of [0,-1,NaN,Infinity,1.5]){expect(()=>routineEligible(s,summary(),n,0)).toThrow('bumblebee_invalid');}
});
test('Bumblebee data only modules fail independently without expanding capability',()=>{
 const grants=['evidence:read','health:read','review:read'];let r=moduleRegistry([app(),app('memory-review')],grants);expect(r.available.map(x=>x.id)).toEqual(['bumblebee','memory-review']);expect(r.unavailable).toHaveLength(0);expect(Object.isFrozen(r.available[0])).toBe(true);expect(Object.isFrozen(r.available[0]!.capabilities)).toBe(true);
 for(const invalid of [app('unknown'),{...app(),version:'2.0.0'},{...app(),core:'other'},{...app(),dependencies:['remote']},{...app(),code:'https://malicious.invalid/module.js'},{...app(),capabilities:['review:approve']},{...app(),capabilities:new Array(1)},{...app(),enabled:false}]){r=moduleRegistry([invalid,app('memory-review')],grants);expect(r.available.map(x=>x.id)).toEqual(['memory-review']);expect(r.unavailable).toHaveLength(1);}
 r=moduleRegistry([app(),app(),app('memory-review')],grants);expect(r.available.map(x=>x.id)).toEqual(['memory-review']);expect(r.unavailable).toHaveLength(2);
 expect(moduleRegistry([app()],['evidence:read']).available).toHaveLength(0);expect(()=>moduleRegistry(new Array(2),grants)).toThrow('bumblebee_invalid');expect(()=>moduleRegistry(Array(17).fill(app()),grants)).toThrow('bumblebee_invalid');
});
