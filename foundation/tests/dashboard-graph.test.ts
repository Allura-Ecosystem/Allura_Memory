import {test,expect} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {readGraph,filterGraph,layoutGraph} from '../src/dashboard-graph.ts';
const a=randomUUID(),b=randomUUID(),e=randomUUID();
const fixture=()=>({nodes:[{id:a,kind:'semantic',content:'Current policy',contentTruncated:false,version:2,lifecycle:'current'},{id:b,kind:'semantic',content:'Old policy',contentTruncated:false,version:1,lifecycle:'superseded'},{id:e,kind:'evidence',content:'Source',contentTruncated:false}],edges:[{from:a,to:b,relation:'supersedes'},{from:a,to:e,relation:'evidence'}],counts:{nodes:3,edges:2},truncated:false});
test('graph presentation rejects malformed duplicate dangling and unbounded source shapes',()=>{
 expect(readGraph(fixture()).nodes).toHaveLength(3);expect(readGraph(fixture()).edges).toHaveLength(2);
 const invalid:unknown[]=[null,[],{}, {...fixture(),truncated:'no'}, {...fixture(),counts:{nodes:2,edges:2}}, {...fixture(),nodes:[...fixture().nodes,fixture().nodes[0]]}, {...fixture(),edges:[{from:a,to:randomUUID(),relation:'supersedes'}]}, {...fixture(),edges:[{from:a,to:b,relation:'knows'}]}, {...fixture(),edges:[{from:a,to:b,relation:'evidence'}]}, {...fixture(),edges:[{from:a,to:e,relation:'supersedes'}]}, {...fixture(),edges:[{from:a,to:a,relation:'supersedes'}]}, {...fixture(),nodes:[{...fixture().nodes[0],version:1.5}]}, {...fixture(),nodes:[{...fixture().nodes[0],id:'1.5'}]}, {...fixture(),nodes:[{...fixture().nodes[0],content:'x'.repeat(1001)}]}, {...fixture(),nodes:Array.from({length:61},()=>({...fixture().nodes[0],id:randomUUID()}))}, {...fixture(),edges:Array(4000).fill(fixture().edges[0])}];
 for(const value of invalid){expect(()=>readGraph(value)).toThrow('dashboard_unknown');}
 expect(()=>readGraph({...fixture(),edges:[...fixture().edges,fixture().edges[0]],counts:{nodes:3,edges:3}})).toThrow('dashboard_unknown');
 expect(readGraph({nodes:[],edges:[],counts:{nodes:0,edges:0},truncated:true}).truncated).toBe(true);
});
test('graph filters and deterministic layout preserve visible endpoints and finite work',()=>{
 const graph=readGraph(fixture());expect(filterGraph(graph,'','all').nodes).toHaveLength(3);const lineage=filterGraph(graph,'','supersedes');expect(lineage.nodes).toHaveLength(2);expect(lineage.edges).toHaveLength(1);
 const search=filterGraph(graph,'Current','all');expect(search.nodes.map(n=>n.id)).toEqual([a]);expect(search.edges).toEqual([]);expect(filterGraph(graph,'missing','all').nodes).toEqual([]);
 expect(()=>filterGraph(graph,'','invented')).toThrow('dashboard_invalid');expect(()=>filterGraph(graph,'x'.repeat(201),'all')).toThrow('dashboard_invalid');
 const positions=layoutGraph(graph.nodes);expect(positions).toEqual(layoutGraph([...graph.nodes].reverse()));expect(positions).toHaveLength(3);expect(new Set(positions.map(p=>`${p.x}/${p.y}`)).size).toBe(3);expect(positions.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
 expect(layoutGraph([])).toEqual([]);expect(()=>layoutGraph(Array(61).fill(graph.nodes[0]))).toThrow('dashboard_invalid');
});
