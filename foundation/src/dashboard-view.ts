import {DashboardError} from './dashboard-transport.ts';
import {type Scope} from './authority.ts';
export type DashboardRow=Record<string,unknown>;
export type DashboardSession={scope:Scope;kind:'human';principalId:string;role:string;actions:string[];observedAt:string};
const object=(v:unknown):DashboardRow=>{if(!v||typeof v!=='object'||Array.isArray(v)){throw new DashboardError('unknown');}return v as DashboardRow;};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function readDashboardContext(value:unknown,scope:Scope):DashboardSession{
 const v=object(value),s=object(v.scope);
 if(s.groupId!==scope.groupId||s.workspaceId!==scope.workspaceId||v.kind!=='human'||typeof v.principalId!=='string'||!uuid.test(v.principalId)||!['viewer','curator','workspace_admin'].includes(String(v.role))||!Array.isArray(v.actions)||v.actions.length>16||!v.actions.every(a=>typeof a==='string'&&/^[a-z]+(?::[a-z]+){1,2}$/.test(a))||!v.actions.includes('memory:read')||typeof v.observedAt!=='string'||!Number.isFinite(Date.parse(v.observedAt))){throw new DashboardError('unknown');}
 return structuredClone(v) as DashboardSession;
}
export function knowledgeQuery(query:string,history:boolean):DashboardRow{
 const normalized=query.trim();if(!normalized||new TextEncoder().encode(normalized).length>2000||normalized.includes('\0')||typeof history!=='boolean'){throw new DashboardError('invalid');}return {query:normalized,status:'approved',limit:20,history};
}
export function dashboardRows(page:string,value:unknown):DashboardRow[]{
 let list:unknown,max=20;if(page==='audit'){list=value;max=100;}else{
  const v=object(value);
  if(page==='devices'){list=v.devices;max=100;if(typeof v.truncated!=='boolean'){throw new DashboardError('unknown');}}
  else if(page==='memories'||page==='overview'||page==='curator'){
   if(Object.hasOwn(v,'results')&&page!=='curator'){list=v.results;if(typeof v.degraded!=='boolean'||!['succeeded','partial','failed'].includes(String(v.outcome))||!Array.isArray(v.paths)||typeof v.candidateTruncated!=='boolean'){throw new DashboardError('unknown');}}
   else{list=v.items;if(typeof v.hasMore!=='boolean'){throw new DashboardError('unknown');}if(page!=='curator'&&(v.nextCursor!==null&&typeof v.nextCursor!=='string')){throw new DashboardError('unknown');}}
  }else{return [];}
 }
 if(!Array.isArray(list)||list.length>max){throw new DashboardError('unknown');}return list.map(object);
}
export function dashboardNotice(value:unknown):string{
 const v=value&&!Array.isArray(value)&&typeof value==='object'?value as DashboardRow:{};
 if(v.outcome==='failed'){return 'Unavailable. The service did not complete retrieval; this is not an empty-result assertion.';}
 if(v.degraded===true||v.outcome==='partial'){return 'Degraded service result. Inspect observed paths and readiness; completeness is not assured.';}
 if(v.truncated===true||v.candidateTruncated===true||v.hasMore===true){return 'Fetched a bounded result. Additional records may exist; no total population is inferred.';}
 return 'Fetched from the authorized service. Not a live stream.';
}
