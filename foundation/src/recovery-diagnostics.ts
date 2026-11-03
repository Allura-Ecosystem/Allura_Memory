type StderrHint='archive'|'permission'|'resource'|'connection'|'unknown';
export type RecoveryDiagnostic=Readonly<{bytes:number;retainedBytes:number;readFailed:boolean;hint:StderrHint}>;
/** Keep at most 8 KiB transiently, drain all output to avoid pipe deadlock, never return raw text. */
export async function collectRecoveryDiagnostic(stream:ReadableStream<Uint8Array>):Promise<RecoveryDiagnostic>{
 const prefix=new Uint8Array(8192);let bytes=0,retainedBytes=0,readFailed=false;
 try{for await(const chunk of stream){bytes=Math.min(Number.MAX_SAFE_INTEGER,bytes+chunk.byteLength);const take=Math.min(prefix.length-retainedBytes,chunk.byteLength);prefix.set(chunk.subarray(0,take),retainedBytes);retainedBytes+=take;}}catch{readFailed=true;}
 const text=new TextDecoder().decode(prefix.subarray(0,retainedBytes)).toLowerCase();
 const hint:StderrHint=/no space left on device|out of memory|cannot allocate memory|resource temporarily unavailable/.test(text)?'resource':/permission denied|must be owner|insufficient privilege/.test(text)?'permission':/connection to server.*failed|server closed the connection|connection refused/.test(text)?'connection':/input file.*(end of file|too short)|did not find magic string|unsupported version.*file header|could not read from input file/.test(text)?'archive':'unknown';
 return Object.freeze({bytes,retainedBytes,readFailed,hint});
}
/** Diagnostic labels are hints, not proven root causes; no stderr/SQL/argv/credentials are exposed. */
export class RecoveryProcessError extends Error{
 readonly diagnostic:Readonly<{phase:'dump'|'restore';exit:number;signal:string|null;elapsedMs:number;termination:'timeout_exit'|'signal'|'nonzero_exit'|'stream_failure'|'empty_output';stderr:RecoveryDiagnostic}>;
 constructor(phase:'dump'|'restore',exit:number,signal:string|null,elapsedMs:number,stderr:RecoveryDiagnostic){
  super(`recovery_${phase}_failed`);this.name='RecoveryProcessError';
  this.diagnostic=Object.freeze({phase,exit,signal:signal&&/^SIG[A-Z0-9]{1,12}$/.test(signal)?signal:null,elapsedMs,termination:signal?'signal':exit===124?'timeout_exit':exit!==0?'nonzero_exit':stderr.readFailed?'stream_failure':'empty_output',stderr});
 }
}
