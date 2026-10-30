import {test,expect} from 'bun:test';
import {type SQL} from 'bun';
import {authenticateMachine} from '../src/authentication.ts';
import {type AuthorityRecord} from '../src/authority.ts';
import {captureIndex,drainIndexBatch} from '../src/indexing.ts';
import {searchIndex} from '../src/retrieval-index.ts';
import {searchFederated} from '../src/retrieval-federation.ts';
import {scopedHealth} from '../src/operations.ts';
import {EMBEDDING,OPENAI_EMBEDDING,type Embedder} from '../src/embedding.ts';
const scope={groupId:'allura-fixture',workspaceId:'11111111-1111-4111-8111-111111111111'},principalId='22222222-2222-4222-8222-222222222222',source='33333333-3333-4333-8333-333333333333';
// Explicit SQL seam: records parameter binding, not database/RLS acceptance proof.
async function fixture(){
 const credential={...scope,principalId,kind:'service' as const,actions:['memory:read','proposal:write','health:read'],expiresAt:Math.floor(Date.now()/1000)+600,revoked:false};
 const identity=await authenticateMachine('a'.repeat(64),async()=>credential);
 const authority:AuthorityRecord={...scope,principalId,kind:'service',role:'workspace_admin',principalActive:true,membershipActive:true,tenantActive:true,workspaceLocked:false,grantActive:true,reviewApprove:false,credentialActions:credential.actions};
 const calls:{sql:string;values:unknown[]}[]=[];
 const tx=Object.assign(async(strings:TemplateStringsArray,...values:unknown[])=>{
  const sql=strings.join('?');calls.push({sql,values});
  if(sql.includes('resolve_authority')){return [{authority,credential}];}
  if(sql.includes('claim_index')){return [{claim:{state:'claimed',leaseId:source,content:'synthetic only'}}];}
  if(sql.includes('finish_index')){return [{state:'succeeded'}];}
  if(sql.includes('additional_action')){return [{evidence:false}];}
  if(sql.includes('scoped_operational_health')){return [{durable:{currentSemantic:0,missingSemanticVectors:0,capturedEvents:0,missingEventVectors:0,jobs:{}}}];}
  return [];
 },{savepoint:async(work:(t:unknown)=>unknown)=>work(tx)});
 const sql={begin:async(work:(t:unknown)=>unknown)=>work(tx)} as unknown as SQL;
 return {sql,identity,calls};
}
test('index publishing and all retrieval paths bind the selected identity without default reinterpretation',async()=>{
 for(const model of [EMBEDDING,OPENAI_EMBEDDING]){
  const f=await fixture(),provider:Embedder={identity:model,embed:async()=>[1,...Array<number>(383).fill(0)]};
  await captureIndex(f.sql,f.identity,scope,'event',source,provider);
  await drainIndexBatch(f.sql,f.identity,scope,provider);
  await searchIndex(f.sql,f.identity,scope,{query:'synthetic',mode:'vector',limit:1},provider);
  await searchFederated(f.sql,f.identity,scope,{query:'synthetic',status:'all'},provider);
  const health=await scopedHealth(f.sql,f.identity,scope,provider);expect(health.model).toEqual(model);
  for(const name of ['claim_index','finish_index','index_candidates','retrieval_event_vectors','scoped_operational_health']){const call=f.calls.find(c=>c.sql.includes('allura.'+name+'('));expect(call).toBeDefined();expect(call!.values).toContain(model.indexVersion);}
  for(const query of f.calls.filter(c=>c.sql.includes('JOIN allura.source_vectors'))){for(const value of [model.indexVersion,model.model,model.revision,model.dimensions]){expect(query.values).toContain(value);}}
 }
});
test('aborted embedding work never publishes a successful vector after late settlement',async()=>{
 const f=await fixture(),controller=new AbortController();let resolve!:(v:number[])=>void;
 const provider:Embedder={identity:OPENAI_EMBEDDING,embed:async()=>{controller.abort();return new Promise<number[]>(r=>{resolve=r;});}};
 await captureIndex(f.sql,f.identity,scope,'event',source,provider,controller.signal).catch(()=>{});
 resolve([1,...Array<number>(383).fill(0)]);await Bun.sleep(10);
 const finishes=f.calls.filter(c=>c.sql.includes('finish_index'));expect(finishes.every(c=>c.values.includes(false))).toBe(true);expect(finishes.some(c=>c.values.includes(true))).toBe(false);
});
test('append only migration widens only complete model contracts and preserves old function identities',async()=>{
 const file=Bun.file(new URL('../migrations/020-embedding-providers.sql',import.meta.url));expect(await file.exists()).toBe(true);
 const sql=await file.text();expect(sql).not.toContain('CREATE OR REPLACE');expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY|DROP POLICY|GRANT (?:UPDATE|INSERT|DELETE)|TRUNCATE|DELETE FROM/i);
 for(const name of ['claim_index','finish_index','index_candidates','retrieval_event_vectors','scoped_operational_health']){expect(sql).toContain('CREATE FUNCTION allura.'+name+'(');}
 expect(sql).toContain("e.actor_id::text=current_setting('allura.principal',true) OR allura.additional_action(g,w,'evidence:read')");
 expect(sql).toContain('provider-managed-alias');expect(sql).toContain('openai-text-embedding-3-small-384-normalized-v1');
 expect(await Bun.file(new URL('../src/persistence.ts',import.meta.url)).text()).toContain("'019-app-modules.sql', '020-embedding-providers.sql'");
});
test('core startup selects the configured factory and advertises sanitized model identity',async()=>{
 const text=await Bun.file(new URL('../src/core-server.ts',import.meta.url)).text();expect(text).toContain('createEmbedder(config.embedding,process.env)');expect(text).not.toContain('loadLocalEmbedder');expect(text).toContain('embedding:provider.identity');expect(text).toContain("to_regprocedure('allura.claim_index(text,uuid,text,uuid,text)') IS NOT NULL");expect(text).toContain("to_regprocedure('allura.finish_index(text,uuid,text,uuid,uuid,jsonb,boolean,text)') IS NOT NULL");
});
