import {DecisionError} from './decisions.ts';
export type RetrievalCandidate={id:string;content:string;source:'semantic'|'vector'|'event';score:number;scoreKind:string;confidence:number|null;createdAt:string;metadata:Record<string,unknown>;metadataOwner?:'semantic'|'vector'|'event'};
export function normalizeAllLimit(value:unknown):number{
  if(value===undefined){return 10;}if(typeof value!=='number'||!Number.isFinite(value)||value<1||value>100){throw new DecisionError('invalid');}return Math.floor(value);
}
// Pure policy only. Callers must collect independently bounded authorized batches
// and revalidate scope/lifecycle before disclosure; this function grants nothing.
export function mergeCandidates(query:string,limit:number,batches:readonly (readonly RetrievalCandidate[])[],minScore?:number):RetrievalCandidate[]{
  if(normalizeAllLimit(limit)!==limit||typeof query!=='string'||(minScore!==undefined&&(!Number.isFinite(minScore)||minScore<0||minScore>1))){throw new DecisionError('invalid');}
  const needle=query.trim().toLowerCase(),priority=(row:RetrievalCandidate)=>!needle?0:row.content.trim().toLowerCase()===needle?2:row.content.toLowerCase().includes(needle)?1:0;
  const compare=(a:RetrievalCandidate,b:RetrievalCandidate)=>priority(b)-priority(a)||b.score-a.score||a.id.localeCompare(b.id);
  const groups=new Map<string,RetrievalCandidate[]>();
  for(const batch of batches){
    if(batch.length>limit){throw new DecisionError('invalid');}
    for(const row of batch){
      if(!row.id||typeof row.content!=='string'||!Number.isFinite(row.score)||!Number.isFinite(Date.parse(row.createdAt))||(row.confidence!==null&&(!Number.isFinite(row.confidence)||row.confidence<0||row.confidence>1))){throw new DecisionError('invalid');}
      if(minScore!==undefined&&(row.confidence===null||row.confidence<minScore)){continue;}
      const group=groups.get(row.id)??[];group.push(row);groups.set(row.id,group);
    }
  }
  const merged:RetrievalCandidate[]=[];
  for(const rows of groups.values()){
    const chosen=[...rows].sort(compare)[0]!;const identical=rows.filter(row=>row.content===chosen.content);
    const vector=identical.filter(row=>row.source==='vector').sort(compare)[0];
    const durable=identical.filter(row=>row.source==='event').sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
    const scored=vector??chosen,metadata=durable??scored;
    merged.push({...scored,createdAt:metadata.createdAt,metadata:{...metadata.metadata},metadataOwner:metadata.source});
  }
  return merged.sort(compare).slice(0,limit);
}
