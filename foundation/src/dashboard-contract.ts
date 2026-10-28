import {type Action} from './authority.ts';
// Navigation hints only: the server resolves current human authority on every request.
export const DASHBOARD_ROUTES=Object.freeze([
 {page:'overview',path:'/dashboard',label:'Home',action:'memory:read'},
 {page:'memories',path:'/dashboard/memories',label:'Company Knowledge',action:'memory:read'},
 {page:'graph',path:'/dashboard/graph',label:'Memory Map',action:'memory:read'},
 {page:'curator',path:'/dashboard/curator',label:'Review changes',action:'review:read'},
 {page:'apps',path:'/dashboard/apps',label:'Apps',action:'memory:read'},
 {page:'governance',path:'/dashboard/governance',label:'Security & Trust',action:'memory:read'},
 {page:'audit',path:'/dashboard/audit',label:'Audit & Operations',action:'audit:read'},
 {page:'settings',path:'/dashboard/settings',label:'Administration',action:'memory:read'},
 {page:'devices',path:'/dashboard/devices',label:'Devices & agents',action:'memory:read'},
 {page:'embeddings',path:'/dashboard/embeddings',label:'Search settings',action:'health:read'},
].map(row=>Object.freeze(row as Readonly<{page:string;path:string;label:string;action:Action}>)));
export const DASHBOARD_LIMITS=Object.freeze({memoryPage:20,graphSemanticNodes:40,graphEvidenceNodes:20,graphDepth:2,targetChars:2048});
export const DASHBOARD_STATES=Object.freeze(['loading','empty','denied','conflict','degraded','unknown','success','unavailable','stale','not_found','invalid'] as const);
export type DashboardState=typeof DASHBOARD_STATES[number];
export function viewOutcome(status:number):DashboardState{
 if(status===200){return 'success';}if(status===401||status===403){return 'denied';}if(status===409){return 'conflict';}if(status===404){return 'not_found';}if(status===429){return 'unavailable';}if(status===400||status===413||status===414){return 'invalid';}return 'unknown';
}
export function parseDashboardLocation(path:string,search:string):Readonly<{page:string;focus?:string;app?:string}>{
 const invalid=():never=>{throw new Error('navigation_invalid');};
 if(typeof path!=='string'||typeof search!=='string'||path.length+search.length>DASHBOARD_LIMITS.targetChars||search.includes('#')){return invalid();}
 if(['/dashboard/apps/bumblebee','/dashboard/apps/memory-review'].includes(path)){if(search){return invalid();}return Object.freeze({page:'apps',app:path.slice('/dashboard/apps/'.length)});}
 const canonical=path==='/dashboard/search'?'/dashboard/memories':path;
 const route=DASHBOARD_ROUTES.find(row=>row.path===canonical);if(!route){return invalid();}
 const params=new URLSearchParams(search);for(const [key] of params){if(key!=='focus'||params.getAll(key).length!==1){return invalid();}}
 const focus=params.get('focus');if(focus!==null&&(!['memories','graph','curator'].includes(route.page)||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(focus))){return invalid();}
 return Object.freeze({page:route.page,...(focus===null?{}:{focus})});
}
