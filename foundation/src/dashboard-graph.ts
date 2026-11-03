import {DashboardError} from './dashboard-transport.ts';
import {DASHBOARD_LIMITS} from './dashboard-contract.ts';
import type {GraphNode,GraphEdge} from './retrieval.ts';
export type GraphSnapshot={nodes:GraphNode[];edges:GraphEdge[];truncated:boolean};
export const GRAPH_RELATIONS=['all','supersedes','exact_text','evidence'] as const;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v)){throw new DashboardError('unknown');}return v as Record<string,unknown>;};
function check(condition:unknown):asserts condition{if(!condition){throw new DashboardError('unknown');}}
export function readGraph(value:unknown):GraphSnapshot{
 const row=object(value),counts=object(row.counts);check(Array.isArray(row.nodes)&&row.nodes.length<=DASHBOARD_LIMITS.graphSemanticNodes+DASHBOARD_LIMITS.graphEvidenceNodes);check(Array.isArray(row.edges)&&row.edges.length<=40*39*2+20);check(typeof row.truncated==='boolean'&&counts.nodes===row.nodes.length&&counts.edges===row.edges.length);
 const nodes:GraphNode[]=[],byId=new Map<string,GraphNode>();let semantic=0,evidence=0;
 for(const raw of row.nodes){const n=object(raw);check(uuid(n.id)&&!byId.has(n.id)&&typeof n.content==='string'&&n.content.length<=1000&&typeof n.contentTruncated==='boolean');check(n.kind==='semantic'||n.kind==='evidence');
  if(n.kind==='semantic'){check(typeof n.version==='number'&&Number.isSafeInteger(n.version)&&n.version>0&&['current','superseded','deprecated'].includes(String(n.lifecycle)));semantic++;}else{check(n.version===undefined&&n.lifecycle===undefined);evidence++;}
  const node:GraphNode={id:n.id,kind:n.kind,content:n.content,contentTruncated:n.contentTruncated,...(n.kind==='semantic'?{version:n.version as number,lifecycle:n.lifecycle as NonNullable<GraphNode['lifecycle']>}:{})};nodes.push(node);byId.set(node.id,node);
 }
 check(semantic<=DASHBOARD_LIMITS.graphSemanticNodes&&evidence<=DASHBOARD_LIMITS.graphEvidenceNodes);const edges:GraphEdge[]=[],seen=new Set<string>();
 for(const raw of row.edges){const e=object(raw);check(uuid(e.from)&&uuid(e.to)&&e.from!==e.to&&byId.has(e.from)&&byId.has(e.to));check(['supersedes','exact_text','evidence'].includes(String(e.relation)));check(byId.get(e.from)!.kind==='semantic'&&byId.get(e.to)!.kind===(e.relation==='evidence'?'evidence':'semantic'));const key=JSON.stringify([e.from,e.to,e.relation]);check(!seen.has(key));seen.add(key);edges.push({from:e.from,to:e.to,relation:e.relation as GraphEdge['relation']});}
 return {nodes,edges,truncated:row.truncated};
}
export function filterGraph(graph:GraphSnapshot,query:string,relation:string):GraphSnapshot{
 if(typeof query!=='string'||query.length>200||!(GRAPH_RELATIONS as readonly string[]).includes(relation)){throw new DashboardError('invalid');}
 const edges=graph.edges.filter(e=>relation==='all'||e.relation===relation),connected=new Set(edges.flatMap(e=>[e.from,e.to])),needle=query.trim().toLowerCase();const nodes=graph.nodes.filter(n=>(relation==='all'||connected.has(n.id))&&(!needle||n.content.toLowerCase().includes(needle)||n.id.includes(needle)));const ids=new Set(nodes.map(n=>n.id));return {nodes,edges:edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),truncated:graph.truncated};
}
export function layoutGraph(nodes:GraphNode[]):{id:string;x:number;y:number}[]{
 if(nodes.length>60){throw new DashboardError('invalid');}const columns=Math.max(1,Math.min(4,Math.ceil(Math.sqrt(nodes.length))));return [...nodes].sort((a,b)=>(a.kind===b.kind?0:a.kind==='semantic'?-1:1)||a.id.localeCompare(b.id)).map((n,i)=>({id:n.id,x:(.5+i%columns)*(1040/columns),y:160+Math.floor(i/columns)*360}));
}
