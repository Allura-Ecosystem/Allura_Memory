import {type SQL,type SavepointSQL} from 'bun';
import {type Identity} from './authentication.ts';
import {type Scope,AuthorityError} from './authority.ts';
import {scopedTransaction} from './persistence.ts';
import {DecisionError} from './decisions.ts';
import {EMBEDDING,boundedIndexWork,validateVector,type Embedder} from './embedding.ts';
import {validateModel} from './indexing.ts';
import {nativeSearch,VECTOR_RETRIEVAL_POLICY} from './retrieval-index.ts';
import {normalizeAllLimit,mergeCandidates,type RetrievalCandidate} from './retrieval-policy.ts';
import {auditRead} from './retrieval.ts';
export type FederatedQuery={query:string;status:'approved'|'all';limit?:number;min_score?:number;history?:boolean};
export type FederatedHit={id:string;kind:'semantic'|'evidence';approval:'approved'|'unapproved';content:string;contentTruncated:boolean;score:number;scoreKind:string;confidence:number|null;createdAt:string;knowledgeId?:string;version?:number;lifecycle?:string};
export type FederatedResult={results:FederatedHit[];outcome:'succeeded'|'partial'|'failed';degraded:boolean;paths:{path:'semantic'|'vector'|'events';state:'succeeded'|'failed'|'skipped'}[];storesAttempted:string[];storesUsed:string[];candidateTruncated:boolean;confidenceFilter:'known_only'|null;vectorPolicy:typeof VECTOR_RETRIEVAL_POLICY};
type Row={id:string;content:string;created_at:Date;metadata:Record<string,unknown>;embedding?:number[];lexical?:number};
const candidate=(row:Row,source:RetrievalCandidate['source'],score:number,scoreKind:string):RetrievalCandidate=>({id:row.id,content:row.content,source,score,scoreKind,confidence:null,createdAt:row.created_at.toISOString(),metadata:row.metadata});
export async function searchFederated(sql:SQL,identity:Identity,scope:Scope,input:FederatedQuery,provider:Embedder,signal?:AbortSignal):Promise<FederatedResult>{
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['query','status','limit','min_score','history'].includes(k))||typeof input.query!=='string'||Buffer.byteLength(input.query)>2000||/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(input.query)||!['approved','all'].includes(input.status)||(input.history!==undefined&&typeof input.history!=='boolean')||(input.min_score!==undefined&&(typeof input.min_score!=='number'||!Number.isFinite(input.min_score)||input.min_score<0||input.min_score>1))){throw new DecisionError('invalid');}
 signal?.throwIfAborted();const limit=normalizeAllLimit(input.limit),query=input.query.trim(),history=input.history??false,all=input.status==='all';validateModel(provider);
 return scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
  const result:FederatedResult={results:[],outcome:'succeeded',degraded:false,paths:[],storesAttempted:['postgres'],storesUsed:[],candidateTruncated:false,confidenceFilter:input.min_score===undefined?null:'known_only',vectorPolicy:VECTOR_RETRIEVAL_POLICY};
  const batches:RetrievalCandidate[][]=[];
  const [initial]=await tx`SELECT allura.additional_action(${scope.groupId},${scope.workspaceId}::uuid,'evidence:read') AS evidence`;
  const attempt=async(path:'semantic'|'vector'|'events',work:(save:SavepointSQL)=>Promise<RetrievalCandidate[]>)=>{
   try{const values=await tx.savepoint(work);batches.push(values);result.paths.push({path,state:'succeeded'});if(!result.storesUsed.includes('postgres')){result.storesUsed.push('postgres');}if(path==='vector'){result.storesUsed.push('ruvector');}}
   catch(error){if(error instanceof AuthorityError||(error instanceof Error&&error.message==='forbidden')){throw new AuthorityError('forbidden');}result.paths.push({path,state:'failed'});}
  };
  await attempt('semantic',async save=>{
   const rows=await save`SELECT id,content,created_at,jsonb_build_object('kind','semantic','approval','approved','knowledgeId',knowledge_id,'version',version,'lifecycle',lifecycle) AS metadata,ts_rank_cd(to_tsvector('english',content),plainto_tsquery('english',${query})) AS lexical FROM allura.memory_projection
    WHERE group_id=${scope.groupId} AND workspace_id=${scope.workspaceId}::uuid AND (${history} OR lifecycle='current') AND (${query}='' OR strpos(lower(content),lower(${query}))>0 OR to_tsvector('english',content)@@plainto_tsquery('english',${query}))
    ORDER BY allura.retrieval_literal_priority(content,${query}) DESC,lexical DESC,created_at DESC,id LIMIT ${limit+1}` as Row[];
   result.candidateTruncated ||= rows.length>limit;return rows.slice(0,limit).map(row=>candidate(row,'semantic',row.lexical!,'lexical_rank'));
  });
  if(query){result.storesAttempted.push('ruvector');await attempt('vector',async save=>{
   const semantics=await save`SELECT p.id,p.content,p.created_at,jsonb_build_object('kind','semantic','approval','approved','knowledgeId',p.knowledge_id,'version',p.version,'lifecycle',CASE WHEN h.current_version_id=p.id THEN h.lifecycle ELSE 'superseded' END) AS metadata,v.embedding FROM allura.semantic_versions p
    JOIN allura.semantic_heads h ON h.group_id=p.group_id AND h.workspace_id=p.workspace_id AND h.knowledge_id=p.knowledge_id
    JOIN allura.source_vectors v ON v.group_id=p.group_id AND v.workspace_id=p.workspace_id AND v.source_kind='semantic' AND v.source_id=p.id
    WHERE p.group_id=${scope.groupId} AND p.workspace_id=${scope.workspaceId}::uuid AND (${history} OR (h.current_version_id=p.id AND h.lifecycle='current'))
    AND v.model_id=${EMBEDDING.model} AND v.model_revision=${EMBEDDING.revision} AND v.dimensions=${EMBEDDING.dimensions} AND v.index_version=${EMBEDDING.indexVersion} ORDER BY p.created_at DESC,p.id LIMIT 257` as Row[];
   const events=all?await save`SELECT * FROM allura.retrieval_event_vectors(${scope.groupId},${scope.workspaceId}::uuid,257)` as Row[]:[];
   result.candidateTruncated ||= semantics.length>256||events.length>256;const rows=[...semantics.slice(0,256),...events.slice(0,256)];
   const hits=await boundedIndexWork(async workSignal=>{const vector=await provider.embed(query,workSignal);workSignal.throwIfAborted();validateVector(vector);return nativeSearch(rows.map(row=>({id:row.id,embedding:row.embedding!,content:row.content})),vector,limit,query,workSignal);},signal);
   const byId=new Map(rows.map(row=>[row.id,row]));return hits.map(hit=>candidate(byId.get(hit.id)!,'vector',hit.score,'cosine_similarity'));
  });}else{result.paths.push({path:'vector',state:'skipped'});}
  signal?.throwIfAborted();if(all){await attempt('events',async save=>{const rows=await save`SELECT * FROM allura.retrieval_events(${scope.groupId},${scope.workspaceId}::uuid,${query},${limit+1})` as Row[];result.candidateTruncated ||= rows.length>limit;return rows.slice(0,limit).map(row=>candidate(row,'event',0,'unscored'));});}
  const chosen=mergeCandidates(query,limit,batches,input.min_score),semanticIds=chosen.filter(row=>row.metadata.kind==='semantic').map(row=>row.id),eventIds=chosen.filter(row=>row.metadata.kind==='evidence').map(row=>row.id);
  const current=semanticIds.length?await tx`SELECT v.id,CASE WHEN h.current_version_id=v.id THEN h.lifecycle ELSE 'superseded' END AS lifecycle FROM allura.semantic_versions v JOIN allura.semantic_heads h ON h.group_id=v.group_id AND h.workspace_id=v.workspace_id AND h.knowledge_id=v.knowledge_id WHERE v.group_id=${scope.groupId} AND v.workspace_id=${scope.workspaceId}::uuid AND v.id IN(SELECT value::uuid FROM jsonb_array_elements_text(${semanticIds}::jsonb)) AND (${history} OR(h.current_version_id=v.id AND h.lifecycle='current'))` as {id:string;lifecycle:string}[]:[];
  const raw=eventIds.length?await tx`SELECT * FROM allura.retrieval_visible_events(${scope.groupId},${scope.workspaceId}::uuid,${eventIds}::jsonb)` as {id:string}[]:[];
  if(all&&initial.evidence){const [final]=await tx`SELECT allura.additional_action(${scope.groupId},${scope.workspaceId}::uuid,'evidence:read') AS evidence`;if(!final.evidence){throw new AuthorityError('forbidden');}}
  const semanticVisible=new Map(current.map(row=>[row.id,row.lifecycle])),rawVisible=new Set(raw.map(row=>row.id));
  result.results=chosen.filter(row=>row.metadata.kind==='semantic'?semanticVisible.has(row.id):rawVisible.has(row.id)).map(row=>({id:row.id,kind:row.metadata.kind as 'semantic'|'evidence',approval:row.metadata.approval as 'approved'|'unapproved',content:row.content.slice(0,256),contentTruncated:row.content.length>256,score:row.score,scoreKind:row.scoreKind,confidence:row.confidence,createdAt:row.createdAt,...(row.metadata.kind==='semantic'?{knowledgeId:row.metadata.knowledgeId as string,version:row.metadata.version as number,lifecycle:semanticVisible.get(row.id)!}:{})}));
  const failures=result.paths.filter(path=>path.state==='failed').length,success=result.paths.some(path=>path.state==='succeeded');result.outcome=failures?(success?'partial':'failed'):'succeeded';result.degraded=failures>0;
  await auditRead(tx,scope,'search',result.results.length,history,result.outcome,result.degraded?(result.outcome==='failed'?'unavailable':'fallback'):null);return result;
 });
}
