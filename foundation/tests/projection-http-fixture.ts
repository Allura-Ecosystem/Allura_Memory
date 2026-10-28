import {randomBytes,randomUUID} from 'node:crypto';
import {type fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {authorizeProjection} from '../src/projection.ts';
import {parseDestination} from '../src/projection-contract.ts';
import {createProjectionTransport} from '../src/projection-delivery.ts';
export type Mode='normal'|'ack-only'|'late'|'conflict'|'redirect'|'oversize'|'rate'|'malformed'|'stall'|'wrong-parent';
export async function deliveryFixture(f:Awaited<ReturnType<typeof fixture>>,initial:Mode='normal',authorize=true){
 const token=randomBytes(32).toString('base64url'),pageId=randomUUID(),dataSourceId=randomUUID();let mode=initial,reads=0,writes=0,authorized=0,wireVersion=true,properties:Record<string,unknown>={content:{id:'content',type:'rich_text',rich_text:[]},binding:{id:'binding',type:'rich_text',rich_text:[]}};
 const apply=(body:{properties:Record<string,unknown>})=>{properties=Object.fromEntries(Object.entries(body.properties).map(([k,v])=>[k,{...(v as object),id:k,type:'rich_text'}]));};
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req):Promise<Response>{
  if(req.headers.get('authorization')!==`Bearer ${token}`||new URL(req.url).pathname!==`/v1/pages/${pageId}`){return new Response(null,{status:401});}authorized++;wireVersion&&=req.headers.get('notion-version')==='2026-03-11';
  if(req.method==='PATCH'){writes++;const body=await req.json() as {properties:Record<string,unknown>};if(mode==='late'){await Bun.sleep(2200);apply(body);}else if(mode!=='ack-only'){apply(body);}return Response.json({object:'page',id:pageId,properties:body.properties});}
  reads++;
  if(mode==='redirect'){return new Response(null,{status:302,headers:{location:`http://127.0.0.1:${server.port}/forbidden`}});}
  if(mode==='oversize'){return new Response('x'.repeat(131073),{headers:{'Content-Type':'application/json'}});}
  if(mode==='rate'){return new Response(null,{status:429,headers:{'Retry-After':'60'}});}
  if(mode==='malformed'){return new Response('{bad-json',{headers:{'Content-Type':'application/json'}});}
  if(mode==='stall'){await Bun.sleep(2300);}
  return Response.json({object:'page',id:pageId,parent:{type:'data_source_id',data_source_id:mode==='wrong-parent'?randomUUID():dataSourceId},is_archived:false,in_trash:false,properties:mode==='conflict'?{...properties,content:{id:'content',type:'rich_text',rich_text:[{type:'text',text:{content:'foreign content',link:null}}]}}:properties});
 }});
 const destination=parseDestination({id:randomUUID(),revision:1,adapter:'notion-page-v1',origin:`http://127.0.0.1:${server.port}`,pageId,dataSourceId,contentProperty:'content',bindingProperty:'binding'},true);
 await f.owner`INSERT INTO allura.projection_destinations(group_id,workspace_id,id,revision,origin,page_id,descriptor) VALUES(${f.scope.groupId},${f.scope.workspaceId}::uuid,${destination.id}::uuid,1,${destination.origin},${pageId}::uuid,${destination}::jsonb)`;
 const eventId=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:randomUUID(),content:'private raw evidence never transferred'})).event_id as string;
 const content=`Authorized exact Cafe\u0301 🧠\r\n${randomUUID()}`,proposal=await submitProposal(f.app,f.identities.machine,f.scope,{summary:content,assertionKind:'observation',evidenceIds:[eventId]});
 const semanticReceipt=await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:proposal.id,reviewedProposalVersion:1,decision:'approve',rationale:'Independent source approval',evidenceIds:[eventId],operationKey:randomUUID()});
 const input={semanticVersionId:JSON.parse(semanticReceipt).semantic_version_id as string,destinationId:destination.id,destinationRevision:1,rationale:'Explicit fixture destination authorization',evidenceIds:[eventId],operationKey:randomUUID()};
 const receipt=authorize?await authorizeProjection(f.app,f.identities.author,f.scope,input):'',id=receipt?JSON.parse(receipt).transferId as string:'';
 const entries=[{scope:f.scope,destination,token}],transport=createProjectionTransport(entries,true);
 return {id,input,receipt,semanticReceipt,destination,content,token,entries,transport,mode:(next:Mode)=>{mode=next;},stats:()=>({reads,writes,authorized,wireVersion}),due:async()=>{await f.owner`UPDATE allura.projection_deliveries SET available_at=clock_timestamp()-interval '1 second',lease_until=CASE WHEN lease_until IS NOT NULL THEN clock_timestamp()-interval '1 second' END WHERE transfer_id=${id}::uuid`;},close:()=>server.stop(true)};
}
