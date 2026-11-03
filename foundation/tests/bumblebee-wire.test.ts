import {expect, test} from 'bun:test';
import {parseBumblebeeWire} from '../src/bumblebee-wire.ts';
import {BUMBLEBEE} from '../src/bumblebee-contract.ts';
import {pkg,finding,summary,wire,seal} from './bumblebee-fixture.ts';

// Synthetic envelope around the exact upstream model_test.go package golden tuple.
const golden = {
  record_type:'package', record_id:'package:b6b6024a551185890759593eb31189c7744783e3efa471b1285b68451a60dfc3',
  schema_version:'0.1.0', scanner_name:'bumblebee', scanner_version:'v0.1.2',
  run_id:'a'.repeat(32), scan_time:'2026-10-28T00:00:00Z',
  endpoint:{hostname:'synthetic-host',os:'linux',arch:'amd64',username:'synthetic-user',uid:'1000',device_id:'synthetic-device'},
  profile:'baseline',ecosystem:'npm',package_name:'left-pad',normalized_name:'left-pad',version:'1.3.0',
  root_kind:'global_package_root',source_type:'package.json',source_file:'/path/package.json',
  direct_dependency:true,has_lifecycle_scripts:false,confidence:'high',
};

test('Bumblebee wire validates the pinned upstream package golden identity',()=>{
  const result=parseBumblebeeWire(new TextEncoder().encode(JSON.stringify(golden)+'\n'));
  expect(result).toHaveLength(1);
  expect(result[0]!.record_id).toBe(golden.record_id);
  expect(result[0]!.scanner_version).toBe('v0.1.2');
  expect(()=>parseBumblebeeWire(new TextEncoder().encode(JSON.stringify({...golden,version:'1.3.1'})))).toThrow('bumblebee_invalid_wire');
});

test('Bumblebee wire accepts observed finding and summary shapes with exact identity parity',()=>{
 const f=finding({profile:'baseline',catalog_id:'cat-001',package_name:'left-pad',normalized_name:'left-pad',version:'1.3.0',root_kind:'global_package_root',project_path:'',source_type:'package.json',source_file:'/path/package.json'});
 expect(f.record_id).toBe('finding:68b4cb2ed9440e2aacc37f145dffdfdfab2a9d36e395e8818d9954bd42f82d68');
 expect(parseBumblebeeWire(wire([f]))[0]!.record_id).toBe(f.record_id);
 const records=[pkg(),finding(),summary({counts:{package:1,finding:1},findings_emitted:1})];
 expect(parseBumblebeeWire(wire(records))).toEqual(records);
 const parsed=parseBumblebeeWire(wire(records));
 expect(Object.isFrozen(parsed)).toBe(true);
 expect(Object.isFrozen(parsed[0]!.endpoint)).toBe(true);
 expect(()=>parseBumblebeeWire(wire([{...records[2],duration_ms:2000}]))).toThrow('bumblebee_invalid_wire');
});

test('Bumblebee wire rejects malformed unknown and malicious record data without echoes',()=>{
 const invalid=[null,[],{},...['groupId','workspaceId','role','command','__proto__','constructor'].map(k=>({...pkg(),[k]:'synthetic-private-secret'})),
  pkg({schema_version:'0.2.0'}),pkg({scanner_version:'0.1.2'}),pkg({scanner_name:'other'}),pkg({profile:'deep'}),pkg({ecosystem:'agent-skill'}),pkg({run_id:'x'}),pkg({scan_time:'yesterday'}),pkg({scan_time:'2026-02-30T00:00:00Z'}),
  pkg({endpoint:{}}),pkg({endpoint:{...(golden.endpoint),token:'private'}}),pkg({confidence:'certain'}),pkg({has_lifecycle_scripts:'false'}),pkg({lifecycle_scripts:[false]}),pkg({lifecycle_scripts:Array(33).fill('install')}),pkg({direct_dependency:null}),
  pkg({package_name:'bad;curl'}),pkg({normalized_name:'Other'}),pkg({version:'$(execute)'}),pkg({version:'x'.repeat(129)}),pkg({source_file:'x\u001ey'}),pkg({root_kind:'deep_home_root'}),pkg({requested_spec:'evil'}),pkg({server_name:'evil'}),
  finding({severity:'execute'}),finding({finding_type:'arbitrary'}),summary({status:'unknown'}),summary({duration_ms:-1}),summary({duration_ms:Infinity}),summary({roots:Array(9).fill({path:'/synthetic/project',kind:'project_root'})}),summary({roots:[{path:'/x',kind:'project_root',scope:'evil'}]}),summary({counts:{unknown:1}}),summary({counts:{package:0.5}}),summary({timed_out:0}),
  {record_type:'diagnostic',record_id:'diagnostic:'+'a'.repeat(64),run_id:'a'.repeat(32),time:'2026-10-28T00:00:00Z',level:'error',message:'private'}];
 for(const value of invalid){expect(()=>parseBumblebeeWire(new TextEncoder().encode(JSON.stringify(value)))).toThrow('bumblebee_invalid_wire');}
 expect(parseBumblebeeWire(wire([pkg({ecosystem:'pypi',package_name:'Example_Pkg',normalized_name:'example-pkg'})]))).toHaveLength(1);
});

