import {test,expect} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {readDashboardContext,dashboardRows,dashboardNotice,knowledgeQuery} from '../src/dashboard-view.ts';
test('dashboard presentation binds current context and rejects malformed scope or response shapes',()=>{
 const scope={groupId:'allura-view',workspaceId:randomUUID()},value={scope,kind:'human' as const,principalId:randomUUID(),role:'curator',actions:['memory:read','review:read'],observedAt:new Date().toISOString()};
 expect(readDashboardContext(value,scope)).toEqual(value);for(const bad of [{...value,scope:{...scope,workspaceId:randomUUID()}},{...value,kind:'machine'},{...value,role:'root'},{...value,actions:'memory:read'},{...value,principalId:'1.5'},{...value,observedAt:'yesterday'}]){expect(()=>readDashboardContext(bad,scope)).toThrow('dashboard_unknown');}
 expect(dashboardRows('memories',{items:[],hasMore:false,nextCursor:null})).toEqual([]);expect(dashboardRows('curator',{items:[],hasMore:false})).toEqual([]);expect(dashboardRows('devices',{devices:[],truncated:false})).toEqual([]);expect(dashboardRows('audit',[])).toEqual([]);
 for(const bad of [{},null,{items:'private'},{items:[null],hasMore:false},{items:Array.from({length:21},()=>({id:'hidden'})),hasMore:false}]){expect(()=>dashboardRows('memories',bad)).toThrow('dashboard_unknown');}expect(()=>dashboardRows('devices',{devices:[]})).toThrow('dashboard_unknown');
});
test('dashboard search matches federated fields and honestly labels partial failed truncated responses',()=>{
 expect(knowledgeQuery('  handbook  ',true)).toEqual({query:'handbook',status:'approved',limit:20,history:true});expect(knowledgeQuery('rule',false)).not.toHaveProperty('mode');for(const q of ['', 'é'.repeat(1001),'x\u0000y']){expect(()=>knowledgeQuery(q,false)).toThrow('dashboard_invalid');}
 const partial={results:[{id:randomUUID(),content:'Actual fallback'}],degraded:true,outcome:'partial',paths:[{path:'vector',state:'failed'}],candidateTruncated:false};expect(dashboardRows('memories',partial)).toHaveLength(1);expect(dashboardNotice(partial)).toContain('Degraded');expect(dashboardNotice({...partial,outcome:'failed'})).toContain('Unavailable');expect(dashboardNotice({devices:[],truncated:true})).toContain('bounded');expect(dashboardNotice({items:[],hasMore:false})).toContain('Fetched');expect(()=>dashboardRows('memories',{results:[],degraded:'false'})).toThrow('dashboard_unknown');
});
