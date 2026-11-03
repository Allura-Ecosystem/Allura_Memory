import {expect,test} from 'bun:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {type CallToolResult,type TextContent} from '@modelcontextprotocol/sdk/types.js';
import {fixture} from './lifecycle-fixture.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {loadLocalEmbedder} from '../src/embedding.ts';
import {deviceChallenge} from '../src/device-contract.ts';
test('real device HTTP enrollment enforces human CSRF scope proof and current MCP revocation',async()=>{
 const f=await fixture(`allura-device-http-${randomUUID()}`),provider=await loadLocalEmbedder(),origin='https://devices.invalid',key=randomBytes(32);
 let server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createCoreGateway(f.app,f.humanConfig,origin,key,provider)}),client:Client|undefined;
 const headers=(who:keyof typeof f.identities='curator')=>({'content-type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin','Cf-Access-Jwt-Assertion':f.jwt(who)});
 const url=()=>`http://127.0.0.1:${server.port}/api/devices/command?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`;
 const post=(body:unknown,who:keyof typeof f.identities='curator')=>fetch(url(),{method:'POST',headers:headers(who),body:JSON.stringify(body)});
 try{
  expect((await fetch(url(),{method:'POST',headers:{'content-type':'application/json'},body:'not json'})).status).toBe(401);
  expect((await fetch(url(),{method:'POST',headers:{...headers(),Origin:'https://evil.invalid'},body:'{}'})).status).toBe(403);
  expect((await fetch(url().replace(f.scope.workspaceId,f.foreignWorkspace),{method:'POST',headers:headers(),body:'{}'})).status).toBe(403);
  const verifier=randomBytes(32).toString('base64url'),token=randomBytes(32).toString('base64url'),begin={kind:'begin',label:'HTTP fixture',challenge:deviceChallenge(verifier),actions:['memory:read','memory:capture'],operationKey:randomUUID()};
  expect((await post({...begin,ownerId:f.ids.author})).status).toBe(400);
  const response=await post(begin);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');const pending=await response.json() as Record<string,unknown>;
  const approve={kind:'approve',enrollmentId:pending.enrollmentId,expectedRevision:1,actions:['memory:read','memory:capture']};expect((await post(approve)).status).toBe(403);expect((await post(approve,'author')).status).toBe(200);
  const complete={kind:'complete',enrollmentId:pending.enrollmentId,verifier,token};const finished=await post(complete);expect(finished.status).toBe(200);const receipt=await finished.json() as Record<string,unknown>;expect(await (await post(complete)).json()).toEqual(receipt);
  const malformed=await post({...complete,verifier:'bad'});expect(malformed.status).toBe(400);expect(await malformed.text()).toBe('{"outcome":"invalid"}');
  expect((await post({kind:'status',enrollmentId:randomUUID()})).status).toBe(404);expect((await post({kind:'status',enrollmentId:pending.enrollmentId},'viewer')).status).toBe(404);
  await server.stop(true);server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:createCoreGateway(f.app,f.humanConfig,origin,key,provider)});
  client=new Client({name:'enrolled-device-fixture',version:'0.1.0'});await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}/mcp?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`),{requestInit:{headers:{Authorization:`Bearer ${token}`}},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:1,initialReconnectionDelay:1,reconnectionDelayGrowFactor:1}}));
  expect((await client.listTools()).tools).toHaveLength(5);const captured=await client.callTool({name:'memory_add',arguments:{content:'Enrolled device evidence only',idempotency_key:randomUUID()}}) as CallToolResult;
  expect(JSON.parse((captured.content[0] as TextContent).text).promotion).toBe('not_requested');
  expect((await fetch(url(),{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(approve)})).status).toBe(401);
  expect((await post({kind:'list'})).status).toBe(200);
  const replacement=randomBytes(32).toString('base64url'),rotation={kind:'rotate',deviceId:receipt.deviceId,expectedGeneration:1,token:replacement,operationKey:randomUUID()};
  const rotating=await post(rotation);expect(rotating.status).toBe(200);const rotated=await rotating.json();expect(await (await post(rotation)).json()).toEqual(rotated);
  await expect(client.listTools()).rejects.toMatchObject({code:401});await client.close();
  client=new Client({name:'rotated-device-fixture',version:'0.1.0'});await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}/mcp?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`),{requestInit:{headers:{Authorization:`Bearer ${replacement}`}},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:1,initialReconnectionDelay:1,reconnectionDelayGrowFactor:1}}));expect((await client.listTools()).tools).toHaveLength(5);
  expect((await post({kind:'revoke',deviceId:receipt.deviceId,operationKey:randomUUID()},'author')).status).toBe(200);
  await expect(client.listTools()).rejects.toMatchObject({code:401});
  const [audit]=await f.owner`SELECT jsonb_agg(to_jsonb(a)) AS data FROM allura.device_audit a WHERE group_id=${f.scope.groupId}`;for(const value of [token,verifier]){expect(JSON.stringify(audit.data)).not.toContain(value);expect(JSON.stringify(receipt)).not.toContain(value);}
 }finally{await client?.close();await server.stop(true);await f.close();}
},30000);
