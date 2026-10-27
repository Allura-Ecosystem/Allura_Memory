import {type SQL} from 'bun';
import {VectorDb} from '@ruvector/core';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {type Identity} from './authentication.ts';
import {type Scope} from './authority.ts';
import {scopedTransaction} from './persistence.ts';
import {DecisionError} from './decisions.ts';
import {EMBEDDING,type Embedder,validateVector,boundedIndexWork} from './embedding.ts';
import {validateModel} from './indexing.ts';
export type IndexQuery={query:string;mode:'vector'|'text'|'hybrid';limit:number};
export type IndexHit={id:string;knowledgeId:string;content:string;contentTruncated:boolean;score:number;scoreKind:'cosine_similarity'|'lexical_rank'|'reciprocal_rank_fusion'};
export type IndexResult={results:IndexHit[];attempted:string[];used:string[];degraded:boolean;reason:'vector_unavailable'|'index_incomplete'|null;candidateTruncated:boolean};
type Candidate={id:string;knowledge_id:string;content:string;embedding:number[]|null;lexical:number};
async function nativeSearch(rows:Candidate[],query:number[],limit:number):Promise<{id:string;score:number}[]>{
  const directory=await mkdtemp(join(tmpdir(),'allura-scoped-vector-'));
  try{
    const db=new VectorDb({dimensions:EMBEDDING.dimensions,distanceMetric:'Cosine',storagePath:join(directory,'index.db')});
    const entries=rows.filter(row=>row.embedding!==null).map(row=>{validateVector(row.embedding!);return {id:row.id,vector:Float32Array.from(row.embedding!)};});
    if(!entries.length){return [];}
    await db.insertBatch(entries);
    return (await db.search({vector:Float32Array.from(query),k:Math.min(entries.length,limit)})).map(row=>({id:row.id,score:Math.max(0,Math.min(1,1-row.score))}));
  }finally{await rm(directory,{recursive:true,force:true});}
}
export async function searchIndex(sql:SQL,identity:Identity,scope:Scope,input:IndexQuery,provider:Embedder):Promise<IndexResult>{
  if(!input||Object.keys(input).some(k=>!['query','mode','limit'].includes(k))||typeof input.query!=='string'||!input.query.trim()||Buffer.byteLength(input.query)>2000||input.query.includes('\u0000')||!['vector','text','hybrid'].includes(input.mode)||!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>10){throw new DecisionError('invalid');}
  validateModel(provider);
  return scopedTransaction(sql,identity,scope,'memory:read',async tx=>{
    // Both paths use this exact RLS-filtered current semantic candidate set.
    const selected=await tx`SELECT v.id,v.knowledge_id,v.content,x.embedding,ts_rank_cd(to_tsvector('english',v.content),plainto_tsquery('english',${input.query})) AS lexical
      FROM allura.semantic_versions v JOIN allura.semantic_heads h ON h.group_id=v.group_id AND h.workspace_id=v.workspace_id AND h.current_version_id=v.id AND h.lifecycle='current'
      LEFT JOIN allura.source_vectors x ON x.group_id=v.group_id AND x.workspace_id=v.workspace_id AND x.source_kind='semantic' AND x.source_id=v.id AND x.index_version=${EMBEDDING.indexVersion} AND x.model_id=${EMBEDDING.model} AND x.model_revision=${EMBEDDING.revision} AND x.dimensions=${EMBEDDING.dimensions}
      WHERE v.group_id=${scope.groupId} AND v.workspace_id=${scope.workspaceId}::uuid ORDER BY v.created_at DESC,v.id LIMIT 257` as Candidate[];
    const rows=selected.slice(0,256),lexical=rows.filter(x=>x.lexical>0).sort((a,b)=>b.lexical-a.lexical||a.id.localeCompare(b.id));
    const result:IndexResult={results:[],attempted:[],used:[],degraded:false,reason:null,candidateTruncated:selected.length>256};
    let vectors:{id:string;score:number}[]=[];
    if(input.mode!=='text'){
      result.attempted.push('vector');
      try{const vector=await boundedIndexWork(provider.embed(input.query));validateVector(vector);vectors=await boundedIndexWork(nativeSearch(rows,vector,Math.max(input.limit,20)));result.used.push('vector');
        if(rows.some(x=>x.embedding===null)){result.degraded=true;result.reason='index_incomplete';}
      }catch{result.degraded=true;result.reason='vector_unavailable';}
    }
    const useText=input.mode!=='vector'||result.degraded;
    if(useText){result.attempted.push('text');result.used.push('text');}
    const scores=new Map<string,{score:number;kind:IndexHit['scoreKind']}>();
    if(input.mode==='hybrid'&&result.used.includes('vector')){
      for(const [rank,row] of vectors.entries()){scores.set(row.id,{score:1/(60+rank+1),kind:'reciprocal_rank_fusion'});}
      for(const [rank,row] of lexical.entries()){scores.set(row.id,{score:(scores.get(row.id)?.score??0)+1/(60+rank+1),kind:'reciprocal_rank_fusion'});}
    }else{
      for(const row of vectors){scores.set(row.id,{score:row.score,kind:'cosine_similarity'});}
      if(useText){for(const row of lexical){if(!scores.has(row.id)){scores.set(row.id,{score:row.lexical,kind:'lexical_rank'});}}}
    }
    const byId=new Map(rows.map(x=>[x.id,x]));
    result.results=[...scores.entries()].sort((a,b)=>b[1].score-a[1].score||a[0].localeCompare(b[0])).slice(0,input.limit).map(([id,value])=>{
      const row=byId.get(id)!;return {id,knowledgeId:row.knowledge_id,content:row.content.slice(0,1000),contentTruncated:row.content.length>1000,score:value.score,scoreKind:value.kind};
    });
    const stillCurrent=await tx`SELECT v.id FROM allura.semantic_versions v JOIN allura.semantic_heads h ON h.group_id=v.group_id AND h.workspace_id=v.workspace_id AND h.current_version_id=v.id AND h.lifecycle='current' WHERE v.group_id=${scope.groupId} AND v.workspace_id=${scope.workspaceId}::uuid AND v.id IN (SELECT value::uuid FROM jsonb_array_elements_text(${result.results.map(x=>x.id)}::jsonb))`;
    const visible=new Set(stillCurrent.map((row:{id:string})=>row.id));result.results=result.results.filter(row=>visible.has(row.id));
    // scopedTransaction also re-resolves authority after asynchronous work.
    return result;
  });
}
