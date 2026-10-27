export type EvaluationSample={caseId:string;mode:string;category:string;expected:string[];returned:string[];unauthorized:string[];stale:string[];durationMs:number;degraded:boolean;timeout:boolean;failed:boolean};
function metrics(samples:readonly EvaluationSample[]){
 const answerable=samples.filter(row=>row.expected.length>0),noAnswer=samples.filter(row=>row.expected.length===0),fresh=samples.filter(row=>row.category==='fresh');
 const latencies=samples.map(row=>row.durationMs).sort((a,b)=>a-b),mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
 const relevant=(row:EvaluationSample)=>row.returned.filter(id=>row.expected.includes(id)).length;
 return {samples:samples.length,answerable:answerable.length,noAnswerCases:noAnswer.length,
  mrr:mean(answerable.map(row=>{const rank=row.returned.findIndex(id=>row.expected.includes(id));return rank<0?0:1/(rank+1);})),
  precision:mean(answerable.map(row=>row.returned.length?relevant(row)/row.returned.length:0)),recall:mean(answerable.map(row=>relevant(row)/row.expected.length)),
  noAnswerAccuracy:mean(noAnswer.map(row=>row.returned.length===0?1:0)),freshTop1:mean(fresh.map(row=>row.expected.includes(row.returned[0]??'')?1:0)),
  unauthorizedResults:samples.reduce((n,row)=>n+row.returned.filter(id=>row.unauthorized.includes(id)).length,0),staleResults:samples.reduce((n,row)=>n+row.returned.filter(id=>row.stale.includes(id)).length,0),
  p50Ms:latencies[Math.ceil(latencies.length*0.5)-1]!,p95Ms:latencies[Math.ceil(latencies.length*0.95)-1]!,quantileMethod:'nearest-rank',
  timeouts:samples.filter(row=>row.timeout).length,failures:samples.filter(row=>row.failed).length,fallbacks:samples.filter(row=>row.degraded).length};
}
export function summarizeEvaluation(samples:readonly EvaluationSample[]){
 if(!samples.length){throw new Error('empty evaluation');}
 if(samples.some(row=>!Number.isFinite(row.durationMs)||row.durationMs<0||new Set(row.returned).size!==row.returned.length||new Set(row.expected).size!==row.expected.length)){throw new Error('invalid evaluation sample');}
 return {...metrics(samples),byMode:Object.fromEntries([...new Set(samples.map(row=>row.mode))].sort().map(mode=>[mode,metrics(samples.filter(row=>row.mode===mode))]))};
}
