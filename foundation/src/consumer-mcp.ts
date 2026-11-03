#!/usr/bin/env node
import {Transform} from 'node:stream';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {AlluraClient,ConsumerError,DISCLOSURE,CONSUMER_VERSION} from './consumer-client.js';
import {MEMORY_TOOLS,type MemoryTool} from './consumer-contract.js';
import {consumerEnvironment} from './consumer-runtime.js';
async function main(){
 if(process.argv.length!==2){throw new ConsumerError('invalid');}
 const client=new AlluraClient(consumerEnvironment());process.stderr.write(DISCLOSURE+'\n');await client.connect();
 const server=new Server({name:'allura-stdio-bridge',version:CONSUMER_VERSION},{capabilities:{tools:{}},instructions:DISCLOSURE});let active=0,bytes=0;
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:MEMORY_TOOLS}));
 server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
  if(active>=16){return {isError:true,content:[{type:'text',text:'{"outcome":"unavailable"}'}]};}active++;
  try{return await client.invoke(request.params.name as MemoryTool,request.params.arguments??{},extra.signal);}
  catch(error){return {isError:true,content:[{type:'text',text:JSON.stringify({outcome:error instanceof ConsumerError?error.outcome:'unknown'})}]};}finally{active--;}
 });
 const input=new Transform({transform(chunk:Buffer,_encoding,done){for(const byte of chunk){bytes=byte===10?0:bytes+1;if(bytes>65536){done(new ConsumerError('invalid'));return;}}done(null,chunk);}});
 const stop=async()=>{process.stdin.destroy();await client.close();await server.close();};
 input.on('error',()=>{process.stderr.write('{"outcome":"invalid"}\n');process.exitCode=1;void stop();});
 process.stdin.on('end',()=>{void stop();});process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});
 server.onerror=()=>{process.stderr.write('{"outcome":"unknown"}\n');};
 await server.connect(new StdioServerTransport(process.stdin.pipe(input),process.stdout));
}
main().catch(error=>{process.stderr.write(JSON.stringify({outcome:error instanceof ConsumerError?error.outcome:'unknown'})+'\n');process.exitCode=1;});
