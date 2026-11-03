import {type SQL} from 'bun';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {CallToolRequestSchema,ListToolsRequestSchema,type CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {capture,readCaptureReceipt,CaptureError} from './capture.ts';
import {deleteMemory} from './lifecycle.ts';
import {DecisionError} from './decisions.ts';
import {AuthorityError,resolveAuthority,type Action} from './authority.ts';
import {DatabaseStore} from './persistence.ts';
import {createRetrievalService} from './retrieval.ts';
import {searchFederated,type FederatedQuery} from './retrieval-federation.ts';
import {type Embedder} from './embedding.ts';
import {GatewayReply,type Route} from './gateway.ts';
import {MEMORY_TOOLS,CONSUMER_VERSION,CONSUMER_CONTRACT,DISCLOSURE} from './consumer-contract.ts';
export function createMcpRoutes(sql:SQL,cursorKey:Uint8Array,provider:Embedder):Route[]{
 const service=createRetrievalService(sql,cursorKey),store=new DatabaseStore(sql);
 const routes:Route[]=[{path:'/mcp',method:'GET',identity:'machine',action:'memory:read',handle:async()=>new GatewayReply(405,{jsonrpc:'2.0',id:null,error:{code:-32000,message:'Stateless POST only'}})},
 {path:'/mcp',method:'POST',identity:'machine',action:'memory:read',additionalActions:async(body,c)=>{
  const actions:Action[]=[];if(body?.method==='tools/call'){
   const params=body.params as {name?:unknown;arguments?:{status?:unknown}}|undefined;
   if(params?.name==='memory_add'){actions.push('memory:capture');}if(params?.name==='memory_delete'){actions.push('memory:delete');}
   if(params?.name==='memory_search'&&params.arguments?.status==='all'){try{await resolveAuthority(c.identity,c.scope,'evidence:read',store);actions.push('evidence:read');}catch(error){if(!(error instanceof AuthorityError&&error.code==='forbidden')){throw error;}}}
  }return actions;
 },handle:async context=>{
  const server=new Server({name:'allura-memory',version:CONSUMER_VERSION},{capabilities:{tools:{}},instructions:DISCLOSURE});
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:MEMORY_TOOLS}));
  server.setRequestHandler(CallToolRequestSchema,async(request):Promise<CallToolResult>=>{
   try{
    context.signal.throwIfAborted();const args=request.params.arguments??{};let value:unknown,raw:string|undefined;
    switch(request.params.name){
     case 'memory_add':raw=await capture(sql,context.identity,context.scope,args);value=JSON.parse(raw);break;
     case 'memory_search':value=await searchFederated(sql,context.identity,context.scope,{...args,status:args.status===undefined?'approved':args.status} as FederatedQuery,provider,context.signal);break;
     case 'memory_get':
      if(Object.keys(args).some(k=>!['id','kind','history'].includes(k))||typeof args.id!=='string'||(args.kind!==undefined&&(typeof args.kind!=='string'||!['semantic','receipt'].includes(args.kind)))||(args.history!==undefined&&typeof args.history!=='boolean')){throw new DecisionError('invalid');}
      if(args.kind==='receipt'){if(args.history!==undefined){throw new DecisionError('invalid');}raw=await readCaptureReceipt(sql,context.identity,context.scope,args.id);value=JSON.parse(raw);}else{value=await service.get(context.identity,context.scope,args.id,args.history as boolean|undefined);}break;
     case 'memory_list':value=await service.list(context.identity,context.scope,args);break;
     case 'memory_delete':raw=await deleteMemory(sql,context.identity,context.scope,args);value=JSON.parse(raw);break;
     default:throw new DecisionError('invalid');
    }
    return {content:[{type:'text',text:raw??JSON.stringify(value)}],structuredContent:{contract:CONSUMER_CONTRACT,data:value}};
   }catch(error){const outcome=error instanceof AuthorityError||error instanceof CaptureError||error instanceof DecisionError?error.code:'unknown';return {isError:true,content:[{type:'text',text:JSON.stringify({outcome})}]};}
  });
  const transport=new WebStandardStreamableHTTPServerTransport({enableJsonResponse:true,maxRequestBodySize:65536});
  try{await server.connect(transport);const response=await transport.handleRequest(context.request,{parsedBody:context.body});return new GatewayReply(response.status,response.status===202?null:await response.json());}
  finally{await server.close();}
 }}];
 return [...routes,...routes.map(route=>({...route,path:'/mcp/human',identity:'human' as const}))];
}
