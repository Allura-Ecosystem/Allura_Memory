#!/usr/bin/env node
import {AlluraClient,ConsumerError,DISCLOSURE} from './consumer-client.js';
import {type MemoryTool} from './consumer-contract.js';
import {consumerEnvironment,readConsumerInput} from './consumer-runtime.js';
async function main(){
 const args=process.argv.slice(2);if(args.length===1&&args[0]==='--help'){process.stdout.write('allura-memory memory_add|memory_search|memory_get|memory_list|memory_delete < request.json\nConfiguration: ALLURA_ENDPOINT (HTTPS /mcp), ALLURA_GROUP_ID, ALLURA_WORKSPACE_ID, ALLURA_TOKEN (injected environment, never argv). ALLURA_ALLOW_LOOPBACK=1 is only for an owned local fixture.\n'+DISCLOSURE+'\n');return;}
 if(args.length!==1||!['memory_add','memory_search','memory_get','memory_list','memory_delete'].includes(args[0]!)){throw new ConsumerError('invalid');}
 const client=new AlluraClient(consumerEnvironment());process.stderr.write(DISCLOSURE+'\n');
 try{const body=await readConsumerInput();await client.connect();const result=await client.invoke(args[0] as MemoryTool,body);process.stdout.write(JSON.stringify(result.structuredContent?.data)+'\n');}finally{await client.close();}
}
main().catch(error=>{process.stderr.write(JSON.stringify({outcome:error instanceof ConsumerError?error.outcome:'unknown'})+'\n');process.exitCode=1;});
