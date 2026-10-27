import {ConsumerError,type ConsumerOptions} from './consumer-client.js';
export function consumerEnvironment():ConsumerOptions{
 const {ALLURA_ENDPOINT:endpoint,ALLURA_GROUP_ID:groupId,ALLURA_WORKSPACE_ID:workspaceId,ALLURA_TOKEN:token,ALLURA_ALLOW_LOOPBACK:loopback}=process.env;
 if(!endpoint||!groupId||!workspaceId||!token||(loopback!==undefined&&loopback!=='1')){throw new ConsumerError('invalid');}
 return {endpoint,groupId,workspaceId,token:async()=>token,allowLoopback:loopback==='1'};
}
export async function readConsumerInput():Promise<Record<string,unknown>>{
 const chunks:Buffer[]=[];let size=0;const timer=setTimeout(()=>process.stdin.destroy(new ConsumerError('unknown')),6000);
 try{for await(const part of process.stdin){const chunk=Buffer.from(part as Uint8Array);size+=chunk.byteLength;if(size>60000){throw new ConsumerError('invalid');}chunks.push(chunk);}const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value)){throw new ConsumerError('invalid');}return value as Record<string,unknown>;}
 catch(error){throw error instanceof ConsumerError?error:new ConsumerError('invalid');}finally{clearTimeout(timer);process.stdin.destroy();}
}
