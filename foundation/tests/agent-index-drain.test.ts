import {test,expect} from 'bun:test';
import {type SQL} from 'bun';
import {randomBytes,createHash} from 'node:crypto';
import {type AuthorityRecord} from '../src/authority.ts';
import {type MachineCredential} from '../src/authentication.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {OPENAI_EMBEDDING,type Embedder} from '../src/embedding.ts';
const scope={groupId:'allura-fixture',workspaceId:'11111111-1111-4111-8111-111111111111'},principalId='22222222-2222-4222-8222-222222222222',source='33333333-3333-4333-8333-333333333333';
// Synthetic SQL seam only: exercises real gateway/auth/transaction/indexing code,
// not a substitute for PostgreSQL/RLS or deployed runtime acceptance.
function fixture(){
 const token=randomBytes(32).toString('base64url'),digest=createHash('sha256').update(token).digest('hex');
 const state={credential:{...scope,principalId,kind:'service',actions:['memory:read','proposal:write'],expiresAt:Math.floor(Date.now()/1000)+600,revoked:false} as MachineCredential,
  authority:{...scope,principalId,kind:'service',role:'curator',principalActive:true,membershipActive:true,tenantActive:true,workspaceLocked:false,grantActive:true,reviewApprove:false} as AuthorityRecord,
  candidates:[{kind:'event',id:source}],claimState:'claimed',embeds:0,afterEmbed:()=>{}};
 const calls:{sql:string;values:unknown[]}[]=[];
 const query=async(strings:TemplateStringsArray,...values:unknown[])=>{
  const text=strings.join('?');calls.push({sql:text,values});
  if(text.includes('resolve_authority')){return [{authority:state.authority,credential:state.credential}];}
  if(text.includes('lookup_machine')){return [{credential:values[0]===digest?state.credential:null}];}
  if(text.includes('index_candidates')){return state.candidates.slice(0,Number(values[2]));}
  if(text.includes('claim_index')){return [{claim:{state:state.claimState,leaseId:source,content:'synthetic drain fixture'}}];}
  if(text.includes('finish_index')){return [{state:'succeeded'}];}
  if(text.includes('set_config')||text.includes('lock_authority')){return [];}
  throw new Error('unexpected SQL in synthetic fixture');
 };
 const sql=Object.assign(query,{begin:async(work:(tx:unknown)=>unknown)=>work(sql)}) as unknown as SQL;
 const provider:Embedder={identity:OPENAI_EMBEDDING,embed:async()=>{state.embeds++;state.afterEmbed();return [1,...Array<number>(383).fill(0)];}};
 const gateway=createCoreGateway(sql,undefined,'http://127.0.0.1:6488',randomBytes(32),provider,undefined,undefined,'machine-only');
 const send=(body='{}',path='/api/agent/index/drain',headers:Record<string,string>={},requested=scope,method='POST')=>gateway(new Request('http://127.0.0.1:6488'+path+'?'+new URLSearchParams({group_id:requested.groupId,workspace_id:requested.workspaceId}),{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},...(method==='POST'?{body}:{})}));
 return {state,calls,send};
}
test('agent drain accepts only one scoped candidate with current machine authority',async()=>{
 const f=fixture();f.state.candidates.push({kind:'event',id:'44444444-4444-4444-8444-444444444444'});
 const response=await f.send();expect(response.status).toBe(200);expect(await response.json()).toEqual({jobs:[{kind:'event',id:source,state:'succeeded'}]});expect(f.state.embeds).toBe(1);
 const candidates=f.calls.filter(c=>c.sql.includes('index_candidates'));expect(candidates).toHaveLength(1);expect(candidates[0]!.values).toEqual([scope.groupId,scope.workspaceId,1,OPENAI_EMBEDDING.indexVersion]);
 expect(f.calls.filter(c=>c.sql.includes('claim_index'))).toHaveLength(1);expect(f.calls.filter(c=>c.sql.includes('finish_index'))).toHaveLength(1);
 const binding=f.calls.find(c=>c.sql.includes("set_config('allura.principal'"));expect(binding!.values.slice(0,5)).toEqual([principalId,'service',scope.groupId,scope.workspaceId,'proposal:write']);
 expect(f.calls.some(c=>/approve|grant |unsafe|INSERT|UPDATE|DELETE/i.test(c.sql))).toBe(false);
});
test('agent drain requires both credential actions and current grants before candidate work',async()=>{
 for(const actions of [[],['memory:read'],['proposal:write']]){const f=fixture();f.state.credential={...f.state.credential,actions};expect((await f.send()).status).toBe(403);expect(f.calls.some(c=>c.sql.includes('index_candidates'))).toBe(false);expect(f.state.embeds).toBe(0);}
 for(const patch of [{grantActive:false},{membershipActive:false},{tenantActive:false},{principalActive:false},{workspaceLocked:true},{role:'viewer'}]){const f=fixture();Object.assign(f.state.authority,patch);expect((await f.send()).status).toBe(403);expect(f.state.embeds).toBe(0);expect(f.calls.some(c=>c.sql.includes('index_candidates'))).toBe(false);}
});
test('agent drain rejects invalid expired revoked mixed and foreign credentials',async()=>{
 for(const headers of [{Authorization:''},{Authorization:'Bearer invalid'},{'Cf-Access-Jwt-Assertion':'invalid'},{Cookie:'CF_Authorization=invalid'}]){const f=fixture();expect((await f.send('{}',undefined,headers)).status).toBe(401);expect(f.state.embeds).toBe(0);}
 for(const patch of [{revoked:true},{expiresAt:0}]){const f=fixture();Object.assign(f.state.credential,patch);expect((await f.send()).status).toBe(401);expect(f.state.embeds).toBe(0);}
 for(const requested of [{...scope,groupId:'allura-foreign'},{...scope,workspaceId:'44444444-4444-4444-8444-444444444444'}]){const f=fixture();expect((await f.send('{}',undefined,{},requested)).status).toBe(403);expect(f.state.embeds).toBe(0);expect(f.calls.some(c=>c.sql.includes('index_candidates'))).toBe(false);}
});
test('agent drain rejects body overrides and leaves human routes disabled',async()=>{
 for(const body of ['', 'null','[]','bad','{"limit":8}','{"sourceId":"'+source+'"}','{"principalId":"'+principalId+'"}','{"approve":true}','{"group_id":"allura-foreign"}']){const f=fixture();expect((await f.send(body)).status).toBe(400);expect(f.calls.some(c=>c.sql.includes('index_candidates'))).toBe(false);}
 const f=fixture();expect((await f.send('{}',undefined,{},scope,'GET')).status).toBe(404);
 for(const path of ['/api/index/drain','/api/review/decision','/api/access']){expect((await f.send('bad',path,{'Cf-Access-Jwt-Assertion':'invalid'})).status).toBe(404);}expect(f.calls).toHaveLength(0);
});
test('agent drain preserves empty and denied claims without embedding or promotion',async()=>{
 const empty=fixture();empty.state.candidates=[];const none=await empty.send();expect(none.status).toBe(200);expect(await none.json()).toEqual({jobs:[]});expect(empty.state.embeds).toBe(0);
 const denied=fixture();denied.state.claimState='not_found';const response=await denied.send();expect(response.status).toBe(200);expect(await response.json()).toEqual({jobs:[{kind:'event',id:source,state:'not_found'}]});expect(denied.state.embeds).toBe(0);expect(denied.calls.some(c=>c.sql.includes('finish_index'))).toBe(false);
});
test('agent drain rechecks read authority before disclosing completed work',async()=>{
 const f=fixture();f.state.afterEmbed=()=>{f.state.credential={...f.state.credential,actions:['proposal:write']};};
 const response=await f.send();expect(response.status).toBe(503);expect(await response.json()).toEqual({outcome:'unknown'});expect(f.state.embeds).toBe(1);expect(f.calls.some(c=>c.sql.includes('finish_index'))).toBe(true);
});
