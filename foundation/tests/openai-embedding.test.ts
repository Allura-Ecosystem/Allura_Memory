import {test,expect} from 'bun:test';
import {randomBytes} from 'node:crypto';
import {parseCoreConfig} from '../src/core-config.ts';
import * as embeddings from '../src/embedding.ts';
import {validateModel} from '../src/indexing.ts';
test('model validation allows only the two complete distinct identities',()=>{
 expect(()=>validateModel({identity:embeddings.EMBEDDING,embed:async()=>[]})).not.toThrow();
 expect(()=>validateModel({identity:embeddings.OPENAI_EMBEDDING,embed:async()=>[]})).not.toThrow();
 for(const identity of [{...embeddings.OPENAI_EMBEDDING,revision:'fixed-snapshot'},{...embeddings.OPENAI_EMBEDDING,indexVersion:embeddings.EMBEDDING.indexVersion},{...embeddings.OPENAI_EMBEDDING,dimensions:1024},{...embeddings.EMBEDDING,provider:'openai' as const}]){expect(()=>validateModel({identity,embed:async()=>[]})).toThrow('invalid_model');}
});
const fixtureVector=()=>[1,...Array<number>(383).fill(0)];

function loopbackTransport(url:URL):typeof fetch{return Object.assign(async(_input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>fetch(url,init),{preconnect:fetch.preconnect});}
const validReply=()=>({object:'list',model:'text-embedding-3-small',data:[{object:'embedding',index:0,embedding:fixtureVector()}]});
test('OpenAI rejects wrong model dimensions norm malformed numeric data and hostile HTTP without echoes',async()=>{
 let reply:()=>Response=()=>Response.json(validReply());let calls=0;
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){calls++;return reply();}});
 try{
  const provider=await embeddings.createEmbedder(selected,{ALLURA_OPENAI_API_KEY:'fixture-secret-sentinel'},loopbackTransport(new URL('/',server.url)));
  const good=validReply();
  const malformed=[{...good,model:'wrong'}, {...good,data:[]},{...good,data:[{...good.data[0],index:1}]},{...good,data:[{...good.data[0],embedding:[1,0]}]},{...good,data:[{...good.data[0],embedding:Array(384).fill(0)}]},{...good,data:[{...good.data[0],embedding:['1',...Array(383).fill(0)]}]},{...good,data:[{...good.data[0],embedding:[null,...Array(383).fill(0)]}]}];
  for(const body of malformed){reply=()=>Response.json(body);await expect(provider.embed('synthetic')).rejects.toThrow('embedding_unavailable');}
  for(const response of [()=>new Response('fixture-secret-sentinel private body',{status:401}),()=>new Response('{"fixture-secret-sentinel":',{headers:{'content-type':'application/json'}}),()=>new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}),()=>new Response(null,{status:302,headers:{location:new URL('/must-not-follow',server.url).href}})]){reply=response;const before=calls;const error=await provider.embed('synthetic').then(()=>null,e=>e);expect(error?.message).toBe('embedding_unavailable');expect(String(error)).not.toContain('fixture-secret-sentinel');expect(error?.cause).toBeUndefined();expect(calls).toBe(before+1);}
  for(const text of ['', ' ', 'x'.repeat(48001)]){const before=calls;await expect(provider.embed(text)).rejects.toThrow('invalid_text');expect(calls).toBe(before);}
 }finally{await server.stop(true);}
});
test('OpenAI cancels actual stalled HTTP bodies and its own deadline with sanitized failures',async()=>{
 let calls=0,cancelled=0;
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){calls++;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}});}});
 try{
  const provider=await embeddings.createEmbedder(selected,{ALLURA_OPENAI_API_KEY:'fixture-secret-sentinel'},loopbackTransport(new URL('/',server.url)));
  const pre=new AbortController();pre.abort(new Error('fixture-secret-sentinel'));await expect(provider.embed('synthetic',pre.signal)).rejects.toThrow('embedding_unavailable');expect(calls).toBe(0);
  const active=new AbortController();const work=provider.embed('synthetic',active.signal);await Bun.sleep(30);active.abort(new Error('fixture-secret-sentinel'));await expect(work).rejects.toThrow('embedding_unavailable');
  const start=performance.now();await expect(provider.embed('synthetic')).rejects.toThrow('embedding_unavailable');expect(performance.now()-start).toBeLessThan(2300);await Bun.sleep(30);expect(calls).toBe(2);expect(cancelled).toBe(2);
 }finally{await server.stop(true);}
});
test('OpenAI has no credential or network fallback and the default factory keeps exact local MiniLM',async()=>{
 let calls=0;const fail=Object.assign(async()=>{calls++;throw new Error('fixture-secret-sentinel');},{preconnect:fetch.preconnect});
 await expect(embeddings.createEmbedder(selected,{OPENAI_API_KEY:'fixture-secret-sentinel'},fail)).rejects.toThrow('embedding_configuration_invalid');expect(calls).toBe(0);
 const provider=await embeddings.createEmbedder(selected,{ALLURA_OPENAI_API_KEY:'fixture-secret-sentinel'},fail);const error=await provider.embed('synthetic').catch(e=>e);expect(error.message).toBe('embedding_unavailable');expect(error.cause).toBeUndefined();expect(calls).toBe(1);
 const local=await embeddings.createEmbedder(undefined,{ALLURA_OPENAI_API_KEY:'fixture-secret-sentinel'},fail);expect(local.identity).toEqual(embeddings.EMBEDDING);embeddings.validateVector(await local.embed('synthetic local model fixture'));expect(calls).toBe(1);
});

