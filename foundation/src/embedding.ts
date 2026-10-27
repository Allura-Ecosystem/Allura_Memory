import {env,pipeline,type FeatureExtractionPipeline} from '@huggingface/transformers';
import {fileURLToPath} from 'node:url';
export const EMBEDDING=Object.freeze({model:'Xenova/all-MiniLM-L6-v2',revision:'751bff37182d3f1213fa05d7196b954e230abad9',dimensions:384,indexVersion:'minilm-q8-mean-normalized-v1',dtype:'q8' as const});
export const MODEL_CACHE=fileURLToPath(new URL('../node_modules/.cache/allura-models',import.meta.url));
export interface Embedder { readonly identity:typeof EMBEDDING; embed(text:string):Promise<number[]> }
let loaded:Promise<FeatureExtractionPipeline>|undefined;
export async function boundedIndexWork<T>(work:Promise<T>):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('index_timeout')),2000);})]);}
  finally{if(timer){clearTimeout(timer);}}
}
export function validateVector(vector:readonly number[]):void{
  if(vector.length!==EMBEDDING.dimensions||Array.from(vector).some(x=>!Number.isFinite(x))){throw new Error('invalid_vector');}
  const norm=Math.sqrt(vector.reduce((s,x)=>s+x*x,0));if(Math.abs(norm-1)>0.001){throw new Error('invalid_vector');}
}
export async function loadLocalEmbedder():Promise<Embedder>{
  env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=MODEL_CACHE+'/';env.cacheDir=MODEL_CACHE;
  loaded??=pipeline('feature-extraction',EMBEDDING.model,{revision:EMBEDDING.revision,dtype:EMBEDDING.dtype,device:'cpu',local_files_only:true});
  let model:FeatureExtractionPipeline;
  try{model=await loaded;}catch{loaded=undefined;throw new Error('embedding_unavailable');}
  return {identity:EMBEDDING,embed:async(text:string)=>{
    if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>48000){throw new Error('invalid_text');}
    const result=await model(text,{pooling:'mean',normalize:true});const vector=Array.from(result.data,Number);validateVector(vector);return vector;
  }};
}
