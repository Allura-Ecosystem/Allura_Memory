// Readiness is a wall-clock budget, not a count of fast connection refusals.
export async function waitForRecoveryReady(probe:(signal:AbortSignal)=>Promise<void>,timeoutMs=30000):Promise<void>{
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000){throw new Error('recovery_invalid');}
 const controller=new AbortController(),deadline=performance.now()+timeoutMs;
 const failure=()=>new Error('recovery_startup_failed');let timer:ReturnType<typeof setTimeout>|undefined;
 const expired=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure());},timeoutMs);});
 const work=(async()=>{
  while(!controller.signal.aborted&&performance.now()<deadline){
   try{await probe(controller.signal);if(!controller.signal.aborted&&performance.now()<deadline){return;}}catch{/* Never expose connection details. */}
   const remaining=deadline-performance.now();if(controller.signal.aborted||remaining<=0){break;}await Bun.sleep(Math.min(100,remaining));
  }
  throw failure();
 })();
 try{await Promise.race([work,expired]);}finally{clearTimeout(timer);controller.abort();}
}
