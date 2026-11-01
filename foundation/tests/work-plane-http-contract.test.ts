import {test,expect} from 'bun:test';
import {parseWorkBody} from '../src/work-plane-api.ts';
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
