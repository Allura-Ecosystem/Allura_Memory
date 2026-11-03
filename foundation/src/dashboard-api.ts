import {type SQL} from 'bun';
import {actions,allowedRoleAction,AuthorityError} from './authority.ts';
import {DatabaseStore,scopedTransaction} from './persistence.ts';
import {type Route} from './gateway.ts';
import {DecisionError} from './decisions.ts';
export function createDashboardRoutes(sql:SQL):Route[]{return [
 {path:'/api/dashboard/context',method:'GET',identity:'human',action:'memory:read',handle:async c=>scopedTransaction(sql,c.identity,c.scope,'memory:read',async tx=>{
  const row=await new DatabaseStore(tx).resolve(c.identity,c.scope);if(!row||row.kind!=='human'){throw new AuthorityError('forbidden');}
  const [clock]=await tx`SELECT clock_timestamp() AS now`;
  return {scope:c.scope,principalId:row.principalId,kind:'human',role:row.role,actions:actions.filter(action=>allowedRoleAction(row.role,row.reviewApprove,'human',action)),observedAt:(clock.now as Date).toISOString()};
 })},
 {path:'/api/dashboard/proposals',method:'POST',identity:'human',action:'review:read',handle:async c=>{
  const body=c.body!,limit=body.limit??20;if(Object.keys(body).some(k=>k!=='limit')||typeof limit!=='number'||!Number.isSafeInteger(limit)||limit<1||limit>20){throw new DecisionError('invalid');}
  return scopedTransaction(sql,c.identity,c.scope,'review:read',async tx=>{
   const rows=await tx`SELECT s.id,s.current_version AS version,s.state,v.requester_id AS "requesterId",v.producer_id AS "producerId",left(v.summary,256) AS summary,length(v.summary)>256 AS "summaryTruncated" FROM allura.proposal_state s JOIN allura.proposal_versions v ON v.group_id=s.group_id AND v.workspace_id=s.workspace_id AND v.proposal_id=s.id AND v.version=s.current_version WHERE s.group_id=${c.scope.groupId} AND s.workspace_id=${c.scope.workspaceId}::uuid AND s.state IN('pending','needs_evidence') ORDER BY s.id LIMIT ${limit+1}`;
   return {items:rows.slice(0,limit),hasMore:rows.length>limit};
  });
 }},
];}
