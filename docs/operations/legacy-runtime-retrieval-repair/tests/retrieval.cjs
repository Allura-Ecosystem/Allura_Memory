// Synthetic only: an isolated, network-disabled disposable PostgreSQL container.
// Never accepts a database URL, production container, credentials, or tenant data.
const fs=require('fs'), vm=require('vm'), assert=require('assert/strict'), cp=require('child_process');
const ts=require(process.env.TYPESCRIPT_PATH);
const root=process.argv[2]; if(!root) throw Error('offline source root required');
const moduleObject={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(root+'/src/mcp/canonical-tools/deterministic-search.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:moduleObject.exports,module:moduleObject,require,Date,Set,Map,console});
const {deterministicSearch:search,EPISODIC_SQL,SEMANTIC_SQL,HISTORY_SQL,mergeRows}=moduleObject.exports;
const container='allura-retrieval-synthetic-20261113';
const inspect=JSON.parse(cp.execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(inspect.HostConfig.NetworkMode,'none'); assert.ok(Object.hasOwn(inspect.HostConfig.Tmpfs,'/var/lib/postgresql/data'));
function sql(q){return cp.execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()}
const lit=v=>v===null?'NULL':Array.isArray(v)?`ARRAY[${v.map(lit).join(',')}]`:typeof v==='boolean'?String(v):typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const base={group_id:'allura-fixture',scope:{group_id:'allura-fixture',workspace_id:'workspace-a',agent_id:'principal-a'},query:'Brooks',limit:5};
function executeFor(req){return async(q,v)=>{const bound=q.replace(/\$(\d+)/g,(_,n)=>lit(v[Number(n)-1])); const out=sql(`BEGIN; SET LOCAL ROLE fixture_reader; SET LOCAL app.fixture_group=${lit(req.group_id)}; SET LOCAL app.fixture_workspace=${lit(req.scope.workspace_id)}; SELECT coalesce(json_agg(result),'[]'::json) FROM (${bound}) result; ROLLBACK;`); return {rows:JSON.parse(out)} }}
const run=(req=base)=>search(req,executeFor(req),'ruvector');
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
(async()=>{
sql(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO public; CREATE EXTENSION pg_trgm;
DO $$ BEGIN CREATE ROLE fixture_reader; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE events(id text,group_id text,workspace_id text,event_type text,metadata jsonb,created_at timestamptz);
CREATE TABLE graph_memories(id text,group_id text,workspace_id text,workspace_scope_state text,user_id text,content text,score float8,provenance text,created_at timestamptz,version int,tags text[],deprecated boolean default false,deleted_at timestamptz,content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english',content)) STORED);
CREATE TABLE graph_supersedes(newer_id text,superseded_id text,group_id text,workspace_id text,workspace_scope_state text);
GRANT SELECT ON ALL TABLES IN SCHEMA public TO fixture_reader;
${['events','graph_memories','graph_supersedes'].map(t=>`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${t} FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON ${t} USING (group_id=current_setting('app.fixture_group') AND workspace_id=current_setting('app.fixture_workspace'));`).join('\n')}
`);
function episode(id,content,group='allura-fixture',workspace='workspace-a',principal='principal-a',event='memory_add',date='2026-01-01T00:00:00Z'){
 sql(`INSERT INTO events VALUES(${lit('event-'+id+'-'+event)},${lit(group)},${lit(workspace)},${lit(event)},${lit(JSON.stringify({memory_id:id,content,user_id:principal,source:'manual',tags:[]}))}::jsonb,${lit(date)})`)
}
function semantic(id,content,opts={}){sql(`INSERT INTO graph_memories(id,group_id,workspace_id,workspace_scope_state,user_id,content,score,provenance,created_at,version,tags,deprecated) VALUES(${lit(id)},${lit(opts.group||'allura-fixture')},${lit(opts.workspace||'workspace-a')},'workspace_scoped',${lit(opts.principal||'principal-a')},${lit(content)},0.9,'manual','2026-01-01',${opts.version||1},'{}',${opts.deprecated||false})`)}
episode('receipt-brooks','Brooks receipt: cowork was described as Brooks.');
episode('correction-brooks','Brooks correction: cowork is plain Codex with Allura.');
episode('special-phrase','unique amethyst lighthouse');episode('literal-percent','100%_literal');
episode('tenant-secret','classified brooks','allura-other');episode('workspace-secret','classified brooks','allura-fixture','workspace-b');episode('principal-secret','classified brooks','allura-fixture','workspace-a','principal-b');
episode('deleted','Brooks deleted');episode('deleted','',undefined,undefined,undefined,'memory_delete','2026-02-01');
semantic('old-fact','previous orchid guidance',{deprecated:true});semantic('new-fact','current azure guidance',{version:2});semantic('unrelated-new','unrelated unrelated unrelated');
semantic('shared','shared quartz evidence',{principal:'principal-b'});semantic('semantic-secret','classified brooks',{group:'allura-other'});
sql("INSERT INTO graph_supersedes VALUES('new-fact','old-fact','allura-fixture','workspace-a','workspace_scoped')");
for(let i=0;i<15;i++)episode('tie-'+String(i).padStart(2,'0'),'tie canary');
await test('Brooks correction is top five without embeddings',async()=>assert.ok((await run()).results.some(r=>r.id==='correction-brooks')));
await test('all seeded exact IDs and distinctive phrases recall expected records',async()=>{for(const [query,id] of [['receipt-brooks','receipt-brooks'],['correction-brooks','correction-brooks'],['unique amethyst lighthouse','special-phrase'],['100%_literal','literal-percent'],['old-fact','old-fact'],['current azure guidance','new-fact'],['shared quartz evidence','shared']])assert.ok((await run({...base,query,limit:100})).results.some(r=>r.id===id),query)});
await test('20 frozen repetitions identical IDs versions order with pre-limit ties',async()=>{let expected;for(let i=0;i<20;i++){const r=await run({...base,query:'tie canary'});const ids=JSON.stringify(r.results.map(x=>[x.id,x.version]));if(expected)assert.equal(ids,expected);else expected=ids;assert.equal(r.results[0].id,'tie-00');assert.equal(r.results[4].id,'tie-04')}});
await test('tenant workspace principal isolation and deleted records',async()=>{const r=await run({...base,query:'Brooks',limit:100});for(const id of ['tenant-secret','workspace-secret','principal-secret','semantic-secret','deleted'])assert.ok(!r.results.some(x=>x.id===id));const outside=await run({...base,group_id:'allura-empty',scope:{...base.scope,group_id:'allura-empty'},query:'Brooks'});assert.equal(outside.count,0)});
await test('explicit lineage shows changed wording and no timestamp inference',async()=>{const r=await run({...base,query:'current azure guidance'});const n=r.results.find(x=>x.id==='new-fact');assert.equal(n.relationships[0].predecessor.content,'previous orchid guidance');assert.equal(n.relationships[0].newer.version,2);assert.ok(!n.relationships.some(x=>x.predecessor_id==='unrelated-new'))});
await test('shared semantic visibility preserved; explicit user filter narrows',async()=>{assert.ok((await run({...base,query:'shared quartz evidence'})).results.some(x=>x.id==='shared'));assert.ok(!(await run({...base,query:'shared quartz evidence',user_id:'principal-a'})).results.some(x=>x.id==='shared'))});
await test('permission denial stops all further sources including wrapped 42501',async()=>{let calls=0;await assert.rejects(search(base,async()=>{calls++;throw {cause:{code:'42501'}}},'ruvector'),/permission denied/);assert.equal(calls,1);await assert.rejects(search({...base,user_id:'principal-b'},async()=>{throw Error('must not execute')},'ruvector'),/permission denied/)});
await test('outage yields explicit sanitized partial coverage',async()=>{const r=await search(base,async(q,v)=>{if(q===EPISODIC_SQL)throw Error('private database connection details');return executeFor(base)(q,v)},'ruvector');assert.equal(r.meta.degraded,true);assert.ok(r.meta.coverage_limitations.includes('postgres_unavailable'));assert.ok(!JSON.stringify(r).includes('private database'));assert.equal(r.meta.incomplete,true)});
await test('literal percent never becomes wildcard; approved excludes episodic',async()=>{assert.equal(JSON.stringify((await run({...base,query:'%_'})).results.map(r=>r.id)),JSON.stringify(['literal-percent']));assert.ok(!(await run({...base,status:'approved'})).results.some(r=>r.source==='episodic'))});
await test('deduplicate ID and version without dropping distinct versions',async()=>{const item={id:'a',version:1,created_at:'2026-01-01',content:'a',source:'semantic',score:0.9,relevance:2};assert.equal(mergeRows([item,{...item}, {...item,version:2}],10).length,2)});
await test('source limits and unknown revisions reported',async()=>{const r=await run({...base,query:'tie canary'});assert.ok(r.meta.coverage_limitations.includes('postgres_results_limited'));assert.equal(r.meta.index_revision,null);assert.equal(r.meta.retrieval_config_version,'pg-scoped-lexical-v1')});
const times=[]; for(let i=0;i<20;i++){const t=performance.now();await run({...base,query:['Brooks','unique amethyst lighthouse','current azure guidance','shared quartz evidence'][i%4]});times.push(performance.now()-t)}
times.sort((a,b)=>a-b); console.log(JSON.stringify({passed,corrected_baseline:{samples:times.length,p50_ms:times[9],p95_ms:times[18],conditions:'synthetic PostgreSQL, new psql process per query, no optimization comparison or production latency claim'}}));
})().catch(e=>{console.error(e);process.exitCode=1});
