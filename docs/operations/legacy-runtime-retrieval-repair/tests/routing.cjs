const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const ts=require(process.env.TYPESCRIPT_PATH), root=process.argv[2];
function load(path,require){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(root+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:m.exports,module:m,require,Date,Set,Map,console});return m.exports}
const search=load('/src/mcp/canonical-tools/deterministic-search.ts',()=>({}));
let calls=[];
const canonical=load('/src/mcp/canonical-tools.ts',name=>{
 if(name.includes('deterministic-search'))return search;
 if(name==='@/lib/graph-adapter')return {getGraphBackend:()=> 'ruvector'};
 if(name.endsWith('/connection'))return {getConnections:async()=>({pg:'synthetic-pool'})};
 if(name.endsWith('/validation-utils'))return {validateGroupId:x=>x};
 if(name==='@/lib/db/tenant-transaction')return {tenantQuery:async(context,sql,values,pool)=>{calls.push({context,sql,values,pool});return {rows:[]}}};
 return {};
});
const request={query:'Brooks',group_id:'allura-fixture',scope:{group_id:'allura-fixture',workspace_id:'workspace-a',agent_id:'principal-a'}};
(async()=>{
const response=await canonical.memory_search(request);
assert.equal(calls.length,2);assert.ok(calls[0].sql.includes('FROM events'));assert.ok(calls[1].sql.includes('FROM graph_memories'));
for(const c of calls){assert.equal(c.context.tenantId,request.group_id);assert.equal(c.context.workspaceId,'workspace-a');assert.equal(c.context.principalId,'principal-a');assert.equal(c.pool,'synthetic-pool');assert.equal(c.values[2],'principal-a')}
assert.equal(response.meta.retrieval_config_version,'pg-scoped-lexical-v1');
calls=[];await assert.rejects(canonical.memory_search({...request,scope:undefined}),/verified MCP workspace/);assert.equal(calls.length,0);
await assert.rejects(canonical.memory_search({...request,user_id:'different-principal'}),/permission denied/);assert.equal(calls.length,0);
let count=0;await assert.rejects(search.deterministicSearch(request,async()=>{count++;if(count===1)return {rows:[]};throw {cause:{code:'42501'}}},'ruvector'),/permission denied/);assert.equal(count,2);
const down=await search.deterministicSearch(request,async()=>{throw Error('private details')},'ruvector');assert.equal(down.count,0);assert.equal(down.meta.incomplete,true);assert.equal(down.meta.warnings.length,2);assert.ok(!JSON.stringify(down).includes('private details'));
const unsupported=await search.deterministicSearch(request,async()=>({rows:[]}),'ruvector-crate');assert.ok(unsupported.meta.coverage_limitations.includes('semantic_coverage_unavailable'));
console.log('PASS canonical routing, scope propagation, missing/mismatched authority, second-store denial, complete outage, unsupported backend');
})().catch(e=>{console.error(e);process.exitCode=1});
