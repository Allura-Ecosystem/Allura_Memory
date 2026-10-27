import {type SQL,type TransactionSQL} from 'bun';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {type Identity} from './authentication.ts';
import {type Scope,validScope,AuthorityError} from './authority.ts';
import {DecisionError} from './decisions.ts';
import {scopedTransaction} from './persistence.ts';
export type MemoryRow={id:string;knowledge_id:string;version:number;content:string;lifecycle:'current'|'superseded'|'deprecated';head_revision:number;created_at:Date};
export type MemoryItem={id:string;knowledgeId:string;version:number;content:string;contentTruncated:boolean;lifecycle:MemoryRow['lifecycle'];headRevision:number;createdAt:Date};
export type ListOptions={history?:boolean;limit?:number;cursor?:string};
export type GraphOptions={history?:boolean;limit?:number;rootId?:string;depth?:number;includeEvidence?:boolean};
export type GraphNode={id:string;kind:'semantic'|'evidence';content:string;contentTruncated:boolean;lifecycle?:MemoryRow['lifecycle'];version?:number};
export type GraphEdge={from:string;to:string;relation:'supersedes'|'exact_text'|'evidence'};
const idValid=(scope:Scope,id:unknown):id is string=>typeof id==='string'&&validScope({...scope,workspaceId:id});
const item=(row:MemoryRow,full=false):MemoryItem=>({id:row.id,knowledgeId:row.knowledge_id,version:row.version,content:full?row.content:row.content.slice(0,1000),contentTruncated:!full&&row.content.length>1000,lifecycle:row.lifecycle,headRevision:row.head_revision,createdAt:row.created_at});
export async function auditRead(tx:TransactionSQL,scope:Scope,operation:'get'|'list'|'graph'|'search',count:number,history:boolean,outcome:'succeeded'|'failed'|'partial'|'unknown'='succeeded',reason:'fallback'|'unavailable'|null=null):Promise<void>{
  await tx`INSERT INTO allura.read_audit(group_id,workspace_id,actor_id,operation,item_count,history) VALUES(${scope.groupId},${scope.workspaceId}::uuid,current_setting('allura.principal')::uuid,${operation},${count},${history})`;
  await tx`SELECT allura.observe_retrieval(${scope.groupId},${scope.workspaceId}::uuid,${outcome},${reason})`;
}
export function createRetrievalService(sql:SQL,cursorKey:Uint8Array){
  if(cursorKey.byteLength<32){throw new Error('cursor key must have at least32 bytes');}const key=Buffer.from(cursorKey);
  const encode=(binding:string,lastId:string)=>{const payload=Buffer.from(JSON.stringify({v:1,binding,lastId,expires:Date.now()+900000})).toString('base64url');return `${payload}.${createHmac('sha256',key).update(payload).digest('base64url')}`;};
  const decode=(token:string,binding:string,scope:Scope):string=>{
    try{
      if(token.length>2000){throw new Error();}const parts=token.split('.');if(parts.length!==2){throw new Error();}
      const [payload,signature]=parts as [string,string],supplied=Buffer.from(signature,'base64url'),expected=createHmac('sha256',key).update(payload).digest();
      if(supplied.toString('base64url')!==signature||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){throw new Error();}
      const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as {v:number;binding:string;lastId:string;expires:number};
      if(value.v!==1||value.binding!==binding||!Number.isSafeInteger(value.expires)||value.expires<Date.now()||value.expires>Date.now()+900000||!idValid(scope,value.lastId)){throw new Error();}return value.lastId;
    }catch{throw new DecisionError('invalid');}
  };
  return {
    get:async(identity:Identity,scope:Scope,id:string,history=false):Promise<MemoryItem>=>{
      if(!idValid(scope,id)||typeof history!=='boolean'){throw new DecisionError('invalid');}
      const row=await scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
        const [value]=await tx`SELECT * FROM allura.memory_projection WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND id=${id}::uuid AND (${history} OR lifecycle='current')` as MemoryRow[];
        await auditRead(tx,scope,'get',value?1:0,history);return value;
      });if(!row){throw new DecisionError('not_found');}return item(row,true);
    },
    list:async(identity:Identity,scope:Scope,options:ListOptions={}):Promise<{items:MemoryItem[];nextCursor:string|null;hasMore:boolean}>=>{
      if(!options||Array.isArray(options)||Object.keys(options).some(k=>!['history','limit','cursor'].includes(k))||(options.history!==undefined&&typeof options.history!=='boolean')||(options.cursor!==undefined&&typeof options.cursor!=='string')){throw new DecisionError('invalid');}
      const history=options.history??false,limit=options.limit??20;if(!Number.isSafeInteger(limit)||limit<1||limit>20){throw new DecisionError('invalid');}
      return scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
        const [actor]=await tx`SELECT current_setting('allura.principal') AS id`;const binding=JSON.stringify([scope.groupId,scope.workspaceId,actor.id,history,limit]);
        const after=options.cursor===undefined?null:decode(options.cursor,binding,scope);
        const rows=await tx`SELECT * FROM allura.memory_projection WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND (${history} OR lifecycle='current') AND (${after}::uuid IS NULL OR id>${after}::uuid) ORDER BY id LIMIT ${limit+1}` as MemoryRow[];
        const shown=rows.slice(0,limit);await auditRead(tx,scope,'list',shown.length,history);
        return {items:shown.map(row=>item(row)),hasMore:rows.length>limit,nextCursor:rows.length>limit?encode(binding,shown.at(-1)!.id):null};
      });
    },
    graph:async(identity:Identity,scope:Scope,options:GraphOptions={}):Promise<{nodes:GraphNode[];edges:GraphEdge[];counts:{nodes:number;edges:number};truncated:boolean}>=>{
      if(!options||Array.isArray(options)||Object.keys(options).some(k=>!['history','limit','rootId','depth','includeEvidence'].includes(k))||(options.history!==undefined&&typeof options.history!=='boolean')||(options.includeEvidence!==undefined&&typeof options.includeEvidence!=='boolean')||(options.rootId!==undefined&&!idValid(scope,options.rootId))){throw new DecisionError('invalid');}
      const history=options.history??false,limit=options.limit??30,depth=options.depth??1;if(!Number.isSafeInteger(limit)||limit<1||limit>40||!Number.isSafeInteger(depth)||depth<0||depth>2){throw new DecisionError('invalid');}
      return scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
        if(options.includeEvidence){const [allowed]=await tx`SELECT allura.additional_action(${scope.groupId},${scope.workspaceId}::uuid,'evidence:read') AS allowed`;if(!allowed.allowed){throw new AuthorityError('forbidden');}}
        const seed=await tx`SELECT * FROM allura.memory_projection WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND (${history} OR lifecycle='current') AND (${options.rootId??null}::uuid IS NULL OR id=${options.rootId??null}::uuid) ORDER BY id LIMIT ${limit+1}` as MemoryRow[];
        if(options.rootId&&!seed.length){throw new DecisionError('not_found');}
        const selected=new Map(seed.slice(0,limit).map(row=>[row.id,row]));let truncated=seed.length>limit,frontier=[...selected.keys()];
        if(options.rootId){for(let hop=0;hop<depth&&frontier.length;hop++){
          const neighbors=await tx`SELECT DISTINCT n.* FROM allura.semantic_edges e
            JOIN allura.memory_projection a ON a.group_id=e.group_id AND a.workspace_id=e.workspace_id AND a.id=e.from_id
            JOIN allura.memory_projection b ON b.group_id=e.group_id AND b.workspace_id=e.workspace_id AND b.id=e.to_id
            JOIN allura.memory_projection n ON n.group_id=e.group_id AND n.workspace_id=e.workspace_id AND n.id=CASE WHEN e.from_id IN(SELECT value::uuid FROM jsonb_array_elements_text(${frontier}::jsonb)) THEN e.to_id ELSE e.from_id END
            WHERE e.group_id=${scope.groupId} AND e.workspace_id=${scope.workspaceId}::uuid AND (${history} OR(a.lifecycle='current' AND b.lifecycle='current'))
            AND(e.from_id IN(SELECT value::uuid FROM jsonb_array_elements_text(${frontier}::jsonb)) OR e.to_id IN(SELECT value::uuid FROM jsonb_array_elements_text(${frontier}::jsonb))) ORDER BY n.id LIMIT 41` as MemoryRow[];
          frontier=[];if(neighbors.length>40){truncated=true;}for(const row of neighbors){if(!selected.has(row.id)){if(selected.size>=limit){truncated=true;continue;}selected.set(row.id,row);frontier.push(row.id);}}
        }}
        const ids=[...selected.keys()];
        const rawEdges=await tx`SELECT from_id,to_id,relation FROM allura.semantic_edges WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND from_id IN(SELECT value::uuid FROM jsonb_array_elements_text(${ids}::jsonb)) AND to_id IN(SELECT value::uuid FROM jsonb_array_elements_text(${ids}::jsonb)) ORDER BY from_id,to_id,relation` as {from_id:string;to_id:string;relation:'supersedes'|'exact_text'}[];
        const provenance=options.includeEvidence?await tx`SELECT * FROM allura.graph_evidence(${scope.groupId},${scope.workspaceId}::uuid,${ids}::jsonb)` as {memory_id:string;event_id:string;content:string;truncated:boolean}[]:[];
        if(provenance.length>20){truncated=true;}
        const final=await tx`SELECT * FROM allura.memory_projection WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND id IN(SELECT value::uuid FROM jsonb_array_elements_text(${ids}::jsonb)) AND (${history} OR lifecycle='current') ORDER BY id` as MemoryRow[];
        const visible=new Set(final.map(row=>row.id));const nodes:GraphNode[]=final.map(row=>({id:row.id,kind:'semantic',content:row.content.slice(0,256),contentTruncated:row.content.length>256,lifecycle:row.lifecycle,version:row.version}));
        const edges:GraphEdge[]=rawEdges.filter(row=>visible.has(row.from_id)&&visible.has(row.to_id)).map(row=>({from:row.from_id,to:row.to_id,relation:row.relation}));
        for(const row of provenance.slice(0,20)){if(!visible.has(row.memory_id)){continue;}if(!nodes.some(node=>node.id===row.event_id)){nodes.push({id:row.event_id,kind:'evidence',content:row.content??'',contentTruncated:row.truncated});}edges.push({from:row.memory_id,to:row.event_id,relation:'evidence'});}
        await auditRead(tx,scope,'graph',nodes.length,history);return {nodes,edges,counts:{nodes:nodes.length,edges:edges.length},truncated};
      });
    },
  };
}
