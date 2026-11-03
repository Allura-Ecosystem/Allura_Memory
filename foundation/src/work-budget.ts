export class WorkBudgetError extends Error {
 readonly outcome:'failed'|'unknown';
 constructor(readonly code:'busy'|'timeout'|'cancelled',readonly started:boolean){super(code);this.name='WorkBudgetError';this.outcome=started?'unknown':'failed';}
}
export function createWorkBudget(limits:{capacity:number;timeoutMs:number}){
 if(!Number.isSafeInteger(limits.capacity)||limits.capacity<1||limits.capacity>8||!Number.isSafeInteger(limits.timeoutMs)||limits.timeoutMs<1||limits.timeoutMs>2000){throw new Error('invalid work budget');}
 const {capacity,timeoutMs}=limits;let active=0,unsettledAfterDeadline=0;
 return {
  snapshot:()=>Object.freeze({active,capacity,unsettledAfterDeadline,accepting:active<capacity}),
  run:async<T>(work:(signal:AbortSignal)=>Promise<T>,external?:AbortSignal):Promise<T>=>{
   if(external?.aborted){throw new WorkBudgetError('cancelled',false);}if(active>=capacity){throw new WorkBudgetError('busy',false);}active++;
   const controller=new AbortController();let settled=false,late=false,rejectCancellation!:(reason:WorkBudgetError)=>void;
   const cancelled=new Promise<never>((_,reject)=>{rejectCancellation=reject;});
   const cancel=(code:'timeout'|'cancelled')=>{if(settled||controller.signal.aborted){return;}late=true;unsettledAfterDeadline++;const error=new WorkBudgetError(code,true);controller.abort(error);rejectCancellation(error);};
   const abort=()=>cancel('cancelled');external?.addEventListener('abort',abort,{once:true});
   const timer=setTimeout(()=>cancel('timeout'),timeoutMs);
   let underlying:Promise<T>;try{underlying=Promise.resolve(work(controller.signal));}catch(error){underlying=Promise.reject(error);}
   const tracked=underlying.finally(()=>{settled=true;active--;if(late){unsettledAfterDeadline--;}});
   try{return await Promise.race([tracked,cancelled]);}finally{clearTimeout(timer);external?.removeEventListener('abort',abort);}
  },
 };
}