test('Bumblebee wire enforces bytes lines records nesting and duplicate JSON keys',()=>{
 const encode=(s:string)=>new TextEncoder().encode(s);
 for(const bytes of [new Uint8Array(),new Uint8Array(BUMBLEBEE.maxWireBytes+1),new Uint8Array([0xc0,0xaf]),encode('\ufeff'+JSON.stringify(pkg())),encode(JSON.stringify(pkg())+'\n\n'),encode(' '.repeat(BUMBLEBEE.maxLineBytes+1)),encode(JSON.stringify(pkg()).replace('"record_type":"package"','"record_type":"package","record_type":"package"')),encode(JSON.stringify(pkg()).replace('"record_type":"package"','"record_type":"package","\\u0072ecord_type":"package"')),encode('{"x":'+ '['.repeat(20)+'0'+']'.repeat(20)+'}'),wire(Array(BUMBLEBEE.maxRecords+1).fill(pkg()))]){expect(()=>parseBumblebeeWire(bytes)).toThrow('bumblebee_invalid_wire');}
 const s=JSON.stringify(pkg());
 expect(parseBumblebeeWire(encode(s+' '.repeat(BUMBLEBEE.maxLineBytes-s.length)+'\n'))).toHaveLength(1);
 expect(parseBumblebeeWire(wire(Array(BUMBLEBEE.maxRecords).fill(pkg())))).toHaveLength(BUMBLEBEE.maxRecords);
 expect(parseBumblebeeWire(encode(s+'\r\n'))).toHaveLength(1);
 expect(()=>parseBumblebeeWire(wire([seal({...pkg(),source_file:'x\ud800'})]))).toThrow('bumblebee_invalid_wire');
});

test('Bumblebee wire accepts exact total byte ceiling and rejects Unicode byte overflow',()=>{
 const line=JSON.stringify(pkg());
 const exact=new TextEncoder().encode((line+' '.repeat(BUMBLEBEE.maxLineBytes-1-line.length)+'\n').repeat(BUMBLEBEE.maxWireBytes/BUMBLEBEE.maxLineBytes));
 expect(exact.byteLength).toBe(BUMBLEBEE.maxWireBytes);expect(parseBumblebeeWire(exact)).toHaveLength(64);
 // Character counts cannot substitute for bytes on the NDJSON admission boundary.
 const unicode=JSON.stringify(pkg({lifecycle_scripts:Array(8).fill('é'.repeat(4096))}));
 expect(unicode.length).toBeLessThan(BUMBLEBEE.maxLineBytes);expect(new TextEncoder().encode(unicode).length).toBeGreaterThan(BUMBLEBEE.maxLineBytes);
 expect(()=>parseBumblebeeWire(new TextEncoder().encode(unicode))).toThrow('bumblebee_invalid_wire');
 const reordered=summary({counts:{finding:0,package:1}});expect(parseBumblebeeWire(wire([reordered]))).toHaveLength(1);
});

test('Bumblebee wire uses Go UTF8 ordering for lifecycle identity fields',()=>{
 // Go sort.Strings orders UTF-8 bytes; JS default sort orders UTF-16 units.
 const p=pkg({has_lifecycle_scripts:true,lifecycle_scripts:['😀','\ue000']});
 expect(parseBumblebeeWire(wire([p]))[0]!.record_id).toBe(p.record_id);
 const reordered=pkg({has_lifecycle_scripts:true,lifecycle_scripts:['\ue000','😀']});
 expect(reordered.record_id).toBe(p.record_id);expect(parseBumblebeeWire(wire([reordered]))).toHaveLength(1);
});
