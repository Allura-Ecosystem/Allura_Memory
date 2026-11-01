import {test,expect} from 'bun:test';
import {parseWorkTransition,workGraph,workText,workToken,workContract} from '../src/work-plane-contract.ts';
const base={contract:workContract,command:'transition',group_id:'allura-fixture',workspace_id:'10000000-0000-4000-8000-000000000001',actor_id:'10000000-0000-4000-8000-000000000002',operation_key:'Case:Keep._-9',expected_updated_at:'2024-02-29T23:59:59.123456Z',to_status:'in_progress'} as const;
test('work plane contract preserves the exact retained graph and six digit Gregorian tokens',()=>{
  expect(workGraph).toEqual({backlog:['ready','cancelled'],ready:['in_progress','backlog','cancelled'],in_progress:['in_review','blocked','done','cancelled'],in_review:['in_progress','done','cancelled'],blocked:['in_progress','cancelled'],done:[],cancelled:[]});
  for(const token of ['0001-01-01T00:00:00.000001Z','2024-02-29T23:59:59.123456Z','9999-12-31T23:59:59.999999Z']){expect(workToken(token)).toBe(true);expect(parseWorkTransition({...base,expected_updated_at:token}).expected_updated_at).toBe(token);}
  for(const token of ['0000-01-01T00:00:00.000000Z','1900-02-29T00:00:00.000000Z','2026-02-29T00:00:00.000000Z','2026-04-31T00:00:00.000000Z','2026-13-01T00:00:00.000000Z','2026-01-01T24:00:00.000000Z','2026-01-01T00:60:00.000000Z','2026-01-01T00:00:60.000000Z','2026-01-01T00:00:00.123Z','2026-01-01T00:00:00.123456+00:00','2026-01-01T00:00:00.123456Z ']){expect(workToken(token)).toBe(false);expect(()=>parseWorkTransition({...base,expected_updated_at:token})).toThrow('invalid');}
});
test('work plane contract rejects unsupported fields primitives accessors and raw duplicate key JSON',()=>{
  for(const key of Object.keys(base)){const v={...base} as Record<string,unknown>;delete v[key];expect(()=>parseWorkTransition(v)).toThrow('invalid');}
  for(const v of [null,[],true,'{"command":"transition","command":"create"}',{...base,command:'create'},{...base,authority_instance_id:'other'},{...base,request_digest:'0'.repeat(64)},{...base,evidence_id:'opaque'},{...base,evidence_id:undefined},{...base,reason:undefined},{...base,to_status:'constructor'},Object.create(base)]){expect(()=>parseWorkTransition(v)).toThrow('invalid');}
  let reads=0;const getter={...base};Object.defineProperty(getter,'reason',{get(){reads++;return 'private';}});expect(()=>parseWorkTransition(getter)).toThrow('invalid');expect(reads).toBe(0);
  const v={...base,reason:'private'};const parsed=parseWorkTransition(v);v.reason='changed';expect(parsed.reason).toBe('private');expect(Object.isFrozen(parsed)).toBe(true);expect(parseWorkTransition(base)).toEqual({...base,reason:null,evidence_id:null});
});
test('work plane contract enforces exact UTF8 id reason and operation key boundaries without normalization',()=>{
  for(const id of ['Legacy:é.A/Keep',' x ', 'é'.repeat(128)]){expect(workText(id,256)).toBe(true);}
  for(const id of ['', 'é'.repeat(129),'nul\0','control\n','\ud800']){expect(workText(id,256)).toBe(false);}
  for(const key of ['A','x'.repeat(128)]){expect(parseWorkTransition({...base,operation_key:key}).operation_key).toBe(key);}
  for(const key of ['', 'x'.repeat(129),' spaced','å']){expect(()=>parseWorkTransition({...base,operation_key:key})).toThrow('invalid');}
  const reason='é'.repeat(1023)+'\r\n';expect(parseWorkTransition({...base,reason}).reason).toBe(reason);
  expect(()=>parseWorkTransition({...base,reason:reason+'a'})).toThrow('invalid');
  expect(()=>parseWorkTransition({...base,reason:'\ud800'})).toThrow('invalid');
  expect(()=>parseWorkTransition({...base,reason:'private\0'})).toThrow('invalid');
});
