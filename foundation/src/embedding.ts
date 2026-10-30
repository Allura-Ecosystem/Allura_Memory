import {env,pipeline,type FeatureExtractionPipeline} from '@huggingface/transformers';
import {fileURLToPath} from 'node:url';
import {createWorkBudget} from './work-budget.ts';
export const EMBEDDING=Object.freeze({model:'Xenova/all-MiniLM-L6-v2',revision:'751bff37182d3f1213fa05d7196b954e230abad9',dimensions:384,indexVersion:'minilm-q8-mean-normalized-v1',dtype:'q8' as const});
export const MODEL_CACHE=fileURLToPath(new URL('../node_modules/.cache/allura-models',import.meta.url));
export const OPENAI_EMBEDDING=Object.freeze({provider:'openai' as const,model:'text-embedding-3-small',revision:'provider-managed-alias',dimensions:384,indexVersion:'openai-text-embedding-3-small-384-normalized-v1',dtype:'float32' as const});
export type EmbeddingIdentity=Readonly<{model:string;revision:string;dimensions:number;indexVersion:string;dtype:string;provider?:'openai'}>;
export interface Embedder { readonly identity:EmbeddingIdentity; embed(text:string,signal?:AbortSignal):Promise<number[]> }
// Transport injection is a test seam only; runtime never accepts a URL override.
export async function createEmbedder(config:import('./core-config.ts').EmbeddingConfig|undefined,environment:Readonly<Record<string,string|undefined>>,transport:typeof fetch=fetch):Promise<Embedder>{
 if(config===undefined){return loadLocalEmbedder();}
 const key=environment.ALLURA_OPENAI_API_KEY;
 if(!config||Object.keys(config).length!==3||config.provider!=='openai'||config.model!=='text-embedding-3-small'||config.dimensions!==384||!key||!/^[\x21-\x7e]{1,4096}$/.test(key)){throw new Error('embedding_configuration_invalid');}
 return {identity:OPENAI_EMBEDDING,embed:async(text,signal)=>{
  if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>48000){throw new Error('invalid_text');}
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();}
  const timer=setTimeout(abort,1800);let reader:ReturnType<NonNullable<Response['body']>['getReader']>|undefined;
  try{
   controller.signal.throwIfAborted();
   const response=await transport('https://api.openai.com/v1/embeddings',{method:'POST',redirect:'error',tls:{rejectUnauthorized:true},signal:controller.signal,headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({input:text,model:OPENAI_EMBEDDING.model,dimensions:384,encoding_format:'float'})});
   if(!response.ok||response.redirected||!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')||!response.body){throw new Error();}
   const bodyReader=response.body.getReader();reader=bodyReader;let size=0;const chunks:Uint8Array[]=[];
   while(true){controller.signal.throwIfAborted();const {done,value}=await bodyReader.read();controller.signal.throwIfAborted();if(done){break;}size+=value.length;if(size>65536){throw new Error();}chunks.push(value);}
   const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(result.model!==OPENAI_EMBEDDING.model||result.object!=='list'||!Array.isArray(result.data)||result.data.length!==1||result.data[0]?.index!==0||result.data[0]?.object!=='embedding'||!Array.isArray(result.data[0]?.embedding)||result.data[0].embedding.some((x:unknown)=>typeof x!=='number')){throw new Error();}
   const vector:number[]=result.data[0].embedding;validateVector(vector);controller.signal.throwIfAborted();return vector;
  }catch{throw new Error('embedding_unavailable');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();if(reader){await reader.cancel().catch(()=>{});}}
 }};
}
let loaded:Promise<FeatureExtractionPipeline>|undefined;
const indexBudget=createWorkBudget({capacity:8,timeoutMs:2000});
export const indexWorkStatus=indexBudget.snapshot;
export const boundedIndexWork=<T>(work:(signal:AbortSignal)=>Promise<T>,signal?:AbortSignal):Promise<T>=>indexBudget.run(work,signal);
export function validateVector(vector:readonly number[]):void{
  if(vector.length!==EMBEDDING.dimensions||Array.from(vector).some(x=>!Number.isFinite(x))){throw new Error('invalid_vector');}
  const norm=Math.sqrt(vector.reduce((s,x)=>s+x*x,0));if(Math.abs(norm-1)>0.001){throw new Error('invalid_vector');}
}
export async function loadLocalEmbedder():Promise<Embedder>{
  env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=MODEL_CACHE+'/';env.cacheDir=MODEL_CACHE;
  loaded??=pipeline('feature-extraction',EMBEDDING.model,{revision:EMBEDDING.revision,dtype:EMBEDDING.dtype,device:'cpu',local_files_only:true});
  let model:FeatureExtractionPipeline;
  try{model=await loaded;}catch{loaded=undefined;throw new Error('embedding_unavailable');}
  return {identity:EMBEDDING,embed:async(text:string,signal?:AbortSignal)=>{
    if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>48000){throw new Error('invalid_text');}
    signal?.throwIfAborted();const result=await model(text,{pooling:'mean',normalize:true});signal?.throwIfAborted();const vector=Array.from(result.data,Number);validateVector(vector);return vector;
  }};
}
