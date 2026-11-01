import {test,expect} from 'bun:test';
import {parseWorkBody,parseWorkCreateBody} from '../src/work-plane-api.ts';
const value={group_id:'allura-wire',workspace_id:'11111111-1111-4111-8111-111111111111',actor_id:'22222222-2222-4222-8222-222222222222',operation_key:'opaque:Key.1',expected_updated_at:'2026-01-02T03:04:05.123456Z',to_status:'in_progress'};
test('work HTTP flat parser preserves exact strings whitespace and optional nulls',()=>{
 for(const reason of [null,'',' Exact é 🧠\r\n\t ','é'.repeat(1024)]){
  const body={...value,reason,evidence_id:null};expect(parseWorkBody(JSON.stringify(body,null,2))).toEqual(body);
 }
 expect(parseWorkBody(' \r\n\t'+JSON.stringify(value)+'\n')).toEqual(value);
 expect(parseWorkBody(JSON.stringify(value).replace('"operation_key"','"operation_\\u006bey"'))).toEqual(value);
});
test('work HTTP flat parser rejects decoded duplicates overrides malformed primitives and bounds',()=>{
 const raw=JSON.stringify(value);
 const malformed=['null','[]','{}','1','true','"text"','\ufeff'+raw,raw+'x',raw.slice(0,-1)+',}',raw.replace(':"in_progress"',':[]'),raw.replace(':"in_progress"',':{}'),raw.replace(':"in_progress"',':true'),raw.replace(':"in_progress"',':42')];
 for(const key of Object.keys(value)){
  malformed.push(raw.slice(0,-1)+`,"${key}":"changed"}`,raw.slice(0,-1)+`,"${key.replace(key[0]!,`\\u${key.charCodeAt(0).toString(16).padStart(4,'0')}`)}":"changed"}`);
  for(const wrong of [null,1,true,[],{}]){malformed.push(JSON.stringify({...value,[key]:wrong}));}
 }
 for(const extra of ['contract','command','digest','__proto__','constructor','unknown']){malformed.push(raw.slice(0,-1)+`,"${extra}":null}`);}
 for(const change of [{reason:'x'.repeat(2049)},{reason:'\0'},{reason:'\ud800'},{evidence_id:'unsupported'},{operation_key:'bad/key'},{operation_key:'x'.repeat(129)},{expected_updated_at:'2026-01-02T03:04:05.123Z'},{expected_updated_at:'2026-02-30T03:04:05.123456Z'},{to_status:'unknown'}]){malformed.push(JSON.stringify({...value,...change}));}
 malformed.push(' '.repeat(65537)+raw);
 for(const body of malformed){expect(()=>parseWorkBody(body)).toThrow('invalid');}
});

const create={group_id:value.group_id,workspace_id:value.workspace_id,operation_key:'create:wire',project_id:'Opaque+é',title:'Exact 🧠'};
test('work create HTTP parser preserves nested JSON data and rejects decoded duplicate keys at every depth',()=>{
 const special=JSON.parse('[{"__proto__":{"x":1},"constructor":2,"prototype":3},{"x":1},{"x":2}]'),body={...create,acceptance_criteria:special};expect(parseWorkCreateBody(JSON.stringify(body))).toEqual(body);
 const raw=JSON.stringify(create),prefix=raw.slice(0,-1)+',"acceptance_criteria":';
 for(const criteria of ['[{"a":1,"a":2}]','[{"a":1,"\\u0061":2}]','[[{"x":{"k":1,"k":2}}]]','[1,]','[{"x":}]','[.1]','[01]','[+1]','[1.]','[NaN]','[Infinity]']){expect(()=>parseWorkCreateBody(prefix+criteria+'}')).toThrow('invalid');}
 for(const k of Object.keys(create)){expect(()=>parseWorkCreateBody(raw.slice(0,-1)+`,"${k}":null}`)).toThrow('invalid');}
 for(const k of ['description','priority','owner_id','lane_id','acceptance_criteria']){expect(()=>parseWorkCreateBody(raw.slice(0,-1)+`,"${k}":null,"${k}":null}`)).toThrow('invalid');}
 for(const k of ['__proto__','constructor','prototype','actor_id','contract','command','id','status','team_id']){expect(()=>parseWorkCreateBody(raw.slice(0,-1)+`,"${k}":null}`)).toThrow('invalid');}
 expect(Object.hasOwn(Object.prototype,'x')).toBe(false);
});
test('work create HTTP parser enforces exact numeric Unicode depth and byte boundaries',()=>{
 const raw=JSON.stringify(create),prefix=raw.slice(0,-1)+',"acceptance_criteria":';
 for(const n of ['1','1.0','1e0','-0','0.10','5e-324','9007199254740991']){expect((parseWorkCreateBody(prefix+'['+n+']}').acceptance_criteria as number[])[0]).toBe(Number(n)===0?0:Number(n));}
 for(const n of ['9007199254740992','9007199254740993','1.0000000000000001','0.10000000000000001','1e309','1e-324','1e1000000']){expect(()=>parseWorkCreateBody(prefix+'['+n+']}')).toThrow('invalid');}
 for(const text of ['\ufeff'+raw,raw+'x',raw.slice(0,-1)+',}',prefix+'["\\ud800"]}',prefix+'["\\u0000"]}',prefix+'[{"\\udfff":0}]}']){expect(()=>parseWorkCreateBody(text)).toThrow('invalid');}
 const depth8='['.repeat(8)+'0'+']'.repeat(8);expect(parseWorkCreateBody(prefix+depth8+'}').acceptance_criteria).toEqual(JSON.parse(depth8));expect(()=>parseWorkCreateBody(prefix+'['+depth8+']}')).toThrow('invalid');
 expect(parseWorkCreateBody(' '.repeat(65536-Buffer.byteLength(raw))+raw)).toEqual(create);expect(()=>parseWorkCreateBody(' '.repeat(65537-Buffer.byteLength(raw))+raw)).toThrow('invalid');
 const unicode={...create,acceptance_criteria:['é','é','\r\n\t','🧠']};expect(parseWorkCreateBody(JSON.stringify(unicode))).toEqual(unicode);
});