test('OpenAI uses the native pinned request and validates the response on real loopback HTTP',async()=>{
 const seen:{url:string;body:unknown;authorization:string|null}[]=[];
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){seen.push({url:request.url,body:await request.json(),authorization:request.headers.get('authorization')});return Response.json({object:'list',model:'text-embedding-3-small',data:[{object:'embedding',index:0,embedding:fixtureVector()}]});}});
 const requests:string[]=[];
 const transport:typeof fetch=Object.assign(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{requests.push(String(input));expect(init?.redirect).toBe('error');expect((init as BunFetchRequestInit)?.tls).toEqual({rejectUnauthorized:true});return fetch(new URL('/',server.url),init);},{preconnect:fetch.preconnect});
 try{const provider=await embeddings.createEmbedder({provider:'openai',model:'text-embedding-3-small',dimensions:384},{ALLURA_OPENAI_API_KEY:'fixture-only-key'},transport);expect(provider.identity).toEqual(embeddings.OPENAI_EMBEDDING);expect(await provider.embed('synthetic fixture only')).toEqual(fixtureVector());expect(requests).toEqual(['https://api.openai.com/v1/embeddings']);expect(seen[0]?.body).toEqual({input:'synthetic fixture only',model:'text-embedding-3-small',dimensions:384,encoding_format:'float'});expect(seen[0]?.authorization).toBe('Bearer fixture-only-key');}finally{await server.stop(true);}
});
const base={mode:'machine-only',origin:'http://127.0.0.1:6488',port:6488};
const env={ALLURA_DATABASE_URL:'postgres://allura_app:fixture@127.0.0.1:15432/allura_test',ALLURA_CURSOR_KEY:randomBytes(32).toString('base64url')};
const selected={provider:'openai',model:'text-embedding-3-small',dimensions:384} as const;
test('OpenAI configuration is explicit strict and requires only the Allura key',()=>{
 expect(parseCoreConfig(base,env).embedding).toBeUndefined();
 expect(parseCoreConfig({...base,embedding:selected},{...env,ALLURA_OPENAI_API_KEY:'fixture-not-a-real-key'}).embedding).toEqual(selected);
 for(const embedding of [null,{}, {...selected,url:'http://evil.invalid'},{...selected,dimensions:1536},{...selected,model:'other'},{...selected,apiKey:'fixture'}]){expect(()=>parseCoreConfig({...base,embedding},{...env,ALLURA_OPENAI_API_KEY:'fixture'})).toThrow('core_configuration_invalid');}
 for(const keys of [{},{OPENAI_API_KEY:'fixture'},{ALLURA_OPENAI_API_KEY:''},{ALLURA_OPENAI_API_KEY:'bad\nkey'}]){expect(()=>parseCoreConfig({...base,embedding:selected},{...env,...keys})).toThrow('core_configuration_invalid');}
});
