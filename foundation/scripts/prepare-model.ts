import {env,pipeline} from '@huggingface/transformers';
import {EMBEDDING,MODEL_CACHE,validateVector} from '../src/embedding.ts';
// Explicit public model preparation only. Application inference is offline.
if(process.argv.length!==2){throw new Error('No model or revision override permitted');}
if(process.env.HF_TOKEN||process.env.HF_ACCESS_TOKEN){throw new Error('Run public preparation without model credentials');}
env.allowRemoteModels=true;env.allowLocalModels=false;env.cacheDir=MODEL_CACHE;
const model=await pipeline('feature-extraction',EMBEDDING.model,{revision:EMBEDDING.revision,dtype:EMBEDDING.dtype,device:'cpu'});
const result=await model('Public synthetic installation witness',{pooling:'mean',normalize:true});validateVector(Array.from(result.data,Number));
console.log(JSON.stringify({model:EMBEDDING,cache:MODEL_CACHE,dimensions:result.data.length,inference:'exercised',network:'public-model-download-only'}));
await model.dispose();
