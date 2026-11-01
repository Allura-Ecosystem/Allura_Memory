import {test,expect} from 'bun:test';
import {parseWorkList,workListBinding,signWorkListCursor,readWorkListCursor,parseWorkTransition,workGraph,workText,workToken,workContract} from '../src/work-plane-contract.ts';
import {createHmac} from 'node:crypto';
const listQuery=(v:Record<string,string>={})=>new URLSearchParams({group_id:'allura-fixture',workspace_id:'10000000-0000-4000-8000-000000000001',project_id:' Project+é%2F ',...v}).toString();
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

test('work list contract preserves exact selectors limits statuses and opaque identifiers',()=>{
 const v=parseWorkList(listQuery());expect(v).toEqual({group_id:'allura-fixture',workspace_id:'10000000-0000-4000-8000-000000000001',project_id:' Project+é%2F ',status:null,lane_id:null,limit:100,cursor:null});expect(Object.isFrozen(v)).toBe(true);
 for(const status of Object.keys(workGraph)){expect(String(parseWorkList(listQuery({status})).status)).toBe(status);}
 for(const limit of ['1','99','100']){expect(parseWorkList(listQuery({limit})).limit).toBe(Number(limit));}
 for(const id of ['é'.repeat(128),' Mixed /+% ','é🧠']){expect(parseWorkList(listQuery({project_id:id})).project_id).toBe(id);}
 expect(parseWorkList(listQuery({lane_id:'unsupported'})).lane_id).toBe('unsupported');
 expect(parseWorkList(listQuery({project_id:'a b'})).project_id).toBe('a b');expect(parseWorkList(listQuery({project_id:'a+b'})).project_id).toBe('a+b');
});
test('work list contract rejects duplicate malformed and unsupported selector values without normalization',()=>{
 for(const extra of ['&project_id=x','&project%5Fid=x','&unknown=x','&lane_id=%','&lane_id=%GG','&lane_id=%80','&lane_id=%C0%AF','&lane_id=%ED%A0%80','&lane_id=%F4%90%80%80','&lane_id=%00','&lane_id=%0A']){expect(()=>parseWorkList(listQuery()+extra)).toThrow('invalid');}
 for(const value of ['0','01','+1','-1','1.0','1e2','101','','9'.repeat(30)]){expect(()=>parseWorkList(listQuery({limit:value}))).toThrow('invalid');}
 for(const v of [{status:'constructor'},{status:''},{lane_id:''},{project_id:''},{project_id:'é'.repeat(129)},{cursor:'x'.repeat(1025)}]){expect(()=>parseWorkList(listQuery(v))).toThrow('invalid');}
 for(const key of ['group_id','workspace_id','project_id']){const q=new URLSearchParams(listQuery());q.delete(key);expect(()=>parseWorkList(q.toString())).toThrow('invalid');}
});
test('work list cursor contract enforces canonical authenticated binding tuple and finite expiry',()=>{
 const key=new Uint8Array(32).fill(7),v=parseWorkList(listQuery()),binding=workListBinding(v,'principal','mapping'),last={created_at:'2024-02-29T23:59:59.123456Z',id:' A+é/ '},now=1000000,cursor=signWorkListCursor(key,binding,last,now);
 expect(readWorkListCursor(cursor,key,binding,now)).toEqual(last);expect(readWorkListCursor(cursor,key,binding,now+899999)).toEqual(last);
 for(const at of [now-1,now+900000,Infinity]){expect(()=>readWorkListCursor(cursor,key,binding,at)).toThrow('invalid');}
 for(const token of [cursor+'=',cursor+'.x',cursor.slice(0,-1),'x'.repeat(1025),'',cursor.replace('.', '..')]){expect(()=>readWorkListCursor(token,key,binding,now)).toThrow('invalid');}
 expect(()=>readWorkListCursor(cursor,new Uint8Array(32).fill(8),binding,now)).toThrow('invalid');
 for(const other of [workListBinding(v,'other','mapping'),workListBinding(v,'principal','other'),...(['group_id','workspace_id','project_id','status','lane_id','limit'] as const).map(k=>workListBinding({...v,[k]:k==='limit'?1:'changed'},'principal','mapping'))]){expect(()=>readWorkListCursor(cursor,key,other,now)).toThrow('invalid');}
 const mac=(p:string)=>p+'.'+createHmac('sha256',key).update('allura-work-list-cursor-v1\0'+p).digest('base64url');
 const payload={b:binding,t:now,c:last.created_at,i:last.id};
 for(const body of [JSON.stringify({...payload,extra:true}),JSON.stringify({...payload,c:'2026-02-30T00:00:00.000000Z'}),JSON.stringify(payload).replace('"t":1000000','"t":1000000,"t":1000000'),JSON.stringify({...payload,i:'\0'}),JSON.stringify({...payload,t:now+0.1})]){expect(()=>readWorkListCursor(mac(Buffer.from(body).toString('base64url')),key,binding,now)).toThrow('invalid');}
 const parts=cursor.split('.'),sig=parts[1]!,alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',alias=sig.slice(0,-1)+alphabet[alphabet.indexOf(sig.at(-1)!)+1];expect(()=>readWorkListCursor(parts[0]+'.'+alias,key,binding,now)).toThrow('invalid');
});
